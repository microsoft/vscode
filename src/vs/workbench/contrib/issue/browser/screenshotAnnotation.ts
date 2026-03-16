/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getWindow } from '../../../../base/browser/dom.js';
import { Button, unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IScreenshot } from './issueReporterOverlay.js';

const enum AnnotationTool {
	Freehand = 'freehand',
	Rectangle = 'rectangle',
	Arrow = 'arrow',
	Text = 'text',
	Pan = 'pan',
	Crop = 'crop',
}

const COLORS = [
	'#ff3b30', // red
	'#007aff', // blue
	'#34c759', // green
	'#ffcc00', // yellow
	'#000000', // black
	'#ffffff', // white
];

interface DrawAction {
	readonly type: AnnotationTool;
	readonly color: string;
	readonly lineWidth: number;
	readonly points?: { x: number; y: number }[];
	readonly rect?: { x: number; y: number; width: number; height: number };
	readonly arrowStart?: { x: number; y: number };
	readonly arrowEnd?: { x: number; y: number };
	readonly text?: string;
	readonly textPos?: { x: number; y: number };
}

export class ScreenshotAnnotationEditor {

	private readonly disposables = new DisposableStore();
	private readonly _onDidSave = new Emitter<string>();
	readonly onDidSave: Event<string> = this._onDidSave.event;
	private readonly _onDidCancel = new Emitter<void>();
	readonly onDidCancel: Event<void> = this._onDidCancel.event;

	private container!: HTMLElement;
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;

	private activeTool: AnnotationTool = AnnotationTool.Freehand;
	private activeColor: string = COLORS[0];
	private readonly actions: DrawAction[] = [];
	private readonly undoneActions: DrawAction[] = [];
	private currentAction: DrawAction | null = null;
	private isDrawing = false;

	private imageElement: HTMLImageElement | null = null;
	private imageWidth = 0;
	private imageHeight = 0;
	private scale = 1;

	// Pan & zoom
	private panX = 0;
	private panY = 0;
	private isPanning = false;
	private lastPanPoint = { x: 0, y: 0 };

	// Crop
	private cropRect: { x: number; y: number; width: number; height: number } | null = null;
	private hasUserZoomed = false;


	constructor(
		private readonly screenshot: IScreenshot,
		private readonly parentElement: HTMLElement,
	) {
		this.createUI();
		this.loadImage();
	}

