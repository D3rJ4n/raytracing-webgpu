import { Logger } from "../utils/Logger";
import { GEOMETRY_CACHE, PERFORMANCE_CONFIG } from "../utils/Constants";

export class GeometryPixelCache {
    private device: GPUDevice | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private logger: Logger;

    private stats = {
        totalPixels: 0,
        cacheHits: 0,
        cacheMisses: 0
    };

    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public initialize(
        device: GPUDevice,
        canvasWidth: number,
        canvasHeight: number,
        cacheBuffer: GPUBuffer
    ): void {
        this.device = device;
        this.cacheBuffer = cacheBuffer;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        this.stats.totalPixels = canvasWidth * canvasHeight;

        this.logger.cache('Optimaler Geometry-Cache initialisiert');
        this.logger.cache(`Canvas: ${canvasWidth}x${canvasHeight} = ${this.stats.totalPixels.toLocaleString()} Pixel`);
    }

    public async readStatistics(): Promise<void> {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache-System nicht initialisiert');
        }

        try {
            const stagingBuffer = this.device.createBuffer({
                size: this.cacheBuffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.cacheBuffer, 0,
                stagingBuffer, 0,
                this.cacheBuffer.size
            );
            this.device.queue.submit([commandEncoder.finish()]);

            await this.device.queue.onSubmittedWorkDone();

            await stagingBuffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = stagingBuffer.getMappedRange();
            const cacheData = new Float32Array(arrayBuffer); // Jetzt Float32Array für optimalen Cache

            this.calculateStatistics(cacheData);

            stagingBuffer.unmap();
            stagingBuffer.destroy();

        } catch (error) {
            this.logger.error('Fehler beim Lesen der Cache-Statistiken:', error);
            throw error;
        }
    }

    private calculateStatistics(cacheData: Float32Array): void {
        let hits = 0;
        let misses = 0;

        // Korrekte Berechnung für 6 float32 pro Pixel
        for (let i = 0; i < this.stats.totalPixels; i++) {
            const baseIndex = i * 6; // 6 float32 pro Pixel

            // WICHTIG: Sicherheitsprüfung für Buffer-Grenzen
            if (baseIndex + GEOMETRY_CACHE.VALID_FLAG >= cacheData.length) {
                misses++; // Wenn außerhalb des Buffers, dann Miss
                continue;
            }

            const validFlag = cacheData[baseIndex + GEOMETRY_CACHE.VALID_FLAG];

            // KORRIGIERT: 1.0 = valid (Hit), 0.0 = invalid (Miss)
            if (validFlag === 1.0) {
                hits++;
            } else {
                misses++;
            }
        }

        // Statistiken setzen
        this.stats.cacheHits = hits;
        this.stats.cacheMisses = misses;

        // Debug-Info mit Sicherheitsprüfungen
        if (this.stats.totalPixels > 0) {
            const sampleSize = Math.min(5, this.stats.totalPixels);
            const sampleInfo: string[] = [];

            for (let i = 0; i < sampleSize; i++) {
                const baseIndex = i * 6;

                // NEUE Sicherheitsprüfung
                if (baseIndex + GEOMETRY_CACHE.VALID_FLAG >= cacheData.length) {
                    sampleInfo.push('OUT_OF_BOUNDS');
                    continue;
                }

                const sphereIndex = cacheData[baseIndex + GEOMETRY_CACHE.SPHERE_INDEX];
                const valid = cacheData[baseIndex + GEOMETRY_CACHE.VALID_FLAG];

                let type = '';
                if (valid === 0.0) {
                    type = 'INVALID';
                } else if (sphereIndex === GEOMETRY_CACHE.BACKGROUND_VALUE) {
                    type = 'BACKGROUND';
                } else if (sphereIndex === GEOMETRY_CACHE.GROUND_VALUE) {
                    type = 'GROUND';
                } else if (sphereIndex >= 0) {
                    type = `SPHERE_${Math.floor(sphereIndex)}`;
                } else {
                    type = 'UNKNOWN';
                }

                sampleInfo.push(`${type}`);
            }

            this.logger.cache(
                `Cache-Sample (erste ${sampleSize} Pixel): [${sampleInfo.join(', ')}]`
            );
            this.logger.cache(
                `Hits: ${hits.toLocaleString()}, Misses: ${misses.toLocaleString()}, ` +
                `Hit-Rate: ${this.getHitRate().toFixed(1)}%`
            );
        }
    }

