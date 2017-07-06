/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Disposable } from "vs/base/common/lifecycle";
import { ColorPickerModel } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from "vs/base/browser/globalMouseMoveMonitor";
import { isWindows } from "vs/base/common/platform";
const $ = dom.$;
const MOUSE_DRAG_RESET_DISTANCE = 140;

export class ColorPickerBody extends Disposable {
	private domNode: HTMLElement;
	private saturationBox: HTMLElement;
	private hueStrip: HueStrip;
	private slider: HueSlider;
	private opacityStrip: OpacityStrip;

	private saturationCtx: CanvasRenderingContext2D;

	private whiteGradient: CanvasGradient;
	private blackGradient: CanvasGradient;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel, widgetWidth: number) {
		super();

		const pixelRatio = this.widget.editor.getConfiguration().pixelRatio;

		const stripsWidth = 25; //px
		const actualStripsWidth = pixelRatio * 25; //px
		const padding = 8; //px

		const satBoxWidth = widgetWidth - (2 * stripsWidth) - (4 * padding);
		const actualSatBoxWidth = pixelRatio * widgetWidth - (2 * actualStripsWidth) - (4 * padding);
		const satBoxHeight = 150; //px
		const actualSatBoxHeight = pixelRatio * satBoxHeight;

		this.domNode = $('.colorpicker-body');
		this.domNode.style.padding = `${padding}px`;
		dom.append(widget.getDomNode(), this.domNode);

		// Draw saturation selection box
		this.saturationBox = this.drawSaturationBox(satBoxWidth, satBoxHeight, actualSatBoxWidth, actualSatBoxHeight);
		// Draw sliders
		this.drawOpacityStrip(stripsWidth, satBoxHeight, actualStripsWidth, actualSatBoxHeight);
		this.drawHueStrip(stripsWidth, satBoxHeight, actualStripsWidth, actualSatBoxHeight);

		this.registerListeners();
	}

	public fillOpacityGradient(): void {
		this.opacityStrip.gradient.addColorStop(0, this.model.selectedColor);
		this.opacityStrip.context.fillStyle = this.opacityStrip.gradient;
		this.opacityStrip.context.fill();
	}

	public fillSaturationBox(): void {
		this.saturationCtx.fillStyle = this.model.hue ? this.model.hue : this.model.originalColor;
		this.saturationCtx.fill();
		this.saturationCtx.fillStyle = this.whiteGradient;
		this.saturationCtx.fill();
		this.saturationCtx.fillStyle = this.blackGradient;
		this.saturationCtx.fill();

		// Update selected color if saturation selection was beforehand
		if (this.model.saturationSelection) {
			this.model.selectedColor = this.extractColorData(this.saturationCtx, this.model.saturationSelection.x, this.model.saturationSelection.y);
		}
	}

	private registerListeners(): void {
		const monitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		// Saturation box listeners
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_DOWN, e => {
			this.model.dragging = true;
			this.widget.model.selectedColor = this.extractColorData(this.saturationCtx, e.offsetX, e.offsetY);
			this.widget.model.saturationSelection = { x: e.offsetX, y: e.offsetY };
		}));
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_UP, e => {
			this.model.dragging = false;
		}));
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_MOVE, e => {
			if (this.model.dragging) {
				this.widget.model.selectedColor = this.extractColorData(this.saturationCtx, e.offsetX, e.offsetY);
				this.widget.model.saturationSelection = { x: e.offsetX, y: e.offsetY };
			}
		}));

		// Slider listeners
		this._register(dom.addDisposableListener(this.slider.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.hueStripListener(this.slider.domNode, e, monitor);
		}));
		this._register(dom.addDisposableListener(this.hueStrip.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.hueStripListener(this.hueStrip.domNode, e, monitor);
		}));
	}

	private hueStripListener(element: HTMLElement, e: MouseEvent, monitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>): void {
		if (e.button !== 0) {
			return;
		}

		// Update slider position if clicked on huestrip
		if (element === this.hueStrip.domNode) {
			this.slider.top = e.offsetY;
			this.widget.model.hue = this.extractColorData(this.hueStrip.context, 0, this.slider.top);
		}

		const initialMousePosition = e.clientY;
		const initialMouseOrthogonalPosition = e.clientX;
		const initialSliderTop = this.slider.top;
		monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
			// Do not move slider on Windows if it's outside of movable bounds
			const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);
			if (isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
				return;
			}

			const mouseDelta = mouseMoveData.posy - initialMousePosition;
			this.slider.top = initialSliderTop + mouseDelta;

			this.widget.model.hue = this.extractColorData(this.hueStrip.context, 0, this.slider.top);
		}, () => null);
	}

	private drawSaturationBox(w: number, h: number, actualW: number, actualH: number): HTMLCanvasElement {
		// Create canvas, draw selected color
		const canvas = document.createElement('canvas');
		canvas.className = 'saturation-box';
		canvas.width = actualW;
		canvas.height = actualH;
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';

		this.saturationCtx = canvas.getContext('2d');
		this.saturationCtx.rect(0, 0, actualW, actualH);

		// Create black and white gradients on top
		const ctx2 = document.createElement('canvas').getContext('2d');

		this.whiteGradient = ctx2.createLinearGradient(0, 0, actualW, 0);
		this.whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		this.whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		this.blackGradient = ctx2.createLinearGradient(0, 0, 0, actualH);
		this.blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		this.blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');

		this.fillSaturationBox();

		// Append to DOM
		dom.append(this.domNode, canvas);

		return canvas;
	}

	private drawOpacityStrip(w: number, h: number, actualW: number, actualH: number): void {
		// Opacity strip
		const opacityWrapper = $('.opacity-strip-wrap');

		this.opacityStrip = new OpacityStrip(w, h, actualW, actualH, this.model.selectedColor);

		dom.append(this.domNode, opacityWrapper);
		dom.append(opacityWrapper, this.opacityStrip.domNode);
	}

	private drawHueStrip(w: number, h: number, actualW: number, actualH: number): void {
		// Hue strip
		const hueWrapper = $('.hue-strip-wrap');

		this.hueStrip = new HueStrip(w, h, actualW, actualH);
		this.slider = new HueSlider(this.hueStrip);

		dom.append(this.domNode, hueWrapper);
		dom.append(hueWrapper, this.hueStrip.domNode);
		dom.append(hueWrapper, this.slider.domNode);
	}

	private extractColorData(context: CanvasRenderingContext2D, offsetX: number, offsetY: number) {
		const imageData = context.getImageData(offsetX, offsetY, 1, 1);
		const color = `rgba(${imageData.data[0]}, ${imageData.data[1]}, ${imageData.data[2]}, ${imageData.data[3]})`;
		return color;
	}
}

