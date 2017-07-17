/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color, RGBA } from "vs/base/common/color";

export class ColorPickerModel {

	public saturationSelection: ISaturationState;
	public dragging: boolean;

	private _widget: ColorPickerWidget;
	private _originalColor: string;
	private _selectedColor: string;
	private _hue: string;
	private _opacity: number;

	public _color: Color;

	private _colorModel: ColorModel;
	private _colorModelIndex: number;

	constructor() {
		this.dragging = false;
		this._colorModelIndex = 0;
	}

	public set widget(widget: ColorPickerWidget) {
		this._widget = widget;
	}

	public get widget() {
		return this._widget;
	}

	public set originalColor(color: string) {
		this._originalColor = color;
	}

	public get originalColor(): string {
		return this._originalColor;
	}

	public set color(color: Color) {
		this._color = color;

		if (this._colorModel === ColorModel.RGBA) {
			this.selectedColorString = color.toRGBA().toString();
		} else if (this._colorModel === ColorModel.Hex) {
			this.selectedColorString = color.toRGBHex();
		} else {
			this.selectedColorString = color.toHSLA().toString();
		}
	}

	public get color(): Color {
		return this._color;
	}

	public set selectedColorString(color: string) {
		this._selectedColor = color;

		if (this.widget.header && this.widget.body) {
			this.widget.header.updatePickedColor();
			this.widget.body.fillOpacityOverlay(this._color.toRGBA());
		}
	}

	public get selectedColorString() {
		return this._selectedColor;
	}

	public set hue(color: string) {
		this._hue = color;

		this.widget.body.fillSaturationBox();
	}

	public get hue(): string {
		return this._hue;
	}

	public set opacity(opacity: number) {
		this._opacity = opacity;

		const rgba = this._color.toRGBA();

		this.color = Color.fromRGBA(new RGBA(rgba.r, rgba.g, rgba.b, opacity * 255));
		this.widget.header.updatePickedColor();
	}

	public get opacity(): number {
		return this._opacity;
	}

	public set colorModel(model: ColorModel) {
		this._colorModel = model;
	}

	public get colorModel(): ColorModel {
		return this._colorModel;
	}

	public nextColorModel() { // should go to the controller perhaps
		this._colorModelIndex++;

		if (this._colorModelIndex > 2) {
			this._colorModelIndex = 0;
		}

		// Skip hex model if opacity is set
		if (this._colorModelIndex === ColorModel.Hex && this.opacity !== 1) {
			this.nextColorModel();
			return;
		}

		this._colorModel = this._colorModelIndex;
		if (this._selectedColor) {
			this.color = this._color; // Refresh selected colour string state
		}
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}

export enum ColorModel {
	RGBA,
	Hex,
	HSL
}