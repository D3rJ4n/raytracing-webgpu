import * as THREE from 'three';
import { Logger } from '../utils/Logger';
import { SCENE_CONFIG } from '../utils/Constants';

/**
 * 🌍 Scene - Three.js Szenen-Management
 * 
 * Verwaltet:
 * - Three.js Szene, Kamera, Objekte
 * - 3D-Mathematik für GPU-Buffer
 * - Szenen-Parameter für Raytracing
 */
export class Scene {
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private sphere!: THREE.Mesh;
    private logger: Logger;

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
        this.createObjects();

        this.logSceneInfo();
        this.logger.success('Three.js Szene erstellt');
    }

    /**
     * 🌍 Leere Szene erstellen
     */
    private createScene(): void {
        this.scene = new THREE.Scene();
        this.logger.init('Leere Three.js Szene erstellt');
    }

    /**
     * 📷 Perspektiv-Kamera erstellen
     */
    private createCamera(): void {
        const { FOV, NEAR, FAR, POSITION, LOOK_AT } = SCENE_CONFIG.CAMERA;

        // Aspect Ratio wird später von Canvas übernommen
        this.camera = new THREE.PerspectiveCamera(FOV, 1.0, NEAR, FAR);

        // Kamera positionieren
        this.camera.position.set(POSITION.x, POSITION.y, POSITION.z);
        this.camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);

        this.logger.init(`Kamera erstellt: FOV=${FOV}°, Position=(${POSITION.x}, ${POSITION.y}, ${POSITION.z})`);
    }

    /**
     * 🎱 3D-Objekte erstellen
     */
    private createObjects(): void {
        this.createSphere();
        // Hier können weitere Objekte hinzugefügt werden
    }

    /**
     * ⭕ Kugel erstellen
     */
    private createSphere(): void {
        const { RADIUS, SEGMENTS, COLOR, POSITION } = SCENE_CONFIG.SPHERE;

        // Geometrie erstellen
        const geometry = new THREE.SphereGeometry(RADIUS, SEGMENTS, SEGMENTS);

        // Material erstellen (für Three.js - wird nicht für Raytracing verwendet)
        const material = new THREE.MeshBasicMaterial({ color: COLOR });

        // Mesh erstellen
        this.sphere = new THREE.Mesh(geometry, material);
        this.sphere.position.set(POSITION.x, POSITION.y, POSITION.z);

        // Zur Szene hinzufügen
        this.scene.add(this.sphere);

        this.logger.init(`Kugel erstellt: Radius=${RADIUS}, Position=(${POSITION.x}, ${POSITION.y}, ${POSITION.z})`);
    }

    /**
     * 📐 Kamera-Aspect-Ratio aktualisieren
     */
    public updateCameraAspect(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.logger.init(`Kamera-Aspect aktualisiert: ${width}x${height} = ${this.camera.aspect.toFixed(3)}`);
    }

    /**
     * 📊 Kamera-Daten für GPU-Buffer abrufen
     */
    public getCameraData(): Float32Array {
        const lookAtTarget = new THREE.Vector3(
            SCENE_CONFIG.CAMERA.LOOK_AT.x,
            SCENE_CONFIG.CAMERA.LOOK_AT.y,
            SCENE_CONFIG.CAMERA.LOOK_AT.z
        );

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
     * 🎱 Kugel-Daten für GPU-Buffer abrufen
     */
    public getSphereData(): Float32Array {
        const sphereGeometry = this.sphere.geometry as THREE.SphereGeometry;
        const radius = sphereGeometry.parameters.radius;

        return new Float32Array([
            // Center (xyz) + Radius
            this.sphere.position.x,
            this.sphere.position.y,
            this.sphere.position.z,
            radius
        ]);
    }

    /**
     * 📏 Render-Info-Daten für GPU-Buffer abrufen
     */
    public getRenderInfoData(width: number, height: number): Uint32Array {
        return new Uint32Array([
            width,   // Breite
            height,  // Höhe
            0,       // Padding
            0        // Padding
        ]);
    }

    /**
     * 📷 Kamera abrufen
     */
    public getCamera(): THREE.PerspectiveCamera {
        return this.camera;
    }

    /**
     * 🎱 Kugel abrufen
     */
    public getSphere(): THREE.Mesh {
        return this.sphere;
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
        this.logger.info(`  Kamera LookAt: (${SCENE_CONFIG.CAMERA.LOOK_AT.x}, ${SCENE_CONFIG.CAMERA.LOOK_AT.y}, ${SCENE_CONFIG.CAMERA.LOOK_AT.z})`);
        this.logger.info(`  Kugel Position: (${this.sphere.position.x}, ${this.sphere.position.y}, ${this.sphere.position.z})`);

        const sphereGeometry = this.sphere.geometry as THREE.SphereGeometry;
        this.logger.info(`  Kugel Radius: ${sphereGeometry.parameters.radius}`);
        this.logger.info('========================');
    }

    /**
     * 🎯 Kamera bewegen (für zukünftige Features)
     */
    public moveCamera(x: number, y: number, z: number): void {
        this.camera.position.set(x, y, z);
        this.logger.info(`Kamera bewegt zu: (${x}, ${y}, ${z})`);
    }

    /**
     * 🎱 Kugel bewegen (für zukünftige Features)
     */
    public moveSphere(x: number, y: number, z: number): void {
        this.sphere.position.set(x, y, z);
        this.logger.info(`Kugel bewegt zu: (${x}, ${y}, ${z})`);
    }

    /**
     * 🧹 Ressourcen aufräumen
     */
    public cleanup(): void {
        // Three.js Geometrie und Material aufräumen
        if (this.sphere) {
            this.sphere.geometry.dispose();
            (this.sphere.material as THREE.Material).dispose();
        }

        // Szene leeren
        this.scene.clear();

        this.logger.init('Szenen-Ressourcen aufgeräumt');
    }
}