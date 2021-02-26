/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';

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

export const testStateNames: { [K in TestRunState]: string } = {
	[TestRunState.Errored]: localize('testState.errored', 'Errored'),
	[TestRunState.Failed]: localize('testState.failed', 'Failed'),
	[TestRunState.Passed]: localize('testState.passed', 'Passed'),
	[TestRunState.Queued]: localize('testState.queued', 'Queued'),
	[TestRunState.Running]: localize('testState.running', 'Running'),
	[TestRunState.Skipped]: localize('testState.skipped', 'Skipped'),
	[TestRunState.Unset]: localize('testState.unset', 'Unset'),
};
