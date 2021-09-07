/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color, RGBA } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { contrastBorder, editorErrorForeground, editorForeground, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ACTIVITY_BAR_BADGE_BACKGROUND } from 'vs/workbench/common/theme';
import { TestMessageType, TestResultState } from 'vs/workbench/contrib/testing/common/testCollection';

export const testingColorIconFailed = registerColor('testing.iconFailed', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hc: '#f14c4c'
}, localize('testing.iconFailed', "Color for the 'failed' icon in the test explorer."));

export const testingColorIconErrored = registerColor('testing.iconErrored', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hc: '#f14c4c'
}, localize('testing.iconErrored', "Color for the 'Errored' icon in the test explorer."));

export const testingColorIconPassed = registerColor('testing.iconPassed', {
	dark: '#73c991',
	light: '#73c991',
	hc: '#73c991'
}, localize('testing.iconPassed', "Color for the 'passed' icon in the test explorer."));

export const testingColorRunAction = registerColor('testing.runAction', {
	dark: testingColorIconPassed,
	light: testingColorIconPassed,
	hc: testingColorIconPassed
}, localize('testing.runAction', "Color for 'run' icons in the editor."));

export const testingColorIconQueued = registerColor('testing.iconQueued', {
	dark: '#cca700',
	light: '#cca700',
	hc: '#cca700'
}, localize('testing.iconQueued', "Color for the 'Queued' icon in the test explorer."));

export const testingColorIconUnset = registerColor('testing.iconUnset', {
	dark: '#848484',
	light: '#848484',
	hc: '#848484'
}, localize('testing.iconUnset', "Color for the 'Unset' icon in the test explorer."));

export const testingColorIconSkipped = registerColor('testing.iconSkipped', {
	dark: '#848484',
	light: '#848484',
	hc: '#848484'
}, localize('testing.iconSkipped', "Color for the 'Skipped' icon in the test explorer."));

export const testingPeekBorder = registerColor('testing.peekBorder', {
	dark: editorErrorForeground,
	light: editorErrorForeground,
	hc: contrastBorder,
}, localize('testing.peekBorder', 'Color of the peek view borders and arrow.'));

export const testingPeekHeaderBackground = registerColor('testing.peekHeaderBackground', {
	dark: transparent(editorErrorForeground, 0.1),
	light: transparent(editorErrorForeground, 0.1),
	hc: null,
}, localize('testing.peekBorder', 'Color of the peek view borders and arrow.'));

export const testMessageSeverityColors: {
	[K in TestMessageType]: {
		decorationForeground: string,
		marginBackground: string,
	};
} = {
	[TestMessageType.Error]: {
		decorationForeground: registerColor(
			'testing.message.error.decorationForeground',
			{ dark: editorErrorForeground, light: editorErrorForeground, hc: editorForeground },
			localize('testing.message.error.decorationForeground', 'Text color of test error messages shown inline in the editor.')
		),
		marginBackground: registerColor(
			'testing.message.error.lineBackground',
			{ dark: new Color(new RGBA(255, 0, 0, 0.2)), light: new Color(new RGBA(255, 0, 0, 0.2)), hc: null },
			localize('testing.message.error.marginBackground', 'Margin color beside error messages shown inline in the editor.')
		),
	},
	[TestMessageType.Info]: {
		decorationForeground: registerColor(
			'testing.message.info.decorationForeground',
			{ dark: transparent(editorForeground, 0.5), light: transparent(editorForeground, 0.5), hc: transparent(editorForeground, 0.5) },
			localize('testing.message.info.decorationForeground', 'Text color of test info messages shown inline in the editor.')
		),
		marginBackground: registerColor(
			'testing.message.info.lineBackground',
			{ dark: null, light: null, hc: null },
			localize('testing.message.info.marginBackground', 'Margin color beside info messages shown inline in the editor.')
		),
	},
};

export const testStatesToIconColors: { [K in TestResultState]?: string } = {
	[TestResultState.Errored]: testingColorIconErrored,
	[TestResultState.Failed]: testingColorIconFailed,
	[TestResultState.Passed]: testingColorIconPassed,
	[TestResultState.Queued]: testingColorIconQueued,
	[TestResultState.Unset]: testingColorIconUnset,
	[TestResultState.Skipped]: testingColorIconUnset,
};


registerThemingParticipant((theme, collector) => {
	//#region test states
	for (const [state, { marginBackground }] of Object.entries(testMessageSeverityColors)) {
		collector.addRule(`.monaco-editor .testing-inline-message-severity-${state} {
			background: ${theme.getColor(marginBackground)};
		}`);
	}
	//#endregion test states

	//#region active buttons
	const inputActiveOptionBorderColor = theme.getColor(inputActiveOptionBorder);
	if (inputActiveOptionBorderColor) {
		collector.addRule(`.testing-filter-action-item > .monaco-action-bar .testing-filter-button.checked { border-color: ${inputActiveOptionBorderColor}; }`);
	}
	const inputActiveOptionForegroundColor = theme.getColor(inputActiveOptionForeground);
	if (inputActiveOptionForegroundColor) {
		collector.addRule(`.testing-filter-action-item > .monaco-action-bar .testing-filter-button.checked { color: ${inputActiveOptionForegroundColor}; }`);
	}
	const inputActiveOptionBackgroundColor = theme.getColor(inputActiveOptionBackground);
	if (inputActiveOptionBackgroundColor) {
		collector.addRule(`.testing-filter-action-item > .monaco-action-bar .testing-filter-button.checked { background-color: ${inputActiveOptionBackgroundColor}; }`);
	}
	const badgeColor = theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND);
	collector.addRule(`.monaco-workbench .part > .title > .title-actions .action-label.codicon-testing-autorun::after { background-color: ${badgeColor}; }`);
	//#endregion
});
