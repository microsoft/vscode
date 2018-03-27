/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TaskDefinition, Task } from 'vscode';

export interface NpmTaskDefinition extends TaskDefinition {
	script: string;
	path?: string;
}

export interface ScriptValidator {
	scriptIsValid(task: Task): Promise<boolean>;
}