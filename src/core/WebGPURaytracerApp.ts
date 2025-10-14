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
import * as THREE from 'three';

/**
 * 🎯 WebGPURaytracerApp - Haupt-App mit Three.js Scene Integration
 */
export class WebGPURaytracerApp {
    // ===== DOM-ELEMENTE =====
    private canvas: HTMLCanvasElement;
    private statusDisplay: StatusDisplay;

    // ===== SUBSYSTEME =====
    private webgpuDevice: WebGPUDevice;
    public scene: Scene;  // public für direkten Zugriff in Scene.ts
    private bufferManager: BufferManager;
    private textureManager: TextureManager;
    private computePipeline: ComputePipeline;
    private renderPipeline: RenderPipeline;
    private renderer: Renderer;
    private pixelCache: PixelCache;
    private cacheDebugger: CacheDebugger;

    // ===== SUPERSAMPLING STATE =====
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

        this.canvas = document.getElementById(CANVAS_CONFIG.ID) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas mit ID '${CANVAS_CONFIG.ID}' nicht gefunden`);
        }

        this.statusDisplay = new StatusDisplay(STATUS_CONFIG.ELEMENT_ID);
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

            // ⭐ Three.js Daten für Buffer holen
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
            this.statusDisplay.showSuccess('✅ WebGPU Raytracer mit Three.js läuft!');
            this.logger.success('Initialisierung erfolgreich abgeschlossen');

        } catch (error) {
            this.logger.error('Fehler bei Initialisierung:', error);
            this.statusDisplay.showError(`❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CACHE & RENDERING METHODEN
    // ═══════════════════════════════════════════════════════════════════════════

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

            await this.renderer.renderFrame(this.canvas);

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

        this.initialized = false;
        this.logger.info('✅ Cleanup abgeschlossen');
    }
}