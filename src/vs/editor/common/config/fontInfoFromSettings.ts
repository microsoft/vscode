/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorOption, EditorOptions } from './editorOptions.js';
import { IValidatedEditorOptions, BareFontInfo } from './fontInfo.js';

export function createBareFontInfoFromValidatedSettings(options: IValidatedEditorOptions, pixelRatio: number, ignoreEditorZoom: boolean): BareFontInfo {
	const fontFamily = options.get(EditorOption.fontFamily);
	const fontWeight = options.get(EditorOption.fontWeight);
	const fontSize = options.get(EditorOption.fontSize);
	const fontFeatureSettings = options.get(EditorOption.fontLigatures);
	const fontVariationSettings = options.get(EditorOption.fontVariations);
	const lineHeight = options.get(EditorOption.lineHeight);
	const letterSpacing = options.get(EditorOption.letterSpacing);
	return BareFontInfo._create(fontFamily, fontWeight, fontSize, fontFeatureSettings, fontVariationSettings, lineHeight, letterSpacing, pixelRatio, ignoreEditorZoom);
}

export function createBareFontInfoFromRawSettings(opts: {
	fontFamily?: unknown;
	fontWeight?: unknown;
	fontSize?: unknown;
	fontLigatures?: unknown;
	fontVariations?: unknown;
	lineHeight?: unknown;
	letterSpacing?: unknown;
}, pixelRatio: number, ignoreEditorZoom: boolean = false): BareFontInfo {
	const fontFamily = EditorOptions.fontFamily.validate(opts.fontFamily);
	const fontWeight = EditorOptions.fontWeight.validate(opts.fontWeight);
	const fontSize = EditorOptions.fontSize.validate(opts.fontSize);
	const fontFeatureSettings = EditorOptions.fontLigatures2.validate(opts.fontLigatures);
	const fontVariationSettings = EditorOptions.fontVariations.validate(opts.fontVariations);
	const lineHeight = EditorOptions.lineHeight.validate(opts.lineHeight);
	const letterSpacing = EditorOptions.letterSpacing.validate(opts.letterSpacing);
	return BareFontInfo._create(fontFamily, fontWeight, fontSize, fontFeatureSettings, fontVariationSettings, lineHeight, letterSpacing, pixelRatio, ignoreEditorZoom);
}
