import { WebGPUDevice } from './WebGPUDevice';
import { Scene } from '../scene/Scene';
import { BufferManager } from '../rendering/BufferManager';
import { TextureManager } from '../rendering/TextureManager';
import { ComputePipeline } from './ComputePipeline';
import { RenderPipeline } from './RenderPipeline';
import { Renderer } from '../rendering/Renderer';
import { PixelCache } from '../cache/PixelCache';
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
    private performanceMonitor: PerformanceMonitor;

    private currentSample: number = 0;
    private maxSamples: number = 0;
    private isAccumulating: boolean = false;

    // Bewegungs-Tracking Eigenschaften
    private movementTrackingEnabled: boolean = true;
    private movementStats = {
        totalMovements: 0,
        totalInvalidations: 0,
        lastMovementFrame: 0
    };

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

        // Bewegungen tracken 
        if (this.movementTrackingEnabled) {
            const movedSpheres = this.scene.trackMovements();

            if (movedSpheres.length > 0) {
                this.logger.info(`Bewegte Objekte: ${movedSpheres.length} (${movedSpheres.slice(0, 3).join(', ')}${movedSpheres.length > 3 ? '...' : ''})`);

                // Cache für bewegte Objekte invalidieren
                const invalidationStartTime = performance.now();

                movedSpheres.forEach(sphereIndex => {
                    this.bufferManager.invalidatePixelsForSphere(sphereIndex);
                });

                const invalidationTime = performance.now() - invalidationStartTime;

                // Statistiken aktualisieren
                this.movementStats.totalMovements += movedSpheres.length;
                this.movementStats.totalInvalidations++;
                this.movementStats.lastMovementFrame = this.renderer.getFrameCount();

                this.logger.cache(
                    `Cache-Invalidierung: ${movedSpheres.length} Objekte in ${invalidationTime.toFixed(2)}ms`
                );
            }
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

    // Bewegungs-Tracking Konfiguration
    public enableMovementTracking(enabled: boolean): void {
        this.movementTrackingEnabled = enabled;

        if (enabled) {
            this.logger.info('Bewegungs-Tracking aktiviert');
        } else {
            this.logger.info('Bewegungs-Tracking deaktiviert');
            this.scene.clearMovementTracking();
        }
    }

    // Bewegungs-Statistiken abrufen
    public getMovementStats(): {
        totalMovements: number;
        totalInvalidations: number;
        lastMovementFrame: number;
        movementTrackingEnabled: boolean;
        sceneMovementInfo: { totalMoved: number; currentlyTracked: number };
        invalidationStats: any;
    } {
        return {
            ...this.movementStats,
            movementTrackingEnabled: this.movementTrackingEnabled,
            sceneMovementInfo: this.scene.getMovementInfo(),
            invalidationStats: this.bufferManager.getInvalidationStats()
        };
    }

    // Detaillierte Bewegungs-Statistiken loggen
    public logMovementStats(): void {
        const stats = this.getMovementStats();

        console.log('\n' + '='.repeat(60));
        console.log('📊 BEWEGUNGS-TRACKING STATISTIKEN');
        console.log('='.repeat(60));
        console.log(`Tracking aktiviert:       ${stats.movementTrackingEnabled ? 'JA' : 'NEIN'}`);
        console.log(`Gesamt Bewegungen:        ${stats.totalMovements}`);
        console.log(`Invalidierungen:          ${stats.totalInvalidations}`);
        console.log(`Letzte Bewegung (Frame):  ${stats.lastMovementFrame}`);
        console.log(`Aktuell getrackte Objekte: ${stats.sceneMovementInfo.currentlyTracked}`);
        console.log(`Insgesamt bewegte Objekte: ${stats.sceneMovementInfo.totalMoved}`);

        const invalidationStats = stats.invalidationStats;
        console.log('\n--- Cache-Invalidierung ---');
        console.log(`Totale Invalidierungen:   ${invalidationStats.totalInvalidations}`);
        console.log(`Invalidierte Pixel:       ${invalidationStats.pixelsInvalidated.toLocaleString()}`);
        console.log(`Ø Pixel pro Invalidierung: ${invalidationStats.avgPixelsPerInvalidation.toFixed(0)}`);
        console.log(`Letzte Invalidierung:     ${invalidationStats.lastInvalidationTime.toFixed(2)}ms`);
        console.log('='.repeat(60));
    }

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

    public async showCacheStatistics(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        await this.pixelCache.logStatisticsWithRead(this.renderer.getFrameCount());
    }

    public showPerformanceStats(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.performanceMonitor.logDetailedStats();

        const rating = this.performanceMonitor.getPerformanceRating();
        console.log(`\n${rating.message}\n`);
    }

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

    public async resetCache(): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.pixelCache.reset();

        // BufferManager cache reset mit korrekten Dimensionen
        this.bufferManager.resetCache(this.canvas.width, this.canvas.height);

        // Invalidierung-Statistiken zurücksetzen
        this.bufferManager.resetInvalidationStats();

        await this.webgpuDevice.getDevice().queue.onSubmittedWorkDone();

        this.logger.info('Cache zurückgesetzt (6 float32 Struktur)');
    }

    public async startProgressiveSupersampling(maxSamples: number = 16): Promise<void> {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.logger.info(`Starte Progressive Supersampling: ${maxSamples} samples`);

        this.bufferManager.resetAccumulation(this.canvas.width, this.canvas.height);
        this.currentSample = 0;
        this.maxSamples = maxSamples;
        this.isAccumulating = true;

        const startTime = performance.now();

        for (let sample = 0; sample < maxSamples; sample++) {
            this.currentSample = sample + 1;

            const baseCameraData = this.scene.getCameraData();
            this.bufferManager.updateCameraDataWithRandomSeeds(baseCameraData, sample);

            if (sample % 4 === 0 || sample === maxSamples - 1) {
                const progress = ((sample + 1) / maxSamples * 100).toFixed(0);
                this.statusDisplay.showInfo(
                    `Supersampling: ${sample + 1}/${maxSamples} (${progress}%)`
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
            `Supersampling abgeschlossen: ${maxSamples} samples in ${totalTime.toFixed(0)}ms ` +
            `(${avgTimePerSample.toFixed(1)}ms/sample)`
        );

        this.statusDisplay.showSuccess(
            `${maxSamples}x Supersampling abgeschlossen (${totalTime.toFixed(0)}ms)`
        );
    }

    public resetAccumulation(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        this.bufferManager.resetAccumulation(this.canvas.width, this.canvas.height);
        this.currentSample = 0;
        this.isAccumulating = false;

        this.logger.info('Accumulation zurückgesetzt');
    }

    public getPerformanceMonitor(): PerformanceMonitor {
        return this.performanceMonitor;
    }

    public getBufferManager(): BufferManager {
        return this.bufferManager;
    }

    public getStatus(): {
        initialized: boolean;
        frameCount: number;
        canvasSize: { width: number; height: number };
        sphereCount: number;
        movementTracking: boolean;
    } {
        return {
            initialized: this.initialized,
            frameCount: this.initialized ? this.renderer.getFrameCount() : 0,
            canvasSize: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            sphereCount: this.initialized ? this.scene.getSphereCount() : 0,
            movementTracking: this.movementTrackingEnabled
        };
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