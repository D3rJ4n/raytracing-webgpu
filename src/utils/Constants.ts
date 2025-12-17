export const CANVAS_CONFIG = {
    ID: 'canvas',
    DEFAULT_WIDTH: 800,
    DEFAULT_HEIGHT: 600,
} as const;

export const STATUS_CONFIG = {
    ELEMENT_ID: 'status',
} as const;

export const WEBGPU_CONFIG = {
    POWER_PREFERENCE: 'high-performance' as GPUPowerPreference,
    ALPHA_MODE: 'opaque' as GPUCanvasAlphaMode,
} as const;

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

// BVH-KONFIGURATION
export const BVH_CONFIG = {
    MAX_LEAF_SIZE: 6,           // Max Spheres pro Leaf-Node
    MAX_DEPTH: 20,              // Max BVH-Hierarchie-Tiefe
    MAX_STACK_SIZE: 32,         // Max Stack-Größe für GPU-Traversierung
    FLOATS_PER_NODE: 10,         // 10 Bounds + 2 Child-Indizes
    BYTES_PER_NODE: 40,         // 8 * 4 bytes
    ENABLED: true,              // BVH aktiviert/deaktiviert
} as const;


// OPTIMALER GEOMETRY-CACHE: 6 float32 pro Pixel
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
        MAX_COUNT: 5000,
        BYTES_PER_SPHERE: 32,  // 8 floats * 4 bytes (position xyz, radius, color rgb, metallic)
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
        SAMPLES_PER_CACHE: 4,        // 4 Samples pro Pixel für Multi-Sample Cache
        COMPONENTS_PER_SAMPLE: 9,    // sphereIndex, hitDistance, hitPointX, hitPointY, hitPointZ, normalX, normalY, normalZ, valid
        COMPONENTS_PER_PIXEL: 36,    // 4 samples × 9 components = 36 floats pro Pixel
        BYTES_PER_COMPONENT: 4,      // 4 bytes pro float32
        BYTES_PER_PIXEL: 144,        // 36 * 4 = 144 bytes pro Pixel
        LABEL: 'Geometry Cache Buffer (4-Sample)',
    },
    // BVH-BUFFERS
    BVH_NODES: {
        get BYTES_PER_NODE() {
            return BVH_CONFIG.BYTES_PER_NODE;
        },
        get MAX_NODES() {
            // Worst-case: vollständiger binärer Baum für 1000 Spheres
            return Math.max(2000, Math.ceil(BUFFER_CONFIG.SPHERES.MAX_COUNT * 2));
        },
        get SIZE() {
            return this.MAX_NODES * this.BYTES_PER_NODE;
        },
        LABEL: 'BVH Nodes Buffer',
    },
    BVH_SPHERE_INDICES: {
        BYTES_PER_INDEX: 4,          // uint32
        get MAX_INDICES() {
            return BUFFER_CONFIG.SPHERES.MAX_COUNT;
        },
        get SIZE() {
            return this.MAX_INDICES * this.BYTES_PER_INDEX;
        },
        LABEL: 'BVH Sphere Indices Buffer',
    },
} as const;

// Cache-Layout: Multi-Sample Cache (4 samples × 9 floats = 36 floats pro Pixel)
// Jedes Sample hat 9 float32 Werte:
export const GEOMETRY_CACHE = {
    SPHERE_INDEX: 0,    // Index 0: Welche Sphere (als float, 0.0 = invalid)
    HIT_DISTANCE: 1,    // Index 1: Entfernung zum Hit-Point
    HIT_POINT_X: 2,     // Index 2: Hit-Point X-Koordinate
    HIT_POINT_Y: 3,     // Index 3: Hit-Point Y-Koordinate
    HIT_POINT_Z: 4,     // Index 4: Hit-Point Z-Koordinate
    NORMAL_X: 5,        // Index 5: Normal X-Koordinate
    NORMAL_Y: 6,        // Index 6: Normal Y-Koordinate
    NORMAL_Z: 7,        // Index 7: Normal Z-Koordinate
    VALID_FLAG: 8,      // Index 8: 1.0 = valid, 0.0 = invalid
    // Spezielle Werte für SPHERE_INDEX
    INVALID_VALUE: 0.0,      // Kein Hit
    BACKGROUND_VALUE: -1.0,  // Background Hit
    GROUND_VALUE: -2.0,      // Ground Hit
} as const;

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

export const BINDING_CONFIG = {
    COMPUTE: {
        CAMERA: 0,
        SPHERE: 1,
        RENDER_INFO: 2,
        OUTPUT_TEXTURE: 3,
        CACHE_BUFFER: 4,
        SCENE_CONFIG: 5,
        BVH_NODES: 6,
        BVH_SPHERE_INDICES: 7,
    },
    RENDER: {
        INPUT_TEXTURE: 0,
        SAMPLER: 1,
    },
} as const;

export const STATUS_CLASSES = {
    INFO: 'info-text',
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
} as const;

// Hilfsfunktionen
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