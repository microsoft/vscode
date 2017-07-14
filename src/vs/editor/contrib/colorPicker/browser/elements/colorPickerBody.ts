/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Disposable } from "vs/base/common/lifecycle";
import { ColorPickerModel, ISaturationState } from "vs/editor/contrib/colorPicker/browser/colorPickerModel";
import { GlobalMouseMoveMonitor, IStandardMouseMoveEventData, standardMouseMoveMerger } from "vs/base/browser/globalMouseMoveMonitor";
import { isWindows } from "vs/base/common/platform";
import { Color, RGBA } from "vs/base/common/color";
const $ = dom.$;
const MOUSE_DRAG_RESET_DISTANCE = 140;

export class ColorPickerBody extends Disposable {
	private domNode: HTMLElement;
	private pixelRatio: number;

	private saturationWrapper: HTMLElement;
	private saturationSelection: HTMLElement;
	private hueStrip: HueStrip;
	private hueSlider: Slider;
	private opacityStrip: OpacityStrip;
	private opacitySlider: Slider;

	private saturationCtx: CanvasRenderingContext2D;

	private whiteGradient: CanvasGradient;
	private blackGradient: CanvasGradient;

	// private saturationSelectionState: { x: number, y: number };

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel, widgetWidth: number) {
		super();

		this.pixelRatio = this.widget.editor.getConfiguration().pixelRatio;

		this.domNode = $('.colorpicker-body');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawSaturationBox();
		this.drawOpacityStrip();
		this.drawHueStrip();

		// this.saturationSelectionState = { x: 0, y: 0 };

		this.registerListeners();
	}

	private registerListeners(): void {
		const monitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());

		// Saturation box listener
		this._register(dom.addDisposableListener(this.saturationWrapper, dom.EventType.MOUSE_DOWN, e => {
			this.saturationListener(e, monitor);
		}));

		// Color strip and slider listeners
		this._register(dom.addDisposableListener(this.hueSlider.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.hueStrip, this.hueSlider.domNode, e, monitor);
		}));
		this._register(dom.addDisposableListener(this.hueStrip.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.hueStrip, this.hueStrip.domNode, e, monitor);
		}));
		this._register(dom.addDisposableListener(this.opacitySlider.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.opacityStrip, this.opacitySlider.domNode, e, monitor);
		}));
		this._register(dom.addDisposableListener(this.opacityStrip.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.opacityStrip, this.opacityStrip.domNode, e, monitor);
		}));
	}

	private saturationListener(e: MouseEvent, monitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>): void {
		if (e.button !== 0) { // Only left click is allowed
			return;
		}
		let newSaturationX, newSaturationY;
		if (e.target !== this.saturationSelection) {
			newSaturationX = e.offsetX;
			newSaturationY = e.offsetY;

			this.widget.model.color = this.extractColor(this.saturationCtx, newSaturationX, newSaturationY);
			this.widget.model.saturationSelection = { x: newSaturationX, y: newSaturationY };
			this.focusSaturationSelection(this.widget.model.saturationSelection);
		} else { // If clicked on the selection circle
			newSaturationX = this.widget.model.saturationSelection.x;
			newSaturationY = this.widget.model.saturationSelection.y;
		}

		const initialMousePosition = e.clientY;
		const initialMouseOrthogonalPosition = e.clientX;
		monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
			// Do not move slider on Windows if it's outside of movable bounds
			const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);
			if (isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
				return;
			}

			const deltaX = mouseMoveData.posx - initialMouseOrthogonalPosition;
			const deltaY = mouseMoveData.posy - initialMousePosition;
			const x = newSaturationX + deltaX;
			const y = newSaturationY + deltaY;

			console.log(`${x},${y}`);
			this.widget.model.color = this.extractColor(this.saturationCtx, x, y);
			this.widget.model.saturationSelection = { x: x, y: y };
			this.focusSaturationSelection(this.widget.model.saturationSelection);
		}, () => null);
	}

	private stripListener(strip: Strip, element: HTMLElement, e: MouseEvent, monitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>): void {
		if (e.button !== 0) { // Only left click is allowed
			return;
		}

		const slider = strip instanceof HueStrip ? this.hueSlider : this.opacitySlider;

		// Update slider position if clicked on a strip itself
		if (element === strip.domNode) {
			slider.top = e.offsetY;

			if (slider === this.hueSlider) {
				this.widget.model.hue = this.extractColor(strip.context, 0, slider.top).toString();
			} else if (slider === this.opacitySlider && slider.top !== 0) {
				this.widget.model.opacity = (strip.height - slider.top) / strip.height;
			}
		}

		const initialMousePosition = e.clientY;
		const initialMouseOrthogonalPosition = e.clientX;
		const initialSliderTop = slider.top;
		monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
			strip.domNode.style.cursor = '-webkit-grabbing';
			// Do not move slider on Windows if it's outside of movable bounds
			const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);
			if (isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
				slider.top = 0;
				if (slider === this.hueSlider) {
					this.widget.model.hue = 'rgb(255, 0, 0)';
				} else if (slider === this.opacitySlider) {
					this.widget.model.opacity = 1;
				}
				return;
			}

			const mouseDelta = mouseMoveData.posy - initialMousePosition;
			slider.top = initialSliderTop + mouseDelta;

			if (slider === this.hueSlider) {
				this.widget.model.hue = this.extractColor(strip.context, 0, slider.top).toString();
			} else if (slider === this.opacitySlider && slider.top !== 0) {
				this.widget.model.opacity = (strip.height - slider.top) / strip.height;
			}
		}, () => {
			strip.domNode.style.cursor = '-webkit-grab';
		});
	}

	public fillOpacityGradient(): void {
		this.opacityStrip.gradient.addColorStop(0, this.model.selectedColorString);
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
			this.model.color = this.extractColor(this.saturationCtx, this.model.saturationSelection.x, this.model.saturationSelection.y);
		}
	}

	private focusSaturationSelection(state: ISaturationState): void {
		this.saturationSelection.style.left = state.x + 'px';
		this.saturationSelection.style.top = state.y + 'px';
	}

	private drawSaturationBox(): void {
		this.saturationWrapper = $('.saturation-wrap');
		dom.append(this.domNode, this.saturationWrapper);

		// Create canvas, draw selected color
		const canvas = document.createElement('canvas');
		canvas.className = 'saturation-box';
		dom.append(this.saturationWrapper, canvas);

		const actualW = canvas.offsetWidth * this.pixelRatio,
			actualH = canvas.offsetHeight * this.pixelRatio;

		canvas.width = actualW;
		canvas.height = actualH;

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

		// Add selection circle
		this.saturationSelection = $('.saturation-selection');
		dom.append(this.saturationWrapper, this.saturationSelection);
	}

	private drawOpacityStrip(): void {
		// Opacity strip
		const opacityWrapper = $('.opacity-strip-wrap');
		const opacityTransparency = $('.opacity-strip-transparency');
		dom.append(this.domNode, opacityWrapper);

		this.opacityStrip = new OpacityStrip(opacityWrapper, this.pixelRatio, this.model.selectedColorString);
		this.opacitySlider = new Slider(this.opacityStrip);

		dom.append(opacityWrapper, opacityTransparency);
		dom.append(opacityWrapper, this.opacitySlider.domNode);
	}

	private drawHueStrip(): void {
		// Hue strip
		const hueWrapper = $('.hue-strip-wrap');
		dom.append(this.domNode, hueWrapper);

		this.hueStrip = new HueStrip(hueWrapper, this.pixelRatio);
		this.hueSlider = new Slider(this.hueStrip);

		dom.append(hueWrapper, this.hueStrip.domNode);
		dom.append(hueWrapper, this.hueSlider.domNode);
	}

	private extractColor(context: CanvasRenderingContext2D, offsetX: number, offsetY: number): Color {
		const imageData = context.getImageData(offsetX * this.pixelRatio, offsetY * this.pixelRatio, 1, 1);
		if (this.model.opacity) {
			return Color.fromRGBA(new RGBA(imageData.data[0], imageData.data[1], imageData.data[2], this.model.opacity * 255));
		}
		return Color.fromRGBA(new RGBA(imageData.data[0], imageData.data[1], imageData.data[2]));
	}
}

