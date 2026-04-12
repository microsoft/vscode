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
import * as nls from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { StartStopProblemCollector } from '../common/problemCollectors.js';
import { TaskEventKind } from '../common/tasks.js';
import { ITaskService } from '../common/taskService.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { spinningLoading } from '../../../../platform/theme/common/iconRegistry.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
const TASK_TERMINAL_STATUS_ID = 'task_terminal_status';
export const ACTIVE_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: spinningLoading, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.active', "Task is running") };
export const SUCCEEDED_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.check, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.succeeded', "Task succeeded") };
const SUCCEEDED_INACTIVE_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.check, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.succeededInactive', "Task succeeded and waiting...") };
export const FAILED_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.error, severity: Severity.Error, tooltip: nls.localize('taskTerminalStatus.errors', "Task has errors") };
const FAILED_INACTIVE_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.error, severity: Severity.Error, tooltip: nls.localize('taskTerminalStatus.errorsInactive', "Task has errors and is waiting...") };
const WARNING_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.warning, severity: Severity.Warning, tooltip: nls.localize('taskTerminalStatus.warnings', "Task has warnings") };
const WARNING_INACTIVE_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.warning, severity: Severity.Warning, tooltip: nls.localize('taskTerminalStatus.warningsInactive', "Task has warnings and is waiting...") };
const INFO_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.info, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.infos', "Task has infos") };
const INFO_INACTIVE_TASK_STATUS = { id: TASK_TERMINAL_STATUS_ID, icon: Codicon.info, severity: Severity.Info, tooltip: nls.localize('taskTerminalStatus.infosInactive', "Task has infos and is waiting...") };
let TaskTerminalStatus = class TaskTerminalStatus extends Disposable {
    constructor(taskService, _accessibilitySignalService) {
        super();
        this._accessibilitySignalService = _accessibilitySignalService;
        this.terminalMap = this._register(new DisposableMap());
        this._register(taskService.onDidStateChange((event) => {
            switch (event.kind) {
                case TaskEventKind.ProcessStarted:
                case TaskEventKind.Active:
                    this.eventActive(event);
                    break;
                case TaskEventKind.Inactive:
                    this.eventInactive(event);
                    break;
                case TaskEventKind.ProcessEnded:
                    this.eventEnd(event);
                    break;
            }
        }));
    }
    addTerminal(task, terminal, problemMatcher) {
        const status = { id: TASK_TERMINAL_STATUS_ID, severity: Severity.Info };
        terminal.statusList.add(status);
        const store = new DisposableStore();
        store.add(problemMatcher.onDidFindFirstMatch(() => {
            this._marker = terminal.registerMarker();
            if (this._marker) {
                store.add(this._marker);
            }
        }));
        store.add(problemMatcher.onDidFindErrors(() => {
            if (this._marker) {
                terminal.addBufferMarker({ marker: this._marker, hoverMessage: nls.localize('task.watchFirstError', "Beginning of detected errors for this run"), disableCommandStorage: true });
            }
        }));
        store.add(problemMatcher.onDidRequestInvalidateLastMarker(() => {
            this._marker?.dispose();
            this._marker = undefined;
        }));
        store.add(terminal.onDisposed(() => {
            this.terminalMap.deleteAndDispose(terminal.instanceId);
        }));
        this.terminalMap.set(terminal.instanceId, {
            terminal,
            task,
            status,
            problemMatcher,
            taskRunEnded: false,
            dispose() {
                store.dispose();
            },
        });
    }
    terminalFromEvent(event) {
        if (!Object.hasOwn(event, 'terminalId') || !event.terminalId) {
            return undefined;
        }
        return this.terminalMap.get(event.terminalId);
    }
    eventEnd(event) {
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
            }
            else {
                terminalData.terminal.statusList.add(SUCCEEDED_TASK_STATUS);
            }
        }
        else if (event.exitCode || (terminalData.problemMatcher.maxMarkerSeverity !== undefined && terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error)) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
            terminalData.terminal.statusList.add(FAILED_TASK_STATUS);
        }
        else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
            terminalData.terminal.statusList.add(WARNING_TASK_STATUS);
        }
        else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
            terminalData.terminal.statusList.add(INFO_TASK_STATUS);
        }
    }
    eventInactive(event) {
        const terminalData = this.terminalFromEvent(event);
        if (!terminalData || !terminalData.problemMatcher || terminalData.taskRunEnded) {
            return;
        }
        terminalData.terminal.statusList.remove(terminalData.status);
        if (terminalData.problemMatcher.numberOfMatches === 0) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.taskCompleted);
            terminalData.terminal.statusList.add(SUCCEEDED_INACTIVE_TASK_STATUS);
        }
        else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Error) {
            this._accessibilitySignalService.playSignal(AccessibilitySignal.taskFailed);
            terminalData.terminal.statusList.add(FAILED_INACTIVE_TASK_STATUS);
        }
        else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Warning) {
            terminalData.terminal.statusList.add(WARNING_INACTIVE_TASK_STATUS);
        }
        else if (terminalData.problemMatcher.maxMarkerSeverity === MarkerSeverity.Info) {
            terminalData.terminal.statusList.add(INFO_INACTIVE_TASK_STATUS);
        }
    }
    eventActive(event) {
        const terminalData = this.terminalFromEvent(event);
        if (!terminalData) {
            return;
        }
        terminalData.taskRunEnded = false;
        terminalData.terminal.statusList.remove(terminalData.status);
        // We don't want to show an infinite status for a background task that doesn't have a problem matcher.
        if ((terminalData.problemMatcher instanceof StartStopProblemCollector) || (terminalData.problemMatcher?.problemMatchers.length > 0) || event.runType === "singleRun" /* TaskRunType.SingleRun */) {
            terminalData.terminal.statusList.add(ACTIVE_TASK_STATUS);
        }
    }
};
TaskTerminalStatus = __decorate([
    __param(0, ITaskService),
    __param(1, IAccessibilitySignalService)
], TaskTerminalStatus);
export { TaskTerminalStatus };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza1Rlcm1pbmFsU3RhdHVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGFza3MvYnJvd3Nlci90YXNrVGVybWluYWxTdGF0dXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0csT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUE0Qix5QkFBeUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JHLE9BQU8sRUFBdUUsYUFBYSxFQUFlLE1BQU0sb0JBQW9CLENBQUM7QUFDckksT0FBTyxFQUFFLFlBQVksRUFBUSxNQUFNLDBCQUEwQixDQUFDO0FBRTlELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFcEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLE1BQU0sZ0ZBQWdGLENBQUM7QUFXbEosTUFBTSx1QkFBdUIsR0FBRyxzQkFBc0IsQ0FBQztBQUN2RCxNQUFNLENBQUMsTUFBTSxrQkFBa0IsR0FBb0IsRUFBRSxFQUFFLEVBQUUsdUJBQXVCLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxpQkFBaUIsQ0FBQyxFQUFFLENBQUM7QUFDMU0sTUFBTSxDQUFDLE1BQU0s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