/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { forEach } from 'vs/base/common/collections';
import { RunOnOptions, Task } from 'vs/workbench/parts/tasks/common/tasks';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';

const ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE = 'tasks.run.allowAutomatic';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	constructor(
		@ITaskService private readonly taskService: ITaskService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService) {
		super();

		const isFolderAutomaticAllowed = storageService.getBoolean(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, StorageScope.WORKSPACE, undefined);
		this.tryRunTasks(isFolderAutomaticAllowed);
	}

	private tryRunTasks(isAllowed: boolean | undefined) {
		// Not necessarily allowed to run the tasks, but we can see if there are any.
		if (isAllowed !== false) {
			this.taskService.getWorkspaceTasks().then(workspaceTaskResult => {
				if (workspaceTaskResult) {
					const tasks = new Array<Task | Promise<Task>>();
					workspaceTaskResult.forEach(resultElement => {
						if (resultElement.set) {
							resultElement.set.tasks.forEach(task => {
								if (task.runOptions.runOn === RunOnOptions.folderOpen) {
									tasks.push(task);
								}
							});
						}
						if (resultElement.configurations) {
							forEach(resultElement.configurations.byIdentifier, (configedTask) => {
								if (configedTask.value.runOptions.runOn === RunOnOptions.folderOpen) {
									tasks.push(new Promise<Task>(resolve => {
										this.taskService.getTask(resultElement.workspaceFolder, configedTask.value._id, true).then(task => resolve(task));
									}));
								}
							});
						}
					});

					if (tasks.length > 0) {
						// We have automatic tasks, prompt to run it if we don't already have permission.
						if (isAllowed === undefined) {
							this.showPrompt().then(postPromptAllowed => {
								if (postPromptAllowed) {
									this.runTasks(tasks);
								}
							});
						} else { // isAllowed must be true
							this.runTasks(tasks);
						}
					}
				}
			});
		}
	}

	private runTasks(tasks: Array<Task | Promise<Task>>) {
		tasks.forEach(task => {
			if (task instanceof Promise) {
				task.then(promiseResult => {
					if (promiseResult) {
						this.taskService.run(promiseResult);
					}
				});
			} else {
				this.taskService.run(task);
			}
		});
	}

	private showPrompt(): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			this.notificationService.prompt(Severity.Info, nls.localize('tasks.run.allowAutomatic', "This folder has automatic tasks defined in tasks.json. Do you allow automatic tasks to run when you open this folder/workspace?"),
				[{
					label: nls.localize('allow', "Allow"),
					run: () => {
						resolve(true);
						this.storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, true, StorageScope.WORKSPACE);
					}
				},
				{
					label: nls.localize('disallow', "Disallow"),
					run: () => {
						resolve(false);
						this.storageService.store(ARE_AUTOMATIC_TASKS_ALLOWED_IN_WORKSPACE, false, StorageScope.WORKSPACE);
					}
				},
				{
					label: nls.localize('notThisTime', "Not this time"),
					run: () => {
						resolve(false);
					}
				}]
			);
		});
	}

}