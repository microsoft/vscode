/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IColorPresentation } from 'vs/editor/common/languages';

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

	private readonly _onColorFlushed = new Emitter<Color>();
	readonly onColorFlushed: Event<Color> = this._onColorFlushed.event;

	private readonly _onDidChangeColor = new Emitter<Color>();
	readonly onDidChangeColor: Event<Color> = this._onDidChangeColor.event;

	private readonly _onDidChangePresentation = new Emitter<IColorPresentation>();
	readonly onDidChangePresentation: Event<IColorPresentation> = this._onDidChangePresentation.event;

	constructor(color: Color, availableColorPresentations: IColorPresentation[], private presentationIndex: number) {
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
		for (let i = 0; i < this.colorPresentations.length; i++) {
			if (originalText.toLowerCase() === this.colorPresentations[i].label) {
				presentationIndex = i;
				break;
			}
		}

		if (presentationIndex === -1) {
			// check which color presentation text has same prefix as original text's prefix
			const originalTextPrefix = originalText.split('(')[0].toLowerCase();
			for (let i = 0; i < this.colorPresentations.length; i++) {
				if (this.colorPresentations[i].label.toLowerCase().startsWith(originalTextPrefix)) {
					presentationIndex = i;
					break;
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
