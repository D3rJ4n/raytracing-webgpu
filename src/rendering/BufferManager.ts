import { Logger } from '../utils/Logger';
import { BUFFER_CONFIG, calculateCacheBufferSize } from '../utils/Constants';

/**
 * 📦 BufferManager - GPU Buffer Management
 * 
 * Verwaltet alle GPU-Buffers:
 * - Kamera-Buffer (Uniform)
 * - Kugel-Buffer (Uniform)  
 * - Render-Info-Buffer (Uniform)
 * - Cache-Buffer (Storage)
 */
export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== GPU BUFFERS =====
    private cameraBuffer: GPUBuffer | null = null;
    private sphereBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;

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

        // Fix: Create new Float32Array to ensure ArrayBuffer backing
        this.device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array(this.cameraData));

        this.logger.success(`Kamera-Buffer erstellt: ${BUFFER_CONFIG.CAMERA.SIZE} bytes`);
        this.logger.buffer('Kamera-Daten:', Array.from(this.cameraData));
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

        // Fix: Create new Float32Array to ensure ArrayBuffer backing
        this.device.queue.writeBuffer(this.sphereBuffer, 0, new Float32Array(this.sphereData));

        this.logger.success(`Kugel-Buffer erstellt: ${BUFFER_CONFIG.SPHERE.SIZE} bytes`);
        this.logger.buffer('Kugel-Daten:', Array.from(this.sphereData));
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

        // Bildschirm-Daten erstellen
        const renderInfoData = new Uint32Array([
            width,   // Breite
            height,  // Höhe
            0,       // Padding
            0        // Padding
        ]);

        // Daten zur GPU senden
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);

        this.logger.success(`Render-Info-Buffer erstellt: ${BUFFER_CONFIG.RENDER_INFO.SIZE} bytes`);
        this.logger.buffer('Render-Info-Daten:', Array.from(renderInfoData));
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

        this.logger.cache(`Pixel-Anzahl: ${pixelCount.toLocaleString()}`);

        // Farb-Cache: Pro Pixel 4 uint (16 bytes): [R, G, B, Valid]
        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        // Cache explizit auf 0 (INVALID) setzen
        const cacheData = new Uint32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);

        this.logger.success(`Farb-Cache-Buffer erstellt: ${bufferSize.toLocaleString()} bytes`);
        this.logger.cache('Speichert: RGBA-Farben + Valid-Flag pro Pixel');
    }

    /**
     * 🔄 Kamera-Daten aktualisieren
     */
    public updateCameraData(newCameraData: Float32Array): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Device oder Kamera-Buffer nicht verfügbar');
        }

        this.cameraData = newCameraData;
        // Fix: Create new Float32Array to ensure ArrayBuffer backing
        this.device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array(this.cameraData));
        this.logger.buffer('Kamera-Daten aktualisiert');
    }

    /**
     * 🔄 Kugel-Daten aktualisieren
     */
    public updateSphereData(newSphereData: Float32Array): void {
        if (!this.device || !this.sphereBuffer) {
            throw new Error('Device oder Kugel-Buffer nicht verfügbar');
        }

        this.sphereData = newSphereData;
        // Fix: Create new Float32Array to ensure ArrayBuffer backing
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
     * 📋 Alle Buffers für Bind Group abrufen
     */
    public getAllBuffers(): {
        camera: GPUBuffer;
        sphere: GPUBuffer;
        renderInfo: GPUBuffer;
        cache: GPUBuffer;
    } {
        if (!this.cameraBuffer || !this.sphereBuffer || !this.renderInfoBuffer || !this.cacheBuffer) {
            throw new Error('Nicht alle Buffers sind initialisiert');
        }

        return {
            camera: this.cameraBuffer,
            sphere: this.sphereBuffer,
            renderInfo: this.renderInfoBuffer,
            cache: this.cacheBuffer
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
            this.cacheBuffer !== null;
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

        this.logger.buffer('Alle GPU-Buffers aufgeräumt');
    }
}