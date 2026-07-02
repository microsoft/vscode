/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IColorPresentation } from '../../../common/languages.js';

export class ColorPickerModel extends Disposable {

	readonly originalColor: Color;
	originalPresentationIndex: number;
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
		this.originalPresentationIndex = presentationIndex;
		this._color = color;
		this._colorPresentations = availableColorPresentations;
	}

	revertPresentation(): void {
		if (this.presentationIndex !== this.originalPresentationIndex) {
			this.presentationIndex = this.originalPresentationIndex;
			this._onDidChangePresentation.fire(this.presentation);
		}
	}

	selectNextColorPresentation(): void {
		this.presentationIndex = (this.presentationIndex + 1) % this.colorPresentations.length;
		this.flushColor();
		this._onDidChangePresentation.fire(this.presentation);
	}

	guessColorPresentation(color: Color, originalText: string): void {
		let presentationIndex = this._findExactMatch(originalText);

		if (presentationIndex === -1) {
			presentationIndex = this._findPrefixMatch(originalText);
		}

		if (this._isValidNewPresentationIndex(presentationIndex)) {
			this._applyNewPresentationIndex(presentationIndex);
		}

		this.originalPresentationIndex = this.presentationIndex;
	}

	private _findExactMatch(originalText: string): number {
		return this.colorPresentations.findIndex(p => p.label === originalText.toLowerCase());
	}

	private _findPrefixMatch(originalText: string): number {
		const originalTextPrefix = originalText.split('(')[0].toLowerCase();
		return this.colorPresentations.findIndex(p => p.label.toLowerCase().startsWith(originalTextPrefix));
	}

	private _isValidNewPresentationIndex(presentationIndex: number): boolean {
		return presentationIndex !== -1 && presentationIndex !== this.presentationIndex;
	}

	private _applyNewPresentationIndex(presentationIndex: number): void {
		this.presentationIndex = presentationIndex;
		this._onDidChangePresentation.fire(this.presentation);
	}

	flushColor(): void {
		this._onColorFlushed.fire(this._color);
	}
}
