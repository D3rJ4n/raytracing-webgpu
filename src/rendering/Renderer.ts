import { Logger } from '../utils/Logger';
import { calculateWorkgroups } from '../utils/Constants';

export class Renderer {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private logger: Logger;

    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;
    private computeBindGroup: GPUBindGroup | null = null;
    private renderBindGroup: GPUBindGroup | null = null;

    private frameCount: number = 0;

    constructor() {
        this.logger = Logger.getInstance();
    }

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
    }

    public async renderFrame(canvas: HTMLCanvasElement): Promise<number> {
        if (!this.isInitialized()) {
            throw new Error('Renderer nicht initialisiert');
        }

        const startTime = performance.now();
        this.frameCount++;

        try {
            const commandEncoder = this.device!.createCommandEncoder({
                label: `Frame ${this.frameCount} Commands`
            });

            await this.executeComputePass(commandEncoder, canvas);
            this.executeRenderPass(commandEncoder);

            this.device!.queue.submit([commandEncoder.finish()]);

            return performance.now() - startTime;

        } catch (error) {
            this.logger.error(`Fehler beim Rendern von Frame ${this.frameCount}:`, error);
            throw error;
        }
    }

    private async executeComputePass(
        commandEncoder: GPUCommandEncoder,
        canvas: HTMLCanvasElement
    ): Promise<void> {
        const computePass = commandEncoder.beginComputePass({
            label: `Frame ${this.frameCount} Compute Pass`
        });

        computePass.setPipeline(this.computePipeline!);
        computePass.setBindGroup(0, this.computeBindGroup!);

        const workgroups = calculateWorkgroups(canvas.width, canvas.height);
        computePass.dispatchWorkgroups(workgroups.x, workgroups.y);
        computePass.end();
    }

    private executeRenderPass(commandEncoder: GPUCommandEncoder): void {
        const textureView = this.context!.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            label: `Frame ${this.frameCount} Render Pass`,
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(this.renderPipeline!);
        renderPass.setBindGroup(0, this.renderBindGroup!);
        renderPass.draw(3);
        renderPass.end();
    }

    public getFrameCount(): number {
        return this.frameCount;
    }

    public resetFrameCount(): void {
        this.frameCount = 0;
    }

    public isInitialized(): boolean {
        return this.device !== null &&
            this.context !== null &&
            this.computePipeline !== null &&
            this.renderPipeline !== null &&
            this.computeBindGroup !== null &&
            this.renderBindGroup !== null;
    }

    public cleanup(): void {
        this.device = null;
        this.context = null;
        this.computePipeline = null;
        this.renderPipeline = null;
        this.computeBindGroup = null;
        this.renderBindGroup = null;
        this.frameCount = 0;
    }
}