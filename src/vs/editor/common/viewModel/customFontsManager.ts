/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { PixelRatio } from '../../../base/browser/pixelRatio.js';
import { FontMeasurements } from '../../browser/config/fontMeasurements.js';
import { BareFontInfo, FontInfo } from '../config/fontInfo.js';
import { Position } from '../core/position.js';
import { ICustomFontChangeAccessor } from '../viewModel.js';
import { Range } from '../core/range.js';
import { CustomFontEvent } from '../textModelEvents.js';

export class CustomFont {
	constructor(
		private readonly lineHeight: number,
		private readonly fontFamily: string,
		private readonly fontSize: number,
		private readonly fontWeight: string,
		private readonly defaultFontInfo: FontInfo
	) { }

	public getFont(): FontInfo {
		const bareFontInfo = BareFontInfo.createFromRawSettings({
			fontFamily: this.fontFamily,
			fontWeight: this.fontWeight,
			fontSize: this.fontSize,
			lineHeight: this.lineHeight,
			fontLigatures: this.defaultFontInfo.fontFeatureSettings,
			fontVariations: this.defaultFontInfo.fontVariationSettings,
			letterSpacing: this.defaultFontInfo.letterSpacing
		}, PixelRatio.getInstance(getActiveWindow()).value);
		return FontMeasurements.readFontInfo(getActiveWindow(), bareFontInfo);
	}
}

export class CustomFontsManager {
	constructor(private readonly defaultFontInfo: FontInfo) { }

	public changeFonts(callback: (accessor: ICustomFontChangeAccessor) => void): void {
		try {
			const accessor: ICustomFontChangeAccessor = {
				insertOrChangeCustomFonts: (decorationId: string, lineNumber: number, fonts: CustomFontEvent[]): void => {
					this.insertOrChangeCustomFonts(decorationId, lineNumber, fonts);
				},
				removeCustomFonts: (decorationId: string): void => {
					this.removeCustomFonts(decorationId);
				}
			};
			callback(accessor);
		} finally {
			this.commit();
		}
	}

	private insertOrChangeCustomFonts(decorationId: string, lineNumber: number, fonts: CustomFontEvent[]): void {
		// Implementation for inserting or changing custom fonts
	}
	private removeCustomFonts(decorationId: string): void {
		// Implementation for removing custom fonts
	}
	private commit(): void {
		// Implementation for committing changes
	}

	public getFontsOnLine(lineNumber: number): { startCharacterOffset: number; endCharacterOffset: number; fontInfo: CustomFont }[] {
		return [];
	}

	public getFontForPosition(position: Position): CustomFont {
		return new CustomFont(0, '', 0, '', this.defaultFontInfo);
	}

	public hasFontDecorations(range: Range): boolean {
		return false;
	}
}
