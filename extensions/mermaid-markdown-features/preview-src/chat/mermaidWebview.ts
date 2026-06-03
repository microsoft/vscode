/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';
import { buildMermaidConfig, createMermaidErrorElement, loadExtensionConfig, markVsCodeContextAsError } from '../shared';
import { VsCodeMermaidThemeTracker } from '../shared/vsCodeTheme';
import { VsCodeApi } from './vscodeApi';

interface PanZoomState {
	readonly scale: number;
	readonly translateX: number;
	readonly translateY: number;
}

interface PanZoomOptions {
	readonly defaultView?: 'center' | 'fit';
}

interface Size {
	readonly width: number;
	readonly height: number;
}

export class PanZoomHandler {
	private scale = 1;
	private fitScale = 1;
	private translateX = 0;
	private translateY = 0;

	private isPanning = false;
	private hasDragged = false;
	private hasInteracted = false;
	private panModeEnabled = false;
	private startX = 0;
	private startY = 0;

	private readonly minScale = 0.1;
	private readonly maxScale = 5;
	private readonly zoomFactor = 0.002;
	private readonly fitPadding = 16;

	constructor(
		private readonly container: HTMLElement,
		private readonly content: HTMLElement,
		private readonly vscode: VsCodeApi,
		private readonly options: PanZoomOptions = {}
	) {
		this.container = container;
		this.content = content;
		this.content.style.transformOrigin = '0 0';
		this.container.style.overflow = 'hidden';
		this.container.style.cursor = 'default';
		this.setupEventListeners();
	}

	/**
	 * Initializes the pan/zoom state - either restores from saved state or applies the default view.
	 */
	public initialize(): void {
		if (!this.restoreState()) {
			// Use requestAnimationFrame to ensure layout is updated before resetting the view
			requestAnimationFrame(() => {
				this.resetView();
			});
		}
	}

	private setupEventListeners(): void {
		// Pan with mouse drag
		this.container.addEventListener('mousedown', e => this.handleMouseDown(e));
		document.addEventListener('mousemove', e => this.handleMouseMove(e));
		document.addEventListener('mouseup', () => this.handleMouseUp());

		// Click to zoom (Alt+click = zoom in, Alt+Shift+click = zoom out)
		this.container.addEventListener('click', e => this.handleClick(e));

		// Trackpad: pinch = zoom, Alt + two-finger scroll = zoom
		this.container.addEventListener('wheel', e => this.handleWheel(e), { passive: false });

		// Update cursor when Alt/Option key is pressed
		this.container.addEventListener('mousemove', e => this.updateCursorFromModifier(e));
		this.container.addEventListener('mouseenter', e => this.updateCursorFromModifier(e));
		window.addEventListener('keydown', e => this.handleKeyChange(e));
		window.addEventListener('keyup', e => this.handleKeyChange(e));

		// Reset the view on resize if user hasn't interacted yet
		window.addEventListener('resize', () => this.handleResize());
	}

	private handleKeyChange(e: KeyboardEvent): void {
		if ((e.key === 'Alt' || e.key === 'Shift') && !this.isPanning) {
			e.preventDefault();
			this.setCursor(e.altKey, e.shiftKey);
		}
	}

	private updateCursorFromModifier(e: MouseEvent): void {
		if (this.isPanning) {
			return;
		}
		this.setCursor(e.altKey, e.shiftKey);
	}

	private setCursor(altKey: boolean, shiftKey: boolean): void {
		if (this.panModeEnabled) {
			this.container.style.cursor = 'grab';
			return;
		}

		if (altKey && !shiftKey) {
			this.container.style.cursor = 'grab';
		} else if (altKey && shiftKey) {
			this.container.style.cursor = 'zoom-out';
		} else {
			this.container.style.cursor = 'default';
		}
	}

	private handleClick(e: MouseEvent): void {
		// Only zoom on click if Alt is held and we didn't drag
		if (!e.altKey || this.hasDragged) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		const rect = this.container.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Alt+Shift+click = zoom out, Alt+click = zoom in
		const factor = e.shiftKey ? 0.8 : 1.25;
		this.zoomAtPoint(factor, x, y);
	}

	private handleWheel(e: WheelEvent): void {
		// Only zoom when Alt is held (or ctrlKey for pinch-to-zoom gestures)
		// ctrlKey is set by browsers for pinch-to-zoom gestures
		const isPinchZoom = e.ctrlKey;

		if (!e.altKey && !isPinchZoom) {
			// Allow normal scrolling when Alt is not held
			return;
		}

		if (isPinchZoom || e.altKey) {
			// Pinch gesture or Alt + two-finger drag = zoom
			e.preventDefault();
			e.stopPropagation();

			const rect = this.container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			// Calculate zoom (scroll up = zoom in, scroll down = zoom out)
			// Pinch gestures have smaller deltaY values, so use a higher factor
			const effectiveZoomFactor = isPinchZoom ? this.zoomFactor * 5 : this.zoomFactor;
			const delta = -e.deltaY * effectiveZoomFactor;
			const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * (1 + delta)));

