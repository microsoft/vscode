/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import mermaid, { MermaidConfig } from 'mermaid';


interface VsCodeApi {
	getState(): any;
	setState(state: any): void;
	postMessage(message: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;


interface PanZoomState {
	scale: number;
	translateX: number;
	translateY: number;
}

class PanZoomHandler {
	private scale = 1;
	private translateX = 0;
	private translateY = 0;

	private isPanning = false;
	private hasDragged = false;
	private startX = 0;
	private startY = 0;

	private readonly minScale = 0.1;
	private readonly maxScale = 5;
	private readonly zoomFactor = 0.002;

	constructor(
		private readonly container: HTMLElement,
		private readonly content: HTMLElement,
		private readonly vscode: VsCodeApi
	) {
		this.container = container;
		this.content = content;
		this.content.style.transformOrigin = '0 0';
		this.container.style.overflow = 'hidden';
		this.container.style.cursor = 'grab';
		this.setupEventListeners();
		this.restoreState();
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
	}

	private handleKeyChange(e: KeyboardEvent): void {
		if ((e.key === 'Alt' || e.key === 'Shift') && !this.isPanning) {
			e.preventDefault();
			if (e.altKey && !e.shiftKey) {
				this.container.style.cursor = 'zoom-in';
			} else if (e.altKey && e.shiftKey) {
				this.container.style.cursor = 'zoom-out';
			} else {
				this.container.style.cursor = 'grab';
			}
		}
	}

	private updateCursorFromModifier(e: MouseEvent): void {
		if (this.isPanning) {
			return;
		}
		if (e.altKey && !e.shiftKey) {
			this.container.style.cursor = 'zoom-in';
		} else if (e.altKey && e.shiftKey) {
			this.container.style.cursor = 'zoom-out';
		} else {
			this.container.style.cursor = 'grab';
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
		// ctrlKey is set by browsers for pinch-to-zoom gestures
		const isPinchZoom = e.ctrlKey;

		if (isPinchZoom || e.altKey) {
			// Pinch gesture or Alt + two-finger drag = zoom
			e.preventDefault();
			e.stopPropagation();

			const rect = this.container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			// Calculate zoom (scroll up = zoom in, scroll down = zoom out)
			const delta = -e.deltaY * this.zoomFactor;
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
		if (e.button !== 0) {
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
			this.container.style.cursor = 'grab';
			this.saveState();
		}
	}

	private applyTransform(): void {
		this.content.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
	}

	private saveState(): void {
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

	private restoreState(): void {
		const state = this.vscode.getState();
		if (state?.panZoom) {
			const panZoom = state.panZoom as PanZoomState;
			this.scale = panZoom.scale ?? 1;
			this.translateX = panZoom.translateX ?? 0;
			this.translateY = panZoom.translateY ?? 0;
			this.applyTransform();
		}
	}

	public reset(): void {
		this.scale = 1;
		this.translateX = 0;
		this.translateY = 0;
		this.applyTransform();
		this.saveState();
	}

	private zoomAtPoint(factor: number, x: number, y: number): void {
		const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
		const scaleFactor = newScale / this.scale;
		this.translateX = x - (x - this.translateX) * scaleFactor;
		this.translateY = y - (y - this.translateY) * scaleFactor;
		this.scale = newScale;
		this.applyTransform();
		this.saveState();
	}
}




function getMermaidTheme() {
	return document.body.classList.contains('vscode-dark') || (document.body.classList.contains('vscode-high-contrast') && !document.body.classList.contains('vscode-high-contrast-light'))
		? 'dark'
		: 'default';
}

type State = {
	readonly diagramText: string;
	readonly theme: 'dark' | 'default';
};

let state: State | undefined = undefined;

async function init() {
	const diagram = document.querySelector('.mermaid');
	if (!diagram || !(diagram instanceof HTMLElement)) {
		return;
	}

	const vscode = acquireVsCodeApi();

	const theme = getMermaidTheme();
	state = {
		diagramText: diagram.textContent ?? '',
		theme
	};

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

	// Run mermaid
	const config: MermaidConfig = {
		startOnLoad: false,
		theme,
	};
	mermaid.initialize(config);

	await mermaid.run({ nodes: [diagram] });
	const panZoomHandler = new PanZoomHandler(wrapper, content, vscode);

	// Listen for messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;
		if (message.type === 'resetPanZoom') {
			panZoomHandler.reset();
		}
	});
}

function tryUpdate() {
	const newTheme = getMermaidTheme();
	if (state?.theme === newTheme) {
		return;
	}

	const diagramNode = document.querySelector('.mermaid');
	if (!diagramNode || !(diagramNode instanceof HTMLElement)) {
		return;
	}

	state = {
		diagramText: state?.diagramText ?? '',
		theme: newTheme
	};

	// Re-render
	diagramNode.textContent = state?.diagramText ?? '';
	delete diagramNode.dataset.processed;

	mermaid.initialize({
		theme: newTheme,
	});
	mermaid.run({
		nodes: [diagramNode]
	});
}

// Update when theme changes
new MutationObserver(() => {
	tryUpdate();
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

init();
