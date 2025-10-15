/**
 * 📢 Constants - Zentrale Konfiguration
 */

// ===== CANVAS & RENDERING =====
export const CANVAS_CONFIG = {
    ID: 'canvas',
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,
} as const;

export const STATUS_CONFIG = {
    ELEMENT_ID: 'status',
} as const;

// ===== WEBGPU KONFIGURATION =====
export const WEBGPU_CONFIG = {
    POWER_PREFERENCE: 'high-performance' as GPUPowerPreference,
    ALPHA_MODE: 'opaque' as GPUCanvasAlphaMode,
} as const;

// ===== SHADER KONFIGURATION =====
export const SHADER_CONFIG = {
    WORKGROUP_SIZE: {
        X: 8,
        Y: 8,
        Z: 1,
    },
    PATHS: {
        COMPUTE: 'src/shader/compute.wgsl',
        RENDER: 'src/shader/render.wgsl',
    },
    LABELS: {
        COMPUTE_MODULE: 'Raytracer Compute Shader',
        RENDER_MODULE: 'Render Shader',
        COMPUTE_PIPELINE: 'Compute Pipeline',
        RENDER_PIPELINE: 'Render Pipeline',
    },
} as const;

// ===== BUFFER KONFIGURATION =====
export const BUFFER_CONFIG = {
    CAMERA: {
        SIZE: 48,
        LABEL: 'Camera Buffer',
    },
    SPHERE: {
        SIZE: 16,
        LABEL: 'Sphere Buffer',
    },
    SPHERES: {
        MAX_COUNT: 1000,  // ← ERHÖHT von 20 auf 1000!
        BYTES_PER_SPHERE: 48,
        get SIZE() {
            return this.MAX_COUNT * this.BYTES_PER_SPHERE;
        },
        LABEL: 'Spheres Buffer',
    },
    RENDER_INFO: {
        SIZE: 16,
        LABEL: 'Render Info Buffer',
    },
    SCENE_CONFIG: {
        SIZE: 48,
        LABEL: 'Scene Config Buffer',
    },
    CACHE: {
        COMPONENTS_PER_PIXEL: 4,
        BYTES_PER_COMPONENT: 4,
        BYTES_PER_PIXEL: 16,
        LABEL: 'Color Cache Buffer',
    },
    ACCUMULATION: {
        COMPONENTS_PER_PIXEL: 4,
        BYTES_PER_COMPONENT: 4,
        BYTES_PER_PIXEL: 16,
        LABEL: 'Accumulation Buffer',
    },
} as const;

// ===== TEXTURE KONFIGURATION =====
export const TEXTURE_CONFIG = {
    FORMAT: 'rgba8unorm' as GPUTextureFormat,
    USAGE: {
        RENDER: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    },
    SAMPLER: {
        MAG_FILTER: 'linear' as GPUFilterMode,
        MIN_FILTER: 'linear' as GPUFilterMode,
    },
    LABEL: 'Render Texture',
} as const;

// ===== CACHE KONSTANTEN =====
export const CACHE_CONFIG = {
    INVALID: 0,
    VALID: 1,
    COLOR_RANGE: {
        MIN: 0,
        MAX: 255,
    },
} as const;

// ===== SCENE KONFIGURATION =====
export const SCENE_CONFIG = {
    CAMERA: {
        FOV: 60,
        NEAR: 0.1,
        FAR: 100,
        POSITION: { x: 0, y: 0, z: 5 },
        LOOK_AT: { x: 0, y: 0, z: 0 },
    },
    GROUND: {
        Y_POSITION: -1.0,
        COLOR: { r: 0.8, g: 0.8, b: 0.8 },
        CHECKERBOARD: true,
        CHECKER_SIZE: 1.0,
    },
    LIGHTING: {
        POSITION: { x: 5.0, y: 5.0, z: 5.0 },
        AMBIENT: 0.2,
        DIFFUSE: 0.8,
        SHADOW_ENABLED: true,
        SHADOW_SOFTNESS: 0.0,
    },
    REFLECTIONS: {
        ENABLED: true,
        MAX_BOUNCES: 3,
        MIN_CONTRIBUTION: 0.01,
    },
} as const;

// ===== RAYTRACING KONFIGURATION =====
export const RAYTRACING_CONFIG = {
    FOV_RADIANS: 1.0472,
    NO_HIT_VALUE: -1.0,
    BACKGROUND_COLOR: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
    SPHERE_COLOR: { r: 0.0, g: 0.0, b: 1.0, a: 1.0 },
} as const;

// ===== PERFORMANCE & DEBUG =====
export const PERFORMANCE_CONFIG = {
    CACHE_STATS_INTERVAL: 10,
    CACHE_STATS_INITIAL_FRAMES: 4,
    FRAME_DELAY_MS: 500,
    GPU_WAIT_MS: 200,
} as const;

export const DEBUG_CONFIG = {
    PIXEL_SAMPLE_COUNT: 10,
    LOG_LEVEL: 'INFO' as 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR',
} as const;

// ===== BIND GROUP LAYOUTS =====
export const BINDING_CONFIG = {
    COMPUTE: {
        CAMERA: 0,
        SPHERE: 1,
        RENDER_INFO: 2,
        OUTPUT_TEXTURE: 3,
        CACHE_BUFFER: 4,
        ACCUMULATION_BUFFER: 5,
        SCENE_CONFIG: 6,
    },
    RENDER: {
        INPUT_TEXTURE: 0,
        SAMPLER: 1,
    },
} as const;

// ===== STATUS CSS CLASSES =====
export const STATUS_CLASSES = {
    INFO: 'info-text',
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
} as const;

// ===== UTILITY FUNCTIONS =====
export function calculateCacheBufferSize(width: number, height: number): number {
    const pixelCount = width * height;
    return pixelCount * BUFFER_CONFIG.CACHE.BYTES_PER_PIXEL;
}

export function calculateWorkgroups(width: number, height: number): { x: number; y: number } {
    return {
        x: Math.ceil(width / SHADER_CONFIG.WORKGROUP_SIZE.X),
        y: Math.ceil(height / SHADER_CONFIG.WORKGROUP_SIZE.Y),
    };
}

export function calculateAccumulationBufferSize(width: number, height: number): number {
    const pixelCount = width * height;
    return pixelCount * BUFFER_CONFIG.ACCUMULATION.BYTES_PER_PIXEL;
}