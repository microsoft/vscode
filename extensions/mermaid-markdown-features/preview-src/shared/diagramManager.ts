/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ClickDragMode, MermaidExtensionConfig, ShowControlsMode } from './config';
import diagramStyles from './diagramStyles.css';
import { IDisposable } from './disposable';

const minScale = 0.5;
const maxScale = 10;
const zoomFactor = 0.002;

interface Dimensions {
	readonly width: number;
	readonly height: number;
}

interface Point {
	readonly x: number;
	readonly y: number;
}

export interface PanZoomState {
	readonly scale: number;
	readonly translate: Point;
	readonly hasInteracted: boolean;
	readonly customHeight?: number;
}

/**
 * Manages all DiagramElement instances within a window/document.
 */
export class DiagramManager {

	private readonly instances = new Map<string, DiagramElement>();
	private readonly savedStates = new Map<string, PanZoomState>();

	private readonly diagramStyleSheet: HTMLStyleElement;

	private config: MermaidExtensionConfig;

	constructor(config: MermaidExtensionConfig) {
		this.config = config;

		this.diagramStyleSheet = document.createElement('style');
		this.diagramStyleSheet.className = 'markdown-style mermaid-diagram-styles';
		this.diagramStyleSheet.textContent = diagramStyles;
		document.head.appendChild(this.diagramStyleSheet);
	}

	public updateConfig(config: MermaidExtensionConfig): void {
		this.config = config;
	}

	/**
	 * Sets up pan-zoom support for a mermaid container.
	 *
	 * @param id Unique identifier for this instance (used for state preservation)
	 * @param mermaidContainer The container element with the rendered diagram
	 *
	 * @returns An IDisposable that cleans up pan zoom support for this instance.
	 */
	public setup(id: string, mermaidContainer: HTMLElement): IDisposable {
		// Clean up existing instance (state is saved automatically in disposeInstance)
		this.disposeInstance(id);

		const parent = mermaidContainer.parentNode;
		if (!parent) {
			return { dispose: () => { } };
		}

		// Create wrapper structure
		const wrapper = document.createElement('div');
		wrapper.className = 'mermaid-wrapper';

		const content = document.createElement('div');
		content.className = 'mermaid-content';

		parent.insertBefore(wrapper, mermaidContainer);
		content.appendChild(mermaidContainer);
		wrapper.appendChild(content);

		// Create and track instance
		const state = this.savedStates.get(id);
		const instance = new DiagramElement(wrapper, content, this.config, state);
		this.instances.set(id, instance);

		// Initialize after DOM update
		requestAnimationFrame(() => {
			instance.initialize();
		});

		return { dispose: () => this.disposeInstance(id) };
	}

	/**
	 * Disposes a specific instance by id, saving its state first.
	 */
	private disposeInstance(id: string): void {
		const instance = this.instances.get(id);
		if (instance) {
			// Save state before disposing
			this.savedStates.set(id, instance.getState());

			instance.dispose();
			this.instances.delete(id);
		}
	}

	/**
	 * Removes saved states for IDs not in the given set.
	 * Call this after rendering to clean up states for removed diagrams.
	 */
	public retainStates(activeIds: Set<string>): void {
		for (const id of this.savedStates.keys()) {
			if (!activeIds.has(id)) {
				this.savedStates.delete(id);
			}
		}
	}
}

/**
 * Implements pan and zoom for a given DOM node.
 *
 * Features: drag to pan, pinch/scroll to zoom, Alt+click zoom, zoom controls.
 */
export class DiagramElement {
	private scale = 1;
	private translate: Point = { x: 0, y: 0 };

	/** Cached SVG intrinsic dimensions from last layout */
	private lastSvgSize: Dimensions = { width: 0, height: 0 };

	private isPanning = false;
	private hasDragged = false;
	private hasInteracted = false;
	private panModeEnabled = false;
	private startX = 0;
	private startY = 0;

	private isResizing = false;
	private resizeStartY = 0;
	private resizeStartHeight = 0;
	private customHeight: number | undefined;

	private panModeButton: HTMLButtonElement | null = null;
	private readonly resizeHandle: HTMLElement | null = null;
	private readonly resizeObserver: ResizeObserver;

	private readonly showControls: ShowControlsMode;
	private readonly clickDrag: ClickDragMode;
	private readonly resizable: boolean;
	private readonly maxHeight: string;

	private readonly abortController = new AbortController();

