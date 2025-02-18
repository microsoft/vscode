/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../colorPicker.css';
import * as dom from '../../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../../base/browser/globalPointerMoveMonitor.js';
import { Color, HSVA } from '../../../../../base/common/color.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ColorPickerModel } from '../colorPickerModel.js';

const $ = dom.$;

export class SaturationBox extends Disposable {

	private readonly _domNode: HTMLElement;
	private readonly selection: HTMLElement;
	private readonly _canvas: HTMLCanvasElement;
	private width!: number;
	private height!: number;

	private monitor: GlobalPointerMoveMonitor | null;
	private readonly _onDidChange = new Emitter<{ s: number; v: number }>();
	readonly onDidChange: Event<{ s: number; v: number }> = this._onDidChange.event;

	private readonly _onColorFlushed = new Emitter<void>();
	readonly onColorFlushed: Event<void> = this._onColorFlushed.event;

	constructor(container: HTMLElement, private readonly model: ColorPickerModel, private pixelRatio: number) {
		super();

		this._domNode = $('.saturation-wrap');
		dom.append(container, this._domNode);

		// Create canvas, draw selected color
		this._canvas = document.createElement('canvas');
		this._canvas.className = 'saturation-box';
		dom.append(this._domNode, this._canvas);

		// Add selection circle
		this.selection = $('.saturation-selection');
		dom.append(this._domNode, this.selection);

		this.layout();

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.POINTER_DOWN, e => this.onPointerDown(e)));
		this._register(this.model.onDidChangeColor(this.onDidChangeColor, this));
		this.monitor = null;
	}

	public get domNode() {
		return this._domNode;
	}

	public get canvas() {
		return this._canvas;
	}

	private onPointerDown(e: PointerEvent): void {
		if (!e.target || !(e.target instanceof Element)) {
			return;
		}
		this.monitor = this._register(new GlobalPointerMoveMonitor());
		const origin = dom.getDomNodePagePosition(this._domNode);

		if (e.target !== this.selection) {
			this.onDidChangePosition(e.offsetX, e.offsetY);
		}

		this.monitor.startMonitoring(e.target, e.pointerId, e.buttons, event => this.onDidChangePosition(event.pageX - origin.left, event.pageY - origin.top), () => null);

		const pointerUpListener = dom.addDisposableListener(e.target.ownerDocument, dom.EventType.POINTER_UP, () => {
			this._onColorFlushed.fire();
			pointerUpListener.dispose();
			if (this.monitor) {
				this.monitor.stopMonitoring(true);
				this.monitor = null;
			}
		}, true);
	}

	private onDidChangePosition(left: number, top: number): void {
		const s = Math.max(0, Math.min(1, left / this.width));
		const v = Math.max(0, Math.min(1, 1 - (top / this.height)));

		this.paintSelection(s, v);
		this._onDidChange.fire({ s, v });
	}

	layout(): void {
		this.width = this._domNode.offsetWidth;
		this.height = this._domNode.offsetHeight;
		this._canvas.width = this.width * this.pixelRatio;
		this._canvas.height = this.height * this.pixelRatio;
		this.paint();

		const hsva = this.model.color.hsva;
		this.paintSelection(hsva.s, hsva.v);
	}

	private paint(): void {
		const hsva = this.model.color.hsva;
		const saturatedColor = new Color(new HSVA(hsva.h, 1, 1, 1));
		const ctx = this._canvas.getContext('2d')!;

		const whiteGradient = ctx.createLinearGradient(0, 0, this._canvas.width, 0);
		whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
		whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		const blackGradient = ctx.createLinearGradient(0, 0, 0, this._canvas.height);
		blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

		ctx.rect(0, 0, this._canvas.width, this._canvas.height);
		ctx.fillStyle = Color.Format.CSS.format(saturatedColor)!;
		ctx.fill();
		ctx.fillStyle = whiteGradient;
		ctx.fill();
		ctx.fillStyle = blackGradient;
		ctx.fill();
	}

	private paintSelection(s: number, v: number): void {
		this.selection.style.left = `${s * this.width}px`;
		this.selection.style.top = `${this.height - v * this.height}px`;
	}

	private onDidChangeColor(color: Color): void {
		if (this.monitor && this.monitor.isMonitoring()) {
			return;
		}
		this.paint();
		const hsva = color.hsva;
		this.paintSelection(hsva.s, hsva.v);
	}
}
