/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinitionRegistry } from '../../../tasks/common/taskDefinitionRegistry.js';
import { ITaskDefinition, Task } from '../../../tasks/common/tasks.js';
import { ITaskService } from '../../../tasks/common/taskService.js';

export function getTaskDefinition(id: string) {
	const idx = id.indexOf(': ');
	const taskType = id.substring(0, idx);
	let taskLabel = id.substring(idx + 2);

	let foundTask: ITaskDefinition | undefined;
	TaskDefinitionRegistry.all()?.forEach((t: ITaskDefinition, i) => {
		if (t.taskType === taskType && (t.properties?.label || String(i)) === taskLabel) {
			foundTask = t;
		}
	});
	if (foundTask) {
		try {
			if (typeof parseInt(taskLabel) === 'number') {
				taskLabel = id;
			}
		} catch { }
		return { task: foundTask, taskLabel };
	}
	return undefined;
}

export async function getTaskWithId(id: string, tasksService: ITaskService): Promise<Task | undefined> {
	const taskDefinition = await getTaskDefinition(id);
	const task = (await tasksService.tasks()).find(t => {
		return t.getDefinition() === taskDefinition?.task;
	});
	return task;
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

