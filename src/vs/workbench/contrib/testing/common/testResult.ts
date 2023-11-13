/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { language } from 'vs/base/common/platform';
import { WellDefinedPrefixTree } from 'vs/base/common/prefixTree';
import { removeAnsiEscapeCodes } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { IComputedStateAccessor, refreshComputedState } from 'vs/workbench/contrib/testing/common/getComputedState';
import { IObservableValue, MutableObservableValue, staticObservableValue } from 'vs/workbench/contrib/testing/common/observableValue';
import { TestCoverage } from 'vs/workbench/contrib/testing/common/testCoverage';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { makeEmptyCounts, maxPriority, statesInOrder, terminalStatePriorities, TestStateCount } from 'vs/workbench/contrib/testing/common/testingStates';
import { getMarkId, IRichLocation, ISerializedTestResults, ITestItem, ITestMessage, ITestOutputMessage, ITestRunTask, ITestTaskState, ResolvedTestRunRequest, TestItemExpandState, TestMessageType, TestResultItem, TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';

export interface ITestRunTaskResults extends ITestRunTask {
	/**
	 * Contains test coverage for the result, if it's available.
	 */
	readonly coverage: IObservableValue<TestCoverage | undefined>;

	/**
	 * Messages from the task not associated with any specific test.
	 */
	readonly otherMessages: ITestOutputMessage[];

	/**
	 * Test results output for the task.
	 */
	readonly output: ITaskRawOutput;
}

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
	readonly request: ResolvedTestRunRequest;

	/**
	 * Human-readable name of the test result.
	 */
	readonly name: string;

	/**
	 * Gets all tests involved in the run.
	 */
	tests: IterableIterator<TestResultItem>;

	/**
	 * List of this result's subtasks.
	 */
	tasks: ReadonlyArray<ITestRunTaskResults>;

	/**
	 * Gets the state of the test by its extension-assigned ID.
	 */
	getStateById(testExtId: string): TestResultItem | undefined;

	/**
	 * Serializes the test result. Used to save and restore results
	 * in the workspace.
	 */
	toJSON(): ISerializedTestResults | undefined;

	/**
	 * Serializes the test result, includes messages. Used to send the test states to the extension host.
	 */
	toJSONWithMessages(): ISerializedTestResults | undefined;
}

/**
 * Output type exposed from live test results.
 */
export interface ITaskRawOutput {
	readonly onDidWriteData: Event<VSBuffer>;
	readonly endPromise: Promise<void>;
	readonly buffers: VSBuffer[];
	readonly length: number;

	/** Gets a continuous buffer for the desired range */
	getRange(start: number, length: number): VSBuffer;
	/** Gets an iterator of buffers for the range; may avoid allocation of getRange() */
	getRangeIter(start: number, length: number): Iterable<VSBuffer>;
}

const emptyRawOutput: ITaskRawOutput = {
	buffers: [],
	length: 0,
	onDidWriteData: Event.None,
	endPromise: Promise.resolve(),
	getRange: () => VSBuffer.alloc(0),
	getRangeIter: () => [],
};

export class TaskRawOutput implements ITaskRawOutput {
	private readonly writeDataEmitter = new Emitter<VSBuffer>();
	private readonly endDeferred = new DeferredPromise<void>();
	private offset = 0;

	/** @inheritdoc */
	public readonly onDidWriteData = this.writeDataEmitter.event;

	/** @inheritdoc */
	public readonly endPromise = this.endDeferred.p;

	/** @inheritdoc */
	public readonly buffers: VSBuffer[] = [];

	/** @inheritdoc */
	public get length() {
		return this.offset;
	}

	/** @inheritdoc */
	getRange(start: number, length: number): VSBuffer {
		const buf = VSBuffer.alloc(length);
		let bufLastWrite = 0;
		for (const chunk of this.getRangeIter(start, length)) {
			buf.buffer.set(chunk.buffer, bufLastWrite);
			bufLastWrite += chunk.byteLength;
		}

		return bufLastWrite < length ? buf.slice(0, bufLastWrite) : buf;
	}

