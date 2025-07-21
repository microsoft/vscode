/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Task } from '../../../tasks/common/tasks.js';


export function getTaskDefinition(id: string) {
	const idx = id.indexOf(': ');
	const taskType = id.substring(0, idx);
	const taskLabel = id.substring(idx + 2);


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

