import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG, GEOMETRY_CACHE } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";

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

    // ===== CACHE-INVALIDIERUNG TRACKING =====
    private invalidationStats = {
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

        this.logger.success('Alle GPU-Buffers erfolgreich erstellt');
    }

    /**
     * Kamera-Buffer erstellen
     */
    private createCameraBuffer(): void {
        if (!this.device || !this.cameraData) {
            throw new Error('Device oder Kamera-Daten nicht verfügbar');
        }

        this.logger.buffer('Erstelle Kamera-Buffer...');

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

    /**
     * Spheres-Buffer erstellen
     */
    private createSpheresBuffer(): void {
        if (!this.device || !this.spheresData) {
            throw new Error('Device oder Kugel-Daten nicht verfügbar');
        }

        this.logger.buffer('Erstelle Spheres-Buffer...');

        this.spheresBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SPHERE.LABEL,
            size: BUFFER_CONFIG.SPHERES.SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(this.spheresData));

        const sphereCount = this.spheresData.length / 8;
        this.logger.success(`Spheres-Buffer erstellt: ${BUFFER_CONFIG.SPHERES.SIZE} bytes für ${sphereCount} Kugeln`);
    }

    /**
     * Render-Info-Buffer erstellen
     */
    private createRenderInfoBuffer(width: number, height: number, sphereCount: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle Render-Info-Buffer...');

        this.renderInfoBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.RENDER_INFO.LABEL,
            size: BUFFER_CONFIG.RENDER_INFO.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const renderInfoData = new Uint32Array([
            width,
            height,
            sphereCount,
            0
        ]);

        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);

        this.logger.success(`Render-Info-Buffer erstellt: ${sphereCount} Kugeln`);
    }

    /**
     * EINFACHER Cache-Buffer erstellen (1 uint32 pro Pixel)
     */
    private createCacheBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.cache('Erstelle optimalen Geometry-Cache (6 float32/pixel)...');

        const pixelCount = width * height;
        const bufferSize = calculateCacheBufferSize(width, height); // 24 bytes pro Pixel

        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        // Cache mit Float32Array initialisieren (alle 0.0 = invalid)
        const cacheData = new Float32Array(pixelCount * 6).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Optimaler Cache erstellt: ${bufferSize.toLocaleString()} bytes (${pixelCount.toLocaleString()} * 6 float32)`);
    }

    /**
     * Accumulation-Buffer erstellen
     */
    private createAccumulationBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle Accumulation-Buffer für Supersampling...');

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

    /**
     * Scene Config Buffer erstellen
     */
    private createSceneConfigBuffer(
        lightPosition?: { x: number; y: number; z: number },
        ambientIntensity?: number
    ): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle Scene Config Buffer...');

        this.sceneConfigBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SCENE_CONFIG.LABEL,
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const lightPos = lightPosition || SCENE_CONFIG.LIGHTING.POSITION;
        const ambient = ambientIntensity !== undefined ? ambientIntensity : SCENE_CONFIG.LIGHTING.AMBIENT;

        const sceneConfigData = new Float32Array([
            SCENE_CONFIG.GROUND.Y_POSITION,
            0, 0, 0,
            lightPos.x,
            lightPos.y,
            lightPos.z,
            SCENE_CONFIG.LIGHTING.SHADOW_ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.MAX_BOUNCES,
            SCENE_CONFIG.REFLECTIONS.MIN_CONTRIBUTION,
            ambient,
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);

        this.logger.success(`Scene Config Buffer erstellt: ${BUFFER_CONFIG.SCENE_CONFIG.SIZE} bytes`);
    }

    // ===== CACHE-INVALIDIERUNG METHODEN =====

    /**
     * Effiziente Batch-Invalidierung für bewegte Objekte
     */
    public invalidatePixelsForSphere(sphereIndex: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const startTime = performance.now();
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * 0.1); // 10%

        // Batch-Invalidierung: Zufällige Pixel invalidieren
        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        // Effiziente Batch-Schreibung für 6 float32 Struktur
        const pixelArray = Array.from(invalidPixels);
        const batchSize = Math.min(100, pixelArray.length);

        for (let i = 0; i < pixelArray.length; i += batchSize) {
            const batch = pixelArray.slice(i, i + batchSize);

            batch.forEach(pixelIndex => {
                // Nur das Valid-Flag (Index 5) auf 0.0 setzen
                const validFlagOffset = pixelIndex * 6 * 4 + 5 * 4; // 6 float32 pro pixel, valid flag ist index 5
                this.device!.queue.writeBuffer(
                    this.cacheBuffer!,
                    validFlagOffset,
                    new Float32Array([0.0]) // Invalid flag
                );
            });
        }

        const invalidationTime = performance.now() - startTime;

        // Statistiken aktualisieren
        this.invalidationStats.totalInvalidations++;
        this.invalidationStats.pixelsInvalidated += pixelsToInvalidate;
        this.invalidationStats.lastInvalidationTime = invalidationTime;

        this.logger.cache(
            `Batch-Invalidierung (6f32): ${pixelsToInvalidate} Pixel in ${invalidationTime.toFixed(2)}ms ` +
            `(Sphere ${sphereIndex})`
        );
    }

    /**
     * Region-basierte Invalidierung (für zukünftige intelligente Invalidierung)
     */
    public invalidateRegion(centerX: number, centerY: number, radius: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const startTime = performance.now();
        const invalidPixels: number[] = [];

        // Alle Pixel in einem Kreis um die Position invalidieren
        const minX = Math.max(0, Math.floor(centerX - radius));
        const maxX = Math.min(this.canvasWidth - 1, Math.ceil(centerX + radius));
        const minY = Math.max(0, Math.floor(centerY - radius));
        const maxY = Math.min(this.canvasHeight - 1, Math.ceil(centerY + radius));

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                if (distance <= radius) {
                    const pixelIndex = y * this.canvasWidth + x;
                    invalidPixels.push(pixelIndex);
                }
            }
        }

        // Batch-Invalidierung für die Region (6 float32 Struktur)
        const batchSize = 50;
        for (let i = 0; i < invalidPixels.length; i += batchSize) {
            const batch = invalidPixels.slice(i, i + batchSize);

            batch.forEach(pixelIndex => {
                // Nur das Valid-Flag (Index 5) auf 0.0 setzen
                const validFlagOffset = pixelIndex * 6 * 4 + 5 * 4;
                this.device!.queue.writeBuffer(
                    this.cacheBuffer!,
                    validFlagOffset,
                    new Float32Array([0.0])
                );
            });
        }

        const invalidationTime = performance.now() - startTime;

        this.invalidationStats.totalInvalidations++;
        this.invalidationStats.pixelsInvalidated += invalidPixels.length;
        this.invalidationStats.lastInvalidationTime = invalidationTime;

        this.logger.cache(
            `Region-Invalidierung (6f32): ${invalidPixels.length} Pixel in ${invalidationTime.toFixed(2)}ms ` +
            `(${centerX}, ${centerY}, r=${radius})`
        );
    }

    /**
     * Intelligentere Invalidierung basierend auf Sphere-Position und -Bewegung
     */
    public invalidatePixelsForSphereMovement(
        sphereIndex: number,
        oldPosition: { x: number; y: number; z: number },
        newPosition: { x: number; y: number; z: number },
        radius: number
    ): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        // Für jetzt: Prozentuale Invalidierung basierend auf Bewegungsdistanz
        const movementDistance = Math.sqrt(
            Math.pow(newPosition.x - oldPosition.x, 2) +
            Math.pow(newPosition.y - oldPosition.y, 2) +
            Math.pow(newPosition.z - oldPosition.z, 2)
        );

        // Je größer die Bewegung, desto mehr Pixel invalidieren
        const invalidationPercentage = Math.min(0.5, Math.max(0.02, movementDistance * 0.05));

        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * invalidationPercentage);

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        invalidPixels.forEach(pixelIndex => {
            const offset = pixelIndex * 4;
            this.device!.queue.writeBuffer(
                this.cacheBuffer!,
                offset,
                new Uint32Array([GEOMETRY_CACHE.INVALID_VALUE])
            );
        });

        this.logger.cache(
            `Bewegungs-Invalidierung: ${movementDistance.toFixed(3)} Distanz -> ` +
            `${(invalidationPercentage * 100).toFixed(1)}% Pixel (${pixelsToInvalidate})`
        );
    }

    // ===== INVALIDIERUNG STATISTIKEN =====

    /**
     * Cache-Invalidierung Statistiken abrufen
     */
    public getInvalidationStats(): {
        totalInvalidations: number;
        pixelsInvalidated: number;
        lastInvalidationTime: number;
        avgPixelsPerInvalidation: number;
    } {
        return {
            ...this.invalidationStats,
            avgPixelsPerInvalidation: this.invalidationStats.totalInvalidations > 0
                ? this.invalidationStats.pixelsInvalidated / this.invalidationStats.totalInvalidations
                : 0
        };
    }

    /**
     * Invalidierung-Statistiken zurücksetzen
     */
    public resetInvalidationStats(): void {
        this.invalidationStats = {
            totalInvalidations: 0,
            pixelsInvalidated: 0,
            lastInvalidationTime: 0
        };
        this.logger.cache('Invalidierung-Statistiken zurückgesetzt');
    }

    // ===== UPDATE METHODEN =====

    /**
     * Spheres-Daten aus Three.js Scene aktualisieren
     */
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

    /**
     * Render Info aktualisieren
     */
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

    /**
     * Kamera-Daten aktualisieren
     */
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

    /**
     * Kamera-Daten mit Random Seeds aktualisieren (für Supersampling)
     */
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

    /**
     * Scene Config aktualisieren
     */
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

    // ===== CACHE RESET METHODEN =====

    /**
     * Cache zurücksetzen (einfache Struktur)
     */
    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Float32Array(pixelCount * 6).fill(0.0); // Alle Werte auf 0.0 (invalid)
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.cache('Optimaler Cache zurückgesetzt (6 float32/pixel)');
    }

    /**
     * Accumulation Buffer zurücksetzen
     */
    public resetAccumulation(width: number, height: number): void {
        if (!this.device || !this.accumulationBuffer) {
            throw new Error('Device oder Accumulation-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);

        this.logger.buffer('Accumulation Buffer zurückgesetzt');
    }

    // ===== GETTER METHODEN =====

    /**
     * Alle Buffers für Bind Group abrufen
     */
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

    public getSpheresBuffer(): GPUBuffer {
        if (!this.spheresBuffer) {
            throw new Error('Spheres-Buffer nicht initialisiert');
        }
        return this.spheresBuffer;
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

    public getSphereBuffer(): GPUBuffer {
        if (!this.spheresBuffer) {
            throw new Error('Kugel-Buffer nicht initialisiert');
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

    /**
     * Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.cameraBuffer !== null &&
            this.spheresBuffer !== null &&
            this.renderInfoBuffer !== null &&
            this.cacheBuffer !== null &&
            this.accumulationBuffer !== null &&
            this.sceneConfigBuffer !== null;
    }

    /**
     * Alle Buffers aufräumen
     */
    public cleanup(): void {
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