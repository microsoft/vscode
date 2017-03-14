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

export const editorHoverHighlight = registerColor('editorHoverHighlight', { light: '#ADD6FF26', dark: '#264f7840', hc: '#ADD6FF26' }, nls.localize('hoverHighlight', 'Background color of the editor hover'));
export const editorActiveLinkForeground = registerColor('editorActiveLinkForeground', { dark: '#4E94CE', light: Color.black, hc: Color.cyan }, nls.localize('activeLinkForeground', 'Color of active links'));
export const editorLinkForeground = registerColor('editorLinkForeground', { dark: null, light: null, hc: null }, nls.localize('linkForeground', 'Color of links'));
export const referencesFindMatchHighlight = registerColor('referencesFindMatchHighlight', { dark: '#ea5c004d', light: '#ea5c004d', hc: null }, nls.localize('referencesFindMatchHighlight', 'References view match highlight color'));
export const referencesReferenceHighlight = registerColor('referencesReferenceHighlight', { dark: '#ff8f0099', light: '#f5d802de', hc: null }, nls.localize('referencesReferenceHighlight', 'References range highlight color'));
export const editorLineHighlight = registerColor('editorLineHighlight', { dark: null, light: null, hc: null }, nls.localize('lineHighlight', 'Editor line highlight color'));
export const editorRangeHighlight = registerColor('editorRangeHighlight', { dark: '#ffffff0b', light: '#fdff0033', hc: null }, nls.localize('rangeHighlight', 'Background color of range highlighted, like by Quick open and Find features'));
export const editorCursor = registerColor('editorCursor', { dark: '#AEAFAD', light: Color.black, hc: Color.white }, nls.localize('caret', 'Editor cursor color'));
export const editorInvisibles = registerColor('editorInvisibles', { dark: '#e3e4e229', light: '#33333333', hc: '#e3e4e229' }, nls.localize('invisibles', 'Editor invisibles color'));
export const editorGuide = registerColor('editorGuide', { dark: '#404040', light: Color.lightgrey, hc: Color.white }, nls.localize('guide', 'Editor guide color'));

// TBD: split up and place each rule in the owning part
function applyEditorStyles(theme: ITheme, collector: ICssStyleCollector) {

	let background = theme.getColor(colorRegistry.editorBackground);
	if (background) {
		addBackgroundColorRule(theme, '.monaco-editor-background', background, collector);
		addBackgroundColorRule(theme, '.glyph-margin', background, collector);
		collector.addRule(`.${theme.selector} .monaco-workbench .monaco-editor-background { background-color: ${background}; }`);
	}

	addBackgroundColorRule(theme, '.hoverHighlight', theme.getColor(editorHoverHighlight), collector);

	let activeLinkForeground = theme.getColor(editorActiveLinkForeground);
	if (activeLinkForeground) {
		collector.addRule(`.monaco-editor.${theme.selector} .detected-link-active { color: ${activeLinkForeground} !important; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .goto-definition-link { color: ${activeLinkForeground} !important; }`);
	}
	let linkForeground = theme.getColor(editorLinkForeground);
	if (linkForeground) {
		collector.addRule(`.monaco-editor.${theme.selector} .detected-link { color: ${linkForeground} !important; }`);
	}

	let selection = theme.getColor(colorRegistry.editorSelection);
	if (selection) {
		addBackgroundColorRule(theme, '.focused .selected-text', selection, collector);
	}

	let inactiveSelection = theme.getColor(colorRegistry.editorInactiveSelection, false);
	if (inactiveSelection) {
		addBackgroundColorRule(theme, '.selected-text', inactiveSelection, collector);
	} else if (selection) {
		addBackgroundColorRule(theme, '.selected-text', selection.transparent(0.5), collector);
	}


	addBackgroundColorRule(theme, '.reference-zone-widget .ref-tree .referenceMatch', theme.getColor(referencesFindMatchHighlight), collector);
	addBackgroundColorRule(theme, '.reference-zone-widget .preview .reference-decoration', theme.getColor(referencesReferenceHighlight), collector);

	let lineHighlight = theme.getColor(editorLineHighlight);
	if (lineHighlight) {
		collector.addRule(`.monaco-editor.${theme.selector} .view-overlays .current-line { background-color: ${lineHighlight}; border: none; }`);
		collector.addRule(`.monaco-editor.${theme.selector} .margin-view-overlays .current-line-margin { background-color: ${lineHighlight}; border: none; }`);
	} else {
		// to do editor line border
	}
	addBackgroundColorRule(theme, '.rangeHighlight', theme.getColor(editorRangeHighlight), collector);

	let caret = theme.getColor(editorCursor);
	if (caret) {
		let oppositeCaret = caret.opposite();
		collector.addRule(`.monaco-editor.${theme.selector} .cursor { background-color: ${caret}; border-color: ${caret}; color: ${oppositeCaret}; }`);
	}

	let invisibles = theme.getColor(editorInvisibles);
	if (invisibles) {
		collector.addRule(`.vs-whitespace { color: ${invisibles} !important; }`);
	}

	let color = theme.getColor(editorGuide);
	if (!color) {
		color = theme.getColor(editorInvisibles);
	}
	if (color !== null) {
		collector.addRule(`.monaco-editor.${theme.selector} .lines-content .cigr { background: ${color}; }`);
	}
}

function addBackgroundColorRule(theme: ITheme, selector: string, color: Color, collector: ICssStyleCollector): void {
	if (color) {
		collector.addRule(`.monaco-editor.${theme.selector} ${selector} { background-color: ${color}; }`);
	}
}


