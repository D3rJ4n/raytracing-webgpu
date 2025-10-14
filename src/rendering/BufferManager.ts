import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG } from "../utils/Constants";
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

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Buffer Manager initialisieren
     */
    public initialize(
        device: GPUDevice,
        canvasWidth: number,
        canvasHeight: number,
        cameraData: Float32Array,
        sphereData: Float32Array,
        lightPosition?: { x: number; y: number; z: number },  // ⭐ NEU
        ambientIntensity?: number  // ⭐ NEU
    ): void {
        this.device = device;
        this.cameraData = cameraData;
        this.spheresData = sphereData;

        this.logger.buffer('Erstelle GPU-Buffers...');

        this.createCameraBuffer();
        this.createSpheresBuffer();
        this.createRenderInfoBuffer(canvasWidth, canvasHeight);
        this.createCacheBuffer(canvasWidth, canvasHeight);
        this.createAccumulationBuffer(canvasWidth, canvasHeight);
        this.createSceneConfigBuffer(lightPosition, ambientIntensity);  // ⭐ Parameter übergeben

        this.logger.success('Alle GPU-Buffers erfolgreich erstellt');
    }

    /**
     * 📷 Kamera-Buffer erstellen
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

        // Initial mit Basis-Daten füllen
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
     * 🎱 Kugel-Buffer erstellen
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
     * 📋 Render-Info-Buffer erstellen
     */
    private createRenderInfoBuffer(width: number, height: number): void {
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
            0,
            0
        ]);

        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);

        this.logger.success(`Render-Info-Buffer erstellt: ${BUFFER_CONFIG.RENDER_INFO.SIZE} bytes`);
    }

    /**
     * 💾 Cache-Buffer erstellen
     */
    private createCacheBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.cache('Erstelle Cache-Buffer...');

        const pixelCount = width * height;
        const bufferSize = calculateCacheBufferSize(width, height);

        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const cacheData = new Uint32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Farb-Cache-Buffer erstellt: ${bufferSize.toLocaleString()} bytes`);
    }

    /**
     * 🎯 Accumulation-Buffer erstellen
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
     * 🌍 Scene Config Buffer erstellen
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

        // ⭐ Nutze Three.js Daten oder Fallback zu Constants
        const lightPos = lightPosition || SCENE_CONFIG.LIGHTING.POSITION;
        const ambient = ambientIntensity !== undefined ? ambientIntensity : SCENE_CONFIG.LIGHTING.AMBIENT;

        const sceneConfigData = new Float32Array([
            SCENE_CONFIG.GROUND.Y_POSITION,
            0, 0, 0,
            lightPos.x,  // ⭐ Aus Three.js!
            lightPos.y,
            lightPos.z,
            SCENE_CONFIG.LIGHTING.SHADOW_ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.ENABLED ? 1.0 : 0.0,
            SCENE_CONFIG.REFLECTIONS.MAX_BOUNCES,
            SCENE_CONFIG.REFLECTIONS.MIN_CONTRIBUTION,
            ambient,  // ⭐ Aus Three.js!
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);

        this.logger.success(`Scene Config Buffer erstellt: ${BUFFER_CONFIG.SCENE_CONFIG.SIZE} bytes`);
    }

    /**
     * 🔄 Spheres-Daten aus Three.js Scene
     */
    public updateSpheresFromScene(scene: Scene): void {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('Device oder Spheres-Buffer nicht verfügbar');
        }

        // Hole Daten direkt aus Three.js Szene
        const spheresData = scene.getSpheresData();

        this.spheresData = spheresData;

        const bufferData = new Float32Array(spheresData);
        this.device.queue.writeBuffer(this.spheresBuffer, 0, bufferData);

        this.logger.buffer(`Spheres aus Scene aktualisiert (${scene.getSphereCount()} Kugeln)`);
    }

    /**
     * 🔄 Kamera-Daten aktualisieren
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
     * 🎲 Kamera-Daten mit Random Seeds aktualisieren
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
        extendedData[8] = Math.random();  // randomSeed1
        extendedData[9] = Math.random();  // randomSeed2
        extendedData[10] = sampleCount;
        extendedData[11] = 0;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
    }

    /**
     * 🔄 Scene Config komplett aktualisieren (⭐ NEU)
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

        // Aktuelle oder Default-Werte verwenden
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

    /**
     * 🔄 Cache zurücksetzen
     */
    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Uint32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.cache('Cache zurückgesetzt');
    }

    /**
     * 🔄 Accumulation Buffer zurücksetzen
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

    /**
     * 📋 Alle Buffers für Bind Group abrufen
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

    /**
     * 🎱 Spheres-Buffer abrufen
     */
    public getSpheresBuffer(): GPUBuffer {
        if (!this.spheresBuffer) {
            throw new Error('Spheres-Buffer nicht initialisiert');
        }
        return this.spheresBuffer;
    }

    /**
     * 💾 Cache-Buffer abrufen
     */
    public getCacheBuffer(): GPUBuffer {
        if (!this.cacheBuffer) {
            throw new Error('Cache-Buffer nicht initialisiert');
        }
        return this.cacheBuffer;
    }

    /**
     * 🎯 Accumulation-Buffer abrufen
     */
    public getAccumulationBuffer(): GPUBuffer {
        if (!this.accumulationBuffer) {
            throw new Error('Accumulation-Buffer nicht initialisiert');
        }
        return this.accumulationBuffer;
    }

    /**
     * 📷 Kamera-Buffer abrufen
     */
    public getCameraBuffer(): GPUBuffer {
        if (!this.cameraBuffer) {
            throw new Error('Kamera-Buffer nicht initialisiert');
        }
        return this.cameraBuffer;
    }

    /**
     * 🎱 Kugel-Buffer abrufen
     */
    public getSphereBuffer(): GPUBuffer {
        if (!this.spheresBuffer) {
            throw new Error('Kugel-Buffer nicht initialisiert');
        }
        return this.spheresBuffer;
    }

    /**
     * 📋 Render-Info-Buffer abrufen
     */
    public getRenderInfoBuffer(): GPUBuffer {
        if (!this.renderInfoBuffer) {
            throw new Error('Render-Info-Buffer nicht initialisiert');
        }
        return this.renderInfoBuffer;
    }

    /**
     * 🌍 Scene Config Buffer abrufen
     */
    public getSceneConfigBuffer(): GPUBuffer {
        if (!this.sceneConfigBuffer) {
            throw new Error('Scene Config Buffer nicht initialisiert');
        }
        return this.sceneConfigBuffer;
    }

    /**
     * ✅ Initialisierungs-Status prüfen
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
     * 🧹 Alle Buffers aufräumen
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