	/** @inheritdoc */
	*getRangeIter(start: number, length: number) {
		let soFar = 0;
		let internalLastRead = 0;
		for (const b of this.buffers) {
			if (internalLastRead + b.byteLength <= start) {
				internalLastRead += b.byteLength;
				continue;
			}

			const bstart = Math.max(0, start - internalLastRead);
			const bend = Math.min(b.byteLength, bstart + length - soFar);

			yield b.slice(bstart, bend);
			soFar += bend - bstart;
			internalLastRead += b.byteLength;

			if (soFar === length) {
				break;
			}
		}
	}

	/**
	 * Appends data to the output, returning the byte range where the data can be found.
	 */
	public append(data: VSBuffer, marker?: number) {
		const offset = this.offset;
		let length = data.byteLength;
		if (marker === undefined) {
			this.push(data);
			return { offset, length };
		}

		// Bytes that should be 'trimmed' off the end of data. This is done because
		// selections in the terminal are based on the entire line, and commonly
		// the interesting marked range has a trailing new line. We don't want to
		// select the trailing line (which might have other data)
		// so we place the marker before all trailing trimbytes.
		const enum TrimBytes {
			CR = 13,
			LF = 10,
		}

		const start = VSBuffer.fromString(getMarkCode(marker, true));
		const end = VSBuffer.fromString(getMarkCode(marker, false));
		length += start.byteLength + end.byteLength;

		this.push(start);
		let trimLen = data.byteLength;
		for (; trimLen > 0; trimLen--) {
			const last = data.buffer[trimLen - 1];
			if (last !== TrimBytes.CR && last !== TrimBytes.LF) {
				break;
			}
		}

		this.push(data.slice(0, trimLen));
		this.push(end);
		this.push(data.slice(trimLen));


		return { offset, length };
	}

	private push(data: VSBuffer) {
		if (data.byteLength === 0) {
			return;
		}

		this.buffers.push(data);
		this.writeDataEmitter.fire(data);
		this.offset += data.byteLength;
	}

	/** Signals the output has ended. */
	public end() {
		this.endDeferred.complete();
	}
}

export const resultItemParents = function* (results: ITestResult, item: TestResultItem) {
	for (const id of TestId.fromString(item.item.extId).idsToRoot()) {
		yield results.getStateById(id.toString())!;
	}
};

export const maxCountPriority = (counts: Readonly<TestStateCount>) => {
	for (const state of statesInOrder) {
		if (counts[state] > 0) {
			return state;
		}
	}

	return TestResultState.Unset;
};

const getMarkCode = (marker: number, start: boolean) => `\x1b]633;SetMark;Id=${getMarkId(marker, start)};Hidden\x07`;

interface TestResultItemWithChildren extends TestResultItem {
	/** Children in the run */
	children: TestResultItemWithChildren[];
}

const itemToNode = (controllerId: string, item: ITestItem, parent: string | null): TestResultItemWithChildren => ({
	controllerId,
	expand: TestItemExpandState.NotExpandable,
	item: { ...item },
	children: [],
	tasks: [],
	ownComputedState: TestResultState.Unset,
	computedState: TestResultState.Unset,
});

export const enum TestResultItemChangeReason {
	ComputedStateChange,
	OwnStateChange,
	NewMessage,
}

export type TestResultItemChange = { item: TestResultItem; result: ITestResult } & (
	| { reason: TestResultItemChangeReason.ComputedStateChange }
	| { reason: TestResultItemChangeReason.OwnStateChange; previousState: TestResultState; previousOwnDuration: number | undefined }
	| { reason: TestResultItemChangeReason.NewMessage; message: ITestMessage }
);

/**
 * Results of a test. These are created when the test initially started running
 * and marked as "complete" when the run finishes.
 */
