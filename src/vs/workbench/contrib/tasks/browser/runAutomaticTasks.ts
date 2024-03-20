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
import { IQuickPickItem, IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ConfigurationTarget, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';

const ALLOW_AUTOMATIC_TASKS = 'task.allowAutomaticTasks';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	private _hasRunTasks: boolean = false;
	constructor(
		@ITaskService private readonly _taskService: ITaskService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ILogService private readonly _logService: ILogService) {
		super();
		if (this._taskService.isReconnected) {
			this._tryRunTasks();
		} else {
			this._register(Event.once(this._taskService.onDidReconnectToTasks)(async () => await this._tryRunTasks()));
		}
		this._register(this._workspaceTrustManagementService.onDidChangeTrust(async () => await this._tryRunTasks()));
	}

	private async _tryRunTasks() {
		if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
			return;
		}
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
		let workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
		this._logService.trace(`RunAutomaticTasks: Found ${workspaceTasks.size} automatic tasks`);

		let autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
		this._logService.trace(`RunAutomaticTasks: taskNames=${JSON.stringify(autoTasks.taskNames)}`);

		// As seen in some cases with the Remote SSH extension, the tasks configuration is loaded after we have come
		// to this point. Let's give it some extra time.
		if (autoTasks.taskNames.length === 0) {
			const updatedWithinTimeout = await Promise.race([
				new Promise<boolean>((resolve) => {
					Event.toPromise(Event.once(this._taskService.onDidChangeTaskConfig)).then(() => resolve(true));
				}),
				new Promise<boolean>((resolve) => {
					const timer = setTimeout(() => { clearTimeout(timer); resolve(false); }, 10000);
				})]);

			if (!updatedWithinTimeout) {
				this._logService.trace(`RunAutomaticTasks: waited some extra time, but no update of tasks configuration`);
				return;
			}

			workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
			autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
			this._logService.trace(`RunAutomaticTasks: updated taskNames=${JSON.stringify(autoTasks.taskNames)}`);
		}

		this._runWithPermission(this._taskService, this._configurationService, autoTasks.tasks, autoTasks.taskNames);
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

	private async _runWithPermission(taskService: ITaskService, configurationService: IConfigurationService, tasks: (Task | Promise<Task | undefined>)[], taskNames: string[]) {
		if (taskNames.length === 0) {
			return;
		}
		if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === 'off') {
			return;
		}
		this._runTasks(taskService, tasks);
	}
}

export class ManageAutomaticTaskRunning extends Action2 {

	public static readonly ID = 'workbench.action.tasks.manageAutomaticRunning';
	public static readonly LABEL = nls.localize('workbench.action.tasks.manageAutomaticRunning', "Manage Automatic Tasks");

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
		const allowItem: IQuickPickItem = { label: nls.localize('workbench.action.tasks.allowAutomaticTasks', "Allow Automatic Tasks") };
		const disallowItem: IQuickPickItem = { label: nls.localize('workbench.action.tasks.disallowAutomaticTasks', "Disallow Automatic Tasks") };
		const value = await quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
		if (!value) {
			return;
		}
		configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, value === allowItem ? 'on' : 'off', ConfigurationTarget.USER);
	}
}
