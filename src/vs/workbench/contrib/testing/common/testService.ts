/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { InternalTestItem, RunTestForProviderRequest, RunTestsRequest, RunTestsResult, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';

export const ITestService = createDecorator<ITestService>('testService');

export interface MainTestController {
	lookupTest(test: TestIdWithProvider): Promise<InternalTestItem | undefined>;
	runTests(request: RunTestForProviderRequest, token: CancellationToken): Promise<RunTestsResult>;
}

export type TestDiffListener = (diff: TestsDiff) => void;

export interface ITestService {
	readonly _serviceBrand: undefined;
	readonly onShouldSubscribe: Event<{ resource: ExtHostTestingResource, uri: URI; }>;
	readonly onShouldUnsubscribe: Event<{ resource: ExtHostTestingResource, uri: URI; }>;
	readonly onDidChangeProviders: Event<{ delta: number; }>;
	readonly providers: number;
	readonly subscriptions: ReadonlyArray<{ resource: ExtHostTestingResource, uri: URI; }>;

	readonly testRuns: Iterable<RunTestsRequest>;
	readonly onTestRunStarted: Event<RunTestsRequest>;
	readonly onTestRunCompleted: Event<{ req: RunTestsRequest, result: RunTestsResult; }>;

	/**
	 * List of resources where tests are actively being discovered.
	 */
	readonly busyTestLocations: Iterable<{ resource: ExtHostTestingResource, uri: URI; }>;

	/**
	 * Fires when the busy state of a resource changes.
	 */
	readonly onBusyStateChange: Event<{ resource: ExtHostTestingResource, uri: URI, busy: boolean; }>;

	registerTestController(id: string, controller: MainTestController): void;
	unregisterTestController(id: string): void;
	runTests(req: RunTestsRequest, token?: CancellationToken): Promise<RunTestsResult>;
	cancelTestRun(req: RunTestsRequest): void;
	publishDiff(resource: ExtHostTestingResource, uri: URI, diff: TestsDiff): void;
	subscribeToDiffs(resource: ExtHostTestingResource, uri: URI, acceptDiff: TestDiffListener): IDisposable;

	/**
	 * Updates the number of test providers still discovering tests for the given resource.
	 */
	updateDiscoveringCount(resource: ExtHostTestingResource, uri: URI, delta: number): void;

	/**
	 * Looks up a test, by a request to extension hosts.
	 */
	lookupTest(test: TestIdWithProvider): Promise<InternalTestItem | undefined>;

	/**
	 * Requests to resubscribe to all active subscriptions, discarding old tests.
	 */
	resubscribeToAllTests(): void;
}
