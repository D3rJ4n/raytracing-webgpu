import * as THREE from 'three';

// ===== HAUPTKLASSE: StorageBufferWebGPURaytracer =====
class StorageBufferWebGPURaytracer {
    // DOM-Elemente
    private canvas: HTMLCanvasElement;      // HTML Canvas wo gerendert wird
    private statusElement: HTMLElement;     // Status-Text Element

    // WebGPU Core-Objekte
    private device: GPUDevice | null = null;        // GPU-Device
    private context: GPUCanvasContext | null = null; // Canvas-Kontext für WebGPU

    // Three.js Szenen-Objekte (für einfache 3D-Mathematik)
    private scene: THREE.Scene;              // Three.js Szene (Container)
    private camera: THREE.PerspectiveCamera; // Three.js Kamera (für Berechnungen)
    private sphere: THREE.Mesh;              // Three.js Kugel (für Parameter)

    // WebGPU Rendering-Pipeline
    private computePipeline: GPUComputePipeline | null = null;  // Raytracing-Pipeline
    private renderPipeline: GPURenderPipeline | null = null;    // Display-Pipeline

    // WebGPU Bind Groups (verbinden Shader mit Daten)
    private computeBindGroup: GPUBindGroup | null = null;  // Daten für Compute Shader
    private renderBindGroup: GPUBindGroup | null = null;   // Daten für Render Shader

    // WebGPU Texturen und Sampler
    private renderTexture: GPUTexture | null = null;  // Zwischenspeicher für Raytracing-Ergebnis
    private sampler: GPUSampler | null = null;         // Wie Texturen gelesen werden

    // WebGPU Buffers (GPU-Speicher für Daten)
    private cameraBuffer: GPUBuffer | null = null;     // Kamera-Daten auf GPU
    private sphereBuffer: GPUBuffer | null = null;     // Kugel-Daten auf GPU
    private renderInfoBuffer: GPUBuffer | null = null; // Bildschirm-Info auf GPU


    constructor() {
        // DOM-Elemente finden
        this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.statusElement = document.getElementById('status')!;

        // ===== THREE.JS SZENE AUFBAUEN =====
        // (Three.js wird nur für Mathematik verwendet, nicht für Rendering)

        // Leere Szene erstellen
        this.scene = new THREE.Scene();

        // Perspektiv-Kamera erstellen
        this.camera = new THREE.PerspectiveCamera(
            60, // FOV (Field of View) in Grad
            this.canvas.width / this.canvas.height, // Seitenverhältnis
            0.1, // Near Clipping Plane (unwichtig für Raytracing)
            100  // Far Clipping Plane (unwichtig für Raytracing)
        );
        // Kamera positionieren: 5 Einheiten vor dem Ursprung
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);  // Kamera schaut zum Ursprung

        // Kugel erstellen
        const geometry = new THREE.SphereGeometry(1, 32, 32);  // Radius=1, Details unwichtig
        const material = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Blau
        this.sphere = new THREE.Mesh(geometry, material);
        this.sphere.position.set(0, 0, 0);  // Kugel im Ursprung platzieren
        this.scene.add(this.sphere);        // Zur Szene hinzufügen

        // Debug-Ausgaben
        console.log('📐 Three.js Szene erstellt:');
        console.log('  Kamera Position:', this.camera.position);
        console.log('  Kugel Position:', this.sphere.position);
        console.log('  Kugel Radius:', geometry.parameters.radius);

