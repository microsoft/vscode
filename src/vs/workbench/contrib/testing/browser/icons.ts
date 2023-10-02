/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { registerIcon, spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { testingColorRunAction, testStatesToIconColors } from 'vs/workbench/contrib/testing/browser/theme';
import { TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';

export const testingViewIcon = registerIcon('test-view-icon', Codicon.beaker, localize('testViewIcon', 'View icon of the test view.'));
export const testingResultsIcon = registerIcon('test-results-icon', Codicon.checklist, localize('testingResultsIcon', 'Icons for test results.'));
export const testingRunIcon = registerIcon('testing-run-icon', Codicon.run, localize('testingRunIcon', 'Icon of the "run test" action.'));
export const testingRerunIcon = registerIcon('testing-rerun-icon', Codicon.refresh, localize('testingRerunIcon', 'Icon of the "rerun tests" action.'));
export const testingRunAllIcon = registerIcon('testing-run-all-icon', Codicon.runAll, localize('testingRunAllIcon', 'Icon of the "run all tests" action.'));
// todo: https://github.com/microsoft/vscode-codicons/issues/72
export const testingDebugAllIcon = registerIcon('testing-debug-all-icon', Codicon.debugAltSmall, localize('testingDebugAllIcon', 'Icon of the "debug all tests" action.'));
export const testingDebugIcon = registerIcon('testing-debug-icon', Codicon.debugAltSmall, localize('testingDebugIcon', 'Icon of the "debug test" action.'));
export const testingCancelIcon = registerIcon('testing-cancel-icon', Codicon.debugStop, localize('testingCancelIcon', 'Icon to cancel ongoing test runs.'));
export const testingFilterIcon = registerIcon('testing-filter', Codicon.filter, localize('filterIcon', 'Icon for the \'Filter\' action in the testing view.'));
export const testingHiddenIcon = registerIcon('testing-hidden', Codicon.eyeClosed, localize('hiddenIcon', 'Icon shown beside hidden tests, when they\'ve been shown.'));

export const testingShowAsList = registerIcon('testing-show-as-list-icon', Codicon.listTree, localize('testingShowAsList', 'Icon shown when the test explorer is disabled as a tree.'));
export const testingShowAsTree = registerIcon('testing-show-as-list-icon', Codicon.listFlat, localize('testingShowAsTree', 'Icon shown when the test explorer is disabled as a list.'));

export const testingUpdateProfiles = registerIcon('testing-update-profiles', Codicon.gear, localize('testingUpdateProfiles', 'Icon shown to update test profiles.'));
export const testingRefreshTests = registerIcon('testing-refresh-tests', Codicon.refresh, localize('testingRefreshTests', 'Icon on the button to refresh tests.'));
export const testingTurnContinuousRunOn = registerIcon('testing-turn-continuous-run-on', Codicon.eye, localize('testingTurnContinuousRunOn', 'Icon to turn continuous test runs on.'));
export const testingTurnContinuousRunOff = registerIcon('testing-turn-continuous-run-off', Codicon.eyeClosed, localize('testingTurnContinuousRunOff', 'Icon to turn continuous test runs off.'));
export const testingContinuousIsOn = registerIcon('testing-continuous-is-on', Codicon.eye, localize('testingTurnContinuousRunIsOn', 'Icon when continuous run is on for a test ite,.'));
export const testingCancelRefreshTests = registerIcon('testing-cancel-refresh-tests', Codicon.stop, localize('testingCancelRefreshTests', 'Icon on the button to cancel refreshing tests.'));

export const testingStatesToIcons = new Map<TestResultState, ThemeIcon>([
	[TestResultState.Errored, registerIcon('testing-error-icon', Codicon.issues, localize('testingErrorIcon', 'Icon shown for tests that have an error.'))],
	[TestResultState.Failed, registerIcon('testing-failed-icon', Codicon.error, localize('testingFailedIcon', 'Icon shown for tests that failed.'))],
	[TestResultState.Passed, registerIcon('testing-passed-icon', Codicon.pass, localize('testingPassedIcon', 'Icon shown for tests that passed.'))],
	[TestResultState.Queued, registerIcon('testing-queued-icon', Codicon.history, localize('testingQueuedIcon', 'Icon shown for tests that are queued.'))],
	[TestResultState.Running, spinningLoading],
	[TestResultState.Skipped, registerIcon('testing-skipped-icon', Codicon.debugStepOver, localize('testingSkippedIcon', 'Icon shown for tests that are skipped.'))],
	[TestResultState.Unset, registerIcon('testing-unset-icon', Codicon.circleOutline, localize('testingUnsetIcon', 'Icon shown for tests that are in an unset state.'))],
]);

registerThemingParticipant((theme, collector) => {
	for (const [state, icon] of testingStatesToIcons.entries()) {
		const color = testStatesToIconColors[state];
		if (!color) {
			continue;
		}
		collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icon)} {
			color: ${theme.getColor(color)} !important;
		}`);
	}

	collector.addRule(`
		.monaco-editor ${ThemeIcon.asCSSSelector(testingRunIcon)},
		.monaco-editor ${ThemeIcon.asCSSSelector(testingRunAllIcon)} {
			color: ${theme.getColor(testingColorRunAction)};
		}
	`);
});
