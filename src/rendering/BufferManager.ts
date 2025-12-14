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
            let result;
            if (changeInfo?.type === 'structural' || !changeInfo) {
                // Strukturelle Änderung oder keine Info → Komplette Invalidation
                result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);
                // console.log(`🔄 Cache: Komplette Invalidation (${result.pixelsInvalidated} pixels)`);
            } else if (changeInfo.sphereIndex !== undefined) {
                // Einzelne Sphere geändert → Selektive Invalidation
                // TODO: Implementiere invalidateSphere in CacheInvalidationManager
                // Für jetzt: Benutze vollständige Invalidation
                result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);
                // console.log(`🎯 Cache: Selektive Invalidation für Sphere ${changeInfo.sphereIndex} (${result.pixelsInvalidated} pixels)`);
            } else {
                // Fallback
                result = await this.cacheInvalidationManager.invalidateForFrame(spheresData, cameraData);
            }

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
            size: 64,
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
     * Update Spheres mit intelligentem BVH-Handling und selektiver Cache-Invalidation
     * @param scene Die Scene mit den Sphere-Daten
     * @param changeInfo Optional: Welche Art von Änderung (für Optimierung)
     */
    public async updateSpheresFromScene(
        scene: Scene,
        changeInfo?: { type: 'color' | 'geometry' | 'structural', sphereIndex?: number }
    ): Promise<void> {
        if (!this.device) {
            throw new Error('BufferManager nicht initialisiert - device ist null');
        }

        if (!this.spheresBuffer) {
            throw new Error('BufferManager nicht initialisiert - spheresBuffer ist null');
        }
        const spheresData = scene.getSpheresData();
        const sphereCount = scene.getSphereCount();

        const currentHash = this.hashSphereData(spheresData);
        const spheresChanged = currentHash !== this.lastSphereHash || changeInfo !== undefined;

        // ⚡ DEBUG: Log erste Sphere Position aus spheresData
        // console.log(`📊 BufferManager spheresData[0-7]: [${spheresData[0].toFixed(3)}, ${spheresData[1].toFixed(3)}, ${spheresData[2].toFixed(3)}, ${spheresData[3].toFixed(3)}, ${spheresData[4].toFixed(3)}, ${spheresData[5].toFixed(3)}, ${spheresData[6].toFixed(3)}, ${spheresData[7].toFixed(3)}]`);
        // console.log(`Hash Check: last=${this.lastSphereHash} current=${currentHash} changed=${spheresChanged}`);
        const sphereCountChanged = sphereCount !== this.lastSphereCount;
        // Auto-detect structural change

        let changeType = changeInfo?.type || (sphereCountChanged ? 'structural' : 'geometry');
        const finalChangeInfo = changeInfo || { type: changeType, sphereIndex: undefined };

        if (spheresChanged) {
            // ⚡ FIX: RenderInfo aktualisieren wenn sich Sphere-Anzahl ändert!
            // WICHTIG: VOR dem Update von lastSphereCount, damit spheresData korrekt ist
            // if (sphereCountChanged) {
            //     console.log(`⚡ CALLING updateRenderInfo() because sphereCount changed: ${this.lastSphereCount} → ${sphereCount}`);
            // }

            this.lastSphereHash = currentHash;
            this.lastSphereCount = sphereCount;

            // Gecachte Daten aktualisieren BEVOR wir GPU schreiben!
            this.spheresData = spheresData;

            // GPU Buffer aktualisieren
            // console.log(`⚡ GPU UPDATE: Writing ${spheresData.length} floats to spheresBuffer (${(spheresData.length / 8)} spheres), Sphere 0 Y=${spheresData[1].toFixed(3)}`);
            this.device.queue.writeBuffer(this.spheresBuffer, 0, new Float32Array(spheresData));

            // ⚡ WICHTIG: Warte bis Sphere-Buffer-Update in GPU geschrieben ist!
            // console.log(`⏳ [1] Waiting for Sphere Buffer write...`);
            await this.device.queue.onSubmittedWorkDone();
            // console.log(`✅ [2] Sphere Buffer write complete!`);

            // RenderInfo NACH dem Update der spheresData
            if (sphereCountChanged) {
                this.updateRenderInfo();
            }

            // BVH Rebuild Entscheidung
            const needsBVHRebuild = this.bvhEnabled && (
                changeType === 'geometry' ||
                changeType === 'structural'
            );

            if (needsBVHRebuild) {
                this.buildBVH(spheresData, sphereCount);
            }

            // Cache invalidieren (mit changeInfo für Optimierung)
            // console.log(`🔄 [3] Starting cache invalidation...`);
            await this.invalidateForSceneChanges(scene, finalChangeInfo);

            // ⚡ WICHTIG: Warte bis Cache-Invalidierung in GPU geschrieben ist!
            // console.log(`⏳ [4] Waiting for Cache Invalidation write...`);
            await this.device.queue.onSubmittedWorkDone();
            // console.log(`✅ [5] Cache Invalidation write complete!`);
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
            // ⚡ BVH deaktivieren: KOMPLETTEN Buffer mit Nullen füllen
            if (this.device && this.bvhNodesBuffer && this.bvhSphereIndicesBuffer) {
                // WICHTIG: Float32Array(0) schreibt NUR 0 Bytes, der Rest bleibt unverändert!
                // Wir müssen den KOMPLETTEN Buffer mit Nullen überschreiben
                const nodesBufferSize = BUFFER_CONFIG.BVH_NODES.SIZE;
                const indicesBufferSize = BUFFER_CONFIG.BVH_SPHERE_INDICES.SIZE;
                // Nullen für kompletten Buffer
                const emptyNodes = new Float32Array(nodesBufferSize / 4); // 4 Bytes pro Float32

                const emptyIndices = new Uint32Array(indicesBufferSize / 4); // 4 Bytes pro Uint32
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
        // ⚡ FIX: Hash-Funktion die Floats korrekt verarbeitet!
        // Problem: data[i] wird zu Integer konvertiert (3.135 → 3, 3.304 → 3)
        // Lösung: Float als Bits interpretieren oder mit Präzision multiplizieren

        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            // Multipliziere mit 1000000 um 6 Dezimalstellen zu erhalten
            // 3.135 → 3135000, 3.304 → 3304000, 3.468 → 3468000
            const value = Math.round(data[i] * 1000000);
            hash = ((hash << 5) - hash + value) & 0xffffffff;
            // Position miteinbeziehen für bessere Verteilung
            hash = (hash ^ (i * 31)) & 0xffffffff;
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

    /**
     * Resette Sphere Hash für Tests
     */
    public resetSphereHash(): void {
        this.lastSphereHash = '';
        this.lastSphereCount = 0;
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