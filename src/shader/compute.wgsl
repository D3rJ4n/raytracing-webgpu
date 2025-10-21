// ===== WGSL COMPUTE SHADER MIT SHADOW-CACHE UND SUPERSAMPLING =====

// ===== STRUKTUREN =====

struct Camera {
    position: vec3<f32>,
    _pad1: f32,
    lookAt: vec3<f32>,
    _pad2: f32,
    randomSeed1: f32,
    randomSeed2: f32,
    sampleCount: u32,
    _pad3: u32,
}

struct SphereData {
    center: vec3<f32>,
    radius: f32,
    color: vec3<f32>,
    metallic: f32,
}

struct RenderInfo {
    width: u32,
    height: u32,
    sphereCount: u32, 
    _pad: u32,
}

struct SceneConfig {
    groundY: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
    lightPos: vec3<f32>,
    shadowEnabled: f32,
    reflectionsEnabled: f32,
    maxBounces: f32,
    minContribution: f32,
    ambientStrength: f32,
}

struct HitRecord {
    hit: bool,
    t: f32,
    point: vec3<f32>,
    normal: vec3<f32>,
    material: u32,
    color: vec3<f32>,
    metallic: f32,
}

struct Ray {
    origin: vec3<f32>,
    direction: vec3<f32>,
}

struct CachedGeometry {
    valid: bool,
    sphereIndex: f32,
    hitDistance: f32,
    hitPoint: vec3<f32>,
    shadowFactor: f32,
}

// ===== BINDINGS =====

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> spheres: array<SphereData>; 
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read_write> geometryCache: array<f32>;
@group(0) @binding(5) var<storage, read_write> accumulationBuffer: array<f32>;
@group(0) @binding(6) var<uniform> sceneConfig: SceneConfig;

// ===== KONSTANTEN =====

const MAX_SPHERES: u32 = 1000u;
const PI: f32 = 3.14159265359;
const EPSILON: f32 = 0.001;

const GROUND_MATERIAL_ID: u32 = 999u;

// Cache-Layout (7 float32 pro Pixel)
const CACHE_SPHERE_INDEX: u32 = 0u;
const CACHE_HIT_DISTANCE: u32 = 1u;
const CACHE_HIT_POINT_X: u32 = 2u;
const CACHE_HIT_POINT_Y: u32 = 3u;
const CACHE_HIT_POINT_Z: u32 = 4u;
const CACHE_SHADOW_FACTOR: u32 = 5u;
const CACHE_VALID_FLAG: u32 = 6u;

const CACHE_INVALID: f32 = 0.0;
const CACHE_BACKGROUND: f32 = -1.0;
const CACHE_GROUND: f32 = -2.0;
const SHADOW_INVALID: f32 = -1.0;

// ===== CACHE-FUNKTIONEN =====

fn getCacheBaseIndex(coords: vec2<i32>) -> u32 {
    let pixelIndex = u32(coords.y) * renderInfo.width + u32(coords.x);
    let baseIndex = pixelIndex * 7u;
    let totalFloats = renderInfo.width * renderInfo.height * 7u;
    if (baseIndex + 6u >= totalFloats) {
        return 0u;
    }
    return baseIndex;
}

fn isCacheValid(coords: vec2<i32>) -> bool {
    let baseIndex = getCacheBaseIndex(coords);
    return geometryCache[baseIndex + CACHE_VALID_FLAG] == 1.0;
}

fn setCachedGeometry(coords: vec2<i32>, sphereIndex: f32, hitDistance: f32, hitPoint: vec3<f32>, shadowFactor: f32) {
    let baseIndex = getCacheBaseIndex(coords);
    geometryCache[baseIndex + CACHE_SPHERE_INDEX] = sphereIndex;
    geometryCache[baseIndex + CACHE_HIT_DISTANCE] = hitDistance;
    geometryCache[baseIndex + CACHE_HIT_POINT_X] = hitPoint.x;
    geometryCache[baseIndex + CACHE_HIT_POINT_Y] = hitPoint.y;
    geometryCache[baseIndex + CACHE_HIT_POINT_Z] = hitPoint.z;
    geometryCache[baseIndex + CACHE_SHADOW_FACTOR] = shadowFactor;
    geometryCache[baseIndex + CACHE_VALID_FLAG] = 1.0;
}

