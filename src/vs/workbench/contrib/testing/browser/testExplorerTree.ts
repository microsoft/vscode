/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestRunState } from 'vs/workbench/api/common/extHostTypes';

export type TreeStateNode = { statusNode: true; state: TestRunState; priority: number };


/**
 * List of display priorities for different run states. When tests update,
 * the highest-priority state from any of their children will be the state
 * reflected in the parent node.
 */
export const statePriority: { [K in TestRunState]: number } = {
	[TestRunState.Running]: 6,
	[TestRunState.Queued]: 5,
	[TestRunState.Errored]: 4,
	[TestRunState.Failed]: 3,
	[TestRunState.Passed]: 2,
	[TestRunState.Skipped]: 1,
	[TestRunState.Unset]: 0,
};

export const stateNodes = Object.entries(statePriority).reduce(
	(acc, [stateStr, priority]) => {
		const state = Number(stateStr) as TestRunState;
		acc[state] = { statusNode: true, state, priority };
		return acc;
	}, {} as { [K in TestRunState]: TreeStateNode }
);

export const cmpPriority = (a: TestRunState, b: TestRunState) => statePriority[b] - statePriority[a];

export const maxPriority = (a: TestRunState, b: TestRunState) => statePriority[a] > statePriority[b] ? a : b;

export const statesInOrder = Object.keys(statePriority).map(s => Number(s) as TestRunState).sort(cmpPriority);