class Strip {
	public domNode: HTMLCanvasElement;
	public height: number;

	public context: CanvasRenderingContext2D;

	constructor(parent: HTMLElement, pixelRatio: number) {
		this.domNode = document.createElement('canvas');
		this.domNode.className = 'strip';
		dom.append(parent, this.domNode);

		const actualW = this.domNode.offsetWidth * pixelRatio,
			actualH = this.domNode.offsetHeight * pixelRatio;

		this.domNode.width = actualW;
		this.domNode.height = actualH;

		this.context = this.domNode.getContext('2d');
		this.context.rect(0, 0, actualW, actualH);

		this.height = this.domNode.offsetHeight;
	}
}

class HueStrip extends Strip {

	constructor(parent: HTMLElement, pixelRatio: number) {
		super(parent, pixelRatio);

		const colorGradient = this.context.createLinearGradient(0, 0, 0, this.height * pixelRatio);
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

class OpacityStrip extends Strip {
	public gradient: CanvasGradient;

	constructor(parent: HTMLElement, pixelRatio: number, selectedColor: string) {
		super(parent, pixelRatio);

		this.gradient = this.context.createLinearGradient(0, 0, 0, this.height * pixelRatio);
		this.gradient.addColorStop(0, selectedColor);
		this.gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		this.context.fillStyle = this.gradient;
		this.context.fill();
	}
}

class Slider {
	public domNode: HTMLElement;
	private _top: number;

	constructor(private strip: Strip) {
		this.domNode = $('.slider');
		this._top = 0;
	}

	public get top() {
		return this._top;
	}

	// Sets style.top in 'px'
	public set top(top: number) {
		if (top < 0) {
			top = 0;
		} else if (top > this.strip.height - this.domNode.offsetHeight) {
			top = this.strip.height - this.domNode.offsetHeight;
		}

		this.domNode.style.top = top + 'px';
		this._top = top;
	}
}