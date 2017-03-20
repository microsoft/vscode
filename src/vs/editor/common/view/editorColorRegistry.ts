/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Definition of the editor colors
 */

import nls = require('vs/nls');
import * as colorRegistry from 'vs/platform/theme/common/colorRegistry';
import { Registry } from 'vs/platform/platform';
import { ITheme, ICssStyleCollector, Extensions as ThemingExtensions, IThemingRegistry } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';


let colorReg = <colorRegistry.IColorRegistry>Registry.as(colorRegistry.Extensions.ColorContribution);
let themingReg = <IThemingRegistry>Registry.as(ThemingExtensions.ThemingContribution);
themingReg.onThemeChange(applyEditorStyles);

function registerColor(id: string, defaults: colorRegistry.ColorDefaults, description: string): colorRegistry.ColorIdentifier {
	return colorReg.registerColor(id, defaults, description);
}

export const editorLineHighlight = registerColor('editorLineHighlight', { dark: null, light: null, hc: null }, nls.localize('lineHighlight', 'Editor line highlight color'));
export const editorLineHighlightBorder = registerColor('editorLineHighlightBorderCox', { dark: '#282828', light: '#eeeeee', hc: '#f38518' }, nls.localize('lineHighlightBorderBox', 'Editor line highlight border box color'));
export const editorRangeHighlight = registerColor('editorRangeHighlight', { dark: '#ffffff0b', light: '#fdff0033', hc: null }, nls.localize('rangeHighlight', 'Background color of range highlighted, like by Quick open and Find features'));
export const editorCursor = registerColor('editorCursor', { dark: '#AEAFAD', light: Color.black, hc: Color.white }, nls.localize('caret', 'Editor cursor color'));
export const editorInvisibles = registerColor('editorInvisibles', { dark: '#e3e4e229', light: '#33333333', hc: '#e3e4e229' }, nls.localize('invisibles', 'Editor invisibles color'));
export const editorGuide = registerColor('editorGuide', { dark: editorInvisibles, light: editorInvisibles, hc: editorInvisibles }, nls.localize('guide', 'Editor guide color'));

// TBD: split up and place each rule in the owning part
function applyEditorStyles(theme: ITheme, collector: ICssStyleCollector) {

	let background = theme.getColor(colorRegistry.editorBackground);
	if (background) {
		addBackgroundColorRule(theme, '.monaco-editor-background', background, collector);
		collector.addRule(`.${theme.selector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
	}

	let lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor.${theme.selector} .view-overlays .current-line { background-color: ${lineHighlight}; border: none; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
	} else {
		// to do editor line border
	}
	addBackgroundColorRule(theme, '.rangeHighlight', theme.getColor(editorRangeHighlight), collector);

	let invisibles = theme.getColor(editorInvisibles);
	if (invisibles) {
		collector.addRule(`.vs-whitespace { color: ${invisibles} !important; }`);
	}
}

function addBackgroundColorRule(theme: ITheme, selector: string, color: Color, collector: ICssStyleCollector): void {
	if (color) {
		collector.addRule(`.monaco-editor.${theme.selector} ${selector} { background-color: ${color}; }`);
	}
}


