import { Logger } from '../utils/Logger';
import { SHADER_CONFIG, BINDING_CONFIG } from '../utils/Constants';

/**
 * 🎨 RenderPipeline - Render Pipeline Management
 * 
 * Verwaltet:
 * - Vertex & Fragment Shader laden & kompilieren
 * - Bind Group Layout für Render Pipeline
 * - Render Pipeline erstellen
 * - Bind Group für Texture/Sampler
 */
export class RenderPipeline {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== PIPELINE KOMPONENTEN =====
    private renderModule: GPUShaderModule | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     *  Render Pipeline initialisieren
     */
    public async initialize(
        device: GPUDevice,
        inputTexture: GPUTexture,
        sampler: GPUSampler
    ): Promise<void> {
        this.device = device;

        try {
            this.logger.pipeline('Erstelle Render Pipeline...');

            // Schritt 1: Render Shader laden
            await this.loadRenderShader();

            // Schritt 2: Bind Group Layout erstellen
            this.createBindGroupLayout();

            // Schritt 3: Render Pipeline erstellen
            this.createRenderPipeline();

            // Schritt 4: Bind Group erstellen
            this.createBindGroup(inputTexture, sampler);

            this.logger.success('Render Pipeline erfolgreich erstellt');

        } catch (error) {
            this.logger.error('Fehler beim Erstellen der Render Pipeline:', error);
            throw error;
        }
    }

    /**
     *  Render Shader laden und kompilieren
     */
    private async loadRenderShader(): Promise<void> {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Lade Render Shader...');

        try {
            // Shader-Code von Datei laden
            const shaderCode = await fetch(SHADER_CONFIG.PATHS.RENDER).then(r => r.text());

            this.logger.pipeline(`Shader geladen: ${SHADER_CONFIG.PATHS.RENDER}`);

            // Shader-Module erstellen
            this.renderModule = this.device.createShaderModule({
                label: SHADER_CONFIG.LABELS.RENDER_MODULE,
                code: shaderCode
            });

            this.logger.success('Render Shader kompiliert');

        } catch (error) {
            this.logger.error('Fehler beim Laden des Render Shaders:', error);
            throw new Error(`Render Shader konnte nicht geladen werden: ${error}`);
        }
    }

