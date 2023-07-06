/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import severity from 'vs/base/common/severity';
import { Event } from 'vs/base/common/event';
import { Markers } from 'vs/workbench/contrib/markers/common/markers';
import { ITaskService, ITaskSummary } from 'vs/workbench/contrib/tasks/common/taskService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ITaskEvent, TaskEventKind, ITaskIdentifier } from 'vs/workbench/contrib/tasks/common/tasks';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { withUndefinedAsNull } from 'vs/base/common/types';
import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IDebugConfiguration } from 'vs/workbench/contrib/debug/common/debug';
import { IViewsService } from 'vs/workbench/common/views';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { Action } from 'vs/base/common/actions';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { ICommandService } from 'vs/platform/commands/common/commands';

function once(match: (e: ITaskEvent) => boolean, event: Event<ITaskEvent>): Event<ITaskEvent> {
	return (listener, thisArgs = null, disposables?) => {
		const result = event(e => {
			if (match(e)) {
				result.dispose();
				return listener.call(thisArgs, e);
			}
		}, null, disposables);
		return result;
	};
}

export const enum TaskRunResult {
	Failure,
	Success
}

const DEBUG_TASK_ERROR_CHOICE_KEY = 'debug.taskerrorchoice';

export class DebugTaskRunner {

	private canceled = false;

	constructor(
		@ITaskService private readonly taskService: ITaskService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService
	) { }

	cancel(): void {
		this.canceled = true;
	}

