/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../base/common/assert.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { MarshalledId } from '../../../../base/common/marshallingIds.js';
import { IObservable } from '../../../../base/common/observable.js';
import { IPrefixTreeNode, WellDefinedPrefixTree } from '../../../../base/common/prefixTree.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Location } from '../../../../editor/common/languages.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { MutableObservableValue } from './observableValue.js';
import { TestExclusions } from './testExclusions.js';
import { TestId } from './testId.js';
import { ITestResult } from './testResult.js';
import { AbstractIncrementalTestCollection, ICallProfileRunHandler, IncrementalTestCollectionItem, InternalTestItem, IStartControllerTests, IStartControllerTestsResult, ITestItemContext, ResolvedTestRunRequest, TestControllerCapability, TestItemExpandState, TestMessageFollowupRequest, TestMessageFollowupResponse, TestRunProfileBitset, TestsDiff } from './testTypes.js';

export const ITestService = createDecorator<ITestService>('testService');

export interface IMainThreadTestController {
	readonly id: string;
	readonly label: IObservable<string>;
	readonly capabilities: IObservable<TestControllerCapability>;
	syncTests(token: CancellationToken): Promise<void>;
	refreshTests(token: CancellationToken): Promise<void>;
	configureRunProfile(profileId: number): void;
	expandTest(id: string, levels: number): Promise<void>;
	getRelatedCode(testId: string, token: CancellationToken): Promise<Location[]>;
	startContinuousRun(request: ICallProfileRunHandler[], token: CancellationToken): Promise<IStartControllerTestsResult[]>;
	runTests(request: IStartControllerTests[], token: CancellationToken): Promise<IStartControllerTestsResult[]>;
}

export interface IMainThreadTestHostProxy {
	provideTestFollowups(req: TestMessageFollowupRequest, token: CancellationToken): Promise<TestMessageFollowupResponse[]>;
	getTestsRelatedToCode(uri: URI, position: Position, token: CancellationToken): Promise<string[]>;
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
	const queue = new LinkedList<Iterable<string>>();

	const existing = [...testService.collection.getNodeByUrl(uri)];
	queue.push(existing.length ? existing.map(e => e.item.extId) : testService.collection.rootIds);

	let n = 0;
	while (queue.size > 0) {
		for (const id of queue.pop()!) {
			n++;
			const test = testService.collection.getNodeById(id);
			if (!test) {
				continue; // possible because we expand async and things could delete
			}

			if (!test.item.uri) {
				queue.push(test.children);
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

				if (test.children.size) {
					queue.push(test.children);
				}
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
 * Simplifies the array of tests by preferring test item parents if all of
 * their children are included.
 */
export const simplifyTestsToExecute = (collection: IMainThreadTestCollection, tests: IncrementalTestCollectionItem[]): IncrementalTestCollectionItem[] => {
	if (tests.length < 2) {
		return tests;
	}

	const tree = new WellDefinedPrefixTree<IncrementalTestCollectionItem>();
	for (const test of tests) {
		tree.insert(TestId.fromString(test.item.extId).path, test);
	}

	const out: IncrementalTestCollectionItem[] = [];

	// Returns the node if it and any children should be included. Otherwise
	// pushes into the `out` any individual children that should be included.
	const process = (currentId: string[], node: IPrefixTreeNode<IncrementalTestCollectionItem>) => {
		// directly included, don't try to over-specify, and children should be ignored
		if (node.value) {
			return node.value;
		}

		assert(!!node.children, 'expect to have children');

		const thisChildren: IncrementalTestCollectionItem[] = [];
		for (const [part, child] of node.children) {
			currentId.push(part);
			const c = process(currentId, child);
			if (c) { thisChildren.push(c); }
			currentId.pop();
		}

		if (!thisChildren.length) {
			return;
		}

		// If there are multiple children and we have all of them, then tell the
		// parent this node should be included. Otherwise include children individually.
		const id = new TestId(currentId);
		const test = collection.getNodeById(id.toString());
		if (test?.children.size === thisChildren.length) {
			return test;
		}

		out.push(...thisChildren);
		return;
	};

	for (const [id, node] of tree.entries) {
		const n = process([id], node);
		if (n) { out.push(n); }
	}

	return out;
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
	readonly onDidCancelTestRun: Event<{ runId: string | undefined; taskId: string | undefined }>;

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
	cancelTestRun(runId?: string, taskId?: string): void;

	/**
	 * Publishes a test diff for a controller.
	 */
	publishDiff(controllerId: string, diff: TestsDiff): void;

	/**
	 * Gets all tests related to the given code position.
	 */
	getTestsRelatedToCode(uri: URI, position: Position, token?: CancellationToken): Promise<InternalTestItem[]>;

	/**
	 * Gets code related to the given test item.
	 */
	getCodeRelatedToTest(test: InternalTestItem, token?: CancellationToken): Promise<Location[]>;
}
