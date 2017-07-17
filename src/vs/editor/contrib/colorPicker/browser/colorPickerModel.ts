/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color, RGBA } from "vs/base/common/color";

export class ColorPickerModel {

	public saturationSelection: ISaturationState;
	public originalColor: string;

	private _widget: ColorPickerWidget;
	private _selectedColor: string;
	private _opacity: number;

	public _color: Color;
	public _hue: Color;

	private _colorModel: ColorModel;
	private _colorModelIndex: number;

	constructor() {
		this._colorModelIndex = 0;
		this._opacity = 1;
	}

	public set widget(widget: ColorPickerWidget) {
		this._widget = widget;
	}

	public get widget() {
		return this._widget;
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

	public set hue(color: Color) {
		this._hue = color;

		if (this.widget.body) {
			this.widget.body.fillSaturationBox();
		}
	}

	public get hue(): Color {
		return this._hue;
	}

	public set opacity(opacity: number) {
		this._opacity = opacity;

		if (this._colorModel === ColorModel.Hex) {
			this.colorModel = ColorModel.RGBA;
		}

		const rgba = this._color.toRGBA();
		this.color = Color.fromRGBA(new RGBA(rgba.r, rgba.g, rgba.b, opacity * 255));

		this.widget.header.updatePickedColor();
	}

	public get opacity(): number {
		return this._opacity;
	}

	public set colorModel(model: ColorModel) {
		this._colorModel = model;
		this._colorModelIndex = model;

		if (this._selectedColor) {
			this.color = this._color; // Refresh selected colour string state
		}
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
		if (this._colorModelIndex === ColorModel.Hex && this._opacity !== 1) {
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