/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color } from "vs/base/common/color";

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

	public set selectedColorString(color: string) {
		this._selectedColor = color;

		if (this.widget.header) {
			this.widget.header.updatePickedColor(); // update picked colour from box view
			this.widget.body.fillOpacityGradient();  // update opacity gradient based on the color
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

		this.widget.header.updatePickedColor();
	}

	public get opacity(): number {
		return this._opacity;
	}

	public set color(color: Color) {
		if (this._colorModel === ColorModel.RGBA) {
			this.selectedColorString = color.toRGBA().toString();
		} else if (this._colorModel === ColorModel.Hex) {
			this.selectedColorString = color.toRGBHex();
		} else {
			this.selectedColorString = color.toHSLA().toString();
		}

		this._color = color;
	}

	public get color(): Color {
		return this._color;
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