/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { RunTestForProviderRequest, RunTestsRequest, RunTestsResult, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

export const ITestService = createDecorator<ITestService>('testService');

export interface MainTestController {
	runTests(request: RunTestForProviderRequest): Promise<RunTestsResult>;
}

export interface ITestService {
	readonly _serviceBrand: undefined;
	onDidReceiveDiff: Event<TestsDiff>;
	publishDiff(diff: TestsDiff): void;
	runTests(req: RunTestsRequest): Promise<RunTestsResult>;
	registerTestController(id: string, controller: MainTestController): void;
	unregisterTestController(id: string): void;
}
