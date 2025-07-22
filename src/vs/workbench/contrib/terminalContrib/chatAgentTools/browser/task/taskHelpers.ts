/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfiguringTask, Task } from '../../../../tasks/common/tasks.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';

export function getTaskDefinition(id: string) {
	const idx = id.indexOf(': ');
	const taskType = id.substring(0, idx);
	let taskLabel = idx > 0 ? id.substring(idx + 2) : id;

	if (/^\d+$/.test(taskLabel)) {
		taskLabel = id;
	}

	return { taskLabel, taskType };

}

export function getTaskRepresentation(task: { [key: string]: any }): string {
	if ('label' in task) {
		return task.label;
	} else if ('_label' in task) {
		return task._label;
	} else if ('script' in task) {
		return task.script;
	} else if ('command' in task) {
		return task.command;
	}
	return '';
}

export async function getTaskForTool(id: string, taskDefinition: { taskLabel?: string; taskType?: string }, workspaceFolder: string, configurationService: IConfigurationService, taskService: ITaskService): Promise<Task | undefined> {
	let index = 0;
	let task: IConfiguredTask | undefined;
	const configTasks: IConfiguredTask[] = (configurationService.getValue('tasks') as { tasks: IConfiguredTask[] }).tasks ?? [];
	for (const configTask of configTasks) {
		if ((configTask.type && taskDefinition.taskType ? configTask.type === taskDefinition.taskType : true) &&
			((getTaskRepresentation(configTask) === taskDefinition?.taskLabel) || (id === configTask._label))) {
			task = configTask;
			break;
		} else if (id === `${configTask.type}: ${index}`) {
			task = configTask;
			break;
		}
		index++;
	}
	if (!task) {
		return;
	}
	const configuringTasks: IStringDictionary<ConfiguringTask> | undefined = (await taskService.getWorkspaceTasks())?.get(URI.file(workspaceFolder).toString())?.configurations?.byIdentifier;
	const configuredTask: ConfiguringTask | undefined = Object.values(configuringTasks ?? {}).find(t => {
		return t.type === task.type && (t._label === getTaskRepresentation(task) || t._label === `${task.type}: ${getTaskRepresentation(task)}`);
	});
	let resolvedTask: Task | undefined = undefined;
	if (configuredTask) {
		resolvedTask = await taskService.tryResolveTask(configuredTask);
	}
	if (!resolvedTask) {
		const customTasks: Task[] | undefined = (await taskService.getWorkspaceTasks())?.get(URI.file(workspaceFolder).toString())?.set?.tasks;
		resolvedTask = customTasks?.find(t => getTaskRepresentation(t) === getTaskRepresentation(task));

	}
	return resolvedTask;
}

interface IConfiguredTask {
	type?: string;
	label?: string;
	_label?: string;
}
