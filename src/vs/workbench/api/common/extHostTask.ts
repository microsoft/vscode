/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { ExtHostTaskShape } from 'vs/workbench/api/common/extHost.protocol';
import * as vscode from 'vscode';
import { TaskSystemInfoDTO } from '../common/shared/tasks';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IExtHostTask extends ExtHostTaskShape {

	readonly _serviceBrand: any;

	taskExecutions: vscode.TaskExecution[];
	onDidStartTask: Event<vscode.TaskStartEvent>;
	onDidEndTask: Event<vscode.TaskEndEvent>;
	onDidStartTaskProcess: Event<vscode.TaskProcessStartEvent>;
	onDidEndTaskProcess: Event<vscode.TaskProcessEndEvent>;

	registerTaskProvider(extension: IExtensionDescription, type: string, provider: vscode.TaskProvider): vscode.Disposable;
	registerTaskSystem(scheme: string, info: TaskSystemInfoDTO): void;
	fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]>;
	executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution>;
	terminateTask(execution: vscode.TaskExecution): Promise<void>;
}

export const IExtHostTask = createDecorator<IExtHostTask>('IExtHostTask');
