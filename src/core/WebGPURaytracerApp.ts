// src/core/WebGPURaytracerApp.ts

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

            // Setup Console Commands
            this.setupConsoleCommands();

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
        console.log(`Totale Invalidierungen:   ${invalidationStats.totalInvalidations || 0}`);
        console.log(`Invalidierte Pixel:       ${(invalidationStats.pixelsInvalidated || 0).toLocaleString()}`);
        console.log(`Ø Pixel pro Invalidierung: ${(invalidationStats.avgPixelsPerInvalidation || 0).toFixed(0)}`);
        console.log(`Letzte Invalidierung:     ${(invalidationStats.lastInvalidationTime || 0).toFixed(2)}ms`);
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

    // Neue Methode für detaillierte Cache-Statistiken
    public showDetailedCacheStats(): void {
        if (!this.initialized) {
            throw new Error('App nicht initialisiert');
        }

        console.log('\n' + '='.repeat(80));
        console.log('📊 DETAILLIERTE CACHE-STATISTIKEN');
        console.log('='.repeat(80));

        // Cache-Invalidierung Statistiken
        console.log('\n--- CACHE-INVALIDIERUNG ---');
        this.bufferManager.logInvalidationStats();

        // Pixel-Cache Statistiken
        console.log('\n--- PIXEL-CACHE ---');
        const pixelStats = this.pixelCache.getStatistics();
        console.log(`Hit Rate: ${pixelStats.hitRate.toFixed(1)}%`);
        console.log(`Hits: ${pixelStats.cacheHits.toLocaleString()}`);
        console.log(`Misses: ${pixelStats.cacheMisses.toLocaleString()}`);
        console.log(`Total Pixel: ${pixelStats.totalPixels.toLocaleString()}`);

        // Performance Statistiken
        console.log('\n--- PERFORMANCE ---');
        this.performanceMonitor.logDetailedStats();

        console.log('\n' + '='.repeat(80));
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

    // ===== NEUE DEBUG-METHODEN =====

    public debugIntelligentCache = async () => {
        console.log('\n=== INTELLIGENTE CACHE-INVALIDIERUNG DEBUG ===');

        if (!this.initialized) {
            console.error('App nicht initialisiert');
            return;
        }

        // 1. Cache zurücksetzen
        console.log('1. Cache zurücksetzen...');
        await this.resetCache();

        // 2. Ersten Frame rendern (clean cache)
        console.log('2. Ersten Frame rendern (Clean Cache)...');
        await this.renderFrame();
        console.log('   -> Alle Pixel sollten Cache-Miss sein');

        // 3. Cache-Statistiken nach erstem Frame
        this.showDetailedCacheStats();

        // 4. Zweiten Frame rendern (keine Bewegung = Cache-Hit)
        console.log('3. Zweiten Frame rendern (Keine Bewegung)...');
        await this.renderFrame();
        console.log('   -> Meiste Pixel sollten Cache-Hit sein');

        // 5. Cache-Statistiken nach zweitem Frame
        this.showDetailedCacheStats();

        // 6. Sphere bewegen und Frame rendern
        console.log('4. Sphere bewegen und Frame rendern...');

        // Eine Sphere bewegen (falls verfügbar)
        const spheres = this.scene.getThreeScene().children.filter(child => child.type === 'Mesh');
        if (spheres.length > 0) {
            const sphere = spheres[0] as any;
            const oldPos = sphere.position.clone();
            sphere.position.x += 1.0; // 1 Einheit verschieben

            console.log(`   Sphere bewegt von (${oldPos.x}, ${oldPos.y}, ${oldPos.z}) zu (${sphere.position.x}, ${sphere.position.y}, ${sphere.position.z})`);

            await this.renderFrame();
            console.log('   -> Nur Pixel um bewegte Sphere sollten Cache-Miss sein');

            // Position zurücksetzen
            sphere.position.copy(oldPos);
        } else {
            console.log('   Keine Spheres zum Bewegen gefunden');
        }

        // 7. Finale Cache-Statistiken
        console.log('5. Finale Cache-Statistiken...');
        this.showDetailedCacheStats();

        console.log('\n=== INTELLIGENTE CACHE DEBUG ABGESCHLOSSEN ===');
    };

    public intelligentCachePerformanceTest = async (iterations: number = 10) => {
        if (!this.initialized) {
            console.error('App nicht verfügbar');
            return;
        }

        console.log('\n' + '='.repeat(70));
        console.log(`🚀 INTELLIGENTE CACHE-PERFORMANCE TEST: ${iterations} Iterationen`);
        console.log('='.repeat(70));

        const results = {
            staticSceneTimes: [] as number[],
            movingSceneTimes: [] as number[],
            staticHitRates: [] as number[],
            movingHitRates: [] as number[]
        };

        // Test 1: Statische Szene (maximaler Cache-Nutzen)
        console.log('\n--- TEST 1: STATISCHE SZENE ---');
        this.scene.stopCameraRotation(); // Kamera-Bewegung stoppen

        for (let i = 0; i < iterations; i++) {
            await this.resetCache();

            // Warm-up Frame
            await this.renderFrame();

            // Gemessener Frame
            const startTime = performance.now();
            await this.renderFrame();
            const frameTime = performance.now() - startTime;

            results.staticSceneTimes.push(frameTime);

            const stats = this.pixelCache.getStatistics();
            results.staticHitRates.push(stats.hitRate);

            console.log(`Iteration ${i + 1}: ${frameTime.toFixed(2)}ms, Hit Rate: ${stats.hitRate.toFixed(1)}%`);

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Test 2: Bewegte Szene (reduzierter Cache-Nutzen)
        console.log('\n--- TEST 2: BEWEGTE SZENE ---');

        for (let i = 0; i < iterations; i++) {
            await this.resetCache();

            // Sphere(s) bewegen
            const spheres = this.scene.getThreeScene().children.filter(child => child.type === 'Mesh');
            if (spheres.length > 0) {
                const moveAmount = 0.1; // Kleine Bewegung
                spheres.forEach((sphere: any, index) => {
                    if (index < 3) { // Nur erste 3 Spheres bewegen
                        sphere.position.x += moveAmount * Math.sin(i * 0.5 + index);
                        sphere.position.z += moveAmount * Math.cos(i * 0.5 + index);
                    }
                });
            }

            // Warm-up Frame
            await this.renderFrame();

            // Gemessener Frame
            const startTime = performance.now();
            await this.renderFrame();
            const frameTime = performance.now() - startTime;

            results.movingSceneTimes.push(frameTime);

            const stats = this.pixelCache.getStatistics();
            results.movingHitRates.push(stats.hitRate);

            console.log(`Iteration ${i + 1}: ${frameTime.toFixed(2)}ms, Hit Rate: ${stats.hitRate.toFixed(1)}%`);

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Ergebnisse analysieren
        const avgStaticTime = results.staticSceneTimes.reduce((a, b) => a + b, 0) / results.staticSceneTimes.length;
        const avgMovingTime = results.movingSceneTimes.reduce((a, b) => a + b, 0) / results.movingSceneTimes.length;
        const avgStaticHitRate = results.staticHitRates.reduce((a, b) => a + b, 0) / results.staticHitRates.length;
        const avgMovingHitRate = results.movingHitRates.reduce((a, b) => a + b, 0) / results.movingHitRates.length;

        const cacheEfficiency = avgStaticTime > avgMovingTime ? avgMovingTime / avgStaticTime : 1.0;

        console.log('\n' + '='.repeat(50));
        console.log('📊 INTELLIGENTE CACHE ANALYSE:');
        console.log('='.repeat(50));
        console.log(`Statische Szene:`);
        console.log(`  Ø Zeit:      ${avgStaticTime.toFixed(2)}ms`);
        console.log(`  Ø Hit Rate:  ${avgStaticHitRate.toFixed(1)}%`);
        console.log(`Bewegte Szene:`);
        console.log(`  Ø Zeit:      ${avgMovingTime.toFixed(2)}ms`);
        console.log(`  Ø Hit Rate:  ${avgMovingHitRate.toFixed(1)}%`);
        console.log(`Cache-Effizienz: ${(cacheEfficiency * 100).toFixed(1)}%`);
        console.log('='.repeat(50));

        let rating = '';
        if (avgStaticHitRate > 90 && avgMovingHitRate > 70) {
            rating = '🏆 AUSGEZEICHNET - Intelligente Invalidierung funktioniert optimal';
        } else if (avgStaticHitRate > 80 && avgMovingHitRate > 50) {
            rating = '✅ GUT - Cache arbeitet effizient';
        } else if (avgStaticHitRate > 60 && avgMovingHitRate > 30) {
            rating = '⚠️ AKZEPTABEL - Cache funktioniert, aber verbesserungswürdig';
        } else {
            rating = '❌ PROBLEMATISCH - Cache-System benötigt Optimierung';
        }

        console.log(`\nCache-Performance: ${rating}`);

        // Invalidierung-Statistiken anzeigen
        console.log('\n--- INVALIDIERUNG STATISTIKEN ---');
        this.bufferManager.logInvalidationStats();

        return {
            avgStaticTime,
            avgMovingTime,
            avgStaticHitRate,
            avgMovingHitRate,
            cacheEfficiency,
            rating
        };
    };

    // ===== CONSOLE COMMANDS SETUP =====

    private setupConsoleCommands(): void {
        // Bestehende Commands
        (window as any).app = this;

        (window as any).renderFrame = async () => {
            const startTime = performance.now();
            await this.renderFrame();
            const renderTime = performance.now() - startTime;
            console.log(`🎬 Frame: ${renderTime.toFixed(1)}ms`);
        };

        (window as any).togglePerf = () => {
            this.togglePerformanceDisplay();
            console.log('Performance-Display umgeschaltet');
        };

        (window as any).resetCache = async () => {
            console.log('🗑️  Cache reset');
            await this.resetCache();
        };

        (window as any).benchmark = async (frames = 100) => {
            console.log(`\n=== 🎯 BENCHMARK: ${frames} Frames ===\n`);

            this.performanceMonitor.reset();

            console.log('Starte Benchmark...');
            const startTime = performance.now();

            for (let i = 0; i < frames; i++) {
                await this.renderFrame();

                if (i % 10 === 0) {
                    const progress = ((i / frames) * 100).toFixed(0);
                    console.log(`Progress: ${i}/${frames} (${progress}%)`);
                }
            }

            const totalTime = performance.now() - startTime;
            const avgFrameTime = totalTime / frames;
            const avgFPS = 1000 / avgFrameTime;

            console.log('\n' + '='.repeat(60));
            console.log('📊 BENCHMARK ERGEBNIS:');
            console.log('='.repeat(60));
            console.log(`Frames gerendert:     ${frames}`);
            console.log(`Gesamtzeit:           ${totalTime.toFixed(2)} ms`);
            console.log(`Ø Frame-Zeit:         ${avgFrameTime.toFixed(2)} ms`);
            console.log(`Ø FPS:                ${avgFPS.toFixed(1)}`);
            console.log('='.repeat(60));

            const stats = this.performanceMonitor.getStats();
            console.log(`Cache Hit Rate:       ${stats.cache.hitRate.toFixed(1)}%`);
        };

        (window as any).rotateCamera = () => {
            this.scene.startCameraRotation();
            console.log('🎬 Kamera-Rotation gestartet!');
            console.log('💡 Nutze renderLoop() um kontinuierlich zu rendern');
        };

        (window as any).stopCamera = () => {
            this.scene.stopCameraRotation();
            console.log('⏸️ Kamera-Rotation gestoppt');
        };

        (window as any).setSpeed = (speed: number) => {
            this.scene.setRotationSpeed(speed);
            console.log(`⚙️ Rotations-Geschwindigkeit: ${speed}°/Frame`);
        };

        (window as any).renderLoop = async (maxFrames = 360) => {
            console.log(`\n🎬 Starte Render-Loop (max ${maxFrames} Frames)`);

            this.performanceMonitor.reset();

            for (let i = 0; i < maxFrames; i++) {
                const cameraMoved = this.scene.updateCamera();

                if (cameraMoved) {
                    const newCameraData = this.scene.getCameraData();
                    this.bufferManager.updateCameraData(newCameraData);
                }

                await this.renderFrame();

                await new Promise(r => setTimeout(r, 16));

                if (i % 90 === 0 && i > 0) {
                    const stats = this.performanceMonitor.getStats();
                    console.log(`Frame ${i}/${maxFrames} | FPS: ${stats.fps.current.toFixed(1)} | Cache: ${stats.cache.hitRate.toFixed(0)}%`);
                }

                if (!this.scene.isRotationActive()) {
                    console.log(`\n⏹️ Render-Loop gestoppt bei Frame ${i}`);
                    break;
                }
            }

            const stats = this.performanceMonitor.getStats();
            console.log('\n' + '='.repeat(60));
            console.log('📊 RENDER-LOOP ABGESCHLOSSEN:');
            console.log('='.repeat(60));
            console.log(`Ø FPS:                ${stats.fps.average.toFixed(1)}`);
            console.log(`Ø Frame-Zeit:         ${stats.frameTime.average.toFixed(2)}ms`);
            console.log(`Cache Hit Rate:       ${stats.cache.hitRate.toFixed(1)}%`);
            console.log('='.repeat(60));
        };

        // Neue intelligente Cache Commands
        (window as any).debugIntelligentCache = this.debugIntelligentCache;
        (window as any).intelligentCacheTest = this.intelligentCachePerformanceTest;
        (window as any).showDetailedCacheStats = () => this.showDetailedCacheStats();
        (window as any).resetCacheStats = () => this.bufferManager.resetInvalidationStats();

        // Legacy Cache Commands
        (window as any).debugCacheBug = async () => {
            console.log('\n=== CACHE-BUG DEBUG ===');

            // 1. Cache zurücksetzen
            console.log('1. Cache reset...');
            await this.resetCache();

            // 2. Ersten Frame rendern
            console.log('2. Erster Frame...');
            await this.renderFrame();
            console.log('   -> Ist die Kugel da?');

            // 3. Cache-Statistiken nach erstem Frame
            await this.showCacheStatistics();

            // 4. Zweiten Frame rendern (hier verschwindet die Kugel)
            console.log('3. Zweiter Frame...');
            await this.renderFrame();
            console.log('   -> Ist die Kugel noch da?');

            // 5. Cache-Statistiken nach zweitem Frame
            await this.showCacheStatistics();

            console.log('\nCache-Debug abgeschlossen. Vergleiche die Hit-Rates.');
        };

        (window as any).debugCameraRotation = () => {
            console.log('\n=== KAMERA-ROTATION DEBUG ===');

            const scene = this.scene;

            console.log('Vor Rotation aktivieren:');
            console.log('  isRotating:', scene.isRotationActive());
            console.log('  Position:', scene.getCamera().position);

            scene.startCameraRotation();

            console.log('Nach Rotation aktivieren:');
            console.log('  isRotating:', scene.isRotationActive());

            // Mehrere Updates testen
            for (let i = 0; i < 5; i++) {
                const moved = scene.updateCamera();
                const pos = scene.getCamera().position;
                console.log(`Update ${i + 1}: moved=${moved}, pos=(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
            }
        };

        // Buffer-Verifikation Commands
        (window as any).verifyBufferSizes = () => {
            if (!this.initialized) {
                console.error('App nicht verfügbar. Stelle sicher, dass die App gestartet ist.');
                return;
            }

            console.log('\n' + '='.repeat(80));
            console.log('🔍 BUFFER-GRÖSSEN VERIFIKATION');
            console.log('='.repeat(80));

            const width = this.canvas.width;
            const height = this.canvas.height;
            const totalPixels = width * height;

            console.log(`\n📐 Canvas-Dimensionen:`);
            console.log(`  Breite: ${width}px`);
            console.log(`  Höhe: ${height}px`);
            console.log(`  Pixel gesamt: ${totalPixels.toLocaleString()}`);

            console.log(`\n💾 Cache-Buffer Analyse:`);
            try {
                const cacheBuffer = this.bufferManager.getCacheBuffer();
                const expectedCacheSize = totalPixels * 6 * 4;
                const actualCacheSize = cacheBuffer.size;

                console.log(`  Erwartete Größe: ${expectedCacheSize.toLocaleString()} bytes (6 float32/pixel)`);
                console.log(`  Tatsächliche Größe: ${actualCacheSize.toLocaleString()} bytes`);
                console.log(`  Verhältnis: ${(actualCacheSize / expectedCacheSize * 100).toFixed(1)}%`);
                console.log(`  Status: ${expectedCacheSize === actualCacheSize ? '✅ KORREKT' : '❌ FALSCH'}`);

                if (expectedCacheSize !== actualCacheSize) {
                    console.log(`  🔧 Differenz: ${Math.abs(actualCacheSize - expectedCacheSize).toLocaleString()} bytes`);

                    const bytesPerPixel = actualCacheSize / totalPixels;
                    const componentsPerPixel = bytesPerPixel / 4;
                    console.log(`  📊 Tatsächlich: ${bytesPerPixel} bytes/pixel = ${componentsPerPixel} float32/pixel`);
                }

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen des Cache-Buffers:', error?.message || error);
            }

            console.log(`\n🎨 Accumulation-Buffer Analyse:`);
            try {
                const accumulationBuffer = this.bufferManager.getAccumulationBuffer();
                const expectedAccSize = totalPixels * 4 * 4;
                const actualAccSize = accumulationBuffer.size;

                console.log(`  Erwartete Größe: ${expectedAccSize.toLocaleString()} bytes (4 float32/pixel)`);
                console.log(`  Tatsächliche Größe: ${actualAccSize.toLocaleString()} bytes`);
                console.log(`  Status: ${expectedAccSize === actualAccSize ? '✅ KORREKT' : '❌ FALSCH'}`);

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen des Accumulation-Buffers:', error?.message || error);
            }

            console.log(`\n📦 Andere Buffer:`);
            try {
                console.log(`  Kamera-Buffer: ${this.bufferManager.getCameraBuffer().size} bytes`);
                console.log(`  Spheres-Buffer: ${this.bufferManager.getSpheresBuffer().size} bytes`);
                console.log(`  RenderInfo-Buffer: ${this.bufferManager.getRenderInfoBuffer().size} bytes`);
                console.log(`  SceneConfig-Buffer: ${this.bufferManager.getSceneConfigBuffer().size} bytes`);

            } catch (error: any) {
                console.error('❌ Fehler beim Prüfen anderer Buffer:', error?.message || error);
            }

            console.log('\n' + '='.repeat(80));
            console.log('🏁 BUFFER-VERIFIKATION ABGESCHLOSSEN');
            console.log('='.repeat(80));
        };

        (window as any).testShaderCompatibility = async () => {
            if (!this.initialized) {
                console.error('App nicht verfügbar');
                return;
            }

            console.log('\n' + '='.repeat(80));
            console.log('🔬 SHADER-KOMPATIBILITÄT TEST');
            console.log('='.repeat(80));

            try {
                console.log('\n1️⃣ Cache zurücksetzen...');
                await this.resetCache();

                console.log('\n2️⃣ Test-Frame rendern...');
                await this.renderFrame();
                console.log('  Frame gerendert');

                console.log('\n3️⃣ Cache-Statistiken analysieren...');
                await this.showCacheStatistics();

                console.log('\n4️⃣ Cache-Performance testen...');

                await this.resetCache();

                const startTime1 = performance.now();
                await this.renderFrame();
                const time1 = performance.now() - startTime1;

                const startTime2 = performance.now();
                await this.renderFrame();
                const time2 = performance.now() - startTime2;

                const speedup = time1 / time2;

                console.log(`  Frame 1 (cold): ${time1.toFixed(2)}ms`);
                console.log(`  Frame 2 (cached): ${time2.toFixed(2)}ms`);
                console.log(`  Speedup: ${speedup.toFixed(2)}x`);
                console.log(`  Cache-Status: ${speedup > 1.1 ? '✅ Funktioniert' : '⚠️ Suboptimal'}`);

            } catch (error: any) {
                console.error('❌ Shader-Kompatibilität Test fehlgeschlagen:', error?.message || error);
            }

            console.log('\n' + '='.repeat(80));
            console.log('🏁 SHADER-TEST ABGESCHLOSSEN');
            console.log('='.repeat(80));
        };

        (window as any).cachePerformanceTest = async (iterations = 10) => {
            if (!this.initialized) {
                console.error('App nicht verfügbar');
                return;
            }

            console.log('\n' + '='.repeat(70));
            console.log(`🚀 CACHE-PERFORMANCE TEST: ${iterations} Iterationen`);
            console.log('='.repeat(70));

            const results = {
                coldTimes: [] as number[],
                warmTimes: [] as number[],
                hitRates: [] as number[]
            };

            for (let i = 0; i < iterations; i++) {
                console.log(`\n--- Iteration ${i + 1}/${iterations} ---`);

                await this.resetCache();

                const startTimeCold = performance.now();
                await this.renderFrame();
                const coldTime = performance.now() - startTimeCold;
                results.coldTimes.push(coldTime);

                const startTimeWarm = performance.now();
                await this.renderFrame();
                const warmTime = performance.now() - startTimeWarm;
                results.warmTimes.push(warmTime);

                const stats = this.performanceMonitor.getStats();
                results.hitRates.push(stats.cache.hitRate);

                console.log(`Cold: ${coldTime.toFixed(2)}ms, Warm: ${warmTime.toFixed(2)}ms, Hit Rate: ${stats.cache.hitRate.toFixed(1)}%`);

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const avgCold = results.coldTimes.reduce((a, b) => a + b, 0) / results.coldTimes.length;
            const avgWarm = results.warmTimes.reduce((a, b) => a + b, 0) / results.warmTimes.length;
            const avgHitRate = results.hitRates.reduce((a, b) => a + b, 0) / results.hitRates.length;
            const avgSpeedup = avgCold / avgWarm;

            console.log('\n' + '='.repeat(50));
            console.log('📊 PERFORMANCE ANALYSE:');
            console.log('='.repeat(50));
            console.log(`Ø Cold Frame Zeit:     ${avgCold.toFixed(2)}ms`);
            console.log(`Ø Warm Frame Zeit:     ${avgWarm.toFixed(2)}ms`);
            console.log(`Ø Cache Hit Rate:      ${avgHitRate.toFixed(1)}%`);
            console.log(`Ø Speedup:             ${avgSpeedup.toFixed(2)}x`);
            console.log('='.repeat(50));

            let rating = '';
            if (avgSpeedup > 2.0 && avgHitRate > 80) {
                rating = '🏆 AUSGEZEICHNET';
            } else if (avgSpeedup > 1.5 && avgHitRate > 60) {
                rating = '✅ GUT';
            } else if (avgSpeedup > 1.2 && avgHitRate > 40) {
                rating = '⚠️ AKZEPTABEL';
            } else {
                rating = '❌ PROBLEMATISCH';
            }

            console.log(`\nCache-Performance: ${rating}`);

            return {
                avgCold,
                avgWarm,
                avgHitRate,
                avgSpeedup,
                rating
            };
        };

        // Commands-Hilfe ausgeben
        console.log('\n💡 Verfügbare Commands:');
        console.log('   renderFrame()          - Einzelnen Frame rendern');
        console.log('   togglePerf()           - Performance-Display ein/aus');
        console.log('   resetCache()           - Cache leeren');
        console.log('   benchmark(100)         - 100 Frames Benchmark');
        console.log('\n🎬 Kamera-Animation:');
        console.log('   rotateCamera()         - Kamera-Rotation starten');
        console.log('   stopCamera()           - Rotation stoppen');
        console.log('   setSpeed(1.0)          - Geschwindigkeit ändern');
        console.log('   renderLoop(360)        - 360 Frames mit Rotation');
        console.log('\n🧠 Intelligente Cache:');
        console.log('   debugIntelligentCache()    - Detaillierter Cache-Test');
        console.log('   intelligentCacheTest(10)   - Performance-Vergleich');
        console.log('   showDetailedCacheStats()   - Umfassende Statistiken');
        console.log('   resetCacheStats()          - Statistiken zurücksetzen');
        console.log('\n🔧 Legacy Cache-Debug:');
        console.log('   debugCacheBug()        - Systematischer Cache-Test');
        console.log('   debugCameraRotation()  - Kamera-Bewegung testen');
        console.log('   verifyBufferSizes()    - Buffer-Größen prüfen');
        console.log('   testShaderCompatibility() - Shader-Cache-Test');
        console.log('   cachePerformanceTest(5) - Performance-Test\n');
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