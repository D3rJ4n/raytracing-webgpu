// ===== ECHTER WGSL COMPUTE SHADER MIT UNSICHTBAREM CACHE =====

struct Camera {
    position: vec3<f32>,
    _pad1: f32,
    lookAt: vec3<f32>,
    _pad2: f32,
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

// ===== ECHTER FARB-CACHE (4 uint pro Pixel) =====
// Layout: [R, G, B, Valid] - jeder Wert 0-255 als uint

fn getCacheIndex(coords: vec2<i32>) -> u32 {
    return (u32(coords.y) * renderInfo.width + u32(coords.x)) * 4u;
}

fn isCacheValid(coords: vec2<i32>) -> bool {
    let baseIndex = getCacheIndex(coords);
    return pixelCache[baseIndex + 3u] == 1u; // Valid-Flag an Position 3
}

fn setCachedColor(coords: vec2<i32>, color: vec4<f32>) {
    let baseIndex = getCacheIndex(coords);
    // Farbe als uint speichern (0-255 range)
    pixelCache[baseIndex + 0u] = u32(clamp(color.r * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 1u] = u32(clamp(color.g * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 2u] = u32(clamp(color.b * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 3u] = 1u; // Valid-Flag setzen
}

fn getCachedColor(coords: vec2<i32>) -> vec4<f32> {
    let baseIndex = getCacheIndex(coords);
    let r = f32(pixelCache[baseIndex + 0u]) / 255.0;
    let g = f32(pixelCache[baseIndex + 1u]) / 255.0;
    let b = f32(pixelCache[baseIndex + 2u]) / 255.0;
    return vec4<f32>(r, g, b, 1.0);
}

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

fn performRaytracing(uv: vec2<f32>) -> vec4<f32> {
    let rayDirection = getCameraRay(uv);
    let t = intersectSphere(camera.position, rayDirection);
    
    if (t > 0.0) {
        let hitPoint = camera.position + rayDirection * t;
        let normal = normalize(hitPoint - sphere.center);
        let rgb = calculateLighting(hitPoint, normal);
        return vec4<f32>(rgb, 1.0);
    } else {
        return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pixelCoords = vec2<i32>(globalId.xy);
    let dimensions = vec2<i32>(i32(renderInfo.width), i32(renderInfo.height));
    
    if (pixelCoords.x >= dimensions.x || pixelCoords.y >= dimensions.y) {
        return;
    }
    
    let uv = vec2<f32>(
        f32(pixelCoords.x) / f32(dimensions.x),
        f32(pixelCoords.y) / f32(dimensions.y)
    );
    
    // ===== CACHE =====
    if (isCacheValid(pixelCoords)) {
        // CACHE HIT: Gespeicherte Farbe aus Cache laden
        let cachedColor = getCachedColor(pixelCoords);
        textureStore(outputTexture, pixelCoords, cachedColor);
    } else {
        // CACHE MISS: Raytracing durchführen und Ergebnis cachen
        let color = performRaytracing(uv);
        setCachedColor(pixelCoords, color); // Im Cache speichern
        textureStore(outputTexture, pixelCoords, color);
    }
}