/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IWebFontService = createDecorator<IWebFontService>('webFontService');

export enum WebFontSettings {
	FONT_FACE_LIST = 'editor.webFont.fontFaceList'
}

export interface IFontFaceData {
	'font-family': string;
	'src': string;
	'ascent-override': string;
	'descent-override': string;
	'font-display': string;
	'font-stretch': string;
	'font-style': string;
	'font-weight': string;
	'font-variant': string;
	'font-feature-settings': string;
	'font-variation-settings': string;
	'line-gap-override': string;
	'unicode-range': string;
	'size-adjust': string;
}

export const fontFaceProperties: Array<keyof IFontFaceData> = [
	'font-family',
	'src',
	'ascent-override',
	'descent-override',
	'font-display',
	'font-stretch',
	'font-style',
	'font-weight',
	'font-variant',
	'font-feature-settings',
	'font-variation-settings',
	'line-gap-override',
	'unicode-range',
	'size-adjust'
];


export interface IWebFontService {
	readonly _serviceBrand: undefined;
}
