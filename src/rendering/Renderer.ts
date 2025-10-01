import { Logger } from '../utils/Logger';
import { calculateWorkgroups } from '../utils/Constants';

/**
 * 🖼️ Renderer - Haupt-Rendering-System
 * 
 * Orchestriert den kompletten Rendering-Prozess:
 * - Compute Pass (Raytracing)
 * - Render Pass (Display)
 * - Command Encoding & Submission
 * - Progressive Supersampling (NEU)
 */
export class Renderer {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private logger: Logger;

    // ===== PIPELINES =====
    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;

    // ===== BIND GROUPS =====
    private computeBindGroup: GPUBindGroup | null = null;
    private renderBindGroup: GPUBindGroup | null = null;

    // ===== FRAME COUNTER =====
    private frameCount: number = 0;

    // ===== SUPERSAMPLING STATE (NEU) =====
    private currentSample: number = 0;
    private maxSamples: number = 0;
    private isAccumulating: boolean = false;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Renderer initialisieren
     */
    public initialize(
        device: GPUDevice,
        context: GPUCanvasContext,
        computePipeline: GPUComputePipeline,
        renderPipeline: GPURenderPipeline,
        computeBindGroup: GPUBindGroup,
        renderBindGroup: GPUBindGroup
    ): void {
        this.device = device;
        this.context = context;
        this.computePipeline = computePipeline;
        this.renderPipeline = renderPipeline;
        this.computeBindGroup = computeBindGroup;
        this.renderBindGroup = renderBindGroup;

        this.logger.success('Renderer initialisiert');
    }

    /**
     * 🎬 Einzelnen Frame rendern
     */
    public async renderFrame(canvas: HTMLCanvasElement): Promise<number> {
        if (!this.isInitialized()) {
            throw new Error('Renderer nicht initialisiert');
        }

        const startTime = performance.now();
        this.frameCount++;

        this.logger.frame(this.frameCount, 'Starte Rendering...');
        this.logRenderingResources();

        try {
            // Command Encoder erstellen
            const commandEncoder = this.device!.createCommandEncoder({
                label: `Frame ${this.frameCount} Commands`
            });

            // Compute Pass durchführen
            await this.executeComputePass(commandEncoder, canvas);

            // Render Pass durchführen
            this.executeRenderPass(commandEncoder);

            // Commands zur GPU senden
            this.device!.queue.submit([commandEncoder.finish()]);

            const renderTime = performance.now() - startTime;
            this.logger.frame(this.frameCount, `Rendering erfolgreich abgeschlossen (${renderTime.toFixed(2)}ms)`);

            return renderTime;

        } catch (error) {
            this.logger.error(`Fehler beim Rendern von Frame ${this.frameCount}:`, error);
            throw error;
        }
    }

    /**
     * ⚡ Compute Pass ausführen (Raytracing)
     */
    private async executeComputePass(
        commandEncoder: GPUCommandEncoder,
        canvas: HTMLCanvasElement
    ): Promise<void> {
        this.logger.frame(this.frameCount, 'Starte Compute Pass (Raytracing)...');

        const computePass = commandEncoder.beginComputePass({
            label: `Frame ${this.frameCount} Compute Pass`
        });

        // Pipeline und Daten setzen
        computePass.setPipeline(this.computePipeline!);
        computePass.setBindGroup(0, this.computeBindGroup!);

        // Workgroups berechnen
        const workgroups = calculateWorkgroups(canvas.width, canvas.height);

        this.logger.frame(
            this.frameCount,
            `Workgroups: ${workgroups.x}x${workgroups.y} = ${workgroups.x * workgroups.y}`
        );

        // Compute Shader ausführen
        computePass.dispatchWorkgroups(workgroups.x, workgroups.y);
        computePass.end();

        this.logger.frame(this.frameCount, 'Compute Pass abgeschlossen');
    }

