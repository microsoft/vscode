/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

export function getTaskRepresentation(task: vscode.TaskDefinition): string {
	if ('label' in task) {
		return task.label;
	} else if ('script' in task) {
		return task.script;
	} else if ('command' in task) {
		return task.command;
	}
	return '';
}