fn getCachedGeometry(coords: vec2<i32>) -> CachedGeometry {
    let baseIndex = getCacheBaseIndex(coords);
    var cached: CachedGeometry;
    cached.valid = geometryCache[baseIndex + CACHE_VALID_FLAG] == 1.0;
    cached.sphereIndex = geometryCache[baseIndex + CACHE_SPHERE_INDEX];
    cached.hitDistance = geometryCache[baseIndex + CACHE_HIT_DISTANCE];
    cached.hitPoint = vec3<f32>(
        geometryCache[baseIndex + CACHE_HIT_POINT_X],
        geometryCache[baseIndex + CACHE_HIT_POINT_Y],
        geometryCache[baseIndex + CACHE_HIT_POINT_Z]
    );
    cached.shadowFactor = geometryCache[baseIndex + CACHE_SHADOW_FACTOR];
    return cached;
}

fn isShadowCacheValid(cached: CachedGeometry) -> bool {
    return cached.valid && cached.shadowFactor != SHADOW_INVALID;
}

// ===== RANDOM NUMBER GENERATOR =====

fn pcgHash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn randomFloat(seed: ptr<function, u32>) -> f32 {
    *seed = pcgHash(*seed);
    return f32(*seed) / 4294967296.0;
}

fn randomFloat2(seed: ptr<function, u32>) -> vec2<f32> {
    return vec2<f32>(randomFloat(seed), randomFloat(seed));
}

// ===== CAMERA RAY =====

fn getCameraRay(uv: vec2<f32>) -> vec3<f32> {
    let aspectRatio = f32(renderInfo.width) / f32(renderInfo.height);
    let fov = 1.0472;
    
    let forward = normalize(camera.lookAt - camera.position);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward));
    let up = cross(forward, right);
    
    let halfHeight = tan(fov * 0.5);
    let halfWidth = halfHeight * aspectRatio;
    
    let x = (uv.x * 2.0 - 1.0) * halfWidth;
    let y = -(uv.y * 2.0 - 1.0) * halfHeight;
    
    return normalize(forward + x * right + y * up);
}

// ===== RAY-SPHERE INTERSECTION =====

fn intersectSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, sphereIndex: u32) -> f32 {
    let sphere = spheres[sphereIndex];
    let oc = rayOrigin - sphere.center;
    let a = dot(rayDirection, rayDirection);
    let b = 2.0 * dot(oc, rayDirection);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    
    let discriminant = b * b - 4.0 * a * c;
    if (discriminant < 0.0) {
        return -1.0;
    }
    
    let sqrtDiscriminant = sqrt(discriminant);
    let t1 = (-b - sqrtDiscriminant) / (2.0 * a);
    let t2 = (-b + sqrtDiscriminant) / (2.0 * a);
    
    if (t1 > EPSILON) {
        return t1;
    } else if (t2 > EPSILON) {
        return t2;
    }
    return -1.0;
}

// ===== RAY-PLANE INTERSECTION =====

fn intersectPlane(rayOrigin: vec3<f32>, rayDirection: vec3<f32>, planeY: f32) -> f32 {
    if (abs(rayDirection.y) < 0.0001) {
        return -1.0;
    }
    let t = (planeY - rayOrigin.y) / rayDirection.y;
    if (t > EPSILON) {
        return t;
    }
    return -1.0;
}

// ===== CLOSEST HIT =====

