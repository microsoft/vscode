/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { IColorFormatter } from 'vs/editor/contrib/colorPicker/common/colorFormatter';

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

		if (!this._formatter.canFormatColor(color)) {
			this.selectNextColorFormat();
		}

		this._onDidChangeColor.fire(color);
	}

	private _formatter: IColorFormatter;
	get formatter(): IColorFormatter { return this._formatter; }

	private formatterIndex = 0;
	readonly formatters: IColorFormatter[];

	private _onDidChangeColor = new Emitter<Color>();
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	private _onDidChangeFormatter = new Emitter<IColorFormatter>();
	readonly onDidChangeFormatter: Event<IColorFormatter> = this._onDidChangeFormatter.event;

	constructor(color: Color, formatter: IColorFormatter, availableFormatters: IColorFormatter[]) {
		if (availableFormatters.length === 0) {
			throw new Error('Color picker needs formats');
		}

		this.originalColor = color;
		this.formatters = availableFormatters;
		this._formatter = formatter;
		this._color = color;
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
