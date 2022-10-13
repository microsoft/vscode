/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as resources from 'vs/base/common/resources';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITaskService, IWorkspaceFolderTaskResult } from 'vs/workbench/contrib/tasks/common/taskService';
import { RunOnOptions, Task, TaskRunSource, TaskSource, TaskSourceKind, TASKS_CATEGORY, WorkspaceFileTaskSource, IWorkspaceTaskSource } from 'vs/workbench/contrib/tasks/common/tasks';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';

const HAS_PROMPTED_FOR_AUTOMATIC_TASKS = 'task.hasPromptedForAutomaticTasks';
const ALLOW_AUTOMATIC_TASKS = 'task.allowAutomaticTasks';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	private _hasRunTasks: boolean = false;
	constructor(
		@ITaskService private readonly _taskService: ITaskService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@INotificationService private readonly _notificationService: INotificationService) {
		super();
		if (this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			this._tryRunTasks();
		}
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(async trusted => {
			if (trusted) {
				await this._tryRunTasks();
			}
		}));
	}

	private async _tryRunTasks() {
		if (this._hasRunTasks || this._configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === 'off') {
			return;
		}
		this._hasRunTasks = true;
		this._logService.trace('RunAutomaticTasks: Trying to run tasks.');
		// Wait until we have task system info (the extension host and workspace folders are available).
		if (!this._taskService.hasTaskSystemInfo) {
			this._logService.trace('RunAutomaticTasks: Awaiting task system info.');
			await Event.toPromise(Event.once(this._taskService.onDidChangeTaskSystemInfo));
		}
		const workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
		this._logService.trace(`RunAutomaticTasks: Found ${workspaceTasks.size} automatic tasks`);
		await this._runWithPermission(this._taskService, this._storageService, this._notificationService, this._workspaceTrustManagementService, this._openerService, this._configurationService, workspaceTasks);
	}

	private _runTasks(taskService: ITaskService, tasks: Array<Task | Promise<Task | undefined>>) {
		tasks.forEach(task => {
			if (task instanceof Promise) {
				task.then(promiseResult => {
					if (promiseResult) {
						taskService.run(promiseResult);
					}
				});
			} else {
				taskService.run(task);
			}
		});
	}

	private _getTaskSource(source: TaskSource): URI | undefined {
		const taskKind = TaskSourceKind.toConfigurationTarget(source.kind);
		switch (taskKind) {
			case ConfigurationTarget.WORKSPACE_FOLDER: {
				return resources.joinPath((<IWorkspaceTaskSource>source).config.workspaceFolder!.uri, (<IWorkspaceTaskSource>source).config.file);
			}
			case ConfigurationTarget.WORKSPACE: {
				return (<WorkspaceFileTaskSource>source).config.workspace?.configuration ?? undefined;
			}
		}
		return undefined;
	}

	private _findAutoTasks(taskService: ITaskService, workspaceTaskResult: Map<string, IWorkspaceFolderTaskResult>): { tasks: Array<Task | Promise<Task | undefined>>; taskNames: Array<string>; locations: Map<string, URI> } {
		const tasks = new Array<Task | Promise<Task | undefined>>();
		const taskNames = new Array<string>();
		const locations = new Map<string, URI>();

		if (workspaceTaskResult) {
			workspaceTaskResult.forEach(resultElement => {
				if (resultElement.set) {
					resultElement.set.tasks.forEach(task => {
						if (task.runOptions.runOn === RunOnOptions.folderOpen) {
							tasks.push(task);
							taskNames.push(task._label);
							const location = this._getTaskSource(task._source);
							if (location) {
								locations.set(location.fsPath, location);
							}
						}
					});
				}
				if (resultElement.configurations) {
					for (const configuredTask of Object.values(resultElement.configurations.byIdentifier)) {
						if (configuredTask.runOptions.runOn === RunOnOptions.folderOpen) {
							tasks.push(new Promise<Task | undefined>(resolve => {
								taskService.getTask(resultElement.workspaceFolder, configuredTask._id, true).then(task => resolve(task));
							}));
							if (configuredTask._label) {
								taskNames.push(configuredTask._label);
							} else {
								taskNames.push(configuredTask.configures.task);
							}
							const location = this._getTaskSource(configuredTask._source);
							if (location) {
								locations.set(location.fsPath, location);
							}
						}
					}
				}
			});
		}
		return { tasks, taskNames, locations };
	}

	private async _runWithPermission(taskService: ITaskService, storageService: IStorageService, notificationService: INotificationService, workspaceTrustManagementService: IWorkspaceTrustManagementService,
		openerService: IOpenerService, configurationService: IConfigurationService, workspaceTaskResult: Map<string, IWorkspaceFolderTaskResult>) {

		const hasShownPromptForAutomaticTasks = storageService.getBoolean(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, StorageScope.WORKSPACE, false);
		const { tasks, taskNames, locations } = this._findAutoTasks(taskService, workspaceTaskResult);

		if (taskNames.length === 0) {
			return;
		}
		if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === 'on') {
			this._runTasks(taskService, tasks);
		} else if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === 'auto' && !hasShownPromptForAutomaticTasks) {
			// by default, only prompt once per folder
			// otherwise, this can be configured via the setting
			this._showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations).then(allow => {
				if (allow) {
					storageService.store(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, true, StorageScope.WORKSPACE, StorageTarget.USER);
					this._runTasks(taskService, tasks);
				}
			});
		}
	}

	private _showPrompt(notificationService: INotificationService, storageService: IStorageService,
		openerService: IOpenerService, configurationService: IConfigurationService, taskNames: Array<string>, locations: Map<string, URI>): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			notificationService.prompt(Severity.Info, nls.localize('tasks.run.allowAutomatic',
				"This workspace has tasks ({0}) defined ({1}) that run automatically when you open this workspace. Do you allow automatic tasks to run when you open this workspace?",
				taskNames.join(', '),
				Array.from(locations.keys()).join(', ')
			),
				[{
					label: nls.localize('allow', "Allow and run"),
					run: () => {
						resolve(true);
						configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, 'on', ConfigurationTarget.WORKSPACE);
					}
				},
				{
					label: nls.localize('disallow', "Disallow"),
					run: () => {
						resolve(false);
						configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, 'off', ConfigurationTarget.WORKSPACE);

					}
				},
				{
					label: locations.size === 1 ? nls.localize('openTask', "Open file") : nls.localize('openTasks', "Open files"),
					run: async () => {
						for (const location of locations) {
							await openerService.open(location[1]);
						}
						resolve(false);
					}
				}]
			);
			storageService.store(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});
	}
}

export class ManageAutomaticTaskRunning extends Action2 {

	public static readonly ID = 'workbench.action.tasks.manageAutomaticRunning';
	public static readonly LABEL = nls.localize('workbench.action.tasks.manageAutomaticRunning', "Manage Automatic Tasks in Folder");

	constructor() {
		super({
			id: ManageAutomaticTaskRunning.ID,
			title: ManageAutomaticTaskRunning.LABEL,
			category: TASKS_CATEGORY
		});
	}

	public async run(accessor: ServicesAccessor): Promise<any> {
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const allowItem: IQuickPickItem = { label: nls.localize('workbench.action.tasks.allowAutomaticTasks', "Allow Automatic Tasks in Folder") };
		const disallowItem: IQuickPickItem = { label: nls.localize('workbench.action.tasks.disallowAutomaticTasks', "Disallow Automatic Tasks in Folder") };
		const value = await quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
		if (!value) {
			return;
		}
		configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, value === allowItem ? 'on' : 'off', ConfigurationTarget.WORKSPACE);
	}
}