    public logStatistics(frameNumber: number): void {
        this.logger.logCacheStatistics(frameNumber, {
            totalPixels: this.stats.totalPixels,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses
        });
    }

    public async logStatisticsWithRead(frameNumber: number): Promise<void> {
        await this.readStatistics();
        this.logStatistics(frameNumber);
    }

    public getHitRate(): number {
        if (this.stats.totalPixels === 0) return 0;
        return (this.stats.cacheHits / this.stats.totalPixels) * 100;
    }

    public getStatistics(): {
        totalPixels: number;
        cacheHits: number;
        cacheMisses: number;
        hitRate: number;
    } {
        return {
            totalPixels: this.stats.totalPixels,
            cacheHits: this.stats.cacheHits,
            cacheMisses: this.stats.cacheMisses,
            hitRate: this.getHitRate()
        };
    }

    // REPARIERT: Reset für optimalen Cache (6 float32 pro Pixel)
    public reset(): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache-System nicht initialisiert');
        }

        this.logger.cache('Setze optimalen Geometry-Cache zurück...');

        const pixelCount = this.canvasWidth * this.canvasHeight;

        // 6 float32 pro Pixel, alle auf 0.0 (invalid) setzen
        const cacheData = new Float32Array(pixelCount * 6).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        // Statistiken zurücksetzen
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = this.stats.totalPixels;

        this.logger.success('Optimaler Geometry-Cache zurückgesetzt (6 float32/pixel)');
    }

    public async performanceTest(renderFunction: () => Promise<void | number>, iterations: number = 3): Promise<{
        averageRenderTime: number;
        hitRates: number[];
        totalTime: number;
    }> {
        this.logger.test(`Starte Performance-Test mit ${iterations} Iterationen...`);

        const renderTimes: number[] = [];
        const hitRates: number[] = [];
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const frameStart = performance.now();
            await renderFunction();
            const frameTime = performance.now() - frameStart;
            renderTimes.push(frameTime);

            await this.readStatistics();
            hitRates.push(this.getHitRate());

            this.logger.test(`Iteration ${i + 1}: ${frameTime.toFixed(2)}ms, Hit Rate: ${this.getHitRate().toFixed(1)}%`);

            await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.FRAME_DELAY_MS));
        }

        const totalTime = performance.now() - startTime;
        const averageRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;

        this.logger.test(`Performance-Test abgeschlossen:`);
        this.logger.test(`  Durchschnittliche Render-Zeit: ${averageRenderTime.toFixed(2)}ms`);
        this.logger.test(`  Gesamtzeit: ${totalTime.toFixed(2)}ms`);
        this.logger.test(`  Finale Hit Rate: ${hitRates[hitRates.length - 1].toFixed(1)}%`);

        return {
            averageRenderTime,
            hitRates,
            totalTime
        };
    }

    public evaluateEfficiency(): {
        rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
        message: string;
        recommendations: string[];
    } {
        const hitRate = this.getHitRate();
        const recommendations: string[] = [];

        let rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
        let message: string;

        if (hitRate >= 90) {
            rating = 'Excellent';
            message = 'Optimaler Cache arbeitet ausgezeichnet!';
        } else if (hitRate >= 70) {
            rating = 'Good';
            message = 'Cache funktioniert gut';
            recommendations.push('Überprüfe ob alle statischen Bereiche gecacht werden');
        } else if (hitRate >= 40) {
            rating = 'Fair';
            message = 'Cache-Effizienz könnte besser sein';
            recommendations.push('Analysiere Cache-Miss-Patterns');
            recommendations.push('Überprüfe Cache-Invalidierung-Logik');
        } else {
            rating = 'Poor';
            message = 'Cache arbeitet ineffizient';
            recommendations.push('Cache-Algorithmus überarbeiten');
            recommendations.push('Debugging der Cache-Logik erforderlich');
        }

        return { rating, message, recommendations };
    }

    // Debug-Methode für optimalen Cache
    public async debugCacheContents(sampleSize: number = 50): Promise<void> {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache-System nicht initialisiert');
        }

        try {
            const stagingBuffer = this.device.createBuffer({
                size: this.cacheBuffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.cacheBuffer, 0,
                stagingBuffer, 0,
                this.cacheBuffer.size
            );
            this.device.queue.submit([commandEncoder.finish()]);

            await this.device.queue.onSubmittedWorkDone();
            await stagingBuffer.mapAsync(GPUMapMode.READ);

            const arrayBuffer = stagingBuffer.getMappedRange();
            const cacheData = new Float32Array(arrayBuffer);

            // Analyse der Cache-Inhalte (6 float32 Struktur)
            const typeCount = new Map<string, number>();
            const actualSampleSize = Math.min(sampleSize, this.stats.totalPixels);

            console.log(`\n=== OPTIMALER CACHE DEBUG (6 float32, erste ${actualSampleSize} Pixel) ===`);
            console.log(`Buffer Größe: ${this.cacheBuffer.size.toLocaleString()} bytes`);
            console.log(`Erwartete Größe: ${(this.stats.totalPixels * 6 * 4).toLocaleString()} bytes`);
            console.log(`Pixel insgesamt: ${this.stats.totalPixels.toLocaleString()}`);

            for (let i = 0; i < actualSampleSize; i++) {
                const baseIndex = i * 6; // 6 float32 pro Pixel

                // Alle 6 Komponenten lesen
                const sphereIndex = cacheData[baseIndex + GEOMETRY_CACHE.SPHERE_INDEX];
                const hitDistance = cacheData[baseIndex + GEOMETRY_CACHE.HIT_DISTANCE];
                const hitPointX = cacheData[baseIndex + GEOMETRY_CACHE.HIT_POINT_X];
                const hitPointY = cacheData[baseIndex + GEOMETRY_CACHE.HIT_POINT_Y];
                const hitPointZ = cacheData[baseIndex + GEOMETRY_CACHE.HIT_POINT_Z];
                const valid = cacheData[baseIndex + GEOMETRY_CACHE.VALID_FLAG];

                let type = '';
                if (valid === 0.0) {
                    type = 'INVALID';
                } else if (sphereIndex === GEOMETRY_CACHE.BACKGROUND_VALUE) {
                    type = 'BACKGROUND';
                } else if (sphereIndex === GEOMETRY_CACHE.GROUND_VALUE) {
                    type = 'GROUND';
                } else if (sphereIndex >= 0) {
                    type = `SPHERE_${Math.floor(sphereIndex)}`;
                } else {
                    type = 'UNKNOWN';
                }

                typeCount.set(type, (typeCount.get(type) || 0) + 1);

                // Detaillierte Info für erste paar Pixel
                if (i < 10) {
                    console.log(`Pixel ${i}: ${type} | Sphere:${sphereIndex.toFixed(1)} | Dist:${hitDistance.toFixed(3)} | Pos:(${hitPointX.toFixed(2)},${hitPointY.toFixed(2)},${hitPointZ.toFixed(2)}) | Valid:${valid}`);
                }
            }

            console.log('\n--- CACHE VERTEILUNG ---');
            typeCount.forEach((count, type) => {
                const percentage = (count / actualSampleSize * 100).toFixed(1);
                console.log(`${type}: ${count} Pixel (${percentage}%)`);
            });
            console.log('================================\n');

            stagingBuffer.unmap();
            stagingBuffer.destroy();

        } catch (error) {
            this.logger.error('Fehler beim Debug der Cache-Inhalte:', error);
            throw error;
        }
    }

    public isInitialized(): boolean {
        return this.device !== null && this.cacheBuffer !== null;
    }

    public cleanup(): void {
        this.device = null;
        this.cacheBuffer = null;

        this.stats = {
            totalPixels: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        this.logger.cache('Optimaler Cache-System aufgeräumt');
    }
}