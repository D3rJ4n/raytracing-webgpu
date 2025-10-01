// ===== WGSL COMPUTE SHADER MIT SUPERSAMPLING =====

struct Camera {
    position: vec3<f32>,
    _pad1: f32,
    lookAt: vec3<f32>,
    _pad2: f32,
    randomSeed1: f32,  // NEU: für Jittering
    randomSeed2: f32,  // NEU: für Jittering
    sampleCount: u32,  // NEU: aktueller Sample
    _pad3: u32,
}

struct Sphere {
    center: vec3<f32>,
    radius: f32,
}

struct RenderInfo {
    width: u32,
    height: u32,
    _pad1: u32,
    _pad2: u32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> sphere: Sphere;
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read_write> pixelCache: array<u32>;
@group(0) @binding(5) var<storage, read_write> accumulationBuffer: array<f32>;

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

// ===== ACCUMULATION BUFFER FUNKTIONEN =====
fn getAccumulationIndex(coords: vec2<i32>) -> u32 {
    return (u32(coords.y) * renderInfo.width + u32(coords.x)) * 4u;
}

fn accumulateColor(coords: vec2<i32>, newColor: vec3<f32>) {
    let baseIndex = getAccumulationIndex(coords);
    
    // Alte akkumulierte Farbe lesen
    let oldR = accumulationBuffer[baseIndex + 0u];
    let oldG = accumulationBuffer[baseIndex + 1u];
    let oldB = accumulationBuffer[baseIndex + 2u];
    let oldCount = accumulationBuffer[baseIndex + 3u];
    
    // Neue Farbe akkumulieren
    let newCount = oldCount + 1.0;
    accumulationBuffer[baseIndex + 0u] = oldR + newColor.r;
    accumulationBuffer[baseIndex + 1u] = oldG + newColor.g;
    accumulationBuffer[baseIndex + 2u] = oldB + newColor.b;
    accumulationBuffer[baseIndex + 3u] = newCount;
}

fn getAverageColor(coords: vec2<i32>) -> vec3<f32> {
    let baseIndex = getAccumulationIndex(coords);
    
    let totalR = accumulationBuffer[baseIndex + 0u];
    let totalG = accumulationBuffer[baseIndex + 1u];
    let totalB = accumulationBuffer[baseIndex + 2u];
    let count = accumulationBuffer[baseIndex + 3u];
    
    if (count > 0.0) {
        return vec3<f32>(totalR / count, totalG / count, totalB / count);
    }
    return vec3<f32>(0.0);
}

fn resetAccumulation(coords: vec2<i32>) {
    let baseIndex = getAccumulationIndex(coords);
    accumulationBuffer[baseIndex + 0u] = 0.0;
    accumulationBuffer[baseIndex + 1u] = 0.0;
    accumulationBuffer[baseIndex + 2u] = 0.0;
    accumulationBuffer[baseIndex + 3u] = 0.0;
}

// ===== CACHE FUNKTIONEN (unverändert) =====
fn getCacheIndex(coords: vec2<i32>) -> u32 {
    return (u32(coords.y) * renderInfo.width + u32(coords.x)) * 4u;
}

fn isCacheValid(coords: vec2<i32>) -> bool {
    let baseIndex = getCacheIndex(coords);
    return pixelCache[baseIndex + 3u] == 1u;
}

fn setCachedColor(coords: vec2<i32>, color: vec4<f32>) {
    let baseIndex = getCacheIndex(coords);
    pixelCache[baseIndex + 0u] = u32(clamp(color.r * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 1u] = u32(clamp(color.g * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 2u] = u32(clamp(color.b * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 3u] = 1u;
}

fn getCachedColor(coords: vec2<i32>) -> vec4<f32> {
    let baseIndex = getCacheIndex(coords);
    let r = f32(pixelCache[baseIndex + 0u]) / 255.0;
    let g = f32(pixelCache[baseIndex + 1u]) / 255.0;
    let b = f32(pixelCache[baseIndex + 2u]) / 255.0;
    return vec4<f32>(r, g, b, 1.0);
}

// ===== RAYTRACING FUNKTIONEN =====
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

fn intersectSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
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
    
    if (t1 > 0.0) {
        return t1;
    } else if (t2 > 0.0) {
        return t2;
    }
    
    return -1.0;
}

fn calculateLighting(hitPoint: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    let lightPos = vec3<f32>(5.0, 5.0, 5.0);
    let lightDir = normalize(lightPos - hitPoint);
    
    let diffuse = max(dot(normal, lightDir), 0.0);
    let ambient = 0.2;
    let lighting = ambient + diffuse * 0.8;
    
    return vec3<f32>(0.0, 0.0, 1.0) * lighting;
}

fn performRaytracing(uv: vec2<f32>) -> vec3<f32> {
    let rayDirection = getCameraRay(uv);
    let t = intersectSphere(camera.position, rayDirection);
    
    if (t > 0.0) {
        let hitPoint = camera.position + rayDirection * t;
        let normal = normalize(hitPoint - sphere.center);
        return calculateLighting(hitPoint, normal);
    } else {
        return vec3<f32>(1.0, 1.0, 1.0);
    }
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
    
    // Random Seed für diesen Pixel
    var seed = u32(pixelCoords.x) + u32(pixelCoords.y) * renderInfo.width;
    seed += u32(camera.randomSeed1 * 1000000.0);
    seed = pcgHash(seed);
    
    // Base UV-Koordinaten
    let baseUV = vec2<f32>(
        f32(pixelCoords.x) / f32(dimensions.x),
        f32(pixelCoords.y) / f32(dimensions.y)
    );
    
    // Jitter für Anti-Aliasing (innerhalb des Pixels)
    let jitter = randomFloat2(&seed);
    let pixelSize = vec2<f32>(1.0 / f32(dimensions.x), 1.0 / f32(dimensions.y));
    let uv = baseUV + (jitter - 0.5) * pixelSize;
    
    // Raytracing für diesen Sample durchführen
    let sampleColor = performRaytracing(uv);
    
    // In Accumulation Buffer akkumulieren
    accumulateColor(pixelCoords, sampleColor);
    
    // Durchschnitt berechnen
    let averageColor = getAverageColor(pixelCoords);
    
    // Gamma-Korrektur anwenden
    let finalColor = linearToSrgb(averageColor);
    
    // Zum Output schreiben
    textureStore(outputTexture, pixelCoords, vec4<f32>(finalColor, 1.0));
    
    // Optional: Cache aktualisieren (für statische Szenen)
    if (camera.sampleCount > 8u) {
        setCachedColor(pixelCoords, vec4<f32>(finalColor, 1.0));
    }
}