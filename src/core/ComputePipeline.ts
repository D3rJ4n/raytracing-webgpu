import { Logger } from '../utils/Logger';
import { SHADER_CONFIG, BINDING_CONFIG } from '../utils/Constants';

export class ComputePipeline {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private computeModule: GPUShaderModule | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    constructor() {
        this.logger = Logger.getInstance();
    }

    public async initialize(
        device: GPUDevice,
        buffers: {
            camera: GPUBuffer;
            spheres: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): Promise<void> {
        this.device = device;

        try {
            await this.loadComputeShader();
            this.createBindGroupLayout();
            this.createComputePipeline();
            this.createBindGroup(buffers, outputTexture);
        } catch (error) {
            this.logger.error('Fehler beim Erstellen der Compute Pipeline:', error);
            throw error;
        }
    }

    private async loadComputeShader(): Promise<void> {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        try {
            const shaderCode = await fetch(SHADER_CONFIG.PATHS.COMPUTE).then(r => r.text());

            this.computeModule = this.device.createShaderModule({
                label: SHADER_CONFIG.LABELS.COMPUTE_MODULE,
                code: shaderCode
            });
        } catch (error) {
            throw new Error(`Compute Shader konnte nicht geladen werden: ${error}`);
        }
    }

    private createBindGroupLayout(): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Compute Bind Group Layout',
            entries: [
                {
                    binding: BINDING_CONFIG.COMPUTE.CAMERA,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SPHERE,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.RENDER_INFO,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.OUTPUT_TEXTURE,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba8unorm',
                        viewDimension: '2d'
                    }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.CACHE_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.ACCUMULATION_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SCENE_CONFIG,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                }
            ]
        });
    }

    private createComputePipeline(): void {
        if (!this.device || !this.computeModule || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

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
    }

    private createBindGroup(
        buffers: {
            camera: GPUBuffer;
            spheres: GPUBuffer;
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
                    resource: { buffer: buffers.spheres }
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
    }

    public getPipeline(): GPUComputePipeline {
        if (!this.pipeline) {
            throw new Error('Compute Pipeline nicht initialisiert');
        }
        return this.pipeline;
    }

    public getBindGroup(): GPUBindGroup {
        if (!this.bindGroup) {
            throw new Error('Compute Bind Group nicht initialisiert');
        }
        return this.bindGroup;
    }

    public isInitialized(): boolean {
        return this.device !== null &&
            this.computeModule !== null &&
            this.bindGroupLayout !== null &&
            this.pipeline !== null &&
            this.bindGroup !== null;
    }

    public cleanup(): void {
        this.computeModule = null;
        this.bindGroupLayout = null;
        this.pipeline = null;
        this.bindGroup = null;
        this.device = null;
    }
}