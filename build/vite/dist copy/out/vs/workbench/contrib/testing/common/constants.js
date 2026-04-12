/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { localize } from '../../../../nls.js';
export var Testing;
(function (Testing) {
    // marked as "extension" so that any existing test extensions are assigned to it.
    Testing["ViewletId"] = "workbench.view.extension.test";
    Testing["ExplorerViewId"] = "workbench.view.testing";
    Testing["OutputPeekContributionId"] = "editor.contrib.testingOutputPeek";
    Testing["DecorationsContributionId"] = "editor.contrib.testingDecorations";
    Testing["CoverageDecorationsContributionId"] = "editor.contrib.coverageDecorations";
    Testing["CoverageViewId"] = "workbench.view.testCoverage";
    Testing["ResultsPanelId"] = "workbench.panel.testResults";
    Testing["ResultsViewId"] = "workbench.panel.testResults.view";
    Testing["MessageLanguageId"] = "vscodeInternalTestMessage";
})(Testing || (Testing = {}));
export var TestExplorerViewMode;
(function (TestExplorerViewMode) {
    TestExplorerViewMode["List"] = "list";
    TestExplorerViewMode["Tree"] = "true";
})(TestExplorerViewMode || (TestExplorerViewMode = {}));
export var TestExplorerViewSorting;
(function (TestExplorerViewSorting) {
    TestExplorerViewSorting["ByLocation"] = "location";
    TestExplorerViewSorting["ByStatus"] = "status";
    TestExplorerViewSorting["ByDuration"] = "duration";
})(TestExplorerViewSorting || (TestExplorerViewSorting = {}));
const testStateNames = {
    [6 /* TestResultState.Errored */]: localize('testState.errored', 'Errored'),
    [4 /* TestResultState.Failed */]: localize('testState.failed', 'Failed'),
    [3 /* TestResultState.Passed */]: localize('testState.passed', 'Passed'),
    [1 /* TestResultState.Queued */]: localize('testState.queued', 'Queued'),
    [2 /* TestResultState.Running */]: localize('testState.running', 'Running'),
    [5 /* TestResultState.Skipped */]: localize('testState.skipped', 'Skipped'),
    [0 /* TestResultState.Unset */]: localize('testState.unset', 'Not yet run'),
};
export const labelForTestInState = (label, state) => localize({
    key: 'testing.treeElementLabel',
    comment: ['label then the unit tests state, for example "Addition Tests (Running)"'],
}, '{0} ({1})', stripIcons(label), testStateNames[state]);
export const testConfigurationGroupNames = {
    [4 /* TestRunProfileBitset.Debug */]: localize('testGroup.debug', 'Debug'),
    [2 /* TestRunProfileBitset.Run */]: localize('testGroup.run', 'Run'),
    [8 /* TestRunProfileBitset.Coverage */]: localize('testGroup.coverage', 'Coverage'),
};
export var TestCommandId;
(function (TestCommandId) {
    TestCommandId["CancelTestRefreshAction"] = "testing.cancelTestRefresh";
    TestCommandId["CancelTestRunAction"] = "testing.cancelRun";
    TestCommandId["ClearTestResultsAction"] = "testing.clearTestResults";
    TestCommandId["CollapseAllAction"] = "testing.collapseAll";
    TestCommandId["ConfigureTestProfilesAction"] = "testing.configureProfile";
    TestCommandId["ContinousRunUsingForTest"] = "testing.continuousRunUsingForTest";
    TestCommandId["CoverageAtCursor"] = "testing.coverageAtCursor";
    TestCommandId["CoverageByUri"] = "testing.coverage.uri";
    TestCommandId["CoverageClear"] = "testing.coverage.close";
    TestCommandId["CoverageCurrentFile"] = "testing.coverageCurrentFile";
    TestCommandId["CoverageFilterToTest"] = "testing.coverageFilterToTest";
    TestCommandId["CoverageFilterToTestInEditor"] = "testing.coverageFilterToTestInEditor";
    TestCommandId["CoverageGoToNextMissedLine"] = "testing.coverage.goToNextMissedLine";
    TestCommandId["CoverageGoToPreviousMissedLine"] = "testing.coverage.goToPreviousMissedLine";
    TestCommandId["CoverageLastRun"] = "testing.coverageLastRun";
    TestCommandId["CoverageSelectedAction"] = "testing.coverageSelected";
    TestCommandId["CoverageToggleInExplorer"] = "testing.toggleCoverageInExplorer";
    TestCommandId["CoverageToggleToolbar"] = "testing.coverageToggleToolbar";
    TestCommandId["CoverageViewChangeSorting"] = "testing.coverageViewChangeSorting";
    TestCommandId["CoverageViewCollapseAll"] = "testing.coverageViewCollapseAll";
    TestCommandId["DebugAction"] = "testing.debug";
    TestCommandId["DebugAllAction"] = "testing.debugAll";
    TestCommandId["DebugAtCursor"] = "testing.debugAtCursor";
    TestCommandId["DebugByUri"] = "testing.debug.uri";
    TestCommandId["DebugCurrentFile"] = "testing.debugCurrentFile";
    TestCommandId["DebugFailedTests"] = "testing.debugFailTests";
    TestCommandId["DebugFailedFromLastRun"] = "testing.debugFailedFromLastRun";
    TestCommandId["DebugLastRun"] = "testing.debugLastRun";
    TestCommandId["DebugSelectedAction"] = "testing.debugSelected";
    TestCommandId["FilterAction"] = "workbench.actions.treeView.testExplorer.filter";
    TestCommandId["GetExplorerSelection"] = "_testing.getExplorerSelection";
    TestCommandId["GetSelectedProfiles"] = "testing.getSelectedProfiles";
    TestCommandId["GoToTest"] = "testing.editFocusedTest";
    TestCommandId["GoToRelatedTest"] = "testing.goToRelatedTest";
    TestCommandId["PeekRelatedTest"] = "testing.peekRelatedTest";
    TestCommandId["GoToRelatedCode"] = "testing.goToRelatedCode";
    TestCommandId["PeekRelatedCode"] = "testing.peekRelatedCode";
    TestCommandId["HideTestAction"] = "testing.hideTest";
    TestCommandId["OpenCoverage"] = "testing.openCoverage";
    TestCommandId["OpenOutputPeek"] = "testing.openOutputPeek";
    TestCommandId["RefreshTestsAction"] = "testing.refreshTests";
    TestCommandId["ReRunFailedTests"] = "testing.reRunFailTests";
    TestCommandId["ReRunFailedFromLastRun"] = "testing.reRunFailedFromLastRun";
    TestCommandId["ReRunLastRun"] = "testing.reRunLastRun";
    TestCommandId["RunAction"] = "testing.run";
    TestCommandId["RunAllAction"] = "testing.runAll";
    TestCommandId["RunAllWithCoverageAction"] = "testing.coverageAll";
    TestCommandId["RunAtCursor"] = "testing.runAtCursor";
    TestCommandId["RunByUri"] = "testing.run.uri";
    TestCommandId["RunCurrentFile"] = "testing.runCurrentFile";
    TestCommandId["RunSelectedAction"] = "testing.runSelected";
    TestCommandId["RunUsingProfileAction"] = "testing.runUsing";
    TestCommandId["RunWithCoverageAction"] = "testing.coverage";
    TestCommandId["SearchForTestExtension"] = "testing.searchForTestExtension";
    TestCommandId["SelectDefaultTestProfiles"] = "testing.selectDefaultTestProfiles";
    TestCommandId["ShowMostRecentOutputAction"] = "testing.showMostRecentOutput";
    TestCommandId["StartContinousRun"] = "testing.startContinuousRun";
    TestCommandId["StartContinousRunFromExtension"] = "testing.startContinuousRunFromExtension";
    TestCommandId["StopContinousRunFromExtension"] = "testing.stopContinuousRunFromExtension";
    TestCommandId["StopContinousRun"] = "testing.stopContinuousRun";
    TestCommandId["TestingSortByDurationAction"] = "testing.sortByDuration";
    TestCommandId["TestingSortByLocationAction"] = "testing.sortByLocation";
    TestCommandId["TestingSortByStatusAction"] = "testing.sortByStatus";
    TestCommandId["TestingViewAsListAction"] = "testing.viewAsList";
    TestCommandId["TestingViewAsTreeAction"] = "testing.viewAsTree";
    TestCommandId["ToggleContinousRunForTest"] = "testing.toggleContinuousRunForTest";
    TestCommandId["ToggleResultsViewLayoutAction"] = "testing.toggleResultsViewLayout";
    TestCommandId["ToggleInlineTestOutput"] = "testing.toggleInlineTestOutput";
    TestCommandId["UnhideAllTestsAction"] = "testing.unhideAllTests";
    TestCommandId["UnhideTestAction"] = "testing.unhideTest";
})(TestCommandId || (TestCommandId = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vY29uc3RhbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHOUMsTUFBTSxDQUFOLElBQWtCLE9BYWpCO0FBYkQsV0FBa0IsT0FBTztJQUN4QixpRkFBaUY7SUFDakYsc0RBQTJDLENBQUE7SUFDM0Msb0RBQXlDLENBQUE7SUFDekMsd0VBQTZELENBQUE7SUFDN0QsMEVBQStELENBQUE7SUFDL0QsbUZBQXdFLENBQUE7SUFDeEUseURBQThDLENBQUE7SUFFOUMseURBQThDLENBQUE7SUFDOUMsNkRBQWtELENBQUE7SUFFbEQsMERBQStDLENBQUE7QUFDaEQsQ0FBQyxFQWJpQixPQUFPLEtBQVAsT0FBTyxRQWF4QjtBQUVELE1BQU0sQ0FBTixJQUFrQixvQkFHakI7QUFIRCxXQUFrQixvQkFBb0I7SUFDckMscUNBQWEsQ0FBQTtJQUNiLHFDQUFhLENBQUE7QUFDZCxDQUFDLEVBSGlCLG9CQUFvQixLQUFwQixvQkFBb0IsUUFHckM7QUFFRCxNQUFNLENBQU4sSUFBa0IsdUJBSWpCO0FBSkQsV0FBa0IsdUJBQXVCO0lBQ3hDLGtEQUF1QixDQUFBO0lBQ3ZCLDhDQUFtQixDQUFBO0lBQ25CLGtEQUF1QixDQUFBO0FBQ3hCLENBQUMsRUFKaUIsdUJBQXVCLEtBQXZCLHVCQUF1QixRQUl4QztBQUVELE1BQU0sY0FBYyxHQUF1QztJQUMxRCxpQ0FBeUIsRUFBRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsU0FBUyxDQUFDO0lBQ25FLGdDQUF3QixFQUFFLFFBQVEsQ0FBQyxrQkFB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