fn findClosestHit(ray: Ray) -> HitRecord {
    var closest: HitRecord;
    closest.hit = false;
    closest.t = 999999.0;
    
    let actualSphereCount = min(renderInfo.sphereCount, MAX_SPHERES);
    
    for (var i = 0u; i < actualSphereCount; i++) {
        let t = intersectSphere(ray.origin, ray.direction, i);
        if (t > 0.0 && t < closest.t) {
            closest.hit = true;
            closest.t = t;
            closest.point = ray.origin + ray.direction * t;
            closest.normal = normalize(closest.point - spheres[i].center);
            closest.material = i;
            closest.color = spheres[i].color;
            closest.metallic = spheres[i].metallic;
        }
    }
    
    let tPlane = intersectPlane(ray.origin, ray.direction, sceneConfig.groundY);
    if (tPlane > 0.0 && tPlane < closest.t) {
        closest.hit = true;
        closest.t = tPlane;
        closest.point = ray.origin + ray.direction * tPlane;
        closest.normal = vec3<f32>(0.0, 1.0, 0.0);
        closest.material = GROUND_MATERIAL_ID;
        closest.color = vec3<f32>(0.6, 0.6, 0.6);
        closest.metallic = 0.0;
    }
    
    return closest;
}

// ===== SHADOW =====

fn calculateShadowFactor(hitPoint: vec3<f32>) -> f32 {
    if (sceneConfig.shadowEnabled < 0.5) {
        return 1.0;
    }
    
    let lightDir = normalize(sceneConfig.lightPos - hitPoint);
    let lightDist = length(sceneConfig.lightPos - hitPoint);
    let shadowRayOrigin = hitPoint + lightDir * EPSILON;
    
    let actualSphereCount = min(renderInfo.sphereCount, MAX_SPHERES);
    
    for (var i = 0u; i < actualSphereCount; i++) {
        let t = intersectSphere(shadowRayOrigin, lightDir, i);
        if (t > 0.0 && t < lightDist) {
            return 0.3;
        }
    }
    return 1.0;
}

// ===== LIGHTING =====

fn calculateLightingWithShadow(hitPoint: vec3<f32>, normal: vec3<f32>, color: vec3<f32>, shadowFactor: f32) -> vec3<f32> {
    let lightDir = normalize(sceneConfig.lightPos - hitPoint);
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = sceneConfig.ambientStrength;
    
    let lighting = ambient + diffuse * shadowFactor * 0.8;
    return color * lighting;
}

// ===== BACKGROUND =====

fn getBackgroundColor(direction: vec3<f32>) -> vec3<f32> {
    let t = 0.5 * (direction.y + 1.0);
    return mix(vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.5, 0.7, 1.0), t);
}

// ===== GAMMA CORRECTION =====

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    return pow(linear, vec3<f32>(1.0 / 2.2));
}

