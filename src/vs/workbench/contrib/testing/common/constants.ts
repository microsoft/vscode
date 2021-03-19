/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TestResult } from 'vs/workbench/api/common/extHostTypes';

export const enum Testing {
	// marked as "extension" so that any existing test extensions are assigned to it.
	ViewletId = 'workbench.view.extension.test',
	ExplorerViewId = 'workbench.view.testing',
	OutputPeekContributionId = 'editor.contrib.testingOutputPeek',
	DecorationsContributionId = 'editor.contrib.testingDecorations',
	FilterActionId = 'workbench.actions.treeView.testExplorer.filter',
}

export const enum TestExplorerViewMode {
	List = 'list',
	Tree = 'true'
}

export const enum TestExplorerViewSorting {
	ByLocation = 'location',
	ByName = 'name',
}

export const enum TestExplorerStateFilter {
	OnlyFailed = 'failed',
	OnlyExecuted = 'excuted',
	All = 'all',
}

export const testStateNames: { [K in TestResult]: string } = {
	[TestResult.Errored]: localize('testState.errored', 'Errored'),
	[TestResult.Failed]: localize('testState.failed', 'Failed'),
	[TestResult.Passed]: localize('testState.passed', 'Passed'),
	[TestResult.Queued]: localize('testState.queued', 'Queued'),
	[TestResult.Running]: localize('testState.running', 'Running'),
	[TestResult.Skipped]: localize('testState.skipped', 'Skipped'),
	[TestResult.Unset]: localize('testState.unset', 'Unset'),
};