			// Zoom toward mouse position
			const scaleFactor = newScale / this.scale;
			this.translateX = mouseX - (mouseX - this.translateX) * scaleFactor;
			this.translateY = mouseY - (mouseY - this.translateY) * scaleFactor;
			this.scale = newScale;

			this.applyTransform();
			this.saveState();
		}
	}

	private handleMouseDown(e: MouseEvent): void {
		if (e.button !== 0 || (!this.panModeEnabled && !e.altKey)) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		this.isPanning = true;
		this.hasDragged = false;
		this.startX = e.clientX - this.translateX;
		this.startY = e.clientY - this.translateY;
		this.container.style.cursor = 'grabbing';
	}

	private handleMouseMove(e: MouseEvent): void {
		if (!this.isPanning) {
			return;
		}

		// Handle case where mouse was released outside the webview
		if (e.buttons === 0) {
			this.handleMouseUp();
			return;
		}

		const dx = e.clientX - this.startX - this.translateX;
		const dy = e.clientY - this.startY - this.translateY;
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			this.hasDragged = true;
		}
		this.translateX = e.clientX - this.startX;
		this.translateY = e.clientY - this.startY;
		this.applyTransform();
	}

	private handleMouseUp(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.setCursor(false, false);
			this.saveState();
		}
	}

	private applyTransform(): void {
		this.content.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
	}

	private saveState(): void {
		this.hasInteracted = true;
		const currentState = this.vscode.getState() || {};
		this.vscode.setState({
			...currentState,
			panZoom: {
				scale: this.scale,
				translateX: this.translateX,
				translateY: this.translateY
			}
		});
	}

	private restoreState(): boolean {
		const state = this.vscode.getState();
		if (state?.panZoom) {
			const panZoom = state.panZoom as PanZoomState;
			this.updateFitScale();
			this.scale = panZoom.scale ?? 1;
			this.translateX = panZoom.translateX ?? 0;
			this.translateY = panZoom.translateY ?? 0;
			this.hasInteracted = true;
			this.applyTransform();
			return true;
		}
		return false;
	}

	private handleResize(): void {
		this.updateFitScale();
		if (!this.hasInteracted) {
			this.resetView();
		}
	}

	private updateFitScale(): void {
		if (this.options.defaultView !== 'fit') {
			this.fitScale = 1;
			return;
		}

		const scale = this.getScaleToFitContainer();
		if (scale !== undefined) {
			this.fitScale = scale;
		}
	}

	private getSvgSize(): Size | undefined {
		// Get the SVG element inside the content - mermaid renders to an SVG
		const svg = this.content.querySelector('svg');
		if (!svg) {
			return;
		}

		const oldTransform = this.content.style.transform;
		this.content.style.transform = 'none';
		const svgRect = svg.getBoundingClientRect();
		this.content.style.transform = oldTransform;

		if (svgRect.width <= 0 || svgRect.height <= 0) {
			return;
		}

		return { width: svgRect.width, height: svgRect.height };
	}

	private resetView(): void {
		if (this.options.defaultView === 'fit') {
			this.fitContentToContainer();
		} else {
			this.centerContent();
		}
	}

	private centerContent(): void {
		const containerRect = this.container.getBoundingClientRect();
		const svgSize = this.getSvgSize();
		if (!svgSize) {
			return;
		}

		this.scale = 1;
		this.fitScale = 1;
		this.translateX = (containerRect.width - svgSize.width) / 2;
		this.translateY = (containerRect.height - svgSize.height) / 2;

		this.applyTransform();
	}

	private fitContentToContainer(): void {
		const svgSize = this.getSvgSize();
		if (!svgSize) {
			return;
		}

		const containerRect = this.container.getBoundingClientRect();
		this.scale = this.getScaleToFitContainer(svgSize, containerRect) ?? 1;
		this.fitScale = this.scale;
		this.translateX = (containerRect.width - (svgSize.width * this.scale)) / 2;
		this.translateY = (containerRect.height - (svgSize.height * this.scale)) / 2;

		this.applyTransform();
	}

	private getScaleToFitContainer(svgSize = this.getSvgSize(), containerRect = this.container.getBoundingClientRect()): number | undefined {
		if (!svgSize) {
			return;
		}

		const availableWidth = Math.max(1, containerRect.width - (this.fitPadding * 2));
		const availableHeight = Math.max(1, containerRect.height - (this.fitPadding * 2));
		const scale = Math.min(1, availableWidth / svgSize.width, availableHeight / svgSize.height);
		return Number.isFinite(scale) && scale > 0 ? scale : undefined;
	}

	public reset(): void {
		this.scale = 1;
		this.translateX = 0;
		this.translateY = 0;
		this.hasInteracted = false;
		this.applyTransform(); // Apply scale first so content size is correct

		// Clear the saved pan/zoom state
		const currentState = this.vscode.getState() || {};
		delete currentState.panZoom;
		this.vscode.setState(currentState);

		// Use requestAnimationFrame to ensure layout is updated before resetting the view
		requestAnimationFrame(() => {
			this.resetView();
		});
	}

	public zoomIn(): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAtPoint(1.25, rect.width / 2, rect.height / 2);
	}

	public zoomOut(): void {
		const rect = this.container.getBoundingClientRect();
		this.zoomAtPoint(0.8, rect.width / 2, rect.height / 2);
	}

	public togglePanMode(): boolean {
		this.panModeEnabled = !this.panModeEnabled;
		this.setCursor(false, false);
		return this.panModeEnabled;
	}

	private zoomAtPoint(factor: number, x: number, y: number): void {
		const minAllowedScale = Math.min(this.minScale, this.fitScale, this.scale);
		const newScale = Math.min(this.maxScale, Math.max(minAllowedScale, this.scale * factor));
		const scaleFactor = newScale / this.scale;
		this.translateX = x - (x - this.translateX) * scaleFactor;
		this.translateY = y - (y - this.translateY) * scaleFactor;
		this.scale = newScale;
		this.applyTransform();
		this.saveState();
	}
}

