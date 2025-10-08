import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, getSphereCount, SCENE_CONFIG } from "../utils/Constants";
import { Logger } from "../utils/Logger";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== GPU BUFFERS =====
    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null; // NEU
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
        sphereData: Float32Array
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
        this.createSceneConfigBuffer();

        this.logger.success('Alle GPU-Buffers erfolgreich erstellt');
    }

    /**
    * 🔄 Spheres-Daten aktualisieren (NEU)
     */
    public updateSpheresData(newSpheresData: Float32Array): void {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('Device oder Spheres-Buffer nicht verfügbar');
        }

        this.spheresData = newSpheresData;
        this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(this.spheresData));
        this.logger.buffer('Spheres-Daten aktualisiert');
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
            size: BUFFER_CONFIG.CAMERA.SIZE, // 48 bytes für erweiterte Daten
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Initial mit Basis-Daten füllen (erweiterte Daten kommen später)
        const extendedData = new Float32Array(12); // 48 bytes / 4
        extendedData.set(this.cameraData.slice(0, 8), 0); // position + lookAt
        extendedData[8] = 0; // randomSeed1
        extendedData[9] = 0; // randomSeed2
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

        this.logger.success(`Spheres-Buffer erstellt: ${BUFFER_CONFIG.SPHERES.SIZE} bytes für ${getSphereCount()} Kugeln`);
        this.logger.buffer('Sphere-Count:', getSphereCount());
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
        // Größe des Buffers berechnen
        const bufferSize = calculateCacheBufferSize(width, height);
        // Buffer erstellen
        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
        // Füllt den Cache-Buffer initial mit Nullen
        const cacheData = new Uint32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0);
        // Das kopiert die Nullen vom CPU-RAM → GPU-VRAM
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Farb-Cache-Buffer erstellt: ${bufferSize.toLocaleString()} bytes`);
    }

    /**
 * 🌍 Scene Config Buffer erstellen
 */
    private createSceneConfigBuffer(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle Scene Config Buffer...');

        this.sceneConfigBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SCENE_CONFIG.LABEL,
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        /**
         * 🎯 SceneConfig-Buffer erstellen
         */
        const sceneConfigData = new Float32Array([
            SCENE_CONFIG.GROUND.Y_POSITION,      // Ground Plane Y-Position
            0, 0, 0,                              // Padding
            SCENE_CONFIG.LIGHTING.POSITION.x,    // Light Position X
            SCENE_CONFIG.LIGHTING.POSITION.y,    // Light Position Y
            SCENE_CONFIG.LIGHTING.POSITION.z,    // Light Position Z
            SCENE_CONFIG.LIGHTING.SHADOW_ENABLED ? 1.0 : 0.0, // Shadow Enable Flag

            SCENE_CONFIG.REFLECTIONS.ENABLED ? 1.0 : 0.0,      // [8] NEU
            SCENE_CONFIG.REFLECTIONS.MAX_BOUNCES,              // [9] NEU
            SCENE_CONFIG.REFLECTIONS.MIN_CONTRIBUTION,         // [10] NEU
            0,
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);

        this.logger.success(`Scene Config Buffer erstellt: ${BUFFER_CONFIG.SCENE_CONFIG.SIZE} bytes`);
        this.logger.buffer('Ground Y:', SCENE_CONFIG.GROUND.Y_POSITION);
        this.logger.buffer('Light Pos:', SCENE_CONFIG.LIGHTING.POSITION);
        this.logger.buffer('Shadows:', SCENE_CONFIG.LIGHTING.SHADOW_ENABLED);
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

        // Mit Nullen initialisieren
        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);

        this.logger.success(`Accumulation-Buffer erstellt: ${bufferSize.toLocaleString()} bytes`);
        this.logger.buffer('Speichert: RGB-Akkumulation + Sample-Count pro Pixel');
    }

    /**
     * 🔄 Kamera-Daten aktualisieren
     */
    public updateCameraData(newCameraData: Float32Array): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Device oder Kamera-Buffer nicht verfügbar');
        }

        this.cameraData = newCameraData;

        // Erweiterte Daten mit alten Random Seeds beibehalten
        const extendedData = new Float32Array(12);
        extendedData.set(newCameraData.slice(0, 8), 0);
        extendedData[8] = 0; // Wird von updateCameraDataWithRandomSeeds gesetzt
        extendedData[9] = 0;
        extendedData[10] = 0;
        extendedData[11] = 0;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
        this.logger.buffer('Kamera-Daten aktualisiert');
    }

    /**
     * 🎲 Kamera-Daten mit Random Seeds aktualisieren (NEU)
     */
    public updateCameraDataWithRandomSeeds(
        baseCameraData: Float32Array,
        sampleCount: number
    ): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Device oder Kamera-Buffer nicht verfügbar');
        }

        // Erweiterte Kamera-Daten: [position(3), pad, lookAt(3), pad, seed1, seed2, sampleCount, pad]
        const extendedData = new Float32Array(12);

        // Original-Daten kopieren (position + lookAt)
        extendedData.set(baseCameraData.slice(0, 8), 0);

        // Random Seeds hinzufügen (ändern sich jeden Frame für Jittering)
        extendedData[8] = Math.random(); // randomSeed1
        extendedData[9] = Math.random(); // randomSeed2

        // Sample Count
        extendedData[10] = sampleCount;
        extendedData[11] = 0; // padding

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
    }

    /**
     * 🔄 Kugel-Daten aktualisieren
     */
    public updateSphereData(newSphereData: Float32Array): void {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('Device oder Kugel-Buffer nicht verfügbar');
        }

        this.spheresData = newSphereData;
        this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(this.spheresData));
        this.logger.buffer('Kugel-Daten aktualisiert');
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
     * 🔄 Accumulation Buffer zurücksetzen (NEU)
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
     * 🎱 Spheres-Buffer abrufen (NEU)
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
     * 🎯 Accumulation-Buffer abrufen (NEU)
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
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.cameraBuffer !== null &&
            this.spheresBuffer !== null &&
            this.renderInfoBuffer !== null &&
            this.cacheBuffer !== null &&
            this.accumulationBuffer !== null; // NEU
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