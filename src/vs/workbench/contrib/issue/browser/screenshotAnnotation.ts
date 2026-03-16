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
			{ tool: AnnotationTool.Freehand, label: localize('freehand', "Draw"), icon: '\u270E' },
			{ tool: AnnotationTool.Rectangle, label: localize('rectangle', "Rectangle"), icon: '\u25A1' },
			{ tool: AnnotationTool.Arrow, label: localize('arrow', "Arrow"), icon: '\u2192' },
			{ tool: AnnotationTool.Text, label: localize('text', "Text"), icon: 'T' },
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

		// Color swatches
		const swatchElements: HTMLElement[] = [];
		for (const color of COLORS) {
			const swatch = append(toolbar, $('div.color-swatch'));
			swatch.style.backgroundColor = color;
			swatch.title = color;
			if (color === this.activeColor) {
				swatch.classList.add('active');
			}
			swatchElements.push(swatch);
			this.disposables.add(addDisposableListener(swatch, EventType.CLICK, () => {
				this.activeColor = color;
				for (const s of swatchElements) {
					s.classList.remove('active');
				}
				swatch.classList.add('active');
			}));
		}

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

		// Fit the image within the available space
		const scaleX = maxWidth / this.imageWidth;
		const scaleY = maxHeight / this.imageHeight;
		this.scale = Math.min(scaleX, scaleY, 1);

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
		}
	}

	private onPointerMove(e: PointerEvent): void {
		if (!this.isDrawing || !this.currentAction) {
			return;
		}

		const pos = this.canvasCoords(e);

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
		if (!this.isDrawing) {
			return;
		}
		this.canvas.releasePointerCapture(e.pointerId);
		this.isDrawing = false;

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

	private showInlineTextInput(pos: { x: number; y: number }): void {
		const canvasContainer = this.canvas.parentElement;
		if (!canvasContainer) {
			return;
		}
		const canvasRect = this.canvas.getBoundingClientRect();
		const containerRect = canvasContainer.getBoundingClientRect();

		const input = canvasContainer.ownerDocument.createElement('input');
		input.type = 'text';
		input.className = 'annotation-text-input';
		input.style.left = `${canvasRect.left - containerRect.left + pos.x * this.scale}px`;
		input.style.top = `${canvasRect.top - containerRect.top + pos.y * this.scale - 10}px`;
		input.style.color = this.activeColor;
		input.style.fontSize = `${Math.max(14, 14 * this.scale)}px`;
		input.placeholder = localize('typeText', "Type text...");
		canvasContainer.appendChild(input);
		input.focus();

		let committed = false;
		const commit = () => {
			if (committed) {
				return;
			}
			committed = true;
			const text = input.value.trim();
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
			if (e.key === 'Enter') {
				e.preventDefault();
				commit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				committed = true;
				input.remove();
			}
		});
		input.addEventListener('blur', () => commit());
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
