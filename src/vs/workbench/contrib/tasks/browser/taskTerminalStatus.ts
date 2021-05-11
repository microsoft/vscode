/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { Disposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { AbstractProblemCollector } from 'vs/workbench/contrib/tasks/common/problemCollectors';
import { TaskEvent, TaskEventKind } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, Task } from 'vs/workbench/contrib/tasks/common/taskService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalStatus } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';

interface TerminalData {
	terminal: ITerminalInstance;
	status: ITerminalStatus;
	problemMatcher: AbstractProblemCollector;
}

const TASK_TERMINAL_STATUS_ID = 'task_terminal_status';
const ACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.play, severity: Severity.Info };
const SUCCEEDED_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.check, severity: Severity.Info };
const FAILED_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.error, severity: Severity.Warning };

export class TaskTerminalStatus extends Disposable {
	private terminalMap: Map<Task, TerminalData> = new Map();

	constructor(taskService: ITaskService) {
		super();
		this._register(taskService.onDidStateChange((event) => {
			switch (event.kind) {
				case TaskEventKind.Start:
				case TaskEventKind.Active: this.eventActive(event); break;
				case TaskEventKind.Inactive: this.eventInactive(event); break;
				case TaskEventKind.ProcessEnded: this.eventEnd(event); break;
			}
		}));
	}

	addTerminal(task: Task, terminal: ITerminalInstance, problemMatcher: AbstractProblemCollector) {
		const status: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, severity: Severity.Info };
		terminal.statusList.add(status);
		this.terminalMap.set(task, { terminal, status, problemMatcher });
	}

	private terminalFromEvent(event: TaskEvent): TerminalData | undefined {
		if (!event.__task || !this.terminalMap.get(event.__task)) {
			return undefined;
		}

		return this.terminalMap.get(event.__task);
	}

	private eventEnd(event: TaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}

		this.terminalMap.delete(event.__task!);

		terminalData.terminal.statusList.remove(terminalData.status);
		if ((event.exitCode === 0) && (terminalData.problemMatcher.numberOfMatches === 0)) {
			terminalData.terminal.statusList.add(SUCCEEDED_TASK_STATUS);
		} else {
			terminalData.terminal.statusList.add(FAILED_TASK_STATUS);
		}
	}

	private eventInactive(event: TaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		terminalData.terminal.statusList.remove(terminalData.status);
		if (terminalData.problemMatcher.numberOfMatches === 0) {
			terminalData.terminal.statusList.add(SUCCEEDED_TASK_STATUS);
		} else {
			terminalData.terminal.statusList.add(FAILED_TASK_STATUS);
		}
	}

	private eventActive(event: TaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		terminalData.terminal.statusList.remove(terminalData.status);
		terminalData.terminal.statusList.add(ACTIVE_TASK_STATUS);
	}
}
