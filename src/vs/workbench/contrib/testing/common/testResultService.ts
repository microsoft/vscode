/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { StoredValue } from 'vs/workbench/contrib/testing/common/storedValue';
import { IncrementalTestCollectionItem, InternalTestItem, ITestState, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { maxPriority, statePriority, statesInOrder } from 'vs/workbench/contrib/testing/common/testingStates';
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

const makeNode = (
	collection: IMainThreadTestCollection,
	test: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
	byInternalId: Map<string, TestResultItem>,
): TestResultItem => {
	const existing = byInternalId.get(test.id);
	if (existing) {
		return existing;
	}

	const mapped: TestResultItem = {
		...test,
		// shallow-clone the test to take a 'snapshot' of it at the point in time where tests run
		item: { ...test.item },
		state: queuedState,
		computedState: TestRunState.Queued,
	};
	byExtId.set(mapped.item.extId, mapped);
	byInternalId.set(mapped.id, mapped);

	for (const childId of test.children) {
		const child = collection.getNodeById(childId);
		if (child) {
			makeNode(collection, child, byExtId, byInternalId);
		}
	}

	return mapped;
};

interface ISerializedResults {
	id: string;
	counts: TestStateCount;
	items: Iterable<[extId: string, item: TestResultItem]>;
}

interface TestResultItem extends InternalTestItem {
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
				if (node) {
					makeNode(collection, node, testByExtId, testByInternalId);
				}
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

	constructor(
		private readonly collections: ReadonlyArray<IMainThreadTestCollection>,
		private readonly testByExtId: Map<string, TestResultItem>,
		private readonly testByInternalId: Map<string, TestResultItem>,
	) {
		for (const test of this.testByInternalId.values()) {
			this.counts[test.state.state]++;
		}
	}

	/**
	 * @inheritdoc
	 */
	public getStateByExtId(extTestId: string) {
		return this.testByExtId.get(extTestId);
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
			this.refreshComputedState(entry);
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
				return makeNode(collection, test, this.testByExtId, this.testByInternalId);
			}
		}

		return undefined;
	}

	/**
	 * Gets the test computed state based on the node and the states of
	 * all its direct children.
	 */
	private refreshComputedStateFromChildren(node: TestResultItem) {
		node.computedState = node.state.state;

		for (const childId of node.item.children ?? []) {
			const child = this.testByInternalId.get(childId);
			if (child) {
				node.computedState = maxPriority(node.computedState, child.computedState);
			}
		}

		return node.computedState;
	}

	/**
	 * Updates the computed state of the node and all of its ancestors.
	 */
	private refreshComputedState(node: TestResultItem) {
		const oldPriority = statePriority[node.computedState];
		const newState = this.refreshComputedStateFromChildren(node);
		const newPriority = statePriority[newState];
		this.changeEmitter.fire(node);

		if (newPriority > oldPriority) {
			// Update all parents to ensure they're at least this priority.
			for (const parent of this.parentsOf(node)) {
				const prev = parent.computedState;
				if (statePriority[prev] >= newPriority) {
					break;
				}

				parent.computedState = newState;
				this.changeEmitter.fire(parent);
			}
		} else if (newPriority < oldPriority) {
			// Re-render all parents of this node whose computed priority might have come from this node
			for (const parent of this.parentsOf(node)) {
				const prev = parent.computedState;
				if (statePriority[prev] > oldPriority) {
					break;
				}

				parent.computedState = this.refreshComputedStateFromChildren(parent);
				this.changeEmitter.fire(parent);
			}
		}
	}

	/**
	 * Returns an iterator for all parents of the given test item.
	 */
	private *parentsOf(node: TestResultItem) {
		for (let parentId = node.parent; parentId;) {
			const parent = this.testByInternalId.get(parentId);
			if (!parent) {
				break;
			}

			yield parent;
			parentId = parent.parent;
		}
	}

	/**
	 * Notifies the service that all tests are complete.
	 */
	public markComplete() {
		if (this._complete) {
			throw new Error('cannot complete a test result multiple times');
		}

		// un-queue any tests that weren't explicitly updated
		for (const test of this.testByInternalId.values()) {
			if (test.state.state === TestRunState.Queued) {
				test.state = unsetState;
			}
		}

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

export interface ITestResultService {
	readonly _serviceBrand: undefined;
	/**
	 * Fired after a new event is added to the 'active' array.
	 */
	readonly onStartedTests: Event<LiveTestResult>;
	/**
	 * Fired when a test run finishes.
	 */
	readonly onCompletedTests: Event<LiveTestResult>;

	/**
	 * Fired when a test changed it state, or its computed state is updated.
	 */
	readonly onTestChanged: Event<[results: ITestResult, item: TestResultItem]>;

	/**
	 * List of known test results.
	 */
	readonly results: ReadonlyArray<ITestResult>;

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
	private newResultEmitter = new Emitter<LiveTestResult>();
	private completedEmitter = new Emitter<LiveTestResult>();
	private changeEmitter = new Emitter<[results: ITestResult, item: TestResultItem]>();

	/**
	 * @inheritdoc
	 */
	public readonly results: ITestResult[] = [];

	/**
	 * @inheritdoc
	 */
	public readonly onStartedTests = this.newResultEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onTestChanged = this.changeEmitter.event;

	/**
	 * @inheritdoc
	 */
	public readonly onCompletedTests = this.completedEmitter.event;

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
			if (lookup && lookup.state.state !== TestRunState.Unset) {
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
		result.onChange(t => this.changeEmitter.fire([result, t]), this.changeEmitter);
		this.isRunning.set(true);
		this.newResultEmitter.fire(result);
		return result;
	}

	/**
	 * @inheritdoc
	 */
	public getResult(id: string) {
		return this.results.find(r => r.id === id);
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
		this.completedEmitter.fire(result);
	}
}
