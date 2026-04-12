/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DeferredPromise } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { language } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { refreshComputedState } from './getComputedState.js';
import { TestId } from './testId.js';
import { makeEmptyCounts, maxPriority, statesInOrder, terminalStatePriorities } from './testingStates.js';
import { getMarkId, TestResultItem } from './testTypes.js';
const emptyRawOutput = {
    buffers: [],
    length: 0,
    onDidWriteData: Event.None,
    endPromise: Promise.resolve(),
    getRange: () => VSBuffer.alloc(0),
    getRangeIter: () => [],
};
export class TaskRawOutput {
    constructor() {
        this.writeDataEmitter = new Emitter();
        this.endDeferred = new DeferredPromise();
        this.offset = 0;
        /** @inheritdoc */
        this.onDidWriteData = this.writeDataEmitter.event;
        /** @inheritdoc */
        this.endPromise = this.endDeferred.p;
        /** @inheritdoc */
        this.buffers = [];
    }
    /** @inheritdoc */
    get length() {
        return this.offset;
    }
    /** @inheritdoc */
    getRange(start, length) {
        const buf = VSBuffer.alloc(length);
        let bufLastWrite = 0;
        for (const chunk of this.getRangeIter(start, length)) {
            buf.buffer.set(chunk.buffer, bufLastWrite);
            bufLastWrite += chunk.byteLength;
        }
        return bufLastWrite < length ? buf.slice(0, bufLastWrite) : buf;
    }
    /** @inheritdoc */
    *getRangeIter(start, length) {
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
    append(data, marker) {
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
        let TrimBytes;
        (function (TrimBytes) {
            TrimBytes[TrimBytes["CR"] = 13] = "CR";
            TrimBytes[TrimBytes["LF"] = 10] = "LF";
        })(TrimBytes || (TrimBytes = {}));
        const start = VSBuffer.fromString(getMarkCode(marker, true));
        const end = VSBuffer.fromString(getMarkCode(marker, false));
        length += start.byteLength + end.byteLength;
        this.push(start);
        let trimLen = data.byteLength;
        for (; trimLen > 0; trimLen--) {
            const last = data.buffer[trimLen - 1];
            if (last !== 13 /* TrimBytes.CR */ && last !== 10 /* TrimBytes.LF */) {
                break;
            }
        }
        this.push(data.slice(0, trimLen));
        this.push(end);
        this.push(data.slice(trimLen));
        return { offset, length };
    }
    push(data) {
        if (data.byteLength === 0) {
            return;
        }
        this.buffers.push(data);
        this.writeDataEmitter.fire(data);
        this.offset += data.byteLength;
    }
    /** Signals the output has ended. */
    end() {
        this.endDeferred.complete();
    }
}
export const resultItemParents = function* (results, item) {
    for (const id of TestId.fromString(item.item.extId).idsToRoot()) {
        yield results.getStateById(id.toString());
    }
};
export const maxCountPriority = (counts) => {
    for (const state of statesInOrder) {
        if (counts[state] > 0) {
            return state;
        }
    }
    return 0 /* TestResultState.Unset */;
};
const getMarkCode = (marker, start) => `\x1b]633;SetMark;Id=${getMarkId(marker, start)};Hidden\x07`;
const itemToNode = (controllerId, item, parent) => ({
    controllerId,
    expand: 0 /* TestItemExpandState.NotExpandable */,
    item: { ...item },
    children: [],
    tasks: [],
    ownComputedState: 0 /* TestResultState.Unset */,
    computedState: 0 /* TestResultState.Unset */,
});
export var TestResultItemChangeReason;
(function (TestResultItemChangeReason) {
    TestResultItemChangeReason[TestResultItemChangeReason["ComputedStateChange"] = 0] = "ComputedStateChange";
    TestResultItemChangeReason[TestResultItemChangeReason["OwnStateChange"] = 1] = "OwnStateChange";
    TestResultItemChangeReason[TestResultItemChangeReason["NewMessage"] = 2] = "NewMessage";
})(TestResultItemChangeReason || (TestResultItemChangeReason = {}));
/**
 * Results of a test. These are created when the test initially started running
 * and marked as "complete" when the run finishes.
 */
let LiveTestResult = class LiveTestResult extends Disposable {
    /**
     * @inheritdoc
     */
    get completedAt() {
        return this._completedAt;
    }
    /**
     * @inheritdoc
     */
    get tests() {
        return this.testById.values();
    }
    /** Gets an included test item by ID. */
    getTestById(id) {
        return this.testById.get(id)?.item;
    }
    constructor(id, persist, request, insertOrder, telemetry) {
        super();
        this.id = id;
        this.persist = persist;
        this.request = request;
        this.insertOrder = insertOrder;
        this.telemetry = telemetry;
        this.completeEmitter = this._register(new Emitter());
        this.newTaskEmitter = this._register(new Emitter());
        this.endTaskEmitter = this._register(new Emitter());
        this.changeEmitter = this._register(new Emitter());
        /** todo@connor4312: convert to a WellDefinedPrefixTree */
        this.testById = new Map();
        this.testMarkerCounter = 0;
        this.startedAt = Date.now();
        this.onChange = this.changeEmitter.event;
        this.onComplete = this.completeEmitter.event;
        this.onNewTask = this.newTaskEmitter.event;
        this.onEndTask = this.endTaskEmitter.event;
        this.tasks = [];
        this.name = localize('runFinished', 'Test run at {0}', new Date().toLocaleString(language));
        /**
         * @inheritdoc
         */
        this.counts = makeEmptyCounts();
        this.computedStateAccessor = {
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
                            yield testByExtId.get(id.toString());
                        }
                    }
                })();
            },
        };
        this.doSerialize = new Lazy(() => ({
            id: this.id,
            completedAt: this.completedAt,
            tasks: this.tasks.map(t => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
            name: this.name,
            request: this.request,
            items: [...this.testById.values()].map(TestResultItem.serializeWithoutMessages),
        }));
        this.doSerializeWithMessages = new Lazy(() => ({
            id: this.id,
            completedAt: this.completedAt,
            tasks: this.tasks.map(t => ({ id: t.id, name: t.name, ctrlId: t.ctrlId, hasCoverage: !!t.coverage.get() })),
            name: this.name,
            request: this.request,
            items: [...this.testById.values()].map(TestResultItem.serialize),
        }));
    }
    /**
     * @inheritdoc
     */
    getStateById(extTestId) {
        return this.testById.get(extTestId);
    }
    /**
     * Appends output that occurred during the test run.
     */
    appendOutput(output, taskId, location, testId) {
        const preview = output.byteLength > 100 ? output.slice(0, 100).toString() + '…' : output.toString();
        let marker;
        // currently, the UI only exposes jump-to-message from tests or locations,
        // so no need to mark outputs that don't come from either of those.
        if (testId || location) {
            marker = this.testMarkerCounter++;
        }
        const index = this.mustGetTaskIndex(taskId);
        const task = this.tasks[index];
        const { offset, length } = task.output.append(output, marker);
        const message = {
            location,
            message: preview,
            offset,
            length,
            marker,
            type: 1 /* TestMessageType.Output */,
        };
        const test = testId && this.testById.get(testId);
        if (test) {
            test.tasks[index].messages.push(message);
            this.changeEmitter.fire({ item: test, result: this, reason: 2 /* TestResultItemChangeReason.NewMessage */, message });
        }
        else {
            task.otherMessages.push(message);
        }
    }
    /**
     * Adds a new run task to the results.
     */
    addTask(task) {
        this.tasks.push({ ...task, coverage: observableValue(this, undefined), otherMessages: [], output: new TaskRawOutput() });
        for (const test of this.tests) {
            test.tasks.push({ duration: undefined, messages: [], state: 0 /* TestResultState.Unset */ });
        }
        this.newTaskEmitter.fire(this.tasks.length - 1);
    }
    /**
     * Add the chain of tests to the run. The first test in the chain should
     * be either a test root, or a previously-known test.
     */
    addTestChainToRun(controllerId, chain) {
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
    updateState(testId, taskId, state, duration) {
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
    appendMessage(testId, taskId, message) {
        const entry = this.testById.get(testId);
        if (!entry) {
            return;
        }
        entry.tasks[this.mustGetTaskIndex(taskId)].messages.push(message);
        this.changeEmitter.fire({ item: entry, result: this, reason: 2 /* TestResultItemChangeReason.NewMessage */, message });
    }
    /**
     * Marks the task in the test run complete.
     */
    markTaskComplete(taskId) {
        const index = this.mustGetTaskIndex(taskId);
        const task = this.tasks[index];
        task.running = false;
        task.output.end();
        this.setAllToState(5 /* TestResultState.Skipped */, taskId, t => t.state === 1 /* TestResultState.Queued */ || t.state === 2 /* TestResultState.Running */);
        this.endTaskEmitter.fire(index);
    }
    /**
     * Notifies the service that all tests are complete.
     */
    markComplete() {
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
        this.telemetry.publicLog2('test.outcomes', {
            failures: this.counts[6 /* TestResultState.Errored */] + this.counts[4 /* TestResultState.Failed */],
            passes: this.counts[3 /* TestResultState.Passed */],
            controller: this.request.targets.map(t => t.controllerId).join(',')
        });
    }
    /**
     * Marks the test and all of its children in the run as retired.
     */
    markRetired(testIds) {
        for (const [id, test] of this.testById) {
            if (!test.retired && (!testIds || testIds.hasKeyOrParent(TestId.fromString(id).path))) {
                test.retired = true;
                this.changeEmitter.fire({ reason: 0 /* TestResultItemChangeReason.ComputedStateChange */, item: test, result: this });
            }
        }
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return this.completedAt && this.persist ? this.doSerialize.value : undefined;
    }
    toJSONWithMessages() {
        return this.completedAt && this.persist ? this.doSerializeWithMessages.value : undefined;
    }
    /**
     * Updates all tests in the collection to the given state.
     */
    setAllToState(state, taskId, when) {
        const index = this.mustGetTaskIndex(taskId);
        for (const test of this.testById.values()) {
            if (when(test.tasks[index], test)) {
                this.fireUpdateAndRefresh(test, index, state);
            }
        }
    }
    fireUpdateAndRefresh(entry, taskIndex, newState, newOwnDuration) {
        const previousOwnComputed = entry.ownComputedState;
        const previousOwnDuration = entry.ownDuration;
        const changeEvent = {
            item: entry,
            result: this,
            reason: 1 /* TestResultItemChangeReason.OwnStateChange */,
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
        refreshComputedState(this.computedStateAccessor, entry).forEach(t => this.changeEmitter.fire(t === entry ? changeEvent : {
            item: t,
            result: this,
            reason: 0 /* TestResultItemChangeReason.ComputedStateChange */,
        }));
    }
    addTestToRun(controllerId, item, parent) {
        const node = itemToNode(controllerId, item, parent);
        this.testById.set(item.extId, node);
        this.counts[0 /* TestResultState.Unset */]++;
        if (parent) {
            this.testById.get(parent)?.children.push(node);
        }
        if (this.tasks.length) {
            for (let i = 0; i < this.tasks.length; i++) {
                node.tasks.push({ duration: undefined, messages: [], state: 0 /* TestResultState.Unset */ });
            }
        }
        return node;
    }
    mustGetTaskIndex(taskId) {
        const index = this.tasks.findIndex(t => t.id === taskId);
        if (index === -1) {
            throw new Error(`Unknown task ${taskId} in updateState`);
        }
        return index;
    }
};
LiveTestResult = __decorate([
    __param(4, ITelemetryService)
], LiveTestResult);
export { LiveTestResult };
/**
 * Test results hydrated from a previously-serialized test run.
 */
export class HydratedTestResult {
    /**
     * @inheritdoc
     */
    get tests() {
        return this.testById.values();
    }
    constructor(identity, serialized, persist = true) {
        this.serialized = serialized;
        this.persist = persist;
        /**
         * @inheritdoc
         */
        this.counts = makeEmptyCounts();
        this.testById = new Map();
        this.id = serialized.id;
        this.completedAt = serialized.completedAt;
        this.tasks = serialized.tasks.map((task, i) => ({
            id: task.id,
            name: task.name || localize('testUnnamedTask', 'Unnamed Task'),
            ctrlId: task.ctrlId,
            running: false,
            coverage: observableValue(this, undefined),
            output: emptyRawOutput,
            otherMessages: []
        }));
        this.name = serialized.name;
        this.request = serialized.request;
        for (const item of serialized.items) {
            const de = TestResultItem.deserialize(identity, item);
            this.counts[de.ownComputedState]++;
            this.testById.set(item.item.extId, de);
        }
    }
    /**
     * @inheritdoc
     */
    getStateById(extTestId) {
        return this.testById.get(extTestId);
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return this.persist ? this.serialized : undefined;
    }
    /**
     * @inheritdoc
     */
    toJSONWithMessages() {
        return this.toJSON();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RSZXN1bHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFlLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsT0FBTyxFQUEwQixvQkFBb0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXJGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDckMsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixFQUFrQixNQUFNLG9CQUFvQixDQUFDO0FBQzFILE9BQU8sRUFBRSxTQUFTLEVBQWtMLGNBQWMsRUFBbUIsTUFBTSxnQkFBZ0IsQ0FBQztBQXdGNVAsTUFBTSxjQUFjLEdBQW1CO0lBQ3RDLE9BQU8sRUFBRSxFQUFFO0lBQ1gsTUFBTSxFQUFFLENBQUM7SUFDVCxjQUFjLEVBQUUsS0FB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