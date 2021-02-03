/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { generateUuid } from 'vs/base/common/uuid';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TestRunState } from 'vs/workbench/api/common/extHostTypes';
import { IncrementalTestCollectionItem, InternalTestItemWithChildren, TestIdWithProvider } from 'vs/workbench/contrib/testing/common/testCollection';
import { TestingContextKeys } from 'vs/workbench/contrib/testing/common/testingContextKeys';
import { isRunningState, statesInOrder } from 'vs/workbench/contrib/testing/common/testingStates';
import { IMainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testService';

export type TestStateCount = { [K in TestRunState]: number };

const makeEmptyCounts = () => {
	const o: Partial<TestStateCount> = {};
	for (const state of statesInOrder) {
		o[state] = 0;
	}

	return o as TestStateCount;
};

export const sumCounts = (counts: TestStateCount[]) => {
	const total = makeEmptyCounts();
	for (const count of counts) {
		for (const state of statesInOrder) {
			total[state] += count[state];
		}
	}

	return total;
};

const makeNode = (
	collection: IMainThreadTestCollection,
	test: IncrementalTestCollectionItem,
): TestResultItem => {
	const mapped: TestResultItem = { ...test, children: [] };
	for (const childId of test.children) {
		const child = collection.getNodeById(childId);
		if (child) {
			mapped.children.push(makeNode(collection, child));
		}
	}

	return mapped;
};

export interface TestResultItem extends InternalTestItemWithChildren { }

/**
 * Results of a test. These are created when the test initially started running
 * and marked as "complete" when the run finishes.
 */
export class TestResult {
	/**
	 * Creates a new TestResult, pulling tests from the associated list
	 * of collections.
	 */
	public static from(
		collections: ReadonlyArray<IMainThreadTestCollection>,
		tests: ReadonlyArray<TestIdWithProvider>,
	) {
		const mapped: TestResultItem[] = [];
		for (const test of tests) {
			for (const collection of collections) {
				const node = collection.getNodeById(test.testId);
				if (node) {
					mapped.push(makeNode(collection, node));
					break;
				}
			}
		}

		return new TestResult(mapped);
	}

	private completeEmitter = new Emitter<void>();
	private changeEmitter = new Emitter<void>();
	private _complete = false;
	private _cachedCounts?: { [K in TestRunState]: number };

	public onChange = this.changeEmitter.event;
	public onComplete = this.completeEmitter.event;

	/**
	 * Unique ID for referring to this set of test results.
	 */
	public readonly id = generateUuid();

	/**
	 * Gets whether the test run has finished.
	 */
	public get isComplete() {
		return this._complete;
	}

	/**
	 * Gets a count of tests in each state.
	 */
	public get counts() {
		if (this._cachedCounts) {
			return this._cachedCounts;
		}

		const counts = makeEmptyCounts();
		this.forEachTest(({ item }) => {
			counts[item.state.runState]++;
		});

		if (this._complete) {
			this._cachedCounts = counts;
		}

		return counts;
	}

	constructor(public readonly tests: TestResultItem[]) { }


	/**
	 * Notifies the service that all tests are complete.
	 */
	public markComplete() {
		if (this._complete) {
			throw new Error('cannot complete a test result multiple times');
		}

		// shallow clone test items to 'disconnect' them from the underlying
		// connection and stop state changes. Also, marked any still-running
		// tests as skipped.
		this.forEachTest(test => {
			test.item = { ...test.item };
			if (isRunningState(test.item.state.runState)) {
				test.item.state = { ...test.item.state, runState: TestRunState.Skipped };
			}
		});

		this._complete = true;
		this.completeEmitter.fire();
	}

	/**
	 * Fires the 'change' event, should be called by the runner.
	 */
	public notifyChanged() {
		this.changeEmitter.fire();
	}

	private forEachTest(fn: (test: TestResultItem) => void) {
		const queue = [this.tests];
		while (queue.length) {
			for (const test of queue.pop()!) {
				fn(test);
				queue.push(test.children);
			}
		}
	}
}

export interface ITestResultService {
	readonly _serviceBrand: undefined;

	/**
	 * List of test results. Currently running tests are always at the top.
	 */
	readonly results: TestResult[];

	/**
	 * Fired after a new event is added to the 'active' array.
	 */
	readonly onNewTestResult: Event<TestResult>;

	/**
	 * Adds a new test result to the collection.
	 */
	push(result: TestResult): TestResult;

	/**
	 * Looks up a set of test results by ID.
	 */
	lookup(resultId: string): TestResult | undefined;
}

export const ITestResultService = createDecorator<ITestResultService>('testResultService');

const RETAIN_LAST_RESULTS = 16;

export class TestResultService implements ITestResultService {
	declare _serviceBrand: undefined;
	private newResultEmitter = new Emitter<TestResult>();

	/**
	 * @inheritdoc
	 */
	public results: TestResult[] = [];

	/**
	 * @inheritdoc
	 */
	public readonly onNewTestResult = this.newResultEmitter.event;

	private readonly isRunning: IContextKey<boolean>;

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this.isRunning = TestingContextKeys.isRunning.bindTo(contextKeyService);
	}

	/**
	 * @inheritdoc
	 */
	public push(result: TestResult): TestResult {
		this.results.unshift(result);
		if (this.results.length > RETAIN_LAST_RESULTS) {
			this.results.pop();
		}

		result.onComplete(this.onComplete, this);
		this.isRunning.set(true);
		this.newResultEmitter.fire(result);
		return result;
	}

	/**
	 * @inheritdoc
	 */
	public lookup(id: string) {
		return this.results.find(r => r.id === id);
	}

	private onComplete() {
		// move the complete test run down behind any still-running ones
		for (let i = 0; i < this.results.length - 2; i++) {
			if (this.results[i].isComplete && !this.results[i + 1].isComplete) {
				[this.results[i], this.results[i + 1]] = [this.results[i + 1], this.results[i]];
			}
		}

		this.isRunning.set(!this.results[0]?.isComplete);
	}
}
