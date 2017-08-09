/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Color, RGBA } from 'vs/base/common/color';
import { IColorFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';
import { IModel } from 'vs/editor/common/editorCommon';
import { Range, IRange } from 'vs/editor/common/core/range';

export class ColorPickerModel {
	public widget: ColorPickerWidget;

	public saturationSelection: ISaturationState;
	public originalColor: Color;
	public formatters: IColorFormatter[];
	public saturation: number; // [0-1]
	public value: number; // [0-1]

	private _color: Color;
	private _selectedColor: string;
	private _opacity: number;
	private _hue: number;

	private _formatter: IColorFormatter;

	private _colorRange: Range;
	private _colorModelIndex: number;

	private _onDidChangeColor = new Emitter<Color>();
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	constructor(
		color: Color,
		formatter: IColorFormatter,
		availableFormatters: IColorFormatter[],
		private editorModel: IModel,
		range: IRange
	) {
		this.formatters = [];
		this._colorModelIndex = 0;

		this.originalColor = color;
		this.formatters = availableFormatters;
		this._formatter = formatter;
		this.color = color;
		this.hue = color.hsla.h;
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;
		this._colorRange = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
	}

	public set color(color: Color) {
		this._color = color;
		this._onDidChangeColor.fire(color);

		const alpha = color.rgba.a;
		if (!this._opacity) {
			this._opacity = alpha / 255;
		}
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;

		if (!this._formatter.canFormatColor(color)) {
			this.nextColorMode();
		} else {
			this.selectedColorString = this._formatter.formatColor(this._color);
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

		if (this.widget && this.widget.body) {
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
	}

	public get opacity(): number {
		return this._opacity;
	}

	public nextColorMode() {
		if (this.formatters.length === 0) {
			return;
		}

		this._colorModelIndex++;

		if (this._colorModelIndex === this.formatters.length) {
			this._colorModelIndex = 0;
		}

		this._formatter = this.formatters[this._colorModelIndex];

		if (!this._formatter.canFormatColor(this._color)) {
			this.nextColorMode();
		} else {
			this.selectedColorString = this._formatter.formatColor(this._color);
		}
	}
}

export class ISaturationState {
	public x: number;
	public y: number;
}