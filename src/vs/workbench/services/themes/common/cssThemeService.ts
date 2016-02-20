/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export const supportedColorSelectors = [
	'.editor .current-line',
	'.editor .cursor',
	'.editor .focused .selected-text',
	'.editor .selected-text',
	'.editor .glyph-margin',
	'.editor .token',
	'.editor',
	'.workbench .monaco-editor-background'
];

export const supportedIconSelectors = [
	'.explorer-viewlet',
	'.explorer-viewlet .folder-icon',
	'.explorer-viewlet .expanded .folder-icon',
	'.explorer-viewlet .file-icon'
];

export const supportedCssProperties = {
	'background-color': true,
	'color': true,
	'text-decoration': true,
	'font-style': true,
	'font-weight': true,
	'padding-left': true,
	'background': true
};
