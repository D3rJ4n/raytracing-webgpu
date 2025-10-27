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

    // Node-Layout (8 floats)
    NODE_MIN_X: 0,
    NODE_MIN_Y: 1,
    NODE_MIN_Z: 2,
    NODE_MAX_X: 3,
    NODE_MAX_Y: 4,
    NODE_MAX_Z: 5,
    NODE_FIRST_SPHERE: 8,
    NODE_SPHERE_COUNT: 9,
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
        COMPONENTS_PER_PIXEL: 7,     // sphereIndex, hitDistance, hitPointX, hitPointY, hitPointZ, valid
        BYTES_PER_COMPONENT: 4,      // 4 bytes pro float32
        BYTES_PER_PIXEL: 28,         // 7 * 4 = 28 bytes pro Pixel
        LABEL: 'Geometry Cache Buffer',
    },
    ACCUMULATION: {
        COMPONENTS_PER_PIXEL: 4,
        BYTES_PER_COMPONENT: 4,
        BYTES_PER_PIXEL: 16,
        LABEL: 'Accumulation Buffer',
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

// Cache-Layout pro Pixel (6 float32 Werte):
export const GEOMETRY_CACHE = {
    SPHERE_INDEX: 0,    // Index 0: Welche Sphere (als float, 0.0 = invalid)
    HIT_DISTANCE: 1,    // Index 1: Entfernung zum Hit-Point
    HIT_POINT_X: 2,     // Index 2: Hit-Point X-Koordinate
    HIT_POINT_Y: 3,     // Index 3: Hit-Point Y-Koordinate  
    HIT_POINT_Z: 4,     // Index 4: Hit-Point Z-Koordinate
    SHADOW_FACTOR: 5,   // Index 5: Schatten-Faktor (0.0=Schatten, 1.0=Licht)
    VALID_FLAG: 6,      // Index 6: 1.0 = valid, 0.0 = invalid
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

export const SCENE_CONFIG = {

    GROUND: {
        Y_POSITION: -1.0,
        COLOR: { r: 0.8, g: 0.8, b: 0.8 },
        CHECKERBOARD: true,
        CHECKER_SIZE: 1.0,
    },
    REFLECTIONS: {
        ENABLED: true,
        MAX_BOUNCES: 3,
        MIN_CONTRIBUTION: 0.01,
    },
} as const;

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

export const BINDING_CONFIG = {
    COMPUTE: {
        CAMERA: 0,
        SPHERE: 1,
        RENDER_INFO: 2,
        OUTPUT_TEXTURE: 3,
        CACHE_BUFFER: 4,
        ACCUMULATION_BUFFER: 5,
        SCENE_CONFIG: 6,
        BVH_NODES: 7,
        BVH_SPHERE_INDICES: 8,
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

export function calculateAccumulationBufferSize(width: number, height: number): number {
    const pixelCount = width * height;
    return pixelCount * BUFFER_CONFIG.ACCUMULATION.BYTES_PER_PIXEL;
}

export function calculateLightHash(lightPos: { x: number; y: number; z: number }): number {
    // Einfacher Hash aus Lichtposition
    const x = Math.floor(lightPos.x * 1000);
    const y = Math.floor(lightPos.y * 1000);
    const z = Math.floor(lightPos.z * 1000);
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % 2147483647;
}

export function calculateBVHNodesBufferSize(sphereCount: number): number {
    // Pessimistische Schätzung: 2 * sphereCount Nodes für binären Baum
    const estimatedNodes = Math.max(100, sphereCount * 2);
    return estimatedNodes * BVH_CONFIG.BYTES_PER_NODE;
}

export function calculateBVHIndicesBufferSize(sphereCount: number): number {
    return sphereCount * BUFFER_CONFIG.BVH_SPHERE_INDICES.BYTES_PER_INDEX;
}

export function getBVHMemoryUsage(nodeCount: number, sphereCount: number): {
    nodesBytes: number;
    indicesBytes: number;
    totalBytes: number;
    totalKB: number;
} {
    const nodesBytes = nodeCount * BVH_CONFIG.BYTES_PER_NODE;
    const indicesBytes = sphereCount * BUFFER_CONFIG.BVH_SPHERE_INDICES.BYTES_PER_INDEX;
    const totalBytes = nodesBytes + indicesBytes;

    return {
        nodesBytes,
        indicesBytes,
        totalBytes,
        totalKB: totalBytes / 1024
    };
}