	constructor(
		private readonly container: HTMLElement,
		private readonly content: HTMLElement,
		config: MermaidExtensionConfig,
		initialState?: PanZoomState
	) {
		this.showControls = config.showControls;
		this.clickDrag = config.clickDrag;
		this.resizable = config.resizable;
		this.maxHeight = config.maxHeight;

		// Restore state if provided
		if (initialState) {
			this.scale = initialState.scale;
			this.translate = { x: initialState.translate.x, y: initialState.translate.y };
			this.hasInteracted = initialState.hasInteracted;
			this.customHeight = initialState.customHeight;
		}

		this.content.style.transformOrigin = '0 0';
		this.container.style.overflow = 'hidden';
		this.container.tabIndex = 0;
		this.container.setAttribute('aria-label', 'Mermaid Diagram');

		// Apply max height if configured and valid
		if (this.maxHeight) {
			const sanitizedMaxHeight = sanitizeCssLength(this.maxHeight);
			if (sanitizedMaxHeight) {
				this.container.style.maxHeight = sanitizedMaxHeight;
			}
		}

		// Set initial cursor based on click-drag mode
		this.setCursor(false, false);

		this.setupEventListeners();
		if (this.showControls !== ShowControlsMode.Never) {
			this.createZoomControls();
		}

		if (this.resizable) {
			this.resizeHandle = this.createResizeHandle();
			this.container.appendChild(this.resizeHandle);
		}

		// Watch for container size changes
		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.container);
	}

	public initialize(): void {
		if (this.hasInteracted) {
			// Restore previous transform if user had interacted
			// Also cache SVG dimensions for resize calculations
			this.tryResizeContainerToFitSvg();
			this.applyTransform();
		} else {
			this.centerContent();
		}
	}

	public getState(): PanZoomState {
		return {
			scale: this.scale,
			translate: { x: this.translate.x, y: this.translate.y },
			hasInteracted: this.hasInteracted,
			customHeight: this.customHeight,
		};
	}

	public dispose(): void {
		this.abortController.abort();
		this.resizeObserver.disconnect();
	}

	private setupEventListeners(): void {
		const signal = this.abortController.signal;

		this.container.addEventListener('mousedown', e => this.handleMouseDown(e), { signal });
		document.addEventListener('mousemove', e => this.handleMouseMove(e), { signal });
		document.addEventListener('mouseup', () => this.handleMouseUp(), { signal });

		this.container.addEventListener('click', e => this.handleClick(e), { signal });
		this.container.addEventListener('wheel', e => this.handleWheel(e), { passive: false, signal });

		this.container.addEventListener('mousemove', e => this.updateCursor(e), { signal });
		this.container.addEventListener('mouseenter', e => this.updateCursor(e), { signal });
		window.addEventListener('keydown', e => this.handleKeyChange(e), { signal });
		window.addEventListener('keyup', e => this.handleKeyChange(e), { signal });
	}

	private createZoomControls(): void {
		const signal = this.abortController.signal;

		const controls = document.createElement('div');
		controls.className = 'mermaid-zoom-controls';
		if (this.showControls === ShowControlsMode.OnHoverOrFocus) {
			controls.classList.add('mermaid-zoom-controls-auto-hide');
		}
		controls.innerHTML = `
			<button class="pan-mode-btn" title="Toggle Pan Mode" aria-label="Toggle Pan Mode" aria-pressed="false"><span class="codicon codicon-move" aria-hidden="true"></span></button>
			<button class="zoom-out-btn" title="Zoom Out" aria-label="Zoom Out"><span class="codicon codicon-zoom-out" aria-hidden="true"></span></button>
			<button class="zoom-in-btn" title="Zoom In" aria-label="Zoom In"><span class="codicon codicon-zoom-in" aria-hidden="true"></span></button>
			<button class="zoom-reset-btn" title="Reset Zoom" aria-label="Reset Zoom"><span class="codicon codicon-screen-normal" aria-hidden="true"></span></button>
		`;

		this.panModeButton = controls.querySelector('.pan-mode-btn');
		this.panModeButton?.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.togglePanMode();
		}, { signal });
		controls.querySelector('.zoom-in-btn')?.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.zoomIn();
		}, { signal });
		controls.querySelector('.zoom-out-btn')?.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.zoomOut();
		}, { signal });
		controls.querySelector('.zoom-reset-btn')?.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			this.reset();
		}, { signal });

		this.container.appendChild(controls);
	}

	private createResizeHandle(): HTMLElement {
		const signal = this.abortController.signal;

		const resizeHandle = document.createElement('div');
		resizeHandle.className = 'mermaid-resize-handle';
		resizeHandle.title = 'Drag to resize';
		resizeHandle.tabIndex = 0;
		resizeHandle.setAttribute('role', 'separator');
		resizeHandle.setAttribute('aria-label', 'Resize Mermaid Diagram');
		resizeHandle.setAttribute('aria-orientation', 'horizontal');

		resizeHandle.addEventListener('mousedown', e => {
			e.preventDefault();
			e.stopPropagation();
			this.isResizing = true;
			this.resizeStartY = e.clientY;
			this.resizeStartHeight = this.container.getBoundingClientRect().height;
			document.body.style.cursor = 'ns-resize';
		}, { signal });

		document.addEventListener('mousemove', e => {
			if (!this.isResizing) {
				return;
			}
			// Check if mouse button was released outside the window
			if (e.buttons === 0) {
				this.isResizing = false;
				document.body.style.cursor = '';
				return;
			}
			const deltaY = e.clientY - this.resizeStartY;
			this.resizeToHeight(this.resizeStartHeight + deltaY);
		}, { signal });

		resizeHandle.addEventListener('keydown', e => {
			if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
				return;
			}

			e.preventDefault();
			e.stopPropagation();

			const currentHeight = this.customHeight ?? this.container.getBoundingClientRect().height;
			const direction = e.key === 'ArrowUp' ? -1 : 1;
			const step = e.shiftKey ? 50 : 10;
			this.resizeToHeight(currentHeight + direction * step);
		}, { signal });

		document.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				document.body.style.cursor = '';
			}
		}, { signal });

		return resizeHandle;
	}

	private togglePanMode(): void {
		this.panModeEnabled = !this.panModeEnabled;
		this.panModeButton?.classList.toggle('active', this.panModeEnabled);
		this.panModeButton?.setAttribute('aria-pressed', String(this.panModeEnabled));
		this.setCursor(false, false);
	}

	private resizeToHeight(height: number): void {
		const newHeight = Math.max(100, height);
		this.container.style.height = `${newHeight}px`;
		this.customHeight = newHeight;
	}

	private handleKeyChange(e: KeyboardEvent): void {
		if ((e.key === 'Alt' || e.key === 'Shift') && !this.isPanning) {
			e.preventDefault();
			this.setCursor(e.altKey, e.shiftKey);
		}
	}

	private updateCursor(e: MouseEvent): void {
		if (!this.isPanning) {
			this.setCursor(e.altKey, e.shiftKey);
		}
	}

	private setCursor(altKey: boolean, shiftKey: boolean): void {
		// Pan mode always shows grab cursor
		if (this.panModeEnabled) {
			this.container.style.cursor = 'grab';
			return;
		}

		if (this.clickDrag === ClickDragMode.Alt) {
			// In Alt mode: default cursor normally, grab when alt is pressed
			if (altKey && shiftKey) {
				this.container.style.cursor = 'zoom-out';
			} else if (altKey) {
				this.container.style.cursor = 'grab';
			} else {
				this.container.style.cursor = 'default';
			}
		} else {
			// In Always/Never mode: use grab cursor with zoom modifiers
			if (altKey && !shiftKey) {
				this.container.style.cursor = 'zoom-in';
			} else if (altKey && shiftKey) {
				this.container.style.cursor = 'zoom-out';
			} else {
				this.container.style.cursor = 'grab';
			}
		}
	}

	private handleClick(e: MouseEvent): void {
		if (!e.altKey || this.hasDragged) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();

		const rect = this.container.getBoundingClientRect();
		const factor = e.shiftKey ? 0.8 : 1.25;
		this.zoomAtPoint(factor, e.clientX - rect.left, e.clientY - rect.top);
	}

	private handleWheel(e: WheelEvent): void {
		const isPinchZoom = e.ctrlKey;

		if (isPinchZoom || e.altKey) {
			e.preventDefault();
			e.stopPropagation();

			const rect = this.container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			// Pinch gestures report smaller deltaY values than scroll wheel,
			// so we apply a multiplier to make them feel equally sensitive
			const pinchMultiplier = isPinchZoom ? 10 : 1;
			const delta = -e.deltaY * zoomFactor * pinchMultiplier;
			const newScale = Math.min(maxScale, Math.max(minScale, this.scale * (1 + delta)));

			const scaleFactor = newScale / this.scale;
			this.translate = {
				x: mouseX - (mouseX - this.translate.x) * scaleFactor,
				y: mouseY - (mouseY - this.translate.y) * scaleFactor,
			};
			this.scale = newScale;

			this.applyTransform();
			this.hasInteracted = true;
		}
	}

	private handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0) {
			return;
		}

		// Check if panning is allowed based on clickDrag mode or pan mode
		if (!this.panModeEnabled && this.clickDrag === ClickDragMode.Alt && !e.altKey) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		this.isPanning = true;
		this.hasDragged = false;
		this.startX = e.clientX - this.translate.x;
		this.startY = e.clientY - this.translate.y;
		this.container.style.cursor = 'grabbing';
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.isPanning) {
			return;
		}
		if (e.buttons === 0) {
			this.handleMouseUp();
			return;
		}

		const dx = e.clientX - this.startX - this.translate.x;
		const dy = e.clientY - this.startY - this.translate.y;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			this.hasDragged = true;
		}
		this.translate = {
			x: e.clientX - this.startX,
			y: e.clientY - this.startY,
		};
		this.applyTransform();
	}

	private handleMouseUp(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.setCursor(false, false);
			this.hasInteracted = true;
		}
	}

	private applyTransform(): void {
		this.content.style.transform = `translate(${this.translate.x}px, ${this.translate.y}px) scale(${this.scale})`;
	}

	private handleResize(): void {
		if (this.hasInteracted) {
			// Try to preserve the  visible content as percentage of the SVG,
			// then restore that same percentage after resize.

			// Step 1: Calculate which SVG point is at the viewport's top-left (0, 0)
			const svgAtOriginX = -this.translate.x / this.scale;
			const svgAtOriginY = -this.translate.y / this.scale;

			// Express as percentage of old SVG dimensions
			const percentX = this.lastSvgSize.width > 0 ? svgAtOriginX / this.lastSvgSize.width : 0;
			const percentY = this.lastSvgSize.height > 0 ? svgAtOriginY / this.lastSvgSize.height : 0;

			// Step 2: Resize and update cached SVG dimensions
			if (!this.tryResizeContainerToFitSvg()) {
				return;
			}

			// Step 3: Calculate new translate to keep the same percentage at origin
			const newSvgAtOriginX = percentX * this.lastSvgSize.width;
			const newSvgAtOriginY = percentY * this.lastSvgSize.height;
			this.translate = {
				x: -newSvgAtOriginX * this.scale,
				y: -newSvgAtOriginY * this.scale,
			};

			this.applyTransform();
		} else {
			this.centerContent();
		}
	}

	/**
	 * Resizes the container's height and updates cached SVG dimensions.
	 *
	 * This will try to preserve the current height if the user has resized the diagram. Otherwise
	 * it will resize to fit the SVG's intrinsic height.
	 *
	 * Updates `lastSvgSize` with the SVG's intrinsic dimensions.
	 *
	 * @returns true if the SVG was found and dimensions were updated, false otherwise.
	 */
	private tryResizeContainerToFitSvg(): boolean {
		const svg = this.content.querySelector('svg');
		if (!svg) {
			return false;
		}

		svg.removeAttribute('height');

		// Get the intrinsic size
		const oldTransform = this.content.style.transform;
		this.content.style.transform = 'none';
		const rect = svg.getBoundingClientRect();
		this.content.style.transform = oldTransform;

		// Update cache
		this.lastSvgSize = { width: rect.width, height: rect.height };

		// Use custom height if set, otherwise use the SVG's intrinsic height
		const containerHeight = this.customHeight ?? this.lastSvgSize.height;
		this.container.style.height = `${containerHeight}px`;

		return true;
	}

	private centerContent(): void {
		if (!this.tryResizeContainerToFitSvg()) {
			return;
		}

		// Start at scale 1, centered
		this.scale = 1;
		const containerRect = this.container.getBoundingClientRect();
		this.translate = {
			x: (containerRect.width - this.lastSvgSize.width) / 2,
			y: 0,
		};

		this.applyTransform();
	}

	public reset(): void {
		this.scale = 1;
		this.translate = { x: 0, y: 0 };
		this.hasInteracted = false;
		this.customHeight = undefined;
		this.centerContent();
	}

	public zoomIn(): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAtPoint(1.25, rect.width / 2, rect.height / 2);
	}

	public zoomOut(): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAtPoint(0.8, rect.width / 2, rect.height / 2);
	}

	private zoomAtPoint(factor: number, x: number, y: number): void {
		const newScale = Math.min(maxScale, Math.max(minScale, this.scale * factor));
		const scaleFactor = newScale / this.scale;
		this.translate = {
			x: x - (x - this.translate.x) * scaleFactor,
			y: y - (y - this.translate.y) * scaleFactor,
		};
		this.scale = newScale;
		this.applyTransform();
		this.hasInteracted = true;
	}
}

function sanitizeCssLength(value: string): string {
	try {
		const parsed = CSSNumericValue.parse(value);
		return parsed.toString();
	} catch {
		return '';
	}
}