	private createUI(): void {
		this.container = append(this.parentElement, $('div.issue-reporter-annotation-overlay'));
		this.container.tabIndex = 0;

		// Toolbar
		const toolbar = append(this.container, $('div.annotation-toolbar'));

		// Tool buttons
		const tools: { tool: AnnotationTool; label: string; icon: string }[] = [
			{ tool: AnnotationTool.Pan, label: localize('pan', "Pan"), icon: '\u270B' },
			{ tool: AnnotationTool.Freehand, label: localize('freehand', "Draw"), icon: '\u270E' },
			{ tool: AnnotationTool.Rectangle, label: localize('rectangle', "Rectangle"), icon: '\u25A1' },
			{ tool: AnnotationTool.Arrow, label: localize('arrow', "Arrow"), icon: '\u2192' },
			{ tool: AnnotationTool.Text, label: localize('text', "Text"), icon: 'T' },
			{ tool: AnnotationTool.Crop, label: localize('crop', "Crop"), icon: '\u2702' },
		];

		const toolButtons: HTMLElement[] = [];
		for (const { tool, label, icon } of tools) {
			const btn = append(toolbar, $('button.tool-btn'));
			btn.textContent = icon;
			btn.title = label;
			btn.setAttribute('aria-label', label);
			if (tool === this.activeTool) {
				btn.classList.add('active');
			}
			toolButtons.push(btn);
			this.disposables.add(addDisposableListener(btn, EventType.CLICK, () => {
				this.activeTool = tool;
				for (const b of toolButtons) {
					b.classList.remove('active');
				}
				btn.classList.add('active');
			}));
		}

		// Separator
		append(toolbar, $('div.toolbar-separator'));

		// Color button — shows current color, click opens popover
		const colorBtn = append(toolbar, $('button.tool-btn.color-btn'));
		colorBtn.title = localize('color', "Color");
		colorBtn.setAttribute('aria-label', localize('color', "Color"));
		const colorIndicator = append(colorBtn, $('div.color-indicator'));
		colorIndicator.style.backgroundColor = this.activeColor;

		// Color popover (hidden by default)
		const colorPopover = append(toolbar, $('div.color-popover'));
		colorPopover.style.display = 'none';

		const swatchElements: HTMLElement[] = [];
		for (const color of COLORS) {
			const swatch = append(colorPopover, $('div.color-swatch'));
			swatch.style.backgroundColor = color;
			if (color === this.activeColor) {
				swatch.classList.add('active');
			}
			swatchElements.push(swatch);
			this.disposables.add(addDisposableListener(swatch, EventType.CLICK, e => {
				e.stopPropagation();
				this.activeColor = color;
				colorIndicator.style.backgroundColor = color;
				for (const s of swatchElements) {
					s.classList.remove('active');
				}
				swatch.classList.add('active');
				colorPopover.style.display = 'none';
			}));
		}

		this.disposables.add(addDisposableListener(colorBtn, EventType.CLICK, e => {
			e.stopPropagation();
			colorPopover.style.display = colorPopover.style.display === 'none' ? 'flex' : 'none';
		}));

		// Close popover on outside click
		this.disposables.add(addDisposableListener(this.container, EventType.CLICK, () => {
			colorPopover.style.display = 'none';
		}));

		// Spacer
		append(toolbar, $('div.toolbar-spacer'));

		// Undo button
		const undoBtn = this.disposables.add(new Button(toolbar, unthemedButtonStyles));
		undoBtn.label = localize('undo', "Undo");
		this.disposables.add(undoBtn.onDidClick(() => this.undo()));

		// Redo button
		const redoBtn = this.disposables.add(new Button(toolbar, unthemedButtonStyles));
		redoBtn.label = localize('redo', "Redo");
		this.disposables.add(redoBtn.onDidClick(() => this.redo()));

		// Separator
		append(toolbar, $('div.toolbar-separator'));

		// Cancel button
		const cancelBtn = this.disposables.add(new Button(toolbar, unthemedButtonStyles));
		cancelBtn.label = localize('cancel', "Cancel");
		this.disposables.add(cancelBtn.onDidClick(() => {
			this._onDidCancel.fire();
			this.dispose();
		}));

		// Save button
		const saveBtn = this.disposables.add(new Button(toolbar, unthemedButtonStyles));
		saveBtn.label = localize('save', "Save");
		this.disposables.add(saveBtn.onDidClick(() => {
			const dataUrl = this.compositeToDataUrl();
			this._onDidSave.fire(dataUrl);
			this.dispose();
		}));

		// Canvas container
		const canvasContainer = append(this.container, $('div.annotation-canvas-container'));
		this.canvas = append(canvasContainer, $('canvas')) as HTMLCanvasElement;
		const ctx = this.canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Failed to get 2D canvas context');
		}
		this.ctx = ctx;