/**
 * Unpersisted state
 */
interface LocalState {
	readonly mermaidSource: string;
}

interface PersistedState {
	readonly mermaidSource: string;
	readonly panZoom?: PanZoomState;
}

/**
 * Re-renders the mermaid diagram when theme changes
 */
async function rerenderMermaidDiagram(
	diagramElement: HTMLElement,
	diagramText: string,
	themeTracker: VsCodeMermaidThemeTracker,
): Promise<void> {
	diagramElement.textContent = diagramText;
	delete diagramElement.dataset.processed;

	mermaid.initialize(buildMermaidConfig(loadExtensionConfig(), themeTracker));
	await mermaid.run({
		nodes: [diagramElement]
	});
}

export async function initializeMermaidWebview(vscode: VsCodeApi, options?: PanZoomOptions): Promise<PanZoomHandler | undefined> {
	const diagram = document.querySelector<HTMLElement>('.mermaid');
	if (!diagram) {
		return;
	}

	// Capture diagram state
	const diagramText = diagram.textContent ?? '';
	const themeTracker = new VsCodeMermaidThemeTracker();
	const state: LocalState = {
		mermaidSource: diagramText,
	};

	// Save the mermaid source in the webview state
	const currentState: PersistedState = vscode.getState() || {};
	vscode.setState({
		...currentState,
		mermaidSource: diagramText
	});

	// Wrap the diagram for pan/zoom support
	const wrapper = document.createElement('div');
	wrapper.className = 'mermaid-wrapper';
	wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';

	const content = document.createElement('div');
	content.className = 'mermaid-content';

	// Move the diagram into the content wrapper
	diagram.parentNode?.insertBefore(wrapper, diagram);
	content.appendChild(diagram);
	wrapper.appendChild(content);

	// Run mermaid using the selected VS Code-themed config
	const config: MermaidConfig = buildMermaidConfig(loadExtensionConfig(), themeTracker);
	mermaid.initialize(config);
	try {
		await mermaid.run({ nodes: [diagram] });
	} catch (err) {
		diagram.replaceChildren(createMermaidErrorElement(err));
		markVsCodeContextAsError(document.body);
		for (const el of document.querySelectorAll<HTMLElement>('.zoom-controls')) {
			el.style.display = 'none';
		}
		diagram.classList.add('rendered');
		return;
	}

	// Show the diagram now that it's rendered
	diagram.classList.add('rendered');

	const panZoomHandler = new PanZoomHandler(wrapper, content, vscode, options);
	panZoomHandler.initialize();

	// Listen for messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;
		if (message.type === 'resetPanZoom') {
			panZoomHandler.reset();
		}
	});

	// Re-render when the active VS Code theme changes. The tracker watches DOM mutations on the
	// body (theme class / data attributes) and the document element (inline CSS variable updates
	// from `workbench.colorCustomizations`), and only fires when the resolved colors actually
	// change.
	themeTracker.onDidChange(() => {
		const diagramNode = document.querySelector('.mermaid');
		if (!(diagramNode instanceof HTMLElement)) {
			return;
		}
		rerenderMermaidDiagram(diagramNode, state.mermaidSource, themeTracker);
	});
	themeTracker.observeDomChanges();

	return panZoomHandler;
}