        // WebGPU initialisieren
        this.init();
    }

    // ===== HAUPTINITIALISIERUNG =====
    private async init(): Promise<void> {
        try {
            // Status-Updates für den Benutzer
            this.updateStatus('WebGPU Raytracer wird initialisiert...', 'info-text');

            // Schritt 1: WebGPU initialisieren
            await this.initWebGPU();

            // Schritt 2: Rendering-Pipelines erstellen
            await this.initPipelines();

            // Schritt 3: Einen Frame rendern
            await this.render();

            // Erfolgsmeldung
            this.updateStatus('✅ WebGPU Raytracer läuft!', 'success');
        } catch (error) {
            // Fehlerbehandlung
            console.error('Fehler:', error);
            this.updateStatus(`❌ Fehler: ${error instanceof Error ? error.message : 'Unbekannt'}`, 'error');
        }
    }

    // ===== WEBGPU GRUNDINITIALISIERUNG =====
    private async initWebGPU(): Promise<void> {
        // WebGPU-Unterstützung prüfen
        if (!navigator.gpu) {
            throw new Error('WebGPU nicht verfügbar');
        }

        // GPU-Adapter anfordern (wählt beste verfügbare GPU)
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'  // Bevorzuge leistungsstarke GPU
        });
        if (!adapter) throw new Error('Kein WebGPU Adapter');

        // GPU-Device anfordern (ermöglicht Zugriff auf GPU-Features)
        this.device = await adapter.requestDevice();

        // Fehlerbehandlung für WebGPU-Fehler
        this.device.addEventListener('uncapturederror', (event) => {
            console.error('WebGPU Error:', (event as any).error);
        });

        // Canvas für WebGPU konfigurieren
        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,                // Unser GPU-Device
            format: presentationFormat,         // Optimales Pixel-Format
            alphaMode: 'opaque'                // Keine Transparenz
        });

        console.log('✅ WebGPU initialisiert');
    }

    // ===== RENDERING-PIPELINES ERSTELLEN =====
    private async initPipelines(): Promise<void> {
        if (!this.device) throw new Error('Device nicht initialisiert');

        // ===== SHADER-MODULE ERSTELLEN =====
        const computeShaderCode = await fetch('src/shader/compute.wgsl').then(r => r.text());
        const renderShaderCode = await fetch('src/shader/render.wgsl').then(r => r.text());

        // Compute Shader kompilieren (WGSL → GPU-Code)
        const computeModule = this.device.createShaderModule({
            label: 'Raytracer Compute Shader',
            code: computeShaderCode
        });

        // Render Shader kompilieren (WGSL → GPU-Code)
        const renderModule = this.device.createShaderModule({
            label: 'Render Shader',
            code: renderShaderCode
        });

        // ===== RENDER-TEXTURE ERSTELLEN =====
        // Zwischenspeicher für Raytracing-Ergebnis
        this.renderTexture = this.device.createTexture({
            label: 'Render Texture',
            size: [this.canvas.width, this.canvas.height],  // Gleiche Größe wie Canvas
            format: 'rgba8unorm',                           // 8-Bit pro Kanal, normalisiert
            usage: GPUTextureUsage.STORAGE_BINDING |        // Compute Shader kann schreiben
                GPUTextureUsage.TEXTURE_BINDING          // Render Shader kann lesen
        });

        // ===== SAMPLER ERSTELLEN =====
        // Bestimmt wie Texturen gelesen werden
        this.sampler = this.device.createSampler({
            magFilter: 'linear',  // Glättung bei Vergrößerung
            minFilter: 'linear'   // Glättung bei Verkleinerung
        });

        // ===== GPU-BUFFERS ERSTELLEN =====
        // Lädt Three.js-Daten in GPU-Speicher
        this.createBuffers();

        // ===== COMPUTE PIPELINE ERSTELLEN =====
        // Layout definieren: Welche Daten bekommt der Compute Shader?
        const computeBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                // Binding 0: Kamera-Daten (uniform buffer)
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                // Binding 1: Kugel-Daten (uniform buffer)
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                // Binding 2: Render-Info (uniform buffer)
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                // Binding 3: Output-Texture (storage texture, write-only)
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',    // Nur schreiben
                        format: 'rgba8unorm',    // Format muss mit Texture übereinstimmen
                        viewDimension: '2d'      // 2D-Texture
                    }
                }
            ]
        });

        // Compute Pipeline erstellen
        this.computePipeline = this.device.createComputePipeline({
            label: 'Compute Pipeline',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [computeBindGroupLayout]  // Unser Layout verwenden
            }),
            compute: {
                module: computeModule,  // Unser kompilierter Compute Shader
                entryPoint: 'main'      // Einstiegspunkt im Shader
            }
        });

        // Bind Group erstellen: Verbindet konkrete Daten mit dem Layout
        this.computeBindGroup = this.device.createBindGroup({
            layout: computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.cameraBuffer! } },      // Kamera-Buffer
                { binding: 1, resource: { buffer: this.sphereBuffer! } },      // Kugel-Buffer
                { binding: 2, resource: { buffer: this.renderInfoBuffer! } },  // Render-Info-Buffer
                { binding: 3, resource: this.renderTexture.createView() }      // Output-Texture
            ]
        });

        // ===== RENDER PIPELINE ERSTELLEN =====
        // Layout für Render Shader
        const renderBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                // Binding 0: Input-Texture (das Raytracing-Ergebnis)
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                // Binding 1: Sampler (wie die Texture gelesen wird)
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
            ]
        });

        // Render Pipeline erstellen
        this.renderPipeline = this.device.createRenderPipeline({
            label: 'Render Pipeline',
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [renderBindGroupLayout]
            }),
            // Vertex Shader Konfiguration
            vertex: {
                module: renderModule,
                entryPoint: 'vs_main'  // Vertex Shader Einstiegspunkt
            },
            // Fragment Shader Konfiguration
            fragment: {
                module: renderModule,
                entryPoint: 'fs_main',  // Fragment Shader Einstiegspunkt
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat()  // Canvas-Format
                }]
            },
            // Primitive-Konfiguration
            primitive: {
                topology: 'triangle-list'  // Wir zeichnen Dreiecke
            }
        });

        // Bind Group für Render Pipeline
        this.renderBindGroup = this.device.createBindGroup({
            layout: renderBindGroupLayout,
            entries: [
                { binding: 0, resource: this.renderTexture.createView() },  // Raytracing-Ergebnis
                { binding: 1, resource: this.sampler }                      // Sampler
            ]
        });

        console.log('✅ Pipelines erstellt');
    }

    // ===== GPU-BUFFERS ERSTELLEN UND FÜLLEN =====
    private createBuffers(): void {
        if (!this.device) return;

        // ===== KAMERA-BUFFER =====
        // GPU-Buffer für Kamera-Daten erstellen
        this.cameraBuffer = this.device.createBuffer({
            label: 'Camera Buffer',
            size: 32,  // 8 floats × 4 bytes = 32 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Kamera-Ziel berechnen (wo schaut die Kamera hin?)
        const lookAtTarget = new THREE.Vector3(0, 0, 0);  // Ursprung

        // Kamera-Daten in Float32Array packen
        const cameraData = new Float32Array([
            // Position (xyz) + Padding
            this.camera.position.x, this.camera.position.y, this.camera.position.z, 0,
            // LookAt (xyz) + Padding  
            lookAtTarget.x, lookAtTarget.y, lookAtTarget.z, 0
        ]);
        // Daten zur GPU senden
        this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraData);

        // ===== KUGEL-BUFFER =====
        // GPU-Buffer für Kugel-Daten erstellen
        this.sphereBuffer = this.device.createBuffer({
            label: 'Sphere Buffer',
            size: 16,  // 4 floats × 4 bytes = 16 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Kugel-Parameter aus Three.js extrahieren
        const sphereGeometry = this.sphere.geometry as THREE.SphereGeometry;
        const radius = sphereGeometry.parameters.radius;

        // Kugel-Daten in Float32Array packen
        const sphereData = new Float32Array([
            // Center (xyz) + Radius
            this.sphere.position.x,
            this.sphere.position.y,
            this.sphere.position.z,
            radius
        ]);
        // Daten zur GPU senden
        this.device.queue.writeBuffer(this.sphereBuffer, 0, sphereData);

        // ===== RENDER-INFO-BUFFER =====
        // GPU-Buffer für Bildschirm-Informationen
        this.renderInfoBuffer = this.device.createBuffer({
            label: 'Render Info Buffer',
            size: 16,  // 4 uints × 4 bytes = 16 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Bildschirm-Daten in Uint32Array packen
        const renderInfoData = new Uint32Array([
            this.canvas.width,   // Breite
            this.canvas.height,  // Höhe
            0, 0                // Padding
        ]);
        // Daten zur GPU senden
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);

        // Debug-Ausgaben
        console.log('✅ Buffers mit Three.js Daten gefüllt');
        console.log('  Kamera Buffer:', cameraData);
        console.log('  Kugel Buffer:', sphereData);
    }

    // ===== RENDERING DURCHFÜHREN =====
    private async render(): Promise<void> {
        if (!this.device || !this.computePipeline || !this.renderPipeline) return;

        // Command Encoder erstellen (sammelt GPU-Befehle)
        const commandEncoder = this.device.createCommandEncoder();

        // ===== COMPUTE PASS: RAYTRACING =====
        // GPU berechnet für jeden Pixel die Farbe
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);           // Compute Pipeline verwenden
        computePass.setBindGroup(0, this.computeBindGroup!);     // Daten bereitstellen

        // Berechnen wie viele Workgroups wir brauchen
        // Jede Workgroup bearbeitet 8×8 Pixel (siehe @workgroup_size im Shader)
        const workgroupsX = Math.ceil(this.canvas.width / 8);   // Horizontal
        const workgroupsY = Math.ceil(this.canvas.height / 8);  // Vertikal

        // Compute Shader ausführen
        computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        computePass.end();

        // ===== RENDER PASS: ANZEIGE =====
        // Raytracing-Ergebnis auf Canvas zeichnen
        const textureView = this.context!.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,                          // Canvas als Ziel
                clearValue: { r: 0, g: 0, b: 0, a: 1 },   // Schwarz löschen
                loadOp: 'clear',                           // Löschen vor dem Zeichnen
                storeOp: 'store'                           // Ergebnis speichern
            }]
        });

        renderPass.setPipeline(this.renderPipeline);        // Render Pipeline verwenden
        renderPass.setBindGroup(0, this.renderBindGroup!);  // Texture und Sampler bereitstellen
        renderPass.draw(3);  // 3 Vertices = 1 Dreieck das den ganzen Bildschirm abdeckt
        renderPass.end();

        // ===== BEFEHLE AUSFÜHREN =====
        // Alle gesammelten Befehle zur GPU senden
        this.device.queue.submit([commandEncoder.finish()]);

        console.log('✅ Frame gerendert');
    }

    // ===== STATUS-ANZEIGE AKTUALISIEREN =====
    private updateStatus(message: string, className: string): void {
        this.statusElement.textContent = message;                    // Text setzen
        this.statusElement.className = `status ${className}`;        // CSS-Klasse setzen
    }
}

// ===== APP STARTEN =====
console.log('🚀 Starte WebGPU Raytracer mit Three.js Szene...');
new StorageBufferWebGPURaytracer();