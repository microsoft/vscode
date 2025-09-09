/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../base/common/color.js';
import { ITokenThemeRule, TokenTheme } from '../../common/languages/supports/tokenization.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IColorTheme, IThemeService } from '../../../platform/theme/common/themeService.js';

export const IStandaloneThemeService = createDecorator<IStandaloneThemeService>('themeService');

export type BuiltinTheme = 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
export type IColors = { [colorId: string]: string };

// System forced color keywords.
// See https://developer.mozilla.org/en-US/docs/Web/CSS/system-color for more details.
export type SystemForcedColor =
	| 'AccentColor'
	| 'AccentColorText'
	| 'ActiveText'
	| 'ButtonBorder'
	| 'ButtonFace'
	| 'ButtonText'
	| 'Canvas'
	| 'CanvasText'
	| 'Field'
	| 'FieldText'
	| 'GrayText'
	| 'Highlight'
	| 'HighlightText'
	| 'LinkText'
	| 'Mark'
	| 'MarkText'
	| 'SelectedItem'
	| 'SelectedItemText'
	| 'VisitedText';

export interface IStandaloneThemeData {
	base: BuiltinTheme;
	inherit: boolean;
	rules: ITokenThemeRule[];
	encodedTokensColors?: string[];
	colors: IColors;
	/**
	 * Color overrides that only apply while the OS/browser reports (forced-colors: active).
	 * Keys are regular color ids (e.g. editorForeground, disabledForeground) and values can
	 * be system forced color keywords (like GrayText).
	 * See https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors for more details.
	 */
	forcedColors?: { [colorId: string]: SystemForcedColor };
}

export interface IStandaloneTheme extends IColorTheme {
	tokenTheme: TokenTheme;
	themeName: string;
}

export interface IStandaloneThemeService extends IThemeService {
	readonly _serviceBrand: undefined;

	setTheme(themeName: string): void;

	setAutoDetectHighContrast(autoDetectHighContrast: boolean): void;

	defineTheme(themeName: string, themeData: IStandaloneThemeData): void;

	getColorTheme(): IStandaloneTheme;

	setColorMapOverride(colorMapOverride: Color[] | null): void;

}
