import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize } from "../utils/Constants";
import { Logger } from "../utils/Logger";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== GPU BUFFERS =====
    private cameraBuffer: GPUBuffer | null = null;
    private sphereBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null; // NEU

    // ===== BUFFER-DATEN CACHE =====
    private cameraData: Float32Array | null = null;
    private sphereData: Float32Array | null = null;

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
        this.sphereData = sphereData;

        this.logger.buffer('Erstelle GPU-Buffers...');

        this.createCameraBuffer();
        this.createSphereBuffer();
        this.createRenderInfoBuffer(canvasWidth, canvasHeight);
        this.createCacheBuffer(canvasWidth, canvasHeight);
        this.createAccumulationBuffer(canvasWidth, canvasHeight); // NEU

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
    private createSphereBuffer(): void {
        if (!this.device || !this.sphereData) {
            throw new Error('Device oder Kugel-Daten nicht verfügbar');
        }

        this.logger.buffer('Erstelle Kugel-Buffer...');

        this.sphereBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SPHERE.LABEL,
            size: BUFFER_CONFIG.SPHERE.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(this.sphereBuffer, 0, new Float32Array(this.sphereData));

        this.logger.success(`Kugel-Buffer erstellt: ${BUFFER_CONFIG.SPHERE.SIZE} bytes`);
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

        this.logger.cache('Erstelle Farb-Cache-Buffer...');

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
     * 🎯 Accumulation-Buffer erstellen (NEU)
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
        if (!this.device || !this.sphereBuffer) {
            throw new Error('Device oder Kugel-Buffer nicht verfügbar');
        }

        this.sphereData = newSphereData;
        this.device.queue.writeBuffer(this.sphereBuffer, 0, new Float32Array(this.sphereData));
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
        sphere: GPUBuffer;
        renderInfo: GPUBuffer;
        cache: GPUBuffer;
        accumulation: GPUBuffer; // NEU
    } {
        if (!this.cameraBuffer || !this.sphereBuffer || !this.renderInfoBuffer ||
            !this.cacheBuffer || !this.accumulationBuffer) {
            throw new Error('Nicht alle Buffers sind initialisiert');
        }

        return {
            camera: this.cameraBuffer,
            sphere: this.sphereBuffer,
            renderInfo: this.renderInfoBuffer,
            cache: this.cacheBuffer,
            accumulation: this.accumulationBuffer, // NEU
        };
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
        if (!this.sphereBuffer) {
            throw new Error('Kugel-Buffer nicht initialisiert');
        }
        return this.sphereBuffer;
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
            this.sphereBuffer !== null &&
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

        if (this.sphereBuffer) {
            this.sphereBuffer.destroy();
            this.sphereBuffer = null;
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

        this.logger.buffer('Alle GPU-Buffers aufgeräumt');
    }
}