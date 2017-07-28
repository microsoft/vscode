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
	private _hue: Color;

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
		this.saturation = this._color.getSaturation();
		this.value = this._color.getValue();
		this._colorRange = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
	}

	public set color(color: Color) {
		this._color = color;

		if (!this._hue) {
			this._hue = color;
		}

		const alpha = this.color.toRGBA().a;
		if (!this._opacity) {
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
}

export class ISaturationState {
	public x: number;
	public y: number;
}