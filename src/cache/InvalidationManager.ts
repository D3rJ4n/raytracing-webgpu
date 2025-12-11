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
    }

    public async invalidateForFrame(spheresData: Float32Array, cameraData: Float32Array): Promise<InvalidationResult> {
        const startTime = performance.now();
        const oldPositions = this.movementTracker.getOldPositions();
        const cameraChanged = this.movementTracker.updateCameraData(cameraData);
        const movedSpheres = this.movementTracker.updateSpheresData(spheresData);

        this.updateCameraProjection(cameraData);

        let result: InvalidationResult;

        if (cameraChanged) {
            result = await this.invalidateCompleteCache();
            result.cameraInvalidation = true;
        } else if (movedSpheres.length > 0) {
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

        return result;
    }

    private updateCameraProjection(cameraData: Float32Array): void {
        const cameraParams = {
            position: { x: cameraData[0], y: cameraData[1], z: cameraData[2] },
            lookAt: { x: cameraData[4], y: cameraData[5], z: cameraData[6] },
            fov: 1.0472,
            aspect: this.canvasWidth / this.canvasHeight
        };
        this.screenProjection.updateCamera(cameraParams);
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

            if (oldPosition && sphereData) {
                // Berechne Padding basierend auf Radius (größere Kugeln brauchen mehr Padding)
                const basePadding = 200;
                const radiusBonus = Math.min(sphereData.radius * 100, 300); // Max +300px für große Radien
                const padding = basePadding + radiusBonus;

                // Verwende neue Methode die Padding VOR dem Clipping hinzufügt
                const oldSphereBounds = this.screenProjection.sphereToScreenBoundsWithPadding(oldPosition, sphereData.radius, padding);
                const newSphereBounds = this.screenProjection.sphereToScreenBoundsWithPadding(sphereData.position, sphereData.radius, padding);

                const oldValid = this.screenProjection.isValidBounds(oldSphereBounds);
                const newValid = this.screenProjection.isValidBounds(newSphereBounds);

                // Fall 1: Beide Bounds ungültig (Kugel komplett außerhalb) - nichts tun
                if (!oldValid && !newValid) {
                    continue;
                }

                // Fall 2: Nur eine Position ist sichtbar (Kugel verlässt/betritt Bildschirm)
                if (!oldValid && newValid) {
                    this.logger.debug(`Sphere ${sphereIndex}: Betritt Bildschirm (Padding: ${padding.toFixed(0)}px)`);
                    const pixelsInRegion = await this.invalidateRegion(newSphereBounds);
                    totalPixelsInvalidated += pixelsInRegion;
                    regionsCount++;
                } else if (oldValid && !newValid) {
                    // Kugel verlässt Bildschirm - verwende erweiterte Bounds für alte Position
                    // um sicherzustellen, dass alle Ghost-Pixel entfernt werden
                    this.logger.debug(`Sphere ${sphereIndex}: Verlässt Bildschirm (Padding: ${(padding * 1.5).toFixed(0)}px)`);
                    const expandedOldBounds = this.screenProjection.expandBounds(oldSphereBounds, padding * 0.5);
                    const pixelsInRegion = await this.invalidateRegion(expandedOldBounds);
                    totalPixelsInvalidated += pixelsInRegion;
                    regionsCount++;
                } else {
                    // Fall 3: Beide Positionen sichtbar - kombiniere Bounds
                    const combinedBounds = this.screenProjection.unionBounds(oldSphereBounds, newSphereBounds);
                    const pixelsInRegion = await this.invalidateRegion(combinedBounds);
                    totalPixelsInvalidated += pixelsInRegion;
                    regionsCount++;
                }
            }
        }

        return {
            pixelsInvalidated: totalPixelsInvalidated,
            regionsInvalidated: regionsCount,
            invalidationTime: performance.now() - startTime,
            cameraInvalidation: false
        };
    }

    private async invalidateRegion(bounds: { minX: number; minY: number; maxX: number; maxY: number }): Promise<number> {
        const safeBounds = {
            minX: Math.max(0, Math.min(this.canvasWidth - 1, Math.floor(bounds.minX))),
            minY: Math.max(0, Math.min(this.canvasHeight - 1, Math.floor(bounds.minY))),
            maxX: Math.max(0, Math.min(this.canvasWidth - 1, Math.ceil(bounds.maxX))),
            maxY: Math.max(0, Math.min(this.canvasHeight - 1, Math.ceil(bounds.maxY)))
        };

        if (safeBounds.minX > safeBounds.maxX || safeBounds.minY > safeBounds.maxY) {
            return 0;
        }

        let pixelsInvalidated = 0;
        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL;
        const bytesPerComponent = BUFFER_CONFIG.CACHE.BYTES_PER_COMPONENT;

        for (let y = safeBounds.minY; y <= safeBounds.maxY; y++) {
            const rowWidth = safeBounds.maxX - safeBounds.minX + 1;
            if (rowWidth <= 0) continue;

            const rowData = new Float32Array(rowWidth * componentsPerPixel).fill(0.0);
            const firstPixelIndex = y * this.canvasWidth + safeBounds.minX;
            const byteOffset = firstPixelIndex * componentsPerPixel * bytesPerComponent;

            this.device.queue.writeBuffer(this.cacheBuffer, byteOffset, rowData);
            this.writeBufferCallCount++;
            pixelsInvalidated += rowWidth;
        }

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

    public resetWriteBufferCallCount(): void {
        this.writeBufferCallCount = 0;
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
    }
}
