/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color, RGBA } from "vs/base/common/color";
import { ColorFormatter } from "vs/editor/contrib/colorPicker/common/colorFormatter";

export class ColorPickerModel {
	public widget: ColorPickerWidget;

	public saturationSelection: ISaturationState;
	public originalColor: string;

	private _color: Color;
	private _selectedColor: string;
	private _opacity: number;
	private _hue: Color;

	private _formatter: ColorFormatter;
	private _colorModelIndex: number;

	constructor() {
		this._colorModelIndex = 0;
		this._opacity = 1;
	}

	public set color(color: Color) {
		this._color = color;

		if (!this._hue) {
			this._hue = color;
		}

		this.selectedColorString = this._formatter.toString(this._color);
	}

	public get color(): Color {
		return this._color;
	}

	public set selectedColorString(color: string) {
		this._selectedColor = color;

		if (this.widget.header && this.widget.body) {
			this.widget.header.updatePickedColor();
			this.widget.body.fillOpacityOverlay(this._color);
		}
	}

	public get selectedColorString() {
		return this._selectedColor;
	}

	public set hue(color: Color) {
		this._hue = color;

		if (this.widget.body) {
			this.widget.body.saturationBox.fillSaturationBox();
		}
	}

	public get hue(): Color {
		return this._hue;
	}

	public set opacity(opacity: number) {
		this._opacity = opacity;

		const rgba = this._color.toRGBA();
		this.color = Color.fromRGBA(new RGBA(rgba.r, rgba.g, rgba.b, opacity * 255));

		if (this.widget.header) {
			this.widget.header.updatePickedColor();
		}
	}

	public get opacity(): number {
		return this._opacity;
	}

	public set formatter(formatter: ColorFormatter) {
		this._formatter = formatter;

		if (this._selectedColor) {
			this.color = this._color; // Refresh selected colour string state
		}
	}

	public get formatter(): ColorFormatter {
		return this._formatter;
	}

	public nextColorModel() { // should go to the controller perhaps
		throw new Error('not implemented');
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}