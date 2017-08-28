/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { IColorFormatter } from 'vs/editor/common/modes';

function canFormat(formatter: IColorFormatter, color: Color): boolean {
	return color.isOpaque() || formatter.supportsTransparency;
}

export class ColorPickerModel {

	readonly originalColor: Color;
	private _color: Color;

	get color(): Color {
		return this._color;
	}

	set color(color: Color) {
		if (this._color.equals(color)) {
			return;
		}

		this._color = color;
		this._checkFormat();
		this._onDidChangeColor.fire(color);
	}

	get formatter(): IColorFormatter { return this.formatters[this.formatterIndex]; }

	readonly formatters: IColorFormatter[];

	private _onColorFlushed = new Emitter<Color>();
	readonly onColorFlushed: Event<Color> = this._onColorFlushed.event;

	private _onDidChangeColor = new Emitter<Color>();
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	private _onDidChangeFormatter = new Emitter<IColorFormatter>();
	readonly onDidChangeFormatter: Event<IColorFormatter> = this._onDidChangeFormatter.event;

	constructor(color: Color, availableFormatters: IColorFormatter[], private formatterIndex: number) {
		if (availableFormatters.length === 0) {
			throw new Error('Color picker needs formats');
		}

		if (formatterIndex < 0 || formatterIndex >= availableFormatters.length) {
			throw new Error('Formatter index out of bounds');
		}

		this.originalColor = color;
		this.formatters = availableFormatters;
		this._color = color;
	}

	selectNextColorFormat(): void {
		const oldFomatterIndex = this.formatterIndex;
		this._checkFormat((this.formatterIndex + 1) % this.formatters.length);
		if (oldFomatterIndex !== this.formatterIndex) {
			this.flushColor();
		}
	}

	flushColor(): void {
		this._onColorFlushed.fire(this._color);
	}

	private _checkFormat(start = this.formatterIndex): void {
		let isNewFormat = this.formatterIndex !== start;
		this.formatterIndex = start;

		while (!canFormat(this.formatter, this._color)) {
			this.formatterIndex = (this.formatterIndex + 1) % this.formatters.length;

			if (this.formatterIndex === start) {
				return;
			}
		}

		if (isNewFormat) {
			this._onDidChangeFormatter.fire(this.formatter);
		}
	}
}
