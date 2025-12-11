import * as THREE from 'three';
import { Scene } from '../scene/Scene';
import { Logger } from '../utils/Logger';

/**
 * CameraController - Ermöglicht Kamera-Steuerung mit Tastatur und Maus
 */
export class CameraController {
    private logger: Logger;
    private scene: Scene;
    private camera: THREE.PerspectiveCamera;
    private onCameraChanged: (() => void) | null = null;

    // Bewegungsgeschwindigkeiten
    private moveSpeed: number = 0.5; // Einheiten pro Tastendruck
    private rotateSpeed: number = 0.05; // Radians pro Tastendruck
    private lookAtTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

    // Keyboard State
    private keysPressed: Set<string> = new Set();
    private isActive: boolean = false;

    constructor(scene: Scene, onCameraChanged?: () => void) {
        this.logger = Logger.getInstance();
        this.scene = scene;
        this.camera = scene.getCamera();
        this.onCameraChanged = onCameraChanged || null;

        // Initialen LookAt-Target berechnen
        this.updateLookAtTarget();

        this.setupEventListeners();
        this.logger.success('CameraController initialisiert');
    }

    private setupEventListeners(): void {
        window.addEventListener('keydown', (event) => this.onKeyDown(event));
        window.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    private onKeyDown(event: KeyboardEvent): void {
        // Verhindere Standard-Scroll-Verhalten für Pfeiltasten
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
            event.preventDefault();
        }

        const wasPressed = this.keysPressed.has(event.code);
        this.keysPressed.add(event.code);

        // Nur beim ersten Tastendruck (nicht bei Wiederholungen)
        if (!wasPressed) {
            this.handleCameraMovement(event.code);
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        this.keysPressed.delete(event.code);
    }

    private handleCameraMovement(keyCode: string): void {
        const camera = this.camera;
        const forward = new THREE.Vector3();
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        // Berechne Vorwärts- und Rechts-Richtung basierend auf Kamera-Orientierung
        camera.getWorldDirection(forward);
        forward.normalize();
        right.crossVectors(forward, up).normalize();

        let moved = false;

        switch (keyCode) {
            // Pfeiltasten: Rotation um den LookAt-Punkt
            case 'ArrowLeft':
                this.rotateAroundTarget(-this.rotateSpeed, 0);
                moved = true;
                break;
            case 'ArrowRight':
                this.rotateAroundTarget(this.rotateSpeed, 0);
                moved = true;
                break;
            case 'ArrowUp':
                this.rotateAroundTarget(0, this.rotateSpeed);
                moved = true;
                break;
            case 'ArrowDown':
                this.rotateAroundTarget(0, -this.rotateSpeed);
                moved = true;
                break;

            // WASD: Freie Bewegung
            case 'KeyW': // Vorwärts
                camera.position.addScaledVector(forward, this.moveSpeed);
                this.lookAtTarget.addScaledVector(forward, this.moveSpeed);
                moved = true;
                break;
            case 'KeyS': // Rückwärts
                camera.position.addScaledVector(forward, -this.moveSpeed);
                this.lookAtTarget.addScaledVector(forward, -this.moveSpeed);
                moved = true;
                break;
            case 'KeyA': // Links
                camera.position.addScaledVector(right, -this.moveSpeed);
                this.lookAtTarget.addScaledVector(right, -this.moveSpeed);
                moved = true;
                break;
            case 'KeyD': // Rechts
                camera.position.addScaledVector(right, this.moveSpeed);
                this.lookAtTarget.addScaledVector(right, this.moveSpeed);
                moved = true;
                break;

            // QE: Hoch/Runter
            case 'KeyQ': // Runter
                camera.position.y -= this.moveSpeed;
                this.lookAtTarget.y -= this.moveSpeed;
                moved = true;
                break;
            case 'KeyE': // Hoch
                camera.position.y += this.moveSpeed;
                this.lookAtTarget.y += this.moveSpeed;
                moved = true;
                break;
        }

        if (moved) {
            camera.lookAt(this.lookAtTarget);
            camera.updateProjectionMatrix();

            this.logger.info(
                `Kamera: Pos(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}) ` +
                `LookAt(${this.lookAtTarget.x.toFixed(2)}, ${this.lookAtTarget.y.toFixed(2)}, ${this.lookAtTarget.z.toFixed(2)})`
            );

            // Callback triggern → komplette Cache-Invalidierung
            if (this.onCameraChanged) {
                this.onCameraChanged();
            }
        }
    }

    /**
     * Rotiert die Kamera um den LookAt-Punkt (Orbit-Style)
     */
    private rotateAroundTarget(horizontalAngle: number, verticalAngle: number): void {
        const camera = this.camera;
        const offset = new THREE.Vector3().subVectors(camera.position, this.lookAtTarget);

        // Horizontale Rotation (um Y-Achse)
        if (horizontalAngle !== 0) {
            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), horizontalAngle);
            offset.applyQuaternion(quaternion);
        }

        // Vertikale Rotation (um Rechts-Achse)
        if (verticalAngle !== 0) {
            const right = new THREE.Vector3();
            camera.getWorldDirection(right);
            right.cross(new THREE.Vector3(0, 1, 0)).normalize();

            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(right, verticalAngle);
            offset.applyQuaternion(quaternion);
        }

        camera.position.copy(this.lookAtTarget).add(offset);
        camera.lookAt(this.lookAtTarget);
        camera.updateProjectionMatrix();
    }

    /**
     * Aktualisiert den LookAt-Punkt basierend auf aktueller Kamera-Richtung
     */
    private updateLookAtTarget(): void {
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        this.lookAtTarget.copy(this.camera.position).add(direction.multiplyScalar(10));
    }

    /**
     * Setze Bewegungsgeschwindigkeit
     */
    public setMoveSpeed(speed: number): void {
        this.moveSpeed = speed;
    }

    /**
     * Setze Rotationsgeschwindigkeit
     */
    public setRotateSpeed(speed: number): void {
        this.rotateSpeed = speed;
    }

    /**
     * Aktiviere/Deaktiviere Controller
     */
    public setActive(active: boolean): void {
        this.isActive = active;
    }

    public cleanup(): void {
        window.removeEventListener('keydown', (event) => this.onKeyDown(event));
        window.removeEventListener('keyup', (event) => this.onKeyUp(event));
        this.keysPressed.clear();
    }
}
