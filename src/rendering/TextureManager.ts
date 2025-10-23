import { Logger } from '../utils/Logger';
import { TEXTURE_CONFIG } from '../utils/Constants';

export class TextureManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private renderTexture: GPUTexture | null = null;
    private sampler: GPUSampler | null = null;

    private textureWidth: number = 0;
    private textureHeight: number = 0;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public initialize(device: GPUDevice, width: number, height: number): void {
        this.device = device;
        this.textureWidth = width;
        this.textureHeight = height;

        this.createRenderTexture();
        this.createSampler();
    }

    private createRenderTexture(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

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
    }

    private createSampler(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.sampler = this.device.createSampler({
            label: 'Render Texture Sampler',
            magFilter: TEXTURE_CONFIG.SAMPLER.MAG_FILTER,
            minFilter: TEXTURE_CONFIG.SAMPLER.MIN_FILTER,
            mipmapFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            addressModeW: 'clamp-to-edge'
        });
    }

    public resize(newWidth: number, newHeight: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        if (newWidth === this.textureWidth && newHeight === this.textureHeight) {
            return;
        }

        if (this.renderTexture) {
            this.renderTexture.destroy();
        }

        this.textureWidth = newWidth;
        this.textureHeight = newHeight;
        this.createRenderTexture();
    }

    public getRenderTexture(): GPUTexture {
        if (!this.renderTexture) {
            throw new Error('Render-Texture nicht initialisiert');
        }
        return this.renderTexture;
    }

    public getSampler(): GPUSampler {
        if (!this.sampler) {
            throw new Error('Sampler nicht initialisiert');
        }
        return this.sampler;
    }

    public getDimensions(): { width: number; height: number } {
        return {
            width: this.textureWidth,
            height: this.textureHeight
        };
    }

    public isInitialized(): boolean {
        return this.device !== null &&
            this.renderTexture !== null &&
            this.sampler !== null;
    }

    public cleanup(): void {
        if (this.renderTexture) {
            this.renderTexture.destroy();
            this.renderTexture = null;
        }

        this.sampler = null;
        this.device = null;
        this.textureWidth = 0;
        this.textureHeight = 0;
    }
}