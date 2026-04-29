/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stripIcons } from '../../../../base/common/iconLabels.js';
import { localize } from '../../../../nls.js';
import { TestResultState, TestRunProfileBitset } from './testTypes.js';

export const enum Testing {
	// marked as "extension" so that any existing test extensions are assigned to it.
	ViewletId = 'workbench.view.extension.test',
	ExplorerViewId = 'workbench.view.testing',
	OutputPeekContributionId = 'editor.contrib.testingOutputPeek',
	DecorationsContributionId = 'editor.contrib.testingDecorations',
	CoverageDecorationsContributionId = 'editor.contrib.coverageDecorations',
	CoverageViewId = 'workbench.view.testCoverage',

	ResultsPanelId = 'workbench.panel.testResults',
	ResultsViewId = 'workbench.panel.testResults.view',

	MessageLanguageId = 'vscodeInternalTestMessage'
}

export const enum TestExplorerViewMode {
	List = 'list',
	Tree = 'true'
}

export const enum TestExplorerViewSorting {
	ByLocation = 'location',
	ByStatus = 'status',
	ByDuration = 'duration',
}

const testStateNames: { [K in TestResultState]: string } = {
	[TestResultState.Errored]: localize('testState.errored', 'Errored'),
	[TestResultState.Failed]: localize('testState.failed', 'Failed'),
	[TestResultState.Passed]: localize('testState.passed', 'Passed'),
	[TestResultState.Queued]: localize('testState.queued', 'Queued'),
	[TestResultState.Running]: localize('testState.running', 'Running'),
	[TestResultState.Skipped]: localize('testState.skipped', 'Skipped'),
	[TestResultState.Unset]: localize('testState.unset', 'Not yet run'),
};

export const labelForTestInState = (label: string, state: TestResultState) => localize({
	key: 'testing.treeElementLabel',
	comment: ['label then the unit tests state, for example "Addition Tests (Running)"'],
}, '{0} ({1})', stripIcons(label), testStateNames[state]);

export const testConfigurationGroupNames: Partial<Record<TestRunProfileBitset, string | undefined>> = {
	[TestRunProfileBitset.Debug]: localize('testGroup.debug', 'Debug'),
	[TestRunProfileBitset.Run]: localize('testGroup.run', 'Run'),
	[TestRunProfileBitset.Coverage]: localize('testGroup.coverage', 'Coverage'),
};

export const enum TestCommandId {
	CancelTestRefreshAction = 'testing.cancelTestRefresh',
	CancelTestRunAction = 'testing.cancelRun',
	ClearTestResultsAction = 'testing.clearTestResults',
	CollapseAllAction = 'testing.collapseAll',
	ConfigureTestProfilesAction = 'testing.configureProfile',
	ContinousRunUsingForTest = 'testing.continuousRunUsingForTest',
	CoverageAtCursor = 'testing.coverageAtCursor',
	CoverageByUri = 'testing.coverage.uri',
	CoverageClear = 'testing.coverage.close',
	CoverageCurrentFile = 'testing.coverageCurrentFile',
	CoverageFilterToTest = 'testing.coverageFilterToTest',
	CoverageFilterToTestInEditor = 'testing.coverageFilterToTestInEditor',
	CoverageGoToNextMissedLine = 'testing.coverage.goToNextMissedLine',
	CoverageGoToPreviousMissedLine = 'testing.coverage.goToPreviousMissedLine',
	CoverageLastRun = 'testing.coverageLastRun',
	CoverageSelectedAction = 'testing.coverageSelected',
	CoverageToggleInExplorer = 'testing.toggleCoverageInExplorer',
	CoverageToggleToolbar = 'testing.coverageToggleToolbar',
	CoverageViewChangeSorting = 'testing.coverageViewChangeSorting',
	CoverageViewCollapseAll = 'testing.coverageViewCollapseAll',
	DebugAction = 'testing.debug',
	DebugAllAction = 'testing.debugAll',
	DebugAtCursor = 'testing.debugAtCursor',
	DebugByUri = 'testing.debug.uri',
	DebugCurrentFile = 'testing.debugCurrentFile',
	DebugFailedTests = 'testing.debugFailTests',
	DebugFailedFromLastRun = 'testing.debugFailedFromLastRun',
	DebugLastRun = 'testing.debugLastRun',
	DebugSelectedAction = 'testing.debugSelected',
	FilterAction = 'workbench.actions.treeView.testExplorer.filter',
	GetExplorerSelection = '_testing.getExplorerSelection',
	GetSelectedProfiles = 'testing.getSelectedProfiles',
	GoToTest = 'testing.editFocusedTest',
	GoToRelatedTest = 'testing.goToRelatedTest',
	PeekRelatedTest = 'testing.peekRelatedTest',
	GoToRelatedCode = 'testing.goToRelatedCode',
	PeekRelatedCode = 'testing.peekRelatedCode',
	HideTestAction = 'testing.hideTest',
	OpenCoverage = 'testing.openCoverage',
	OpenOutputPeek = 'testing.openOutputPeek',
	RefreshTestsAction = 'testing.refreshTests',
	ReRunFailedTests = 'testing.reRunFailTests',
	ReRunFailedFromLastRun = 'testing.reRunFailedFromLastRun',
	ReRunLastRun = 'testing.reRunLastRun',
	RunAction = 'testing.run',
	RunAllAction = 'testing.runAll',
	RunAllWithCoverageAction = 'testing.coverageAll',
	RunAtCursor = 'testing.runAtCursor',
	RunByUri = 'testing.run.uri',
	RunCurrentFile = 'testing.runCurrentFile',
	RunSelectedAction = 'testing.runSelected',
	RunUsingProfileAction = 'testing.runUsing',
	RunWithCoverageAction = 'testing.coverage',
	SearchForTestExtension = 'testing.searchForTestExtension',
	SelectDefaultTestProfiles = 'testing.selectDefaultTestProfiles',
	ShowMostRecentOutputAction = 'testing.showMostRecentOutput',
	StartContinousRun = 'testing.startContinuousRun',
	StartContinousRunFromExtension = 'testing.startContinuousRunFromExtension',
	StopContinousRunFromExtension = 'testing.stopContinuousRunFromExtension',
	StopContinousRun = 'testing.stopContinuousRun',
	TestingSortByDurationAction = 'testing.sortByDuration',
	TestingSortByLocationAction = 'testing.sortByLocation',
	TestingSortByStatusAction = 'testing.sortByStatus',
	TestingViewAsListAction = 'testing.viewAsList',
	TestingViewAsTreeAction = 'testing.viewAsTree',
	ToggleContinousRunForTest = 'testing.toggleContinuousRunForTest',
	ToggleResultsViewLayoutAction = 'testing.toggleResultsViewLayout',
	ToggleInlineTestOutput = 'testing.toggleInlineTestOutput',
	UnhideAllTestsAction = 'testing.unhideAllTests',
	UnhideTestAction = 'testing.unhideTest',
}
