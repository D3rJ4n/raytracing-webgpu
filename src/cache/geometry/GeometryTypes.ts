// src/cache/geometry/GeometryTypes.ts

export interface GeometryHitRecord {
    hit: boolean;
    sphereIndex: number;
    hitDistance: number;
    hitPoint: { x: number; y: number; z: number };
}

export interface GeometryCacheEntry {
    sphereIndex: number;    // -1 = background, -2 = ground, >=0 = sphere index
    hitDistance: number;
    hitPoint: { x: number; y: number; z: number };
    valid: boolean;
}

export interface GeometryInvalidationResult {
    pixelsInvalidated: number;
    regionsInvalidated: number;
    invalidationTime: number;
    reason: string;
}

export interface GeometryInvalidationStats {
    totalInvalidations: number;
    totalPixelsInvalidated: number;
    averagePixelsPerInvalidation: number;
    lastInvalidationTime: number;
}

export const GEOMETRY_CACHE_CONSTANTS = {
    // Cache-Layout (6 float32 pro Pixel)
    SPHERE_INDEX: 0,
    HIT_DISTANCE: 1,
    HIT_POINT_X: 2,
    HIT_POINT_Y: 3,
    HIT_POINT_Z: 4,
    VALID_FLAG: 5,

    // Spezielle Werte für SPHERE_INDEX
    INVALID_VALUE: 0.0,
    BACKGROUND_VALUE: -1.0,
    GROUND_VALUE: -2.0,

    // Buffer-Eigenschaften
    FLOATS_PER_PIXEL: 6,
    BYTES_PER_PIXEL: 24, // 6 * 4 bytes
} as const;