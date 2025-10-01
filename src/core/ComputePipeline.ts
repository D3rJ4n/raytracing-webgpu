import { Logger } from '../utils/Logger';
import { SHADER_CONFIG, BINDING_CONFIG } from '../utils/Constants';

/**
 * ⚡ ComputePipeline - Compute Pipeline Management
 * 
 * Verwaltet:
 * - Compute Shader laden & kompilieren
 * - Bind Group Layout für Compute Pipeline
 * - Compute Pipeline erstellen
 * - Bind Group für Raytracing-Daten
 */
export class ComputePipeline {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== PIPELINE KOMPONENTEN =====
    private computeModule: GPUShaderModule | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Compute Pipeline initialisieren
     */
    public async initialize(
        device: GPUDevice,
        buffers: {
            camera: GPUBuffer;
            sphere: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): Promise<void> {
        this.device = device;

        try {
            this.logger.pipeline('Erstelle Compute Pipeline...');

            // Schritt 1: Compute Shader laden
            await this.loadComputeShader();

            // Schritt 2: Bind Group Layout erstellen
            this.createBindGroupLayout();

            // Schritt 3: Compute Pipeline erstellen
            this.createComputePipeline();

            // Schritt 4: Bind Group erstellen
            this.createBindGroup(buffers, outputTexture);

            this.logger.success('Compute Pipeline erfolgreich erstellt');

        } catch (error) {
            this.logger.error('Fehler beim Erstellen der Compute Pipeline:', error);
            throw error;
        }
    }

    /**
     * 📁 Compute Shader laden und kompilieren
     */
    private async loadComputeShader(): Promise<void> {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Lade Compute Shader...');

        try {
            // Shader-Code von Datei laden
            const shaderCode = await fetch(SHADER_CONFIG.PATHS.COMPUTE).then(r => r.text());

            this.logger.pipeline(`Shader geladen: ${SHADER_CONFIG.PATHS.COMPUTE}`);

            // Shader-Module erstellen
            this.computeModule = this.device.createShaderModule({
                label: SHADER_CONFIG.LABELS.COMPUTE_MODULE,
                code: shaderCode
            });

            this.logger.success('Compute Shader kompiliert');

        } catch (error) {
            this.logger.error('Fehler beim Laden des Compute Shaders:', error);
            throw new Error(`Compute Shader konnte nicht geladen werden: ${error}`);
        }
    }

    /**
     * 🏗️ Bind Group Layout erstellen
     */
    private createBindGroupLayout(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Compute Bind Group Layout...');

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Compute Bind Group Layout',
            entries: [
                // Binding 0: Kamera-Daten (uniform buffer)
                {
                    binding: BINDING_CONFIG.COMPUTE.CAMERA,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                // Binding 1: Kugel-Daten (uniform buffer)
                {
                    binding: BINDING_CONFIG.COMPUTE.SPHERE,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                // Binding 2: Render-Info (uniform buffer)
                {
                    binding: BINDING_CONFIG.COMPUTE.RENDER_INFO,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                // Binding 3: Output-Texture (storage texture, write-only)
                {
                    binding: BINDING_CONFIG.COMPUTE.OUTPUT_TEXTURE,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba8unorm',
                        viewDimension: '2d'
                    }
                },
                // Binding 4: Cache-Buffer (storage buffer)
                {
                    binding: BINDING_CONFIG.COMPUTE.CACHE_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                // Binding 5: Accumulation-Buffer (storage buffer) - NEU!
                {
                    binding: BINDING_CONFIG.COMPUTE.ACCUMULATION_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                // Binding 6: Scene Config
                {
                    binding: BINDING_CONFIG.COMPUTE.SCENE_CONFIG,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                }
            ]
        });

        this.logger.success('Compute Bind Group Layout erstellt (mit Cache)');
    }

    /**
     * ⚡ Compute Pipeline erstellen
     */
    private createComputePipeline(): void {
        if (!this.device || !this.computeModule || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Compute Pipeline...');

        this.pipeline = this.device.createComputePipeline({
            label: SHADER_CONFIG.LABELS.COMPUTE_PIPELINE,
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            }),
            compute: {
                module: this.computeModule,
                entryPoint: 'main'
            }
        });

        this.logger.success('Compute Pipeline erstellt');
    }

    /**
     * 🔗 Bind Group erstellen
     */
    private createBindGroup(
        buffers: {
            camera: GPUBuffer;
            sphere: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Compute Bind Group...');

        this.bindGroup = this.device.createBindGroup({
            label: 'Compute Bind Group',
            layout: this.bindGroupLayout,
            entries: [
                {
                    binding: BINDING_CONFIG.COMPUTE.CAMERA,
                    resource: { buffer: buffers.camera }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SPHERE,
                    resource: { buffer: buffers.sphere }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.RENDER_INFO,
                    resource: { buffer: buffers.renderInfo }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.OUTPUT_TEXTURE,
                    resource: outputTexture.createView()
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.CACHE_BUFFER,
                    resource: { buffer: buffers.cache }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.ACCUMULATION_BUFFER,
                    resource: { buffer: buffers.accumulation }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SCENE_CONFIG,
                    resource: { buffer: buffers.sceneConfig }
                }
            ]
        });

        this.logger.success('Compute Bind Group erstellt');
    }

    /**
     * 🔄 Bind Group aktualisieren (z.B. bei geänderten Buffern)
     */
    public updateBindGroup(
        buffers: {
            camera: GPUBuffer;
            sphere: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Pipeline nicht initialisiert');
        }

        this.logger.pipeline('Aktualisiere Compute Bind Group...');
        this.createBindGroup(buffers, outputTexture);
        this.logger.success('Compute Bind Group aktualisiert');
    }

    /**
     * 📊 Pipeline-Informationen abrufen
     */
    public getInfo(): {
        isInitialized: boolean;
        shaderPath: string;
        workgroupSize: { x: number; y: number; z: number };
        bindingCount: number;
    } {
        return {
            isInitialized: this.isInitialized(),
            shaderPath: SHADER_CONFIG.PATHS.COMPUTE,
            workgroupSize: {
                x: SHADER_CONFIG.WORKGROUP_SIZE.X,
                y: SHADER_CONFIG.WORKGROUP_SIZE.Y,
                z: SHADER_CONFIG.WORKGROUP_SIZE.Z
            },
            bindingCount: 7
        };
    }

    /**
     * ⚡ Compute Pipeline abrufen
     */
    public getPipeline(): GPUComputePipeline {
        if (!this.pipeline) {
            throw new Error('Compute Pipeline nicht initialisiert');
        }
        return this.pipeline;
    }

    /**
     * 🔗 Bind Group abrufen
     */
    public getBindGroup(): GPUBindGroup {
        if (!this.bindGroup) {
            throw new Error('Compute Bind Group nicht initialisiert');
        }
        return this.bindGroup;
    }

    /**
     * 🏗️ Bind Group Layout abrufen
     */
    public getBindGroupLayout(): GPUBindGroupLayout {
        if (!this.bindGroupLayout) {
            throw new Error('Compute Bind Group Layout nicht initialisiert');
        }
        return this.bindGroupLayout;
    }

    /**
     * 📁 Shader Module abrufen
     */
    public getShaderModule(): GPUShaderModule {
        if (!this.computeModule) {
            throw new Error('Compute Shader Module nicht initialisiert');
        }
        return this.computeModule;
    }

    /**
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null &&
            this.computeModule !== null &&
            this.bindGroupLayout !== null &&
            this.pipeline !== null &&
            this.bindGroup !== null;
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        // WebGPU Ressourcen können nicht explizit zerstört werden
        // Aber wir können Referenzen löschen
        this.computeModule = null;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.bindGroup = null;
        this.device = null;

        this.logger.pipeline('Compute Pipeline aufgeräumt');
    }
}