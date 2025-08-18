import { Logger } from '../utils/Logger';
import { WEBGPU_CONFIG } from '../utils/Constants';

/**
 * 🔧 WebGPUDevice - WebGPU Initialisierung & Device Management
 * 
 * Verwaltet:
 * - WebGPU-Unterstützung prüfen
 * - GPU-Adapter & Device anfordern
 * - Canvas-Kontext konfigurieren
 * - Error-Handling für WebGPU
 */
export class WebGPUDevice {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private adapter: GPUAdapter | null = null;
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 WebGPU vollständig initialisieren
     */
    public async initialize(canvas: HTMLCanvasElement): Promise<void> {
        try {
            await this.checkWebGPUSupport();
            await this.requestAdapter();
            await this.requestDevice();
            this.setupErrorHandling();
            this.configureCanvas(canvas);

            this.logger.success('WebGPU erfolgreich initialisiert');
        } catch (error) {
            this.logger.error('WebGPU Initialisierung fehlgeschlagen:', error);
            throw error;
        }
    }

    /**
     * ✅ WebGPU-Unterstützung prüfen
     */
    private async checkWebGPUSupport(): Promise<void> {
        if (!navigator.gpu) {
            throw new Error('WebGPU nicht verfügbar - Browser unterstützt WebGPU nicht');
        }
        this.logger.init('WebGPU-Unterstützung erkannt');
    }

    /**
     * 🎯 GPU-Adapter anfordern
     */
    private async requestAdapter(): Promise<void> {
        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: WEBGPU_CONFIG.POWER_PREFERENCE
        });

        if (!this.adapter) {
            throw new Error('Kein WebGPU Adapter verfügbar');
        }

        this.logger.init(`GPU-Adapter erhalten: ${WEBGPU_CONFIG.POWER_PREFERENCE}`);
    }

    /**
     * 🖥️ GPU-Device anfordern
     */
    private async requestDevice(): Promise<void> {
        if (!this.adapter) {
            throw new Error('Adapter nicht verfügbar');
        }

        this.device = await this.adapter.requestDevice();
        this.logger.init('GPU-Device erfolgreich angefordert');
    }

    /**
     * ⚠️ Error-Handling für WebGPU einrichten
     */
    private setupErrorHandling(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.device.addEventListener('uncapturederror', (event) => {
            const error = (event as any).error;
            this.logger.webgpu('Unbehandelter WebGPU-Fehler:', error);
        });

        this.logger.init('WebGPU Error-Handling eingerichtet');
    }

    /**
     * 🖼️ Canvas für WebGPU konfigurieren
     */
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

        this.logger.init(`Canvas konfiguriert: ${presentationFormat}, ${WEBGPU_CONFIG.ALPHA_MODE}`);
    }

    /**
     * 🎯 GPU-Device abrufen
     */
    public getDevice(): GPUDevice {
        if (!this.device) {
            throw new Error('WebGPU Device nicht initialisiert');
        }
        return this.device;
    }

    /**
     * 🖼️ Canvas-Kontext abrufen
     */
    public getContext(): GPUCanvasContext {
        if (!this.context) {
            throw new Error('WebGPU Context nicht initialisiert');
        }
        return this.context;
    }

    /**
     * 📋 Adapter abrufen
     */
    public getAdapter(): GPUAdapter {
        if (!this.adapter) {
            throw new Error('WebGPU Adapter nicht verfügbar');
        }
        return this.adapter;
    }

    /**
     * 📝 Device-Info abrufen
     */
    public getDeviceInfo(): string {
        if (!this.adapter) {
            return 'Kein Adapter verfügbar';
        }

        // Vereinfachte Info - in der Realität könnten mehr Details abgerufen werden
        return `WebGPU Device (${WEBGPU_CONFIG.POWER_PREFERENCE})`;
    }

    /**
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null && this.context !== null;
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        // WebGPU Device kann nicht explizit zerstört werden
        // Aber wir können Referenzen löschen
        this.device = null;
        this.context = null;
        this.adapter = null;

        this.logger.init('WebGPU Device Ressourcen aufgeräumt');
    }
}