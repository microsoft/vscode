/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TestResultState, TestRunProfileBitset } from 'vs/workbench/contrib/testing/common/testCollection';

export const enum Testing {
	// marked as "extension" so that any existing test extensions are assigned to it.
	ViewletId = 'workbench.view.extension.test',
	ExplorerViewId = 'workbench.view.testing',
	OutputPeekContributionId = 'editor.contrib.testingOutputPeek',
	DecorationsContributionId = 'editor.contrib.testingDecorations',
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

export const enum TestExplorerStateFilter {
	OnlyFailed = 'failed',
	OnlyExecuted = 'excuted',
	All = 'all',
}

export const testStateNames: { [K in TestResultState]: string } = {
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
}, '{0} ({1})', label, testStateNames[state]);

export const testConfigurationGroupNames: { [K in TestRunProfileBitset]: string } = {
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
	DebugAction = 'testing.debug',
	DebugAllAction = 'testing.debugAll',
	DebugAtCursor = 'testing.debugAtCursor',
	DebugCurrentFile = 'testing.debugCurrentFile',
	DebugFailedTests = 'testing.debugFailTests',
	DebugLastRun = 'testing.debugLastRun',
	DebugSelectedAction = 'testing.debugSelected',
	FilterAction = 'workbench.actions.treeView.testExplorer.filter',
	GoToTest = 'testing.editFocusedTest',
	HideTestAction = 'testing.hideTest',
	OpenOutputPeek = 'testing.openOutputPeek',
	RefreshTestsAction = 'testing.refreshTests',
	ReRunFailedTests = 'testing.reRunFailTests',
	ReRunLastRun = 'testing.reRunLastRun',
	RunAction = 'testing.run',
	RunAllAction = 'testing.runAll',
	RunAtCursor = 'testing.runAtCursor',
	RunCurrentFile = 'testing.runCurrentFile',
	RunSelectedAction = 'testing.runSelected',
	RunUsingProfileAction = 'testing.runUsing',
	SearchForTestExtension = 'testing.searchForTestExtension',
	SelectDefaultTestProfiles = 'testing.selectDefaultTestProfiles',
	ShowMostRecentOutputAction = 'testing.showMostRecentOutput',
	TestingSortByDurationAction = 'testing.sortByDuration',
	TestingSortByLocationAction = 'testing.sortByLocation',
	TestingSortByStatusAction = 'testing.sortByStatus',
	TestingViewAsListAction = 'testing.viewAsList',
	TestingViewAsTreeAction = 'testing.viewAsTree',
	ToggleAutoRun = 'testing.toggleautoRun',
	ToggleInlineTestOutput = 'testing.toggleInlineTestOutput',
	UnhideTestAction = 'testing.unhideTest',
}
