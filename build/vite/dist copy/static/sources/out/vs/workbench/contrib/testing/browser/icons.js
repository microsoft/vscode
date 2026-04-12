/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon, spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { testingColorRunAction, testStatesToIconColors, testStatesToRetiredIconColors } from './theme.js';
export const testingViewIcon = registerIcon('test-view-icon', Codicon.beaker, localize('testViewIcon', 'View icon of the test view.'));
export const testingResultsIcon = registerIcon('test-results-icon', Codicon.checklist, localize('testingResultsIcon', 'Icons for test results.'));
export const testingRunIcon = registerIcon('testing-run-icon', Codicon.run, localize('testingRunIcon', 'Icon of the "run test" action.'));
export const testingRerunIcon = registerIcon('testing-rerun-icon', Codicon.debugRerun, localize('testingRerunIcon', 'Icon of the "rerun tests" action.'));
export const testingRunAllIcon = registerIcon('testing-run-all-icon', Codicon.runAll, localize('testingRunAllIcon', 'Icon of the "run all tests" action.'));
// todo: https://github.com/microsoft/vscode-codicons/issues/72
export const testingDebugAllIcon = registerIcon('testing-debug-all-icon', Codicon.debugAltSmall, localize('testingDebugAllIcon', 'Icon of the "debug all tests" action.'));
export const testingDebugIcon = registerIcon('testing-debug-icon', Codicon.debugAltSmall, localize('testingDebugIcon', 'Icon of the "debug test" action.'));
export const testingCoverageIcon = registerIcon('testing-coverage-icon', Codicon.runCoverage, localize('testingCoverageIcon', 'Icon of the "run test with coverage" action.'));
export const testingCoverageAllIcon = registerIcon('testing-coverage-all-icon', Codicon.runAllCoverage, localize('testingRunAllWithCoverageIcon', 'Icon of the "run all tests with coverage" action.'));
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
export const testingCoverageReport = registerIcon('testing-coverage', Codicon.coverage, localize('testingCoverage', 'Icon representing test coverage'));
export const testingWasCovered = registerIcon('testing-was-covered', Codicon.check, localize('testingWasCovered', 'Icon representing that an element was covered'));
export const testingCoverageMissingBranch = registerIcon('testing-missing-branch', Codicon.question, localize('testingMissingBranch', 'Icon representing a uncovered block without a range'));
export const testingStatesToIcons = new Map([
    [6 /* TestResultState.Errored */, registerIcon('testing-error-icon', Codicon.issues, localize('testingErrorIcon', 'Icon shown for tests that have an error.'))],
    [4 /* TestResultState.Failed */, registerIcon('testing-failed-icon', Codicon.error, localize('testingFailedIcon', 'Icon shown for tests that failed.'))],
    [3 /* TestResultState.Passed */, registerIcon('testing-passed-icon', Codicon.pass, localize('testingPassedIcon', 'Icon shown for tests that passed.'))],
    [1 /* TestResultState.Queued */, registerIcon('testing-queued-icon', Codicon.history, localize('testingQueuedIcon', 'Icon shown for tests that are queued.'))],
    [2 /* TestResultState.Running */, spinningLoading],
    [5 /* TestResultState.Skipped */, registerIcon('testing-skipped-icon', Codicon.debugStepOver, localize('testingSkippedIcon', 'Icon shown for tests that are skipped.'))],
    [0 /* TestResultState.Unset */, registerIcon('testing-unset-icon', Codicon.circleOutline, localize('testingUnsetIcon', 'Icon shown for tests that are in an unset state.'))],
]);
registerThemingParticipant((theme, collector) => {
    for (const [state, icon] of testingStatesToIcons.entries()) {
        const color = testStatesToIconColors[state];
        const retiredColor = testStatesToRetiredIconColors[state];
        if (!color) {
            continue;
        }
        collector.addRule(`.monaco-workbench ${ThemeIcon.asCSSSelector(icon)} {
			color: ${theme.getColor(color)} !important;
		}`);
        if (!retiredColor) {
            continue;
        }
        collector.addRule(`
			.test-explorer .computed-state.retired${ThemeIcon.asCSSSelector(icon)},
			.testing-run-glyph.retired${ThemeIcon.asCSSSelector(icon)}{
				color: ${theme.getColor(retiredColor)} !important;
			}
		`);
    }
    collector.addRule(`
		.monaco-editor .glyph-margin-widgets ${ThemeIcon.asCSSSelector(testingRunIcon)},
		.monaco-editor .glyph-margin-widgets ${ThemeIcon.asCSSSelector(testingRunAllIcon)},
		.monaco-editor .glyph-margin-widgets ${ThemeIcon.asCSSSelector(testingDebugIcon)},
		.monaco-editor .glyph-margin-widgets ${ThemeIcon.asCSSSelector(testingDebugAllIcon)} {
			color: ${theme.getColor(testingColorRunAction)};
		}
	`);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWNvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2Jyb3dzZXIvaWNvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFHMUcsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxjQUFjLEVBQUUsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO0FBQ3ZJLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7QUFDbEosTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7QUFDMUksTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxVQUFVLEVB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