export class LiveTestResult extends Disposable implements ITestResult {
	private readonly completeEmitter = this._register(new Emitter<void>());
	private readonly newTaskEmitter = this._register(new Emitter<number>());
	private readonly endTaskEmitter = this._register(new Emitter<number>());
	private readonly changeEmitter = this._register(new Emitter<TestResultItemChange>());
	/** todo@connor4312: convert to a WellDefinedPrefixTree */
	private readonly testById = new Map<string, TestResultItemWithChildren>();
	private testMarkerCounter = 0;
	private _completedAt?: number;

	public readonly startedAt = Date.now();
	public readonly onChange = this.changeEmitter.event;
	public readonly onComplete = this.completeEmitter.event;
	public readonly onNewTask = this.newTaskEmitter.event;
	public readonly onEndTask = this.endTaskEmitter.event;
	public readonly tasks: (ITestRunTaskResults & { output: TaskRawOutput })[] = [];
	public readonly name = localize('runFinished', 'Test run at {0}', new Date().toLocaleString(language));

	/**
	 * @inheritdoc
	 */
	public get completedAt() {
		return this._completedAt;
	}

	/**
	 * @inheritdoc
	 */
	public readonly counts = makeEmptyCounts();

	/**
	 * @inheritdoc
	 */
	public get tests() {
		return this.testById.values();
	}

	private readonly computedStateAccessor: IComputedStateAccessor<TestResultItemWithChildren> = {
		getOwnState: i => i.ownComputedState,
		getCurrentComputedState: i => i.computedState,
		setComputedState: (i, s) => i.computedState = s,
		getChildren: i => i.children,
		getParents: i => {
			const { testById: testByExtId } = this;
			return (function* () {
				const parentId = TestId.fromString(i.item.extId).parentId;
				if (parentId) {
					for (const id of parentId.idsToRoot()) {
						yield testByExtId.get(id.toString())!;
					}
				}
			})();
		},
	};

	constructor(
		public readonly id: string,
		public readonly persist: boolean,
		public readonly request: ResolvedTestRunRequest,
	) {
		super();
	}

	/**
	 * @inheritdoc
	 */
	public getStateById(extTestId: string) {
		return this.testById.get(extTestId);
	}

	/**
	 * Appends output that occurred during the test run.
	 */
	public appendOutput(output: VSBuffer, taskId: string, location?: IRichLocation, testId?: string): void {
		const preview = output.byteLength > 100 ? output.slice(0, 100).toString() + '…' : output.toString();
		let marker: number | undefined;

		// currently, the UI only exposes jump-to-message from tests or locations,
		// so no need to mark outputs that don't come from either of those.
		if (testId || location) {
			marker = this.testMarkerCounter++;
		}

		const index = this.mustGetTaskIndex(taskId);
		const task = this.tasks[index];

		const { offset, length } = task.output.append(output, marker);
		const message: ITestOutputMessage = {
			location,
			message: removeAnsiEscapeCodes(preview),
			offset,
			length,
			marker,
			type: TestMessageType.Output,
		};

		const test = testId && this.testById.get(testId);
		if (test) {
			test.tasks[index].messages.push(message);
			this.changeEmitter.fire({ item: test, result: this, reason: TestResultItemChangeReason.NewMessage, message });
		} else {
			task.otherMessages.push(message);
		}
	}

	/**
	 * Adds a new run task to the results.
	 */
	public addTask(task: ITestRunTask) {
		this.tasks.push({ ...task, coverage: this._register(new MutableObservableValue(undefined)), otherMessages: [], output: new TaskRawOutput() });

		for (const test of this.tests) {
			test.tasks.push({ duration: undefined, messages: [], state: TestResultState.Unset });
		}

		this.newTaskEmitter.fire(this.tasks.length - 1);
	}

