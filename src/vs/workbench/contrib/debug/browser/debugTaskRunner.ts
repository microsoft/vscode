/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from '../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { createErrorWithActions } from '../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import severity from '../../../../base/common/severity.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspace, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from './debugCommands.js';
import { IDebugConfiguration } from '../common/debug.js';
import { Markers } from '../../markers/common/markers.js';
import { ConfiguringTask, CustomTask, ITaskEvent, ITaskIdentifier, Task, TaskEventKind } from '../../tasks/common/tasks.js';
import { ITaskService, ITaskSummary } from '../../tasks/common/taskService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';

const onceFilter = (event: Event<ITaskEvent>, filter: (e: ITaskEvent) => boolean) => Event.once(Event.filter(event, filter));

export const enum TaskRunResult {
	Failure,
	Success
}

const DEBUG_TASK_ERROR_CHOICE_KEY = 'debug.taskerrorchoice';
const ABORT_LABEL = nls.localize('abort', "Abort");
const DEBUG_ANYWAY_LABEL = nls.localize({ key: 'debugAnyway', comment: ['&& denotes a mnemonic'] }, "&&Debug Anyway");
const DEBUG_ANYWAY_LABEL_NO_MEMO = nls.localize('debugAnywayNoMemo', "Debug Anyway");

interface IRunnerTaskSummary extends ITaskSummary {
	cancelled?: boolean;
}

export class DebugTaskRunner implements IDisposable {

	private globalCancellation = new CancellationTokenSource();

	constructor(
		@ITaskService private readonly taskService: ITaskService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
		@IDialogService private readonly dialogService: IDialogService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IProgressService private readonly progressService: IProgressService,
	) { }

	cancel(): void {
		this.globalCancellation.dispose(true);
		this.globalCancellation = new CancellationTokenSource();
	}

	public dispose(): void {
		this.globalCancellation.dispose(true);
	}

