// ===== WGSL COMPUTE SHADER =====
// Dieser Shader läuft auf der GPU und berechnet für jeden Pixel die Farbe durch Raytracing

// Struktur für Kamera-Daten (Position und Blickrichtung)
struct Camera {
    position: vec3<f32>,    // Wo die Kamera steht (x, y, z)
    _pad1: f32,            // Padding für GPU-Alignment (wichtig für Performance)
    lookAt: vec3<f32>,     // Wo die Kamera hinschaut (x, y, z)
    _pad2: f32,            // Padding für GPU-Alignment
}

// Struktur für eine Kugel (unser 3D-Objekt)
struct Sphere {
    center: vec3<f32>,     // Mittelpunkt der Kugel (x, y, z)
    radius: f32,           // Radius der Kugel
}

// Struktur für Bildschirm-Informationen
struct RenderInfo {
    width: u32,            // Bildschirm-Breite in Pixeln
    height: u32,           // Bildschirm-Höhe in Pixeln
    _pad1: u32,            // Padding
    _pad2: u32,            // Padding
}

// GPU-Resourcen die der Shader bekommt (Binding Points)
@group(0) @binding(0) var<uniform> camera: Camera;              // Kamera-Daten
@group(0) @binding(1) var<uniform> sphere: Sphere;             // Kugel-Daten
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;     // Bildschirm-Info
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>; // Output-Bild

// FUNKTION: Berechnet die Richtung eines Strahls von der Kamera durch einen Pixel
fn getCameraRay(uv: vec2<f32>) -> vec3<f32> {
    // Bildschirm-Verhältnis berechnen (Breite/Höhe)
    let aspectRatio = f32(renderInfo.width) / f32(renderInfo.height);
    let fov = 1.0472; // Sichtfeld in Radians (60 Grad)
    
    // Kamera-Koordinatensystem berechnen
    let forward = normalize(camera.lookAt - camera.position);  // Blickrichtung
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), forward)); // Rechts-Vektor
    let up = cross(forward, right);                            // Oben-Vektor
    
    // Virtueller Bildschirm vor der Kamera berechnen
    let halfHeight = tan(fov * 0.5);           // Halbe Höhe des virtuellen Bildschirms
    let halfWidth = halfHeight * aspectRatio;   // Halbe Breite des virtuellen Bildschirms
    
    // UV-Koordinaten (0-1) zu Weltkoordinaten konvertieren
    let x = (uv.x * 2.0 - 1.0) * halfWidth;   // -halfWidth bis +halfWidth
    let y = -(uv.y * 2.0 - 1.0) * halfHeight; // -halfHeight bis +halfHeight (Y invertiert)
    
    // Strahl-Richtung berechnen und normalisieren
    return normalize(forward + x * right + y * up);
}

// FUNKTION: Testet ob ein Strahl eine Kugel trifft und gibt die Entfernung zurück
fn intersectSphere(rayOrigin: vec3<f32>, rayDirection: vec3<f32>) -> f32 {
    // Quadratische Gleichung für Strahl-Kugel-Intersection
    let oc = rayOrigin - sphere.center;        // Vektor von Kugel-Mitte zum Strahl-Start
    let a = dot(rayDirection, rayDirection);   // Immer 1.0 bei normalisierten Vektoren
    let b = 2.0 * dot(oc, rayDirection);      // Lineare Komponente
    let c = dot(oc, oc) - sphere.radius * sphere.radius; // Konstante Komponente
    
    // Diskriminante berechnen (bestimmt ob es Schnittpunkte gibt)
    let discriminant = b * b - 4.0 * a * c;
    
    // Keine Intersection wenn Diskriminante negativ
    if (discriminant < 0.0) {
        return -1.0;  // Konvention: -1 bedeutet "kein Treffer"
    }
    
    // Zwei mögliche Schnittpunkte berechnen
    let sqrtDiscriminant = sqrt(discriminant);
    let t1 = (-b - sqrtDiscriminant) / (2.0 * a);  // Näherer Schnittpunkt
    let t2 = (-b + sqrtDiscriminant) / (2.0 * a);  // Fernerer Schnittpunkt
    
    // Den nähesten positiven Schnittpunkt zurückgeben
    if (t1 > 0.0) {
        return t1;
    } else if (t2 > 0.0) {
        return t2;
    }
    
    return -1.0;  // Kugel ist hinter der Kamera
}

// FUNKTION: Berechnet die Beleuchtung an einem Punkt auf der Kugel
fn calculateLighting(hitPoint: vec3<f32>, normal: vec3<f32>) -> vec3<f32> {
    // Lichtquelle positionieren
    let lightPos = vec3<f32>(5.0, 5.0, 5.0);
    let lightDir = normalize(lightPos - hitPoint);  // Richtung zum Licht
    
    // Diffuse Beleuchtung berechnen (Lambert'sches Gesetz)
    let diffuse = max(dot(normal, lightDir), 0.0);  // Cos-Winkel zwischen Normal und Licht
    let ambient = 0.2;                              // Grundhelligkeit
    let lighting = ambient + diffuse * 0.8;          // Kombination aus ambient + diffuse
    
    // Blaue Farbe mit Beleuchtung multiplizieren
    return vec3<f32>(0.0, 0.0, 1.0) * lighting;
}

// HAUPTFUNKTION: Wird für jeden Pixel parallel ausgeführt
@compute @workgroup_size(8, 8, 1)  // 8x8 Pixel werden gleichzeitig bearbeitet
fn main(@builtin(global_invocation_id) globalId: vec3<u32>) {
    // Aktuelle Pixel-Koordinaten ermitteln
    let pixelCoords = vec2<i32>(globalId.xy);
    let dimensions = vec2<i32>(i32(renderInfo.width), i32(renderInfo.height));
    
    // Überprüfen ob Pixel innerhalb des Bildschirms liegt
    if (pixelCoords.x >= dimensions.x || pixelCoords.y >= dimensions.y) {
        return;  // Pixel außerhalb - nichts tun
    }
    
    // Pixel-Koordinaten zu UV-Koordinaten (0.0 bis 1.0) konvertieren
    let uv = vec2<f32>(
        f32(pixelCoords.x) / f32(dimensions.x),  // X: 0.0 bis 1.0
        f32(pixelCoords.y) / f32(dimensions.y)   // Y: 0.0 bis 1.0
    );
    
    // RAYTRACING-ALGORITHMUS:
    // 1. Strahl von Kamera durch Pixel berechnen
    let rayDirection = getCameraRay(uv);
    
    // 2. Testen ob Strahl die Kugel trifft
    let t = intersectSphere(camera.position, rayDirection);
    
    // 3. Farbe des Pixels bestimmen
    var color: vec4<f32>;
    if (t > 0.0) {
        // TREFFER: Kugel wurde getroffen
        let hitPoint = camera.position + rayDirection * t;  // Trefferpunkt berechnen
        let normal = normalize(hitPoint - sphere.center);   // Normale an der Oberfläche
        let rgb = calculateLighting(hitPoint, normal);      // Beleuchtung berechnen
        color = vec4<f32>(rgb, 1.0);                       // RGB + Alpha = 1.0
    } else {
        // KEIN TREFFER: Hintergrund anzeigen
        color = vec4<f32>(1.0, 1.0, 1.0, 1.0);  // Weißer Hintergrund
    }
    
    // 4. Berechnete Farbe in Output-Texture schreiben
    textureStore(outputTexture, pixelCoords, color);
}