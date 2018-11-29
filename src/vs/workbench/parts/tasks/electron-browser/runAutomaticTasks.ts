/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { forEach } from 'vs/base/common/collections';
import { RunOnOptions } from 'vs/workbench/parts/tasks/common/tasks';

export class RunAutomaticTasks extends Disposable implements IWorkbenchContribution {
	constructor(
		@ITaskService taskService: ITaskService) {
		super();

		taskService.getWorkspaceTasks().then(workspaceTaskResult => {
			if (workspaceTaskResult) {
				workspaceTaskResult.forEach(resultElement => {
					if (resultElement.set) {
						resultElement.set.tasks.forEach(task => {
							if (task.runOptions.runOn === RunOnOptions.folderOpen) {
								taskService.run(task);
							}
						});
					}
					if (resultElement.configurations) {
						forEach(resultElement.configurations.byIdentifier, (configedTask) => {
							if (configedTask.value.runOptions.runOn === RunOnOptions.folderOpen) {
								taskService.getTask(resultElement.workspaceFolder, configedTask.value._id, true).then(task => {
									if (task) {
										taskService.run(task);
									}
								});
							}
						});
					}
				});
			}
		});
	}

}