	async runTaskAndCheckErrors(
		root: IWorkspaceFolder | IWorkspace | undefined,
		taskId: string | ITaskIdentifier | undefined,
	): Promise<TaskRunResult> {
		try {
			const taskSummary = await this.runTask(root, taskId, this.globalCancellation.token);
			if (taskSummary && (taskSummary.exitCode === undefined || taskSummary.cancelled)) {
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
						label: DEBUG_ANYWAY_LABEL,
						run: () => DebugChoice.DebugAnyway
					},
					{
						label: nls.localize({ key: 'showErrors', comment: ['&& denotes a mnemonic'] }, "&&Show Errors"),
						run: () => DebugChoice.ShowErrors
					}
				],
				cancelButton: {
					label: ABORT_LABEL,
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

	async runTask(root: IWorkspace | IWorkspaceFolder | undefined, taskId: string | ITaskIdentifier | undefined, token = this.globalCancellation.token): Promise<IRunnerTaskSummary | null> {
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
			return Promise.reject(createErrorWithActions(errorMessage, [toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) })]));
		}

		// If a task is missing the problem matcher the promise will never complete, so we need to have a workaround #35340
		let taskStarted = false;
		const store = new DisposableStore();
		const getTaskKey = (t: Task) => t.getKey() ?? t.getMapKey();
		const taskKey = getTaskKey(task);
		const inactivePromise: Promise<ITaskSummary | null> = new Promise((resolve) => store.add(
			onceFilter(this.taskService.onDidStateChange, e => {
				// When a task isBackground it will go inactive when it is safe to launch.
				// But when a background task is terminated by the user, it will also fire an inactive event.
				// This means that we will not get to see the real exit code from running the task (undefined when terminated by the user).
				// Catch the ProcessEnded event here, which occurs before inactive, and capture the exit code to prevent this.
				return (e.kind === TaskEventKind.Inactive
					|| (e.kind === TaskEventKind.ProcessEnded && e.exitCode === undefined))
					&& getTaskKey(e.__task) === taskKey;
			})(e => {
				taskStarted = true;
				resolve(e.kind === TaskEventKind.ProcessEnded ? { exitCode: e.exitCode } : null);
			}),
		));

		store.add(
			onceFilter(this.taskService.onDidStateChange, e => ((e.kind === TaskEventKind.Active) || (e.kind === TaskEventKind.DependsOnStarted)) && getTaskKey(e.__task) === taskKey
			)(() => {
				// Task is active, so everything seems to be fine, no need to prompt after 10 seconds
				// Use case being a slow running task should not be prompted even though it takes more than 10 seconds
				taskStarted = true;
			})
		);

		const didAcquireInput = store.add(new Emitter<void>());
		store.add(onceFilter(
			this.taskService.onDidStateChange,
			e => (e.kind === TaskEventKind.AcquiredInput) && getTaskKey(e.__task) === taskKey
		)(() => didAcquireInput.fire()));

		const taskDonePromise: Promise<ITaskSummary | null> = this.taskService.getActiveTasks().then(async (tasks): Promise<ITaskSummary | null> => {
			if (tasks.find(t => getTaskKey(t) === taskKey)) {
				didAcquireInput.fire();
				// Check that the task isn't busy and if it is, wait for it
				const busyTasks = await this.taskService.getBusyTasks();
				if (busyTasks.find(t => getTaskKey(t) === taskKey)) {
					taskStarted = true;
					return inactivePromise;
				}
				// task is already running and isn't busy - nothing to do.
				return Promise.resolve(null);
			}

			const taskPromise = this.taskService.run(task);
			if (task.configurationProperties.isBackground) {
				return inactivePromise;
			}

			return taskPromise.then(x => x ?? null);
		});

		const result = new Promise<IRunnerTaskSummary | null>((resolve, reject) => {
			taskDonePromise.then(result => {
				taskStarted = true;
				resolve(result);
			}, error => reject(error));

			store.add(token.onCancellationRequested(() => {
				resolve({ exitCode: undefined, cancelled: true });
				this.taskService.terminate(task).catch(() => { });
			}));

			// Start the timeouts once a terminal has been acquired
			store.add(didAcquireInput.event(() => {
				const waitTime = task.configurationProperties.isBackground ? 5000 : 10000;

				// Error shown if there's a background task with no problem matcher that doesn't exit quickly
				store.add(disposableTimeout(() => {
					if (!taskStarted) {
						const errorMessage = nls.localize('taskNotTracked', "The task '{0}' has not exited and doesn't have a 'problemMatcher' defined. Make sure to define a problem matcher for watch tasks.", typeof taskId === 'string' ? taskId : JSON.stringify(taskId));
						reject({ severity: severity.Error, message: errorMessage });
					}
				}, waitTime));

				const hideSlowPreLaunchWarning = this.configurationService.getValue<IDebugConfiguration>('debug').hideSlowPreLaunchWarning;
				if (!hideSlowPreLaunchWarning) {
					// Notification shown on any task taking a while to resolve
					store.add(disposableTimeout(() => {
						const message = nls.localize('runningTask', "Waiting for preLaunchTask '{0}'...", task.configurationProperties.name);
						const buttons = [DEBUG_ANYWAY_LABEL_NO_MEMO, ABORT_LABEL];
						const canConfigure = task instanceof CustomTask || task instanceof ConfiguringTask;
						if (canConfigure) {
							buttons.splice(1, 0, nls.localize('configureTask', "Configure Task"));
						}

						this.progressService.withProgress(
							{ location: ProgressLocation.Notification, title: message, buttons },
							() => result.catch(() => { }),
							(choice) => {
								if (choice === undefined) {
									// no-op, keep waiting
								} else if (choice === 0) { // debug anyway
									resolve({ exitCode: 0 });
								} else { // abort or configure
									resolve({ exitCode: undefined, cancelled: true });
									this.taskService.terminate(task).catch(() => { });
									if (canConfigure && choice === 1) { // configure
										this.taskService.openConfig(task as CustomTask);
									}
								}
							}
						);
					}, 10_000));
				}
			}));
		});

		return result.finally(() => store.dispose());
	}
}
