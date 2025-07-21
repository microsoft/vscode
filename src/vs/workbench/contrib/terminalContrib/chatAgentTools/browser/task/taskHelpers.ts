/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { ConfiguringTask, Task } from '../../../../tasks/common/tasks.js';
import { ITaskService } from '../../../../tasks/common/taskService.js';


export function getTaskDefinition(id: string) {
	const idx = id.indexOf(': ');
	const taskType = id.substring(0, idx);
	let taskLabel = id.substring(idx + 2);

	if (/^\d+$/.test(taskLabel)) {
		taskLabel = id;
	}

	return { taskLabel, taskType };

}

export function getTaskRepresentation(task: Task): string {
	const taskDefinition = task.getDefinition(true);
	if (!taskDefinition) {
		return '';
	}
	if ('label' in taskDefinition) {
		return taskDefinition.label;
	} else if ('script' in taskDefinition) {
		return taskDefinition.script;
	} else if ('command' in taskDefinition) {
		return taskDefinition.command;
	}
	return '';
}

export async function getTaskForTool(id: string, taskDefinition: { taskLabel?: string; taskType?: string }, workspaceFolder: string, taskService: ITaskService): Promise<Task | undefined> {
	// TODO: fix hack with file://
	let index = 0;
	let task;
	const wTasks: IStringDictionary<ConfiguringTask> | undefined = (await taskService.getWorkspaceTasks())?.get('file://' + workspaceFolder)?.configurations?.byIdentifier;
	for (const workspaceTask of Object.values(wTasks ?? {})) {
		if ((!workspaceTask.type || workspaceTask.type === taskDefinition?.taskType) && workspaceTask._label === taskDefinition?.taskLabel) {
			task = workspaceTask;
			break;
		} else if (id === workspaceTask.type + ': ' + index) {
			task = workspaceTask;
			break;
		}
		index++;
	}
	if (task) {
		return taskService.tryResolveTask(task);
	}
	return;
}
