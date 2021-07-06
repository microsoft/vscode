/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { MutableObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { AbstractIncrementalTestCollection, IncrementalTestCollectionItem, InternalTestItem, ITestIdWithSrc, RunTestForControllerRequest, RunTestsRequest, TestIdPath, TestItemExpandState, TestsDiff } from 'vs/workbench/contrib/testing/common/testCollection';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import * as extpath from 'vs/base/common/extpath';
import { Iterable } from 'vs/base/common/iterator';

export const ITestService = createDecorator<ITestService>('testService');

export interface MainTestController {
	expandTest(src: ITestIdWithSrc, levels: number): Promise<void>;
	runTests(request: RunTestForControllerRequest, token: CancellationToken): Promise<void>;
}

export type TestDiffListener = (diff: TestsDiff) => void;

export interface IMainThreadTestCollection extends AbstractIncrementalTestCollection<IncrementalTestCollectionItem> {
	onBusyProvidersChange: Event<number>;

	/**
	 * Number of providers working to discover tests.
	 */
	busyProviders: number;

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

/**
 * Iterates through the item and its parents to the root.
 */
export const getCollectionItemParents = function* (collection: IMainThreadTestCollection, item: InternalTestItem) {
	let i: InternalTestItem | undefined = item;
	while (i) {
		yield i;
		i = i.parent ? collection.getNodeById(i.parent) : undefined;
	}
};

const expandFirstLevel = (collection: IMainThreadTestCollection) =>
	Promise.all([...collection.rootItems].map(r => collection.expand(r.item.extId, 0)));

export const testCollectionIsEmpty = (collection: IMainThreadTestCollection) =>
	!Iterable.some(collection.rootItems, r => r.children.size > 0);

/**
 * Ensures the test with the given path exists in the collection, if possible.
 * If cancellation is requested, or the test cannot be found, it will return
 * undefined.
 */
export const getTestByPath = async (collection: IMainThreadTestCollection, idPath: TestIdPath, ct = CancellationToken.None) => {
	// Expand all direct children since roots might well have different IDs, but
	// children should start matching.
	await expandFirstLevel(collection);

	if (ct.isCancellationRequested) {
		return undefined;
	}

	let expandToLevel = 0;
	for (let i = idPath.length - 1; !ct.isCancellationRequested && i >= expandToLevel;) {
		const id = idPath[i];
		const existing = collection.getNodeById(id);
		if (!existing) {
			i--;
			continue;
		}

		if (i === idPath.length - 1) {
			return existing;
		}

		await collection.expand(id, 0);
		expandToLevel = i + 1; // avoid an infinite loop if the test does not exist
		i = idPath.length - 1;
	}
	return undefined;
};

/**
 * Waits for all test in the hierarchy to be fulfilled before returning.
 * If cancellation is requested, it will return early.
 */
export const getAllTestsInHierarchy = async (collection: IMainThreadTestCollection, ct = CancellationToken.None) => {
	if (ct.isCancellationRequested) {
		return;
	}

	let l: IDisposable;

	await Promise.race([
		Promise.all([...collection.rootItems].map(r => collection.expand(r.item.extId, Infinity))),
		new Promise(r => { l = ct.onCancellationRequested(r); }),
	]).finally(() => l?.dispose());
};

/**
 * Iterator that expands to and iterates through tests in the file. Iterates
 * in strictly descending order.
 */
export const testsInFile = async function* (collection: IMainThreadTestCollection, uri: URI) {
	// Expand all direct children since roots will not have URIs, but children should.
	await expandFirstLevel(collection);

	const demandUriStr = uri.toString();
	for (const test of collection.all) {
		if (!test.item.uri) {
			continue;
		}

		const itemUriStr = test.item.uri.toString();
		if (itemUriStr === demandUriStr) {
			yield test;
		}

		if (extpath.isEqualOrParent(demandUriStr, itemUriStr) && test.expand === TestItemExpandState.Expandable) {
			await collection.expand(test.item.extId, 1);
		}
	}
};

/**
 * An instance of the RootProvider should be registered for each extension
 * host.
 */
export interface ITestRootProvider {
	// todo: nothing, yet
}

export interface ITestService {
	readonly _serviceBrand: undefined;
	/**
	 * Fires when the user requests to cancel a test run -- or all runs, if no
	 * runId is given.
	 */
	readonly onDidCancelTestRun: Event<{ runId: string | undefined; }>;

	/**
	 * Set of test IDs the user asked to exclude.
	 */
	readonly excludeTests: MutableObservableValue<ReadonlySet<string>>;

	/**
	 * Test collection instance.
	 */
	readonly collection: IMainThreadTestCollection;

	/**
	 * Event that fires after a diff is processed.
	 */
	readonly onDidProcessDiff: Event<TestsDiff>;

	/**
	 * Sets whether a test is excluded.
	 */
	setTestExcluded(testId: string, exclude?: boolean): void;

	/**
	 * Removes all test exclusions.
	 */
	clearExcludedTests(): void;

	/**
	 * Registers an interface that runs tests for the given provider ID.
	 */
	registerTestController(providerId: string, controller: MainTestController): IDisposable;

	/**
	 * Requests that tests be executed.
	 */
	runTests(req: RunTestsRequest, token?: CancellationToken): Promise<ITestResult>;

	/**
	 * Cancels an ongoing test run by its ID, or all runs if no ID is given.
	 */
	cancelTestRun(runId?: string): void;

	/**
	 * Publishes a test diff for a controller.
	 */
	publishDiff(controllerId: string, diff: TestsDiff): void;

	/**
	 * Requests to resubscribe to all active subscriptions, discarding old tests.
	 */
	resubscribeToAllTests(): void;
}
