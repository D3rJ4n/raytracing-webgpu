import { BUFFER_CONFIG, BVH_CONFIG, calculateCacheBufferSize } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";
import { InvalidationManager } from "../cache/InvalidationManager";
import { BVHBuilder, type BVHBuildResult } from "../acceleration/BVHBuilder";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
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

    private cacheInvalidationManager: InvalidationManager | null = null;
    private invalidationWriteBufferCallCount: number = 0;

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
        ambientIntensity?: number,
        groundY?: number
    ): void {
        this.device = device;
        this.cameraData = cameraData;
        this.spheresData = sphereData;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        const sphereCount = Math.floor(sphereData.length / 8);
        this.lastSphereCount = sphereCount;

        this.createCameraBuffer();
        this.createSpheresBuffer();
        this.createRenderInfoBuffer(canvasWidth, canvasHeight, sphereCount);
        this.createExtendedCacheBuffer(canvasWidth, canvasHeight);
        this.createSceneConfigBuffer(lightPosition, ambientIntensity, groundY);
        this.createBVHBuffers(sphereCount);

        this.initializeCacheInvalidation();

    }

    /**
     * BVH-Buffers erstellen 
     */
    private createBVHBuffers(sphereCount: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.logger.buffer('Erstelle BVH-Buffers...');
        // Use sphereCount for visibility in logs to avoid lint warnings
        this.logger.buffer(`Requested BVH buffers for sphereCount: ${sphereCount}`);

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

        // this.logger.success(`BVH erstellt: ${this.lastBVHResult.nodeCount} Nodes, Tiefe ${this.lastBVHResult.maxDepth}`);
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

        const cacheData = new Float32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0.0);
        this.device.queue.writeBuffer(this.cacheBuffer, 0, cacheData);
    }

    private initializeCacheInvalidation(): void {
        if (!this.device || !this.cacheBuffer) {
            return;
        }

        try {
            this.cacheInvalidationManager = new InvalidationManager(
                this.device,
                this.cacheBuffer,
                this.canvasWidth,
                this.canvasHeight
            );
        } catch (error) {
            this.logger.error('Cache-Invalidierung-Manager konnte nicht initialisiert werden:', error);
        }
    }

    /**
     * Invalidiert Cache basierend auf Scene-Änderungen
     * @param scene Die Scene
     * @param changeInfo Optional: Info über spezifische Änderung für selektive Invalidation
     */
    public async invalidateForSceneChanges(
        scene: Scene,
        changeInfo?: { type: 'color' | 'geometry' | 'structural', sphereIndex?: number }
    ): Promise<void> {
        if (!this.cacheInvalidationManager) {
            this.logger.error('InvalidationManager nicht verfügbar, invalidiere kompletten Cache');
            this.resetCache(this.canvasWidth, this.canvasHeight);
            return;
        }

        const spheresData = scene.getSpheresData();
        const cameraData = scene.getCameraData();

        try {
            // Entscheide zwischen vollständiger und selektiver Invalidation
            const result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);

            this.legacyInvalidationStats.totalInvalidations++;
            this.legacyInvalidationStats.pixelsInvalidated += result.pixelsInvalidated;
            this.legacyInvalidationStats.lastInvalidationTime = result.invalidationTime;

        } catch (error) {
            this.logger.error('Intelligente Cache-Invalidierung fehlgeschlagen:', error);
            this.logger.error('Invalidiere kompletten Cache als Fallback');
            this.resetCache(this.canvasWidth, this.canvasHeight);
        }
    }

    /**
     * Cache-Invalidierung mit expliziten alten und neuen Sphere-Daten
     * WICHTIG: Für selektive Invalidierung brauchen wir die ALTEN Daten zum Vergleich!
     */
    private async invalidateForSceneChangesWithOldData(
        oldSpheresData: Float32Array,
        newSpheresData: Float32Array,
        cameraData: Float32Array,
        changeInfo?: { type: 'color' | 'geometry' | 'structural', sphereIndex?: number }
    ): Promise<void> {
        if (!this.cacheInvalidationManager) {
            this.logger.error('InvalidationManager nicht verfügbar, invalidiere kompletten Cache');
            this.resetCache(this.canvasWidth, this.canvasHeight);
            return;
        }

        try {
            const result = await this.cacheInvalidationManager.invalidateForFrame(newSpheresData, cameraData);
            this.legacyInvalidationStats.totalInvalidations++;
            this.legacyInvalidationStats.pixelsInvalidated += result.pixelsInvalidated;
            this.legacyInvalidationStats.lastInvalidationTime = result.invalidationTime;

        } catch (error) {
            this.logger.error('Intelligente Cache-Invalidierung fehlgeschlagen:', error);
            this.logger.error('Invalidiere kompletten Cache als Fallback');
            this.resetCache(this.canvasWidth, this.canvasHeight);
        }
    }



    public getInvalidationWriteBufferCount(): number {
        const c = this.cacheInvalidationManager ? this.cacheInvalidationManager.getWriteBufferCallCount() : 0;
        return c + this.invalidationWriteBufferCallCount;
    }

    public resetInvalidationWriteBufferCount(): void {
        this.invalidationWriteBufferCallCount = 0;
        if (this.cacheInvalidationManager) {
            this.cacheInvalidationManager.resetWriteBufferCallCount();
        }
    }

    public resetCache(width: number, height: number): void {
        if (!this.device || !this.cacheBuffer) {
            throw new Error('Device oder Cache-Buffer nicht verfügbar');
        }

        const pixelCount = width * height;
        const cacheData = new Float32Array(pixelCount * BUFFER_CONFIG.CACHE.COMPONENTS_PER_PIXEL).fill(0.0);
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
            size: this.spheresData.byteLength,
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

    private createSceneConfigBuffer(lightPosition?: { x: number; y: number; z: number }, ambientIntensity?: number, groundY?: number): void {
        if (!this.device) {
            throw new Error('Device nicht verfügbar');
        }

        this.sceneConfigBuffer = this.device.createBuffer({
            label: BUFFER_CONFIG.SCENE_CONFIG.LABEL,
            size: 64, // Must be multiple of 16 for uniform buffers (was 48, now 64 for bvhEnabled + padding)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const light = lightPosition || { x: 0, y: 10, z: 0 };
        const ambient = ambientIntensity !== undefined ? ambientIntensity : 0.2;
        const ground = groundY !== undefined ? groundY : -1.0;

        // Updated structure with bvhEnabled flag
        const sceneConfigData = new Float32Array([
            ground, 0, 0, 0,           // Ground Y position, padding
            light.x, light.y, light.z, 1.0,  // Light position, shadow enabled
            1.0, 8, 0.01, ambient,     // Reflections enabled, max bounces, min contribution, ambient
            this.bvhEnabled ? 1.0 : 0.0  // BVH enabled flag
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

    /**
     * Aktualisiert nur den bvhEnabled-Flag im SceneConfig-Buffer (Offset 48)
     */
    private updateBVHFlagInSceneConfig(): void {
        if (!this.device || !this.sceneConfigBuffer) {
            return; // Noch nicht initialisiert, wird beim nächsten Init gesetzt
        }

        // bvhEnabled ist das 13. float im Buffer (Index 12, Offset 48 Bytes)
        const bvhFlagData = new Float32Array([this.bvhEnabled ? 1.0 : 0.0]);
        this.device.queue.writeBuffer(this.sceneConfigBuffer, 48, bvhFlagData);
    }

    private lastSphereHash: string = '';
    private lastSphereCount: number = 0;

    /**
     * Update Kamera-Daten von Scene (für Raycasting-Sync)
     */
    public async updateCameraFromScene(scene: Scene): Promise<void> {
        if (!this.device || !this.cameraBuffer) {
            throw new Error('BufferManager nicht initialisiert');
        }

        const cameraData = scene.getCameraData();
        this.cameraData = cameraData;

        // Erweitere Camera-Data mit Random-Seeds und Sample-Count
        const extendedData = new Float32Array(12);
        extendedData.set(cameraData.slice(0, 8), 0);
        extendedData[8] = 0;  // randomSeed1
        extendedData[9] = 0;  // randomSeed2
        extendedData[10] = 0; // sampleCount
        extendedData[11] = 0; // padding

        this.device.queue.writeBuffer(this.cameraBuffer, 0, extendedData);
        this.logger.buffer('Kamera-Daten aktualisiert');
    }

    /**
     * Update Spheres mit intelligentem BVH-Handling und selektiver Cache-Invalidation
     * @param scene Die Scene mit den Sphere-Daten
     * @param changeInfo Optional: Welche Art von Änderung (für Optimierung)
     */
    public async updateSpheresFromScene(
        scene: Scene,
        changeInfo?: { type: 'color' | 'geometry' | 'structural', sphereIndex?: number }
    ): Promise<void> {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('BufferManager nicht initialisiert');
        }

        const spheresData = scene.getSpheresData();
        const sphereCount = scene.getSphereCount();

        if (this.spheresData === null && this.cacheInvalidationManager) {
            await this.cacheInvalidationManager.invalidateForFrame(spheresData, scene.getCameraData());
        }

        const currentHash = this.hashSphereData(spheresData);
        const spheresChanged = currentHash !== this.lastSphereHash || changeInfo !== undefined;
        const sphereCountChanged = sphereCount !== this.lastSphereCount;
        const changeType = changeInfo?.type || (sphereCountChanged ? 'structural' : 'geometry');
        const finalChangeInfo = changeInfo || { type: changeType, sphereIndex: undefined };

        if (spheresChanged) {
            if (this.spheresData !== null) {
                await this.invalidateForSceneChangesWithOldData(this.spheresData, spheresData, scene.getCameraData(), finalChangeInfo);
            } else {
                await this.invalidateForSceneChanges(scene, finalChangeInfo);
            }

            this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(spheresData));

            this.lastSphereHash = currentHash;
            this.lastSphereCount = sphereCount;
            this.spheresData = spheresData;

            if (sphereCountChanged) {
                this.updateRenderInfo();
            }

            const needsBVHRebuild = this.bvhEnabled && (changeType === 'geometry' || changeType === 'structural');
            if (needsBVHRebuild) {
                this.buildBVH(spheresData, sphereCount);
            }
        }
    }

    /**
     * BVH aktivieren/deaktivieren
     */
    public setBVHEnabled(enabled: boolean): void {
        const wasEnabled = this.bvhEnabled;
        this.bvhEnabled = enabled;

        // WICHTIG: SceneConfig-Buffer aktualisieren mit neuem BVH-Status!
        this.updateBVHFlagInSceneConfig();

        if (enabled && !wasEnabled && this.spheresData) {
            // BVH aktivieren
            const sphereCount = Math.floor(this.spheresData.length / 8);
            if (!this.bvhNodesBuffer || !this.bvhSphereIndicesBuffer) {
                this.createBVHBuffers(sphereCount);
            }
            this.buildBVH(this.spheresData, sphereCount);
            this.logger.buffer('BVH aktiviert');
        } else if (!enabled && wasEnabled) {
            if (this.device && this.bvhNodesBuffer && this.bvhSphereIndicesBuffer) {
                const nodesBufferSize = BUFFER_CONFIG.BVH_NODES.SIZE;
                const indicesBufferSize = BUFFER_CONFIG.BVH_SPHERE_INDICES.SIZE;
                const emptyNodes = new Float32Array(nodesBufferSize / 4);
                const emptyIndices = new Uint32Array(indicesBufferSize / 4);

                this.device.queue.writeBuffer(this.bvhNodesBuffer, 0, emptyNodes);
                this.device.queue.writeBuffer(this.bvhSphereIndicesBuffer, 0, emptyIndices);
                this.logger.buffer('BVH deaktiviert (Buffers mit Nullen gefüllt → linearer Fallback)');
            }
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

        const sphereCount = this.lastSphereCount;
        const renderInfoData = new Uint32Array([this.canvasWidth, this.canvasHeight, sphereCount, Math.floor(frameTime)]);
        this.device.queue.writeBuffer(this.renderInfoBuffer, 0, renderInfoData);
    }

    public getAllBuffers(): {
        camera: GPUBuffer;
        spheres: GPUBuffer;
        renderInfo: GPUBuffer;
        cache: GPUBuffer;
        sceneConfig: GPUBuffer;
        bvhNodes?: GPUBuffer;
        bvhSphereIndices?: GPUBuffer;
    } {
        if (!this.cameraBuffer || !this.spheresBuffer || !this.renderInfoBuffer ||
            !this.cacheBuffer || !this.sceneConfigBuffer) {
            throw new Error('Nicht alle Buffers sind initialisiert');
        }

        const buffers: any = {
            camera: this.cameraBuffer,
            spheres: this.spheresBuffer,
            renderInfo: this.renderInfoBuffer,
            cache: this.cacheBuffer,
            sceneConfig: this.sceneConfigBuffer,
        };

        if (this.bvhNodesBuffer && this.bvhSphereIndicesBuffer) {
            buffers.bvhNodes = this.bvhNodesBuffer;
            buffers.bvhSphereIndices = this.bvhSphereIndicesBuffer;
        }

        return buffers;
    }

    private hashSphereData(data: Float32Array): string {
        // Hash für ALLE Sphere-Daten (korrekte Änderungs-Erkennung)
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
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

        if (this.sceneConfigBuffer) {
            this.sceneConfigBuffer.destroy();
            this.sceneConfigBuffer = null;
        }

        this.device = null;
        this.cameraData = null;
        this.spheresData = null;
    }
}