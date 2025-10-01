import { WebGPUDevice } from './WebGPUDevice';
import { Scene } from '../scene/Scene';
import { BufferManager } from '../rendering/BufferManager';
import { TextureManager } from '../rendering/TextureManager';
import { ComputePipeline } from './ComputePipeline';
import { RenderPipeline } from './RenderPipeline';
import { Renderer } from '../rendering/Renderer';
import { PixelCache } from '../cache/PixelCache';
import { CacheDebugger } from '../cache/CacheDebugger';
import { StatusDisplay } from '../utils/StatusDisplay';
import { Logger } from '../utils/Logger';
import { CANVAS_CONFIG, STATUS_CONFIG } from '../utils/Constants';

/**
 * 🎯 WebGPURaytracerApp - Einfache Haupt-App-Klasse
 * 
 * Ersetzt die monolithische main.ts mit sauberer Modulstruktur
 */
export class WebGPURaytracerApp {
    // ===== DOM-ELEMENTE =====
    private canvas: HTMLCanvasElement;
    private statusDisplay: StatusDisplay;

    // ===== SUBSYSTEME =====
    private webgpuDevice: WebGPUDevice;
    private scene: Scene;
    private bufferManager: BufferManager;
    private textureManager: TextureManager;
    private computePipeline: ComputePipeline;
    private renderPipeline: RenderPipeline;
    private renderer: Renderer;
    private pixelCache: PixelCache;
    private cacheDebugger: CacheDebugger;
    private currentSample: number = 0;
    private maxSamples: number = 0;
    private isAccumulating: boolean = false;

    // ===== UTILITIES =====
    private logger: Logger;

    // ===== STATE =====
    private initialized: boolean = false;

