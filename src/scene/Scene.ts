import * as THREE from 'three';
import { Logger } from '../utils/Logger';

export interface RaytracerSphere {
    center: { x: number; y: number; z: number };
    radius: number;
    color: { r: number; g: number; b: number };
    metallic: number;
}

export interface RaytracerLight {
    position: { x: number; y: number; z: number };
    color: { r: number; g: number; b: number };
    intensity: number;
}

/**
 * 🌍 Scene - Three.js Szenen-Management mit Dynamic Content
 * 
 * Verwaltet:
 * - Three.js Szene, Kamera, Objekte
 * - Dynamisches Hinzufügen/Entfernen von Objekten
 * - Extraktion von Daten für Raytracer
 */
export class Scene {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private logger: Logger;

    // Three.js Objekte
    private meshes: THREE.Mesh[] = [];
    private lights: THREE.Light[] = [];

    // Ambient Light Stärke
    private ambientLightIntensity: number = 0.2;

    constructor() {
        this.logger = Logger.getInstance();
    }

    /**
     * 🚀 Szene initialisieren
     */
    public initialize(): void {
        this.logger.init('Erstelle Three.js Szene...');

        this.createScene();
        this.createCamera();
        this.setupDefaultScene();

        this.logSceneInfo();
        this.logger.success('Three.js Szene erstellt');
    }

    /**
     * 🌍 Leere Szene erstellen
     */
    private createScene(): void {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Himmelblau
        this.logger.init('Leere Three.js Szene erstellt');
    }

    /**
     * 📷 Perspektiv-Kamera erstellen
     */
    private createCamera(): void {
        this.camera = new THREE.PerspectiveCamera(
            60,   // FOV
            1.0,  // Aspect (wird später gesetzt)
            0.1,  // Near
            100   // Far
        );

        this.camera.position.set(0, 0, 7);
        this.camera.lookAt(0, 0, 0);

        this.logger.init('Kamera erstellt: FOV=60°, Position=(0, 0, 5)');
    }

