/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { IDisposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IObservableValue, MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { AbstractIncrementalTestCollection, ICallProfileRunHandler, IncrementalTestCollectionItem, InternalTestItem, ITestItemContext, ResolvedTestRunRequest, IStartControllerTests, IStartControllerTestsResult, TestItemExpandState, TestRunProfileBitset, TestsDiff, TestMessageFollowupResponse, TestMessageFollowupRequest } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestExclusions } from 'vs/workbench/contrib/testing/common/testExclusions';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';

export const ITestService = createDecorator<ITestService>('testService');

export interface IMainThreadTestController {
	readonly id: string;
	readonly label: IObservableValue<string>;
	readonly canRefresh: IObservableValue<boolean>;
	syncTests(token: CancellationToken): Promise<void>;
	refreshTests(token: CancellationToken): Promise<void>;
	configureRunProfile(profileId: number): void;
	expandTest(id: string, levels: number): Promise<void>;
	startContinuousRun(request: ICallProfileRunHandler[], token: CancellationToken): Promise<IStartControllerTestsResult[]>;
	runTests(request: IStartControllerTests[], token: CancellationToken): Promise<IStartControllerTestsResult[]>;
}

export interface IMainThreadTestHostProxy {
	provideTestFollowups(req: TestMessageFollowupRequest, token: CancellationToken): Promise<TestMessageFollowupResponse[]>;
	executeTestFollowup(id: number): Promise<void>;
	disposeTestFollowups(ids: number[]): void;
}

export interface IMainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> {
	onBusyProvidersChange: Event<number>;

	/**
	 * Number of providers working to discover tests.
	 */
	busyProviders: number;

	/**
	 * Root item IDs.
	 */
	rootIds: Iterable<string>;

	/**
	 * Root items, correspond to registered controllers.
	 */
	rootItems: Iterable<IncrementalTestCollectionItem>;

	/**
	 * Iterates over every test in the collection, in strictly descending
	 * order of depth.
	 */
	all: Iterable<IncrementalTestCollectionItem>;

	/**
	 * Gets a node in the collection by ID.
	 */
	getNodeById(id: string): IncrementalTestCollectionItem | undefined;

	/**
	 * Gets all tests that have the given URL. Tests returned from this
	 * method are *not* in any particular order.
	 */
	getNodeByUrl(uri: URI): Iterable<IncrementalTestCollectionItem>;

	/**
	 * Requests that children be revealed for the given test. "Levels" may
	 * be infinite.
	 */
	expand(testId: string, levels: number): Promise<void>;

	/**
	 * Gets a diff that adds all items currently in the tree to a new collection,
	 * allowing it to fully hydrate.
	 */
	getReviverDiff(): TestsDiff;
}

export const testCollectionIsEmpty = (collection: IMainThreadTestCollection) =>
	!Iterable.some(collection.rootItems, r => r.children.size > 0);

export const getContextForTestItem = (collection: IMainThreadTestCollection, id: string | TestId) => {
	if (typeof id === 'string') {
		id = TestId.fromString(id);
	}

	if (id.isRoot) {
		return { controller: id.toString() };
	}

	const context: ITestItemContext = { $mid: MarshalledId.TestItemContext, tests: [] };
	for (const i of id.idsFromRoot()) {
		if (!i.isRoot) {
			const test = collection.getNodeById(i.toString());
			if (test) {
				context.tests.push(test);
			}
		}
	}

	return context;
};

/**
 * Ensures the test with the given ID exists in the collection, if possible.
 * If cancellation is requested, or the test cannot be found, it will return
 * undefined.
 */
export const expandAndGetTestById = async (collection: IMainThreadTestCollection, id: string, ct = CancellationToken.None) => {
	const idPath = [...TestId.fromString(id).idsFromRoot()];

	let expandToLevel = 0;
	for (let i = idPath.length - 1; !ct.isCancellationRequested && i >= expandToLevel;) {
		const id = idPath[i].toString();
		const existing = collection.getNodeById(id);
		if (!existing) {
			i--;
			continue;
		}

		if (i === idPath.length - 1) {
			return existing;
		}

		// expand children only if it looks like it's necessary
		if (!existing.children.has(idPath[i + 1].toString())) {
			await collection.expand(id, 0);
		}

		expandToLevel = i + 1; // avoid an infinite loop if the test does not exist
		i = idPath.length - 1;
	}
	return undefined;
};

/**
 * Waits for the test to no longer be in the "busy" state.
 */
const waitForTestToBeIdle = (testService: ITestService, test: IncrementalTestCollectionItem) => {
	if (!test.item.busy) {
		return;
	}

	return new Promise<void>(resolve => {
		const l = testService.onDidProcessDiff(() => {
			if (testService.collection.getNodeById(test.item.extId)?.item.busy !== true) {
				resolve(); // removed, or no longer busy
				l.dispose();
			}
		});
	});
};

/**
 * Iterator that expands to and iterates through tests in the file. Iterates
 * in strictly descending order.
 */
