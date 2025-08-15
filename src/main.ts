import * as THREE from 'three';

// WGSL Shader Code
const COMPUTE_SHADER = `
struct Camera {
    position: vec3<f32>,
    _pad1: f32,
    lookAt: vec3<f32>,
    _pad2: f32,
}

struct Sphere {
    center: vec3<f32>,
    radius: f32,
}

struct RenderInfo {
    width: u32,
    height: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> sphere: Sphere;
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;

fn getCameraRay(uv: vec2<f32>) -> vec3<f32> {
    let aspectRatio = f32(renderInfo.width) / f32(renderInfo.height);
    let fov = 1.0472; // 60 degrees
    
    let forward = normalize(camera.lookAt - camera.position);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
    let up = cross(forward, right);
    
    let halfHeight = tan(fov * 0.5);
    let halfWidth = halfHeight * aspectRatio;
    
    let x = (uv.x * 2.0 - 1.0) * halfWidth;
    let y = -(uv.y * 2.0 - 1.0) * halfHeight;
    
    return normalize(forward + x * right + y * up);
}

fn intersectSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
    let oc = rayOrigin - sphere.center;
    let a = dot(rayDirection, rayDirection);
    let b = 2.0 * dot(oc, rayDirection);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    
    let discriminant = b * b - 4.0 * a * c;
    
    if (discriminant < 0.0) {
        return -1.0;
    }
    
    let sqrtDiscriminant = sqrt(discriminant);
    let t1 = (-b - sqrtDiscriminant) / (2.0 * a);
    let t2 = (-b + sqrtDiscriminant) / (2.0 * a);
    
    if (t1 > 0.0) {
        return t1;
    } else if (t2 > 0.0) {
        return t2;
    }
    
    return -1.0;
}

fn calculateLighting(hitPoint: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    let lightPos = vec3<f32>(5.0, 5.0, 5.0);
    let lightDir = normalize(lightPos - hitPoint);
    
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = 0.2;
    let lighting = ambient + diffuse * 0.8;
    
    return vec3<f32>(0.0, 0.0, 1.0) * lighting; // Blau
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pixelCoords = vec2<i32>(globalId.xy);
    let dimensions = vec2<i32>(i32(renderInfo.width), i32(renderInfo.height));
    
    if (pixelCoords.x >= dimensions.x || pixelCoords.y >= dimensions.y) {
        return;
    }
    
    let uv = vec2<f32>(
        f32(pixelCoords.x) / f32(dimensions.x),
        f32(pixelCoords.y) / f32(dimensions.y)
    );
    
    let rayDirection = getCameraRay(uv);
    let t = intersectSphere(camera.position, rayDirection);
    
    var color: vec4<f32>;
    if (t > 0.0) {
        let hitPoint = camera.position + rayDirection * t;
        let normal = normalize(hitPoint - sphere.center);
        let rgb = calculateLighting(hitPoint, normal);
        color = vec4<f32>(rgb, 1.0);
    } else {
        // Weißer Hintergrund
        color = vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }
    
    textureStore(outputTexture, pixelCoords, color);
}
`;

