import { Logger } from "../utils/Logger";
import { GEOMETRY_CACHE } from "../utils/Constants";

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