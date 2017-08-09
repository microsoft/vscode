/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { ColorPickerWidget } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Color, RGBA } from 'vs/base/common/color';
import { IColorFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';

export class ColorPickerModel {

	widget: ColorPickerWidget;
	saturationSelection: ISaturationState;
	originalColor: Color;
	formatters: IColorFormatter[];
	saturation: number; // [0-1]
	value: number; // [0-1]

	private _color: Color;
	private _opacity: number;
	private _hue: number;

	private _formatter: IColorFormatter;
	get formatter(): IColorFormatter { return this._formatter; }

	private formatterIndex: number;

	private _onDidChangeColor = new Emitter<Color>();
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	private _onDidChangeFormatter = new Emitter<IColorFormatter>();
	readonly onDidChangeFormatter: Event<IColorFormatter> = this._onDidChangeFormatter.event;

	constructor(
		color: Color,
		formatter: IColorFormatter,
		availableFormatters: IColorFormatter[]
	) {
		if (availableFormatters.length === 0) {
			throw new Error('Color picker needs formats');
		}

		this.formatterIndex = 0;

		this.originalColor = color;
		this.formatters = availableFormatters;
		this._formatter = formatter;
		this._color = color;
		this.hue = color.hsla.h;
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;
	}

	set color(color: Color) {
		if (this._color.equals(color)) {
			return;
		}

		this._color = color;

		const alpha = color.rgba.a;
		if (!this._opacity) {
			this._opacity = alpha / 255;
		}
		this.saturation = color.hsla.s;
		this.value = color.hsva.v;

		if (!this._formatter.canFormatColor(color)) {
			this.selectNextColorFormat();
		}

		this._onDidChangeColor.fire(color);
	}

	get color(): Color {
		return this._color;
	}

	set hue(hue: number) {
		this._hue = hue;
		if (this.widget && this.widget.body) {
			this.widget.body.saturationBox.fillSaturationBox();
		}
	}

	get hue(): number {
		return this._hue;
	}

	set opacity(opacity: number) {
		this._opacity = opacity;

		const rgba = this._color.rgba;
		this.color = new Color(new RGBA(rgba.r, rgba.g, rgba.b, opacity * 255));
	}

	get opacity(): number {
		return this._opacity;
	}

	selectNextColorFormat(): void {
		this.formatterIndex = (this.formatterIndex + 1) % this.formatters.length;
		this._formatter = this.formatters[this.formatterIndex];

		if (!this._formatter.canFormatColor(this._color)) {
			return this.selectNextColorFormat();
		}

		this._onDidChangeFormatter.fire(this._formatter);
	}
}

export class ISaturationState {
	x: number;
	y: number;
}