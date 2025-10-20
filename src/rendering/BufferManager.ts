// src/rendering/BufferManager.ts - Erweitert um intelligente Cache-Invalidierung

import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";
import { CacheInvalidationManager } from "../cache/CacheInvalidationManager";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== GPU BUFFERS =====
    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null;
    private sceneConfigBuffer: GPUBuffer | null = null;

    // ===== BUFFER-DATEN CACHE =====
    private cameraData: Float32Array | null = null;
    private spheresData: Float32Array | null = null;

    // ===== CACHE-OPTIMIERUNG =====
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    // ===== INTELLIGENTE CACHE-INVALIDIERUNG =====
    private cacheInvalidationManager: CacheInvalidationManager | null = null;

    // ===== LEGACY STATS (für Rückwärtskompatibilität) =====
    private legacyInvalidationStats = {
        totalInvalidations: 0,
        pixelsInvalidated: 0,
        lastInvalidationTime: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Buffer Manager initialisieren
     */
    public initialize(
        device: GPUDevice,
        canvasWidth: number,
        canvasHeight: number,
        cameraData: Float32Array,
        sphereData: Float32Array,
        lightPosition?: { x: number; y: number; z: number },
        ambientIntensity?: number
    ): void {
        this.device = device;
        this.cameraData = cameraData;
        this.spheresData = sphereData;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        this.logger.buffer('Erstelle GPU-Buffers...');

        const sphereCount = Math.floor(sphereData.length / 8);

        this.createCameraBuffer();
        this.createSpheresBuffer();
        this.createRenderInfoBuffer(canvasWidth, canvasHeight, sphereCount);
        this.createCacheBuffer(canvasWidth, canvasHeight);
        this.createAccumulationBuffer(canvasWidth, canvasHeight);
        this.createSceneConfigBuffer(lightPosition, ambientIntensity);

        // Intelligente Cache-Invalidierung initialisieren
        this.initializeCacheInvalidation();

        this.logger.success('Alle GPU-Buffers erfolgreich erstellt');
    }

    /**
     * Intelligente Cache-Invalidierung initialisieren
     */
    private initializeCacheInvalidation(): void {
        if (!this.device || !this.cacheBuffer) {
            this.logger.warning('Kann intelligente Cache-Invalidierung nicht initialisieren');
            return;
        }

        this.cacheInvalidationManager = new CacheInvalidationManager(
            this.device,
            this.cacheBuffer,
            this.canvasWidth,
            this.canvasHeight
        );

        this.logger.cache('Intelligente Cache-Invalidierung aktiviert');
    }

    // ===== BESTEHENDE BUFFER-ERSTELLUNG (unverändert) =====

    private createCameraBuffer(): void {
        if (!this.device || !this.cameraData) {
            throw new Error('Device oder Kamera-Daten nicht verfügbar');
        }

        this.cameraBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CAMERA.LABEL,
            size: BUFFER_CONFIG.CAMERA.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const extendedData = new Float32Array(12);
        extendedData.set(this.cameraData.slice(0, 8), 0);
        extendedData[8] = 0;  // randomSeed1
        extendedData[9] = 0;  // randomSeed2
        extendedData[10] = 0; // sampleCount
        extendedData[11] = 0; // padding

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
        this.logger.success(`Kamera-Buffer erstellt: ${BUFFER_CONFIG.CAMERA.SIZE} bytes`);
    }

    private createSpheresBuffer(): void {
        if (!this.device || !this.spheresData) {
            throw new Error('Device oder Kugel-Daten nicht verfügbar');
        }

        this.spheresBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SPHERE.LABEL,
            size: BUFFER_CONFIG.SPHERES.SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(this.spheresData));

        const sphereCount = this.spheresData.length / 8;
        this.logger.success(`Spheres-Buffer erstellt: ${BUFFER_CONFIG.SPHERES.SIZE} bytes für ${sphereCount} Kugeln`);
    }

    private createRenderInfoBuffer(width: number, height: number, sphereCount: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.renderInfoBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.RENDER_INFO.LABEL,
            size: BUFFER_CONFIG.RENDER_INFO.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const renderInfoData = new Uint32Array([width, height, sphereCount, 0]);
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);
        this.logger.success(`Render-Info-Buffer erstellt: ${sphereCount} Kugeln`);
    }

    private createCacheBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        const pixelCount = width * height;
        const bufferSize = calculateCacheBufferSize(width, height);

        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const cacheData = new Float32Array(pixelCount * 6).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Optimaler Cache erstellt: ${bufferSize.toLocaleString()} bytes (${pixelCount.toLocaleString()} * 6 float32)`);
    }

    private createAccumulationBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        const pixelCount = width * height;
        const bufferSize = calculateAccumulationBufferSize(width, height);

        this.accumulationBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.ACCUMULATION.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);

        this.logger.success(`Accumulation-Buffer erstellt: ${bufferSize.toLocaleString()} bytes`);
    }

    private createSceneConfigBuffer(
        lightPosition?: { x: number; y: number; z: number },
        ambientIntensity?: number
    ): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.sceneConfigBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SCENE_CONFIG.LABEL,
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const lightPos = lightPosition || SCENE_CONFIG.LIGHTING.POSITION;
        const ambient = ambientIntensity !== undefined ? ambientIntensity : SCENE_CONFIG.LIGHTING.AMBIENT;

        const sceneConfigData = new Float32Array([
            SCENE_CONFIG.GROUND.Y_POSITION, 0, 0, 0,
            lightPos.x, lightPos.y, lightPos.z,
            SCENE_CONFIG.LIGHTING.SHADOW_ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.MAX_BOUNCES,
            SCENE_CONFIG.REFLECTIONS.MIN_CONTRIBUTION,
            ambient,
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);
        this.logger.success(`Scene Config Buffer erstellt: ${BUFFER_CONFIG.SCENE_CONFIG.SIZE} bytes`);
    }

    // ===== NEUE INTELLIGENTE CACHE-INVALIDIERUNG API =====

    /**
     * Intelligente Cache-Invalidierung basierend auf Scene-Änderungen
     */
    public async invalidateForSceneChanges(scene: Scene): Promise<void> {
        if (!this.cacheInvalidationManager) {
            // Fallback auf legacy Random-Invalidierung
            await this.legacyRandomInvalidation();
            return;
        }

        const spheresData = scene.getSpheresData();
        const cameraData = scene.getCameraData();

        try {
            const result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);

            // Legacy Stats für Rückwärtskompatibilität aktualisieren
            this.legacyInvalidationStats.totalInvalidations++;
            this.legacyInvalidationStats.pixelsInvalidated += result.pixelsInvalidated;
            this.legacyInvalidationStats.lastInvalidationTime = result.invalidationTime;

            // DEBUG-LOG für die Korrektur
            if (result.pixelsInvalidated > 0) {
                const invalidationType = result.cameraInvalidation ? 'Kamera' : 'Objekt';
                this.logger.cache(
                    `Intelligente Invalidierung: ${invalidationType}-Bewegung, ` +
                    `${result.pixelsInvalidated.toLocaleString()} Pixel in ${result.invalidationTime.toFixed(2)}ms`
                );
            }

        } catch (error) {
            this.logger.error('Intelligente Cache-Invalidierung fehlgeschlagen:', error);
            await this.legacyRandomInvalidation();
        }
    }

    /**
     * Legacy Random-Invalidierung als Fallback
     */
    private async legacyRandomInvalidation(): Promise<void> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * 0.05); // 5% statt 10%

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        invalidPixels.forEach(pixelIndex => {
            const validFlagOffset = pixelIndex * 6 * 4 + 5 * 4;
            this.device!.queue.writeBuffer(
                this.cacheBuffer!,
                validFlagOffset,
                new Float32Array([0.0])
            );
        });

        this.legacyInvalidationStats.totalInvalidations++;
        this.legacyInvalidationStats.pixelsInvalidated += pixelsToInvalidate;

        this.logger.cache(`Fallback Random-Invalidierung: ${pixelsToInvalidate} Pixel (5%)`);
    }

    // ===== LEGACY CACHE-INVALIDIERUNG (für Rückwärtskompatibilität) =====

    /**
     * @deprecated Verwende invalidateForSceneChanges() stattdessen
     */
    public invalidatePixelsForSphere(sphereIndex: number): void {
        this.logger.warning('Legacy invalidatePixelsForSphere() verwendet - migriere zu invalidateForSceneChanges()');

        // Vereinfachte Legacy-Implementierung
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * 0.02); // 2% pro Sphere

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        invalidPixels.forEach(pixelIndex => {
            const validFlagOffset = pixelIndex * 6 * 4 + 5 * 4;
            this.device!.queue.writeBuffer(
                this.cacheBuffer!,
                validFlagOffset,
                new Float32Array([0.0])
            );
        });
    }

    // ===== CACHE-STATISTIKEN API =====

    /**
     * Cache-Invalidierung Statistiken abrufen
     */
    public getInvalidationStats() {
        if (this.cacheInvalidationManager) {
            // Neue detaillierte Statistiken
            return this.cacheInvalidationManager.getStats();
        } else {
            // Legacy Statistiken
            return {
                totalInvalidations: this.legacyInvalidationStats.totalInvalidations,
                pixelsInvalidated: this.legacyInvalidationStats.pixelsInvalidated,
                lastInvalidationTime: this.legacyInvalidationStats.lastInvalidationTime,
                avgPixelsPerInvalidation: this.legacyInvalidationStats.totalInvalidations > 0
                    ? this.legacyInvalidationStats.pixelsInvalidated / this.legacyInvalidationStats.totalInvalidations
                    : 0
            };
        }
    }

    /**
     * Detaillierte Cache-Invalidierung Statistiken ausgeben
     */
    public logInvalidationStats(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.getStats();
            // Die InvalidationStats-Klasse hat ihre eigene logDetailedStats() Methode
            console.log('Verwende cacheInvalidationManager.getStats() für detaillierte Statistiken');
        } else {
            const stats = this.legacyInvalidationStats;
            const totalPixels = this.canvasWidth * this.canvasHeight;
            const avgPercentage = stats.totalInvalidations > 0
                ? (stats.pixelsInvalidated / stats.totalInvalidations / totalPixels) * 100
                : 0;

            console.log('\n=== LEGACY CACHE-INVALIDIERUNG STATISTIKEN ===');
            console.log(`Invalidierungen: ${stats.totalInvalidations}`);
            console.log(`Pixel invalidiert: ${stats.pixelsInvalidated.toLocaleString()}`);
            console.log(`Ø Pixel/Invalidierung: ${(stats.pixelsInvalidated / Math.max(1, stats.totalInvalidations)).toFixed(0)}`);
            console.log(`Ø Prozent/Invalidierung: ${avgPercentage.toFixed(2)}%`);
            console.log(`Letzte Zeit: ${stats.lastInvalidationTime.toFixed(2)}ms`);
            console.log('===============================================');
        }
    }

    /**
     * Cache-Invalidierung Statistiken zurücksetzen
     */
    public resetInvalidationStats(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.resetStats();
        }

        this.legacyInvalidationStats = {
            totalInvalidations: 0,
            pixelsInvalidated: 0,
            lastInvalidationTime: 0
        };

        this.logger.cache('Cache-Invalidierung Statistiken zurückgesetzt');
    }

    // ===== UPDATE METHODEN (unverändert) =====

    public updateSpheresFromScene(scene: Scene): void {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('Device oder Spheres-Buffer nicht verfügbar');
        }

        const spheresData = scene.getSpheresData();
        this.spheresData = spheresData;

        const bufferData = new Float32Array(spheresData);
        this.device.queue.writeBuffer(this.spheresBuffer, 0, bufferData);

        this.logger.buffer(`Spheres aus Scene aktualisiert (${scene.getSphereCount()} Kugeln)`);
    }

    public updateCameraData(newCameraData: Float32Array): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Device oder Kamera-Buffer nicht verfügbar');
        }

        this.cameraData = newCameraData;

        const extendedData = new Float32Array(12);
        extendedData.set(newCameraData.slice(0, 8), 0);
        extendedData[8] = 0;
        extendedData[9] = 0;
        extendedData[10] = 0;
        extendedData[11] = 0;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
        this.logger.buffer('Kamera-Daten aktualisiert');
    }

    public updateCameraDataWithRandomSeeds(
        baseCameraData: Float32Array,
        sampleCount: number
    ): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Device oder Kamera-Buffer nicht verfügbar');
        }

        const extendedData = new Float32Array(12);
        extendedData.set(baseCameraData.slice(0, 8), 0);
        extendedData[8] = Math.random();
        extendedData[9] = Math.random();
        extendedData[10] = sampleCount;
        extendedData[11] = 0;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
    }

    public updateRenderInfo(width: number, height: number, sphereCount: number): void {
        if (!this.device || !this.renderInfoBuffer) {
            throw new Error('Device oder Render Info Buffer nicht verfügbar');
        }

        const renderInfoData = new Uint32Array([
            width,
            height,
            sphereCount,
            0
        ]);

        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);
        this.logger.buffer(`Render Info aktualisiert: ${sphereCount} Kugeln`);
    }

    public updateSceneConfig(
        lightPosition?: { x: number; y: number; z: number },
        ambientIntensity?: number,
        shadowEnabled?: boolean,
        reflectionsEnabled?: boolean
    ): void {
        if (!this.device || !this.sceneConfigBuffer) {
            throw new Error('Device oder Scene Config Buffer nicht verfügbar');
        }

        const lightPos = lightPosition || SCENE_CONFIG.LIGHTING.POSITION;
        const ambient = ambientIntensity !== undefined ? ambientIntensity : SCENE_CONFIG.LIGHTING.AMBIENT;
        const shadows = shadowEnabled !== undefined ? shadowEnabled : SCENE_CONFIG.LIGHTING.SHADOW_ENABLED;
        const reflections = reflectionsEnabled !== undefined ? reflectionsEnabled : SCENE_CONFIG.REFLECTIONS.ENABLED;

        const sceneConfigData = new Float32Array([
            SCENE_CONFIG.GROUND.Y_POSITION,
            0, 0, 0,
            lightPos.x,
            lightPos.y,
            lightPos.z,
            shadows ? 1.0 : 0.0,
            reflections ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.MAX_BOUNCES,
            SCENE_CONFIG.REFLECTIONS.MIN_CONTRIBUTION,
            ambient,
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);
        this.logger.buffer('Scene Config aktualisiert');
    }

    // ... weitere Update-Methoden bleiben unverändert

    // ===== CACHE RESET METHODEN =====

    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Float32Array(pixelCount * 6).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.cache('Optimaler Cache zurückgesetzt (6 float32/pixel)');
    }

    public resetAccumulation(width: number, height: number): void {
        if (!this.device || !this.accumulationBuffer) {
            throw new Error('Device oder Accumulation-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);

        this.logger.buffer('Accumulation Buffer zurückgesetzt');
    }

    // ===== GETTER METHODEN (unverändert) =====

    public getAllBuffers(): {
        camera: GPUBuffer;
        spheres: GPUBuffer;
        renderInfo: GPUBuffer;
        cache: GPUBuffer;
        accumulation: GPUBuffer;
        sceneConfig: GPUBuffer;
    } {
        if (!this.cameraBuffer || !this.spheresBuffer || !this.renderInfoBuffer ||
            !this.cacheBuffer || !this.accumulationBuffer || !this.sceneConfigBuffer) {
            throw new Error('Nicht alle Buffers sind initialisiert');
        }

        return {
            camera: this.cameraBuffer,
            spheres: this.spheresBuffer,
            renderInfo: this.renderInfoBuffer,
            cache: this.cacheBuffer,
            accumulation: this.accumulationBuffer,
            sceneConfig: this.sceneConfigBuffer,
        };
    }

    public getCacheBuffer(): GPUBuffer {
        if (!this.cacheBuffer) {
            throw new Error('Cache-Buffer nicht initialisiert');
        }
        return this.cacheBuffer;
    }

    public getAccumulationBuffer(): GPUBuffer {
        if (!this.accumulationBuffer) {
            throw new Error('Accumulation-Buffer nicht initialisiert');
        }
        return this.accumulationBuffer;
    }

    public getCameraBuffer(): GPUBuffer {
        if (!this.cameraBuffer) {
            throw new Error('Kamera-Buffer nicht initialisiert');
        }
        return this.cameraBuffer;
    }

    public getSpheresBuffer(): GPUBuffer {
        if (!this.spheresBuffer) {
            throw new Error('Spheres-Buffer nicht initialisiert');
        }
        return this.spheresBuffer;
    }

    public getRenderInfoBuffer(): GPUBuffer {
        if (!this.renderInfoBuffer) {
            throw new Error('Render-Info-Buffer nicht initialisiert');
        }
        return this.renderInfoBuffer;
    }

    public getSceneConfigBuffer(): GPUBuffer {
        if (!this.sceneConfigBuffer) {
            throw new Error('Scene Config Buffer nicht initialisiert');
        }
        return this.sceneConfigBuffer;
    }

    public isInitialized(): boolean {
        return this.cameraBuffer !== null &&
            this.spheresBuffer !== null &&
            this.renderInfoBuffer !== null &&
            this.cacheBuffer !== null &&
            this.accumulationBuffer !== null &&
            this.sceneConfigBuffer !== null;
    }

    public cleanup(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.cleanup();
            this.cacheInvalidationManager = null;
        }

        if (this.cameraBuffer) {
            this.cameraBuffer.destroy();
            this.cameraBuffer = null;
        }

        if (this.spheresBuffer) {
            this.spheresBuffer.destroy();
            this.spheresBuffer = null;
        }

        if (this.renderInfoBuffer) {
            this.renderInfoBuffer.destroy();
            this.renderInfoBuffer = null;
        }

        if (this.cacheBuffer) {
            this.cacheBuffer.destroy();
            this.cacheBuffer = null;
        }

        if (this.accumulationBuffer) {
            this.accumulationBuffer.destroy();
            this.accumulationBuffer = null;
        }

        if (this.sceneConfigBuffer) {
            this.sceneConfigBuffer.destroy();
            this.sceneConfigBuffer = null;
        }

        this.logger.buffer('Alle GPU-Buffers aufgeräumt');
    }
}