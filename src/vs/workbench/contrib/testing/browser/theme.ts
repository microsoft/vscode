/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { activityErrorBadgeBackground, activityErrorBadgeForeground, badgeBackground, badgeForeground, chartsGreen, chartsRed, contrastBorder, diffInserted, diffRemoved, editorBackground, editorErrorForeground, editorForeground, editorInfoForeground, opaque, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { TestResultState } from '../common/testTypes.js';

export const testingColorIconFailed = registerColor('testing.iconFailed', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hcDark: '#f14c4c',
	hcLight: '#B5200D'
}, localize('testing.iconFailed', "Color for the 'failed' icon in the test explorer."));

export const testingColorIconErrored = registerColor('testing.iconErrored', {
	dark: '#f14c4c',
	light: '#f14c4c',
	hcDark: '#f14c4c',
	hcLight: '#B5200D'
}, localize('testing.iconErrored', "Color for the 'Errored' icon in the test explorer."));

export const testingColorIconPassed = registerColor('testing.iconPassed', {
	dark: '#73c991',
	light: '#73c991',
	hcDark: '#73c991',
	hcLight: '#007100'
}, localize('testing.iconPassed', "Color for the 'passed' icon in the test explorer."));

export const testingColorRunAction = registerColor('testing.runAction', testingColorIconPassed, localize('testing.runAction', "Color for 'run' icons in the editor."));

export const testingColorIconQueued = registerColor('testing.iconQueued', '#cca700', localize('testing.iconQueued', "Color for the 'Queued' icon in the test explorer."));

export const testingColorIconUnset = registerColor('testing.iconUnset', '#848484', localize('testing.iconUnset', "Color for the 'Unset' icon in the test explorer."));

export const testingColorIconSkipped = registerColor('testing.iconSkipped', '#848484', localize('testing.iconSkipped', "Color for the 'Skipped' icon in the test explorer."));

