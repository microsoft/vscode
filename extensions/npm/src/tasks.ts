/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition, Task, WorkspaceFolder } from 'vscode';

export interface NpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

export interface ScriptValidator {
	scriptIsValid(task: Task): Promise<boolean>;
}

export function isWorkspaceFolder(value: any): value is WorkspaceFolder {
	return value && typeof value !== 'number';
}