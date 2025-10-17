// ===== WGSL RENDER SHADER =====
// Dieser Shader zeigt das Raytracing-Ergebnis auf dem Bildschirm an

// Struktur für Vertex-Shader Output (wird an Fragment-Shader weitergegeben)
struct VertexOutput {
    @builtin(position) position: vec4<f32>,  // Bildschirm-Position des Pixels
    @location(0) uv: vec2<f32>,              // Textur-Koordinaten (0-1)
}

// VERTEX SHADER: Erstellt ein Vollbild-Dreieck ohne Vertex-Buffer
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Trick: Aus Vertex-Index ein großes Dreieck generieren das den ganzen Bildschirm abdeckt
    let x = f32((vertexIndex << 1u) & 2u);  // 0, 0, 2 für die 3 Vertices
    let y = f32(vertexIndex & 2u);          // 0, 2, 0 für die 3 Vertices
    
    // NDC-Koordinaten (-1 bis +1) für das Dreieck
    output.position = vec4<f32>(x * 2.0 - 1.0, -y * 2.0 + 1.0, 0.0, 1.0);
    // UV-Koordinaten (0 bis 1) für Textur-Sampling
    output.uv = vec2<f32>(x, y);
        return output;
}

// GPU-Resourcen für den Render-Shader
@group(0) @binding(0) var inputTexture: texture_2d<f32>;  // Das Raytracing-Ergebnis
@group(0) @binding(1) var textureSampler: sampler;        // Wie die Textur gelesen wird

// FRAGMENT SHADER: Bestimmt die Farbe jedes Pixels auf dem Bildschirm
@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Einfach die Raytracing-Textur an der aktuellen UV-Position sampeln
    return textureSample(inputTexture, textureSampler, input.uv);
}