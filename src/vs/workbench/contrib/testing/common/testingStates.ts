/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestResult } from 'vs/workbench/api/common/extHostTypes';

export type TreeStateNode = { statusNode: true; state: TestResult; priority: number };

/**
 * List of display priorities for different run states. When tests update,
 * the highest-priority state from any of their children will be the state
 * reflected in the parent node.
 */
export const statePriority: { [K in TestResult]: number } = {
	[TestResult.Running]: 6,
	[TestResult.Errored]: 5,
	[TestResult.Failed]: 4,
	[TestResult.Passed]: 3,
	[TestResult.Queued]: 2,
	[TestResult.Unset]: 1,
	[TestResult.Skipped]: 0,
};

export const isFailedState = (s: TestResult) => s === TestResult.Errored || s === TestResult.Failed;

export const stateNodes = Object.entries(statePriority).reduce(
	(acc, [stateStr, priority]) => {
		const state = Number(stateStr) as TestResult;
		acc[state] = { statusNode: true, state, priority };
		return acc;
	}, {} as { [K in TestResult]: TreeStateNode }
);

export const cmpPriority = (a: TestResult, b: TestResult) => statePriority[b] - statePriority[a];

export const maxPriority = (a: TestResult, b: TestResult) => statePriority[a] > statePriority[b] ? a : b;

export const statesInOrder = Object.keys(statePriority).map(s => Number(s) as TestResult).sort(cmpPriority);

export const isRunningState = (s: TestResult) => s === TestResult.Queued || s === TestResult.Running;