		// Canvas pointer events
		this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_MOVE, e => this.onPointerMove(e)));
		this.disposables.add(addDisposableListener(this.canvas, EventType.POINTER_UP, e => this.onPointerUp(e)));

		// Wheel zoom
		this.disposables.add(addDisposableListener(canvasContainer, EventType.WHEEL, (e: WheelEvent) => {
			e.preventDefault();
			const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
			this.scale = Math.max(0.1, Math.min(5, this.scale * zoomFactor));
			this.hasUserZoomed = true;
			this.sizeCanvas();
			this.redraw();
		}, { passive: false }));

		// Escape key
		this.disposables.add(addDisposableListener(this.container, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this._onDidCancel.fire();
				this.dispose();
			}
		}));
	}

	private loadImage(): void {
		const img = new Image();
		img.onload = () => {
			this.imageElement = img;
			this.imageWidth = img.naturalWidth;
			this.imageHeight = img.naturalHeight;
			this.sizeCanvas();
			this.redraw();
		};
		// Use annotated version if available so we can add more annotations on top
		img.src = this.screenshot.annotatedDataUrl ?? this.screenshot.dataUrl;
	}

	private sizeCanvas(): void {
		const container = this.canvas.parentElement;
		if (!container) {
			return;
		}

		const targetWindow = getWindow(this.canvas);
		const dpr = targetWindow.devicePixelRatio || 1;
		const maxWidth = container.clientWidth - 32;
		const maxHeight = container.clientHeight - 32;

		// Only auto-fit on initial load; respect user zoom after that
		if (!this.hasUserZoomed) {
			const scaleX = maxWidth / this.imageWidth;
			const scaleY = maxHeight / this.imageHeight;
			this.scale = Math.min(scaleX, scaleY, 1);
		}

		const displayWidth = Math.floor(this.imageWidth * this.scale);
		const displayHeight = Math.floor(this.imageHeight * this.scale);

		this.canvas.style.width = `${displayWidth}px`;
		this.canvas.style.height = `${displayHeight}px`;
		this.canvas.width = displayWidth * dpr;
		this.canvas.height = displayHeight * dpr;

		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	private canvasCoords(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) / this.scale,
			y: (e.clientY - rect.top) / this.scale,
		};
	}

	private onPointerDown(e: PointerEvent): void {
		const pos = this.canvasCoords(e);

		// Text tool: don't capture pointer — we need to focus the text input
		if (this.activeTool === AnnotationTool.Text) {
			this.showInlineTextInput(pos);
			return;
		}

		// Pan tool
		if (this.activeTool === AnnotationTool.Pan) {
			this.isPanning = true;
			this.lastPanPoint = { x: e.clientX, y: e.clientY };
			this.canvas.setPointerCapture(e.pointerId);
			this.canvas.style.cursor = 'grabbing';
			return;
		}

		this.isDrawing = true;
		this.canvas.setPointerCapture(e.pointerId);

		switch (this.activeTool) {
			case AnnotationTool.Freehand:
				this.currentAction = {
					type: AnnotationTool.Freehand,
					color: this.activeColor,
					lineWidth: 3,
					points: [pos],
				};
				break;
			case AnnotationTool.Rectangle:
				this.currentAction = {
					type: AnnotationTool.Rectangle,
					color: this.activeColor,
					lineWidth: 2,
					rect: { x: pos.x, y: pos.y, width: 0, height: 0 },
				};
				break;
			case AnnotationTool.Arrow:
				this.currentAction = {
					type: AnnotationTool.Arrow,
					color: this.activeColor,
					lineWidth: 2,
					arrowStart: pos,
					arrowEnd: pos,
				};
				break;
			case AnnotationTool.Crop:
				this.cropRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
				break;
		}
	}

	private onPointerMove(e: PointerEvent): void {
		// Pan
		if (this.isPanning) {
			const dx = e.clientX - this.lastPanPoint.x;
			const dy = e.clientY - this.lastPanPoint.y;
			this.panX += dx;
			this.panY += dy;
			this.lastPanPoint = { x: e.clientX, y: e.clientY };
			this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
			return;
		}

		if (!this.isDrawing) {
			return;
		}

		const pos = this.canvasCoords(e);

		// Crop
		if (this.activeTool === AnnotationTool.Crop && this.cropRect) {
			this.cropRect.width = pos.x - this.cropRect.x;
			this.cropRect.height = pos.y - this.cropRect.y;
			this.redraw();
			return;
		}

		if (!this.currentAction) {
			return;
		}

		switch (this.currentAction.type) {
			case AnnotationTool.Freehand:
				this.currentAction.points!.push(pos);
				break;
			case AnnotationTool.Rectangle: {
				const rect = this.currentAction.rect!;
				// Mutate the rect on the current action (this is the in-progress drawing)
				(this.currentAction as { rect: { x: number; y: number; width: number; height: number } }).rect = {
					...rect,
					width: pos.x - rect.x,
					height: pos.y - rect.y,
				};
				break;
			}
			case AnnotationTool.Arrow:
				(this.currentAction as { arrowEnd: { x: number; y: number } }).arrowEnd = pos;
				break;
		}

		this.redraw();
	}

	private onPointerUp(e: PointerEvent): void {
		// Pan
		if (this.isPanning) {
			this.isPanning = false;
			this.canvas.releasePointerCapture(e.pointerId);
			this.canvas.style.cursor = this.activeTool === AnnotationTool.Pan ? 'grab' : 'crosshair';
			return;
		}

		if (!this.isDrawing) {
			return;
		}
		this.canvas.releasePointerCapture(e.pointerId);
		this.isDrawing = false;

		// Crop: apply crop
		if (this.activeTool === AnnotationTool.Crop && this.cropRect) {
			const cr = this.normalizeCropRect(this.cropRect);
			if (cr.width > 10 && cr.height > 10) {
				this.applyCrop(cr);
			}
			this.cropRect = null;
			this.redraw();
			return;
		}

		if (this.currentAction) {
			this.actions.push(this.currentAction);
			this.undoneActions.length = 0;
			this.currentAction = null;
		}

		this.redraw();
	}

	private undo(): void {
		const action = this.actions.pop();
		if (action) {
			this.undoneActions.push(action);
			this.redraw();
		}
	}

	private redo(): void {
		const action = this.undoneActions.pop();
		if (action) {
			this.actions.push(action);
			this.redraw();
		}
	}

	private normalizeCropRect(r: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
		return {
			x: r.width < 0 ? r.x + r.width : r.x,
			y: r.height < 0 ? r.y + r.height : r.y,
			width: Math.abs(r.width),
			height: Math.abs(r.height),
		};
	}

	private applyCrop(r: { x: number; y: number; width: number; height: number }): void {
		// Composite current state, then crop
		const currentDataUrl = this.compositeToDataUrl();
		const img = new Image();
		img.onload = () => {
			// Crop from the full-resolution image
			const targetWindow = getWindow(this.canvas);
			const cropCanvas = targetWindow.document.createElement('canvas');
			cropCanvas.width = r.width;
			cropCanvas.height = r.height;
			const cropCtx = cropCanvas.getContext('2d')!;
			cropCtx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);

			// Create new image from cropped
			const croppedImg = new Image();
			croppedImg.onload = () => {
				this.imageElement = croppedImg;
				this.imageWidth = croppedImg.naturalWidth;
				this.imageHeight = croppedImg.naturalHeight;
				this.actions.length = 0;
				this.undoneActions.length = 0;
				this.panX = 0;
				this.panY = 0;
				this.canvas.style.transform = '';
				this.sizeCanvas();
				this.redraw();
			};
			croppedImg.src = cropCanvas.toDataURL('image/png');
		};
		img.src = currentDataUrl;
	}

	private showInlineTextInput(pos: { x: number; y: number }): void {
		const canvasContainer = this.canvas.parentElement;
		if (!canvasContainer) {
			console.warn('[IssueReporter] showInlineTextInput: no canvas container');
			return;
		}
		const canvasRect = this.canvas.getBoundingClientRect();
		const containerRect = canvasContainer.getBoundingClientRect();

		const input = canvasContainer.ownerDocument.createElement('input');
		input.type = 'text';
		input.className = 'annotation-text-input';
		const leftPos = canvasRect.left - containerRect.left + pos.x * this.scale;
		const topPos = canvasRect.top - containerRect.top + pos.y * this.scale - 10;
		input.style.left = `${leftPos}px`;
		input.style.top = `${topPos}px`;
		input.style.color = this.activeColor;
		input.style.fontSize = `${Math.max(14, 14 * this.scale)}px`;
		input.placeholder = localize('typeText', "Type text...");
		canvasContainer.appendChild(input);

		console.log(`[IssueReporter] Text input created at (${leftPos}, ${topPos}), color: ${this.activeColor}`);

		// Delay focus to ensure the pointer event is fully handled
		setTimeout(() => {
			input.focus();
			console.log('[IssueReporter] Text input focused, activeElement:', canvasContainer.ownerDocument.activeElement === input);
		}, 50);

		let committed = false;
		const commit = () => {
			if (committed) {
				return;
			}
			committed = true;
			const text = input.value.trim();
			console.log(`[IssueReporter] Text commit: "${text}"`);
			if (text) {
				this.actions.push({
					type: AnnotationTool.Text,
					color: this.activeColor,
					lineWidth: 1,
					text,
					textPos: pos,
				});
				this.undoneActions.length = 0;
				this.redraw();
			}
			input.remove();
		};

		input.addEventListener('keydown', e => {
			e.stopPropagation(); // Prevent Escape from closing the whole editor
			if (e.key === 'Enter') {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				committed = true;
				input.remove();
			}
		});
		input.addEventListener('blur', () => {
			// Small delay to allow click-to-commit on mobile
			setTimeout(() => commit(), 100);
		});
	}

	private redraw(): void {
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

		// Draw background image
		if (this.imageElement) {
			this.ctx.drawImage(this.imageElement, 0, 0, this.imageWidth * this.scale, this.imageHeight * this.scale);
		}

		// Draw all completed annotations
		for (const action of this.actions) {
			this.drawAction(action);
		}

		// Draw current in-progress annotation
		if (this.currentAction) {
			this.drawAction(this.currentAction);
		}

		// Draw crop rect overlay
		if (this.cropRect) {
			const r = this.cropRect;
			this.ctx.save();
			// Dim area outside crop
			this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			this.ctx.fillRect(0, 0, this.canvas.width / (getWindow(this.canvas).devicePixelRatio || 1), this.canvas.height / (getWindow(this.canvas).devicePixelRatio || 1));
			// Clear crop area
			this.ctx.clearRect(r.x * this.scale, r.y * this.scale, r.width * this.scale, r.height * this.scale);
			// Re-draw image in crop area
			if (this.imageElement) {
				this.ctx.save();
				this.ctx.beginPath();
				this.ctx.rect(r.x * this.scale, r.y * this.scale, r.width * this.scale, r.height * this.scale);
				this.ctx.clip();
				this.ctx.drawImage(this.imageElement, 0, 0, this.imageWidth * this.scale, this.imageHeight * this.scale);
				for (const action of this.actions) {
					this.drawAction(action);
				}
				this.ctx.restore();
			}
			// Draw crop border
			this.ctx.strokeStyle = '#007acc';
			this.ctx.lineWidth = 2;
			this.ctx.setLineDash([4, 4]);
			this.ctx.strokeRect(r.x * this.scale, r.y * this.scale, r.width * this.scale, r.height * this.scale);
			this.ctx.setLineDash([]);
			this.ctx.restore();
		}
	}

	private drawAction(action: DrawAction): void {
		this.ctx.save();
		this.ctx.strokeStyle = action.color;
		this.ctx.fillStyle = action.color;
		this.ctx.lineWidth = action.lineWidth;
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';

		switch (action.type) {
			case AnnotationTool.Freehand:
				if (action.points && action.points.length > 0) {
					this.ctx.beginPath();
					this.ctx.moveTo(action.points[0].x * this.scale, action.points[0].y * this.scale);
					for (let i = 1; i < action.points.length; i++) {
						this.ctx.lineTo(action.points[i].x * this.scale, action.points[i].y * this.scale);
					}
					this.ctx.stroke();
				}
				break;

			case AnnotationTool.Rectangle:
				if (action.rect) {
					this.ctx.strokeRect(
						action.rect.x * this.scale,
						action.rect.y * this.scale,
						action.rect.width * this.scale,
						action.rect.height * this.scale,
					);
				}
				break;

			case AnnotationTool.Arrow:
				if (action.arrowStart && action.arrowEnd) {
					this.drawArrow(
						action.arrowStart.x * this.scale,
						action.arrowStart.y * this.scale,
						action.arrowEnd.x * this.scale,
						action.arrowEnd.y * this.scale,
					);
				}
				break;

			case AnnotationTool.Text:
				if (action.text && action.textPos) {
					this.ctx.font = `${14 * this.scale}px var(--vscode-font-family, sans-serif)`;
					this.ctx.fillText(action.text, action.textPos.x * this.scale, action.textPos.y * this.scale);
				}
				break;
		}

		this.ctx.restore();
	}

	private drawArrow(fromX: number, fromY: number, toX: number, toY: number): void {
		const headLength = 12;
		const angle = Math.atan2(toY - fromY, toX - fromX);

		this.ctx.beginPath();
		this.ctx.moveTo(fromX, fromY);
		this.ctx.lineTo(toX, toY);
		this.ctx.stroke();

		// Arrowhead
		this.ctx.beginPath();
		this.ctx.moveTo(toX, toY);
		this.ctx.lineTo(
			toX - headLength * Math.cos(angle - Math.PI / 6),
			toY - headLength * Math.sin(angle - Math.PI / 6),
		);
		this.ctx.lineTo(
			toX - headLength * Math.cos(angle + Math.PI / 6),
			toY - headLength * Math.sin(angle + Math.PI / 6),
		);
		this.ctx.closePath();
		this.ctx.fill();
	}

	private compositeToDataUrl(): string {
		// Create a final canvas at full resolution
		const targetWindow = getWindow(this.canvas);
		const finalCanvas = targetWindow.document.createElement('canvas');
		finalCanvas.width = this.imageWidth;
		finalCanvas.height = this.imageHeight;
		const ctx = finalCanvas.getContext('2d')!;

		// Draw background image
		if (this.imageElement) {
			ctx.drawImage(this.imageElement, 0, 0, this.imageWidth, this.imageHeight);
		}

		// Replay annotations at full resolution
		const savedScale = this.scale;
		this.scale = 1;
		const savedCtx = this.ctx;
		this.ctx = ctx;

		for (const action of this.actions) {
			this.drawAction(action);
		}

		this.ctx = savedCtx;
		this.scale = savedScale;

		return finalCanvas.toDataURL('image/png');
	}

	dispose(): void {
		this.container.remove();
		this.disposables.dispose();
		this._onDidSave.dispose();
		this._onDidCancel.dispose();
	}
}
