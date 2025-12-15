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
    private debugMode: boolean = true;

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
        this.logger.cache('InvalidationManager mit selektiver Invalidierung initialisiert');
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
            result = await this.handleObjectMovements(movedSpheres, spheresData, oldPositions, cameraData);
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
        oldPositions: Map<number, { x: number; y: number; z: number }>,
        cameraData: Float32Array
    ): Promise<InvalidationResult> {
        const startTime = performance.now();
        let totalPixelsInvalidated = 0;
        let regionsCount = 0;

        for (const sphereIndex of movedSpheres) {
            const sphereData = this.extractSphereData(spheresData, sphereIndex);
            const oldPosition = oldPositions.get(sphereIndex); // ⚡ FIX: Benutze gespeicherte alte Position!

            if (oldPosition && sphereData) {
                // ⚡ DEBUG: Aktiviert für Debugging
                //console.log(`🎯 Invalidation Sphere ${sphereIndex}:`);
                //console.log(`   Old Pos: (${oldPosition.x.toFixed(2)}, ${oldPosition.y.toFixed(2)}, ${oldPosition.z.toFixed(2)})`);
                //console.log(`   New Pos: (${sphereData.position.x.toFixed(2)}, ${sphereData.position.y.toFixed(2)}, ${sphereData.position.z.toFixed(2)})`);
                //console.log(`   Radius: ${sphereData.radius.toFixed(2)}`);

                // KUGEL-BOUNDS (alte + neue Position)
                const oldSphereBounds = this.screenProjection.sphereToScreenBounds(
                    oldPosition,
                    sphereData.radius
                );

                const newSphereBounds = this.screenProjection.sphereToScreenBounds(
                    sphereData.position,
                    sphereData.radius
                );

                // console.log(`   Old Bounds: [${oldSphereBounds.minX}, ${oldSphereBounds.minY}] to [${oldSphereBounds.maxX}, ${oldSphereBounds.maxY}]`);
                // console.log(`   New Bounds: [${newSphereBounds.minX}, ${newSphereBounds.minY}] to [${newSphereBounds.maxX}, ${newSphereBounds.maxY}]`);

                //console.log(`   Old Bounds: [${oldSphereBounds.minX}, ${oldSphereBounds.minY}] to [${oldSphereBounds.maxX}, ${oldSphereBounds.maxY}]`);
                //console.log(`   New Bounds: [${newSphereBounds.minX}, ${newSphereBounds.minY}] to [${newSphereBounds.maxX}, ${newSphereBounds.maxY}]`);

                const combinedBounds = this.screenProjection.unionMultipleBounds([
                    oldSphereBounds,
                    newSphereBounds
                ]);


                // → Wir müssen NUR Pixel invalidieren die die Sphere DIREKT sehen!
                const sphereScreenRadius = Math.max(
                    newSphereBounds.maxX - newSphereBounds.minX,
                    newSphereBounds.maxY - newSphereBounds.minY
                );

                // Margin-Strategie: Nur für DIREKTE Sichtbarkeit + Safety-Margin
                //
                // Da Schatten nicht gecacht werden, brauchen wir nur:
                //   1. Die Sphere-Bounds selbst
                //   2. Kleiner Safety-Margin für Ungenauigkeiten (Anti-Aliasing, Subpixel-Position)
                //
                // Safety-Margin: 2-3x der Screen-Radius ist genug!
                const baseMargin = sphereScreenRadius * 3; // Nur 3x statt 15-30x!
                const minMargin = 10; // Minimum 10 Pixel für sehr kleine Spheres
                const maxMargin = 100; // Maximum 100 Pixel (verhindere zu große Bereiche)
                const margin = Math.max(minMargin, Math.min(baseMargin, maxMargin));

                //console.log(`   📏 Screen-Radius: ${sphereScreenRadius.toFixed(1)}px`);

                const expandedBounds = this.screenProjection.expandBounds(combinedBounds, margin);
                // console.log(`   📏 Margin: ${margin.toFixed(1)}, Expanded: [${expandedBounds.minX}, ${expandedBounds.minY}] to [${expandedBounds.maxX}, ${expandedBounds.maxY}]`);
                // console.log(`   📏 Sphere Screen Radius: ${sphereScreenRadius.toFixed(1)}, Margin: ${margin.toFixed(1)}`);
                // console.log(`   Combined Bounds: [${expandedBounds.minX}, ${expandedBounds.minY}] to [${expandedBounds.maxX}, ${expandedBounds.maxY}]`);

                // ⚡ DEBUG: Prüfe ob Sphere-Position in den Bounds liegt
                // const sphereCenterScreenX = (newSphereBounds.minX + newSphereBounds.maxX) / 2;
                // const sphereCenterScreenY = (newSphereBounds.minY + newSphereBounds.maxY) / 2;
                // const isInBounds = sphereCenterScreenX >= expandedBounds.minX &&
                //                    sphereCenterScreenX <= expandedBounds.maxX &&
                //                    sphereCenterScreenY >= expandedBounds.minY &&
                //                    sphereCenterScreenY <= expandedBounds.maxY;
                // console.log(`   🎯 Sphere center screen: (${sphereCenterScreenX.toFixed(1)}, ${sphereCenterScreenY.toFixed(1)}), in bounds: ${isInBounds}`);

                // Prüfe ob Bounds gültig sind
                const isValid = this.screenProjection.isValidBounds(expandedBounds);
                //console.log(`   ✅ Bounds valid: ${isValid}`);

                if (isValid) {
                    const pixelsInRegion = await this.invalidateRegion(expandedBounds);
                    totalPixelsInvalidated += pixelsInRegion;
                    regionsCount++;
                    // console.log(`   📝 Invalidated ${pixelsInRegion} pixels in region`);

                    if (this.debugMode) {
                        const area = this.screenProjection.calculateBoundsArea(expandedBounds);
                        const percentage = (area / (this.canvasWidth * this.canvasHeight)) * 100;
                        //   this.logger.cache(`  Sphere ${sphereIndex}: ${pixelsInRegion} pixels (${percentage.toFixed(2)}%)`);
                    }
                }
            }
        }
        //console.log(`\n🔄 Total: ${movedSpheres.length} Spheres moved, ${totalPixelsInvalidated} pixels invalidated`);

        // ⚡ KRITISCH: GPU Queue Force-Flush!
        // writeBuffer ist lazy - wir müssen die Queue mit einem leeren Command Buffer flushen
        //console.log(`⏳ Force GPU queue flush with empty command...`);
        const flushStart = performance.now();
        const commandEncoder = this.device.createCommandEncoder();
        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        const flushTime = performance.now() - flushStart;
        //console.log(`✅ GPU queue flushed (took ${flushTime.toFixed(2)}ms)\n`);

        const invalidationPercentage = (totalPixelsInvalidated / (this.canvasWidth * this.canvasHeight)) * 100;
        // this.logger.cache(
        //    `✅ SELEKTIVE INVALIDIERUNG: ${movedSpheres.length} Spheres, ` +
        //    `${totalPixelsInvalidated.toLocaleString()} pixels (${invalidationPercentage.toFixed(2)}%)`
        // );

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
        const safeBounds = {
            minX: Math.max(0, Math.min(this.canvasWidth - 1, Math.floor(bounds.minX))),
            minY: Math.max(0, Math.min(this.canvasHeight - 1, Math.floor(bounds.minY))),
            maxX: Math.max(0, Math.min(this.canvasWidth - 1, Math.ceil(bounds.maxX))),
            maxY: Math.max(0, Math.min(this.canvasHeight - 1, Math.ceil(bounds.maxY)))
        };

        if (safeBounds.minX > safeBounds.maxX || safeBounds.minY > safeBounds.maxY) {
            return 0;
        }

        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL;
        const bytesPerComponent = BUFFER_CONFIG.CACHE.BYTES_PER_COMPONENT;

        // ⚡ OPTIMIERUNG: Schreibe Zeile für Zeile (row-by-row)
        // Das ist notwendig weil der Cache-Buffer im Zeilenformat organisiert ist
        // console.log(`   🔧 invalidateRegion: Writing ${safeBounds.maxY - safeBounds.minY + 1} rows...`);
        for (let y = safeBounds.minY; y <= safeBounds.maxY; y++) {
            const rowWidth = safeBounds.maxX - safeBounds.minX + 1;
            if (rowWidth <= 0) continue;

            const rowData = new Float32Array(rowWidth * componentsPerPixel).fill(0.0);
            const firstPixelIndex = y * this.canvasWidth + safeBounds.minX;
            const byteOffset = firstPixelIndex * componentsPerPixel * bytesPerComponent;

            // Debug: Log erste, mittlere, letzte Zeile (DEAKTIVIERT)
            // if (y === safeBounds.minY || y === safeBounds.maxY || y === Math.floor((safeBounds.minY + safeBounds.maxY) / 2)) {
            //     console.log(`      Row ${y}: pixels [${safeBounds.minX}-${safeBounds.maxX}], pixelIndex=${firstPixelIndex}, byteOffset=${byteOffset}, components=${rowWidth * componentsPerPixel}`);
            // }

            this.device.queue.writeBuffer(this.cacheBuffer, byteOffset, rowData);
            this.writeBufferCallCount++;
        }
        // console.log(`   ✅ Wrote ${this.writeBufferCallCount} writeBuffer calls`);

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
        this.logger.cache('InvalidationManager aufgeräumt');
    }
}
