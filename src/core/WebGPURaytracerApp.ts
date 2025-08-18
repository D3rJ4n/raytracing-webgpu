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
                this.scene.getSphereData()
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
}