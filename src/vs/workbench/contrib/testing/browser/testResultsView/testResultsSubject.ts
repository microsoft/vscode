/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { MarshalledId } from 'vs/base/common/marshallingIds';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { TestId } from 'vs/workbench/contrib/testing/common/testId';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { IRichLocation, ITestItem, ITestMessage, ITestMessageMenuArgs, ITestRunTask, ITestTaskState, InternalTestItem, TestMessageType, TestResultItem } from 'vs/workbench/contrib/testing/common/testTypes';
import { TestUriType, buildTestUri } from 'vs/workbench/contrib/testing/common/testingUri';

export const getMessageArgs = (test: TestResultItem, message: ITestMessage): ITestMessageMenuArgs => ({
	$mid: MarshalledId.TestMessageMenuArgs,
	test: InternalTestItem.serialize(test),
	message: ITestMessage.serialize(message),
});

interface ISubjectCommon {
	controllerId: string;
}

export const inspectSubjectHasStack = (subject: InspectSubject | undefined) =>
	subject instanceof MessageSubject && !!subject.stack?.length;

export class MessageSubject implements ISubjectCommon {
	public readonly test: ITestItem;
	public readonly message: ITestMessage;
	public readonly expectedUri: URI;
	public readonly actualUri: URI;
	public readonly messageUri: URI;
	public readonly revealLocation: IRichLocation | undefined;
	public readonly context: ITestMessageMenuArgs | undefined;

	public get controllerId() {
		return TestId.root(this.test.extId);
	}

	public get isDiffable() {
		return this.message.type === TestMessageType.Error && ITestMessage.isDiffable(this.message);
	}

	public get contextValue() {
		return this.message.type === TestMessageType.Error ? this.message.contextValue : undefined;
	}

	public get stack() {
		return this.message.type === TestMessageType.Error && this.message.stackTrace?.length ? this.message.stackTrace : undefined;
	}

	constructor(public readonly result: ITestResult, test: TestResultItem, public readonly taskIndex: number, public readonly messageIndex: number) {
		this.test = test.item;
		const messages = test.tasks[taskIndex].messages;
		this.messageIndex = messageIndex;

		const parts = { messageIndex, resultId: result.id, taskIndex, testExtId: test.item.extId };
		this.expectedUri = buildTestUri({ ...parts, type: TestUriType.ResultExpectedOutput });
		this.actualUri = buildTestUri({ ...parts, type: TestUriType.ResultActualOutput });
		this.messageUri = buildTestUri({ ...parts, type: TestUriType.ResultMessage });

		const message = this.message = messages[this.messageIndex];
		this.context = getMessageArgs(test, message);
		this.revealLocation = message.location ?? (test.item.uri && test.item.range ? { uri: test.item.uri, range: Range.lift(test.item.range) } : undefined);
	}
}

export class TaskSubject implements ISubjectCommon {
	public readonly outputUri: URI;
	public readonly revealLocation: undefined;

	public get controllerId() {
		return this.result.tasks[this.taskIndex].ctrlId;
	}

	constructor(public readonly result: ITestResult, public readonly taskIndex: number) {
		this.outputUri = buildTestUri({ resultId: result.id, taskIndex, type: TestUriType.TaskOutput });
	}
}

export class TestOutputSubject implements ISubjectCommon {
	public readonly outputUri: URI;
	public readonly revealLocation: undefined;
	public readonly task: ITestRunTask;

	public get controllerId() {
		return TestId.root(this.test.item.extId);
	}

	constructor(public readonly result: ITestResult, public readonly taskIndex: number, public readonly test: TestResultItem) {
		this.outputUri = buildTestUri({ resultId: this.result.id, taskIndex: this.taskIndex, testExtId: this.test.item.extId, type: TestUriType.TestOutput });
		this.task = result.tasks[this.taskIndex];
	}
}

export type InspectSubject = MessageSubject | TaskSubject | TestOutputSubject;

export const equalsSubject = (a: InspectSubject, b: InspectSubject) => (
	(a instanceof MessageSubject && b instanceof MessageSubject && a.message === b.message) ||
	(a instanceof TaskSubject && b instanceof TaskSubject && a.result === b.result && a.taskIndex === b.taskIndex) ||
	(a instanceof TestOutputSubject && b instanceof TestOutputSubject && a.test === b.test && a.taskIndex === b.taskIndex)
);


export const mapFindTestMessage = <T>(test: TestResultItem, fn: (task: ITestTaskState, message: ITestMessage, messageIndex: number, taskIndex: number) => T | undefined) => {
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

export const getSubjectTestItem = (subject: InspectSubject) => {
	if (subject instanceof MessageSubject) {
		return subject.test;
	}

	if (subject instanceof TaskSubject) {
		return undefined;
	}

	return subject.test.item;
};
