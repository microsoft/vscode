/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { AbstractProblemCollector, StartStopProblemCollector } from 'vs/workbench/contrib/tasks/common/problemCollectors';
import { ITaskEvent, TaskEventKind, TaskRunType } from 'vs/workbench/contrib/tasks/common/tasks';
import { ITaskService, Task } from 'vs/workbench/contrib/tasks/common/taskService';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalStatus } from 'vs/workbench/contrib/terminal/browser/terminalStatusList';
import { MarkerSeverity } from 'vs/platform/markers/common/markers';
import { spinningLoading } from 'vs/platform/theme/common/iconRegistry';
import { IMarker } from 'vs/platform/terminal/common/capabilities/capabilities';

interface ITerminalData {
	terminal: ITerminalInstance;
	task: Task;
	status: ITerminalStatus;
	problemMatcher: AbstractProblemCollector;
	taskRunEnded: boolean;
	disposeListener?: IDisposable;
}

const TASK_TERMINAL_STATUS_ID = 'task_terminal_status';
export const ACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: spinningLoading, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.active', "Task is running") };
export const SUCCEEDED_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.check, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.succeeded', "Task succeeded") };
const SUCCEEDED_INACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.check, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.succeededInactive', "Task succeeded and waiting...") };
export const FAILED_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.error, severity: Severity.Error, tooltip: nls.localize('taskTerminalStatus.errors', "Task has errors") };
const FAILED_INACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.error, severity: Severity.Error, tooltip: nls.localize('taskTerminalStatus.errorsInactive', "Task has errors and is waiting...") };
const WARNING_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.warning, severity: Severity.Warning, tooltip: nls.localize('taskTerminalStatus.warnings', "Task has warnings") };
const WARNING_INACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.warning, severity: Severity.Warning, tooltip: nls.localize('taskTerminalStatus.warningsInactive', "Task has warnings and is waiting...") };
const INFO_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.info, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.infos', "Task has infos") };
const INFO_INACTIVE_TASK_STATUS: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.info, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.infosInactive', "Task has infos and is waiting...") };

export class TaskTerminalStatus extends Disposable {
	private terminalMap: Map<string, ITerminalData> = new Map();
	private _marker: IMarker | undefined;
	constructor(taskService: ITaskService) {
		super();
		this._register(taskService.onDidStateChange((event) => {
			switch (event.kind) {
				case TaskEventKind.ProcessStarted:
				case TaskEventKind.Active: this.eventActive(event); break;
				case TaskEventKind.Inactive: this.eventInactive(event); break;
				case TaskEventKind.ProcessEnded: this.eventEnd(event); break;
			}
		}));
	}

	addTerminal(task: Task, terminal: ITerminalInstance, problemMatcher: AbstractProblemCollector) {
		const status: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, severity: Severity.Info };
		terminal.statusList.add(status);
		problemMatcher.onDidFindFirstMatch(() => {
			this._marker = terminal.registerMarker();
		});
		problemMatcher.onDidFindErrors(() => {
			if (this._marker) {
				terminal.addBufferMarker({ marker: this._marker, hoverMessage: nls.localize('task.watchFirstError', "Beginning of detected errors for this run"), disableCommandStorage: true });
			}
		});
		problemMatcher.onDidRequestInvalidateLastMarker(() => {
			this._marker?.dispose();
			this._marker = undefined;
		});
		this.terminalMap.set(task._id, { terminal, task, status, problemMatcher, taskRunEnded: false });
	}

	private terminalFromEvent(event: ITaskEvent): ITerminalData | undefined {
		if (!event.__task) {
			return undefined;
		}

		return this.terminalMap.get(event.__task._id);
	}

	private eventEnd(event: ITaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		terminalData.taskRunEnded = true;
		terminalData.terminal.statusList.remove(terminalData.status);
		if ((event.exitCode === 0) && (terminalData.problemMatcher.numberOfMatches === 0)) {
			if (terminalData.task.configurationProperties.isBackground) {
				for (const status of terminalData.terminal.statusList.statuses) {
					terminalData.terminal.statusList.remove(status);
				}
			} else {
				terminalData.terminal.statusList.add(SUCCEEDED_TASK_STATUS);
			}
		} else if (event.exitCode || terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error) {
			terminalData.terminal.statusList.add(FAILED_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
			terminalData.terminal.statusList.add(WARNING_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
			terminalData.terminal.statusList.add(INFO_TASK_STATUS);
		}
	}

	private eventInactive(event: ITaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData || !terminalData.problemMatcher || terminalData.taskRunEnded) {
			return;
		}
		terminalData.terminal.statusList.remove(terminalData.status);
		if (terminalData.problemMatcher.numberOfMatches === 0) {
			terminalData.terminal.statusList.add(SUCCEEDED_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error) {
			terminalData.terminal.statusList.add(FAILED_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
			terminalData.terminal.statusList.add(WARNING_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
			terminalData.terminal.statusList.add(INFO_INACTIVE_TASK_STATUS);
		}
	}

	private eventActive(event: ITaskEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		if (!terminalData.disposeListener) {
			terminalData.disposeListener = terminalData.terminal.onDisposed(() => {
				this.terminalMap.delete(event.__task?._id!);
				terminalData.disposeListener?.dispose();
			});
		}
		terminalData.taskRunEnded = false;
		terminalData.terminal.statusList.remove(terminalData.status);
		// We don't want to show an infinite status for a background task that doesn't have a problem matcher.
		if ((terminalData.problemMatcher instanceof StartStopProblemCollector) || (terminalData.problemMatcher?.problemMatchers.length > 0) || event.runType === TaskRunType.SingleRun) {
			terminalData.terminal.statusList.add(ACTIVE_TASK_STATUS);
		}
	}
}
