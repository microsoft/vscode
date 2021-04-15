/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { newWriteableBufferStream, VSBuffer, VSBufferReadableStream, VSBufferWriteableStream } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { TestResultState } from 'vs/workbench/api/common/extHostTypes';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { IncrementalTestCollectionItem, ISerializedTestResults, ITestMessage, RunTestsRequest, TestResultItem } from 'vs/workbench/contrib/testing/common/testCollection';
import { statesInOrder } from 'vs/workbench/contrib/testing/common/testingStates';
import { IMainThreadTestCollection } from 'vs/workbench/contrib/testing/common/testService';

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
	 * Loads the output of the result as a stream.
	 */
	getOutput(): Promise<VSBufferReadableStream>;

	/**
	 * Serializes the test result. Used to save and restore results
	 * in the workspace.
	 */
	toJSON(): ISerializedTestResults | undefined;
}

/**
 * Count of the number of tests in each run state.
 */
export type TestStateCount = { [K in TestResultState]: number };

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

/**
 * Deals with output of a {@link LiveTestResult}. By default we pass-through
 * data into the underlying write stream, but if a client requests to read it
 * we splice in the written data and then continue streaming incoming data.
 */
export class LiveOutputController {
	/** Set on close() to a promise that is resolved once closing is complete */
	private closed?: Promise<void>;
	/** Data written so far. This is available until the file closes. */
	private previouslyWritten: VSBuffer[] | undefined = [];

	private readonly dataEmitter = new Emitter<VSBuffer>();
	private readonly endEmitter = new Emitter<void>();

	constructor(
		private readonly writer: Lazy<[VSBufferWriteableStream, Promise<void>]>,
		private readonly reader: () => Promise<VSBufferReadableStream>,
	) { }

	/**
	 * Appends data to the output.
	 */
	public append(data: VSBuffer): Promise<void> | void {
		if (this.closed) {
			return this.closed;
		}

		this.previouslyWritten?.push(data);
		this.dataEmitter.fire(data);

		return this.writer.getValue()[0].write(data);
	}

	/**
	 * Reads the value of the stream.
	 */
	public read() {
		if (!this.previouslyWritten) {
			return this.reader();
		}

		const stream = newWriteableBufferStream();
		for (const chunk of this.previouslyWritten) {
			stream.write(chunk);
		}

		const disposable = new DisposableStore();
		disposable.add(this.dataEmitter.event(d => stream.write(d)));
		disposable.add(this.endEmitter.event(() => stream.end()));
		stream.on('end', () => disposable.dispose());

		return Promise.resolve(stream);
	}

	/**
	 * Closes the output, signalling no more writes will be made.
	 * @returns a promise that resolves when the output is written
	 */
	public close(): Promise<void> {
		if (this.closed) {
			return this.closed;
		}

		if (!this.writer.hasValue()) {
			this.closed = Promise.resolve();
		} else {
			const [stream, ended] = this.writer.getValue();
			stream.end();
			this.closed = ended;
		}

		this.endEmitter.fire();
		this.closed.then(() => {
			this.previouslyWritten = undefined;
			this.dataEmitter.dispose();
			this.endEmitter.dispose();
		});

		return this.closed;
	}
}