    /**
     *  Bind Group Layout erstellen
     */
    private createBindGroupLayout(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Render Bind Group Layout...');

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Render Bind Group Layout',
            entries: [
                // Binding 0: Input-Texture (das Raytracing-Ergebnis)
                {
                    binding: BINDING_CONFIG.RENDER.INPUT_TEXTURE,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                        viewDimension: '2d'
                    }
                },
                // Binding 1: Sampler (wie die Texture gelesen wird)
                {
                    binding: BINDING_CONFIG.RENDER.SAMPLER,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'filtering'
                    }
                }
            ]
        });

        this.logger.success('Render Bind Group Layout erstellt');
    }

    /**
     *  Render Pipeline erstellen
     */
    private createRenderPipeline(): void {
        if (!this.device || !this.renderModule || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Render Pipeline...');

        this.pipeline = this.device.createRenderPipeline({
            label: SHADER_CONFIG.LABELS.RENDER_PIPELINE,
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            }),
            // Vertex Shader Konfiguration
            vertex: {
                module: this.renderModule,
                entryPoint: 'vs_main'
            },
            // Fragment Shader Konfiguration
            fragment: {
                module: this.renderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            // Primitive-Konfiguration
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none'
            }
        });

        this.logger.success('Render Pipeline erstellt');
    }

    /**
     *  Bind Group erstellen
     */
    private createBindGroup(inputTexture: GPUTexture, sampler: GPUSampler): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Render Bind Group...');

        this.bindGroup = this.device.createBindGroup({
            label: 'Render Bind Group',
            layout: this.bindGroupLayout,
            entries: [
                {
                    binding: BINDING_CONFIG.RENDER.INPUT_TEXTURE,
                    resource: inputTexture.createView()
                },
                {
                    binding: BINDING_CONFIG.RENDER.SAMPLER,
                    resource: sampler
                }
            ]
        });

        this.logger.success('Render Bind Group erstellt');
    }

    /**
     * Bind Group aktualisieren (z.B. bei neuer Texture)
     */
    public updateBindGroup(inputTexture: GPUTexture, sampler: GPUSampler): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Pipeline nicht initialisiert');
        }

        this.logger.pipeline('Aktualisiere Render Bind Group...');
        this.createBindGroup(inputTexture, sampler);
        this.logger.success('Render Bind Group aktualisiert');
    }

    /**
     *  Pipeline-Informationen abrufen
     */
    public getInfo(): {
        isInitialized: boolean;
        shaderPath: string;
        vertexEntryPoint: string;
        fragmentEntryPoint: string;
        canvasFormat: GPUTextureFormat;
        bindingCount: number;
    } {
        return {
            isInitialized: this.isInitialized(),
            shaderPath: SHADER_CONFIG.PATHS.RENDER,
            vertexEntryPoint: 'vs_main',
            fragmentEntryPoint: 'fs_main',
            canvasFormat: navigator.gpu.getPreferredCanvasFormat(),
            bindingCount: 2 // InputTexture, Sampler
        };
    }

    /**
     *  Render Pipeline abrufen
     */
    public getPipeline(): GPURenderPipeline {
        if (!this.pipeline) {
            throw new Error('Render Pipeline nicht initialisiert');
        }
        return this.pipeline;
    }

    /**
     *  Bind Group abrufen
     */
    public getBindGroup(): GPUBindGroup {
        if (!this.bindGroup) {
            throw new Error('Render Bind Group nicht initialisiert');
        }
        return this.bindGroup;
    }

    /**
     *  Bind Group Layout abrufen
     */
    public getBindGroupLayout(): GPUBindGroupLayout {
        if (!this.bindGroupLayout) {
            throw new Error('Render Bind Group Layout nicht initialisiert');
        }
        return this.bindGroupLayout;
    }

    /**
     *  Shader Module abrufen
     */
    public getShaderModule(): GPUShaderModule {
        if (!this.renderModule) {
            throw new Error('Render Shader Module nicht initialisiert');
        }
        return this.renderModule;
    }

    /**
     *  Fullscreen Triangle rendern
     */
    public renderFullscreenTriangle(renderPass: GPURenderPassEncoder): void {
        if (!this.isInitialized()) {
            throw new Error('Render Pipeline nicht initialisiert');
        }

        // Pipeline setzen
        renderPass.setPipeline(this.pipeline!);

        // Bind Group setzen
        renderPass.setBindGroup(0, this.bindGroup!);

        // Fullscreen Triangle zeichnen (3 Vertices ohne Buffer)
        renderPass.draw(3);
    }

    /**
     *  Render Pass erstellen und ausführen
     */
    public executeRenderPass(
        commandEncoder: GPUCommandEncoder,
        colorAttachment: GPURenderPassColorAttachment
    ): void {
        if (!this.isInitialized()) {
            throw new Error('Render Pipeline nicht initialisiert');
        }

        const renderPass = commandEncoder.beginRenderPass({
            label: 'Fullscreen Render Pass',
            colorAttachments: [colorAttachment]
        });

        this.renderFullscreenTriangle(renderPass);
        renderPass.end();
    }

    /**
     *  Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null &&
            this.renderModule !== null &&
            this.bindGroupLayout !== null &&
            this.pipeline !== null &&
            this.bindGroup !== null;
    }

    /**
     *  Ressourcen aufräumen
     */
    public cleanup(): void {
        // WebGPU Ressourcen können nicht explizit zerstört werden
        // Aber wir können Referenzen löschen
        this.renderModule = null;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.bindGroup = null;
        this.device = null;

        this.logger.pipeline('Render Pipeline aufgeräumt');
    }
}