export const testingPeekBorder = registerColor('testing.peekBorder', {
	dark: editorErrorForeground,
	light: editorErrorForeground,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('testing.peekBorder', 'Color of the peek view borders and arrow.'));

export const testingMessagePeekBorder = registerColor('testing.messagePeekBorder', {
	dark: editorInfoForeground,
	light: editorInfoForeground,
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('testing.messagePeekBorder', 'Color of the peek view borders and arrow when peeking a logged message.'));

export const testingPeekHeaderBackground = registerColor('testing.peekHeaderBackground', {
	dark: transparent(editorErrorForeground, 0.1),
	light: transparent(editorErrorForeground, 0.1),
	hcDark: null,
	hcLight: null
}, localize('testing.peekBorder', 'Color of the peek view borders and arrow.'));

export const testingPeekMessageHeaderBackground = registerColor('testing.messagePeekHeaderBackground', {
	dark: transparent(editorInfoForeground, 0.1),
	light: transparent(editorInfoForeground, 0.1),
	hcDark: null,
	hcLight: null
}, localize('testing.messagePeekHeaderBackground', 'Color of the peek view borders and arrow when peeking a logged message.'));

export const testingCoveredBackground = registerColor('testing.coveredBackground', {
	dark: diffInserted,
	light: diffInserted,
	hcDark: null,
	hcLight: null
}, localize('testing.coveredBackground', 'Background color of text that was covered.'));

export const testingCoveredBorder = registerColor('testing.coveredBorder', {
	dark: transparent(testingCoveredBackground, 0.75),
	light: transparent(testingCoveredBackground, 0.75),
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('testing.coveredBorder', 'Border color of text that was covered.'));

export const testingCoveredGutterBackground = registerColor('testing.coveredGutterBackground', {
	dark: transparent(diffInserted, 0.6),
	light: transparent(diffInserted, 0.6),
	hcDark: chartsGreen,
	hcLight: chartsGreen
}, localize('testing.coveredGutterBackground', 'Gutter color of regions where code was covered.'));

export const testingUncoveredBranchBackground = registerColor('testing.uncoveredBranchBackground', {
	dark: opaque(transparent(diffRemoved, 2), editorBackground),
	light: opaque(transparent(diffRemoved, 2), editorBackground),
	hcDark: null,
	hcLight: null
}, localize('testing.uncoveredBranchBackground', 'Background of the widget shown for an uncovered branch.'));

export const testingUncoveredBackground = registerColor('testing.uncoveredBackground', {
	dark: diffRemoved,
	light: diffRemoved,
	hcDark: null,
	hcLight: null
}, localize('testing.uncoveredBackground', 'Background color of text that was not covered.'));

export const testingUncoveredBorder = registerColor('testing.uncoveredBorder', {
	dark: transparent(testingUncoveredBackground, 0.75),
	light: transparent(testingUncoveredBackground, 0.75),
	hcDark: contrastBorder,
	hcLight: contrastBorder
}, localize('testing.uncoveredBorder', 'Border color of text that was not covered.'));

export const testingUncoveredGutterBackground = registerColor('testing.uncoveredGutterBackground', {
	dark: transparent(diffRemoved, 1.5),
	light: transparent(diffRemoved, 1.5),
	hcDark: chartsRed,
	hcLight: chartsRed
}, localize('testing.uncoveredGutterBackground', 'Gutter color of regions where code not covered.'));

export const testingCoverCountBadgeBackground = registerColor('testing.coverCountBadgeBackground', badgeBackground, localize('testing.coverCountBadgeBackground', 'Background for the badge indicating execution count'));

export const testingCoverCountBadgeForeground = registerColor('testing.coverCountBadgeForeground', badgeForeground, localize('testing.coverCountBadgeForeground', 'Foreground for the badge indicating execution count'));


const messageBadgeBackground = registerColor(
	'testing.message.error.badgeBackground',
	activityErrorBadgeBackground,
	localize('testing.message.error.badgeBackground', 'Background color of test error messages shown inline in the editor.')
);
registerColor(
	'testing.message.error.badgeBorder',
	messageBadgeBackground,
	localize('testing.message.error.badgeBorder', 'Border color of test error messages shown inline in the editor.')
);
registerColor(
	'testing.message.error.badgeForeground',
	activityErrorBadgeForeground,
	localize('testing.message.error.badgeForeground', 'Text color of test error messages shown inline in the editor.')
);
registerColor(
	'testing.message.error.lineBackground',
	null,
	localize('testing.message.error.marginBackground', 'Margin color beside error messages shown inline in the editor.')
);
registerColor(
	'testing.message.info.decorationForeground',
	transparent(editorForeground, 0.5),
	localize('testing.message.info.decorationForeground', 'Text color of test info messages shown inline in the editor.')
);
registerColor(
	'testing.message.info.lineBackground',
	null,
	localize('testing.message.info.marginBackground', 'Margin color beside info messages shown inline in the editor.')
);

export const testStatesToIconColors: { [K in TestResultState]?: string } = {
	[TestResultState.Errored]: testingColorIconErrored,
	[TestResultState.Failed]: testingColorIconFailed,
	[TestResultState.Passed]: testingColorIconPassed,
	[TestResultState.Queued]: testingColorIconQueued,
	[TestResultState.Unset]: testingColorIconUnset,
	[TestResultState.Skipped]: testingColorIconSkipped,
};

export const testingRetiredColorIconErrored = registerColor('testing.iconErrored.retired', transparent(testingColorIconErrored, 0.7), localize('testing.iconErrored.retired', "Retired color for the 'Errored' icon in the test explorer."));

export const testingRetiredColorIconFailed = registerColor('testing.iconFailed.retired', transparent(testingColorIconFailed, 0.7), localize('testing.iconFailed.retired', "Retired color for the 'failed' icon in the test explorer."));

export const testingRetiredColorIconPassed = registerColor('testing.iconPassed.retired', transparent(testingColorIconPassed, 0.7), localize('testing.iconPassed.retired', "Retired color for the 'passed' icon in the test explorer."));

export const testingRetiredColorIconQueued = registerColor('testing.iconQueued.retired', transparent(testingColorIconQueued, 0.7), localize('testing.iconQueued.retired', "Retired color for the 'Queued' icon in the test explorer."));

export const testingRetiredColorIconUnset = registerColor('testing.iconUnset.retired', transparent(testingColorIconUnset, 0.7), localize('testing.iconUnset.retired', "Retired color for the 'Unset' icon in the test explorer."));

export const testingRetiredColorIconSkipped = registerColor('testing.iconSkipped.retired', transparent(testingColorIconSkipped, 0.7), localize('testing.iconSkipped.retired', "Retired color for the 'Skipped' icon in the test explorer."));

export const testStatesToRetiredIconColors: { [K in TestResultState]?: string } = {
	[TestResultState.Errored]: testingRetiredColorIconErrored,
	[TestResultState.Failed]: testingRetiredColorIconFailed,
	[TestResultState.Passed]: testingRetiredColorIconPassed,
	[TestResultState.Queued]: testingRetiredColorIconQueued,
	[TestResultState.Unset]: testingRetiredColorIconUnset,
	[TestResultState.Skipped]: testingRetiredColorIconSkipped,
};

registerThemingParticipant((theme, collector) => {

	const editorBg = theme.getColor(editorBackground);

	collector.addRule(`
	.coverage-deco-inline.coverage-deco-hit.coverage-deco-hovered {
		background: ${theme.getColor(testingCoveredBackground)?.transparent(1.3)};
		outline-color: ${theme.getColor(testingCoveredBorder)?.transparent(2)};
	}
	.coverage-deco-inline.coverage-deco-miss.coverage-deco-hovered {
		background: ${theme.getColor(testingUncoveredBackground)?.transparent(1.3)};
		outline-color: ${theme.getColor(testingUncoveredBorder)?.transparent(2)};
	}
		`);

	if (editorBg) {
		const missBadgeBackground = theme.getColor(testingUncoveredBackground)?.transparent(2).makeOpaque(editorBg);
		const errorBadgeBackground = theme.getColor(messageBadgeBackground)?.makeOpaque(editorBg);
		collector.addRule(`
			.coverage-deco-branch-miss-indicator::before {
				border-color: ${missBadgeBackground?.transparent(1.3)};
				background-color: ${missBadgeBackground};
			}
			.monaco-workbench .test-error-content-widget .inner{
				background: ${errorBadgeBackground};
			}
			.monaco-workbench .test-error-content-widget .inner .arrow svg {
				fill: ${errorBadgeBackground};
			}
		`);
	}
});
