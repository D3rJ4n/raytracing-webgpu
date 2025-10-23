import { Logger } from "../utils/Logger";
import { GEOMETRY_CACHE, PERFORMANCE_CONFIG } from "../utils/Constants";

export interface CacheEfficiencyResult {
    rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    message: string;
    recommendations: string[];
}

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

        // Minimal initialization logging
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
            const cacheData = new Float32Array(arrayBuffer);

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

        for (let i = 0; i < this.stats.totalPixels; i++) {
            const baseIndex = i * 7;

            if (baseIndex + GEOMETRY_CACHE.VALID_FLAG >= cacheData.length) {
                misses++;
                continue;
            }

            const validFlag = cacheData[baseIndex + GEOMETRY_CACHE.VALID_FLAG];

            if (validFlag === 1.0) {
                hits++;
            } else {
                misses++;
            }
        }

        this.stats.cacheHits = hits;
        this.stats.cacheMisses = misses;

        // Removed verbose debug output
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

        const pixelCount = this.canvasWidth * this.canvasHeight;
        const cacheData = new Float32Array(pixelCount * 7).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.stats.cacheHits = 0;
        this.stats.cacheMisses = this.stats.totalPixels;

        // Removed verbose reset logging
    }

    public async performanceTest(renderFunction: () => Promise<void | number>, iterations: number = 3): Promise<{
        averageRenderTime: number;
        hitRates: number[];
        totalTime: number;
    }> {
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

            await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.FRAME_DELAY_MS));
        }

        const totalTime = performance.now() - startTime;
        const averageRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;

        return {
            averageRenderTime,
            hitRates,
            totalTime
        };
    }

    public evaluateEfficiency(): CacheEfficiencyResult {
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
    }
}