	async runTaskAndCheckErrors(root: IWorkspaceFolder | IWorkspace | undefined, taskId: string | ITaskIdentifier | undefined): Promise<TaskRunResult> {
		try {
			this.canceled = false;
			const taskSummary = await this.runTask(root, taskId);
			if (this.canceled || (taskSummary && taskSummary.exitCode === undefined)) {
				// User canceled, either debugging, or the prelaunch task
				return TaskRunResult.Failure;
			}

			const errorCount = taskId ? this.markerService.read({ severities: MarkerSeverity.Error, take: 2 }).length : 0;
			const successExitCode = taskSummary && taskSummary.exitCode === 0;
			const failureExitCode = taskSummary && taskSummary.exitCode !== 0;
			const onTaskErrors = this.configurationService.getValue<IDebugConfiguration>('debug').onTaskErrors;
			if (successExitCode || onTaskErrors === 'debugAnyway' || (errorCount === 0 && !failureExitCode)) {
				return TaskRunResult.Success;
			}
			if (onTaskErrors === 'showErrors') {
				await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
				return Promise.resolve(TaskRunResult.Failure);
			}
			if (onTaskErrors === 'abort') {
				return Promise.resolve(TaskRunResult.Failure);
			}

			const taskLabel = typeof taskId === 'string' ? taskId : taskId ? taskId.name : '';
			const message = errorCount > 1
				? nls.localize('preLaunchTaskErrors', "Errors exist after running preLaunchTask '{0}'.", taskLabel)
				: errorCount === 1
					? nls.localize('preLaunchTaskError', "Error exists after running preLaunchTask '{0}'.", taskLabel)
					: taskSummary && typeof taskSummary.exitCode === 'number'
						? nls.localize('preLaunchTaskExitCode', "The preLaunchTask '{0}' terminated with exit code {1}.", taskLabel, taskSummary.exitCode)
						: nls.localize('preLaunchTaskTerminated', "The preLaunchTask '{0}' terminated.", taskLabel);

			enum DebugChoice {
				DebugAnyway = 1,
				ShowErrors = 2,
				Cancel = 0
			}
			const { result, checkboxChecked } = await this.dialogService.prompt<DebugChoice>({
				type: severity.Warning,
				message,
				buttons: [
					{
						label: nls.localize({ key: 'debugAnyway', comment: ['&& denotes a mnemonic'] }, "&&Debug Anyway"),
						run: () => DebugChoice.DebugAnyway
					},
					{
						label: nls.localize({ key: 'showErrors', comment: ['&& denotes a mnemonic'] }, "&&Show Errors"),
						run: () => DebugChoice.ShowErrors
					}
				],
				cancelButton: {
					label: nls.localize('abort', "Abort"),
					run: () => DebugChoice.Cancel
				},
				checkbox: {
					label: nls.localize('remember', "Remember my choice in user settings"),
				}
			});


			const debugAnyway = result === DebugChoice.DebugAnyway;
			const abort = result === DebugChoice.Cancel;
			if (checkboxChecked) {
				this.configurationService.updateValue('debug.onTaskErrors', result === DebugChoice.DebugAnyway ? 'debugAnyway' : abort ? 'abort' : 'showErrors');
			}

			if (abort) {
				return Promise.resolve(TaskRunResult.Failure);
			}
			if (debugAnyway) {
				return TaskRunResult.Success;
			}

			await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
			return Promise.resolve(TaskRunResult.Failure);
		} catch (err) {
			const taskConfigureAction = this.taskService.configureAction();
			const choiceMap: { [key: string]: number } = JSON.parse(this.storageService.get(DEBUG_TASK_ERROR_CHOICE_KEY, StorageScope.WORKSPACE, '{}'));

			let choice = -1;
			enum DebugChoice {
				DebugAnyway = 0,
				ConfigureTask = 1,
				Cancel = 2
			}
			if (choiceMap[err.message] !== undefined) {
				choice = choiceMap[err.message];
			} else {
				const { result, checkboxChecked } = await this.dialogService.prompt<DebugChoice>({
					type: severity.Error,
					message: err.message,
					buttons: [
						{
							label: nls.localize({ key: 'debugAnyway', comment: ['&& denotes a mnemonic'] }, "&&Debug Anyway"),
							run: () => DebugChoice.DebugAnyway
						},
						{
							label: taskConfigureAction.label,
							run: () => DebugChoice.ConfigureTask
						}
					],
					cancelButton: {
						run: () => DebugChoice.Cancel
					},
					checkbox: {
						label: nls.localize('rememberTask', "Remember my choice for this task")
					}
				});
				choice = result;
				if (checkboxChecked) {
					choiceMap[err.message] = choice;
					this.storageService.store(DEBUG_TASK_ERROR_CHOICE_KEY, JSON.stringify(choiceMap), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
			}

			if (choice === DebugChoice.ConfigureTask) {
				await taskConfigureAction.run();
			}

			return choice === DebugChoice.DebugAnyway ? TaskRunResult.Success : TaskRunResult.Failure;
		}
	}

	async runTask(root: IWorkspace | IWorkspaceFolder | undefined, taskId: string | ITaskIdentifier | undefined): Promise<ITaskSummary | null> {
		if (!taskId) {
			return Promise.resolve(null);
		}
		if (!root) {
			return Promise.reject(new Error(nls.localize('invalidTaskReference', "Task '{0}' can not be referenced from a launch configuration that is in a different workspace folder.", typeof taskId === 'string' ? taskId : taskId.type)));
		}
		// run a task before starting a debug session
		const task = await this.taskService.getTask(root, taskId);
		if (!task) {
			const errorMessage = typeof taskId === 'string'
				? nls.localize('DebugTaskNotFoundWithTaskId', "Could not find the task '{0}'.", taskId)
				: nls.localize('DebugTaskNotFound', "Could not find the specified task.");
			return Promise.reject(createErrorWithActions(errorMessage, [new Action(DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL, undefined, true, () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID))]));
		}

		// If a task is missing the problem matcher the promise will never complete, so we need to have a workaround #35340
		let taskStarted = false;
		const inactivePromise: Promise<ITaskSummary | null> = new Promise((c, e) => once(e => {
			// When a task isBackground it will go inactive when it is safe to launch.
			// But when a background task is terminated by the user, it will also fire an inactive event.
			// This means that we will not get to see the real exit code from running the task (undefined when terminated by the user).
			// Catch the ProcessEnded event here, which occurs before inactive, and capture the exit code to prevent this.
			return (e.kind === TaskEventKind.Inactive
				|| (e.kind === TaskEventKind.ProcessEnded && e.exitCode === undefined))
				&& e.taskId === task._id;
		}, this.taskService.onDidStateChange)(e => {
			taskStarted = true;
			c(e.kind === TaskEventKind.ProcessEnded ? { exitCode: e.exitCode } : null);
		}));

		const promise: Promise<ITaskSummary | null> = this.taskService.getActiveTasks().then(async (tasks): Promise<ITaskSummary | null> => {
			if (tasks.find(t => t._id === task._id)) {
				// Check that the task isn't busy and if it is, wait for it
				const busyTasks = await this.taskService.getBusyTasks();
				if (busyTasks.find(t => t._id === task._id)) {
					taskStarted = true;
					return inactivePromise;
				}
				// task is already running and isn't busy - nothing to do.
				return Promise.resolve(null);
			}
			once(e => ((e.kind === TaskEventKind.Active) || (e.kind === TaskEventKind.DependsOnStarted)) && e.taskId === task._id, this.taskService.onDidStateChange)(() => {
				// Task is active, so everything seems to be fine, no need to prompt after 10 seconds
				// Use case being a slow running task should not be prompted even though it takes more than 10 seconds
				taskStarted = true;
			});
			const taskPromise = this.taskService.run(task);
			if (task.configurationProperties.isBackground) {
				return inactivePromise;
			}

			return taskPromise.then(withUndefinedAsNull);
		});

		return new Promise((c, e) => {
			const waitForInput = new Promise<void>(resolve => once(e => (e.kind === TaskEventKind.AcquiredInput) && e.taskId === task._id, this.taskService.onDidStateChange)(() => {
				resolve();
			}));

			promise.then(result => {
				taskStarted = true;
				c(result);
			}, error => e(error));

			waitForInput.then(() => {
				const waitTime = task.configurationProperties.isBackground ? 5000 : 10000;

				setTimeout(() => {
					if (!taskStarted) {
						const errorMessage = typeof taskId === 'string'
							? nls.localize('taskNotTrackedWithTaskId', "The task '{0}' cannot be tracked. Make sure to have a problem matcher defined.", taskId)
							: nls.localize('taskNotTracked', "The task '{0}' cannot be tracked. Make sure to have a problem matcher defined.", JSON.stringify(taskId));
						e({ severity: severity.Error, message: errorMessage });
					}
				}, waitTime);
			});
		});
	}
}
