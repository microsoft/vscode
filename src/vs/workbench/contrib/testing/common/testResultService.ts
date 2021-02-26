/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findFirstInSorted } from 'vs/base/common/arrays';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Lazy } from 'vs/base/common/lazy';
import { equals } from 'vs/base/common/objects';
import { isDefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { Range } from 'vs/editor/common/core/range';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { IncrementalTestCollectionItem, ISerializedTestResults, ITestState, RunTestsRequest, TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { statesInOrder } from 'vs/workbench/contrib/testing/common/testingStates';
import { IMainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testService';

/**
 * Count of the number of tests in each run state.
 */
export type TestStateCount = { [K in TestRunState]: number };

export const enum TestResultItemChangeReason {
	Retired,
	ParentRetired,
	ComputedStateChange,
	OwnStateChange,
}

export type TestResultItemChange = { item: TestResultItem; result: ITestResult } & (
	| { reason: TestResultItemChangeReason.Retired | TestResultItemChangeReason.ParentRetired | TestResultItemChangeReason.ComputedStateChange }
	| { reason: TestResultItemChangeReason.OwnStateChange; previous: ITestState }
);

export interface ITestResult {
	/**
	 * Count of the number of tests in each run state.
	 */
	readonly counts: Readonly<TestStateCount>;

	/**
	 * Unique ID of this set of test results.
	 */
	readonly id: string;

	/**
	 * If the test is completed, the unix milliseconds time at which it was
	 * completed. If undefined, the test is still running.
	 */
	readonly completedAt: number | undefined;

	/**
	 * Whether this test result is triggered from an auto run.
	 */
	readonly isAutoRun?: boolean;

	/**
	 * Gets all tests involved in the run.
	 */
	tests: IterableIterator<TestResultItem>;

	/**
	 * Gets the state of the test by its extension-assigned ID.
	 */
	getStateById(testExtId: string): TestResultItem | undefined;

	/**
	 * Serializes the test result. Used to save and restore results
	 * in the workspace.
	 */
	toJSON(): ISerializedTestResults | undefined;
}

export const makeEmptyCounts = () => {
	const o: Partial<TestStateCount> = {};
	for (const state of statesInOrder) {
		o[state] = 0;
	}

	return o as TestStateCount;
};

export const sumCounts = (counts: Iterable<TestStateCount>) => {
	const total = makeEmptyCounts();
	for (const count of counts) {
		for (const state of statesInOrder) {
			total[state] += count[state];
		}
	}

	return total;
};

const queuedState: ITestState = {
	duration: undefined,
	messages: [],
	state: TestRunState.Queued
};

const unsetState: ITestState = {
	duration: undefined,
	messages: [],
	state: TestRunState.Unset
};

const itemToNode = (
	item: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
): TestResultItem => {
	const n: TestResultItem = {
		...item,
		// shallow-clone the test to take a 'snapshot' of it at the point in time where tests run
		item: { ...item.item },
		state: unsetState,
		computedState: TestRunState.Unset,
		retired: false,
	};

	byExtId.set(n.item.extId, n);

	return n;
};

const makeParents = (
	collection: IMainThreadTestCollection,
	child: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
) => {
	const parent = child.parent && collection.getNodeById(child.parent);
	if (!parent) {
		return;
	}

	let parentResultItem = byExtId.get(parent.item.extId);
	if (parentResultItem) {
		parentResultItem.children.add(child.item.extId);
		return; // no need to recurse, all parents already in result
	}

	parentResultItem = itemToNode(parent, byExtId);
	parentResultItem.children = new Set([child.item.extId]);
	makeParents(collection, parent, byExtId);
};

const makeNodeAndChildren = (
	collection: IMainThreadTestCollection,
	test: IncrementalTestCollectionItem,
	excluded: ReadonlySet<string>,
	byExtId: Map<string, TestResultItem>,
	isExecutedDirectly = true,
): TestResultItem => {
	const existing = byExtId.get(test.item.extId);
	if (existing) {
		return existing;
	}

	const mapped = itemToNode(test, byExtId);
	if (isExecutedDirectly) {
		mapped.direct = true;
	}

	for (const childId of test.children) {
		const child = collection.getNodeById(childId);
		if (child && !excluded.has(childId)) {
			makeNodeAndChildren(collection, child, excluded, byExtId, false);
		}
	}

	return mapped;
};

/**
 * Results of a test. These are created when the test initially started running
 * and marked as "complete" when the run finishes.
 */
export class LiveTestResult implements ITestResult {
	/**
	 * Creates a new TestResult, pulling tests from the associated list
	 * of collections.
	 */
	public static from(
		collections: ReadonlyArray<IMainThreadTestCollection>,
		req: RunTestsRequest,
	) {
		const testByExtId = new Map<string, TestResultItem>();
		const excludeSet = new Set<string>(req.exclude);
		for (const test of req.tests) {
			for (const collection of collections) {
				const node = collection.getNodeById(test.testId);
				if (!node) {
					continue;
				}

				makeNodeAndChildren(collection, node, excludeSet, testByExtId);
				makeParents(collection, node, testByExtId);
			}
		}

		return new LiveTestResult(collections, testByExtId, excludeSet, !!req.isAutoRun);
	}

	private readonly completeEmitter = new Emitter<void>();
	private readonly changeEmitter = new Emitter<TestResultItemChange>();
	private _completedAt?: number;

	public readonly onChange = this.changeEmitter.event;
	public readonly onComplete = this.completeEmitter.event;

	/**
	 * Unique ID for referring to this set of test results.
	 */
	public readonly id = generateUuid();

	/**
	 * @inheritdoc
	 */
	public get completedAt() {
		return this._completedAt;
	}

	/**
	 * @inheritdoc
	 */
	public readonly counts: { [K in TestRunState]: number } = makeEmptyCounts();

	/**
	 * @inheritdoc
	 */
	public get tests() {
		return this.testById.values();
	}

	private readonly computedStateAccessor: IComputedStateAccessor<TestResultItem> = {
		getOwnState: i => i.state.state,
		getCurrentComputedState: i => i.computedState,
		setComputedState: (i, s) => i.computedState = s,
		getChildren: i => {
			const { testById: testByExtId } = this;
			return (function* () {
				for (const childId of i.children) {
					const child = testByExtId.get(childId);
					if (child) {
						yield child;
					}
				}
			})();
		},
		getParents: i => {
			const { testById: testByExtId } = this;
			return (function* () {
				for (let parentId = i.parent; parentId;) {
					const parent = testByExtId.get(parentId);
					if (!parent) {
						break;
					}

					yield parent;
					parentId = parent.parent;
				}
			})();
		},
	};

	constructor(
		private readonly collections: ReadonlyArray<IMainThreadTestCollection>,
		private readonly testById: Map<string, TestResultItem>,
		private readonly excluded: ReadonlySet<string>,
		public readonly isAutoRun: boolean,
	) {
		this.counts[TestRunState.Unset] = testById.size;
	}

	/**
	 * @inheritdoc
	 */
	public getStateById(extTestId: string) {
		return this.testById.get(extTestId);
	}

	/**
	 * Updates all tests in the collection to the given state.
	 */
	public setAllToState(state: ITestState, when: (_t: TestResultItem) => boolean) {
		for (const test of this.testById.values()) {
			if (when(test)) {
				this.fireUpdateAndRefresh(test, state);
			}
		}
	}

	/**
	 * Updates the state of the test by its internal ID.
	 */
	public updateState(testId: string, state: ITestState) {
		let entry = this.testById.get(testId);
		if (!entry) {
			entry = this.addTestToRun(testId);
		}
		if (!entry) {
			return;
		}

		this.fireUpdateAndRefresh(entry, state);
	}

	private fireUpdateAndRefresh(entry: TestResultItem, newState: ITestState) {
		const previous = entry.state;
		entry.state = newState;

		if (newState.state !== previous.state) {
			this.counts[previous.state]--;
			this.counts[newState.state]++;
			refreshComputedState(this.computedStateAccessor, entry, t => (
				t !== entry && this.changeEmitter.fire({ item: t, result: this, reason: TestResultItemChangeReason.ComputedStateChange })
			));
		}

		this.changeEmitter.fire({ item: entry, result: this, reason: TestResultItemChangeReason.OwnStateChange, previous });
	}

	/**
	 * Marks a test as retired. This can trigger it to be re-run in live mode.
	 */
	public retire(testId: string) {
		const root = this.testById.get(testId);
		if (!root || root.retired) {
			return;
		}

		const queue: Iterable<string>[] = [[root.item.extId]];
		while (queue.length) {
			for (const id of queue.pop()!) {
				const entry = this.testById.get(id);
				if (entry && !entry.retired) {
					entry.retired = true;
					queue.push(entry.children);
					this.changeEmitter.fire({
						result: this,
						item: entry,
						reason: entry === root
							? TestResultItemChangeReason.Retired
							: TestResultItemChangeReason.ParentRetired
					});
				}
			}
		}
	}

	/**
	 * Adds a test, by its ID, to the test run. This can end up being called
	 * if tests were started while discovery was still happening, so initially
	 * we didn't serialize/capture the test.
	 */
	private addTestToRun(testId: string) {
		for (const collection of this.collections) {
			let test = collection.getNodeById(testId);
			if (test) {
				const originalSize = this.testById.size;
				makeParents(collection, test, this.testById);
				const node = makeNodeAndChildren(collection, test, this.excluded, this.testById);
				this.counts[TestRunState.Unset] += this.testById.size - originalSize;
				return node;
			}
		}

		return undefined;
	}

	/**
	 * Notifies the service that all tests are complete.
	 */
	public markComplete() {
		if (this._completedAt !== undefined) {
			throw new Error('cannot complete a test result multiple times');
		}

		// un-queue any tests that weren't explicitly updated
		this.setAllToState(unsetState, t => t.state.state === TestRunState.Queued);
		this._completedAt = Date.now();
		this.completeEmitter.fire();
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedTestResults | undefined {
		return this.completedAt ? this.doSerialize.getValue() : undefined;
	}

	private readonly doSerialize = new Lazy((): ISerializedTestResults => ({
		id: this.id,
		completedAt: this.completedAt!,
		items: [...this.testById.values()].map(entry => ({
			...entry,
			retired: undefined,
			children: [...entry.children],
		})),
	}));
}

/**
 * Test results hydrated from a previously-serialized test run.
 */
export class HydratedTestResult implements ITestResult {
	/**
	 * @inheritdoc
	 */
	public readonly counts = makeEmptyCounts();

	/**
	 * @inheritdoc
	 */
	public readonly id: string;

	/**
	 * @inheritdoc
	 */
	public readonly completedAt: number;

	/**
	 * @inheritdoc
	 */
	public get tests() {
		return this.testById.values();
	}

	private readonly testById = new Map<string, TestResultItem>();

	constructor(private readonly serialized: ISerializedTestResults, private readonly persist = true) {
		this.id = serialized.id;
		this.completedAt = serialized.completedAt;

		for (const item of serialized.items) {
			const cast: TestResultItem = { ...item, retired: true, children: new Set(item.children) };
			if (cast.item.location) {
				cast.item.location.uri = URI.revive(cast.item.location.uri);
				cast.item.location.range = Range.lift(cast.item.location.range);
			}

			for (const message of cast.state.messages) {
				if (message.location) {
					message.location.uri = URI.revive(message.location.uri);
					message.location.range = Range.lift(message.location.range);
				}
			}

			this.counts[item.state.state]++;
			this.testById.set(item.item.extId, cast);
		}
	}

	/**
	 * @inheritdoc
	 */
	public getStateById(extTestId: string) {
		return this.testById.get(extTestId);
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedTestResults | undefined {
		return this.persist ? this.serialized : undefined;
	}
}

export type ResultChangeEvent =
	| { completed: LiveTestResult }
	| { started: LiveTestResult }
	| { inserted: ITestResult }
	| { removed: ITestResult[] };

export interface ITestResultService {
	readonly _serviceBrand: undefined;
	/**
	 * Fired after any results are added, removed, or completed.
	 */
	readonly onResultsChanged: Event<ResultChangeEvent>;

	/**
	 * Fired when a test changed it state, or its computed state is updated.
	 */
	readonly onTestChanged: Event<TestResultItemChange>;

	/**
	 * List of known test results.
	 */
	readonly results: ReadonlyArray<ITestResult>;

	/**
	 * Discards all completed test results.
	 */
	clear(): void;

	/**
	 * Adds a new test result to the collection.
	 */
	push<T extends ITestResult>(result: T): T;

	/**
	 * Looks up a set of test results by ID.
	 */
	getResult(resultId: string): ITestResult | undefined;

	/**
	 * Looks up a test's most recent state, by its extension-assigned ID.
	 */
	getStateById(extId: string): [results: ITestResult, item: TestResultItem] | undefined;
}

export const ITestResultService = createDecorator<ITestResultService>('testResultService');

const RETAIN_LAST_RESULTS = 64;

/**
 * Returns if the tests in the results are exactly equal. Check the counts
 * first as a cheap check before starting to iterate.
 */
const resultsEqual = (a: ITestResult, b: ITestResult) =>
	a.completedAt === b.completedAt && equals(a.counts, b.counts) && Iterable.equals(a.tests, b.tests,
		(at, bt) => equals(at.state, bt.state) && equals(at.item, bt.item));

export class TestResultService implements ITestResultService {
	declare _serviceBrand: undefined;
	private changeResultEmitter = new Emitter<ResultChangeEvent>();
	private testChangeEmitter = new Emitter<TestResultItemChange>();

	/**
	 * @inheritdoc
	 */
	public results: ITestResult[] = [];

	/**
	 * @inheritdoc
	 */
	public readonly onResultsChanged = this.changeResultEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onTestChanged = this.testChangeEmitter.event;

	private readonly isRunning: IContextKey<boolean>;
	private readonly serializedResults: StoredValue<ISerializedTestResults[]>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService, @IStorageService storage: IStorageService) {
		this.isRunning = TestingContextKeys.isRunning.bindTo(contextKeyService);
		this.serializedResults = new StoredValue({
			key: 'testResults',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE
		}, storage);

		try {
			for (const value of this.serializedResults.get([])) {
				// todo@connor4312: temp to migrate old insiders
				if (value.completedAt) {
					this.results.push(new HydratedTestResult(value));
				}
			}
		} catch (e) {
			// outdated structure
		}
	}

	/**
	 * @inheritdoc
	 */
	public getStateById(extId: string): [results: ITestResult, item: TestResultItem] | undefined {
		for (const result of this.results) {
			const lookup = result.getStateById(extId);
			if (lookup && lookup.computedState !== TestRunState.Unset) {
				return [result, lookup];
			}
		}

		return undefined;
	}

	/**
	 * @inheritdoc
	 */
	public push<T extends ITestResult>(result: T): T {
		if (result.completedAt === undefined) {
			this.results.unshift(result);
		} else {
			const index = findFirstInSorted(this.results, r => r.completedAt !== undefined && r.completedAt <= result.completedAt!);
			const prev = this.results[index];
			if (prev && resultsEqual(result, prev)) {
				return result;
			}

			this.results.splice(index, 0, result);
			this.persist();
		}

		if (this.results.length > RETAIN_LAST_RESULTS) {
			this.results.pop();
		}

		if (result instanceof LiveTestResult) {
			result.onComplete(() => this.onComplete(result));
			result.onChange(this.testChangeEmitter.fire, this.testChangeEmitter);
			this.isRunning.set(true);
			this.changeResultEmitter.fire({ started: result });
			result.setAllToState(queuedState, () => true);
		} else {
			this.changeResultEmitter.fire({ inserted: result });
			// If this is not a new result, go through each of its tests. For each
			// test for which the new result is the most recently inserted, fir
			// a change event so that UI updates.
			for (const item of result.tests) {
				for (const otherResult of this.results) {
					if (otherResult === result) {
						this.testChangeEmitter.fire({ item, result, reason: TestResultItemChangeReason.ComputedStateChange });
						break;
					} else if (otherResult.getStateById(item.item.extId) !== undefined) {
						break;
					}
				}
			}
		}

		return result;
	}

	/**
	 * @inheritdoc
	 */
	public getResult(id: string) {
		return this.results.find(r => r.id === id);
	}

	/**
	 * @inheritdoc
	 */
	public clear() {
		const keep: ITestResult[] = [];
		const removed: ITestResult[] = [];
		for (const result of this.results) {
			if (result.completedAt !== undefined) {
				removed.push(result);
			} else {
				keep.push(result);
			}
		}

		this.results = keep;
		this.persist();
		this.changeResultEmitter.fire({ removed });
	}

	private onComplete(result: LiveTestResult) {
		this.resort();
		this.updateIsRunning();
		this.persist();
		this.changeResultEmitter.fire({ completed: result });
	}

	private resort() {
		this.results.sort((a, b) => (b.completedAt ?? Number.MAX_SAFE_INTEGER) - (a.completedAt ?? Number.MAX_SAFE_INTEGER));
	}

	private updateIsRunning() {
		this.isRunning.set(this.results.length > 0 && this.results[0].completedAt === undefined);
	}

	private persist() {
		this.serializedResults.store(this.results.map(r => r.toJSON()).filter(isDefined));
	}
}
