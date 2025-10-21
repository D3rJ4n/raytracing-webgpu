// src/rendering/BufferManager.ts - Minimale Shadow-Erweiterung

import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";
import { GeometryInvalidationManager } from "../cache/InvalidationManager";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== GPU BUFFERS (unverändert) =====
    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null;
    private sceneConfigBuffer: GPUBuffer | null = null;

    // ===== BUFFER-DATEN CACHE (unverändert) =====
    private cameraData: Float32Array | null = null;
    private spheresData: Float32Array | null = null;

    // ===== CACHE-OPTIMIERUNG (unverändert) =====
    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    // ===== BESTEHENDE CACHE-INVALIDIERUNG (unverändert) =====
    private cacheInvalidationManager: GeometryInvalidationManager | null = null;

    // ===== LEGACY STATS (unverändert) =====
    private legacyInvalidationStats = {
        totalInvalidations: 0,
        pixelsInvalidated: 0,
        lastInvalidationTime: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * Buffer Manager initialisieren - NUR Cache-Buffer-Größe geändert
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
        this.createExtendedCacheBuffer(canvasWidth, canvasHeight); // NUR DIESE ZEILE GEÄNDERT
        this.createAccumulationBuffer(canvasWidth, canvasHeight);
        this.createSceneConfigBuffer(lightPosition, ambientIntensity);

        // Intelligente Cache-Invalidierung initialisieren
        this.initializeCacheInvalidation();

        this.logger.success('Alle GPU-Buffers erfolgreich erstellt');
    }

    /**
     * EINZIGE NEUE METHODE: Cache-Buffer für 7 float32/pixel
     */
    private createExtendedCacheBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        const pixelCount = width * height;
        const bufferSize = calculateCacheBufferSize(width, height); // Jetzt 28 bytes (7*4)

        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const cacheData = new Float32Array(pixelCount * 7).fill(0.0); // 7 statt 6
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Erweiteter Cache erstellt: ${bufferSize.toLocaleString()} bytes (${pixelCount.toLocaleString()} * 7 float32) - Geometry + Shadow`);
    }

    // ===== BESTEHENDE INVALIDIERUNG: Unverändert, nutzt deine Klassen =====

    /**
     * UNVERÄNDERT: Nutzt deine bestehenden Cache-Invalidierung-Klassen
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
     * UNVERÄNDERT: Legacy Random-Invalidierung als Fallback
     */
    private async legacyRandomInvalidation(): Promise<void> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * 0.05); // 5% statt 10%

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        invalidPixels.forEach(pixelIndex => {
            const validFlagOffset = pixelIndex * 7 * 4 + 6 * 4; // Jetzt Index 6 statt 5
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

    // ===== CACHE RESET: Nur Pixel-Struktur geändert =====

    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Float32Array(pixelCount * 7).fill(0.0); // 7 statt 6
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.cache('Erweiteter Cache zurückgesetzt (7 float32/pixel)');
    }

    // ===== ALLE ANDEREN METHODEN: Komplett unverändert =====

    public getInvalidationStats(): any {
        if (this.cacheInvalidationManager) {
            return this.cacheInvalidationManager.getStats();
        } else {
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

    public logInvalidationStats(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.getStats();
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

    private initializeCacheInvalidation(): void {
        if (!this.device || !this.cacheBuffer) {
            this.logger.warning('Kann intelligente Cache-Invalidierung nicht initialisieren');
            return;
        }

        this.cacheInvalidationManager = new GeometryInvalidationManager(
            this.device,
            this.cacheBuffer,
            this.canvasWidth,
            this.canvasHeight
        );

        this.logger.cache('Intelligente Cache-Invalidierung aktiviert');
    }

    // ===== ALLE ANDEREN UPDATE- UND GETTER-METHODEN: Identisch zu vorher =====

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

    public resetAccumulation(width: number, height: number): void {
        if (!this.device || !this.accumulationBuffer) {
            throw new Error('Device oder Accumulation-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);

        this.logger.buffer('Accumulation Buffer zurückgesetzt');
    }

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

    public getDevice(): GPUDevice {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }
        return this.device;
    }

    public cleanup(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.cleanup();
            this.cacheInvalidationManager = null;
        }

        if (this.cameraBuffer) {
            this.cameraBuffer.destroy();
            this.cacheBuffer = null;
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