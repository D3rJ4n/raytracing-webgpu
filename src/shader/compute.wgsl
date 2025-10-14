// ===== WGSL COMPUTE SHADER MIT REFLEXIONEN UND CACHE =====

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
    _pad1: u32,
    _pad2: u32,
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

// ===== BINDINGS =====

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<storage, read> spheres: array<SphereData>; 
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read_write> pixelCache: array<u32>;
@group(0) @binding(5) var<storage, read_write> accumulationBuffer: array<f32>;
@group(0) @binding(6) var<uniform> sceneConfig: SceneConfig;

// ===== KONSTANTEN =====

const MAX_SPHERES: u32 = 11u;
const SPHERE_COUNT: u32 = 11u;
const PI: f32 = 3.14159265359;
const EPSILON: f32 = 0.001;

// ===== RANDOM NUMBER GENERATOR =====

fn pcgHash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;// Multiplikation mit großer Primzahl
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;// Bit-Shifts und XOR für Chaos
    return (word >> 22u) ^ word; // Finales Mischen
}

fn randomFloat(seed: ptr<function, u32>) -> f32 {
    *seed = pcgHash(*seed);
    return f32(*seed) / 4294967296.0;
}

fn randomFloat2(seed: ptr<function, u32>) -> vec2<f32> {
    return vec2<f32>(randomFloat(seed), randomFloat(seed));
}

// ===== ACCUMULATION BUFFER =====

fn getAccumulationIndex(coords: vec2<i32>) -> u32 {
    return (u32(coords.y) * renderInfo.width + u32(coords.x)) * 4u;
}

