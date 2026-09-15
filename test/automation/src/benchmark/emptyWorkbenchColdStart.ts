/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	BenchmarkStoryDependencies,
	BenchmarkStoryRequest,
	BenchmarkStoryResult,
	EMPTY_WORKBENCH_COLD_START_STORY,
	runBenchmarkStory,
	validateBenchmarkStoryRequest
} from './benchmarkStory';

export {
	createInvalidResult,
	EMPTY_WORKBENCH_COLD_START_STORY,
	PhaseTiming
} from './benchmarkStory';

export type EmptyWorkbenchColdStartRequest = BenchmarkStoryRequest & {
	readonly story: typeof EMPTY_WORKBENCH_COLD_START_STORY;
};

export type EmptyWorkbenchColdStartResult = BenchmarkStoryResult & {
	readonly story: typeof EMPTY_WORKBENCH_COLD_START_STORY;
};

export type EmptyWorkbenchColdStartDependencies = BenchmarkStoryDependencies;

export function validateEmptyWorkbenchColdStartRequest(value: unknown): EmptyWorkbenchColdStartRequest {
	const request = validateBenchmarkStoryRequest(value);
	if (request.story !== EMPTY_WORKBENCH_COLD_START_STORY) {
		throw new Error(`Expected story '${EMPTY_WORKBENCH_COLD_START_STORY}'.`);
	}
	return request as EmptyWorkbenchColdStartRequest;
}

export async function runEmptyWorkbenchColdStart(
	request: EmptyWorkbenchColdStartRequest,
	logFile: string,
	dependencies: EmptyWorkbenchColdStartDependencies = {}
): Promise<EmptyWorkbenchColdStartResult> {
	return await runBenchmarkStory(request, logFile, dependencies) as EmptyWorkbenchColdStartResult;
}
