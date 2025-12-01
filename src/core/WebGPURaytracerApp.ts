// src/core/WebGPURaytracerApp.ts - Clean WebGPU Raytracer

import { WebGPUDevice } from './WebGPUDevice';
import { Scene } from '../scene/Scene';
import { BufferManager } from '../rendering/BufferManager';
import { TextureManager } from '../rendering/TextureManager';
import { ComputePipeline } from './ComputePipeline';
import { RenderPipeline } from './RenderPipeline';
import { Renderer } from '../rendering/Renderer';
import { Cache } from '../cache/Cache';
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
    public pixelCache: Cache;
    private performanceMonitor: PerformanceMonitor;

    private logger: Logger;
    private initialized: boolean = false;

    private frameCounter: number = 0;

    constructor() {
        this.logger = Logger.getInstance();

        this.canvas = document.getElementById(CANVAS_CONFIG.ID) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas mit ID '${CANVAS_CONFIG.ID}' nicht gefunden`);
        }

        this.statusDisplay = new StatusDisplay(STATUS_CONFIG.ELEMENT_ID);
        this.performanceMonitor = new PerformanceMonitor();

        this.webgpuDevice = new WebGPUDevice();
        this.scene = new Scene();
        this.bufferManager = new BufferManager();
        this.textureManager = new TextureManager();
        this.computePipeline = new ComputePipeline();
        this.renderPipeline = new RenderPipeline();
        this.renderer = new Renderer();
        this.pixelCache = new Cache();
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            this.statusDisplay.showInfo('WebGPU Raytracer wird initialisiert...');

            await this.webgpuDevice.initialize(this.canvas);
            this.scene.initialize();
            this.scene.updateCameraAspect(this.canvas.width, this.canvas.height);

            this.textureManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height
            );

            const lightPosition = this.scene.getPrimaryLightPosition();
            const ambientIntensity = this.scene.getAmbientIntensity();
            const groundY = this.scene.getGroundY();

            this.bufferManager.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height,
                this.scene.getCameraData(),
                this.scene.getSpheresData(),
                lightPosition,
                ambientIntensity,
                groundY
            );

            this.pixelCache.initialize(
                this.webgpuDevice.getDevice(),
                this.canvas.width,
                this.canvas.height,
                this.bufferManager.getCacheBuffer()
            );

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

            this.renderer.initialize(
                this.webgpuDevice.getDevice(),
                this.webgpuDevice.getContext(),
                this.computePipeline.getPipeline(),
                this.renderPipeline.getPipeline(),
                this.computePipeline.getBindGroup(),
                this.renderPipeline.getBindGroup()
            );

            this.performanceMonitor.initialize();
            this.pixelCache.reset();

            this.initialized = true;
            await this.renderFrame();

            this.statusDisplay.showSuccess('WebGPU Raytracer läuft!');

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

        this.frameCounter++;

        // Update animation if active
        const isAnimating = this.scene.isAnimating();
        if (isAnimating) {
            this.scene.updateAnimation();
        }

        // Update spheres buffer with current Three.js positions
        // Jetzt mit automatischer Cache-Invalidation!
        await this.bufferManager.updateSpheresFromScene(this.scene);

        const startTime = performance.now();
        await this.renderer.renderFrame(this.canvas);
        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();

        const frameTime = performance.now() - startTime;
        this.performanceMonitor.recordFrameTime(frameTime);

        await this.pixelCache.readStatistics();
        const cacheStats = this.pixelCache.getStatistics();
        this.performanceMonitor.recordCacheStats(cacheStats);

        // Periodically log instrumentation (every 60 frames)
        if (this.frameCounter % 60 === 0) {
            try {
                const writeCalls = this.bufferManager.getInvalidationWriteBufferCount();
                console.log(`🔧 invalidation writeBuffer calls (last 60 frames): ${writeCalls}`);
                this.bufferManager.resetInvalidationWriteBufferCount();
            } catch (e) {
                // ignore
            }
        }

        // Removed excessive debug logging
    }

    public resetCache(): void {
        this.pixelCache.reset();
        this.frameCounter = 0;
    }

    public getBufferManager(): BufferManager {
        return this.bufferManager;
    }

    public getPixelCache(): Cache {
        return this.pixelCache;
    }

    public cleanup(): void {
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
    }
}