/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { FAILED_TASK_STATUS, TaskTerminalStatus } from 'vs/workbench/contrib/tasks/browser/taskTerminalStatus';
import { AbstractProblemCollector } from 'vs/workbench/contrib/tasks/common/problemCollectors';
import { CommonTask, TaskEvent, TaskEventKind } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, Task } from 'vs/workbench/contrib/tasks/common/taskService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalStatusList } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';

class TestTaskService implements Partial<ITaskService> {
	private readonly _onDidStateChange: Emitter<TaskEvent> = new Emitter();
	public get onDidStateChange(): Event<TaskEvent> {
		return this._onDidStateChange.event;
	}
	public triggerStateChange(event: TaskEvent): void {
		this._onDidStateChange.fire(event);
	}
}

class TestTerminal implements Partial<ITerminalInstance> {
	statusList: TerminalStatusList = new TerminalStatusList(new TestConfigurationService());
}

class TestTask extends CommonTask {
	protected getFolderId(): string | undefined {
		throw new Error('Method not implemented.');
	}
	protected fromObject(object: any): Task {
		throw new Error('Method not implemented.');
	}
}

class TestProblemCollector implements Partial<AbstractProblemCollector> {

}

const instantiationService = new TestInstantiationService();
suite('Task Terminal Status', () => {
	let taskService: TestTaskService;
	let taskTerminalStatus: TaskTerminalStatus;
	let testTerminal: ITerminalInstance;
	let testTask: Task;
	let problemCollector: AbstractProblemCollector;
	setup(() => {
		taskService = new TestTaskService();
		taskTerminalStatus = instantiationService.createInstance(TaskTerminalStatus, taskService);
		testTerminal = instantiationService.createInstance(TestTerminal);
		testTask = instantiationService.createInstance(TestTask);
		problemCollector = instantiationService.createInstance(TestProblemCollector);
	});
	test('Should update the status', async () => {
		await taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.End, exitCode: 1 });
		setTimeout(() => strictEqual(testTerminal.statusList.statuses, [FAILED_TASK_STATUS]), 200);
	});
});
