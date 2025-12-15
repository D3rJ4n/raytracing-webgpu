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
import { CANVAS_CONFIG, STATUS_CONFIG } from '../utils/Constants';
import { SphereEditor } from '../ui/SphereEditor';
import { CameraController } from '../ui/CameraController';

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
    private cameraController: CameraController | null = null;
    private sphereEditor: SphereEditor | null = null;


    private logger: Logger;
    private initialized: boolean = false;

    private frameCounter: number = 0;
    private scheduledRenderRequest: number | null = null;

    constructor() {
        this.logger = Logger.getInstance();

        this.canvas = document.getElementById(CANVAS_CONFIG.ID) as HTMLCanvasElement;
        if (!this.canvas) {
            throw new Error(`Canvas mit ID '${CANVAS_CONFIG.ID}' nicht gefunden`);
        }

        this.statusDisplay = new StatusDisplay(STATUS_CONFIG.ELEMENT_ID);

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

            // ⚡ Registriere Pipelines und TextureManager in BufferManager für BindGroup Updates
            this.bufferManager.registerComputePipeline(this.computePipeline);
            this.bufferManager.registerTextureManager(this.textureManager);
            this.bufferManager.registerRenderer(this.renderer);

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

            this.pixelCache.reset();

            // UI Controllers: Kamera- und Kugel-Editor initialisieren
            this.cameraController = new CameraController(this.scene, () => {
                try {
                    // Update Camera buffer und Invalidation (synchron)
                    this.bufferManager.updateCameraData(this.scene.getCameraData());
                    // Invalidation wird asynchron im Hintergrund ausgeführt
                    this.bufferManager.invalidateForSceneChanges(this.scene, { type: 'structural' }).catch(e => {
                        this.logger.error('Fehler beim Camera-Invalidation', e);
                    });

                    // Request a non-recursive render (schedules via requestAnimationFrame)
                    this.requestRender();
                } catch (e) {
                    this.logger.error('Fehler beim CameraController callback', e);
                }
            });

            this.sphereEditor = new SphereEditor(this.scene, this.canvas, (sphereIndex: number) => {
                try {
                    // Apply immediate GPU update for the changed sphere (asynchron)
                    this.bufferManager.updateSpheresFromScene(this.scene, { type: 'geometry', sphereIndex }).catch(e => {
                        this.logger.error('Fehler beim Sphere-Update', e);
                    });

                    // Schedule a render so UI changes become visible without recursion
                    this.requestRender();
                } catch (e) {
                    this.logger.error('Fehler beim SphereEditor callback', e);
                }
            });

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

        // Allow camera controller to apply continuous movement for held keys
        if (this.cameraController) {
            try {
                this.cameraController.update();
            } catch (e) {
                this.logger.error('Fehler beim CameraController.update()', e);
            }
        }

        // Update animation if active
        const isAnimating = this.scene.isAnimating();
        if (isAnimating) {
            this.scene.updateAnimation();
        }

        // Update spheres buffer with current Three.js positions
        // Jetzt mit automatischer Cache-Invalidation!
        // console.log(`\n🎬 FRAME ${this.frameCounter}: Starting buffer update...`);
        await this.bufferManager.updateSpheresFromScene(this.scene);
        //console.log(`📦 Buffer update complete`);

        await this.renderer.renderFrame(this.canvas);
        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();
        //console.log(`✅ Render complete\n`);
        // Cache stats readback disabled by default to avoid map/submit races
        // await this.pixelCache.readStatistics();

        // Periodically log instrumentation (every 60 frames)
        if (this.frameCounter % 60 === 0) {
            try {
                const writeCalls = this.bufferManager.getInvalidationWriteBufferCount();
                // console.log(`🔧 invalidation writeBuffer calls (last 60 frames): ${writeCalls}`);
                this.bufferManager.resetInvalidationWriteBufferCount();
            } catch (e) {
                // ignore
            }
        }

        // Removed excessive debug logging

        // If camera keys are still held, schedule another frame to continue movement
        if (this.cameraController && this.cameraController.hasActiveKeys()) {
            this.requestRender();
        }
    }

    /**
     * Schedules a safe render via requestAnimationFrame. Multiple calls are coalesced.
     */
    public requestRender(): void {
        if (this.scheduledRenderRequest !== null) return;

        this.scheduledRenderRequest = requestAnimationFrame(async () => {
            this.scheduledRenderRequest = null;
            try {
                await this.renderFrame();
            } catch (e) {
                this.logger.error('Fehler in scheduled renderFrame', e);
            }
        });
    }

    public resetCache(): void {
        this.pixelCache.reset();
        // NICHT forceNextUpdate() - wir wollen nur Cache leeren, nicht Buffer updaten!
        this.bufferManager.resetInvalidationStats(); // MovementTracker resetten
        this.frameCounter = 0;
        // console.log(`🔄 Cache zurückgesetzt`);
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

        if (this.cameraController) {
            this.cameraController.cleanup();
            this.cameraController = null;
        }

        if (this.sphereEditor) {
            this.sphereEditor.cleanup();
            this.sphereEditor = null;
        }

        this.initialized = false;
    }
}