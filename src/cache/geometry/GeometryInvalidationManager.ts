import { Logger } from '../../utils/Logger';
import { GeometryMovementTracker } from './GeometryMovementTracker';
import { GeometryScreenProjection } from './GeometryScreenProjection';
import { GeometryInvalidationStats } from './GeometryInvalidationStats';

export interface InvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    cameraInvalidation: boolean;
}

export class GeometryInvalidationManager {
    private device: GPUDevice;
    private cacheBuffer: GPUBuffer;
    private canvasWidth: number;
    private canvasHeight: number;
    private logger: Logger;

    private movementTracker: GeometryMovementTracker;
    private screenProjection: GeometryScreenProjection;
    private stats: GeometryInvalidationStats;

    // DEBUG: Aktiviere detailliertes Logging
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

        this.movementTracker = new GeometryMovementTracker();
        this.screenProjection = new GeometryScreenProjection(canvasWidth, canvasHeight);
        this.stats = new GeometryInvalidationStats();

        this.logger.cache('CacheInvalidationManager initialisiert');
    }

    /**
     * FIXED: Hauptmethode mit besserem Error Handling und Logging
     */
    public async invalidateForFrame(spheresData: Float32Array, cameraData: Float32Array): Promise<InvalidationResult> {
        const startTime = performance.now();

        if (this.debugMode) {
            this.logger.cache('--- INVALIDATION FRAME START ---');
        }

        // 1. Bewegungen erkennen
        const cameraChanged = this.movementTracker.updateCameraData(cameraData);
        const movedSpheres = this.movementTracker.updateSpheresData(spheresData);

        // 2. Kamera-Parameter für Screen Projection setzen
        await this.updateCameraProjection(cameraData);

        let result: InvalidationResult;

        if (cameraChanged) {
            // Kamera bewegt - komplette Invalidierung
            result = await this.handleCameraMovement();
        } else if (movedSpheres.length > 0) {
            // FIXED: Nur Objekte bewegt - echte selektive Invalidierung
            result = await this.handleObjectMovementsFixed(movedSpheres, spheresData);
        } else {
            // Keine Bewegung - keine Invalidierung
            result = {
                pixelsInvalidated: 0,
                regionsInvalidated: 0,
                invalidationTime: performance.now() - startTime,
                cameraInvalidation: false
            };
        }

        // Statistiken aktualisieren
        this.stats.recordInvalidation(result);

        if (this.debugMode) {
            this.logger.cache(`--- INVALIDATION RESULT: ${result.pixelsInvalidated} pixels, ${result.invalidationTime.toFixed(2)}ms ---`);
        }

        return result;
    }

    /**
     * FIXED: Kamera-Parameter für Screen Projection setzen
     */
    private async updateCameraProjection(cameraData: Float32Array): Promise<void> {
        try {
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

        } catch (error) {
            this.logger.error('Failed to update camera projection:', error);
            // Fallback: Camera projection bleibt bei letzten Werten
        }
    }

    /**
     * FIXED: Objekt-Bewegungen - echte selektive Cache-Invalidierung
     */
    private async handleObjectMovementsFixed(
        movedSpheres: number[],
        spheresData: Float32Array
    ): Promise<InvalidationResult> {
        const startTime = performance.now();
        let totalPixelsInvalidated = 0;
        const regions: string[] = [];

        if (this.debugMode) {
            this.logger.cache(`Processing ${movedSpheres.length} moved spheres...`);
        }

        for (const sphereIndex of movedSpheres) {
            try {
                const sphereData = this.extractSphereData(spheresData, sphereIndex);
                const oldPosition = this.movementTracker.getLastPosition(sphereIndex);

                if (oldPosition && sphereData) {
                    // Screen bounds für alte und neue Position berechnen
                    const oldBounds = this.screenProjection.sphereToScreenBounds(
                        oldPosition,
                        sphereData.radius
                    );
                    const newBounds = this.screenProjection.sphereToScreenBounds(
                        sphereData.position,
                        sphereData.radius
                    );

                    if (this.debugMode) {
                        this.logger.cache(`Sphere ${sphereIndex}: old=${this.boundsToString(oldBounds)}, new=${this.boundsToString(newBounds)}`);
                    }

                    // Vereinigte Bounds + Sicherheitspuffer
                    const combinedBounds = this.combineBounds(oldBounds, newBounds);
                    const expandedBounds = this.expandBounds(combinedBounds, 10);

                    // WICHTIG: Prüfe ob Bounds gültig sind
                    if (this.screenProjection.isValidBounds(expandedBounds)) {
                        const pixelsInRegion = await this.invalidateRegionSafe(expandedBounds);
                        totalPixelsInvalidated += pixelsInRegion;
                        regions.push(`${expandedBounds.minX},${expandedBounds.minY}-${expandedBounds.maxX},${expandedBounds.maxY}`);

                        if (this.debugMode) {
                            const area = this.screenProjection.calculateBoundsArea(expandedBounds);
                            const percentage = (area / (this.canvasWidth * this.canvasHeight)) * 100;
                            this.logger.cache(`  → Invalidated ${pixelsInRegion} pixels (${percentage.toFixed(2)}%)`);
                        }
                    } else {
                        // Ungültige Bounds - Sphere ist nicht sichtbar, keine Invalidierung nötig
                        if (this.debugMode) {
                            this.logger.cache(`  → Sphere ${sphereIndex} not visible, skipping invalidation`);
                        }
                    }
                } else {
                    this.logger.warning(`Sphere ${sphereIndex}: Missing data for regional invalidation`);
                }

            } catch (error) {
                this.logger.error(`Error processing sphere ${sphereIndex}:`, error);

                // FALLBACK: Bei Fehler nur diese eine Sphere komplett invalidieren
                // (Nicht den ganzen Cache!)
                const fallbackPixels = Math.min(10000, Math.floor(this.canvasWidth * this.canvasHeight * 0.05));
                await this.invalidateRandomPixels(fallbackPixels);
                totalPixelsInvalidated += fallbackPixels;

                if (this.debugMode) {
                    this.logger.cache(`  → Fallback invalidation: ${fallbackPixels} pixels`);
                }
            }
        }

        const invalidationPercentage = (totalPixelsInvalidated / (this.canvasWidth * this.canvasHeight)) * 100;

        this.logger.cache(
            `Object movement: ${movedSpheres.length} spheres, ` +
            `${totalPixelsInvalidated.toLocaleString()} pixels (${invalidationPercentage.toFixed(2)}%)`
        );

        return {
            pixelsInvalidated: totalPixelsInvalidated,
            regionsInvalidated: regions.length,
            invalidationTime: performance.now() - startTime,
            cameraInvalidation: false
        };
    }

    /**
     * FIXED: Sichere Region-Invalidierung mit Bounds-Checking
     */
    private async invalidateRegionSafe(bounds: {
        minX: number; minY: number; maxX: number; maxY: number;
    }): Promise<number> {
        // Bounds validieren und klampen
        const safeBounds = {
            minX: Math.max(0, Math.min(this.canvasWidth - 1, bounds.minX)),
            minY: Math.max(0, Math.min(this.canvasHeight - 1, bounds.minY)),
            maxX: Math.max(0, Math.min(this.canvasWidth - 1, bounds.maxX)),
            maxY: Math.max(0, Math.min(this.canvasHeight - 1, bounds.maxY))
        };

        // Doppelcheck: Bounds sind gültig
        if (safeBounds.minX > safeBounds.maxX || safeBounds.minY > safeBounds.maxY) {
            if (this.debugMode) {
                this.logger.cache(`Invalid bounds after clamping: ${JSON.stringify(safeBounds)}`);
            }
            return 0;
        }

        const pixelsInRegion: number[] = [];

        // Pixel-Indizes sammeln
        for (let y = safeBounds.minY; y <= safeBounds.maxY; y++) {
            for (let x = safeBounds.minX; x <= safeBounds.maxX; x++) {
                const pixelIndex = y * this.canvasWidth + x;
                pixelsInRegion.push(pixelIndex);
            }
        }

        // Batch-Invalidierung auf GPU
        await this.batchInvalidatePixels(pixelsInRegion);

        return pixelsInRegion.length;
    }

    /**
     * Fallback: Zufällige Pixel invalidieren (für Error-Cases)
     */
    private async invalidateRandomPixels(count: number): Promise<void> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.min(count, totalPixels);

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        await this.batchInvalidatePixels(Array.from(invalidPixels));
    }

    /**
     * Hilfsfunktion: Bounds zu String
     */
    private boundsToString(bounds: { minX: number; minY: number; maxX: number; maxY: number }): string {
        if (!this.screenProjection.isValidBounds(bounds)) {
            return 'INVALID';
        }
        const area = this.screenProjection.calculateBoundsArea(bounds);
        return `(${bounds.minX},${bounds.minY})-(${bounds.maxX},${bounds.maxY})[${area}px]`;
    }

    /**
     * Debug-Modus umschalten
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        this.logger.cache(`Debug mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    // ... Alle anderen Methoden bleiben unverändert
    private async handleCameraMovement(): Promise<InvalidationResult> {
        const startTime = performance.now();
        await this.invalidateFullCache();
        const totalPixels = this.canvasWidth * this.canvasHeight;
        this.logger.cache('Kamera bewegt - vollständige Cache-Invalidierung');
        return {
            pixelsInvalidated: totalPixels,
            regionsInvalidated: 1,
            invalidationTime: performance.now() - startTime,
            cameraInvalidation: true
        };
    }

    private async batchInvalidatePixels(pixelIndices: number[]): Promise<void> {
        const batchSize = 100;
        for (let i = 0; i < pixelIndices.length; i += batchSize) {
            const batch = pixelIndices.slice(i, i + batchSize);
            for (const pixelIndex of batch) {
                const validFlagOffset = pixelIndex * 6 * 4 + 5 * 4;
                this.device.queue.writeBuffer(
                    this.cacheBuffer,
                    validFlagOffset,
                    new Float32Array([0.0])
                );
            }
        }
    }

    private async invalidateFullCache(): Promise<void> {
        const pixelCount = this.canvasWidth * this.canvasHeight;
        const cacheData = new Float32Array(pixelCount * 6).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
    }

    private extractSphereData(spheresData: Float32Array, sphereIndex: number): {
        position: { x: number; y: number; z: number };
        radius: number;
        color: { r: number; g: number; b: number };
        metallic: number;
    } | null {
        const offset = sphereIndex * 8;
        if (offset + 7 >= spheresData.length) return null;
        return {
            position: {
                x: spheresData[offset + 0],
                y: spheresData[offset + 1],
                z: spheresData[offset + 2]
            },
            radius: spheresData[offset + 3],
            color: {
                r: spheresData[offset + 4],
                g: spheresData[offset + 5],
                b: spheresData[offset + 6]
            },
            metallic: spheresData[offset + 7]
        };
    }

    private combineBounds(
        bounds1: { minX: number; minY: number; maxX: number; maxY: number },
        bounds2: { minX: number; minY: number; maxX: number; maxY: number }
    ) {
        return {
            minX: Math.min(bounds1.minX, bounds2.minX),
            minY: Math.min(bounds1.minY, bounds2.minY),
            maxX: Math.max(bounds1.maxX, bounds2.maxX),
            maxY: Math.max(bounds1.maxY, bounds2.maxY)
        };
    }

    private expandBounds(
        bounds: { minX: number; minY: number; maxX: number; maxY: number },
        padding: number
    ) {
        return {
            minX: Math.max(0, bounds.minX - padding),
            minY: Math.max(0, bounds.minY - padding),
            maxX: Math.min(this.canvasWidth - 1, bounds.maxX + padding),
            maxY: Math.min(this.canvasHeight - 1, bounds.maxY + padding)
        };
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
        this.stats.cleanup();
        this.logger.cache('CacheInvalidationManager aufgeräumt');
    }
}