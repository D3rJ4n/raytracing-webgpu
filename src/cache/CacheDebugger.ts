import { Logger } from '../utils/Logger';
import { CACHE_CONFIG, DEBUG_CONFIG, PERFORMANCE_CONFIG } from '../utils/Constants';

/**
 * 🔍 CacheDebugger - Cache Debug-Tools
 * 
 * Erweiterte Debug-Funktionalität für das Cache-System:
 * - Detaillierte Cache-Analyse
 * - Pixel-Sample-Inspektion
 * - Performance-Benchmarks
 * - Cache-Visualisierung
 */
export class CacheDebugger {
    private device: GPUDevice | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private logger: Logger;

    // ===== CANVAS-DIMENSIONEN =====
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    // ===== DEBUG-STATISTIKEN =====
    private debugStats = {
        totalTests: 0,
        successfulReads: 0,
        failedReads: 0,
        averageReadTime: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Cache Debugger initialisieren
     */
    public initialize(
        device: GPUDevice,
        cacheBuffer: GPUBuffer,
        canvasWidth: number,
        canvasHeight: number
    ): void {
        this.device = device;
        this.cacheBuffer = cacheBuffer;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        this.logger.debug('Cache Debugger initialisiert');
        this.logger.debug(`Canvas: ${canvasWidth}x${canvasHeight}`);
    }

    /**
     * 🧪 Kompletter Debug-Test durchführen
     */
    public async runDebugTest(renderFunction: () => Promise<void | number>): Promise<void> {
        this.logger.debug('Starte umfassenden Cache-Debug-Test...');

        try {
            // Schritt 1: Cache vor erstem Frame prüfen
            this.logger.debug('Schritt 1: Cache vor erstem Frame prüfen...');
            await this.inspectCacheDetails(1);

            // Schritt 2: Ersten Frame rendern
            this.logger.debug('Schritt 2: Ersten Frame rendern...');
            await renderFunction();
            await this.waitForGPU();

            // Schritt 3: Cache nach erstem Frame prüfen
            this.logger.debug('Schritt 3: Cache nach erstem Frame prüfen...');
            await this.inspectCacheDetails(2);

            // Schritt 4: Zweiten Frame rendern
            this.logger.debug('Schritt 4: Zweiten Frame rendern...');
            await renderFunction();
            await this.waitForGPU();

            // Schritt 5: Cache nach zweitem Frame prüfen
            this.logger.debug('Schritt 5: Cache nach zweitem Frame prüfen...');
            await this.inspectCacheDetails(3);

            // Schritt 6: Performance-Analyse
            await this.performanceAnalysis(renderFunction);

            this.logger.success('Cache-Debug-Test erfolgreich abgeschlossen');

        } catch (error) {
            this.logger.error('Fehler beim Cache-Debug-Test:', error);
            throw error;
        }
    }

    /**
     * 🔍 Detaillierte Cache-Inspektion
     */
    public async inspectCacheDetails(step: number): Promise<{
        totalPixels: number;
        validPixels: number;
        invalidPixels: number;
        hitRate: number;
        pixelSamples: Array<{ index: number; r: number; g: number; b: number; valid: number }>;
    }> {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache Debugger nicht initialisiert');
        }

        const startTime = performance.now();

        try {
            // Cache-Daten von GPU lesen
            const cacheData = await this.readCacheData();

            // Statistiken berechnen
            const stats = this.analyzeCacheData(cacheData);

            // Pixel-Samples extrahieren
            const pixelSamples = this.extractPixelSamples(cacheData);

            // Debug-Ausgabe
            this.logDetailedAnalysis(step, stats, pixelSamples);

            // Performance tracken
            const readTime = performance.now() - startTime;
            this.updateDebugStats(readTime, true);

            return {
                ...stats,
                pixelSamples
            };

        } catch (error) {
            const readTime = performance.now() - startTime;
            this.updateDebugStats(readTime, false);
            this.logger.error(`Fehler bei Cache-Inspektion Schritt ${step}:`, error);
            throw error;
        }
    }

    /**
     * 📊 Cache-Daten von GPU lesen
     */
    private async readCacheData(): Promise<Uint32Array> {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Dependencies nicht verfügbar');
        }

