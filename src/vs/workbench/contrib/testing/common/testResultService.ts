/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { IncrementalTestCollectionItem, ITestState, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { statesInOrder } from 'vs/workbench/contrib/testing/common/testingStates';
import { IMainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testService';

/**
 * Count of the number of tests in each run state.
 */
export type TestStateCount = { [K in TestRunState]: number };

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
	 * Gets whether the test run has finished.
	 */
	readonly isComplete: boolean;

	/**
	 * Gets the state of the test by its extension-assigned ID.
	 */
	getStateByExtId(testExtId: string): TestResultItem | undefined;

	/**
	 * Serializes the test result. Used to save and restore results
	 * in the workspace.
	 */
	toJSON(): ISerializedResults;
}

const makeEmptyCounts = () => {
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
	byInternalId: Map<string, TestResultItem>,
): TestResultItem => {
	const n: TestResultItem = {
		...item,
		// shallow-clone the test to take a 'snapshot' of it at the point in time where tests run
		item: { ...item.item },
		state: unsetState,
		computedState: TestRunState.Unset,
	};

	byExtId.set(n.item.extId, n);
	byInternalId.set(n.id, n);

	return n;
};

const makeParents = (
	collection: IMainThreadTestCollection,
	child: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
	byInternalId: Map<string, TestResultItem>,
) => {
	const parent = child.parent && collection.getNodeById(child.parent);
	if (!parent) {
		return;
	}

	let parentResultItem = byInternalId.get(parent.id);
	if (parentResultItem) {
		parentResultItem.children.add(child.id);
		return; // no need to recurse, all parents already in result
	}

	parentResultItem = itemToNode(parent, byExtId, byInternalId);
	parentResultItem.children = new Set([child.id]);
	makeParents(collection, parent, byExtId, byInternalId);
};

const makeNodeAndChildren = (
	collection: IMainThreadTestCollection,
	test: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
	byInternalId: Map<string, TestResultItem>,
): TestResultItem => {
	const existing = byInternalId.get(test.id);
	if (existing) {
		return existing;
	}

	const mapped = itemToNode(test, byExtId, byInternalId);
	for (const childId of test.children) {
		const child = collection.getNodeById(childId);
		if (child) {
			makeNodeAndChildren(collection, child, byExtId, byInternalId);
		}
	}

	return mapped;
};

interface ISerializedResults {
	id: string;
	counts: TestStateCount;
	items: Iterable<[extId: string, item: TestResultItem]>;
}

interface TestResultItem extends IncrementalTestCollectionItem {
	state: ITestState;
	computedState: TestRunState;
}

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
		tests: ReadonlyArray<TestIdWithProvider>,
	) {
		const testByExtId = new Map<string, TestResultItem>();
		const testByInternalId = new Map<string, TestResultItem>();
		for (const test of tests) {
			for (const collection of collections) {
				const node = collection.getNodeById(test.testId);
				if (!node) {
					continue;
				}

				makeNodeAndChildren(collection, node, testByExtId, testByInternalId);
				makeParents(collection, node, testByExtId, testByInternalId);
			}
		}

		return new LiveTestResult(collections, testByExtId, testByInternalId);
	}

	private readonly completeEmitter = new Emitter<void>();
	private readonly changeEmitter = new Emitter<TestResultItem>();
	private _complete = false;

	public readonly onChange = this.changeEmitter.event;
	public readonly onComplete = this.completeEmitter.event;

	/**
	 * Unique ID for referring to this set of test results.
	 */
	public readonly id = generateUuid();

	/**
	 * @inheritdoc
	 */
	public get isComplete() {
		return this._complete;
	}

	/**
	 * @inheritdoc
	 */
	public readonly counts: { [K in TestRunState]: number } = makeEmptyCounts();

	/**
	 * Gets all tests involved in the run by ID.
	 */
	public get tests() {
		return this.testByInternalId.values();
	}

	private readonly computedStateAccessor: IComputedStateAccessor<TestResultItem> = {
		getOwnState: i => i.state.state,
		getCurrentComputedState: i => i.computedState,
		setComputedState: (i, s) => i.computedState = s,
		getChildren: i => {
			const { testByInternalId } = this;
			return (function* () {
				for (const childId of i.children) {
					const child = testByInternalId.get(childId);
					if (child) {
						yield child;
					}
				}
			})();
		},
		getParents: i => {
			const { testByInternalId } = this;
			return (function* () {
				for (let parentId = i.parent; parentId;) {
					const parent = testByInternalId.get(parentId);
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
		private readonly testByExtId: Map<string, TestResultItem>,
		private readonly testByInternalId: Map<string, TestResultItem>,
	) {
		this.counts[TestRunState.Unset] = testByInternalId.size;
	}

	/**
	 * @inheritdoc
	 */
	public getStateByExtId(extTestId: string) {
		return this.testByExtId.get(extTestId);
	}

	/**
	 * Updates all tests in the collection to the given state.
	 */
	public setAllToState(state: ITestState, when: (_t: TestResultItem) => boolean) {
		for (const test of this.testByInternalId.values()) {
			if (when(test)) {
				this.counts[state.state]--;
				test.state = state;
				this.counts[state.state]++;
				refreshComputedState(this.computedStateAccessor, test, t => this.changeEmitter.fire(t));
			}
		}
	}

	/**
	 * Updates the state of the test by its internal ID.
	 */
	public updateState(testId: string, state: ITestState) {
		let entry = this.testByInternalId.get(testId);
		if (!entry) {
			entry = this.addTestToRun(testId);
		}
		if (!entry) {
			return;
		}

		if (state.state === entry.state.state) {
			entry.state = state;
			this.changeEmitter.fire(entry);
		} else {
			this.counts[entry.state.state]--;
			entry.state = state;
			this.counts[entry.state.state]++;
			refreshComputedState(this.computedStateAccessor, entry, t => this.changeEmitter.fire(t));
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
				return makeNodeAndChildren(collection, test, this.testByExtId, this.testByInternalId);
			}
		}

		return undefined;
	}

	/**
	 * Notifies the service that all tests are complete.
	 */
	public markComplete() {
		if (this._complete) {
			throw new Error('cannot complete a test result multiple times');
		}

		// un-queue any tests that weren't explicitly updated
		this.setAllToState(unsetState, t => t.state.state === TestRunState.Queued);
		this._complete = true;
		this.completeEmitter.fire();
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedResults {
		return { id: this.id, counts: this.counts, items: [...this.testByExtId.entries()] };
	}
}

/**
 * Test results hydrated from a previously-serialized test run.
 */
class HydratedTestResult implements ITestResult {
	/**
	 * @inheritdoc
	 */
	public readonly counts = this.serialized.counts;

	/**
	 * @inheritdoc
	 */
	public readonly id = this.serialized.id;

	/**
	 * @inheritdoc
	 */
	public readonly isComplete = true;

	private readonly map = new Map<string, TestResultItem>();

	constructor(private readonly serialized: ISerializedResults) {
		for (const [key, value] of serialized.items) {
			this.map.set(key, value);

			for (const message of value.state.messages) {
				if (message.location) {
					message.location.uri = URI.revive(message.location.uri);
				}
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	public getStateByExtId(extTestId: string) {
		return this.map.get(extTestId);
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedResults {
		return this.serialized;
	}
}

export type ResultChangeEvent =
	| { completed: LiveTestResult }
	| { started: LiveTestResult }
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
	readonly onTestChanged: Event<[results: ITestResult, item: TestResultItem]>;

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
	push(result: LiveTestResult): LiveTestResult;

	/**
	 * Looks up a set of test results by ID.
	 */
	getResult(resultId: string): ITestResult | undefined;

	/**
	 * Looks up a test's most recent state, by its extension-assigned ID.
	 */
	getStateByExtId(extId: string): [results: ITestResult, item: TestResultItem] | undefined;
}

export const ITestResultService = createDecorator<ITestResultService>('testResultService');

const RETAIN_LAST_RESULTS = 64;

export class TestResultService implements ITestResultService {
	declare _serviceBrand: undefined;
	private changeResultEmitter = new Emitter<ResultChangeEvent>();
	private testChangeEmitter = new Emitter<[results: ITestResult, item: TestResultItem]>();

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
	private readonly serializedResults: StoredValue<ISerializedResults[]>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService, @IStorageService storage: IStorageService) {
		this.isRunning = TestingContextKeys.isRunning.bindTo(contextKeyService);
		this.serializedResults = new StoredValue({
			key: 'testResults',
			scope: StorageScope.WORKSPACE,
			target: StorageTarget.MACHINE
		}, storage);

		for (const value of this.serializedResults.get([])) {
			this.results.push(new HydratedTestResult(value));
		}
	}

	/**
	 * @inheritdoc
	 */
	public getStateByExtId(extId: string): [results: ITestResult, item: TestResultItem] | undefined {
		for (const result of this.results) {
			const lookup = result.getStateByExtId(extId);
			if (lookup && lookup.computedState !== TestRunState.Unset) {
				return [result, lookup];
			}
		}

		return undefined;
	}

	/**
	 * @inheritdoc
	 */
	public push(result: LiveTestResult): LiveTestResult {
		this.results.unshift(result);
		if (this.results.length > RETAIN_LAST_RESULTS) {
			this.results.pop();
		}

		result.onComplete(() => this.onComplete(result));
		result.onChange(t => this.testChangeEmitter.fire([result, t]), this.testChangeEmitter);
		this.isRunning.set(true);
		this.changeResultEmitter.fire({ started: result });
		result.setAllToState(queuedState, () => true);
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
			if (result.isComplete) {
				removed.push(result);
			} else {
				keep.push(result);
			}
		}

		this.results = keep;
		this.serializedResults.store(this.results.map(r => r.toJSON()));
		this.changeResultEmitter.fire({ removed });
	}

	private onComplete(result: LiveTestResult) {
		// move the complete test run down behind any still-running ones
		for (let i = 0; i < this.results.length - 2; i++) {
			if (this.results[i].isComplete && !this.results[i + 1].isComplete) {
				[this.results[i], this.results[i + 1]] = [this.results[i + 1], this.results[i]];
			}
		}

		this.isRunning.set(!this.results[0]?.isComplete);
		this.serializedResults.store(this.results.map(r => r.toJSON()));
		this.changeResultEmitter.fire({ completed: result });
	}
}
