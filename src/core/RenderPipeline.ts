import { Logger } from '../utils/Logger';
import { SHADER_CONFIG, BINDING_CONFIG } from '../utils/Constants';

export class RenderPipeline {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private renderModule: GPUShaderModule | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public async initialize(
        device: GPUDevice,
        inputTexture: GPUTexture,
        sampler: GPUSampler
    ): Promise<void> {
        this.device = device;

        try {
            await this.loadRenderShader();
            this.createBindGroupLayout();
            this.createRenderPipeline();
            this.createBindGroup(inputTexture, sampler);
        } catch (error) {
            this.logger.error('Fehler beim Erstellen der Render Pipeline:', error);
            throw error;
        }
    }

    private async loadRenderShader(): Promise<void> {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        try {
            const shaderCode = await fetch(SHADER_CONFIG.PATHS.RENDER).then(r => r.text());

            this.renderModule = this.device.createShaderModule({
                label: SHADER_CONFIG.LABELS.RENDER_MODULE,
                code: shaderCode
            });
        } catch (error) {
            throw new Error(`Render Shader konnte nicht geladen werden: ${error}`);
        }
    }

    private createBindGroupLayout(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Render Bind Group Layout',
            entries: [
                {
                    binding: BINDING_CONFIG.RENDER.INPUT_TEXTURE,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                        viewDimension: '2d'
                    }
                },
                {
                    binding: BINDING_CONFIG.RENDER.SAMPLER,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'filtering'
                    }
                }
            ]
        });
    }

    private createRenderPipeline(): void {
        if (!this.device || !this.renderModule || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.pipeline = this.device.createRenderPipeline({
            label: SHADER_CONFIG.LABELS.RENDER_PIPELINE,
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            }),
            vertex: {
                module: this.renderModule,
                entryPoint: 'vs_main'
            },
            fragment: {
                module: this.renderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none'
            }
        });
    }

    private createBindGroup(inputTexture: GPUTexture, sampler: GPUSampler): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

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
    }

    public getPipeline(): GPURenderPipeline {
        if (!this.pipeline) {
            throw new Error('Render Pipeline nicht initialisiert');
        }
        return this.pipeline;
    }

    public getBindGroup(): GPUBindGroup {
        if (!this.bindGroup) {
            throw new Error('Render Bind Group nicht initialisiert');
        }
        return this.bindGroup;
    }

    public isInitialized(): boolean {
        return this.device !== null &&
            this.renderModule !== null &&
            this.bindGroupLayout !== null &&
            this.pipeline !== null &&
            this.bindGroup !== null;
    }

    public cleanup(): void {
        this.renderModule = null;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.bindGroup = null;
        this.device = null;
    }
}