        // Staging Buffer erstellen
        const stagingBuffer = this.device.createBuffer({
            size: this.cacheBuffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        // Cache-Daten kopieren
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(
            this.cacheBuffer, 0,
            stagingBuffer, 0,
            this.cacheBuffer.size
        );
        this.device.queue.submit([commandEncoder.finish()]);

        // Daten lesen
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const arrayBuffer = stagingBuffer.getMappedRange();
        const cacheData = new Uint32Array(arrayBuffer.slice(0)); // Copy erstellen

        // Buffer aufräumen
        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return cacheData;
    }

    /**
     * 🧮 Cache-Daten analysieren
     */
    private analyzeCacheData(cacheData: Uint32Array): {
        totalPixels: number;
        validPixels: number;
        invalidPixels: number;
        hitRate: number;
    } {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        let validPixels = 0;
        let invalidPixels = 0;

        // Cache-Status für jeden Pixel prüfen
        for (let i = 0; i < totalPixels; i++) {
            const validFlag = cacheData[i * 4 + 3]; // Valid-Flag an Position 3
            if (validFlag === CACHE_CONFIG.VALID) {
                validPixels++;
            } else {
                invalidPixels++;
            }
        }

        const hitRate = totalPixels > 0 ? (validPixels / totalPixels) * 100 : 0;

        return {
            totalPixels,
            validPixels,
            invalidPixels,
            hitRate
        };
    }

    /**
     * 🎯 Pixel-Samples extrahieren
     */
    private extractPixelSamples(cacheData: Uint32Array): Array<{
        index: number;
        r: number;
        g: number;
        b: number;
        valid: number;
    }> {
        const samples: Array<{ index: number; r: number; g: number; b: number; valid: number }> = [];
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const sampleCount = Math.min(DEBUG_CONFIG.PIXEL_SAMPLE_COUNT, totalPixels);

        for (let i = 0; i < sampleCount; i++) {
            const baseIndex = i * 4;
            samples.push({
                index: i,
                r: cacheData[baseIndex + 0],
                g: cacheData[baseIndex + 1],
                b: cacheData[baseIndex + 2],
                valid: cacheData[baseIndex + 3]
            });
        }

        return samples;
    }

    /**
     * 📝 Detaillierte Analyse loggen
     */
    private logDetailedAnalysis(
        step: number,
        stats: { totalPixels: number; validPixels: number; invalidPixels: number; hitRate: number },
        pixelSamples: Array<{ index: number; r: number; g: number; b: number; valid: number }>
    ): void {
        // Pixel-Samples loggen
        this.logger.logPixelSample(step, pixelSamples);

        // Gesamtstatistik loggen
        this.logger.logOverallStatistics(step, stats.totalPixels, stats.validPixels, stats.invalidPixels);
    }

    /**
     * ⚡ Performance-Analyse durchführen
     */
    private async performanceAnalysis(renderFunction: () => Promise<void | number>): Promise<void> {
        this.logger.debug('🚀 Starte Performance-Analyse...');

        const iterations = 3;
        const renderTimes: number[] = [];
        const readTimes: number[] = [];

        for (let i = 0; i < iterations; i++) {
            // Render-Performance messen
            const renderStart = performance.now();
            await renderFunction();
            const renderTime = performance.now() - renderStart;
            renderTimes.push(renderTime);

            // Cache-Read-Performance messen
            const readStart = performance.now();
            await this.readCacheData();
            const readTime = performance.now() - readStart;
            readTimes.push(readTime);

            this.logger.debug(`Iteration ${i + 1}: Render=${renderTime.toFixed(2)}ms, Read=${readTime.toFixed(2)}ms`);

            // Pause zwischen Iterationen
            if (i < iterations - 1) {
                await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.FRAME_DELAY_MS));
            }
        }

        // Durchschnittswerte berechnen
        const avgRenderTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
        const avgReadTime = readTimes.reduce((a, b) => a + b, 0) / readTimes.length;