    constructor() {
        this.logger = Logger.getInstance();
        this.logger.init('Erstelle WebGPU Raytracer App...');

        // DOM-Elemente finden
        this.canvas = document.getElementById(CANVAS_CONFIG.ID) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas mit ID '${CANVAS_CONFIG.ID}' nicht gefunden`);
        }

        this.statusDisplay = new StatusDisplay(STATUS_CONFIG.ELEMENT_ID);
        this.logger.init(`Canvas gefunden: ${this.canvas.width}x${this.canvas.height}`);

        // Subsysteme erstellen
        this.webgpuDevice = new WebGPUDevice();
        this.scene = new Scene();
        this.bufferManager = new BufferManager();
        this.textureManager = new TextureManager();
        this.computePipeline = new ComputePipeline();
        this.renderPipeline = new RenderPipeline();
        this.renderer = new Renderer();
        this.pixelCache = new PixelCache();
        this.cacheDebugger = new CacheDebugger();
    }

    /**
     * 🚀 App vollständig initialisieren
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            this.logger.warning('App bereits initialisiert');
            return;
        }

        try {
            this.statusDisplay.showInfo('WebGPU Raytracer wird initialisiert...');

            // 1. WebGPU initialisieren
            this.logger.init('Initialisiere WebGPU...');
            await this.webgpuDevice.initialize(this.canvas);

            // 2. Szene erstellen
            this.logger.init('Erstelle Three.js Szene...');
            this.scene.initialize();
            this.scene.updateCameraAspect(this.canvas.width, this.canvas.height);

            // 3. GPU-Ressourcen erstellen
            this.logger.init('Erstelle GPU-Ressourcen...');

            this.textureManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height
            );

            this.bufferManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height,
                this.scene.getCameraData(),
                this.scene.getSpheresData()
            );

            // 4. Cache-System initialisieren
            this.pixelCache.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height,
                this.bufferManager.getCacheBuffer()
            );

            this.cacheDebugger.initialize(
                this.webgpuDevice.getDevice(),
                this.bufferManager.getCacheBuffer(),
                this.canvas.width,
                this.canvas.height
            );

            // 5. Pipelines erstellen
            this.logger.init('Erstelle Rendering-Pipelines...');

            await this.computePipeline.initialize(
                this.webgpuDevice.getDevice(),
                this.bufferManager.getAllBuffers(),
                this.textureManager.getRenderTexture()
            );

            await this.renderPipeline.initialize(
                this.webgpuDevice.getDevice(),
                this.textureManager.getRenderTexture(),
                this.textureManager.getSampler()
            );

            // 6. Renderer initialisieren
            this.logger.init('Initialisiere Renderer...');
            this.renderer.initialize(
                this.webgpuDevice.getDevice(),
                this.webgpuDevice.getContext(),
                this.computePipeline.getPipeline(),
                this.renderPipeline.getPipeline(),
                this.computePipeline.getBindGroup(),
                this.renderPipeline.getBindGroup()
            );

            // 7. Ersten Frame rendern
            this.logger.init('Rendere ersten Frame...');
            await this.renderer.renderFrame(this.canvas);

            this.initialized = true;
            this.statusDisplay.showSuccess('✅ WebGPU Raytracer mit Cache läuft!');
            this.logger.success('Initialisierung erfolgreich abgeschlossen');

        } catch (error) {
            this.logger.error('Fehler bei Initialisierung:', error);
            this.statusDisplay.showError(`❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
            throw error;
        }
    }

    /**
     * 🧪 Cache-Debug-Test starten
     */
    public async startCacheDebugTest(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.test('Starte Cache-Debug-Test...');
        await this.cacheDebugger.runDebugTest(
            () => this.renderer.renderFrame(this.canvas)
        );
    }

    /**
     * 📊 Cache-Statistiken anzeigen
     */
    public async showCacheStatistics(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        await this.pixelCache.logStatisticsWithRead(this.renderer.getFrameCount());
    }

    /**
     * 🔄 Cache zurücksetzen
     */
    public resetCache(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.pixelCache.reset();
        this.logger.info('Cache zurückgesetzt');
    }

    /**
     * 🎬 Einzelnen Frame rendern
     */
    public async renderFrame(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        await this.renderer.renderFrame(this.canvas);
    }

    /**
     * 📝 App-Status abrufen
     */
    public getStatus(): {
        initialized: boolean;
        frameCount: number;
        canvasSize: { width: number; height: number };
    } {
        return {
            initialized: this.initialized,
            frameCount: this.initialized ? this.renderer.getFrameCount() : 0,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            }
        };
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        this.logger.info('🧹 Räume Ressourcen auf...');

        if (this.bufferManager) {
            this.bufferManager.cleanup();
        }

        if (this.textureManager) {
            this.textureManager.cleanup();
        }

        this.initialized = false;
        this.logger.info('✅ Cleanup abgeschlossen');
    }

    /**
 * 🎨 Progressive Supersampling starten
 */
    public async startProgressiveSupersampling(maxSamples: number = 16): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.info(`🎨 Starte Progressive Supersampling: ${maxSamples} samples`);

        // Accumulation zurücksetzen
        this.bufferManager.resetAccumulation(this.canvas.width, this.canvas.height);
        this.currentSample = 0;
        this.maxSamples = maxSamples;
        this.isAccumulating = true;

        // Progressive Rendering
        const startTime = performance.now();

        for (let sample = 0; sample < maxSamples; sample++) {
            this.currentSample = sample + 1;

            // Kamera-Daten mit Random Seeds aktualisieren
            const baseCameraData = this.scene.getCameraData();
            this.bufferManager.updateCameraDataWithRandomSeeds(baseCameraData, sample);

            // Frame rendern
            await this.renderer.renderFrame(this.canvas);

            // Progress anzeigen
            if (sample % 4 === 0 || sample === maxSamples - 1) {
                const progress = ((sample + 1) / maxSamples * 100).toFixed(0);
                this.statusDisplay.showInfo(
                    `🎨 Supersampling: ${sample + 1}/${maxSamples} (${progress}%)`
                );
            }

            // Kurze Pause für UI-Updates (alle 4 Samples)
            if (sample % 4 === 0 && sample < maxSamples - 1) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }

        const totalTime = performance.now() - startTime;
        const avgTimePerSample = totalTime / maxSamples;

        this.isAccumulating = false;

        this.logger.success(
            `✅ Supersampling abgeschlossen: ${maxSamples} samples in ${totalTime.toFixed(0)}ms ` +
            `(${avgTimePerSample.toFixed(1)}ms/sample)`
        );

        this.statusDisplay.showSuccess(
            `✅ ${maxSamples}x Supersampling abgeschlossen (${totalTime.toFixed(0)}ms)`
        );
    }

    /**
     * 🔄 Accumulation zurücksetzen
     */
    public resetAccumulation(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.bufferManager.resetAccumulation(this.canvas.width, this.canvas.height);
        this.currentSample = 0;
        this.isAccumulating = false;

        this.logger.info('🔄 Accumulation zurückgesetzt');
    }

    /**
     * 🎯 Single-Sample Frame rendern (ohne Accumulation)
     */
    public async renderSingleFrame(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        // Accumulation zurücksetzen für sauberen Single-Frame
        this.resetAccumulation();

        // Kamera-Daten ohne Random Seeds (oder mit fixen Seeds)
        const baseCameraData = this.scene.getCameraData();
        this.bufferManager.updateCameraDataWithRandomSeeds(baseCameraData, 0);

        // Frame rendern
        await this.renderer.renderFrame(this.canvas);
    }

    /**
     * 📊 Supersampling-Status abrufen
     */
    public getSupersamplingStatus(): {
        isAccumulating: boolean;
        currentSample: number;
        maxSamples: number;
        progress: number;
    } {
        return {
            isAccumulating: this.isAccumulating,
            currentSample: this.currentSample,
            maxSamples: this.maxSamples,
            progress: this.maxSamples > 0 ? (this.currentSample / this.maxSamples) * 100 : 0
        };
    }

    /**
     * ⚡ Quick Supersampling (4 Samples)
     */
    public async quickSupersampling(): Promise<void> {
        await this.startProgressiveSupersampling(4);
    }

    /**
     * 🎨 High Quality Supersampling (16 Samples)
     */
    public async highQualitySupersampling(): Promise<void> {
        await this.startProgressiveSupersampling(16);
    }

    /**
     * 💎 Extreme Quality Supersampling (64 Samples)
     */
    public async extremeSupersampling(): Promise<void> {
        await this.startProgressiveSupersampling(64);
    }

    /**
     * 🔬 Supersampling-Vergleichstest
     */
    public async compareSupersampling(): Promise<{
        noAA: number;
        samples4: number;
        samples16: number;
    }> {
        this.logger.info('🔬 Starte Supersampling-Vergleichstest...');

        // Test 1: Ohne AA
        this.resetAccumulation();
        const time1 = performance.now();
        await this.renderSingleFrame();
        const noAATime = performance.now() - time1;
        this.logger.info(`  Ohne AA: ${noAATime.toFixed(1)}ms`);

        await new Promise(r => setTimeout(r, 500));

        // Test 2: 4x AA
        this.resetAccumulation();
        const time2 = performance.now();
        await this.startProgressiveSupersampling(4);
        const aa4Time = performance.now() - time2;
        this.logger.info(`  4x AA: ${aa4Time.toFixed(1)}ms`);

        await new Promise(r => setTimeout(r, 500));

        // Test 3: 16x AA
        this.resetAccumulation();
        const time3 = performance.now();
        await this.startProgressiveSupersampling(16);
        const aa16Time = performance.now() - time3;
        this.logger.info(`  16x AA: ${aa16Time.toFixed(1)}ms`);

        this.logger.info('📊 Vergleich abgeschlossen:');
        this.logger.info(`  Overhead 4x:  ${(aa4Time / noAATime).toFixed(1)}x`);
        this.logger.info(`  Overhead 16x: ${(aa16Time / noAATime).toFixed(1)}x`);

        return {
            noAA: noAATime,
            samples4: aa4Time,
            samples16: aa16Time
        };
    }
}