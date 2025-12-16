import * as THREE from 'three';
import { Scene } from '../scene/Scene';
import { Logger } from '../utils/Logger';

/**
 * SphereEditor - Ermöglicht das Bearbeiten von Kugeln per Klick
 */
export class SphereEditor {
    private logger: Logger;
    private scene: Scene;
    private canvas: HTMLCanvasElement;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private selectedSphere: THREE.Mesh | null = null;
    private selectedSphereIndex: number = -1;
    private uiContainer: HTMLDivElement | null = null;
    private onChangesApplied: ((sphereIndex: number) => void) | null = null;

    // Bound event handlers for proper removal
    private boundClick: (e: MouseEvent) => void;
    private boundMouseDown: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundWheel: (e: WheelEvent) => void;

    // Bound UI event handlers
    private boundApplyChangesOnEnter: (e: KeyboardEvent) => void;
    private boundUpdateSphereColor: () => void;
    private boundApplyInputChanges: () => void;
    private boundDeselectSphere: () => void;

    // RAF-based drag throttling
    private dragPending: boolean = false;
    private dragRafId: number | null = null;

    // Drag-and-Drop State
    private isDragging: boolean = false;
    private dragPlane: THREE.Plane = new THREE.Plane();
    private dragOffset: THREE.Vector3 = new THREE.Vector3();
    private dragIntersectionPoint: THREE.Vector3 = new THREE.Vector3();

    // Double-click detection
    private lastClickTime: number = 0;
    private lastClickedSphereIndex: number = -1;
    private readonly DOUBLE_CLICK_THRESHOLD_MS: number = 300;