const itemToNode = (
	item: IncrementalTestCollectionItem,
	byExtId: Map<string, TestResultItem>,
): TestResultItem => {
	const n: TestResultItem = {
		...item,
		// shallow-clone the test to take a 'snapshot' of it at the point in time where tests run
		item: { ...item.item },
		children: new Set(item.children),
		state: {
			duration: undefined,
			messages: [],
			state: TestResultState.Unset
		},
		computedState: TestResultState.Unset,
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

export const enum TestResultItemChangeReason {
	Retired,
	ParentRetired,
	ComputedStateChange,
	OwnStateChange,
}

export type TestResultItemChange = { item: TestResultItem; result: ITestResult } & (
	| { reason: TestResultItemChangeReason.Retired | TestResultItemChangeReason.ParentRetired | TestResultItemChangeReason.ComputedStateChange }
	| { reason: TestResultItemChangeReason.OwnStateChange; previous: TestResultState }
);

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
		resultId: string,
		collections: ReadonlyArray<IMainThreadTestCollection>,
		output: LiveOutputController,
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

		return new LiveTestResult(resultId, collections, testByExtId, excludeSet, output, !!req.isAutoRun);
	}

	private readonly completeEmitter = new Emitter<void>();
	private readonly changeEmitter = new Emitter<TestResultItemChange>();
	private _completedAt?: number;

	public readonly onChange = this.changeEmitter.event;
	public readonly onComplete = this.completeEmitter.event;

	/**
	 * @inheritdoc
	 */
	public get completedAt() {
		return this._completedAt;
	}

	/**
	 * @inheritdoc
	 */
	public readonly counts: { [K in TestResultState]: number } = makeEmptyCounts();

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
		public readonly id: string,
		private readonly collections: ReadonlyArray<IMainThreadTestCollection>,
		private readonly testById: Map<string, TestResultItem>,
		private readonly excluded: ReadonlySet<string>,
		public readonly output: LiveOutputController,
		public readonly isAutoRun: boolean,
	) {
		this.counts[TestResultState.Unset] = testById.size;
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
	public setAllToState(state: TestResultState, when: (_t: TestResultItem) => boolean) {
		for (const test of this.testById.values()) {
			if (when(test)) {
				this.fireUpdateAndRefresh(test, state);
			}
		}
	}

	/**
	 * Updates the state of the test by its internal ID.
	 */
	public updateState(testId: string, state: TestResultState, duration?: number) {
		const entry = this.testById.get(testId) ?? this.addTestToRun(testId);
		if (!entry) {
			return;
		}

		if (duration !== undefined) {
			entry.state.duration = duration;
		}

		this.fireUpdateAndRefresh(entry, state);
	}

	/**
	 * Appends a message for the test in the run.
	 */
	public appendMessage(testId: string, message: ITestMessage) {
		const entry = this.testById.get(testId) ?? this.addTestToRun(testId);
		if (!entry) {
			return;
		}

		entry.state.messages.push(message);
		this.changeEmitter.fire({
			item: entry,
			result: this,
			reason: TestResultItemChangeReason.OwnStateChange,
			previous: entry.state.state,
		});
	}

	/**
	 * @inheritdoc
	 */
	public getOutput() {
		return this.output.read();
	}

	private fireUpdateAndRefresh(entry: TestResultItem, newState: TestResultState) {
		const previous = entry.state.state;
		if (newState === previous) {
			return;
		}

		entry.state.state = newState;
		this.counts[previous]--;
		this.counts[newState]++;
		refreshComputedState(this.computedStateAccessor, entry, t =>
			this.changeEmitter.fire(
				t === entry
					? { item: entry, result: this, reason: TestResultItemChangeReason.OwnStateChange, previous }
					: { item: t, result: this, reason: TestResultItemChangeReason.ComputedStateChange }
			),
		);
	}

	/**
	 * Marks a test as retired. This can trigger it to be rerun in live mode.
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
				const node = makeNodeAndChildren(collection, test, this.excluded, this.testById, false);
				this.counts[TestResultState.Unset] += this.testById.size - originalSize;
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
		this.setAllToState(
			TestResultState.Unset,
			t => t.state.state === TestResultState.Queued || t.state.state === TestResultState.Running,
		);

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

	constructor(
		private readonly serialized: ISerializedTestResults,
		private readonly outputLoader: () => Promise<VSBufferReadableStream>,
		private readonly persist = true,
	) {
		this.id = serialized.id;
		this.completedAt = serialized.completedAt;

		for (const item of serialized.items) {
			const cast: TestResultItem = { ...item, retired: true, children: new Set(item.children) };
			cast.item.uri = URI.revive(cast.item.uri);

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
	public getOutput() {
		return this.outputLoader();
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedTestResults | undefined {
		return this.persist ? this.serialized : undefined;
	}
}
