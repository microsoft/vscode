/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IOrchestratorService = createDecorator<IOrchestratorService>('IOrchestratorService');

// --- Task types ---

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface IOrchestratorTask {
	readonly id: string;
	readonly parentId?: string;
	readonly description: string;
	readonly assignedAgentId?: string;
	readonly suggestedRole?: string;
	readonly status: TaskStatus;
	readonly dependencies: readonly string[];
	readonly result?: string;
	readonly error?: string;
	readonly createdAt: number;
	readonly completedAt?: number;
	readonly priority: number;
}

export interface ITaskDecomposition {
	readonly originalTask: string;
	readonly subTasks: readonly ISubTaskSuggestion[];
	readonly executionPlan: string;
}

export interface ISubTaskSuggestion {
	readonly description: string;
	readonly suggestedRole: string;
	readonly dependencies: readonly number[];
	readonly priority: number;
}

// --- Service interface ---

export interface IOrchestratorService {
	readonly _serviceBrand: undefined;

	// Task lifecycle
	submitTask(description: string): Promise<IOrchestratorTask>;
	decomposeTask(taskId: string): Promise<ITaskDecomposition>;
	delegateSubTasks(taskId: string, decomposition: ITaskDecomposition): Promise<readonly IOrchestratorTask[]>;
	executeTask(taskId: string): Promise<void>;

	// Query
	getTask(taskId: string): IOrchestratorTask | undefined;
	getSubTasks(parentTaskId: string): readonly IOrchestratorTask[];
	getActiveExecutions(): readonly IOrchestratorTask[];

	// Control
	cancelTask(taskId: string): void;

	// Direct agent communication
	sendToAgent(agentInstanceId: string, message: string): Promise<string>;

	// Events
	readonly onDidChangeTask: Event<IOrchestratorTask>;
	readonly onDidCompleteExecution: Event<{ taskId: string; summary: string }>;
}