const RENDER_SHADER = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);
    
    output.position = vec4<f32>(x * 2.0 - 1.0, -y * 2.0 + 1.0, 0.0, 1.0);
    output.uv = vec2<f32>(x, y);
    
    return output;
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var textureSampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(inputTexture, textureSampler, input.uv);
}
`;

class StorageBufferWebGPURaytracer {
    private canvas: HTMLCanvasElement;
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private statusElement: HTMLElement;

    // Three.js Objekte für Szenen-Definition
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private sphere: THREE.Mesh;

    // WebGPU Pipeline
    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;

    private computeBindGroup: GPUBindGroup | null = null;
    private renderBindGroup: GPUBindGroup | null = null;

    private renderTexture: GPUTexture | null = null;
    private sampler: GPUSampler | null = null;

    private cameraBuffer: GPUBuffer | null = null;
    private sphereBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;

    constructor() {
        this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.statusElement = document.getElementById('status')!;

        // Three.js Szene erstellen
        this.scene = new THREE.Scene();

        // Three.js Kamera
        this.camera = new THREE.PerspectiveCamera(
            60, // FOV
            this.canvas.width / this.canvas.height, // Aspect
            0.1, // Near
            100 // Far
        );
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);

        // Three.js Kugel
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
        this.sphere = new THREE.Mesh(geometry, material);
        this.sphere.position.set(0, 0, 0);
        this.scene.add(this.sphere);

        console.log('📐 Three.js Szene erstellt:');
        console.log('  Kamera Position:', this.camera.position);
        console.log('  Kugel Position:', this.sphere.position);
        console.log('  Kugel Radius:', geometry.parameters.radius);

        this.init();
    }

    private async init(): Promise<void> {
        try {
            this.updateStatus('WebGPU Raytracer wird initialisiert...', 'info-text');
            await this.initWebGPU();
            await this.initPipelines();
            await this.render();
            this.updateStatus('✅ WebGPU Raytracer läuft!', 'success');
        } catch (error) {
            console.error('Fehler:', error);
            this.updateStatus(`❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`, 'error');
        }
    }

    private async initWebGPU(): Promise<void> {
        if (!navigator.gpu) {
            throw new Error('WebGPU nicht verfügbar');
        }

        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('Kein WebGPU Adapter');

        this.device = await adapter.requestDevice();

        this.device.addEventListener('uncapturederror', (event) => {
            console.error('WebGPU Error:', (event as any).error);
        });

        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'opaque'
        });

        console.log('✅ WebGPU initialisiert');
    }

    private async initPipelines(): Promise<void> {
        if (!this.device) throw new Error('Device nicht initialisiert');

        // Shader Module
        const computeModule = this.device.createShaderModule({
            label: 'Raytracer Compute Shader',
            code: COMPUTE_SHADER
        });

        const renderModule = this.device.createShaderModule({
            label: 'Render Shader',
            code: RENDER_SHADER
        });

        // Render Texture
        this.renderTexture = this.device.createTexture({
            label: 'Render Texture',
            size: [this.canvas.width, this.canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        // Sampler
        this.sampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Buffers erstellen und mit Three.js Daten füllen
        this.createBuffers();

        // Compute Pipeline
        const computeBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                {
                    binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: {
                        access: 'write-only',
                        format: 'rgba8unorm',
                        viewDimension: '2d'
                    }
                }
            ]
        });

        this.computePipeline = this.device.createComputePipeline({
            label: 'Compute Pipeline',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [computeBindGroupLayout]
            }),
            compute: {
                module: computeModule,
                entryPoint: 'main'
            }
        });

        this.computeBindGroup = this.device.createBindGroup({
            layout: computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer! } },
                { binding: 1, resource: { buffer: this.sphereBuffer! } },
                { binding: 2, resource: { buffer: this.renderInfoBuffer! } },
                { binding: 3, resource: this.renderTexture.createView() }
            ]
        });

        // Render Pipeline
        const renderBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
            ]
        });

        this.renderPipeline = this.device.createRenderPipeline({
            label: 'Render Pipeline',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [renderBindGroupLayout]
            }),
            vertex: {
                module: renderModule,
                entryPoint: 'vs_main'
            },
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()
                }]
            },
            primitive: {
                topology: 'triangle-list'
            }
        });

        this.renderBindGroup = this.device.createBindGroup({
            layout: renderBindGroupLayout,
            entries: [
                { binding: 0, resource: this.renderTexture.createView() },
                { binding: 1, resource: this.sampler }
            ]
        });

        console.log('✅ Pipelines erstellt');
    }

    private createBuffers(): void {
        if (!this.device) return;

        // Kamera Buffer - Daten von Three.js Kamera
        this.cameraBuffer = this.device.createBuffer({
            label: 'Camera Buffer',
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Three.js Kamera-Target berechnen
        const lookAtTarget = new THREE.Vector3(0, 0, 0);

        const cameraData = new Float32Array([
            this.camera.position.x, this.camera.position.y, this.camera.position.z, 0,  // position + padding
            lookAtTarget.x, lookAtTarget.y, lookAtTarget.z, 0  // lookAt + padding
        ]);
        this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraData);

        // Kugel Buffer - Daten von Three.js Sphere
        this.sphereBuffer = this.device.createBuffer({
            label: 'Sphere Buffer',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const sphereGeometry = this.sphere.geometry as THREE.SphereGeometry;
        const radius = sphereGeometry.parameters.radius;

        const sphereData = new Float32Array([
            this.sphere.position.x,
            this.sphere.position.y,
            this.sphere.position.z,
            radius
        ]);
        this.device.queue.writeBuffer(this.sphereBuffer, 0, sphereData);

        // Render Info Buffer
        this.renderInfoBuffer = this.device.createBuffer({
            label: 'Render Info Buffer',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const renderInfoData = new Uint32Array([
            this.canvas.width,
            this.canvas.height,
            0, 0
        ]);
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);

        console.log('✅ Buffers mit Three.js Daten gefüllt');
        console.log('  Kamera Buffer:', cameraData);
        console.log('  Kugel Buffer:', sphereData);
    }

    private async render(): Promise<void> {
        if (!this.device || !this.computePipeline || !this.renderPipeline) return;

        const commandEncoder = this.device.createCommandEncoder();

        // Compute Pass - Raytracing
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.computeBindGroup!);

        const workgroupsX = Math.ceil(this.canvas.width / 8);
        const workgroupsY = Math.ceil(this.canvas.height / 8);
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();

        // Render Pass - Texture auf Canvas
        const textureView = this.context!.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup!);
        renderPass.draw(3); // Fullscreen triangle
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);

        console.log('✅ Frame gerendert');
    }

    private updateStatus(message: string, className: string): void {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${className}`;
    }
}

// App starten
console.log('🚀 Starte WebGPU Raytracer mit Three.js Szene...');
new StorageBufferWebGPURaytracer();