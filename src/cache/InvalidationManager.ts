import { Logger } from '../utils/Logger';
import { MovementTracker } from './MovementTracker';
import { ScreenProjection } from './ScreenProjection';
import { InvalidationStats } from './InvalidationStats';
import { BUFFER_CONFIG } from '../utils/Constants';

export interface InvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    cameraInvalidation: boolean;
}

export class InvalidationManager {
    private device: GPUDevice;
    private cacheBuffer: GPUBuffer;
    private canvasWidth: number;
    private canvasHeight: number;
    private logger: Logger;
    private movementTracker: MovementTracker;
    private screenProjection: ScreenProjection;
    private stats: InvalidationStats;
    private writeBufferCallCount: number = 0;
    private debugMode: boolean = false;

    constructor(
        device: GPUDevice,
        cacheBuffer: GPUBuffer,
        canvasWidth: number,
        canvasHeight: number
    ) {
        this.device = device;
        this.cacheBuffer = cacheBuffer;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.logger = Logger.getInstance();
        this.movementTracker = new MovementTracker();
        this.screenProjection = new ScreenProjection(canvasWidth, canvasHeight);
        this.stats = new InvalidationStats();
        if (this.debugMode) {
            this.logger.cache('InvalidationManager mit selektiver Invalidierung initialisiert');
        }
    }

    public resetWriteBufferCount(): void {
        this.writeBufferCallCount = 0;
    }

    public async invalidateForFrame(spheresData: Float32Array, cameraData: Float32Array): Promise<InvalidationResult> {
        const startTime = performance.now();
        if (this.debugMode) {
            this.logger.cache("---Invalidation Check Start---");
        }

        // ⚡ KRITISCH: Wenn MovementTracker zurückgesetzt wurde (erste Frame nach Reset),
        // dann KOMPLETTE Invalidierung erzwingen!
        const isFirstFrame = this.movementTracker.isFirstFrame();
        if (isFirstFrame) {
            // console.log(`🔥 ERSTE FRAME nach Reset erkannt - KOMPLETTE Cache-Invalidierung!`);
            this.movementTracker.updateCameraData(cameraData);
            this.movementTracker.updateSpheresData(spheresData);
            this.updateCameraProjection(cameraData);
            const result = await this.invalidateCompleteCache();
            result.cameraInvalidation = true;
            this.stats.recordInvalidation(result);
            result.invalidationTime = performance.now() - startTime;
            return result;
        }

        // ⚡ FIX: Speichere alte Positionen BEVOR sie überschrieben werden!
        const oldPositions = this.movementTracker.getOldPositions();

        const cameraChanged = this.movementTracker.updateCameraData(cameraData);
        const movedSpheres = this.movementTracker.updateSpheresData(spheresData);

        this.updateCameraProjection(cameraData);

        let result: InvalidationResult;

        if (cameraChanged) {
            result = await this.invalidateCompleteCache();
            result.cameraInvalidation = true;
        } else if (movedSpheres.length > 0) {
            // ✅ Selektive Invalidierung für bewegte Spheres!
            // this.logger.cache(`🔄 ${movedSpheres.length} Sphere(s) bewegt - SELEKTIVE Invalidierung`);
            result = await this.handleObjectMovements(movedSpheres, spheresData, oldPositions);
            result.cameraInvalidation = false;
        } else {
            result = {
                pixelsInvalidated: 0,
                regionsInvalidated: 0,
                invalidationTime: performance.now() - startTime,
                cameraInvalidation: false
            };
        }

        this.stats.recordInvalidation(result);
        result.invalidationTime = performance.now() - startTime;

        if (this.debugMode) {
            this.logger.cache(`--- INVALIDATION RESULT: ${result.pixelsInvalidated} pixels, ${result.invalidationTime.toFixed(2)}ms ---`);
        }

        return result;
    }

    /**
     * Kamera-Parameter für Screen Projection setzen
     */

    private updateCameraProjection(cameraData: Float32Array): void {
        const cameraParams = {
            position: {
                x: cameraData[0],
                y: cameraData[1],
                z: cameraData[2]
            },
            lookAt: {
                x: cameraData[4],
                y: cameraData[5],
                z: cameraData[6]
            },
            fov: 1.0472, // 60 Grad in Radiant
            aspect: this.canvasWidth / this.canvasHeight
        };
        this.screenProjection.updateCamera(cameraParams);
        if (this.debugMode) {
            this.logger.cache(`Camera updated: pos(${cameraParams.position.x.toFixed(1)}, ${cameraParams.position.y.toFixed(1)}, ${cameraParams.position.z.toFixed(1)})`);
        }
    }