export const testsInFile = async function* (testService: ITestService, ident: IUriIdentityService, uri: URI, waitForIdle = true): AsyncIterable<IncrementalTestCollectionItem> {
	for (const test of testService.collection.all) {
		if (!test.item.uri) {
			continue;
		}

		if (ident.extUri.isEqual(uri, test.item.uri)) {
			yield test;
		}

		if (ident.extUri.isEqualOrParent(uri, test.item.uri)) {
			if (test.expand === TestItemExpandState.Expandable) {
				await testService.collection.expand(test.item.extId, 1);
			}
			if (waitForIdle) {
				await waitForTestToBeIdle(testService, test);
			}
		}
	}
};

/**
 * Iterator that iterates to the top-level children of tests under the given
 * the URI.
 */
export const testsUnderUri = async function* (testService: ITestService, ident: IUriIdentityService, uri: URI, waitForIdle = true): AsyncIterable<IncrementalTestCollectionItem> {

	const queue = [testService.collection.rootIds];
	while (queue.length) {
		for (const testId of queue.pop()!) {
			const test = testService.collection.getNodeById(testId);

			// Expand tests with URIs that are parent of the item, add tests
			// that are within the URI. Don't add their children, since those
			// tests already encompass their children.
			if (!test) {
				// no-op
			} else if (test.item.uri && ident.extUri.isEqualOrParent(test.item.uri, uri)) {
				yield test;
			} else if (!test.item.uri || ident.extUri.isEqualOrParent(uri, test.item.uri)) {
				if (test.expand === TestItemExpandState.Expandable) {
					await testService.collection.expand(test.item.extId, 1);
				}
				if (waitForIdle) {
					await waitForTestToBeIdle(testService, test);
				}
				queue.push(test.children.values());
			}
		}
	}
};

/**
 * A run request that expresses the intent of the request and allows the
 * test service to resolve the specifics of the group.
 */
export interface AmbiguousRunTestsRequest {
	/** Group to run */
	group: TestRunProfileBitset;
	/** Tests to run. Allowed to be from different controllers */
	tests: readonly InternalTestItem[];
	/** Tests to exclude. If not given, the current UI excluded tests are used */
	exclude?: InternalTestItem[];
	/** Whether this was triggered from an auto run. */
	continuous?: boolean;
}

export interface ITestFollowup {
	message: string;
	execute(): Promise<void>;
}

export interface ITestFollowups extends IDisposable {
	followups: ITestFollowup[];
}

export interface ITestService {
	readonly _serviceBrand: undefined;
	/**
	 * Fires when the user requests to cancel a test run -- or all runs, if no
	 * runId is given.
	 */
	readonly onDidCancelTestRun: Event<{ runId: string | undefined }>;

	/**
	 * Event that fires when the excluded tests change.
	 */
	readonly excluded: TestExclusions;

	/**
	 * Test collection instance.
	 */
	readonly collection: IMainThreadTestCollection;

	/**
	 * Event that fires immediately before a diff is processed.
	 */
	readonly onWillProcessDiff: Event<TestsDiff>;

	/**
	 * Event that fires after a diff is processed.
	 */
	readonly onDidProcessDiff: Event<TestsDiff>;

	/**
	 * Whether inline editor decorations should be visible.
	 */
	readonly showInlineOutput: MutableObservableValue<boolean>;

	/**
	 * Registers an interface that represents an extension host..
	 */
	registerExtHost(controller: IMainThreadTestHostProxy): IDisposable;

	/**
	 * Registers an interface that runs tests for the given provider ID.
	 */
	registerTestController(providerId: string, controller: IMainThreadTestController): IDisposable;

	/**
	 * Gets a registered test controller by ID.
	 */
	getTestController(controllerId: string): IMainThreadTestController | undefined;

	/**
	 * Refreshes tests for the controller, or all controllers if no ID is given.
	 */
	refreshTests(controllerId?: string): Promise<void>;

	/**
	 * Cancels any ongoing test refreshes.
	 */
	cancelRefreshTests(): void;

	/**
	 * Requests that tests be executed continuously, until the token is cancelled.
	 */
	startContinuousRun(req: ResolvedTestRunRequest, token: CancellationToken): Promise<void>;

	/**
	 * Requests that tests be executed.
	 */
	runTests(req: AmbiguousRunTestsRequest, token?: CancellationToken): Promise<ITestResult>;

	/**
	 * Requests that tests be executed.
	 */
	runResolvedTests(req: ResolvedTestRunRequest, token?: CancellationToken): Promise<ITestResult>;

	/**
	 * Provides followup actions for a test run.
	 */
	provideTestFollowups(req: TestMessageFollowupRequest, token: CancellationToken): Promise<ITestFollowups>;

	/**
	 * Ensures the test diff from the remote ext host is flushed and waits for
	 * any "busy" tests to become idle before resolving.
	 */
	syncTests(): Promise<void>;

	/**
	 * Cancels an ongoing test run by its ID, or all runs if no ID is given.
	 */
	cancelTestRun(runId?: string): void;

	/**
	 * Publishes a test diff for a controller.
	 */
	publishDiff(controllerId: string, diff: TestsDiff): void;
}
