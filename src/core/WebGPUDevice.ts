import { Logger } from '../utils/Logger';
import { WEBGPU_CONFIG } from '../utils/Constants';

export class WebGPUDevice {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private adapter: GPUAdapter | null = null;
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        try {
            await this.checkWebGPUSupport();
            await this.requestAdapter();
            await this.requestDevice();
            this.setupErrorHandling();
            this.configureCanvas(canvas);
        } catch (error) {
            this.logger.error('WebGPU Initialisierung fehlgeschlagen:', error);
            throw error;
        }
    }

    private async checkWebGPUSupport(): Promise<void> {
        if (!navigator.gpu) {
            throw new Error('WebGPU nicht verfügbar - Browser unterstützt WebGPU nicht');
        }
    }

    private async requestAdapter(): Promise<void> {
        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: WEBGPU_CONFIG.POWER_PREFERENCE
        });

        if (!this.adapter) {
            throw new Error('Kein WebGPU Adapter verfügbar');
        }
    }

    private async requestDevice(): Promise<void> {
        if (!this.adapter) {
            throw new Error('Adapter nicht verfügbar');
        }

        this.device = await this.adapter.requestDevice();
    }

    private setupErrorHandling(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.device.addEventListener('uncapturederror', (event) => {
            const error = (event as any).error;
            this.logger.error('WebGPU-Fehler:', error);
        });
    }

    private configureCanvas(canvas: HTMLCanvasElement): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.context = canvas.getContext('webgpu') as GPUCanvasContext;
        if (!this.context) {
            throw new Error('WebGPU-Kontext konnte nicht erstellt werden');
        }

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: WEBGPU_CONFIG.ALPHA_MODE
        });
    }

    public getDevice(): GPUDevice {
        if (!this.device) {
            throw new Error('WebGPU Device nicht initialisiert');
        }
        return this.device;
    }

    public getContext(): GPUCanvasContext {
        if (!this.context) {
            throw new Error('WebGPU Context nicht initialisiert');
        }
        return this.context;
    }

    public getAdapter(): GPUAdapter {
        if (!this.adapter) {
            throw new Error('WebGPU Adapter nicht verfügbar');
        }
        return this.adapter;
    }

    public isInitialized(): boolean {
        return this.device !== null && this.context !== null;
    }

    public cleanup(): void {
        this.device = null;
        this.context = null;
        this.adapter = null;
    }
}