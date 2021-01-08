/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';

export const enum Testing {
	ViewletId = 'workbench.view.testing',
	ExplorerViewId = 'workbench.view.testing',
}

export const enum TestExplorerViewMode {
	List = 'list',
	Tree = 'true'
}

export const enum TestExplorerViewGrouping {
	ByLocation = 'location',
	ByStatus = 'status',
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
