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
	public saturationBox: SaturationBox;

	private domNode: HTMLElement;
	private pixelRatio: number;

	private hueSlider: Slider;
	private opacitySlider: Slider;
	private hueStrip: HTMLElement;
	private opacityStrip: HTMLElement;
	private opacityOverlay: HTMLElement;

	constructor(private widget: ColorPickerWidget, private model: ColorPickerModel) {
		super();

		this.pixelRatio = this.widget.editor.getConfiguration().pixelRatio;

		this.domNode = $('.colorpicker-body');
		dom.append(widget.getDomNode(), this.domNode);

		this.drawSaturationBox();
		this.drawOpacityStrip();
		this.drawHueStrip();

		this.registerListeners();
	}

	public fillOpacityOverlay(color: Color): void {
		const c = color.toRGBA();
		const r = c.r;
		const g = c.g;
		const b = c.b;

		this.opacityOverlay.style.background = `linear-gradient(to bottom, rgba(${r}, ${g}, ${b}, 1) 0%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
	}

	private registerListeners(): void {
		const monitor = this._register(new GlobalMouseMoveMonitor<IStandardMouseMoveEventData>());

		// Saturation box listener
		this._register(dom.addDisposableListener(this.saturationBox.domNode, dom.EventType.MOUSE_DOWN, e => {
			this.saturationListener(e, monitor);
		}));

		// Hue and opacity strips listener
		this._register(dom.addDisposableListener(this.hueStrip, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.hueStrip, e, monitor);
		}));
		this._register(dom.addDisposableListener(this.opacityStrip, dom.EventType.MOUSE_DOWN, e => {
			this.stripListener(this.opacityStrip, e, monitor);
		}));
	}

	private saturationListener(e: MouseEvent, monitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>): void {
		if (e.button !== 0) { // Only left click is allowed
			return;
		}

		const updateModel = (x: number, y: number) => {
			const saturationRGBA = this.saturationBox.extractColor(x, y).toRGBA();
			this.widget.model.color = Color.fromRGBA(new RGBA(saturationRGBA.r, saturationRGBA.g, saturationRGBA.b, this.widget.model.opacity * 255)); // TODO@Michel store opacity in [0-255] instead
			this.saturationBox.focusSaturationSelection({ x: x, y: y });
		};

		let newSaturationX, newSaturationY;
		if (e.target !== this.saturationBox.saturationSelection) {
			newSaturationX = e.offsetX;
			newSaturationY = e.offsetY;
			updateModel(newSaturationX, newSaturationY);
		} else { // If clicked on the selection circle
			newSaturationX = this.widget.model.saturationSelection.x;
			newSaturationY = this.widget.model.saturationSelection.y;
		}

		const initialMousePosition = e.clientY;
		const initialMouseOrthogonalPosition = e.clientX;
		monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
			const deltaX = mouseMoveData.posx - initialMouseOrthogonalPosition;
			const deltaY = mouseMoveData.posy - initialMousePosition;
			const x = newSaturationX + deltaX;
			const y = newSaturationY + deltaY;
			updateModel(x, y);
		}, () => null);
	}

	private stripListener(element: HTMLElement, e: MouseEvent, monitor: GlobalMouseMoveMonitor<IStandardMouseMoveEventData>) {
		if (e.button !== 0) { // Only left click is allowed
			return;
		}
		const slider = element === this.hueStrip ? this.hueSlider : this.opacitySlider;
		const strip = element === this.hueStrip ? this.hueStrip : this.opacityStrip;

		// Update slider position if clicked on a strip itself
		if (e.target === this.hueStrip || e.target === this.opacityStrip) {
			slider.top = e.offsetY;
		}

		const updateModel = () => {
			if (slider === this.hueSlider) {
				this.widget.model.hue = this.calculateSliderHue(slider);
			} else if (slider === this.opacitySlider) {
				this.widget.model.opacity = this.calculateOpacity(slider);
			}
		};
		updateModel();

		const initialMousePosition = e.clientY;
		const initialMouseOrthogonalPosition = e.clientX;
		const initialSliderTop = slider.top;
		monitor.startMonitoring(standardMouseMoveMerger, (mouseMoveData: IStandardMouseMoveEventData) => {
			strip.style.cursor = '-webkit-grabbing';
			// Do not move slider on Windows if it's outside of movable bounds
			const mouseOrthogonalDelta = Math.abs(mouseMoveData.posx - initialMouseOrthogonalPosition);
			if (isWindows && mouseOrthogonalDelta > MOUSE_DRAG_RESET_DISTANCE) {
				slider.top = 0;
				if (slider === this.hueSlider) {
					this.widget.model.hue = 0;
				} else if (slider === this.opacitySlider) {
					this.widget.model.opacity = 1;
				}
				return;
			}

			const mouseDelta = mouseMoveData.posy - initialMousePosition;
			slider.top = initialSliderTop + mouseDelta;
			updateModel();
		}, () => {
			strip.style.cursor = '-webkit-grab';
		});
	}

	private drawSaturationBox(): void {
		this.saturationBox = new SaturationBox(this.model, this.domNode, this.pixelRatio);
	}

	private drawOpacityStrip(): void {
		this.opacityStrip = $('.strip.opacity-strip');
		dom.append(this.domNode, this.opacityStrip);
		this.opacityOverlay = $('.opacity-overlay');
		this.fillOpacityOverlay(this.model.color);
		dom.append(this.opacityStrip, this.opacityOverlay);

		this.opacitySlider = new Slider(this.opacityStrip);
		this.opacitySlider.top = this.model.opacity === 1 ? 0 : this.opacityStrip.offsetHeight * (1 - this.model.opacity);
		dom.append(this.opacityStrip, this.opacitySlider.domNode);
	}

	private drawHueStrip(): void {
		this.hueStrip = $('.strip.hue-strip');
		dom.append(this.domNode, this.hueStrip);

		this.hueSlider = new Slider(this.hueStrip);
		dom.append(this.hueStrip, this.hueSlider.domNode);
		this.hueSlider.top = (this.hueStrip.offsetHeight - this.hueSlider.domNode.offsetHeight) * (this.model.color.getHue() / 359);
	}

	private calculateSliderHue(slider: Slider): number {
		const hueNormalizedHeight = this.hueStrip.offsetHeight - slider.domNode.offsetHeight;
		return (1 - ((hueNormalizedHeight - slider.top) / hueNormalizedHeight)) * 359;
	}

	private calculateOpacity(slider: Slider): number {
		const opacityNormalizedHeight = this.opacityStrip.offsetHeight - slider.domNode.offsetHeight;
		return (opacityNormalizedHeight - slider.top) / opacityNormalizedHeight;
	}

}

export class SaturationBox {
	public domNode: HTMLElement;
	public saturationSelection: HTMLElement;

	private saturationCanvas: HTMLCanvasElement;
	private saturationCtx: CanvasRenderingContext2D;

	private whiteGradient: CanvasGradient;
	private blackGradient: CanvasGradient;

	constructor(private model: ColorPickerModel, widgetNode: HTMLElement, private pixelRatio: number) {
		this.domNode = $('.saturation-wrap');
		dom.append(widgetNode, this.domNode);

		// Create canvas, draw selected color
		this.saturationCanvas = document.createElement('canvas');
		this.saturationCanvas.className = 'saturation-box';
		dom.append(this.domNode, this.saturationCanvas);

		// Add selection circle
		this.saturationSelection = $('.saturation-selection');
		dom.append(this.domNode, this.saturationSelection);
	}

	public layout(): void {
		const actualW = this.domNode.offsetWidth * this.pixelRatio,
			actualH = this.domNode.offsetHeight * this.pixelRatio;

		this.saturationCanvas.width = actualW;
		this.saturationCanvas.height = actualH;

		this.saturationCtx = this.saturationCanvas.getContext('2d');
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

		const saturation = this.model.saturation * this.saturationCanvas.clientWidth;
		const selectionHeight = this.model.value * this.saturationCanvas.clientHeight;
		const value = selectionHeight === 0 ? this.saturationCanvas.clientHeight : this.saturationCanvas.clientHeight - selectionHeight;
		this.focusSaturationSelection({ x: saturation, y: value });
	}

	public fillSaturationBox(): void {
		this.saturationCtx.fillStyle = this.calculateHueColor(this.model.hue).toString();
		this.saturationCtx.fill();
		this.saturationCtx.fillStyle = this.whiteGradient;
		this.saturationCtx.fill();
		this.saturationCtx.fillStyle = this.blackGradient;
		this.saturationCtx.fill();

		// Update selected color if saturation selection was beforehand
		if (this.model.saturationSelection) {
			const newColor = Color.fromHSV(this.model.hue, this.model.saturation, this.model.value, this.model.opacity * 255);
			this.model.color = newColor;
		}
	}

	public focusSaturationSelection(state: ISaturationState): void {
		let x: number = state.x, y: number = state.y;
		if (x < 0) {
			x = 0;
		} else if (x > this.domNode.offsetWidth) {
			x = this.domNode.offsetWidth;
		}
		if (y < 0) {
			y = 0;
		} else if (y > this.domNode.offsetHeight) {
			y = this.domNode.offsetHeight;
		}

		this.saturationSelection.style.left = x + 'px';
		this.saturationSelection.style.top = y + 'px';
		this.model.saturationSelection = { x: x, y: y };
	}

	public extractColor(offsetX: number, offsetY: number): Color {
		const opacityX = 1 - (offsetX / this.domNode.offsetWidth);
		const opacityY = offsetY / this.domNode.offsetHeight;

		const whiteGradientColor = Color.fromRGBA(new RGBA(255, 255, 255, opacityX * 255));
		const blackGradientColor = Color.fromRGBA(new RGBA(0, 0, 0, opacityY * 255));

		const gradientsMix = blackGradientColor.blend(whiteGradientColor);
		return gradientsMix.blend(this.calculateHueColor(this.model.hue));
	}

	private calculateHueColor(hue: number): Color {
		const hh = hue / 60;
		const X = 1 - Math.abs(hh % 2 - 1);
		let r = 0, g = 0, b = 0;

		if (hh >= 0 && hh < 1) {
			r = 1;
			g = X;
		} else if (hh >= 1 && hh < 2) {
			r = X;
			g = 1;
		} else if (hh >= 2 && hh < 3) {
			g = 1;
			b = X;
		} else if (hh >= 3 && hh < 4) {
			g = X;
			b = 1;
		} else if (hh >= 4 && hh < 5) {
			r = X;
			b = 1;
		} else {
			r = 1;
			b = X;
		}

		r = Math.round(r * 255);
		g = Math.round(g * 255);
		b = Math.round(b * 255);

		return Color.fromRGBA(new RGBA(r, g, b));
	}
}

class Slider {
	public domNode: HTMLElement;
	private _top: number;

	constructor(private strip: HTMLElement) {
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
		} else if (top > this.strip.offsetHeight - this.domNode.offsetHeight) {
			top = this.strip.offsetHeight - this.domNode.offsetHeight;
		}

		this.domNode.style.top = top + 'px';
		this._top = top;
	}
}