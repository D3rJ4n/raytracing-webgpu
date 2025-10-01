/**
 * 🔢 Constants - Zentrale Konfiguration
 * 
 * Alle Konstanten und Konfigurationswerte an einem Ort
 */
// ===== SUPERSAMPLING KONFIGURATION =====
export const SUPERSAMPLING_CONFIG = {
    ENABLED: true,
    SAMPLES_PER_PIXEL: 4, // 1, 4, 8, 16
    PROGRESSIVE_MODE: true, // Über mehrere Frames akkumulieren
    MAX_SAMPLES: 16, // Maximum für progressive Mode
} as const;

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
        SIZE: 48, // 12 floats × 4 bytes (für Random Seeds)
        LABEL: 'Camera Buffer',
    },
    SPHERE: {
        SIZE: 16, // 4 floats × 4 bytes
        LABEL: 'Sphere Buffer',
    },
    RENDER_INFO: {
        SIZE: 16, // 4 uints × 4 bytes
        LABEL: 'Render Info Buffer',
    },
    CACHE: {
        COMPONENTS_PER_PIXEL: 4, // [R, G, B, Valid]
        BYTES_PER_COMPONENT: 4, // uint32
        BYTES_PER_PIXEL: 16, // 4 × 4 bytes
        LABEL: 'Color Cache Buffer',
    },

    ACCUMULATION: {
        COMPONENTS_PER_PIXEL: 4, // [R, G, B, SampleCount]
        BYTES_PER_COMPONENT: 4, // float32
        BYTES_PER_PIXEL: 16, // 4 × 4 bytes
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

// ===== THREE.JS SZENEN-KONFIGURATION =====
export const SCENE_CONFIG = {
    CAMERA: {
        FOV: 60, // Field of View in Grad
        NEAR: 0.1,
        FAR: 100,
        POSITION: { x: 0, y: 0, z: 5 },
        LOOK_AT: { x: 0, y: 0, z: 0 },
    },
    SPHERE: {
        RADIUS: 1,
        SEGMENTS: 32,
        COLOR: 0x0000ff, // Blau
        POSITION: { x: 0, y: 0, z: 0 },
    },
    LIGHTING: {
        POSITION: { x: 5.0, y: 5.0, z: 5.0 },
        AMBIENT: 0.2,
        DIFFUSE: 0.8,
    },
} as const;

// ===== RAYTRACING KONFIGURATION =====
export const RAYTRACING_CONFIG = {
    FOV_RADIANS: 1.0472, // 60 Grad in Radians
    NO_HIT_VALUE: -1.0,
    BACKGROUND_COLOR: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, // Weiß
    SPHERE_COLOR: { r: 0.0, g: 0.0, b: 1.0, a: 1.0 }, // Blau
} as const;

// ===== PERFORMANCE & DEBUG =====
export const PERFORMANCE_CONFIG = {
    CACHE_STATS_INTERVAL: 10, // Alle 10 Frames Statistiken lesen
    CACHE_STATS_INITIAL_FRAMES: 4, // Erste 4 Frames immer prüfen
    FRAME_DELAY_MS: 500, // Verzögerung zwischen Test-Frames
    GPU_WAIT_MS: 200, // Warten auf GPU-Operationen
} as const;

export const DEBUG_CONFIG = {
    PIXEL_SAMPLE_COUNT: 10, // Anzahl Pixel für Debug-Samples
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