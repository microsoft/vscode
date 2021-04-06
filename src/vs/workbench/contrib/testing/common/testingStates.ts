/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestResultState } from 'vs/workbench/api/common/extHostTypes';

export type TreeStateNode = { statusNode: true; state: TestResultState; priority: number };

/**
 * List of display priorities for different run states. When tests update,
 * the highest-priority state from any of their children will be the state
 * reflected in the parent node.
 */
export const statePriority: { [K in TestResultState]: number } = {
	[TestResultState.Running]: 6,
	[TestResultState.Errored]: 5,
	[TestResultState.Failed]: 4,
	[TestResultState.Passed]: 3,
	[TestResultState.Queued]: 2,
	[TestResultState.Unset]: 1,
	[TestResultState.Skipped]: 0,
};

export const isFailedState = (s: TestResultState) => s === TestResultState.Errored || s === TestResultState.Failed;

export const stateNodes = Object.entries(statePriority).reduce(
	(acc, [stateStr, priority]) => {
		const state = Number(stateStr) as TestResultState;
		acc[state] = { statusNode: true, state, priority };
		return acc;
	}, {} as { [K in TestResultState]: TreeStateNode }
);

export const cmpPriority = (a: TestResultState, b: TestResultState) => statePriority[b] - statePriority[a];

export const maxPriority = (a: TestResultState, b: TestResultState) => statePriority[a] > statePriority[b] ? a : b;

export const statesInOrder = Object.keys(statePriority).map(s => Number(s) as TestResultState).sort(cmpPriority);

export const isRunningState = (s: TestResultState) => s === TestResultState.Queued || s === TestResultState.Running;
