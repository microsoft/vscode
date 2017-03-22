/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground, highContrastOutline } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Color } from 'vs/base/common/color';

/**
 * Definition of the editor colors
 */
export const editorLineHighlight = registerColor('editorLineHighlight', { dark: null, light: null, hc: null }, nls.localize('lineHighlight', 'Editor line highlight color'));
export const editorLineHighlightBorder = registerColor('editorLineHighlightBorderCox', { dark: '#282828', light: '#eeeeee', hc: '#f38518' }, nls.localize('lineHighlightBorderBox', 'Editor line highlight border box color'));
export const editorRangeHighlight = registerColor('editorRangeHighlight', { dark: '#ffffff0b', light: '#fdff0033', hc: null }, nls.localize('rangeHighlight', 'Background color of range highlighted, like by Quick open and Find features'));
export const editorCursor = registerColor('editorCursor', { dark: '#AEAFAD', light: Color.black, hc: Color.white }, nls.localize('caret', 'Editor cursor color'));
export const editorInvisibles = registerColor('editorInvisibles', { dark: '#e3e4e229', light: '#33333333', hc: '#e3e4e229' }, nls.localize('invisibles', 'Editor invisibles color'));
export const editorGuide = registerColor('editorGuide', { dark: editorInvisibles, light: editorInvisibles, hc: editorInvisibles }, nls.localize('guide', 'Editor guide color'));

// contains all color rules that used to defined in editor/browser/widget/editor.css
registerThemingParticipant((theme, collector) => {

	let background = theme.getColor(editorBackground);
	if (background) {
		collector.addRule(`.monaco-editor.${theme.selector} .monaco-editor-background { background-color: ${background}; }`);
	}

	let rangeHighlight = theme.getColor(editorRangeHighlight);
	if (rangeHighlight) {
		collector.addRule(`.monaco-editor.${theme.selector} .rangeHighlight { background-color: ${rangeHighlight}; }`);
	}
	let outline = theme.getColor(highContrastOutline);
	if (outline) {
		collector.addRule(`.monaco-editor.${theme.selector} .rangeHighlight { border: 1px dotted ${outline}; }; }`);
	}

	let invisibles = theme.getColor(editorInvisibles);
	if (invisibles) {
		collector.addRule(`.vs-whitespace { color: ${invisibles} !important; }`);
	}
});


