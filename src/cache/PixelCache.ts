import { Logger } from '../utils/Logger';
import { CACHE_CONFIG, PERFORMANCE_CONFIG } from '../utils/Constants';

export class PixelCache {
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

        this.logger.cache('Cache-System initialisiert');
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

            // ⭐ WICHTIG: Warten bis Copy fertig ist!
            await this.device.queue.onSubmittedWorkDone();

            await stagingBuffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = stagingBuffer.getMappedRange();
            const cacheData = new Uint32Array(arrayBuffer);

            this.calculateStatistics(cacheData);

            stagingBuffer.unmap();
            stagingBuffer.destroy();

        } catch (error) {
            this.logger.error('Fehler beim Lesen der Cache-Statistiken:', error);
            throw error;
        }
    }

    private calculateStatistics(cacheData: Uint32Array): void {
        let hits = 0;
        let misses = 0;

        for (let i = 0; i < this.stats.totalPixels; i++) {
            const validFlag = cacheData[i * 4 + 3];
            if (validFlag === CACHE_CONFIG.VALID) {
                hits++;
            } else {
                misses++;
            }
        }

        this.stats.cacheHits = hits;
        this.stats.cacheMisses = misses;
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

    public reset(): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache-System nicht initialisiert');
        }

        this.logger.cache('Setze Cache zurück...');

        const pixelCount = this.canvasWidth * this.canvasHeight;
        const cacheData = new Uint32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        // ⭐ WICHTIG: Statistiken auch zurücksetzen!
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = this.stats.totalPixels;

        this.logger.success('Cache zurückgesetzt');
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
            message = '🚀 Cache arbeitet optimal!';
        } else if (hitRate >= 70) {
            rating = 'Good';
            message = '✅ Cache funktioniert gut';
            recommendations.push('Überprüfe ob alle statischen Bereiche gecacht werden');
        } else if (hitRate >= 40) {
            rating = 'Fair';
            message = '⚠️ Cache-Effizienz könnte besser sein';
            recommendations.push('Analysiere Cache-Miss-Patterns');
            recommendations.push('Überprüfe Cache-Invalidierung-Logik');
        } else {
            rating = 'Poor';
            message = '❌ Cache arbeitet ineffizient';
            recommendations.push('Cache-Algorithmus überarbeiten');
            recommendations.push('Debugging der Cache-Logik erforderlich');
            recommendations.push('Möglicherweise zu aggressive Invalidierung');
        }

        return { rating, message, recommendations };
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

        this.logger.cache('Cache-System aufgeräumt');
    }
}