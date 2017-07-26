/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorPickerWidget } from "vs/editor/contrib/colorPicker/browser/colorPickerWidget";
import { Color, RGBA } from "vs/base/common/color";
import { ColorFormatter } from "vs/editor/contrib/colorPicker/common/colorFormatter";

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

	private _color: Color;
	private _selectedColor: string;
	private _opacity: number;
	private _hue: Color;

	private _opaqueFormatter: ColorFormatter;
	private _transparentFormatter: ColorFormatter;

	private _colorModelIndex: number;

	constructor(
		originalColor: string, color: Color,
		opaqueFormatter: ColorFormatter, transparentFormatter: ColorFormatter,
		availableFormatters: ColorFormatter[]
	) {
		this.colorFormatters = [];
		this._colorModelIndex = 0;

		this.originalColor = originalColor;
		this.opaqueFormatter = opaqueFormatter;
		this.transparentFormatter = transparentFormatter;
		this.colorFormatters = availableFormatters;
		this.color = color;
	}

	public set color(color: Color) {
		this._color = color;

		if (!this._hue) {
			this._hue = color;
		}

		const alpha = this.color.toRGBA().a;
		if (!this._opacity && alpha !== 255) {
			this._opacity = alpha / 255;
		}

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

	public set selectedColorString(color: string) {
		this._selectedColor = color;

		if (this.widget && this.widget.header && this.widget.body) {
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

	public set opaqueFormatter(formatter: ColorFormatter) {
		this._opaqueFormatter = formatter;

		if (this._selectedColor) {
			this.color = this._color; // Refresh selected colour string state
		}
	}

	public get opaqueFormatter(): ColorFormatter {
		return this._opaqueFormatter;
	}

	public set transparentFormatter(formatter: ColorFormatter) {
		this._transparentFormatter = formatter;

		if (this._selectedColor) {
			this.color = this._color; // Refresh selected colour string state
		}
	}

	public get transparentFormatter(): ColorFormatter {
		if (this._transparentFormatter) {
			return this._transparentFormatter;
		}

		return this._opaqueFormatter;
	}

	public nextColorMode() {
		this._colorModelIndex++;
		if (this._colorModelIndex === this.colorFormatters.length) {
			this._colorModelIndex = 0;
		}

		const formatter = this.colorFormatters[this._colorModelIndex];
		if (isAdvancedFormatter(formatter)) {
			this.transparentFormatter = formatter.transparentFormatter;
			this.opaqueFormatter = formatter.opaqueFormatter;
		} else if (this._opacity === 1) {
			this.transparentFormatter = null;
			this.opaqueFormatter = formatter;
		} else {
			this.nextColorMode();
		}
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}