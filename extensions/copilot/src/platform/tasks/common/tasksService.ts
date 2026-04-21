/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';

export enum TaskStatus {
	Started = 'started',
	Error = 'error',
	Finished = 'finished'
}

export type TaskResult = {
	status: TaskStatus;
	error?: Error;
};

export interface ITasksService {
	_serviceBrand: undefined;

	/**
	 * Ensures the given task definition exists in the workspace.
	 */
	ensureTask(workspaceFolder: URI, definition: vscode.TaskDefinition, skipDefault?: boolean): Promise<void>;
	/**
	 * Gets whether given task definition exists in the workspace.
	 */
	hasTask(workspaceFolder: URI, definition: vscode.TaskDefinition): boolean;
	/**
	 * Attempts to get the URI and range where the given task definition is defined.
	 */
	getTaskConfigPosition(workspaceFolder: URI, def: vscode.TaskDefinition): Promise<{ uri: URI; range: Range } | undefined>;
	/**
	 * Gets all task definitions in the workspace. This does not include
	 * extension-contributed tasks. Returns a mapping of workspace folder URIs
	 * to tasks.
	 */
	getTasks(): [URI, vscode.TaskDefinition[]][];
	/**
	 * Gets all task definitions in the workspace folder. This does not include
	 * extension-contributed tasks.
	 */
	getTasks(workspaceFolder: URI): vscode.TaskDefinition[];
	/**
	 * Executes a task and returns its status
	 */
	executeTask(definition: vscode.TaskDefinition, token: CancellationToken, workspaceFolder?: URI): Promise<TaskResult>;

	/**
	 * @param definition The task definition to check
	 * @returns true if the task is active, false otherwise
	 */
	isTaskActive(definition: vscode.TaskDefinition): boolean;


	/**
	 * Gets the terminal for a given task definition.
	 * This is needed because when tasks are stopped, they're removed from the taskExecutions.
	 * @param task The task definition to get the terminal for
	 * @returns The terminal for the task, or undefined if no terminal is found
	 */
	getTerminalForTask(task: vscode.TaskDefinition): vscode.Terminal | undefined;
}

export const ITasksService = createServiceIdentifier<ITasksService>('ITasksService');
