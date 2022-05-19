/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok } from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ACTIVE_TASK_STATUS, FAILED_TASK_STATUS, SUCCEEDED_TASK_STATUS, TaskTerminalStatus } from 'vs/workbench/contrib/tasks/browser/taskTerminalStatus';
import { AbstractProblemCollector } from 'vs/workbench/contrib/tasks/common/problemCollectors';
import { CommonTask, TaskEvent, TaskEventKind, TaskRunType } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, Task } from 'vs/workbench/contrib/tasks/common/taskService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalStatus, ITerminalStatusList, TerminalStatusList } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';

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
	test('Should add failed status when there is an exit code on task end', async () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.End, exitCode: 2 });
		setTimeout(() => assertStatus(testTerminal.statusList, FAILED_TASK_STATUS), 50);
	});
	test('Should add active status when a non-background task is run for a second time in the same terminal', async () => {
		taskTerminalStatus.addTerminal(testTask, testTerminal, problemCollector);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.ProcessStarted, runType: TaskRunType.SingleRun });
		assertStatus(testTerminal.statusList, ACTIVE_TASK_STATUS);
		taskService.triggerStateChange({ kind: TaskEventKind.Inactive });
		assertStatus(testTerminal.statusList, SUCCEEDED_TASK_STATUS);
	});
});

function assertStatus(actual: ITerminalStatusList, expected: ITerminalStatus): void {
	ok(actual.statuses.length === 1, '# of statuses');
	ok(actual.primary?.id === expected.id, 'ID');
	ok(actual.primary?.severity === expected.severity, 'Severity');
}
