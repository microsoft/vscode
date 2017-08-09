/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color, RGBA } from "vs/base/common/color";
import { ColorFormatter } from "vs/editor/contrib/colorPicker/common/colorFormatter";
import { IModel } from "vs/editor/common/editorCommon";
import { Range, IRange } from "vs/editor/common/core/range";

export type AdvancedColorPickerFormatter = { opaqueFormatter: ColorFormatter; transparentFormatter: ColorFormatter; };
export type ColorPickerFormatter = ColorFormatter | AdvancedColorPickerFormatter;

export function isAdvancedFormatter(formatter: ColorPickerFormatter): formatter is AdvancedColorPickerFormatter {
	return !!(formatter as any).transparentFormatter;
}

export class ColorPickerModel {
	public widget: ColorPickerWidget;

	public saturationSelection: ISaturationState;
	public originalColor: string;
	public colorFormatters: ColorPickerFormatter[];
	public saturation: number; // [0-1]
	public value: number; // [0-1]

	private _color: Color;
	private _selectedColor: string;
	private _opacity: number;
	private _hue: number;

	private _opaqueFormatter: ColorFormatter;
	private _transparentFormatter: ColorFormatter;

	private _colorRange: Range;
	private _colorModelIndex: number;

	constructor(
		originalColor: string, color: Color,
		opaqueFormatter: ColorFormatter, transparentFormatter: ColorFormatter,
		availableFormatters: ColorFormatter[],
		private editorModel: IModel,
		range: IRange
	) {
		this.colorFormatters = [];
		this._colorModelIndex = 0;

		this.originalColor = originalColor;
		this._opaqueFormatter = opaqueFormatter;
		this.colorFormatters = availableFormatters;
		this.color = color;
		this.hue = color.hsla.h;
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;
		this._colorRange = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
	}

	public set color(color: Color) {
		this._color = color;

		const alpha = color.rgba.a;
		if (!this._opacity) {
			this._opacity = alpha / 255;
		}
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;

		if (this._opacity === 1) {
			this.selectedColorString = this._opaqueFormatter.toString(this._color);
		} else if (this._transparentFormatter) {
			this.selectedColorString = this._transparentFormatter.toString(this._color);
		} else { //no transparent formatter defined for this mode. select another
			this.nextColorMode();
		}
	}

	public get color(): Color {
		return this._color;
	}

	public set selectedColorString(colorString: string) {
		if (this._selectedColor === colorString) {
			return;
		}
		this._selectedColor = colorString;

		if (this.widget && this.widget.header && this.widget.body) {
			this.widget.header.updatePickedColor();
			this.widget.body.fillOpacityOverlay(this._color);

			this.editorModel.pushEditOperations([], [{
				identifier: null,
				range: this._colorRange,
				text: colorString,
				forceMoveMarkers: false
			}], () => []);

			this._colorRange = this._colorRange.setEndPosition(this._colorRange.endLineNumber, this._colorRange.startColumn + colorString.length);
		}
	}

	public get selectedColorString() {
		return this._selectedColor;
	}

	public set hue(hue: number) {
		this._hue = hue;
		if (this.widget && this.widget.body) {
			this.widget.body.saturationBox.fillSaturationBox();
		}
	}

	public get hue(): number {
		return this._hue;
	}

	public set opacity(opacity: number) {
		this._opacity = opacity;

		const rgba = this._color.rgba;
		this.color = new Color(new RGBA(rgba.r, rgba.g, rgba.b, opacity * 255));

		if (this.widget.header) {
			this.widget.header.updatePickedColor();
		}
	}

	public get opacity(): number {
		return this._opacity;
	}

	public nextColorMode() {
		this._colorModelIndex++;
		if (this._colorModelIndex === this.colorFormatters.length) {
			this._colorModelIndex = 0;
		}

		const formatter = this.colorFormatters[this._colorModelIndex];
		if (isAdvancedFormatter(formatter)) {
			this._transparentFormatter = formatter.transparentFormatter;
			this._opaqueFormatter = formatter.opaqueFormatter;
			this.selectedColorString = this._opacity === 1 ? this._opaqueFormatter.toString(this._color) : this._transparentFormatter.toString(this._color);
		} else if (!this._transparentFormatter || this._opacity === 1) {
			this._transparentFormatter = null;
			this._opaqueFormatter = formatter;
			this.selectedColorString = this._opaqueFormatter.toString(this._color);
		} else {
			this.nextColorMode();
		}
	}

	public getHueColor(hue: number): Color {
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

		return new Color(new RGBA(r, g, b));
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}