	/**
	 * Add the chain of tests to the run. The first test in the chain should
	 * be either a test root, or a previously-known test.
	 */
	public addTestChainToRun(controllerId: string, chain: ReadonlyArray<ITestItem>) {
		let parent = this.testById.get(chain[0].extId);
		if (!parent) { // must be a test root
			parent = this.addTestToRun(controllerId, chain[0], null);
		}

		for (let i = 1; i < chain.length; i++) {
			parent = this.addTestToRun(controllerId, chain[i], parent.item.extId);
		}

		return undefined;
	}

	/**
	 * Updates the state of the test by its internal ID.
	 */
	public updateState(testId: string, taskId: string, state: TestResultState, duration?: number) {
		const entry = this.testById.get(testId);
		if (!entry) {
			return;
		}

		const index = this.mustGetTaskIndex(taskId);

		const oldTerminalStatePrio = terminalStatePriorities[entry.tasks[index].state];
		const newTerminalStatePrio = terminalStatePriorities[state];

		// Ignore requests to set the state from one terminal state back to a
		// "lower" one, e.g. from failed back to passed:
		if (oldTerminalStatePrio !== undefined &&
			(newTerminalStatePrio === undefined || newTerminalStatePrio < oldTerminalStatePrio)) {
			return;
		}

		this.fireUpdateAndRefresh(entry, index, state, duration);
	}

	/**
	 * Appends a message for the test in the run.
	 */
	public appendMessage(testId: string, taskId: string, message: ITestMessage) {
		const entry = this.testById.get(testId);
		if (!entry) {
			return;
		}

		entry.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
		this.changeEmitter.fire({ item: entry, result: this, reason: TestResultItemChangeReason.NewMessage, message });
	}

	/**
	 * Marks the task in the test run complete.
	 */
	public markTaskComplete(taskId: string) {
		const index = this.mustGetTaskIndex(taskId);
		const task = this.tasks[index];
		task.running = false;
		task.output.end();

		this.setAllToState(
			TestResultState.Unset,
			taskId,
			t => t.state === TestResultState.Queued || t.state === TestResultState.Running,
		);

		this.endTaskEmitter.fire(index);
	}

	/**
	 * Notifies the service that all tests are complete.
	 */
	public markComplete() {
		if (this._completedAt !== undefined) {
			throw new Error('cannot complete a test result multiple times');
		}

		for (const task of this.tasks) {
			if (task.running) {
				this.markTaskComplete(task.id);
			}
		}

		this._completedAt = Date.now();
		this.completeEmitter.fire();
	}

	/**
	 * Marks the test and all of its children in the run as retired.
	 */
	public markRetired(testIds: WellDefinedPrefixTree<undefined> | undefined) {
		for (const [id, test] of this.testById) {
			if (!test.retired && (!testIds || testIds.hasKeyOrParent(TestId.fromString(id).path))) {
				test.retired = true;
				this.changeEmitter.fire({ reason: TestResultItemChangeReason.ComputedStateChange, item: test, result: this });
			}
		}
	}

	/**
	 * @inheritdoc
	 */
	public toJSON(): ISerializedTestResults | undefined {
		return this.completedAt && this.persist ? this.doSerialize.value : undefined;
	}

	public toJSONWithMessages(): ISerializedTestResults | undefined {
		return this.completedAt && this.persist ? this.doSerializeWithMessages.value : undefined;
	}

	/**
	 * Updates all tests in the collection to the given state.
	 */
	protected setAllToState(state: TestResultState, taskId: string, when: (task: ITestTaskState, item: TestResultItem) => boolean) {
		const index = this.mustGetTaskIndex(taskId);
		for (const test of this.testById.values()) {
			if (when(test.tasks[index], test)) {
				this.fireUpdateAndRefresh(test, index, state);
			}
		}
	}

