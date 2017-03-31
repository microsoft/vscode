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
export const editorLineHighlight = registerColor('editorLineHighlight', { dark: null, light: null, hc: null }, nls.localize('lineHighlight', 'Background color for the highlight of line at the cursor position.'));
export const editorLineHighlightBorder = registerColor('editorLineHighlightBorder', { dark: '#282828', light: '#eeeeee', hc: '#f38518' }, nls.localize('lineHighlightBorderBox', 'Background color for the border around the line at the cursor position.'));
export const editorRangeHighlight = registerColor('editorRangeHighlight', { dark: '#ffffff0b', light: '#fdff0033', hc: null }, nls.localize('rangeHighlight', 'Background color of highlighted ranges, like by quick open and find features.'));
export const editorCursor = registerColor('editorCursor', { dark: '#AEAFAD', light: Color.black, hc: Color.white }, nls.localize('caret', 'Color of the editor cursor.'));
export const editorWhitespaces = registerColor('editorWhitespaces', { dark: '#e3e4e229', light: '#33333333', hc: '#e3e4e229' }, nls.localize('editorWhitespaces', 'Color of whitespace characters in the editor.'));
export const editorIndentGuides = registerColor('editorIndentGuides', { dark: editorWhitespaces, light: editorWhitespaces, hc: editorWhitespaces }, nls.localize('editorIndentGuides', 'Color of the editor indentation guides.'));
export const editorLineNumbers = registerColor('editorLineNumbers', { dark: '#5A5A5A', light: '#2B91AF', hc: Color.white }, nls.localize('editorLineNumbers', 'Color of editor line numbers.'));


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

	let invisibles = theme.getColor(editorWhitespaces);
	if (invisibles) {
		collector.addRule(`.vs-whitespace { color: ${invisibles} !important; }`);
	}
});


