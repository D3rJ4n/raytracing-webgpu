// src/core/ComputePipeline.ts - BVH-erweiterte Version

import { Logger } from '../utils/Logger';
import { SHADER_CONFIG, BINDING_CONFIG } from '../utils/Constants';

/**
 * ⚡ ComputePipeline - Compute Pipeline Management (BVH-erweitert)
 * 
 * Verwaltet:
 * - Compute Shader laden & kompilieren
 * - Bind Group Layout für Compute Pipeline (inkl. BVH)
 * - Compute Pipeline erstellen
 * - Bind Group für Raytracing-Daten (inkl. BVH)
 */
export class ComputePipeline {
    private device: GPUDevice | null = null;
    private logger: Logger;

    // ===== PIPELINE KOMPONENTEN =====
    private computeModule: GPUShaderModule | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroup: GPUBindGroup | null = null;

    // ===== BVH STATUS =====
    private bvhEnabled: boolean = false;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Compute Pipeline initialisieren (BVH-erweitert)
     */
    public async initialize(
        device: GPUDevice,
        buffers: {
            camera: GPUBuffer;
            spheres: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
            bvhNodes?: GPUBuffer;
            bvhSphereIndices?: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): Promise<void> {
        this.device = device;

        // BVH-Status bestimmen
        this.bvhEnabled = !!(buffers.bvhNodes && buffers.bvhSphereIndices);

        try {
            this.logger.pipeline(`Erstelle Compute Pipeline${this.bvhEnabled ? ' (mit BVH)' : ''}...`);

            // Schritt 1: Compute Shader laden
            await this.loadComputeShader();

            // Schritt 2: Bind Group Layout erstellen
            this.createBindGroupLayout();

            // Schritt 3: Compute Pipeline erstellen
            this.createComputePipeline();

            // Schritt 4: Bind Group erstellen
            this.createBindGroup(buffers, outputTexture);

            this.logger.success(`Compute Pipeline erfolgreich erstellt${this.bvhEnabled ? ' (mit BVH)' : ''}`);

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

        this.logger.pipeline(`Erstelle Compute Bind Group Layout${this.bvhEnabled ? ' (mit BVH)' : ''}...`);

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'Compute Bind Group Layout',
            entries: [
                {
                    binding: BINDING_CONFIG.COMPUTE.CAMERA,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' as const }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SPHERE,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' as const }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.RENDER_INFO,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' as const }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.OUTPUT_TEXTURE,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only' as const,
                        format: 'rgba8unorm' as const,
                        viewDimension: '2d' as const
                    }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.CACHE_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' as const }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.ACCUMULATION_BUFFER,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' as const }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.SCENE_CONFIG,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' as const }
                },
                // BVH-Bindings hinzufügen falls aktiviert
                ...(this.bvhEnabled ? [
                    // Binding 7: BVH Nodes (storage buffer)
                    {
                        binding: BINDING_CONFIG.COMPUTE.BVH_NODES,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'read-only-storage' as const }
                    },
                    // Binding 8: BVH Sphere Indices (storage buffer)
                    {
                        binding: BINDING_CONFIG.COMPUTE.BVH_SPHERE_INDICES,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'read-only-storage' as const }
                    }
                ] : [])
            ]
        });

        const bindingCount = this.bvhEnabled ? 9 : 7;
        this.logger.success(`Compute Bind Group Layout erstellt (${bindingCount} Bindings${this.bvhEnabled ? ', inkl. BVH' : ''})`);
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
            spheres: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
            bvhNodes?: GPUBuffer;
            bvhSphereIndices?: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Abhängigkeiten nicht verfügbar');
        }

        this.logger.pipeline('Erstelle Compute Bind Group...');

        // Basis-Entries (unverändert)
        const baseEntries: GPUBindGroupEntry[] = [
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
        ];

        // BVH-Entries hinzufügen falls verfügbar
        if (this.bvhEnabled && buffers.bvhNodes && buffers.bvhSphereIndices) {
            baseEntries.push(
                {
                    binding: BINDING_CONFIG.COMPUTE.BVH_NODES,
                    resource: { buffer: buffers.bvhNodes }
                },
                {
                    binding: BINDING_CONFIG.COMPUTE.BVH_SPHERE_INDICES,
                    resource: { buffer: buffers.bvhSphereIndices }
                }
            );
        }

        this.bindGroup = this.device.createBindGroup({
            label: 'Compute Bind Group',
            layout: this.bindGroupLayout,
            entries: baseEntries
        });

        this.logger.success(`Compute Bind Group erstellt (${baseEntries.length} Bindings)`);
    }

    /**
     * 🔄 Bind Group aktualisieren 
     */
    public updateBindGroup(
        buffers: {
            camera: GPUBuffer;
            spheres: GPUBuffer;
            renderInfo: GPUBuffer;
            cache: GPUBuffer;
            accumulation: GPUBuffer;
            sceneConfig: GPUBuffer;
            bvhNodes?: GPUBuffer;
            bvhSphereIndices?: GPUBuffer;
        },
        outputTexture: GPUTexture
    ): void {
        if (!this.device || !this.bindGroupLayout) {
            throw new Error('Pipeline nicht initialisiert');
        }

        // BVH-Status neu bewerten
        const newBVHEnabled = !!(buffers.bvhNodes && buffers.bvhSphereIndices);

        if (newBVHEnabled !== this.bvhEnabled) {
            // BVH-Status hat sich geändert -> Layout neu erstellen
            this.bvhEnabled = newBVHEnabled;
            this.createBindGroupLayout();
            this.createComputePipeline();
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
        bvhEnabled: boolean;
    } {
        const baseBindingCount = 7; // Basis-Bindings
        const bvhBindingCount = this.bvhEnabled ? 2 : 0; // BVH-Bindings

        return {
            isInitialized: this.isInitialized(),
            shaderPath: SHADER_CONFIG.PATHS.COMPUTE,
            workgroupSize: {
                x: SHADER_CONFIG.WORKGROUP_SIZE.X,
                y: SHADER_CONFIG.WORKGROUP_SIZE.Y,
                z: SHADER_CONFIG.WORKGROUP_SIZE.Z
            },
            bindingCount: baseBindingCount + bvhBindingCount,
            bvhEnabled: this.bvhEnabled
        };
    }

    /**
     * 📊 BVH-Status abrufen
     */
    public isBVHEnabled(): boolean {
        return this.bvhEnabled;
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
        this.bvhEnabled = false;

        this.logger.pipeline('Compute Pipeline aufgeräumt');
    }
}