    /**
     * 🎨 Standard-Szene aufbauen
     */
    private setupDefaultScene(): void {
        this.logger.init('Baue Standard-Szene auf...');

        // ═══════════════════════════════════════════════════════════
        // HAUPTKUGEL (Blau, Metallisch)
        // ═══════════════════════════════════════════════════════════
        const mainSphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.0, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0x3380ff,      // Blau
                metalness: 0.98,      // Sehr metallisch
                roughness: 0.02       // Glatt
            })
        );
        mainSphere.position.set(0, 1, 0);
        mainSphere.name = 'Main Sphere';
        this.scene.add(mainSphere);
        this.meshes.push(mainSphere);

        // ═══════════════════════════════════════════════════════════
        // KLEINE KUGELN (Verschiedene Farben)
        // ═══════════════════════════════════════════════════════════

        // Rote Kugel (links)
        const redSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xff0000,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        redSphere.position.set(-2.5, 0, -1);
        redSphere.name = 'Red Sphere';
        this.scene.add(redSphere);
        this.meshes.push(redSphere);

        // Orange Kugel (hinten oben)
        const orangeSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xff6600,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        orangeSphere.position.set(0, 4, 3);
        orangeSphere.name = 'Orange Sphere';
        this.scene.add(orangeSphere);
        this.meshes.push(orangeSphere);

        // Grüne Kugel (rechts)
        const greenSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0x00ff00,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        greenSphere.position.set(2.5, 0, -1);
        greenSphere.name = 'Green Sphere';
        this.scene.add(greenSphere);
        this.meshes.push(greenSphere);

        // Gelbe Kugel (vorne)
        const yellowSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xffff00,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        yellowSphere.position.set(0, -0.3, 2);
        yellowSphere.name = 'Yellow Sphere';
        this.scene.add(yellowSphere);
        this.meshes.push(yellowSphere);

        // Magenta Kugel
        const magentaSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xff00ff,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        magentaSphere.position.set(-1.5, 0.5, 1.5);
        magentaSphere.name = 'Magenta Sphere';
        this.scene.add(magentaSphere);
        this.meshes.push(magentaSphere);

        // Cyan Kugel
        const cyanSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                metalness: 0.5,
                roughness: 0.5
            })
        );
        cyanSphere.position.set(1.5, 0.5, 1.5);
        cyanSphere.name = 'Cyan Sphere';
        this.scene.add(cyanSphere);
        this.meshes.push(cyanSphere);

        // Weiße Kugel
        const whiteSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        whiteSphere.position.set(-1.0, 1.5, -2.0);
        whiteSphere.name = 'White Sphere';
        this.scene.add(whiteSphere);
        this.meshes.push(whiteSphere);

        // Olivgrüne Kugel
        const oliveSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.6, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0x808000,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        oliveSphere.position.set(1.0, 1.5, -2.0);
        oliveSphere.name = 'Olive Sphere';
        this.scene.add(oliveSphere);
        this.meshes.push(oliveSphere);

        // Rosa Kugel
        const pinkSphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 32, 32),
            new THREE.MeshStandardMaterial({
                color: 0xff8080,
                metalness: 0.0,
                roughness: 1.0
            })
        );
        pinkSphere.position.set(0, 0.3, -3.0);
        pinkSphere.name = 'Pink Sphere';
        this.scene.add(pinkSphere);
        this.meshes.push(pinkSphere);

        // ═══════════════════════════════════════════════════════════
        // LICHTQUELLEN
        // ═══════════════════════════════════════════════════════════

        const pointLight = new THREE.PointLight(0xffffff, 1.0);
        pointLight.position.set(5, 5, 5);
        pointLight.name = 'Main Light';
        this.scene.add(pointLight);
        this.lights.push(pointLight);

        // Ambient Light für Grundhelligkeit
        const ambientLight = new THREE.AmbientLight(0xffffff, this.ambientLightIntensity);
        ambientLight.name = 'Ambient Light';
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        this.logger.success(`Szene aufgebaut: ${this.meshes.length} Meshes, ${this.lights.length} Lights`);
    }

    /**
     * ✨ Kugel zur Szene hinzufügen
     */
    public addSphere(
        position: { x: number; y: number; z: number },
        radius: number,
        color: number,
        metalness: number = 0.0,
        roughness: number = 1.0,
        name?: string
    ): THREE.Mesh {
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 32),
            new THREE.MeshStandardMaterial({
                color,
                metalness,
                roughness
            })
        );

        sphere.position.set(position.x, position.y, position.z);
        sphere.name = name || `Sphere ${this.meshes.length}`;

        this.scene.add(sphere);
        this.meshes.push(sphere);

        this.logger.info(`Kugel hinzugefügt: ${sphere.name} (r=${radius})`);

        return sphere;
    }

    /**
     * 💡 Lichtquelle hinzufügen
     */
    public addLight(
        position: { x: number; y: number; z: number },
        color: number = 0xffffff,
        intensity: number = 1.0
    ): THREE.PointLight {
        const light = new THREE.PointLight(color, intensity);
        light.position.set(position.x, position.y, position.z);
        light.name = `Light ${this.lights.length}`;

        this.scene.add(light);
        this.lights.push(light);

        this.logger.info(`Licht hinzugefügt: (${position.x}, ${position.y}, ${position.z})`);

        return light;
    }

    /**
     * 🔄 Kugeln für Raytracer extrahieren
     */
    public getSpheresData(): Float32Array {
        this.logger.debug(`Extrahiere ${this.meshes.length} Kugeln für Raytracer...`);

        const maxSpheres = 20;
        const floatsPerSphere = 8; // center(3) + radius(1) + color(3) + metallic(1)
        const data = new Float32Array(maxSpheres * floatsPerSphere);

        this.meshes.forEach((mesh, index) => {
            if (index >= maxSpheres) {
                this.logger.warning(`Zu viele Kugeln! Maximum: ${maxSpheres}`);
                return;
            }

            const geometry = mesh.geometry as THREE.SphereGeometry;
            const material = mesh.material as THREE.MeshStandardMaterial;

            // Radius aus Geometrie (berücksichtige Scale)
            const radius = geometry.parameters.radius * Math.max(
                mesh.scale.x,
                mesh.scale.y,
                mesh.scale.z
            );

            // Farbe aus Material
            const color = material.color;

            // Metalness aus Material
            const metallic = material.metalness;

            // Position im Array
            const offset = index * floatsPerSphere;

            // Center (xyz) - Weltposition
            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);

            data[offset + 0] = worldPos.x;
            data[offset + 1] = worldPos.y;
            data[offset + 2] = worldPos.z;

            // Radius
            data[offset + 3] = radius;

            // Color (rgb)
            data[offset + 4] = color.r;
            data[offset + 5] = color.g;
            data[offset + 6] = color.b;

            // Metallic
            data[offset + 7] = metallic;
        });

        return data;
    }

    /**
     * 💡 Lichtquellen für Raytracer extrahieren
     */
    public getLightData(): RaytracerLight[] {
        return this.lights.map(light => {
            if (light instanceof THREE.PointLight) {
                const color = light.color;
                const worldPos = new THREE.Vector3();
                light.getWorldPosition(worldPos);

                return {
                    position: {
                        x: worldPos.x,
                        y: worldPos.y,
                        z: worldPos.z
                    },
                    color: {
                        r: color.r,
                        g: color.g,
                        b: color.b
                    },
                    intensity: light.intensity
                };
            }

            // Fallback für andere Licht-Typen
            return {
                position: { x: 5, y: 5, z: 5 },
                color: { r: 1, g: 1, b: 1 },
                intensity: 1.0
            };
        });
    }

    // ⭐ NEU: Primary Light für GPU-Buffer
    /**
     * 💡 Primäres Licht abrufen (erstes PointLight)
     */
    public getPrimaryLight(): THREE.PointLight | null {
        const pointLight = this.lights.find(l => l instanceof THREE.PointLight);
        return pointLight as THREE.PointLight || null;
    }

    /**
     * 💡 Primary Light Position für GPU
     */
    public getPrimaryLightPosition(): { x: number; y: number; z: number } {
        const light = this.getPrimaryLight();
        if (light) {
            const worldPos = new THREE.Vector3();
            light.getWorldPosition(worldPos);
            return { x: worldPos.x, y: worldPos.y, z: worldPos.z };
        }
        // Fallback
        return { x: 5, y: 5, z: 5 };
    }

    // ⭐ NEU: Ambient Light Kontrolle
    /**
     * 💡 Ambient Light Stärke setzen
     */
    public setAmbientIntensity(intensity: number): void {
        this.ambientLightIntensity = Math.max(0, Math.min(1, intensity));

        const ambientLight = this.lights.find(l => l instanceof THREE.AmbientLight);
        if (ambientLight) {
            (ambientLight as THREE.AmbientLight).intensity = this.ambientLightIntensity;
        }

        this.logger.info(`Ambient Light Intensity: ${this.ambientLightIntensity.toFixed(2)}`);
    }

    /**
     * 💡 Ambient Light Stärke abrufen
     */
    public getAmbientIntensity(): number {
        return this.ambientLightIntensity;
    }

    /**
     * 📊 Anzahl der Kugeln
     */
    public getSphereCount(): number {
        return this.meshes.length;
    }

    /**
     * 📦 Alle Meshes abrufen
     */
    public getAllMeshes(): THREE.Mesh[] {
        return [...this.meshes]; // Kopie zurückgeben
    }

    /**
     * 💡 Alle Lichter abrufen
     */
    public getAllLights(): THREE.Light[] {
        return [...this.lights]; // Kopie zurückgeben
    }

    /**
     * 🗑️ Objekt aus Szene entfernen
     */
    public removeSphere(mesh: THREE.Mesh): void {
        const index = this.meshes.indexOf(mesh);
        if (index > -1) {
            this.meshes.splice(index, 1);
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();

            this.logger.info(`Kugel entfernt: ${mesh.name}`);
        } else {
            this.logger.warning('Kugel nicht in Szene gefunden');
        }
    }

    /**
     * 🧹 Alle Kugeln entfernen
     */
    public clearSpheres(): void {
        this.meshes.forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });
        this.meshes = [];

        this.logger.info('Alle Kugeln entfernt');
    }

    /**
     * 🎨 Material einer Kugel ändern
     */
    public setSphereColor(mesh: THREE.Mesh, color: number): void {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.set(color);
        this.logger.info(`Farbe geändert: ${mesh.name} → #${color.toString(16)}`);
    }

    /**
     * 🪞 Metalness einer Kugel ändern
     */
    public setSphereMetalness(mesh: THREE.Mesh, metalness: number): void {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.metalness = Math.max(0, Math.min(1, metalness));
        this.logger.info(`Metalness geändert: ${mesh.name} → ${material.metalness}`);
    }

    /**
     * 📐 Kamera-Aspect-Ratio aktualisieren
     */
    public updateCameraAspect(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.logger.debug(`Kamera-Aspect aktualisiert: ${this.camera.aspect.toFixed(3)}`);
    }

    /**
     * 📊 Kamera-Daten für GPU-Buffer abrufen
     */
    public getCameraData(): Float32Array {
        const lookAtTarget = new THREE.Vector3(0, 0, 0);
        this.camera.getWorldDirection(lookAtTarget);
        lookAtTarget.add(this.camera.position);

        return new Float32Array([
            // Position (xyz) + Padding
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
            0,
            // LookAt (xyz) + Padding
            lookAtTarget.x,
            lookAtTarget.y,
            lookAtTarget.z,
            0
        ]);
    }

    /**
     * 📷 Kamera abrufen
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * 🌍 Three.js Szene abrufen
     */
    public getThreeScene(): THREE.Scene {
        return this.scene;
    }

    /**
     * 📝 Szenen-Informationen loggen
     */
    private logSceneInfo(): void {
        this.logger.info('=== SZENEN-INFORMATION ===');
        this.logger.info(`  Kamera Position: (${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z})`);
        this.logger.info(`  Kugeln: ${this.meshes.length}`);
        this.logger.info(`  Lichter: ${this.lights.length}`);
        this.logger.info('========================');
    }

    /**
     * 🎯 Kamera bewegen
     */
    public moveCamera(x: number, y: number, z: number): void {
        this.camera.position.set(x, y, z);
        this.logger.info(`Kamera bewegt zu: (${x}, ${y}, ${z})`);
    }

    /**
     * 🎯 Kamera drehen (lookAt)
     */
    public setCameraLookAt(x: number, y: number, z: number): void {
        this.camera.lookAt(x, y, z);
        this.logger.info(`Kamera schaut auf: (${x}, ${y}, ${z})`);
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        // Alle Meshes aufräumen
        this.meshes.forEach(mesh => {
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
        });

        // Szene leeren
        this.scene.clear();

        this.meshes = [];
        this.lights = [];

        this.logger.init('Szenen-Ressourcen aufgeräumt');
    }
}