    /**
     * 🎨 Render Pass ausführen (Display)
     */
    private executeRenderPass(commandEncoder: GPUCommandEncoder): void {
        this.logger.frame(this.frameCount, 'Starte Render Pass (Anzeige)...');

        // Canvas-Texture für Output
        const textureView = this.context!.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            label: `Frame ${this.frameCount} Render Pass`,
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 }, // Schwarz
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        // Pipeline und Daten setzen
        renderPass.setPipeline(this.renderPipeline!);
        renderPass.setBindGroup(0, this.renderBindGroup!);

        // Fullscreen-Triangle zeichnen (3 Vertices ohne Buffer)
        renderPass.draw(3);
        renderPass.end();

        this.logger.frame(this.frameCount, 'Render Pass abgeschlossen');
    }

    /**
     * 🎨 Progressive Supersampling aktivieren (NEU)
     */
    public startProgressive(maxSamples: number = 16): void {
        this.currentSample = 0;
        this.maxSamples = maxSamples;
        this.isAccumulating = true;
        this.logger.info(`Progressive Supersampling gestartet (${maxSamples} samples)`);
    }

    /**
     * ⏹️ Progressive Supersampling stoppen (NEU)
     */
    public stopProgressive(): void {
        this.isAccumulating = false;
        this.logger.info('Progressive Supersampling gestoppt');
    }

    /**
     * 🔄 Accumulation zurücksetzen (NEU)
     */
    public resetAccumulation(): void {
        this.currentSample = 0;
        this.logger.info('Accumulation zurückgesetzt');
    }

    /**
     * 📊 Progressive Rendering Status (NEU)
     */
    public getProgressiveStatus(): {
        isAccumulating: boolean;
        currentSample: number;
        maxSamples: number;
        progress: number;
    } {
        return {
            isAccumulating: this.isAccumulating,
            currentSample: this.currentSample,
            maxSamples: this.maxSamples,
            progress: this.maxSamples > 0 ? (this.currentSample / this.maxSamples) * 100 : 0
        };
    }

    /**
     * 🎬 Frame mit Progressive Supersampling rendern (NEU)
     */
    public async renderFrameProgressive(canvas: HTMLCanvasElement): Promise<number> {
        if (!this.isInitialized()) {
            throw new Error('Renderer nicht initialisiert');
        }

        const startTime = performance.now();
        this.frameCount++;

        // Normal rendern
        const commandEncoder = this.device!.createCommandEncoder({
            label: `Frame ${this.frameCount} Commands`
        });

        await this.executeComputePass(commandEncoder, canvas);
        this.executeRenderPass(commandEncoder);

        this.device!.queue.submit([commandEncoder.finish()]);

        // Sample Counter erhöhen
        if (this.isAccumulating && this.currentSample < this.maxSamples) {
            this.currentSample++;

            if (this.currentSample >= this.maxSamples) {
                this.logger.success(`Supersampling abgeschlossen (${this.maxSamples} samples)`);
            }
        }

        const renderTime = performance.now() - startTime;
        return renderTime;
    }

    /**
     * 🔄 Kontinuierliches Progressive Rendering (NEU)
     */
    public async startContinuousProgressive(
        canvas: HTMLCanvasElement,
        onProgress?: (sample: number, maxSamples: number) => void
    ): Promise<void> {
        this.startProgressive();

        while (this.isAccumulating && this.currentSample < this.maxSamples) {
            await this.renderFrameProgressive(canvas);

            if (onProgress) {
                onProgress(this.currentSample, this.maxSamples);
            }

            // Kurze Pause für UI-Updates
            await new Promise(resolve => setTimeout(resolve, 16));
        }

        this.logger.success('Progressive Rendering abgeschlossen');
    }

    /**
     * 📊 Batch-Rendering (mehrere Frames)
     */
    public async renderBatch(
        canvas: HTMLCanvasElement,
        frameCount: number,
        delayMs: number = 100
    ): Promise<{
        totalTime: number;
        averageFrameTime: number;
        framesTimes: number[];
    }> {
        this.logger.info(`Starte Batch-Rendering: ${frameCount} Frames...`);

        const frameTimes: number[] = [];
        const startTime = performance.now();

        for (let i = 0; i < frameCount; i++) {
            const frameTime = await this.renderFrame(canvas);
            frameTimes.push(frameTime);

            // Kurze Pause zwischen Frames
            if (delayMs > 0 && i < frameCount - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        const totalTime = performance.now() - startTime;
        const averageFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

        this.logger.info(`Batch-Rendering abgeschlossen:`);
        this.logger.info(`  Frames: ${frameCount}`);
        this.logger.info(`  Gesamtzeit: ${totalTime.toFixed(2)}ms`);
        this.logger.info(`  Durchschnitt pro Frame: ${averageFrameTime.toFixed(2)}ms`);
        this.logger.info(`  FPS (theoretisch): ${(1000 / averageFrameTime).toFixed(1)}`);

        return {
            totalTime,
            averageFrameTime,
            framesTimes: frameTimes
        };
    }

    /**
     * 🔄 Kontinuierlicher Render-Loop
     */
    public startRenderLoop(canvas: HTMLCanvasElement, targetFPS: number = 60): void {
        if (!this.isInitialized()) {
            throw new Error('Renderer nicht initialisiert');
        }

        const targetFrameTime = 1000 / targetFPS;
        let lastFrameTime = performance.now();

        const renderLoop = async () => {
            const currentTime = performance.now();
            const deltaTime = currentTime - lastFrameTime;

            if (deltaTime >= targetFrameTime) {
                try {
                    await this.renderFrame(canvas);
                    lastFrameTime = currentTime;
                } catch (error) {
                    this.logger.error('Fehler im Render-Loop:', error);
                    return; // Loop beenden bei Fehler
                }
            }

            requestAnimationFrame(renderLoop);
        };

        this.logger.info(`Starte Render-Loop (Target: ${targetFPS} FPS)...`);
        renderLoop();
    }

    /**
     * 🔍 Rendering-Ressourcen loggen
     */
    private logRenderingResources(): void {
        const resources = [
            `Cache-Buffer: ${this.computeBindGroup ? 'vorhanden' : 'FEHLT!'}`,
            `Compute Pipeline: ${this.computePipeline ? 'vorhanden' : 'FEHLT!'}`,
            `Render Pipeline: ${this.renderPipeline ? 'vorhanden' : 'FEHLT!'}`
        ];

        resources.forEach(resource => {
            this.logger.frame(this.frameCount, resource);
        });

        if (!this.computeBindGroup || !this.computePipeline || !this.renderPipeline) {
            throw new Error(`Frame ${this.frameCount}: Nicht alle Ressourcen verfügbar!`);
        }
    }

    /**
     * 📊 Frame-Counter abrufen
     */
    public getFrameCount(): number {
        return this.frameCount;
    }

    /**
     * 🔄 Frame-Counter zurücksetzen
     */
    public resetFrameCount(): void {
        this.frameCount = 0;
        this.logger.info('Frame-Counter zurückgesetzt');
    }

    /**
     * 📈 Rendering-Statistiken abrufen
     */
    public getStatistics(): {
        frameCount: number;
        isInitialized: boolean;
        supersamplingActive: boolean;
        currentSample: number;
        maxSamples: number;
    } {
        return {
            frameCount: this.frameCount,
            isInitialized: this.isInitialized(),
            supersamplingActive: this.isAccumulating,
            currentSample: this.currentSample,
            maxSamples: this.maxSamples
        };
    }

    /**
     * ✅ Initialisierungs-Status prüfen
     */
    public isInitialized(): boolean {
        return this.device !== null &&
            this.context !== null &&
            this.computePipeline !== null &&
            this.renderPipeline !== null &&
            this.computeBindGroup !== null &&
            this.renderBindGroup !== null;
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        // Pipelines und Bind Groups werden von ihren jeweiligen Managern verwaltet
        this.device = null;
        this.context = null;
        this.computePipeline = null;
        this.renderPipeline = null;
        this.computeBindGroup = null;
        this.renderBindGroup = null;

        this.frameCount = 0;
        this.currentSample = 0;
        this.maxSamples = 0;
        this.isAccumulating = false;

        this.logger.info('Renderer aufgeräumt');
    }
}