class HueStrip {
	public domNode: HTMLCanvasElement;
	public height: number;

	public context: CanvasRenderingContext2D;

	constructor(width: number, height: number, actualWidth: number, actualHeight: number) {
		this.height = height;

		this.domNode = document.createElement('canvas');
		this.domNode.className = 'hue-strip';
		this.domNode.width = actualWidth;
		this.domNode.height = actualHeight;
		this.domNode.style.width = width + 'px';
		this.domNode.style.height = height + 'px';

		this.context = this.domNode.getContext('2d');
		this.context.rect(0, 0, actualWidth, actualHeight);

		const colorGradient = this.context.createLinearGradient(0, 0, 0, actualHeight);
		colorGradient.addColorStop(0, 'rgba(255, 0, 0, 1)');
		colorGradient.addColorStop(0.17, 'rgba(255, 255, 0, 1)');
		colorGradient.addColorStop(0.34, 'rgba(0, 255, 0, 1)');
		colorGradient.addColorStop(0.51, 'rgba(0, 255, 255, 1)');
		colorGradient.addColorStop(0.68, 'rgba(0, 0, 255, 1)');
		colorGradient.addColorStop(0.85, 'rgba(255, 0, 255, 1)');
		colorGradient.addColorStop(1, 'rgba(255, 0, 0, 1)');

		this.context.fillStyle = colorGradient;
		this.context.fill();
	}
}

class OpacityStrip {
	public domNode: HTMLCanvasElement;
	public height: number;

	public context: CanvasRenderingContext2D;
	public gradient: CanvasGradient;

	constructor(width: number, height: number, actualWidth: number, actualHeight: number, selectedColor: string) {
		this.domNode = document.createElement('canvas');
		this.domNode.className = 'opacity-strip';
		this.domNode.width = actualWidth;
		this.domNode.height = actualHeight;
		this.domNode.style.width = width + 'px';
		this.domNode.style.height = height + 'px';
		this.context = this.domNode.getContext('2d');
		this.context.rect(0, 0, actualWidth, actualHeight);

		this.gradient = this.context.createLinearGradient(0, 0, 0, actualHeight);
		this.gradient.addColorStop(0, selectedColor);
		this.gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		this.context.fillStyle = this.gradient;
		this.context.fill();
	}
}

class HueSlider {
	public domNode: HTMLElement;
	private _top: number;

	constructor(private hueStrip: HueStrip) {
		this.domNode = $('.slider');
		this._top = 0;
	}

	public get top() {
		return this._top;
	}

	// Sets style.top in 'px'
	public set top(top: number) {
		if (top < 0 || top > this.hueStrip.height) {
			return;
		}

		// Account for height of the slider, not overflowing top of the strip
		if (top >= this.domNode.offsetHeight) {
			top -= this.domNode.offsetHeight;
		}

		this.domNode.style.top = top + 'px';
		this._top = top;
	}

}