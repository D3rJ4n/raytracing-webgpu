import { BUFFER_CONFIG, calculateAccumulationBufferSize, calculateCacheBufferSize, SCENE_CONFIG } from "../utils/Constants";
import { Logger } from "../utils/Logger";
import { Scene } from "../scene/Scene";
import { GeometryInvalidationManager } from "../cache/InvalidationManager";

export class BufferManager {
    private device: GPUDevice | null = null;
    private logger: Logger;

    private cameraBuffer: GPUBuffer | null = null;
    private spheresBuffer: GPUBuffer | null = null;
    private renderInfoBuffer: GPUBuffer | null = null;
    private cacheBuffer: GPUBuffer | null = null;
    private accumulationBuffer: GPUBuffer | null = null;
    private sceneConfigBuffer: GPUBuffer | null = null;

    private cameraData: Float32Array | null = null;
    private spheresData: Float32Array | null = null;

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

        this.initializeCacheInvalidation();
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

    public updateSpheresFromScene(scene: Scene): void {
        if (!this.device || !this.spheresBuffer) {
            throw new Error('Buffer Manager nicht initialisiert');
        }

        const newSpheresData = scene.getSpheresData();
        this.spheresData = new Float32Array(newSpheresData.buffer.slice(0));
        this.device.queue.writeBuffer(this.spheresBuffer, 0, Float32Array.from(this.spheresData));
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
    } {
        if (!this.isInitialized()) {
            throw new Error('Nicht alle Buffer initialisiert');
        }

        return {
            camera: this.cameraBuffer!,
            spheres: this.spheresBuffer!,
            renderInfo: this.renderInfoBuffer!,
            cache: this.cacheBuffer!,
            accumulation: this.accumulationBuffer!,
            sceneConfig: this.sceneConfigBuffer!
        };
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