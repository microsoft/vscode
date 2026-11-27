/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IColorPresentation } from '../../../common/languages.js';

export function getColorNotation(text: string): string | undefined {
	const trimmed = text.trim().toLowerCase().replace(/^['"`]|['"`]$/g, '');
	if (/^#/.test(trimmed)) {
		return 'hex';
	}
	if (/^rgba?(\s*\(|$)/.test(trimmed)) {
		return 'rgb';
	}
	if (/^hsla?(\s*\(|$)/.test(trimmed)) {
		return 'hsl';
	}
	if (/^hwb(\s*\(|$)/.test(trimmed)) {
		return 'hwb';
	}
	if (/^lab(\s*\(|$)/.test(trimmed)) {
		return 'lab';
	}
	if (/^lch(\s*\(|$)/.test(trimmed)) {
		return 'lch';
	}
	if (/^oklab(\s*\(|$)/.test(trimmed)) {
		return 'oklab';
	}
	if (/^oklch(\s*\(|$)/.test(trimmed)) {
		return 'oklch';
	}
	if (/^color(\s*\(|$)/.test(trimmed)) {
		return 'color';
	}
	return undefined;
}

export class ColorPickerModel extends Disposable {

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

	get presentation(): IColorPresentation { return this.colorPresentations[this.presentationIndex]; }

	private _colorPresentations: IColorPresentation[];

	get colorPresentations(): IColorPresentation[] {
		return this._colorPresentations;
	}

	set colorPresentations(colorPresentations: IColorPresentation[]) {
		this._colorPresentations = colorPresentations;
		if (this.presentationIndex > colorPresentations.length - 1) {
			this.presentationIndex = 0;
		}
		this._onDidChangePresentation.fire(this.presentation);
	}

	private readonly _onColorFlushed = this._register(new Emitter<Color>());
	readonly onColorFlushed: Event<Color> = this._onColorFlushed.event;

	private readonly _onDidChangeColor = this._register(new Emitter<Color>());
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	private readonly _onDidChangePresentation = this._register(new Emitter<IColorPresentation>());
	readonly onDidChangePresentation: Event<IColorPresentation> = this._onDidChangePresentation.event;

	constructor(color: Color, availableColorPresentations: IColorPresentation[], private presentationIndex: number) {
		super();
		this.originalColor = color;
		this._color = color;
		this._colorPresentations = availableColorPresentations;
	}

	selectNextColorPresentation(): void {
		this.presentationIndex = (this.presentationIndex + 1) % this.colorPresentations.length;
		this.flushColor();
		this._onDidChangePresentation.fire(this.presentation);
	}

	guessColorPresentation(color: Color, originalText: string): void {
		let presentationIndex = -1;
		const originalTextClean = originalText.trim().toLowerCase();

		for (let i = 0; i < this.colorPresentations.length; i++) {
			if (originalTextClean === this.colorPresentations[i].label.toLowerCase()) {
				presentationIndex = i;
				break;
			}
		}

		if (presentationIndex === -1) {
			// check which color presentation text has same prefix as original text's prefix
			const originalTextPrefix = originalTextClean.split('(')[0];
			for (let i = 0; i < this.colorPresentations.length; i++) {
				if (this.colorPresentations[i].label.toLowerCase().startsWith(originalTextPrefix)) {
					presentationIndex = i;
					break;
				}
			}
		}

		if (presentationIndex === -1) {
			// check which color presentation matches the color notation (e.g. short hex to hex, hsla to hsl, rgba to rgb)
			const notation = getColorNotation(originalTextClean);
			if (notation) {
				for (let i = 0; i < this.colorPresentations.length; i++) {
					if (getColorNotation(this.colorPresentations[i].label) === notation) {
						presentationIndex = i;
						break;
					}
				}
			}
		}

		if (presentationIndex !== -1 && presentationIndex !== this.presentationIndex) {
			this.presentationIndex = presentationIndex;
			this._onDidChangePresentation.fire(this.presentation);
		}
	}

	flushColor(): void {
		this._onColorFlushed.fire(this._color);
	}
}
