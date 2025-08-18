import { Logger } from '../utils/Logger';
import { TEXTURE_CONFIG } from '../utils/Constants';

/**
 * 🖼️ TextureManager - Texture & Sampler Management
 * 
 * Verwaltet:
 * - Render-Texture für Raytracing-Output
 * - Sampler für Texture-Filtering
 * - Texture-Erstellung und -Konfiguration
 */
export class TextureManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== TEXTURES =====
    private renderTexture: GPUTexture | null = null;
    private sampler: GPUSampler | null = null;

    // ===== TEXTURE-EIGENSCHAFTEN =====
    private textureWidth: number = 0;
    private textureHeight: number = 0;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Texture Manager initialisieren
     */
    public initialize(device: GPUDevice, width: number, height: number): void {
        this.device = device;
        this.textureWidth = width;
        this.textureHeight = height;

        this.logger.pipeline('Erstelle Texturen und Sampler...');

        this.createRenderTexture();
        this.createSampler();

        this.logger.success('Texturen und Sampler erstellt');
    }

    /**
     * 🖼️ Render-Texture erstellen
     */
    private createRenderTexture(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Render-Texture...');

        this.renderTexture = this.device.createTexture({
            label: TEXTURE_CONFIG.LABEL,
            size: {
                width: this.textureWidth,
                height: this.textureHeight,
                depthOrArrayLayers: 1
            },
            format: TEXTURE_CONFIG.FORMAT,
            usage: TEXTURE_CONFIG.USAGE.RENDER,
            dimension: '2d',
            mipLevelCount: 1
        });

        this.logger.success(
            `Render-Texture erstellt: ${this.textureWidth}x${this.textureHeight}, Format: ${TEXTURE_CONFIG.FORMAT}`
        );
    }

    /**
     * 🔍 Sampler erstellen
     */
    private createSampler(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Sampler...');

        this.sampler = this.device.createSampler({
            label: 'Render Texture Sampler',
            magFilter: TEXTURE_CONFIG.SAMPLER.MAG_FILTER,
            minFilter: TEXTURE_CONFIG.SAMPLER.MIN_FILTER,
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            addressModeW: 'clamp-to-edge'
        });

        this.logger.success(
            `Sampler erstellt: ${TEXTURE_CONFIG.SAMPLER.MAG_FILTER}/${TEXTURE_CONFIG.SAMPLER.MIN_FILTER}`
        );
    }

    /**
     * 🔄 Texture-Größe ändern
     */
    public resize(newWidth: number, newHeight: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        if (newWidth === this.textureWidth && newHeight === this.textureHeight) {
            this.logger.pipeline('Texture-Größe unverändert');
            return;
        }

        this.logger.pipeline(`Resize Texture: ${this.textureWidth}x${this.textureHeight} → ${newWidth}x${newHeight}`);

        // Alte Texture aufräumen
        if (this.renderTexture) {
            this.renderTexture.destroy();
        }

        // Neue Größe setzen
        this.textureWidth = newWidth;
        this.textureHeight = newHeight;

        // Neue Texture erstellen
        this.createRenderTexture();

        this.logger.success('Texture erfolgreich resized');
    }

    /**
     * 🖼️ Texture View erstellen
     */
    public createTextureView(
        format?: GPUTextureFormat,
        aspect?: GPUTextureAspect
    ): GPUTextureView {
        if (!this.renderTexture) {
            throw new Error('Render-Texture nicht initialisiert');
        }

        return this.renderTexture.createView({
            format: format || TEXTURE_CONFIG.FORMAT,
            aspect: aspect || 'all',
            dimension: '2d',
            mipLevelCount: 1,
            arrayLayerCount: 1
        });
    }

    /**
     * 📊 Texture-Informationen abrufen
     */
    public getTextureInfo(): {
        width: number;
        height: number;
        format: GPUTextureFormat;
        usage: GPUTextureUsageFlags;
        isInitialized: boolean;
    } {
        return {
            width: this.textureWidth,
            height: this.textureHeight,
            format: TEXTURE_CONFIG.FORMAT,
            usage: TEXTURE_CONFIG.USAGE.RENDER,
            isInitialized: this.renderTexture !== null
        };
    }

    /**
     * 📊 Sampler-Informationen abrufen
     */
    public getSamplerInfo(): {
        magFilter: GPUFilterMode;
        minFilter: GPUFilterMode;
        addressMode: string;
        isInitialized: boolean;
    } {
        return {
            magFilter: TEXTURE_CONFIG.SAMPLER.MAG_FILTER,
            minFilter: TEXTURE_CONFIG.SAMPLER.MIN_FILTER,
            addressMode: 'clamp-to-edge',
            isInitialized: this.sampler !== null
        };
    }

    /**
     * 🖼️ Render-Texture abrufen
     */
    public getRenderTexture(): GPUTexture {
        if (!this.renderTexture) {
            throw new Error('Render-Texture nicht initialisiert');
        }
        return this.renderTexture;
    }

    /**
     * 🔍 Sampler abrufen
     */
    public getSampler(): GPUSampler {
        if (!this.sampler) {
            throw new Error('Sampler nicht initialisiert');
        }
        return this.sampler;
    }

    /**
     * 🔍 Texture-Dimensionen abrufen
     */
    public getDimensions(): { width: number; height: number } {
        return {
            width: this.textureWidth,
            height: this.textureHeight
        };
    }

    /**
     * 🎨 Zusätzliche Texture erstellen (für erweiterte Features)
     */
    public createAdditionalTexture(
        label: string,
        width: number,
        height: number,
        format: GPUTextureFormat = 'rgba8unorm',
        usage: GPUTextureUsageFlags = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    ): GPUTexture {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline(`Erstelle zusätzliche Texture: ${label}`);

        const texture = this.device.createTexture({
            label,
            size: { width, height, depthOrArrayLayers: 1 },
            format,
            usage,
            dimension: '2d',
            mipLevelCount: 1
        });

        this.logger.success(`Zusätzliche Texture erstellt: ${label} (${width}x${height})`);
        return texture;
    }

    /**
     * 🔍 Zusätzlichen Sampler erstellen
     */
    public createAdditionalSampler(
        label: string,
        magFilter: GPUFilterMode = 'linear',
        minFilter: GPUFilterMode = 'linear',
        addressMode: GPUAddressMode = 'clamp-to-edge'
    ): GPUSampler {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline(`Erstelle zusätzlichen Sampler: ${label}`);

        const sampler = this.device.createSampler({
            label,
            magFilter,
            minFilter,
            mipmapFilter: 'linear',
            addressModeU: addressMode,
            addressModeV: addressMode,
            addressModeW: addressMode
        });

        this.logger.success(`Zusätzlicher Sampler erstellt: ${label}`);
        return sampler;
    }

    /**
     * 💾 Texture-Daten von GPU lesen (für Debugging)
     */
    public async readTextureData(): Promise<Uint8Array> {
        if (!this.device || !this.renderTexture) {
            throw new Error('Texture Manager nicht initialisiert');
        }

        this.logger.pipeline('Lese Texture-Daten von GPU...');

        try {
            // Buffer für Texture-Daten erstellen
            const bytesPerPixel = 4; // RGBA8
            const bufferSize = this.textureWidth * this.textureHeight * bytesPerPixel;

            const stagingBuffer = this.device.createBuffer({
                size: bufferSize,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });

            // Command Encoder für Texture → Buffer Copy
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyTextureToBuffer(
                { texture: this.renderTexture },
                { buffer: stagingBuffer, bytesPerRow: this.textureWidth * bytesPerPixel },
                { width: this.textureWidth, height: this.textureHeight }
            );
            this.device.queue.submit([commandEncoder.finish()]);

            // Daten lesen
            await stagingBuffer.mapAsync(GPUMapMode.READ);
            const arrayBuffer = stagingBuffer.getMappedRange();
            const textureData = new Uint8Array(arrayBuffer.slice(0)); // Create copy

            // Buffer aufräumen
            stagingBuffer.unmap();
            stagingBuffer.destroy();

            this.logger.success(`Texture-Daten gelesen: ${bufferSize} bytes`);
            return textureData;

        } catch (error) {
            this.logger.error('Fehler beim Lesen der Texture-Daten:', error);
            throw error;
        }
    }

    /**
     * 📸 Texture als ImageData exportieren (für Save/Debug)
     */
    public async exportAsImageData(): Promise<ImageData> {
        const textureData = await this.readTextureData();

        // Uint8ClampedArray für ImageData erstellen
        const imageArray = new Uint8ClampedArray(textureData);

        return new ImageData(imageArray, this.textureWidth, this.textureHeight);
    }

    /**
     * 💾 Texture als Blob exportieren (für Download)
     */
    public async exportAsBlob(type: string = 'image/png'): Promise<Blob> {
        const imageData = await this.exportAsImageData();

        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = this.textureWidth;
            canvas.height = this.textureHeight;

            const ctx = canvas.getContext('2d')!;
            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob((blob) => {
                resolve(blob!);
            }, type);
        });
    }

    /**
     * 📄 Texture als Datei herunterladen
     */
    public async downloadTexture(filename: string = 'raytraced_image.png'): Promise<void> {
        this.logger.pipeline(`Download Texture als: ${filename}`);

        try {
            const blob = await this.exportAsBlob();

            // Download-Link erstellen
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();

            // URL aufräumen
            URL.revokeObjectURL(url);

            this.logger.success(`Texture heruntergeladen: ${filename}`);

        } catch (error) {
            this.logger.error('Fehler beim Download der Texture:', error);
            throw error;
        }
    }

    /**
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null &&
            this.renderTexture !== null &&
            this.sampler !== null;
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        if (this.renderTexture) {
            this.renderTexture.destroy();
            this.renderTexture = null;
        }

        // Sampler kann nicht explizit zerstört werden
        this.sampler = null;
        this.device = null;

        this.textureWidth = 0;
        this.textureHeight = 0;

        this.logger.pipeline('Texture Manager aufgeräumt');
    }
}