/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { Color } from 'vs/base/common/color';
import { IColorFormatter } from 'vs/editor/common/modes';
import { HexFormatter, HSLFormatter, RGBFormatter } from '../common/colorFormatter';

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

	constructor(color: Color, private formatterIndex: number) {
		this.originalColor = color;
		this._color = color;
		this.formatters = [
			new RGBFormatter(),
			new HexFormatter(),
			new HSLFormatter()
		];
	}

	selectNextColorFormat(): void {
		this.formatterIndex = (this.formatterIndex + 1) % this.formatters.length;
		this.flushColor();
		this._onDidChangeFormatter.fire(this.formatter);
	}

	guessColorFormat(color: Color, originalText: string): void {
		for (let i = 0; i < this.formatters.length; i++) {
			if (originalText === this.formatters[i].format(color)) {
				this.formatterIndex = i;
				break;
			}
		}
	}

	flushColor(): void {
		this._onColorFlushed.fire(this._color);
	}
}
