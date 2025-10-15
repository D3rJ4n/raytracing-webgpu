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
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { CANVAS_CONFIG, STATUS_CONFIG } from '../utils/Constants';

export class WebGPURaytracerApp {
    private canvas: HTMLCanvasElement;
    private statusDisplay: StatusDisplay;

    private webgpuDevice: WebGPUDevice;
    public scene: Scene;
    private bufferManager: BufferManager;
    private textureManager: TextureManager;
    private computePipeline: ComputePipeline;
    private renderPipeline: RenderPipeline;
    private renderer: Renderer;
    private pixelCache: PixelCache;
    private cacheDebugger: CacheDebugger;
    private performanceMonitor: PerformanceMonitor;

    private currentSample: number = 0;
    private maxSamples: number = 0;
    private isAccumulating: boolean = false;

    private logger: Logger;
    private initialized: boolean = false;

    constructor() {
        this.logger = Logger.getInstance();
        this.logger.init('Erstelle WebGPU Raytracer App...');

        this.canvas = document.getElementById(CANVAS_CONFIG.ID) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas mit ID '${CANVAS_CONFIG.ID}' nicht gefunden`);
        }

        this.statusDisplay = new StatusDisplay(STATUS_CONFIG.ELEMENT_ID);
        this.performanceMonitor = new PerformanceMonitor();

        this.logger.init(`Canvas gefunden: ${this.canvas.width}x${this.canvas.height}`);

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

    public async initialize(): Promise<void> {
        if (this.initialized) {
            this.logger.warning('App bereits initialisiert');
            return;
        }

        try {
            this.statusDisplay.showInfo('WebGPU Raytracer wird initialisiert...');

            this.logger.init('Initialisiere WebGPU...');
            await this.webgpuDevice.initialize(this.canvas);

            this.logger.init('Erstelle Three.js Szene...');
            this.scene.initialize();
            this.scene.updateCameraAspect(this.canvas.width, this.canvas.height);

            this.logger.init('Erstelle GPU-Ressourcen...');

            this.textureManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height
            );

            const lightPosition = this.scene.getPrimaryLightPosition();
            const ambientIntensity = this.scene.getAmbientIntensity();

            this.bufferManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height,
                this.scene.getCameraData(),
                this.scene.getSpheresData(),
                lightPosition,
                ambientIntensity
            );

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

            this.logger.init('Initialisiere Renderer...');
            this.renderer.initialize(
                this.webgpuDevice.getDevice(),
                this.webgpuDevice.getContext(),
                this.computePipeline.getPipeline(),
                this.renderPipeline.getPipeline(),
                this.computePipeline.getBindGroup(),
                this.renderPipeline.getBindGroup()
            );

            this.performanceMonitor.initialize();

            this.initialized = true;
            this.logger.init('Rendere ersten Frame...');
            await this.renderFrame();

            this.statusDisplay.showSuccess('✅ WebGPU Raytracer mit Three.js läuft!');
            this.logger.success('Initialisierung erfolgreich abgeschlossen');

        } catch (error) {
            this.logger.error('Fehler bei Initialisierung:', error);
            this.statusDisplay.showError(`❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
            throw error;
        }
    }

    /**
     * 🎬 Einzelnen Frame rendern (mit Performance-Tracking)
     */
    public async renderFrame(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        const startTime = performance.now();
        await this.renderer.renderFrame(this.canvas);

        // ⭐ WICHTIG: Warten bis GPU fertig ist!
        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();

        const frameTime = performance.now() - startTime;

        this.performanceMonitor.recordFrameTime(frameTime);

        // Jetzt Cache-Statistiken lesen (GPU ist jetzt fertig!)
        await this.pixelCache.readStatistics();
        const cacheStats = this.pixelCache.getStatistics();
        this.performanceMonitor.recordCacheStats(cacheStats);
    }

    /**
     * 🔲 Sphere Grid für Performance-Tests erstellen
     */
    public createSphereGrid(gridSize: number): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.info(`Erstelle ${gridSize}³ Kugel-Grid...`);

        this.scene.generateSphereGrid(gridSize);
        this.bufferManager.updateSpheresFromScene(this.scene);

        const sphereCount = this.scene.getSphereCount();
        this.bufferManager.updateRenderInfo(
            this.canvas.width,
            this.canvas.height,
            sphereCount
        );

        this.resetCache();
        this.performanceMonitor.reset();

        this.logger.success(`Grid erstellt: ${sphereCount} Kugeln`);
    }

    /**
     * 🔲 Sphere Wall für Performance-Tests
     */
    public createSphereWall(width: number, height: number): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.info(`Erstelle ${width}x${height} Kugel-Wand...`);

        this.scene.generateSphereWall(width, height);
        this.bufferManager.updateSpheresFromScene(this.scene);

        const sphereCount = this.scene.getSphereCount();
        this.bufferManager.updateRenderInfo(
            this.canvas.width,
            this.canvas.height,
            sphereCount
        );

        this.resetCache();
        this.performanceMonitor.reset();

        this.logger.success(`Wand erstellt: ${sphereCount} Kugeln`);
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
     * 📊 Performance-Statistiken anzeigen
     */
    public showPerformanceStats(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.performanceMonitor.logDetailedStats();

        const rating = this.performanceMonitor.getPerformanceRating();
        console.log(`\n${rating.message}\n`);
    }

    /**
     * 👁️ Performance-Display umschalten
     */
    public togglePerformanceDisplay(visible?: boolean): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        if (visible === undefined) {
            const stats = this.performanceMonitor.getStats();
            visible = stats.fps.current === 0;
        }

        this.performanceMonitor.toggleDisplay(visible);
    }

    /**
     * 🔄 Cache zurücksetzen
     */
    public async resetCache(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.pixelCache.reset();

        // ⭐ WICHTIG: Warten bis GPU den Cache wirklich gelöscht hat!
        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();

        this.logger.info('Cache zurückgesetzt');
    }

    /**
     * 🎨 Progressive Supersampling starten
     */
    public async startProgressiveSupersampling(maxSamples: number = 16): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.info(`🎨 Starte Progressive Supersampling: ${maxSamples} samples`);

        this.bufferManager.resetAccumulation(this.canvas.width, this.canvas.height);
        this.currentSample = 0;
        this.maxSamples = maxSamples;
        this.isAccumulating = true;

        const startTime = performance.now();

        for (let sample = 0; sample < maxSamples; sample++) {
            this.currentSample = sample + 1;

            const baseCameraData = this.scene.getCameraData();
            this.bufferManager.updateCameraDataWithRandomSeeds(baseCameraData, sample);

            await this.renderFrame();

            if (sample % 4 === 0 || sample === maxSamples - 1) {
                const progress = ((sample + 1) / maxSamples * 100).toFixed(0);
                this.statusDisplay.showInfo(
                    `🎨 Supersampling: ${sample + 1}/${maxSamples} (${progress}%)`
                );
            }

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
     * 📊 Performance Monitor abrufen
     */
    public getPerformanceMonitor(): PerformanceMonitor {
        return this.performanceMonitor;
    }

    /**
     * 🔄 Buffer Manager für direkten Zugriff (für main.ts)
     */
    public getBufferManager(): BufferManager {
        return this.bufferManager;
    }

    /**
     * 📊 App-Status abrufen
     */
    public getStatus(): {
        initialized: boolean;
        frameCount: number;
        canvasSize: { width: number; height: number };
        sphereCount: number;
    } {
        return {
            initialized: this.initialized,
            frameCount: this.initialized ? this.renderer.getFrameCount() : 0,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            sphereCount: this.initialized ? this.scene.getSphereCount() : 0
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

        if (this.scene) {
            this.scene.cleanup();
        }

        if (this.performanceMonitor) {
            this.performanceMonitor.cleanup();
        }

        this.initialized = false;
        this.logger.info('✅ Cleanup abgeschlossen');
    }
}