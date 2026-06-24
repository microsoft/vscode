/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type * as vscode from 'vscode';
import { URI } from '../../../util/vs/base/common/uri';
import { ITasksService, TaskResult, TaskStatus } from './tasksService';

export class TestTasksService implements ITasksService {
	_serviceBrand: undefined;

	async ensureTask(): Promise<void> {
		// No-op for stub
	}

	hasTask(): boolean {
		return false;
	}

	getTasks(): [] {
		return [];
	}

	getTaskConfigPosition() {
		return Promise.resolve(undefined);
	}

	async executeTask(def: vscode.TaskDefinition, token: vscode.CancellationToken, workspaceFolder?: URI): Promise<TaskResult> {
		return {
			status: TaskStatus.Error,
			error: new Error(`Task not found: ${def.type}:${def.label}`)
		};
	}

	isTaskActive(def: vscode.TaskDefinition): boolean {
		return false;
	}

	getTerminalForTask(task: vscode.TaskDefinition): vscode.Terminal | undefined {
		// Return a mock terminal with a defined processId for testing
		return {
			name: task.label || 'mock-terminal',
			processId: Promise.resolve(12345),
			// Add any other properties/methods as needed for your tests
		} as unknown as vscode.Terminal;
	}
}