    constructor(scene: Scene, canvas: HTMLCanvasElement, onChangesApplied?: (sphereIndex: number) => void) {
        this.logger = Logger.getInstance();
        this.scene = scene;
        this.canvas = canvas;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.onChangesApplied = onChangesApplied || null;

        // bind handlers so they can be removed later
        this.boundClick = (event) => this.onCanvasClick(event);
        this.boundMouseDown = (event) => this.onMouseDown(event);
        this.boundMouseMove = (event) => this.onMouseMove(event);
        this.boundMouseUp = (event) => this.onMouseUp(event);
        this.boundWheel = (event) => this.onWheel(event);

        // bind UI handlers
        this.boundApplyChangesOnEnter = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                this.applyInputChanges();
            }
        };
        this.boundUpdateSphereColor = () => this.updateSphereColor();
        this.boundApplyInputChanges = () => this.applyInputChanges();
        this.boundDeselectSphere = () => this.deselectSphere();

        this.setupEventListeners();
        this.createUI();
        this.logger.success('SphereEditor initialisiert');
    }

    private setupEventListeners(): void {
        // Mousedown für Auswahl + Drag-Start, Move/Up für Drag, Wheel für Radius
        // KEIN click event — das verursacht Konflikte mit mousedown
        this.canvas.addEventListener('mousedown', this.boundMouseDown);
        this.canvas.addEventListener('mousemove', this.boundMouseMove);
        this.canvas.addEventListener('mouseup', this.boundMouseUp);
        this.canvas.addEventListener('wheel', this.boundWheel, { passive: false });
    }

    private updateMousePosition(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    private onCanvasClick(event: MouseEvent): void {
        if (event.button !== 0) return; // Nur linke Maustaste

        this.updateMousePosition(event);

        const camera = this.scene.getCamera();
        this.raycaster.setFromCamera(this.mouse, camera);

        const meshes = this.scene.getThreeScene().children.filter(
            child => child instanceof THREE.Mesh && (
                child.name.startsWith('TestSphere') ||
                child.name.startsWith('MassiveSphere') ||
                child.name.startsWith('DynamicSphere')
            )
        ) as THREE.Mesh[];

        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const clickedSphere = intersects[0].object as THREE.Mesh;

            // Extrahiere Sphere-Index aus dem Namen
            const match = clickedSphere.name.match(/(TestSphere|MassiveSphere|DynamicSphere)_(\d+)/);
            const sphereIndex = match ? parseInt(match[2]) : -1;

            // Nur wenn Regex passt, die Kugel wirklich auswählen
            if (sphereIndex >= 0) {
                this.selectSphere(clickedSphere, sphereIndex);
                this.logger.info(`Kugel ausgewählt: ${clickedSphere.name} (Index: ${sphereIndex})`);
            } else {
                // Klick auf Background oder andere Meshes → deselect
                this.deselectSphere();
            }
        } else {
            this.deselectSphere();
        }
    }

    private onMouseDown(event: MouseEvent): void {
        if (event.button !== 0) return; // nur linke Maustaste

        this.updateMousePosition(event);

        const camera = this.scene.getCamera();
        this.raycaster.setFromCamera(this.mouse, camera);

        // Raycast gegen alle Sphere-Meshes
        const meshes = this.scene.getThreeScene().children.filter(
            child => child instanceof THREE.Mesh && (
                child.name.startsWith('TestSphere') ||
                child.name.startsWith('MassiveSphere') ||
                child.name.startsWith('DynamicSphere')
            )
        ) as THREE.Mesh[];

        const intersects = this.raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            const clickedSphere = intersects[0].object as THREE.Mesh;
            const match = clickedSphere.name.match(/(TestSphere|MassiveSphere|DynamicSphere)_(\d+)/);
            const sphereIndex = match ? parseInt(match[2]) : -1;

            if (sphereIndex >= 0) {
                // Auswahl (ohne UI anzeigen)
                this.selectedSphere = clickedSphere;
                this.selectedSphereIndex = sphereIndex;
                this.logger.info(`Kugel ausgewählt: ${clickedSphere.name} (Index: ${sphereIndex})`);

                // Prüfe auf Doppelklick (innerhalb 300ms auf gleiche Kugel)
                const now = performance.now();
                const isDoubleClick =
                    this.lastClickedSphereIndex === sphereIndex &&
                    (now - this.lastClickTime) < this.DOUBLE_CLICK_THRESHOLD_MS;

                this.lastClickTime = now;
                this.lastClickedSphereIndex = sphereIndex;

                if (isDoubleClick) {
                    // Doppelklick → UI anzeigen
                    this.updateUI();
                    this.showUI();
                    this.logger.info(`Doppelklick auf Kugel ${sphereIndex} - UI angezeigt`);
                }

                const normal = new THREE.Vector3();
                camera.getWorldDirection(normal).normalize();
                this.dragPlane.setFromNormalAndCoplanarPoint(normal, this.selectedSphere.position);

                if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersectionPoint)) {
                    this.dragOffset.copy(this.selectedSphere.position).sub(this.dragIntersectionPoint);
                    this.isDragging = true;
                    this.canvas.style.cursor = 'grabbing';
                } else {
                    this.isDragging = false;
                }
            } else {
                // Keine gültige Sphere → deselect
                this.deselectSphere();
            }
        } else {
            // Klick ins Leere → deselect
            this.deselectSphere();
        }
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.isDragging || !this.selectedSphere) return;

        this.updateMousePosition(event);

        const camera = this.scene.getCamera();
        this.raycaster.setFromCamera(this.mouse, camera);

        const intersectionFound = this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersectionPoint);

        if (intersectionFound) {
            // Neue Position = Schnittpunkt + Offset
            const newPosition = this.dragIntersectionPoint.clone().add(this.dragOffset);
            this.selectedSphere.position.copy(newPosition);

            // UI aktualisieren
            this.updateUI();

            // ⚡ Throttle GPU-Update mit RAF — nicht auf jedem mousemove rendern!
            if (!this.dragPending && this.onChangesApplied && this.selectedSphereIndex >= 0) {
                this.dragPending = true;
                this.dragRafId = requestAnimationFrame(() => {
                    this.onChangesApplied!(this.selectedSphereIndex);
                    this.dragPending = false;
                    this.dragRafId = null;
                });
            }
        }
    }

    private onMouseUp(event: MouseEvent): void {
        if (event.button !== 0) return;

        if (this.isDragging) {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';

            if (this.selectedSphere) {
                this.logger.success(
                    `Kugel verschoben zu Position: (${this.selectedSphere.position.x.toFixed(2)}, ` +
                    `${this.selectedSphere.position.y.toFixed(2)}, ${this.selectedSphere.position.z.toFixed(2)})`
                );
            }
        }
    }

    private onWheel(event: WheelEvent): void {
        if (!this.selectedSphere) return;

        event.preventDefault();

        const geometry = this.selectedSphere.geometry as THREE.SphereGeometry;
        let newRadius = geometry.parameters.radius;

        // Mausrad: Radius ändern
        if (event.deltaY < 0) {
            newRadius += 0.1;
        } else {
            newRadius -= 0.1;
        }

        newRadius = Math.max(0.1, Math.min(3.0, newRadius));

        // Geometrie neu erstellen
        const oldGeometry = this.selectedSphere.geometry;
        this.selectedSphere.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
        oldGeometry.dispose();

        this.updateUI();
        this.logger.info(`Radius: ${newRadius.toFixed(1)}`);

        // Sofort GPU-Update und Render beim Radius-Ändern
        if (this.onChangesApplied && this.selectedSphereIndex >= 0) {
            this.onChangesApplied(this.selectedSphereIndex);
        }
    }

    private selectSphere(sphere: THREE.Mesh, sphereIndex: number): void {
        this.selectedSphere = sphere;
        this.selectedSphereIndex = sphereIndex;
        this.updateUI();
        this.showUI();
    }

    private deselectSphere(): void {
        this.selectedSphere = null;
        this.hideUI();
    }

    private createUI(): void {
        // Container für UI erstellen
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'sphere-editor';
        this.uiContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            display: none;
            min-width: 300px;
        `;

        this.uiContainer.innerHTML = `
            <h3 style="margin-top: 0;">Kugel Editor</h3>

            <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 12px;">
                <strong>Steuerung:</strong><br>
                • Werte eingeben und Enter drücken<br>
                • Oder "Änderungen übernehmen" klicken<br>
                <em style="color: #4CAF50; font-size: 11px;">Nur UI-Eingabe aktiv (Cache-Safe)</em>
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Position X:</strong></label>
                <input type="number" id="pos-x" step="0.5" value="0.0" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #222; color: white;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Position Y:</strong></label>
                <input type="number" id="pos-y" step="0.5" value="0.0" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #222; color: white;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Position Z:</strong></label>
                <input type="number" id="pos-z" step="0.5" value="0.0" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #222; color: white;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Radius:</strong></label>
                <input type="number" id="radius" step="0.1" min="0.1" max="5.0" value="1.0" style="width: 100%; padding: 8px; border: 1px solid #555; border-radius: 4px; background: #222; color: white;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;"><strong>Farbe:</strong></label>
                <input type="color" id="color" value="#ff6b6b" style="width: 100%; height: 40px; cursor: pointer;">
            </div>

            <button id="apply-changes" style="width: 100%; padding: 12px; margin-bottom: 10px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px; font-weight: bold;">
                Änderungen übernehmen
            </button>

            <button id="close-editor" style="width: 100%; padding: 12px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px; font-weight: bold;">
                Schließen
            </button>
        `;

        document.body.appendChild(this.uiContainer);

        // Event Listener für UI-Elemente
        this.setupUIListeners();
    }

    private setupUIListeners(): void {
        if (!this.uiContainer) return;

        // Input-Felder
        const posXInput = this.uiContainer.querySelector('#pos-x') as HTMLInputElement;
        const posYInput = this.uiContainer.querySelector('#pos-y') as HTMLInputElement;
        const posZInput = this.uiContainer.querySelector('#pos-z') as HTMLInputElement;
        const radiusInput = this.uiContainer.querySelector('#radius') as HTMLInputElement;
        const colorInput = this.uiContainer.querySelector('#color') as HTMLInputElement;

        // Buttons
        const applyButton = this.uiContainer.querySelector('#apply-changes') as HTMLButtonElement;
        const closeButton = this.uiContainer.querySelector('#close-editor') as HTMLButtonElement;

        // Add event listeners with bound handlers
        posXInput.addEventListener('keypress', this.boundApplyChangesOnEnter);
        posYInput.addEventListener('keypress', this.boundApplyChangesOnEnter);
        posZInput.addEventListener('keypress', this.boundApplyChangesOnEnter);
        radiusInput.addEventListener('keypress', this.boundApplyChangesOnEnter);
        colorInput.addEventListener('input', this.boundUpdateSphereColor);
        applyButton.addEventListener('click', this.boundApplyInputChanges);
        closeButton.addEventListener('click', this.boundDeselectSphere);
    }

    private removeUIListeners(): void {
        if (!this.uiContainer) return;

        const posXInput = this.uiContainer.querySelector('#pos-x') as HTMLInputElement;
        const posYInput = this.uiContainer.querySelector('#pos-y') as HTMLInputElement;
        const posZInput = this.uiContainer.querySelector('#pos-z') as HTMLInputElement;
        const radiusInput = this.uiContainer.querySelector('#radius') as HTMLInputElement;
        const colorInput = this.uiContainer.querySelector('#color') as HTMLInputElement;
        const applyButton = this.uiContainer.querySelector('#apply-changes') as HTMLButtonElement;
        const closeButton = this.uiContainer.querySelector('#close-editor') as HTMLButtonElement;

        if (posXInput) posXInput.removeEventListener('keypress', this.boundApplyChangesOnEnter);
        if (posYInput) posYInput.removeEventListener('keypress', this.boundApplyChangesOnEnter);
        if (posZInput) posZInput.removeEventListener('keypress', this.boundApplyChangesOnEnter);
        if (radiusInput) radiusInput.removeEventListener('keypress', this.boundApplyChangesOnEnter);
        if (colorInput) colorInput.removeEventListener('input', this.boundUpdateSphereColor);
        if (applyButton) applyButton.removeEventListener('click', this.boundApplyInputChanges);
        if (closeButton) closeButton.removeEventListener('click', this.boundDeselectSphere);
    }

    private applyInputChanges(): void {
        if (!this.selectedSphere || !this.uiContainer) return;

        // Werte aus Input-Feldern lesen
        const x = parseFloat((this.uiContainer.querySelector('#pos-x') as HTMLInputElement).value);
        const y = parseFloat((this.uiContainer.querySelector('#pos-y') as HTMLInputElement).value);
        const z = parseFloat((this.uiContainer.querySelector('#pos-z') as HTMLInputElement).value);
        const radius = parseFloat((this.uiContainer.querySelector('#radius') as HTMLInputElement).value);

        // Position setzen
        this.selectedSphere.position.set(x, y, z);

        // Radius setzen (Geometrie neu erstellen)
        const oldGeometry = this.selectedSphere.geometry;
        this.selectedSphere.geometry = new THREE.SphereGeometry(radius, 32, 32);
        oldGeometry.dispose();

        // GPU-Update mit selektiver Cache-Invalidierung
        if (this.onChangesApplied && this.selectedSphereIndex >= 0) {
            this.onChangesApplied(this.selectedSphereIndex);
        }

        this.logger.success(`Kugel aktualisiert: Position(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}), Radius=${radius.toFixed(1)}`);
    }

    private updateUI(): void {
        if (!this.selectedSphere || !this.uiContainer) return;

        const geometry = this.selectedSphere.geometry as THREE.SphereGeometry;
        const material = this.selectedSphere.material as THREE.MeshStandardMaterial;
        const pos = this.selectedSphere.position;
        const radius = geometry.parameters.radius;
        const color = '#' + material.color.getHexString();

        (this.uiContainer.querySelector('#pos-x') as HTMLInputElement).value = pos.x.toString();
        (this.uiContainer.querySelector('#pos-y') as HTMLInputElement).value = pos.y.toString();
        (this.uiContainer.querySelector('#pos-z') as HTMLInputElement).value = pos.z.toString();
        (this.uiContainer.querySelector('#radius') as HTMLInputElement).value = radius.toString();
        (this.uiContainer.querySelector('#color') as HTMLInputElement).value = color;
    }

    private updateSphereColor(): void {
        if (!this.selectedSphere || !this.uiContainer) return;

        const colorHex = (this.uiContainer.querySelector('#color') as HTMLInputElement).value;
        const material = this.selectedSphere.material as THREE.MeshStandardMaterial;
        material.color.set(colorHex);

        // WICHTIG: Sofort GPU-Update und Render bei Farb-Änderung
        if (this.onChangesApplied && this.selectedSphereIndex >= 0) {
            this.onChangesApplied(this.selectedSphereIndex);
        }
    }

    private showUI(): void {
        if (this.uiContainer) {
            this.uiContainer.style.display = 'block';
        }
    }

    private hideUI(): void {
        if (this.uiContainer) {
            this.uiContainer.style.display = 'none';
        }
    }

    public cleanup(): void {
        // Remove UI event listeners first
        this.removeUIListeners();

        if (this.uiContainer) {
            document.body.removeChild(this.uiContainer);
            this.uiContainer = null;
        }
        if (this.dragRafId !== null) {
            cancelAnimationFrame(this.dragRafId);
            this.dragRafId = null;
        }
        // Remove canvas event listeners
        try {
            this.canvas.removeEventListener('mousedown', this.boundMouseDown);
            this.canvas.removeEventListener('mousemove', this.boundMouseMove);
            this.canvas.removeEventListener('mouseup', this.boundMouseUp);
            this.canvas.removeEventListener('wheel', this.boundWheel);
        } catch (e) {
            // ignore
        }
    }
}