	private fireUpdateAndRefresh(entry: TestResultItem, taskIndex: number, newState: TestResultState, newOwnDuration?: number) {
		const previousOwnComputed = entry.ownComputedState;
		const previousOwnDuration = entry.ownDuration;
		const changeEvent: TestResultItemChange = {
			item: entry,
			result: this,
			reason: TestResultItemChangeReason.OwnStateChange,
			previousState: previousOwnComputed,
			previousOwnDuration: previousOwnDuration,
		};

		entry.tasks[taskIndex].state = newState;
		if (newOwnDuration !== undefined) {
			entry.tasks[taskIndex].duration = newOwnDuration;
			entry.ownDuration = Math.max(entry.ownDuration || 0, newOwnDuration);
		}

		const newOwnComputed = maxPriority(...entry.tasks.map(t => t.state));
		if (newOwnComputed === previousOwnComputed) {
			if (newOwnDuration !== previousOwnDuration) {
				this.changeEmitter.fire(changeEvent); // fire manually since state change won't do it
			}
			return;
		}

		entry.ownComputedState = newOwnComputed;
		this.counts[previousOwnComputed]--;
		this.counts[newOwnComputed]++;
		refreshComputedState(this.computedStateAccessor, entry).forEach(t =>
			this.changeEmitter.fire(t === entry ? changeEvent : {
				item: t,
				result: this,
				reason: TestResultItemChangeReason.ComputedStateChange,
			}),
		);
	}

	private addTestToRun(controllerId: string, item: ITestItem, parent: string | null) {
		const node = itemToNode(controllerId, item, parent);
		this.testById.set(item.extId, node);
		this.counts[TestResultState.Unset]++;

		if (parent) {
			this.testById.get(parent)?.children.push(node);
		}

		if (this.tasks.length) {
			for (let i = 0; i < this.tasks.length; i++) {
				node.tasks.push({ duration: undefined, messages: [], state: TestResultState.Unset });
			}
		}

		return node;
	}

	private mustGetTaskIndex(taskId: string) {
		const index = this.tasks.findIndex(t => t.id === taskId);
		if (index === -1) {
			throw new Error(`Unknown task ${taskId} in updateState`);
		}

		return index;
	}

	private readonly doSerialize = new Lazy((): ISerializedTestResults => ({
		id: this.id,
		completedAt: this.completedAt!,
		tasks: this.tasks.map(t => ({ id: t.id, name: t.name })),
		name: this.name,
		request: this.request,
		items: [...this.testById.values()].map(TestResultItem.serializeWithoutMessages),
	}));

	private readonly doSerializeWithMessages = new Lazy((): ISerializedTestResults => ({
		id: this.id,
		completedAt: this.completedAt!,
		tasks: this.tasks.map(t => ({ id: t.id, name: t.name })),
		name: this.name,
		request: this.request,
		items: [...this.testById.values()].map(TestResultItem.serialize),
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
	public readonly tasks: ITestRunTaskResults[];

	/**
	 * @inheritdoc
	 */
	public get tests() {
		return this.testById.values();
	}

	/**
	 * @inheritdoc
	 */
	public readonly name: string;

	/**
	 * @inheritdoc
	 */
	public readonly request: ResolvedTestRunRequest;

	private readonly testById = new Map<string, TestResultItem>();

	constructor(
		private readonly serialized: ISerializedTestResults,
		private readonly persist = true,
	) {
		this.id = serialized.id;
		this.completedAt = serialized.completedAt;
		this.tasks = serialized.tasks.map((task, i) => ({
			id: task.id,
			name: task.name,
			running: false,
			coverage: staticObservableValue(undefined),
			output: emptyRawOutput,
			otherMessages: []
		}));
		this.name = serialized.name;
		this.request = serialized.request;

		for (const item of serialized.items) {
			const de = TestResultItem.deserialize(item);
			this.counts[de.ownComputedState]++;
			this.testById.set(item.item.extId, de);
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

	/**
	 * @inheritdoc
	 */
	public toJSONWithMessages(): ISerializedTestResults | undefined {
		return this.toJSON();
	}
}
