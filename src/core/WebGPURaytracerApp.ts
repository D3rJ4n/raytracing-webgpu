// src/core/WebGPURaytracerApp.ts

import { WebGPUDevice } from './WebGPUDevice';
import { Scene } from '../scene/Scene';
import { BufferManager } from '../rendering/BufferManager';
import { TextureManager } from '../rendering/TextureManager';
import { ComputePipeline } from './ComputePipeline';
import { RenderPipeline } from './RenderPipeline';
import { Renderer } from '../rendering/Renderer';
import { GeometryPixelCache } from '../cache/Cache';
import { StatusDisplay } from '../utils/StatusDisplay';
import { Logger } from '../utils/Logger';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { CANVAS_CONFIG, STATUS_CONFIG } from '../utils/Constants';

export class WebGPURaytracerApp {
    private canvas: HTMLCanvasElement;
    private statusDisplay: StatusDisplay;

    private webgpuDevice: WebGPUDevice;
    public scene: Scene;
    public bufferManager: BufferManager;
    private textureManager: TextureManager;
    private computePipeline: ComputePipeline;
    private renderPipeline: RenderPipeline;
    private renderer: Renderer;
    public pixelCache: GeometryPixelCache;
    private performanceMonitor: PerformanceMonitor;

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
        this.pixelCache = new GeometryPixelCache();
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

            this.statusDisplay.showSuccess('WebGPU Raytracer mit Three.js läuft!');
            this.logger.success('Initialisierung erfolgreich abgeschlossen');

        } catch (error) {
            this.logger.error('Fehler bei Initialisierung:', error);
            this.statusDisplay.showError(`Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`);
            throw error;
        }
    }

    public async renderFrame(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        // Use the new intelligent cache invalidation
        try {
            await this.bufferManager.invalidateForSceneChanges(this.scene);
        } catch (error) {
            this.logger.error('Cache invalidation failed:', error);
            // Continue with rendering even if invalidation fails
        }

        const startTime = performance.now();
        await this.renderer.renderFrame(this.canvas);

        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();

        const frameTime = performance.now() - startTime;
        this.performanceMonitor.recordFrameTime(frameTime);

        await this.pixelCache.readStatistics();
        const cacheStats = this.pixelCache.getStatistics();
        this.performanceMonitor.recordCacheStats(cacheStats);
    }

    public getBufferManager(): BufferManager {
        return this.bufferManager;
    }

    public getPixelCache(): GeometryPixelCache {
        return this.pixelCache;
    }

    public cleanup(): void {
        this.logger.info('Räume Ressourcen auf...');

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
        this.logger.info('Cleanup abgeschlossen');
    }
}