/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../../editor/common/core/range.js';
import { TestId } from '../../common/testId.js';
import { ITestMessage, InternalTestItem } from '../../common/testTypes.js';
import { buildTestUri } from '../../common/testingUri.js';
export const getMessageArgs = (test, message) => ({
    $mid: 18 /* MarshalledId.TestMessageMenuArgs */,
    test: InternalTestItem.serialize(test),
    message: ITestMessage.serialize(message),
});
export const inspectSubjectHasStack = (subject) => subject instanceof MessageSubject && !!subject.stack?.length;
export class MessageSubject {
    get controllerId() {
        return TestId.root(this.test.extId);
    }
    get isDiffable() {
        return this.message.type === 0 /* TestMessageType.Error */ && ITestMessage.isDiffable(this.message);
    }
    get contextValue() {
        return this.message.type === 0 /* TestMessageType.Error */ ? this.message.contextValue : undefined;
    }
    get stack() {
        return this.message.type === 0 /* TestMessageType.Error */ && this.message.stackTrace?.length ? this.message.stackTrace : undefined;
    }
    constructor(result, test, taskIndex, messageIndex) {
        this.result = result;
        this.taskIndex = taskIndex;
        this.messageIndex = messageIndex;
        this.test = test.item;
        const messages = test.tasks[taskIndex].messages;
        this.messageIndex = messageIndex;
        const parts = { messageIndex, resultId: result.id, taskIndex, testExtId: test.item.extId };
        this.expectedUri = buildTestUri({ ...parts, type: 4 /* TestUriType.ResultExpectedOutput */ });
        this.actualUri = buildTestUri({ ...parts, type: 3 /* TestUriType.ResultActualOutput */ });
        this.messageUri = buildTestUri({ ...parts, type: 2 /* TestUriType.ResultMessage */ });
        const message = this.message = messages[this.messageIndex];
        this.context = getMessageArgs(test, message);
        this.revealLocation = message.location ?? (test.item.uri && test.item.range ? { uri: test.item.uri, range: Range.lift(test.item.range) } : undefined);
    }
}
export class TaskSubject {
    get controllerId() {
        return this.result.tasks[this.taskIndex].ctrlId;
    }
    constructor(result, taskIndex) {
        this.result = result;
        this.taskIndex = taskIndex;
        this.outputUri = buildTestUri({ resultId: result.id, taskIndex, type: 0 /* TestUriType.TaskOutput */ });
    }
}
export class TestOutputSubject {
    get controllerId() {
        return TestId.root(this.test.item.extId);
    }
    constructor(result, taskIndex, test) {
        this.result = result;
        this.taskIndex = taskIndex;
        this.test = test;
        this.outputUri = buildTestUri({ resultId: this.result.id, taskIndex: this.taskIndex, testExtId: this.test.item.extId, type: 1 /* TestUriType.TestOutput */ });
        this.task = result.tasks[this.taskIndex];
    }
}
export const equalsSubject = (a, b) => ((a instanceof MessageSubject && b instanceof MessageSubject && a.message === b.message) ||
    (a instanceof TaskSubject && b instanceof TaskSubject && a.result === b.result && a.taskIndex === b.taskIndex) ||
    (a instanceof TestOutputSubject && b instanceof TestOutputSubject && a.test === b.test && a.taskIndex === b.taskIndex));
export const mapFindTestMessage = (test, fn) => {
    for (let taskIndex = 0; taskIndex < test.tasks.length; taskIndex++) {
        const task = test.tasks[taskIndex];
        for (let messageIndex = 0; messageIndex < task.messages.length; messageIndex++) {
            const r = fn(task, task.messages[messageIndex], messageIndex, taskIndex);
            if (r !== undefined) {
                return r;
            }
        }
    }
    return undefined;
};
export const getSubjectTestItem = (subject) => {
    if (subject instanceof MessageSubject) {
        return subject.test;
    }
    if (subject instanceof TaskSubject) {
        return undefined;
    }
    return subject.test.item;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFJlc3VsdHNTdWJqZWN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9icm93c2VyL3Rlc3RSZXN1bHRzVmlldy90ZXN0UmVzdWx0c1N1YmplY3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVoRCxPQUFPLEVBQTRCLFlBQVksRUFBc0QsZ0JBQWdCLEVBQW1DLE1BQU0sMkJBQTJCLENBQUM7QUFDMUwsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRXZFLE1BQU0sQ0FBQyxNQUFNLGNBQWMsR0FBRyxDQUFDLElBQW9CLEVBQUUsT0FBcUIsRUFBd0IsRUFBRSxDQUFDLENBQUM7SUFDckcsSUFBSSwyQ0FBa0M7SUFDdEMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUM7SUFDdEMsT0FBTyxFQUFFLFlBQVksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDO0NBQ3hDLENBQUMsQ0FBQztBQU1ILE1BQU0sQ0FBQyxNQUFNLHNCQUFzQixHQUFHLENBQUMsT0FBbUMsRUFBRSxFQUFFLENBQzdFLE9BQU8sWUFBWSxjQUFjLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDO0FBRTlELE1BQU0sT0FBTyxjQUFjO0lBUzFCLElBQVcsWUFBWTtRQUN0QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsSUFBVyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLGtD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