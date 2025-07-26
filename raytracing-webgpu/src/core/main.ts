declare interface Navigator {
  gpu: GPU;
}

declare var GPUCanvasContext: any;
declare var GPURenderPassDescriptor: any;

async function initWebGPU() {
  if (!navigator.gpu) {
    throw new Error("WebGPU wird nicht unterstützt – bitte Chrome oder Edge mit WebGPU aktivieren");
  }

  const canvas = document.getElementById("gpu-canvas") as HTMLCanvasElement;
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter?.requestDevice();

  const context = canvas.getContext("webgpu") as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device!,
    format: format,
    alphaMode: "opaque",
  });

  const commandEncoder = device!.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  };

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.end();

  device!.queue.submit([commandEncoder.finish()]);
}

initWebGPU();