fn accumulateColor(coords: vec2<i32>, newColor: vec3<f32>) {
    let baseIndex = getAccumulationIndex(coords);
    let oldR = accumulationBuffer[baseIndex + 0u];
    let oldG = accumulationBuffer[baseIndex + 1u];
    let oldB = accumulationBuffer[baseIndex + 2u];
    let oldCount = accumulationBuffer[baseIndex + 3u];
    
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

// ===== CACHE FUNKTIONEN =====

fn getCacheIndex(coords: vec2<i32>) -> u32 {
    // Typumwandlung von i32 zu u32 und in eindimensionales Array umrechnen
    return (u32(coords.y) * renderInfo.width + u32(coords.x)) * 4u;
}

fn isCacheValid(coords: vec2<i32>) -> bool {
    // Prüft ob für diesen Pixel bereits eine gültige Farbe im Cache liegt
    //
    // Ablauf:
    // 1. Hole Array-Index für diesen Pixel
    // 2. Springe zum Valid-Flag (baseIndex + 3)
    // 3. Wenn Flag == 1u → Pixel ist gecacht 
    //    Wenn Flag == 0u → Pixel muss neu berechnet werden 
    let baseIndex = getCacheIndex(coords);
    return pixelCache[baseIndex + 3u] == 1u;
}

fn setCachedColor(coords: vec2<i32>, color: vec4<f32>) {
     // Speichert eine berechnete Farbe im Cache für zukünftige Frames
    //
    // Ablauf:
    // 1. Berechne Basis-Index für diesen Pixel
    // 2. Konvertiere Float-Farben (0.0-1.0) zu Uint8 (0-255)
    //    → Spart Speicher: 4 Bytes statt 16 Bytes pro Pixel!
    // 3. Schreibe R, G, B in die ersten 3 Slots
    // 4. Setze Valid-Flag auf 1 → "Dieser Pixel ist jetzt gecacht"
    let baseIndex = getCacheIndex(coords);
    pixelCache[baseIndex + 0u] = u32(clamp(color.r * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 1u] = u32(clamp(color.g * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 2u] = u32(clamp(color.b * 255.0, 0.0, 255.0));
    pixelCache[baseIndex + 3u] = 1u;
}

fn getCachedColor(coords: vec2<i32>) -> vec4<f32> {
    // Liest eine gespeicherte Farbe aus dem Cache
    //
    // Ablauf:
    // 1. Hole Array-Index für diesen Pixel
    // 2. Lese R, G, B aus den ersten 3 Slots
    // 3. Konvertiere Uint8 (0-255) zurück zu Float (0.0-1.0)
    //    → Division durch 255.0
    // 4. Gib Farbe als vec4 zurück (Alpha immer 1.0)
    let baseIndex = getCacheIndex(coords);
    let r = f32(pixelCache[baseIndex + 0u]) / 255.0;
    let g = f32(pixelCache[baseIndex + 1u]) / 255.0;
    let b = f32(pixelCache[baseIndex + 2u]) / 255.0;
    return vec4<f32>(r, g, b, 1.0);
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
    
    for (var i = 0u; i < SPHERE_COUNT; i++) {
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
        closest.material = 100u;
        closest.color = vec3<f32>(0.6, 0.6, 0.6);
        closest.metallic = 0.0;
    }
    
    return closest;
}

// ===== SHADOW CHECK =====

fn isInShadow(point: vec3<f32>, lightPos: vec3<f32>) -> bool {
    let lightDir = normalize(lightPos - point);
    let lightDist = length(lightPos - point);
    let shadowRayOrigin = point + lightDir * EPSILON;
    
    for (var i = 0u; i < SPHERE_COUNT; i++) {
        let t = intersectSphere(shadowRayOrigin, lightDir, i);
        if (t > 0.0 && t < lightDist) {
            return true;
        }
    }
    
    return false;
}

// ===== LIGHTING =====

fn calculateLighting(hitRecord: HitRecord) -> vec3<f32> {
    let lightDir = normalize(sceneConfig.lightPos - hitRecord.point);
    let diffuse = max(dot(hitRecord.normal, lightDir), 0.0);
    let ambient = sceneConfig.ambientStrength;  
    
    var shadowFactor = 1.0;
    if (sceneConfig.shadowEnabled > 0.5 && diffuse > 0.0) {
        if (isInShadow(hitRecord.point, sceneConfig.lightPos)) {
            shadowFactor = 0.3;
        }
    }
    
    let lighting = ambient + diffuse * 0.8 * shadowFactor;
    return hitRecord.color * lighting;
}

// ===== REFLEXION =====

fn reflect(incident: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    // berechnet den neuen Reflektierten Strahl
    return incident - 2.0 * dot(incident, normal) * normal;
}

// ===== FRESNEL =====
//Der Fresnel-Effekt beschreibt:
//"Wie stark reflektiert eine Oberfläche, abhängig vom Betrachtungswinkel?"
fn fresnelSchlick(cosTheta: f32, metallic: f32) -> f32 {
    let F0 = mix(0.04, 1.0, metallic);
    // F0 = Basis-Reflexion bei senkrechtem Blick
    // Nicht-Metall (metallic=0): F0 = 0.04 (4% Reflexion)
    // Metall (metallic=1):       F0 = 1.0 (100% Reflexion)
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

// ===== HINTERGRUND =====

fn getBackgroundColor(direction: vec3<f32>) -> vec3<f32> {
    let t = 0.5 * (direction.y + 1.0);
    return mix(vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.5, 0.7, 1.0), t);
}

// ===== RAYTRACING MIT REFLEXIONEN =====
//ray = Startstrahl von der Kamera
//finalColor = Gesammelte Farbe (startet bei Schwarz)
//throughput = "Wie viel Licht kommt noch durch?" (startet bei 100%)

fn traceRay(initialRay: Ray) -> vec3<f32> {
    var ray = initialRay;
    var finalColor = vec3<f32>(0.0);
    var throughput = vec3<f32>(1.0);
    
    let maxBounces = i32(sceneConfig.maxBounces);
    let reflectionsEnabled = sceneConfig.reflectionsEnabled > 0.5;
    
    for (var bounce = 0; bounce < maxBounces; bounce++) {
        let hit = findClosestHit(ray);
        
        // Kein Treffer → Hintergrundfarbe zurckgeben
        if (!hit.hit) {
            finalColor += throughput * getBackgroundColor(ray.direction);
            break;
        }
        // 1. Blickrichtung berechnen
        let viewDir = normalize(ray.origin - hit.point);
        // 2. Winkel zwischen Blick und Oberfläche
        let cosTheta = max(dot(viewDir, hit.normal), 0.0);
        // 3. Reflektionsstärke berechnen
        let fresnel = fresnelSchlick(cosTheta, hit.metallic);
        //4. Diffuse Lichtanteil berechnen
        let diffuseAmount = (1.0 - hit.metallic) * (1.0 - fresnel);
        
        // Gibt es noch umgebungsbeleuchtung?
        if (diffuseAmount > 0.01) {
            // Licht berechnen
            let lighting = calculateLighting(hit);
            // Endfarbe berechnen
            finalColor += throughput * lighting * diffuseAmount;
        }
        
        if (!reflectionsEnabled || hit.metallic < 0.01) {
            break;
        }
        
        let reflectionStrength = fresnel * hit.metallic;
        // Wenn zuwenig Licht übrig ist, abbrechen
        if (reflectionStrength < sceneConfig.minContribution) {
            break;
        }
        //Reflexionsrichtung
        let reflectedDir = reflect(-viewDir, hit.normal);
        // Neuen Startpunkt setzen
        ray.origin = hit.point + hit.normal * EPSILON;
        // Richtung normalisieren
        ray.direction = normalize(reflectedDir);

        // Bei echt Metallischen Oberflächen, wird die Farbe der Oberfläche mit der Reflexion gemischt
        if (hit.metallic > 0.9) {
            let tint = mix(hit.color, vec3<f32>(1.0), 0.8);
            throughput *= tint * reflectionStrength;
        } else { // Nicht metallische Oberflächen reflektieren stärker
            let colorTint = mix(vec3<f32>(1.0), hit.color, 1.0 - hit.metallic);
            throughput *= colorTint * reflectionStrength;
        }
        // Gibt den höchsten Farbwert und checkt ob es sich noch lohnt ihn auszugeben
        if (max(max(throughput.r, throughput.g), throughput.b) < sceneConfig.minContribution) {
            break;
        }
    }
    
    return finalColor;
}

// ===== GAMMA CORRECTION =====

fn linearToSrgb(linear: vec3<f32>) -> vec3<f32> {
    return pow(linear, vec3<f32>(1.0 / 2.2));
}

// ===== MAIN COMPUTE SHADER =====

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    let pixelCoords = vec2<i32>(globalId.xy);
    //Canvas größen holen
    let dimensions = vec2<i32>(i32(renderInfo.width), i32(renderInfo.height));
    // Pixel überprüfen
    if (pixelCoords.x >= dimensions.x || pixelCoords.y >= dimensions.y) {
        return;
    }
    
    let useCache = camera.sampleCount == 0u;
    
    if (useCache && isCacheValid(pixelCoords)) {
        // Farbe auslesen
        let cachedColor = getCachedColor(pixelCoords);
        // auf bildschirm schreiben
        textureStore(outputTexture, pixelCoords, cachedColor);
        // Gammakorrektur rückgängig machen, wegen Licht unterschied zu Bild und realität
        let linearColor = pow(cachedColor.rgb, vec3<f32>(2.2));
        // Speichern im Accumulation Buffer
        accumulateColor(pixelCoords, linearColor);
        
        return;
    }

    // ==============================================
    // random seed basierend auf pixel position und kamera seed
    var seed = u32(pixelCoords.x) + u32(pixelCoords.y) * renderInfo.width;
    seed += u32(camera.randomSeed1 * 1000000.0);
    seed = pcgHash(seed);
    // ==============================================


    //UV Koordinaten umwandeln
    let baseUV = vec2<f32>(
        f32(pixelCoords.x) / f32(dimensions.x),
        f32(pixelCoords.y) / f32(dimensions.y)
    );
    
    //erzeugt 2 zufallszahlen
    let jitter = randomFloat2(&seed);
    //Pixel größe berechnen in UV
    let pixelSize = vec2<f32>(1.0 / f32(dimensions.x), 1.0 / f32(dimensions.y));

    let uv = baseUV + (jitter - 0.5) * pixelSize;
    
    var ray: Ray;
    ray.origin = camera.position;
    ray.direction = getCameraRay(uv);
    
    let sampleColor = traceRay(ray);
    
    accumulateColor(pixelCoords, sampleColor);
    let averageColor = getAverageColor(pixelCoords);
    let finalColor = linearToSrgb(averageColor);
    
    if (useCache) {
        setCachedColor(pixelCoords, vec4<f32>(finalColor, 1.0));
    }
    
    textureStore(outputTexture, pixelCoords, vec4<f32>(finalColor, 1.0));
}