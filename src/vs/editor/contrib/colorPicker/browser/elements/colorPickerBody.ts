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
	private slider: HTMLElement;
	private saturationBox: HTMLElement;

	private saturationCtx: CanvasRenderingContext2D;
	private opacityStripCtx: CanvasRenderingContext2D;

	private opacityGradient: CanvasGradient;

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

	public updateOpacityGradient(): void {
		this.opacityGradient.addColorStop(0, this.model.selectedColor);
		this.opacityStripCtx.fillStyle = this.opacityGradient;
		this.opacityStripCtx.fill();
	}

	private registerListeners(): void {
		const monitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());
		// Saturation box listeners
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_DOWN, e => {
			monitor.startMonitoring(standardMouseMoveMerger,
				(mouseMoveData: IStandardMouseMoveEventData) => {
					this.model.dragging = true;
					const color = this.extractColorData(e);
					this.widget.model.selectedColor = color;
				}, () => null
			);
		}));
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_UP, e => {
			this.model.dragging = false;
		}));
		this._register(dom.addDisposableListener(this.saturationBox, dom.EventType.MOUSE_MOVE, e => {
			if (this.model.dragging) {
				const color = this.extractColorData(e);
				this.widget.model.selectedColor = color;
			}
		}));

		// Slider listeners
		this._register(dom.addDisposableListener(this.slider, dom.EventType.MOUSE_DOWN, e => {
			// Clicked on a slider
			e.preventDefault();
			if (e.leftButton) {
				return;
			}

			//const initialMousePosition = e.posy;
			const initialMouseOrthogonalPosition = e.posx;
			monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
				const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);

				// Change if the
				if (isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
					return;
				}

				//const mouseDelta = mouseMoveData.posy - initialMousePosition;
				// render slider in correct place
			}, () => null);
		}));
		this._register(dom.addDisposableListener(this.slider, dom.EventType.MOUSE_DOWN, e => {
			// Add top
		}));
		this._register(dom.addDisposableListener(this.slider, dom.EventType.MOUSE_UP, e => {
			// Reduce top
		}));
		this._register(dom.addDisposableListener(this.slider, dom.EventType.MOUSE_UP, e => {
			// Reduce top
		}));
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
		this.saturationCtx.fillStyle = this.model.selectedColor;
		this.saturationCtx.fillRect(0, 0, actualW, actualH);

		// Create black and white gradients on top
		const ctx2 = document.createElement('canvas').getContext('2d');

		const whiteGradient = ctx2.createLinearGradient(0, 0, actualW, 0);
		whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		this.saturationCtx.fillStyle = whiteGradient;
		this.saturationCtx.fillRect(0, 0, actualW, actualH);

		const blackGradient = ctx2.createLinearGradient(0, 0, 0, actualH);
		blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
		blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
		this.saturationCtx.fillStyle = blackGradient;
		this.saturationCtx.fillRect(0, 0, actualW, actualH);

		// Append to DOM
		dom.append(this.domNode, canvas);

		return canvas;
	}

	private drawOpacityStrip(w: number, h: number, actualW: number, actualH: number): void {
		// Opacity strip
		const opacityWrapper = $('.opacity-strip-wrap');

		const opacityStrip = document.createElement('canvas');
		opacityStrip.className = 'opacity-strip';
		opacityStrip.width = actualW;
		opacityStrip.height = actualH;
		opacityStrip.style.width = w + 'px';
		opacityStrip.style.height = h + 'px';
		this.opacityStripCtx = opacityStrip.getContext('2d');
		this.opacityStripCtx.rect(0, 0, actualW, actualH);

		this.opacityGradient = this.opacityStripCtx.createLinearGradient(0, 0, 0, actualH);
		this.opacityGradient.addColorStop(0, this.model.selectedColor);
		this.opacityGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		this.opacityStripCtx.fillStyle = this.opacityGradient;
		this.opacityStripCtx.fill();

		dom.append(this.domNode, opacityWrapper);
		dom.append(opacityWrapper, opacityStrip);
	}

	private drawHueStrip(w: number, h: number, actualW: number, actualH: number): void {
		// Hue strip
		const hueWrapper = $('.hue-strip-wrap');

		const hueStrip = document.createElement('canvas');
		hueStrip.className = 'hue-strip';
		hueStrip.width = actualW;
		hueStrip.height = actualH;
		hueStrip.style.width = w + 'px';
		hueStrip.style.height = h + 'px';
		const colorStripCtx = hueStrip.getContext('2d');
		colorStripCtx.rect(0, 0, actualW, actualH);
		const colorGradient = colorStripCtx.createLinearGradient(0, 0, 0, actualH);
		colorGradient.addColorStop(0, 'rgba(255, 0, 0, 1)');
		colorGradient.addColorStop(0.17, 'rgba(255, 255, 0, 1)');
		colorGradient.addColorStop(0.34, 'rgba(0, 255, 0, 1)');
		colorGradient.addColorStop(0.51, 'rgba(0, 255, 255, 1)');
		colorGradient.addColorStop(0.68, 'rgba(0, 0, 255, 1)');
		colorGradient.addColorStop(0.85, 'rgba(255, 0, 255, 1)');
		colorGradient.addColorStop(1, 'rgba(255, 0, 0, 1)');
		colorStripCtx.fillStyle = colorGradient;
		colorStripCtx.fill();

		this.slider = $('.slider');

		dom.append(this.domNode, hueWrapper);
		dom.append(hueWrapper, hueStrip);
		dom.append(hueWrapper, this.slider);
	}

	private extractColorData(e: MouseEvent) {
		const imageData = this.saturationCtx.getImageData(e.offsetX, e.offsetY, 1, 1);
		const color = `rgba(${imageData.data[0]}, ${imageData.data[1]}, ${imageData.data[2]}, ${imageData.data[3]})`;
		return color;
	}
}