/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ICharAtlasConfig } from './Types';
import { IColor, IColorSet } from 'vs/editor/browser/viewParts/lines/webgl/base/Types';

const NULL_COLOR: IColor = {
	css: '',
	rgba: 0
};

export function generateConfig(scaledCellWidth: number, scaledCellHeight: number, scaledCharWidth: number, scaledCharHeight: number, /*terminal: Terminal,*/ colors: IColorSet, devicePixelRatio: number): ICharAtlasConfig {
	// null out some fields that don't matter
	const clonedColors: IColorSet = {
		foreground: colors.foreground,
		background: colors.background,
		cursor: NULL_COLOR,
		cursorAccent: NULL_COLOR,
		selectionForeground: NULL_COLOR,
		selectionBackgroundTransparent: NULL_COLOR,
		selectionBackgroundOpaque: NULL_COLOR,
		selectionInactiveBackgroundTransparent: NULL_COLOR,
		selectionInactiveBackgroundOpaque: NULL_COLOR,
		// For the static char atlas, we only use the first 16 colors, but we need all 256 for the
		// dynamic character atlas.
		ansi: colors.ansi.slice()
	};
	return {
		customGlyphs: false, //terminal.options.customGlyphs,
		devicePixelRatio,
		letterSpacing: 0, //terminal.options.letterSpacing,
		lineHeight: 1, //terminal.options.lineHeight,
		scaledCellWidth,
		scaledCellHeight,
		scaledCharWidth,
		scaledCharHeight,
		fontFamily: 'Hack', //terminal.options.fontFamily,
		fontSize: 12, //terminal.options.fontSize,
		fontWeight: 'normal', //terminal.options.fontWeight,
		fontWeightBold: 'bold', //terminal.options.fontWeightBold,
		allowTransparency: false, //terminal.options.allowTransparency,
		drawBoldTextInBrightColors: false, //terminal.options.drawBoldTextInBrightColors,
		minimumContrastRatio: 1, //terminal.options.minimumContrastRatio,
		colors: clonedColors
	};
}

export function configEquals(a: ICharAtlasConfig, b: ICharAtlasConfig): boolean {
	for (let i = 0; i < a.colors.ansi.length; i++) {
		if (a.colors.ansi[i].rgba !== b.colors.ansi[i].rgba) {
			return false;
		}
	}
	return a.devicePixelRatio === b.devicePixelRatio &&
		a.customGlyphs === b.customGlyphs &&
		a.lineHeight === b.lineHeight &&
		a.letterSpacing === b.letterSpacing &&
		a.fontFamily === b.fontFamily &&
		a.fontSize === b.fontSize &&
		a.fontWeight === b.fontWeight &&
		a.fontWeightBold === b.fontWeightBold &&
		a.allowTransparency === b.allowTransparency &&
		a.scaledCharWidth === b.scaledCharWidth &&
		a.scaledCharHeight === b.scaledCharHeight &&
		a.drawBoldTextInBrightColors === b.drawBoldTextInBrightColors &&
		a.minimumContrastRatio === b.minimumContrastRatio &&
		a.colors.foreground === b.colors.foreground &&
		a.colors.background === b.colors.background;
}

// export function is256Color(colorCode: number): boolean {
// 	return (colorCode & Attributes.CM_MASK) === Attributes.CM_P16 || (colorCode & Attributes.CM_MASK) === Attributes.CM_P256;
// }
