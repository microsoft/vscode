/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable, IReference } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostTestingResource } from 'vs/workbench/api/common/extHost.protocol';
import { AbstractIncrementalTestCollection, IncrementalTestCollectionItem, InternalTestItem, RunTestForProviderRequest, RunTestsRequest, TestIdWithProvider, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResultService';

export const ITestService = createDecorator<ITestService>('testService');

export interface MainTestController {
	lookupTest(test: TestIdWithProvider): Promise<InternalTestItem | undefined>;
	runTests(request: RunTestForProviderRequest, token: CancellationToken): Promise<void>;
}

export type TestDiffListener = (diff: TestsDiff) => void;

export interface IMainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> {
	onPendingRootProvidersChange: Event<number>;
	onBusyProvidersChange: Event<number>;

	/**
	 * Number of test root sources who are yet to report.
	 */
	pendingRootProviders: number;

	/**
	 * Number of providers working to discover tests.
	 */
	busyProviders: number;

	/**
	 * Root node IDs.
	 */
	rootIds: ReadonlySet<string>;

	/**
	 * Iterates over every test in the collection.
	 */
	all: Iterable<IncrementalTestCollectionItem>;

	/**
	 * Gets a node in the collection by ID.
	 */
	getNodeById(id: string): IncrementalTestCollectionItem | undefined;

	/**
	 * Gets a diff that adds all items currently in the tree to a new collection,
	 * allowing it to fully hydrate.
	 */
	getReviverDiff(): TestsDiff;
}

export const waitForAllRoots = (collection: IMainThreadTestCollection, timeout = 3000) => {
	if (collection.pendingRootProviders === 0) {
		return Promise.resolve();
	}

	let listener: IDisposable;
	return new Promise<void>(resolve => {
		listener = collection.onPendingRootProvidersChange(count => {
			if (count === 0) {
				resolve();
			}
		});

		setTimeout(resolve, timeout);
	}).finally(() => listener.dispose());
};

export const waitForAllTests = (collection: IMainThreadTestCollection, timeout = 3000) => {
	if (collection.busyProviders === 0) {
		return Promise.resolve();
	}

	let listener: IDisposable;
	return new Promise<void>(resolve => {
		listener = collection.onBusyProvidersChange(count => {
			if (count === 0) {
				resolve();
			}
		});

		setTimeout(resolve, timeout);
	}).finally(() => listener.dispose());
};

export interface ITestService {
	readonly _serviceBrand: undefined;
	readonly onShouldSubscribe: Event<{ resource: ExtHostTestingResource, uri: URI; }>;
	readonly onShouldUnsubscribe: Event<{ resource: ExtHostTestingResource, uri: URI; }>;
	readonly onDidChangeProviders: Event<{ delta: number; }>;
	readonly providers: number;
	readonly subscriptions: ReadonlyArray<{ resource: ExtHostTestingResource, uri: URI; }>;
	readonly testRuns: Iterable<RunTestsRequest>;

	registerTestController(id: string, controller: MainTestController): void;
	unregisterTestController(id: string): void;
	runTests(req: RunTestsRequest, token?: CancellationToken): Promise<ITestResult>;
	cancelTestRun(req: RunTestsRequest): void;
	publishDiff(resource: ExtHostTestingResource, uri: URI, diff: TestsDiff): void;
	subscribeToDiffs(resource: ExtHostTestingResource, uri: URI, acceptDiff?: TestDiffListener): IReference<IMainThreadTestCollection>;

	/**
	 * Updates the number of sources who provide test roots when subscription
	 * is requested. This is equal to the number of extension hosts, and used
	 * with `TestDiffOpType.DeltaRootsComplete` to signal when all roots
	 * are available.
	 */
	updateRootProviderCount(delta: number): void;

	/**
	 * Looks up a test, by a request to extension hosts.
	 */
	lookupTest(test: TestIdWithProvider): Promise<InternalTestItem | undefined>;

	/**
	 * Requests to resubscribe to all active subscriptions, discarding old tests.
	 */
	resubscribeToAllTests(): void;
}
