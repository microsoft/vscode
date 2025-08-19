/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { AbstractProblemCollector, StartStopProblemCollector, WatchingProblemCollector } from '../common/problemCollectors.js';
import { ITaskGeneralEvent, ITaskProcessEndedEvent, ITaskProcessStartedEvent, TaskEventKind, TaskRunType } from '../common/tasks.js';
import { ITaskService, Task } from '../common/taskService.js';
import { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import type { IMarker } from '@xterm/xterm';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { ITerminalStatus } from '../../terminal/common/terminal.js';
import { URI } from '../../../../base/common/uri.js';
import { IMarkerData, MarkerSeverity, IMarker as ITaskMarker } from '../../../../platform/markers/common/markers.js';

interface ITerminalData {
	terminal: ITerminalInstance;
	task: Task;
	status: ITerminalStatus;
	problemMatcher: AbstractProblemCollector;
	taskRunEnded: boolean;
	disposeListener?: MutableDisposable<IDisposable>;
}

interface ITerminalMarkerData {
	resources: Map<string, URI>;
	markers: Map<string, Map<string, IMarkerData>>;
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
	private terminalMap: Map<number, ITerminalData> = new Map();
	private terminalMarkerMap: Map<number, ITerminalMarkerData> = new Map();
	private _marker: IMarker | undefined;
	constructor(@ITaskService taskService: ITaskService, @IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService) {
		super();
		this._register(taskService.onDidStateChange((event) => {
			switch (event.kind) {
				case TaskEventKind.ProcessStarted:
				case TaskEventKind.Active: this.eventActive(event); break;
				case TaskEventKind.Inactive: this.eventInactive(event); break;
				case TaskEventKind.ProcessEnded: this.eventEnd(event); break;
			}
		}));
		this._register(toDisposable(() => {
			for (const terminalData of this.terminalMap.values()) {
				terminalData.disposeListener?.dispose();
			}
			this.terminalMap.clear();
		}));
	}

	addTerminal(task: Task, terminal: ITerminalInstance, problemMatcher: AbstractProblemCollector) {
		const status: ITerminalStatus = { id: TASK_TERMINAL_STATUS_ID, severity: Severity.Info };
		terminal.statusList.add(status);

		this.terminalMarkerMap.set(terminal.instanceId, {
			resources: new Map<string, URI>(),
			markers: new Map<string, Map<string, IMarkerData>>()
		});
		this._register(terminal.onDisposed(() => {
			this.terminalMarkerMap.delete(terminal.instanceId);
		}));
		this._register(problemMatcher.onDidFindFirstMatch(() => {
			this._marker = terminal.registerMarker();
			if (this._marker) {
				this._register(this._marker);
			}
		}));
		this._register(problemMatcher.onDidFindErrors((markers: ITaskMarker[]) => {
			if (this._marker) {
				terminal.addBufferMarker({ marker: this._marker, hoverMessage: nls.localize('task.watchFirstError', "Beginning of detected errors for this run"), disableCommandStorage: true });
			}
			const markerData = this.terminalMarkerMap.get(terminal.instanceId);
			if (markerData && problemMatcher instanceof WatchingProblemCollector) {
				// Clear existing markers for a new set, otherwise older compilation
				// issues will be included
				markerData.markers.clear();
				markerData.resources.clear();

				markers.forEach((marker) => {
					if (marker.severity === MarkerSeverity.Error) {
						markerData.resources.set(marker.resource.toString(), marker.resource);
						const markersForOwner = markerData.markers.get(marker.owner);
						let markerMap = markersForOwner;
						if (!markerMap) {
							markerMap = new Map();
							markerData.markers.set(marker.owner, markerMap);
						}
						markerMap.set(marker.resource.toString(), marker);
						this.terminalMarkerMap.set(terminal.instanceId, markerData);
					}
				});
			}
		}));
		this._register(problemMatcher.onDidRequestInvalidateLastMarker(() => {
			this._marker?.dispose();
			this._marker = undefined;
		}));

		this.terminalMap.set(terminal.instanceId, { terminal, task, status, problemMatcher, taskRunEnded: false });
	}

	private terminalFromEvent(event: { terminalId: number | undefined }): ITerminalData | undefined {
		if (!('terminalId' in event) || !event.terminalId) {
			return undefined;
		}
		return this.terminalMap.get(event.terminalId);
	}

	private eventEnd(event: ITaskProcessEndedEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		terminalData.taskRunEnded = true;
		terminalData.terminal.statusList.remove(terminalData.status);
		if ((event.exitCode === 0) && (!terminalData.problemMatcher.maxMarkerSeverity || terminalData.problemMatcher.maxMarkerSeverity < MarkerSeverity.Warning)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.taskCompleted);
			if (terminalData.task.configurationProperties.isBackground) {
				for (const status of terminalData.terminal.statusList.statuses) {
					terminalData.terminal.statusList.remove(status);
				}
			} else {
				terminalData.terminal.statusList.add(SUCCEEDED_TASK_STATUS);
			}
		} else if (event.exitCode || (terminalData.problemMatcher.maxMarkerSeverity !== undefined && terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error)) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
			terminalData.terminal.statusList.add(FAILED_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
			terminalData.terminal.statusList.add(WARNING_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
			terminalData.terminal.statusList.add(INFO_TASK_STATUS);
		}
	}

	private eventInactive(event: ITaskGeneralEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData || !terminalData.problemMatcher || terminalData.taskRunEnded) {
			return;
		}
		terminalData.terminal.statusList.remove(terminalData.status);
		if (terminalData.problemMatcher.numberOfMatches === 0) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.taskCompleted);
			terminalData.terminal.statusList.add(SUCCEEDED_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
			terminalData.terminal.statusList.add(FAILED_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
			terminalData.terminal.statusList.add(WARNING_INACTIVE_TASK_STATUS);
		} else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
			terminalData.terminal.statusList.add(INFO_INACTIVE_TASK_STATUS);
		}
	}

	private eventActive(event: ITaskGeneralEvent | ITaskProcessStartedEvent) {
		const terminalData = this.terminalFromEvent(event);
		if (!terminalData) {
			return;
		}
		if (!terminalData.disposeListener) {
			terminalData.disposeListener = this._register(new MutableDisposable());
			terminalData.disposeListener.value = terminalData.terminal.onDisposed(() => {
				if (!event.terminalId) {
					return;
				}
				this.terminalMap.delete(event.terminalId);
				this.terminalMarkerMap.delete(event.terminalId);
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

	/**
	 * Gets the task problems for a specific terminal instance
	 * @param instanceId The terminal instance ID
	 * @returns Map of problem matchers to their resources and marker data, or undefined if no problems found
	 */
	public getTaskProblems(instanceId: number): Map<string, { resources: URI[]; markers: IMarkerData[] }> | undefined {
		const markerData = this.terminalMarkerMap.get(instanceId);
		if (!markerData) {
			return undefined;
		} else if (markerData.markers.size === 0) {
			return new Map();
		}

		const result = new Map<string, { resources: URI[]; markers: IMarkerData[] }>();
		for (const [owner, markersMap] of markerData.markers) {
			const resources: URI[] = [];
			const markers: IMarkerData[] = [];
			for (const [resource, marker] of markersMap) {
				resources.push(markerData.resources.get(resource)!);
				markers.push(marker);
			}
			result.set(owner, { resources, markers });
		}
		return result;
	}
}
