import { BUFFER_CONFIG, BVH_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";
import { GeometryInvalidationManager } from "../cache/InvalidationManager";
import { BVHBuilder, type BVHBuildResult } from "../acceleration/BVHBuilder";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null;
    private sceneConfigBuffer: GPUBuffer | null = null;

    // BVH-BUFFERS 
    private bvhNodesBuffer: GPUBuffer | null = null;
    private bvhSphereIndicesBuffer: GPUBuffer | null = null;

    private cameraData: Float32Array | null = null;
    private spheresData: Float32Array | null = null;

    private bvhBuilder: BVHBuilder = new BVHBuilder();
    private lastBVHResult: BVHBuildResult | null = null;
    private bvhEnabled: boolean = BVH_CONFIG.ENABLED

    private canvasWidth: number = 0;
    private canvasHeight: number = 0;

    private cacheInvalidationManager: GeometryInvalidationManager | null = null;

    private legacyInvalidationStats = {
        totalInvalidations: 0,
        pixelsInvalidated: 0,
        lastInvalidationTime: 0
    };

    constructor() {
        this.logger = Logger.getInstance();
    }

    public initialize(
        device: GPUDevice,
        canvasWidth: number,
        canvasHeight: number,
        cameraData: Float32Array,
        sphereData: Float32Array,
        lightPosition?: { x: number; y: number; z: number },
        ambientIntensity?: number
    ): void {
        this.device = device;
        this.cameraData = cameraData;
        this.spheresData = sphereData;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        const sphereCount = Math.floor(sphereData.length / 8);

        this.createCameraBuffer();
        this.createSpheresBuffer();
        this.createRenderInfoBuffer(canvasWidth, canvasHeight, sphereCount);
        this.createExtendedCacheBuffer(canvasWidth, canvasHeight);
        this.createAccumulationBuffer(canvasWidth, canvasHeight);
        this.createSceneConfigBuffer(lightPosition, ambientIntensity);

        if (this.bvhEnabled) {
            this.createBVHBuffers(sphereCount);
            this.buildBVH(sphereData, sphereCount);
        }

        this.initializeCacheInvalidation();

        this.logger.success(this.bvhEnabled ?
            'Alle GPU-Buffers erfolgreich erstellt (mit BVH)' :
            'Alle GPU-Buffers erfolgreich erstellt (ohne BVH)'
        );
    }

    /**
     * BVH-Buffers erstellen 
     */
    private createBVHBuffers(sphereCount: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle BVH-Buffers...');

        // BVH Nodes Buffer
        const nodesBufferSize = BUFFER_CONFIG.BVH_NODES.SIZE;
        this.bvhNodesBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.BVH_NODES.LABEL,
            size: nodesBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // BVH Sphere Indices Buffer
        const indicesBufferSize = BUFFER_CONFIG.BVH_SPHERE_INDICES.SIZE;
        this.bvhSphereIndicesBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.BVH_SPHERE_INDICES.LABEL,
            size: indicesBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.logger.success(
            `BVH-Buffers erstellt: ` +
            `${(nodesBufferSize / 1024).toFixed(1)}KB nodes + ` +
            `${(indicesBufferSize / 1024).toFixed(1)}KB indices`
        );
    }

    /**
     * BVH bauen und auf GPU laden 
     */
    private buildBVH(spheresData: Float32Array, sphereCount: number): void {
        if (!this.device || !this.bvhNodesBuffer || !this.bvhSphereIndicesBuffer) {
            this.logger.error('BVH-Buffers nicht verfügbar');
            return;
        }

        this.logger.buffer(`Baue BVH für ${sphereCount} Kugeln...`);

        // BVH-Hierarchie erstellen
        this.lastBVHResult = this.bvhBuilder.buildBVH(spheresData, sphereCount);

        // Daten auf GPU laden (mit expliziter Typ-Konvertierung)
        this.device.queue.writeBuffer(this.bvhNodesBuffer, 0, new Float32Array(this.lastBVHResult.nodes));
        this.device.queue.writeBuffer(this.bvhSphereIndicesBuffer, 0, new Uint32Array(this.lastBVHResult.sphereIndices));

        this.logger.success(`BVH erstellt: ${this.lastBVHResult.nodeCount} Nodes, Tiefe ${this.lastBVHResult.maxDepth}`);
    }

    private createExtendedCacheBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        const pixelCount = width * height;
        const bufferSize = calculateCacheBufferSize(width, height);

        this.cacheBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CACHE.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const cacheData = new Float32Array(pixelCount * 7).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
    }

    private initializeCacheInvalidation(): void {
        if (!this.device || !this.cacheBuffer) {
            return;
        }

        try {
            this.cacheInvalidationManager = new GeometryInvalidationManager(
                this.device,
                this.cacheBuffer,
                this.canvasWidth,
                this.canvasHeight
            );
        } catch (error) {
            this.logger.error('Cache-Invalidierung-Manager konnte nicht initialisiert werden:', error);
        }
    }

    public async invalidateForSceneChanges(scene: Scene): Promise<void> {
        if (!this.cacheInvalidationManager) {
            await this.legacyRandomInvalidation();
            return;
        }

        const spheresData = scene.getSpheresData();
        const cameraData = scene.getCameraData();

        try {
            const result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);

            this.legacyInvalidationStats.totalInvalidations++;
            this.legacyInvalidationStats.pixelsInvalidated += result.pixelsInvalidated;
            this.legacyInvalidationStats.lastInvalidationTime = result.invalidationTime;

        } catch (error) {
            this.logger.error('Intelligente Cache-Invalidierung fehlgeschlagen:', error);
            await this.legacyRandomInvalidation();
        }
    }

    private async legacyRandomInvalidation(): Promise<void> {
        const totalPixels = this.canvasWidth * this.canvasHeight;
        const pixelsToInvalidate = Math.floor(totalPixels * 0.05);

        const invalidPixels = new Set<number>();
        while (invalidPixels.size < pixelsToInvalidate) {
            invalidPixels.add(Math.floor(Math.random() * totalPixels));
        }

        invalidPixels.forEach(pixelIndex => {
            const validFlagOffset = pixelIndex * 7 * 4 + 6 * 4;
            this.device!.queue.writeBuffer(
                this.cacheBuffer!,
                validFlagOffset,
                new Float32Array([0.0])
            );
        });

        this.legacyInvalidationStats.totalInvalidations++;
        this.legacyInvalidationStats.pixelsInvalidated += pixelsToInvalidate;
    }

    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Float32Array(pixelCount * 7).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
    }

    public getInvalidationStats(): any {
        if (this.cacheInvalidationManager) {
            return this.cacheInvalidationManager.getStats();
        } else {
            return {
                totalInvalidations: this.legacyInvalidationStats.totalInvalidations,
                pixelsInvalidated: this.legacyInvalidationStats.pixelsInvalidated,
                lastInvalidationTime: this.legacyInvalidationStats.lastInvalidationTime,
                avgPixelsPerInvalidation: this.legacyInvalidationStats.totalInvalidations > 0
                    ? this.legacyInvalidationStats.pixelsInvalidated / this.legacyInvalidationStats.totalInvalidations
                    : 0
            };
        }
    }

    public resetInvalidationStats(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.resetStats();
        }

        this.legacyInvalidationStats = {
            totalInvalidations: 0,
            pixelsInvalidated: 0,
            lastInvalidationTime: 0
        };
    }

    private createCameraBuffer(): void {
        if (!this.device || !this.cameraData) {
            throw new Error('Device oder Kamera-Daten nicht verfügbar');
        }

        this.cameraBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.CAMERA.LABEL,
            size: BUFFER_CONFIG.CAMERA.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const extendedData = new Float32Array(12);
        extendedData.set(this.cameraData.slice(0, 8), 0);
        extendedData[8] = 0;  // randomSeed1
        extendedData[9] = 0;  // randomSeed2
        extendedData[10] = 0; // sampleCount
        extendedData[11] = 0; // padding

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
    }

    private createSpheresBuffer(): void {
        if (!this.device || !this.spheresData) {
            throw new Error('Device oder Kugel-Daten nicht verfügbar');
        }

        this.spheresBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SPHERE.LABEL,
            size: BUFFER_CONFIG.SPHERES.SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(this.spheresData));
    }

    private createRenderInfoBuffer(width: number, height: number, sphereCount: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.renderInfoBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.RENDER_INFO.LABEL,
            size: BUFFER_CONFIG.RENDER_INFO.SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const renderInfoData = new Uint32Array([width, height, sphereCount, 0]);
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);
    }

    private createAccumulationBuffer(width: number, height: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        const pixelCount = width * height;
        const bufferSize = calculateAccumulationBufferSize(width, height);

        this.accumulationBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.ACCUMULATION.LABEL,
            size: bufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        const accumulationData = new Float32Array(pixelCount * 4).fill(0);
        this.device.queue.writeBuffer(this.accumulationBuffer, 0, accumulationData);
    }

    private createSceneConfigBuffer(lightPosition?: { x: number; y: number; z: number }, ambientIntensity?: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.sceneConfigBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SCENE_CONFIG.LABEL,
            size: 48, // Match original size
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const light = lightPosition || { x: 0, y: 10, z: 0 };
        const ambient = ambientIntensity !== undefined ? ambientIntensity : 0.2;

        // Match the original structure exactly
        const sceneConfigData = new Float32Array([
            -2.0, 0, 0, 0,           // Ground Y position, padding
            light.x, light.y, light.z, 1.0,  // Light position, shadow enabled
            1.0, 8, 0.01, ambient     // Reflections enabled, max bounces, min contribution, ambient
        ]);

        this.device.queue.writeBuffer(this.sceneConfigBuffer, 0, sceneConfigData);
    }

    public updateCameraData(newCameraData: Float32Array): void {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('Buffer Manager nicht initialisiert');
        }

        this.cameraData = new Float32Array(newCameraData.buffer.slice(0));

        const extendedData = new Float32Array(12);
        extendedData.set(this.cameraData.slice(0, 8), 0);
        extendedData[8] = Math.random();
        extendedData[9] = Math.random();
        extendedData[10] = 0;
        extendedData[11] = 0;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
    }

    private lastSphereHash: string = '';

    public updateSpheresFromScene(scene: Scene, forceRebuild: boolean = false): void {
        // ===== NULL-CHECKS =====
        if (!this.device) {
            throw new Error('BufferManager nicht initialisiert - device ist null');
        }
        if (!this.spheresBuffer) {
            throw new Error('BufferManager nicht initialisiert - spheresBuffer ist null');
        }

        const spheresData = scene.getSpheresData();

        // Prüfe ob sich Spheres tatsächlich geändert haben
        const currentHash = this.hashSphereData(spheresData);
        const spheresChanged = currentHash !== this.lastSphereHash || forceRebuild;

        if (spheresChanged) {
            this.lastSphereHash = currentHash;
            this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(spheresData));
            this.logger.buffer(`✅ Spheres aktualisiert (Hash: ${currentHash.slice(0, 8)}...)${forceRebuild ? ' [FORCE]' : ''}`);

            // BVH nur bei echten Änderungen neu bauen
            if (this.bvhEnabled) {
                this.buildBVH(spheresData, scene.getSphereCount());
            }
        } else {
            this.logger.buffer('⚡ Spheres unverändert - kein Update/BVH-Rebuild (Cache optimiert!)');
        }
    }

    /**
     * BVH aktivieren/deaktivieren 
     */
    public setBVHEnabled(enabled: boolean): void {
        const wasEnabled = this.bvhEnabled;
        this.bvhEnabled = enabled;

        if (enabled && !wasEnabled && this.spheresData) {
            // BVH aktivieren
            const sphereCount = Math.floor(this.spheresData.length / 8);
            if (!this.bvhNodesBuffer || !this.bvhSphereIndicesBuffer) {
                this.createBVHBuffers(sphereCount);
            }
            this.buildBVH(this.spheresData, sphereCount);
            this.logger.buffer('BVH aktiviert');
        } else if (!enabled && wasEnabled) {
            // BVH deaktivieren
            this.logger.buffer('BVH deaktiviert');
        }
    }

    /**
     * BVH-Statistiken abrufen 
     */
    public getBVHStats(): {
        enabled: boolean;
        nodeCount: number;
        leafCount: number;
        maxDepth: number;
        memoryUsageKB: number;
        estimatedSpeedup: number;
    } | null {
        if (!this.bvhEnabled || !this.lastBVHResult) {
            return null;
        }

        const sphereCount = this.spheresData ? Math.floor(this.spheresData.length / 8) : 0;
        const linearTests = sphereCount;
        const bvhTests = Math.log2(Math.max(1, sphereCount)) * 1.5;
        const estimatedSpeedup = linearTests / Math.max(1, bvhTests);

        const nodesBytes = this.lastBVHResult.nodeCount * BVH_CONFIG.BYTES_PER_NODE;
        const indicesBytes = sphereCount * 4; // uint32
        const memoryUsageKB = (nodesBytes + indicesBytes) / 1024;

        return {
            enabled: true,
            nodeCount: this.lastBVHResult.nodeCount,
            leafCount: this.lastBVHResult.leafCount,
            maxDepth: this.lastBVHResult.maxDepth,
            memoryUsageKB,
            estimatedSpeedup
        };
    }

    public updateRenderInfo(frameTime: number = 0): void {
        if (!this.device || !this.renderInfoBuffer) {
            throw new Error('Buffer Manager nicht initialisiert');
        }

        const sphereCount = this.spheresData ? Math.floor(this.spheresData.length / 8) : 0;
        const renderInfoData = new Uint32Array([this.canvasWidth, this.canvasHeight, sphereCount, Math.floor(frameTime)]);
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);
    }

    public getAllBuffers(): {
        camera: GPUBuffer;
        spheres: GPUBuffer;
        renderInfo: GPUBuffer;
        cache: GPUBuffer;
        accumulation: GPUBuffer;
        sceneConfig: GPUBuffer;
        bvhNodes?: GPUBuffer;
        bvhSphereIndices?: GPUBuffer;
    } {
        if (!this.cameraBuffer || !this.spheresBuffer || !this.renderInfoBuffer ||
            !this.cacheBuffer || !this.accumulationBuffer || !this.sceneConfigBuffer) {
            throw new Error('Nicht alle Buffers sind initialisiert');
        }

        const buffers: any = {
            camera: this.cameraBuffer,
            spheres: this.spheresBuffer,
            renderInfo: this.renderInfoBuffer,
            cache: this.cacheBuffer,
            accumulation: this.accumulationBuffer,
            sceneConfig: this.sceneConfigBuffer,
        };

        // BVH-Buffers hinzufügen falls aktiviert
        if (this.bvhEnabled && this.bvhNodesBuffer && this.bvhSphereIndicesBuffer) {
            buffers.bvhNodes = this.bvhNodesBuffer;
            buffers.bvhSphereIndices = this.bvhSphereIndicesBuffer;
        }
        // 🔧 DEBUG: Buffer-Bindings prüfen  
        console.log(`🔍 Buffer Bindings Debug:`);
        console.log(`├─ BVH enabled: ${this.bvhEnabled}`);
        console.log(`├─ bvhNodesBuffer exists: ${!!this.bvhNodesBuffer}`);
        console.log(`├─ bvhSphereIndicesBuffer exists: ${!!this.bvhSphereIndicesBuffer}`);

        if (this.bvhEnabled && this.bvhNodesBuffer && this.bvhSphereIndicesBuffer) {
            buffers.bvhNodes = this.bvhNodesBuffer;
            buffers.bvhSphereIndices = this.bvhSphereIndicesBuffer;
            console.log(`✅ BVH-Buffers zu Bind Group hinzugefügt`);
        } else {
            console.log(`❌ BVH-Buffers NICHT hinzugefügt!`);
        }

        return buffers;
    }

    private hashSphereData(data: Float32Array): string {
        // Einfacher Hash für die ersten 100 Bytes (genug für Änderungs-Erkennung)
        let hash = 0;
        for (let i = 0; i < Math.min(100, data.length); i++) {
            hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
        }
        return hash.toString();
    }

    /**
     * BVH-Buffer-Getter 
     */
    public getBVHNodesBuffer(): GPUBuffer | null {
        return this.bvhNodesBuffer;
    }

    public getBVHSphereIndicesBuffer(): GPUBuffer | null {
        return this.bvhSphereIndicesBuffer;
    }

    public isBVHEnabled(): boolean {
        return this.bvhEnabled;
    }

    public getCacheBuffer(): GPUBuffer {
        if (!this.cacheBuffer) {
            throw new Error('Cache Buffer nicht initialisiert');
        }
        return this.cacheBuffer;
    }

    public getSpheresData(): Float32Array {
        if (!this.spheresData) {
            throw new Error('Spheres-Daten nicht verfügbar');
        }
        return this.spheresData;
    }

    public getCameraData(): Float32Array {
        if (!this.cameraData) {
            throw new Error('Camera-Daten nicht verfügbar');
        }
        return this.cameraData;
    }

    public isInitialized(): boolean {
        return this.device !== null &&
            this.cameraBuffer !== null &&
            this.spheresBuffer !== null &&
            this.renderInfoBuffer !== null &&
            this.cacheBuffer !== null &&
            this.accumulationBuffer !== null &&
            this.sceneConfigBuffer !== null;
    }

    public getDevice(): GPUDevice {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }
        return this.device;
    }

    public cleanup(): void {
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.cleanup();
            this.cacheInvalidationManager = null;
        }

        if (this.cameraBuffer) {
            this.cameraBuffer.destroy();
            this.cameraBuffer = null;
        }

        if (this.spheresBuffer) {
            this.spheresBuffer.destroy();
            this.spheresBuffer = null;
        }

        if (this.renderInfoBuffer) {
            this.renderInfoBuffer.destroy();
            this.renderInfoBuffer = null;
        }

        if (this.cacheBuffer) {
            this.cacheBuffer.destroy();
            this.cacheBuffer = null;
        }

        if (this.accumulationBuffer) {
            this.accumulationBuffer.destroy();
            this.accumulationBuffer = null;
        }

        if (this.sceneConfigBuffer) {
            this.sceneConfigBuffer.destroy();
            this.sceneConfigBuffer = null;
        }

        this.device = null;
        this.cameraData = null;
        this.spheresData = null;
    }
}