// ===== MAIN COMPUTE SHADER =====

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pixelCoords = vec2<i32>(globalId.xy);
    let dimensions = vec2<i32>(i32(renderInfo.width), i32(renderInfo.height));
    
    if (pixelCoords.x >= dimensions.x || pixelCoords.y >= dimensions.y) {
        return;
    }

    // ===== SUPERSAMPLING KONFIGURATION =====
    const SAMPLES_PER_PIXEL: u32 = 16u;  // ← Hier einstellen: 1, 4, 16, 64
    
    var finalColor: vec3<f32>;
    
    if (isCacheValid(pixelCoords)) {
        // ===== CACHE-HIT: Keine Samples nötig =====
        let cached = getCachedGeometry(pixelCoords);
        
        if (cached.sphereIndex == CACHE_BACKGROUND) {
            let uv = vec2<f32>(
                f32(pixelCoords.x) / f32(dimensions.x),
                f32(pixelCoords.y) / f32(dimensions.y)
            );
            finalColor = getBackgroundColor(getCameraRay(uv));
            
        } else if (cached.sphereIndex == CACHE_GROUND) {
            let normal = vec3<f32>(0.0, 1.0, 0.0);
            let groundColor = vec3<f32>(0.6, 0.6, 0.6);
            
            var shadowFactor: f32;
            if (isShadowCacheValid(cached)) {
                shadowFactor = cached.shadowFactor;
            } else {
                shadowFactor = calculateShadowFactor(cached.hitPoint);
                let baseIndex = getCacheBaseIndex(pixelCoords);
                geometryCache[baseIndex + CACHE_SHADOW_FACTOR] = shadowFactor;
            }
            
            finalColor = calculateLightingWithShadow(cached.hitPoint, normal, groundColor, shadowFactor);
            
        } else {
            let sphereIndex = u32(cached.sphereIndex);
            let sphere = spheres[sphereIndex];
            let normal = normalize(cached.hitPoint - sphere.center);
            
            var shadowFactor: f32;
            if (isShadowCacheValid(cached)) {
                shadowFactor = cached.shadowFactor;
            } else {
                shadowFactor = calculateShadowFactor(cached.hitPoint);
                let baseIndex = getCacheBaseIndex(pixelCoords);
                geometryCache[baseIndex + CACHE_SHADOW_FACTOR] = shadowFactor;
            }
            
            finalColor = calculateLightingWithShadow(cached.hitPoint, normal, sphere.color, shadowFactor);
        }
        
    } else {
        // ===== CACHE-MISS: SUPERSAMPLING =====
        var accumulatedColor = vec3<f32>(0.0);
        
        var seed = u32(pixelCoords.x) + u32(pixelCoords.y) * renderInfo.width;
        seed += u32(camera.randomSeed1 * 1000000.0);
        seed = pcgHash(seed);
        
        // Mehrere Samples pro Pixel
        for (var sample = 0u; sample < SAMPLES_PER_PIXEL; sample++) {
            let baseUV = vec2<f32>(
                f32(pixelCoords.x) / f32(dimensions.x),
                f32(pixelCoords.y) / f32(dimensions.y)
            );
            
            let jitter = randomFloat2(&seed);
            let pixelSize = vec2<f32>(1.0 / f32(dimensions.x), 1.0 / f32(dimensions.y));
            let uv = baseUV + (jitter - 0.5) * pixelSize;
            
            var ray: Ray;
            ray.origin = camera.position;
            ray.direction = getCameraRay(uv);
            
            let hit = findClosestHit(ray);
            
            var sampleColor: vec3<f32>;
            
            if (hit.hit) {
                let shadowFactor = calculateShadowFactor(hit.point);
                sampleColor = calculateLightingWithShadow(hit.point, hit.normal, hit.color, shadowFactor);
            } else {
                sampleColor = getBackgroundColor(ray.direction);
            }
            
            accumulatedColor += sampleColor;
        }
        
        // Durchschnitt aller Samples
        finalColor = accumulatedColor / f32(SAMPLES_PER_PIXEL);
        
        // Cache für ersten Sample speichern
        let centerUV = vec2<f32>(
            f32(pixelCoords.x) / f32(dimensions.x),
            f32(pixelCoords.y) / f32(dimensions.y)
        );
        
        var centerRay: Ray;
        centerRay.origin = camera.position;
        centerRay.direction = getCameraRay(centerUV);
        
        let centerHit = findClosestHit(centerRay);
        
        if (centerHit.hit) {
            let shadowFactor = calculateShadowFactor(centerHit.point);
            if (centerHit.material == GROUND_MATERIAL_ID) {
                setCachedGeometry(pixelCoords, CACHE_GROUND, centerHit.t, centerHit.point, shadowFactor);
            } else {
                setCachedGeometry(pixelCoords, f32(centerHit.material), centerHit.t, centerHit.point, shadowFactor);
            }
        } else {
            setCachedGeometry(pixelCoords, CACHE_BACKGROUND, 0.0, vec3<f32>(0.0), 1.0);
        }
    }
    
    let gammaCorrected = linearToSrgb(finalColor);
    textureStore(outputTexture, pixelCoords, vec4<f32>(gammaCorrected, 1.0));
}