        this.logger.debug('📊 Performance-Analyse Ergebnisse:');
        this.logger.debug(`  Durchschnittliche Render-Zeit: ${avgRenderTime.toFixed(2)}ms`);
        this.logger.debug(`  Durchschnittliche Cache-Read-Zeit: ${avgReadTime.toFixed(2)}ms`);
        this.logger.debug(`  Cache-Read Overhead: ${((avgReadTime / avgRenderTime) * 100).toFixed(1)}%`);
    }

    /**
     * 🎨 Cache-Visualisierung erstellen
     */
    public async createCacheVisualization(): Promise<ImageData> {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Cache Debugger nicht initialisiert');
        }

        this.logger.debug('Erstelle Cache-Visualisierung...');

        try {
            const cacheData = await this.readCacheData();
            const imageData = new ImageData(this.canvasWidth, this.canvasHeight);
            const pixels = imageData.data;

            // Jeden Pixel basierend auf Cache-Status einfärben
            for (let i = 0; i < this.canvasWidth * this.canvasHeight; i++) {
                const validFlag = cacheData[i * 4 + 3];
                const pixelIndex = i * 4;

                if (validFlag === CACHE_CONFIG.VALID) {
                    // Cache Hit - Grün
                    pixels[pixelIndex + 0] = 0;     // R
                    pixels[pixelIndex + 1] = 255;   // G
                    pixels[pixelIndex + 2] = 0;     // B
                    pixels[pixelIndex + 3] = 255;   // A
                } else {
                    // Cache Miss - Rot
                    pixels[pixelIndex + 0] = 255;   // R
                    pixels[pixelIndex + 1] = 0;     // G
                    pixels[pixelIndex + 2] = 0;     // B
                    pixels[pixelIndex + 3] = 255;   // A
                }
            }

            this.logger.success('Cache-Visualisierung erstellt');
            return imageData;

        } catch (error) {
            this.logger.error('Fehler bei Cache-Visualisierung:', error);
            throw error;
        }
    }

    /**
     * 📊 Cache-Heatmap erstellen
     */
    public async createCacheHeatmap(): Promise<ImageData> {
        this.logger.debug('Erstelle Cache-Heatmap...');

        const cacheData = await this.readCacheData();
        const imageData = new ImageData(this.canvasWidth, this.canvasHeight);
        const pixels = imageData.data;

        for (let i = 0; i < this.canvasWidth * this.canvasHeight; i++) {
            const r = cacheData[i * 4 + 0];
            const g = cacheData[i * 4 + 1];
            const b = cacheData[i * 4 + 2];
            const valid = cacheData[i * 4 + 3];
            const pixelIndex = i * 4;

            if (valid === CACHE_CONFIG.VALID) {
                // Zeige gespeicherte Farbe mit reduzierter Intensität
                pixels[pixelIndex + 0] = Math.floor(r * 0.8);     // R
                pixels[pixelIndex + 1] = Math.floor(g * 0.8);     // G
                pixels[pixelIndex + 2] = Math.floor(b * 0.8);     // B
                pixels[pixelIndex + 3] = 255;                     // A
            } else {
                // Cache Miss - Schwarz
                pixels[pixelIndex + 0] = 0;       // R
                pixels[pixelIndex + 1] = 0;       // G
                pixels[pixelIndex + 2] = 0;       // B
                pixels[pixelIndex + 3] = 255;     // A
            }
        }

        this.logger.success('Cache-Heatmap erstellt');
        return imageData;
    }

    /**
     * ⏱️ Auf GPU-Operationen warten
     */
    private async waitForGPU(): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, PERFORMANCE_CONFIG.GPU_WAIT_MS));
    }

    /**
     * 📊 Debug-Statistiken aktualisieren
     */
    private updateDebugStats(readTime: number, success: boolean): void {
        this.debugStats.totalTests++;

        if (success) {
            this.debugStats.successfulReads++;
            // Rolling average für Read-Zeit
            this.debugStats.averageReadTime =
                (this.debugStats.averageReadTime * (this.debugStats.successfulReads - 1) + readTime) /
                this.debugStats.successfulReads;
        } else {
            this.debugStats.failedReads++;
        }
    }

    /**
     * 📈 Debug-Statistiken abrufen
     */
    public getDebugStatistics(): {
        totalTests: number;
        successfulReads: number;
        failedReads: number;
        successRate: number;
        averageReadTime: number;
    } {
        const successRate = this.debugStats.totalTests > 0
            ? (this.debugStats.successfulReads / this.debugStats.totalTests) * 100
            : 0;

        return {
            ...this.debugStats,
            successRate
        };
    }

    /**
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null && this.cacheBuffer !== null;
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        this.device = null;
        this.cacheBuffer = null;
        this.canvasWidth = 0;
        this.canvasHeight = 0;

        // Debug-Statistiken zurücksetzen
        this.debugStats = {
            totalTests: 0,
            successfulReads: 0,
            failedReads: 0,
            averageReadTime: 0
        };

        this.logger.debug('Cache Debugger aufgeräumt');
    }
}