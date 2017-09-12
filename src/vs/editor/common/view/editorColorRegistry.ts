/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { registerColor, editorBackground, activeContrastBorder, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Color, RGBA } from 'vs/base/common/color';

/**
 * Definition of the editor colors
 */
export const editorLineHighlight = registerColor('editor.lineHighlightBackground', { dark: null, light: null, hc: null }, nls.localize('lineHighlight', 'Background color for the highlight of line at the cursor position.'));
export const editorLineHighlightBorder = registerColor('editor.lineHighlightBorder', { dark: '#282828', light: '#eeeeee', hc: '#f38518' }, nls.localize('lineHighlightBorderBox', 'Background color for the border around the line at the cursor position.'));
export const editorRangeHighlight = registerColor('editor.rangeHighlightBackground', { dark: '#ffffff0b', light: '#fdff0033', hc: null }, nls.localize('rangeHighlight', 'Background color of highlighted ranges, like by quick open and find features.'));
export const editorCursorForeground = registerColor('editorCursor.foreground', { dark: '#AEAFAD', light: Color.black, hc: Color.white }, nls.localize('caret', 'Color of the editor cursor.'));
export const editorCursorBackground = registerColor('editorCursor.background', null, nls.localize('editorCursorBackground', 'The background color of the editor cursor. Allows customizing the color of a character overlapped by a block cursor.'));
export const editorWhitespaces = registerColor('editorWhitespace.foreground', { dark: '#e3e4e229', light: '#33333333', hc: '#e3e4e229' }, nls.localize('editorWhitespaces', 'Color of whitespace characters in the editor.'));
export const editorIndentGuides = registerColor('editorIndentGuide.background', { dark: editorWhitespaces, light: editorWhitespaces, hc: editorWhitespaces }, nls.localize('editorIndentGuides', 'Color of the editor indentation guides.'));
export const editorLineNumbers = registerColor('editorLineNumber.foreground', { dark: '#5A5A5A', light: '#2B91AF', hc: Color.white }, nls.localize('editorLineNumbers', 'Color of editor line numbers.'));
export const editorRuler = registerColor('editorRuler.foreground', { dark: '#5A5A5A', light: Color.lightgrey, hc: Color.white }, nls.localize('editorRuler', 'Color of the editor rulers.'));

export const editorCodeLensForeground = registerColor('editorCodeLens.foreground', { dark: '#999999', light: '#999999', hc: '#999999' }, nls.localize('editorCodeLensForeground', 'Foreground color of editor code lenses'));

export const editorBracketMatchBackground = registerColor('editorBracketMatch.background', { dark: '#0064001a', light: '#0064001a', hc: '#0064001a' }, nls.localize('editorBracketMatchBackground', 'Background color behind matching brackets'));
export const editorBracketMatchBorder = registerColor('editorBracketMatch.border', { dark: '#888', light: '#B9B9B9', hc: '#fff' }, nls.localize('editorBracketMatchBorder', 'Color for matching brackets boxes'));

export const editorOverviewRulerBorder = registerColor('editorOverviewRuler.border', { dark: '#7f7f7f4d', light: '#7f7f7f4d', hc: '#7f7f7f4d' }, nls.localize('editorOverviewRulerBorder', 'Color of the overview ruler border.'));

export const editorGutter = registerColor('editorGutter.background', { dark: editorBackground, light: editorBackground, hc: editorBackground }, nls.localize('editorGutter', 'Background color of the editor gutter. The gutter contains the glyph margins and the line numbers.'));

export const editorErrorForeground = registerColor('editorError.foreground', { dark: '#FF0000', light: '#FF0000', hc: null }, nls.localize('errorForeground', 'Foreground color of error squigglies in the editor.'));
export const editorErrorBorder = registerColor('editorError.border', { dark: null, light: null, hc: Color.fromHex('#E47777').transparent(0.8) }, nls.localize('errorBorder', 'Border color of error squigglies in the editor.'));

export const editorWarningForeground = registerColor('editorWarning.foreground', { dark: '#008000', light: '#008000', hc: null }, nls.localize('warningForeground', 'Foreground color of warning squigglies in the editor.'));
export const editorWarningBorder = registerColor('editorWarning.border', { dark: null, light: null, hc: Color.fromHex('#71B771').transparent(0.8) }, nls.localize('warningBorder', 'Border color of warning squigglies in the editor.'));

const rulerRangeDefault = new Color(new RGBA(0, 122, 204, 0.6));
export const overviewRulerRangeHighlight = registerColor('editorOverviewRuler.rangeHighlightForeground', { dark: rulerRangeDefault, light: rulerRangeDefault, hc: rulerRangeDefault }, nls.localize('overviewRulerRangeHighlight', 'Overview ruler marker color for range highlights.'));
export const overviewRulerError = registerColor('editorOverviewRuler.errorForeground', { dark: new Color(new RGBA(255, 18, 18, 0.7)), light: new Color(new RGBA(255, 18, 18, 0.7)), hc: new Color(new RGBA(255, 50, 50, 1)) }, nls.localize('overviewRuleError', 'Overview ruler marker color for errors.'));
export const overviewRulerWarning = registerColor('editorOverviewRuler.warningForeground', { dark: new Color(new RGBA(18, 136, 18, 0.7)), light: new Color(new RGBA(18, 136, 18, 0.7)), hc: new Color(new RGBA(50, 255, 50, 1)) }, nls.localize('overviewRuleWarning', 'Overview ruler marker color for warnings.'));
export const overviewRulerInfo = registerColor('editorOverviewRuler.infoForeground', { dark: new Color(new RGBA(18, 18, 136, 0.7)), light: new Color(new RGBA(18, 18, 136, 0.7)), hc: new Color(new RGBA(50, 50, 255, 1)) }, nls.localize('overviewRuleInfo', 'Overview ruler marker color for infos.'));


// contains all color rules that used to defined in editor/browser/widget/editor.css
registerThemingParticipant((theme, collector) => {
	let background = theme.getColor(editorBackground);
	if (background) {
		collector.addRule(`.monaco-editor, .monaco-editor-background, .monaco-editor .inputarea.ime-input { background-color: ${background}; }`);
	}
	let foreground = theme.getColor(editorForeground);
	if (foreground) {
		collector.addRule(`.monaco-editor, .monaco-editor .inputarea.ime-input { color: ${foreground}; }`);
	}

	let gutter = theme.getColor(editorGutter);
	if (gutter) {
		collector.addRule(`.monaco-editor .margin { background-color: ${gutter}; }`);
	}

	let rangeHighlight = theme.getColor(editorRangeHighlight);
	if (rangeHighlight) {
		collector.addRule(`.monaco-editor .rangeHighlight { background-color: ${rangeHighlight}; }`);
	}
	let outline = theme.getColor(activeContrastBorder);
	if (outline) {
		collector.addRule(`.monaco-editor .rangeHighlight { border: 1px dotted ${outline}; }`);
	}

	let invisibles = theme.getColor(editorWhitespaces);
	if (invisibles) {
		collector.addRule(`.vs-whitespace { color: ${invisibles} !important; }`);
	}
});