    private async handleObjectMovements(
        movedSpheres: number[],
        spheresData: Float32Array,
        oldPositions: Map<number, { x: number; y: number; z: number }>
    ): Promise<InvalidationResult> {
        const startTime = performance.now();
        let totalPixelsInvalidated = 0;
        let regionsCount = 0;

        for (const sphereIndex of movedSpheres) {
            const sphereData = this.extractSphereData(spheresData, sphereIndex);
            const oldPosition = oldPositions.get(sphereIndex);

            if (!oldPosition || !sphereData) {
                continue;
            }

            const oldSphereBounds = this.screenProjection.sphereToScreenBounds(oldPosition, sphereData.radius);
            const newSphereBounds = this.screenProjection.sphereToScreenBounds(sphereData.position, sphereData.radius);

            const sphereScreenRadius = this.estimateSphereScreenRadius(newSphereBounds);
            // Smaller, more reasonable padding: ~1x radius, clamped to [6, 32]
            const baseMargin = Math.min(Math.max(sphereScreenRadius * 1.0, 6), 32);

            // Union first, then apply a single padding
            const unionBounds = this.screenProjection.unionMultipleBounds([
                oldSphereBounds,
                newSphereBounds
            ]);
            const expandedBounds = this.addMarginToBounds(unionBounds, baseMargin);

            const pixels = await this.invalidateRegion(expandedBounds);
            if (pixels > 0) {
                totalPixelsInvalidated += pixels;
                regionsCount++;
            }
        }

        return {
            pixelsInvalidated: totalPixelsInvalidated,
            regionsInvalidated: regionsCount,
            invalidationTime: performance.now() - startTime,
            cameraInvalidation: false
        };
    }

    private async invalidateRegion(bounds: {
        minX: number; minY: number; maxX: number; maxY: number;
    }): Promise<number> {
        // ⚠️ Die Bounds sollten BEREITS gekürzt sein, aber wir sichern nochmal ab
        const safeBounds = {
            minX: Math.max(0, Math.floor(bounds.minX)),
            minY: Math.max(0, Math.floor(bounds.minY)),
            maxX: Math.min(this.canvasWidth - 1, Math.ceil(bounds.maxX)),
            maxY: Math.min(this.canvasHeight - 1, Math.ceil(bounds.maxY))
        };

        if (safeBounds.minX > safeBounds.maxX || safeBounds.minY > safeBounds.maxY) {
            return 0;
        }

        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL;
        const bytesPerComponent = BUFFER_CONFIG.CACHE.BYTES_PER_COMPONENT;

        // Schreibe Zeile für Zeile (row-by-row)
        // Das ist notwendig weil der Cache-Buffer im Zeilenformat organisiert ist
        for (let y = safeBounds.minY; y <= safeBounds.maxY; y++) {
            const rowWidth = safeBounds.maxX - safeBounds.minX + 1;
            if (rowWidth <= 0) continue;

            const rowData = new Float32Array(rowWidth * componentsPerPixel).fill(0.0);
            const firstPixelIndex = y * this.canvasWidth + safeBounds.minX;
            const byteOffset = firstPixelIndex * componentsPerPixel * bytesPerComponent;

            this.device.queue.writeBuffer(this.cacheBuffer, byteOffset, rowData);
            this.writeBufferCallCount++;
        }

        // Berechne invalidierte Pixel
        const pixelsInvalidated = (safeBounds.maxX - safeBounds.minX + 1) *
            (safeBounds.maxY - safeBounds.minY + 1);

        return pixelsInvalidated;
    }

    private async invalidateCompleteCache(): Promise<InvalidationResult> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL;
        const cacheData = new Float32Array(totalPixels * componentsPerPixel).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
        this.writeBufferCallCount++;

        return {
            pixelsInvalidated: totalPixels,
            regionsInvalidated: 1,
            invalidationTime: 0,
            cameraInvalidation: false
        };
    }

    private addMarginToBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }, margin: number) {
        return this.screenProjection.expandBounds(bounds, margin);
    }

    private estimateSphereScreenRadius(bounds: { minX: number; minY: number; maxX: number; maxY: number }): number {
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        return Math.max(width, height) * 0.5;
    }

    private extractSphereData(spheresData: Float32Array, sphereIndex: number): {
        position: { x: number; y: number; z: number };
        radius: number;
    } | null {
        const offset = sphereIndex * 8;
        if (offset + 3 >= spheresData.length) return null;

        return {
            position: {
                x: spheresData[offset + 0],
                y: spheresData[offset + 1],
                z: spheresData[offset + 2]
            },
            radius: spheresData[offset + 3]
        };
    }

    public getWriteBufferCallCount(): number {
        return this.writeBufferCallCount;
    }
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.logger.cache(`InvalidationManager Debug: ${enabled ? 'ON' : 'OFF'}`);
    }

    public getStats() {
        return this.stats.getStats();
    }

    public resetStats(): void {
        this.stats.reset();
        this.movementTracker.reset();
    }

    public cleanup(): void {
        this.movementTracker.cleanup();
        this.screenProjection.cleanup();
        this.stats.cleanup();
        this.logger.cache('InvalidationManager aufgeräumt');
    }
}
