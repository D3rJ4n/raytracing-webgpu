// InvalidationManager mit selektiver Invalidierung (BVH-kompatibel)

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

    // DEBUG: Aktiviere detailliertes Logging
    private debugMode: boolean = true;
    // Instrumentation: count host writeBuffer calls (helps measure improvement)
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

        this.logger.cache('InvalidationManager mit selektiver Invalidierung initialisiert');
    }

    public resetWriteBufferCount(): void {
        this.writeBufferCallCount = 0;
    }

    /**
     * HAUPTMETHODE: Prüfe auf Änderungen und invalidiere selektiv
     */
    public async invalidateForFrame(spheresData: Float32Array, cameraData: Float32Array): Promise<InvalidationResult> {
        const startTime = performance.now();

        if (this.debugMode) {
            this.logger.cache('--- INVALIDATION CHECK START ---');
        }

        // 1. Bewegungen erkennen
        const cameraChanged = this.movementTracker.updateCameraData(cameraData);
        const movedSpheres = this.movementTracker.updateSpheresData(spheresData);

        // 2. Kamera-Parameter für Screen Projection aktualisieren
        this.updateCameraProjection(cameraData);

        let result: InvalidationResult;

        if (cameraChanged) {
            // Kamera bewegt → Komplette Invalidierung
            result = await this.invalidateCompleteCache();
            result.cameraInvalidation = true;

        } else if (movedSpheres.length > 0) {
            // Nur Objekte bewegt → Selektive Invalidierung
            result = await this.handleObjectMovements(movedSpheres, spheresData);
            result.cameraInvalidation = false;

        } else {
            // Keine Änderung → Keine Invalidierung
            result = {
                pixelsInvalidated: 0,
                regionsInvalidated: 0,
                invalidationTime: performance.now() - startTime,
                cameraInvalidation: false
            };
        }

        // Statistiken aktualisieren
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

    /**
     * Objekt-Bewegungen - Selektive Cache-Invalidierung
     */
    private async handleObjectMovements(
        movedSpheres: number[],
        spheresData: Float32Array
    ): Promise<InvalidationResult> {
        const startTime = performance.now();
        let totalPixelsInvalidated = 0;
        let regionsCount = 0;

        if (this.debugMode) {
            this.logger.cache(`Verarbeite ${movedSpheres.length} bewegte Spheres...`);
        }

        for (const sphereIndex of movedSpheres) {
            const sphereData = this.extractSphereData(spheresData, sphereIndex);
            const oldPosition = this.movementTracker.getLastPosition(sphereIndex);

            if (oldPosition && sphereData) {
                // KUGEL-BOUNDS (alte + neue Position)
                const oldSphereBounds = this.screenProjection.sphereToScreenBounds(
                    oldPosition,
                    sphereData.radius
                );
                const newSphereBounds = this.screenProjection.sphereToScreenBounds(
                    sphereData.position,
                    sphereData.radius
                );

                const combinedBounds = this.screenProjection.unionMultipleBounds([
                    oldSphereBounds,
                    newSphereBounds
                ]);
                const expandedBounds = this.screenProjection.expandBounds(combinedBounds, 10);

                // Prüfe ob Bounds gültig sind
                if (this.screenProjection.isValidBounds(expandedBounds)) {
                    const pixelsInRegion = await this.invalidateRegion(expandedBounds);
                    totalPixelsInvalidated += pixelsInRegion;
                    regionsCount++;

                    if (this.debugMode) {
                        const area = this.screenProjection.calculateBoundsArea(expandedBounds);
                        const percentage = (area / (this.canvasWidth * this.canvasHeight)) * 100;
                        this.logger.cache(`  Sphere ${sphereIndex}: ${pixelsInRegion} pixels (${percentage.toFixed(2)}%)`);
                    }
                }
            }
        }

        const invalidationPercentage = (totalPixelsInvalidated / (this.canvasWidth * this.canvasHeight)) * 100;

        this.logger.cache(
            `✅ SELEKTIVE INVALIDIERUNG: ${movedSpheres.length} Spheres, ` +
            `${totalPixelsInvalidated.toLocaleString()} pixels (${invalidationPercentage.toFixed(2)}%)`
        );

        return {
            pixelsInvalidated: totalPixelsInvalidated,
            regionsInvalidated: regionsCount,
            invalidationTime: performance.now() - startTime,
            cameraInvalidation: false
        };
    }

    /**
     * Region invalidieren mit Contiguous Runs Optimierung
     * Für rechteckige Bounds ist jede Zeile vollständig zusammenhängend,
     * daher ein writeBuffer pro Zeile (optimal für Bounds-basierte Invalidierung)
     */
    private async invalidateRegion(bounds: {
        minX: number; minY: number; maxX: number; maxY: number;
    }): Promise<number> {
        // Bounds validieren und klampen
        const safeBounds = {
            minX: Math.max(0, Math.min(this.canvasWidth - 1, Math.floor(bounds.minX))),
            minY: Math.max(0, Math.min(this.canvasHeight - 1, Math.floor(bounds.minY))),
            maxX: Math.max(0, Math.min(this.canvasWidth - 1, Math.ceil(bounds.maxX))),
            maxY: Math.max(0, Math.min(this.canvasHeight - 1, Math.ceil(bounds.maxY)))
        };

        // Doppelcheck: Bounds sind gültig
        if (safeBounds.minX > safeBounds.maxX || safeBounds.minY > safeBounds.maxY) {
            return 0;
        }

        let pixelsInvalidated = 0;
        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL; // 7
        const bytesPerComponent = BUFFER_CONFIG.CACHE.BYTES_PER_COMPONENT; // 4

        // Contiguous run per row: Bei rechteckigen Bounds ist die gesamte
        // Zeile zwischen minX und maxX zusammenhängend, daher optimal
        for (let y = safeBounds.minY; y <= safeBounds.maxY; y++) {
            const rowWidth = safeBounds.maxX - safeBounds.minX + 1;
            if (rowWidth <= 0) continue;

            // Erstelle Array nur für die betroffene Region (minX bis maxX)
            const rowData = new Float32Array(rowWidth * componentsPerPixel).fill(0.0);
            const firstPixelIndex = y * this.canvasWidth + safeBounds.minX;
            const byteOffset = firstPixelIndex * componentsPerPixel * bytesPerComponent;

            this.device.queue.writeBuffer(this.cacheBuffer, byteOffset, rowData);
            this.writeBufferCallCount++;

            pixelsInvalidated += rowWidth;
        }

        return pixelsInvalidated;
    }

    /**
     * Kompletten Cache invalidieren
     */
    private async invalidateCompleteCache(): Promise<InvalidationResult> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const componentsPerPixel = BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL; // 7

        // Kompletter Cache-Reset
        const cacheData = new Float32Array(totalPixels * componentsPerPixel).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
        this.writeBufferCallCount++;

        this.logger.cache(`Kompletter Cache invalidiert: ${totalPixels.toLocaleString()} Pixel`);

        return {
            pixelsInvalidated: totalPixels,
            regionsInvalidated: 1,
            invalidationTime: 0, // Wird später gesetzt
            cameraInvalidation: false // Wird später gesetzt
        };
    }

    /**
     * Sphere-Daten aus Float32Array extrahieren
     */
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

    /**
     * Instrumentation: get number of host writeBuffer calls executed by this manager
     */
    public getWriteBufferCallCount(): number {
        return this.writeBufferCallCount;
    }

    public resetWriteBufferCallCount(): void {
        this.writeBufferCallCount = 0;
    }

    /**
     * Debug-Modus umschalten
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.logger.cache(`InvalidationManager Debug: ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Statistiken abrufen
     */
    public getStats() {
        return this.stats.getStats();
    }

    /**
     * Statistiken zurücksetzen
     */
    public resetStats(): void {
        this.stats.reset();
        this.movementTracker.reset();
    }

    /**
     * Cleanup
     */
    public cleanup(): void {
        this.movementTracker.cleanup();
        this.screenProjection.cleanup();
        this.stats.cleanup();
        this.logger.cache('InvalidationManager aufgeräumt');
    }
}
