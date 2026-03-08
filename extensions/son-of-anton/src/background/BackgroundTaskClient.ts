/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Status of a background task.
 */
export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Progress state of a background task.
 */
export interface TaskProgress {
	percentage: number;
	message: string;
}

/**
 * Resource limits for a background task.
 */
export interface TaskResourceLimits {
	memoryMb: number;
	cpuCores: number;
	timeoutMs: number;
	maxTokenBudgetUsd: number;
}

/**
 * Token usage for a background task.
 */
export interface TaskTokenUsage {
	inputTokens: number;
	outputTokens: number;
	estimatedCostUsd: number;
}

/**
 * A background task managed by the task manager service.
 */
export interface BackgroundTask {
	id: string;
	name: string;
	description: string;
	status: BackgroundTaskStatus;
	createdAt: number;
	startedAt: number | null;
	completedAt: number | null;
	containerId: string | null;
	progress: TaskProgress;
	resultDir: string;
	resourceLimits: TaskResourceLimits;
	tokenUsage: TaskTokenUsage;
	branch: string | null;
	error: string | null;
}

/**
 * Configuration for creating a background task.
 */
export interface CreateTaskRequest {
	name: string;
	description: string;
	image?: string;
	projectPath?: string;
	instructions?: string;
	branch?: string;
	env?: string[];
	resourceLimits?: Partial<TaskResourceLimits>;
}

/**
 * Client for the background task manager service.
 * Handles communication with the background-tasks service and
 * provides IDE reconnection capabilities.
 */
export class BackgroundTaskClient {
	private readonly baseUrl: string;
	private readonly pollingIntervalMs: number;
	private pollingTimer: ReturnType<typeof setInterval> | null = null;

	private readonly onDidUpdateTaskEmitter = new vscode.EventEmitter<BackgroundTask>();
	readonly onDidUpdateTask = this.onDidUpdateTaskEmitter.event;

	private readonly onDidCompleteTaskEmitter = new vscode.EventEmitter<BackgroundTask>();
	readonly onDidCompleteTask = this.onDidCompleteTaskEmitter.event;

	private readonly trackedTasks = new Map<string, BackgroundTaskStatus>();

	constructor(baseUrl?: string) {
		this.baseUrl = baseUrl ?? `http://localhost:${process.env.BACKGROUND_TASKS_PORT ?? '8093'}`;
		this.pollingIntervalMs = 15000;
	}

	/**
	 * Create and start a new background task.
	 */
	async createTask(config: CreateTaskRequest): Promise<BackgroundTask> {
		const response = await fetch(`${this.baseUrl}/tasks`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(config),
		});

		if (!response.ok) {
			throw new Error(`Failed to create task: ${response.statusText}`);
		}

		const task = await response.json() as BackgroundTask;
		this.trackedTasks.set(task.id, task.status);
		this.ensurePolling();
		return task;
	}

	/**
	 * Get the status of a specific task.
	 */
	async getTask(taskId: string): Promise<BackgroundTask | null> {
		try {
			const response = await fetch(`${this.baseUrl}/tasks/${taskId}`);
			if (!response.ok) {
				return null;
			}
			return await response.json() as BackgroundTask;
		} catch {
			return null;
		}
	}

	/**
	 * List all tasks, optionally filtered.
	 */
	async listTasks(filter?: 'active' | 'completed'): Promise<BackgroundTask[]> {
		const query = filter ? `?filter=${filter}` : '';
		try {
			const response = await fetch(`${this.baseUrl}/tasks${query}`);
			if (!response.ok) {
				return [];
			}
			return await response.json() as BackgroundTask[];
		} catch {
			return [];
		}
	}

	/**
	 * Cancel a running task.
	 */
	async cancelTask(taskId: string): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/tasks/${taskId}/cancel`, {
				method: 'POST',
			});
			const result = await response.json() as { cancelled: boolean };
			return result.cancelled;
		} catch {
			return false;
		}
	}

	/**
	 * Get results of a completed task.
	 */
	async getTaskResults(taskId: string): Promise<Record<string, string>> {
		try {
			const response = await fetch(`${this.baseUrl}/tasks/${taskId}/results`);
			if (!response.ok) {
				return {};
			}
			return await response.json() as Record<string, string>;
		} catch {
			return {};
		}
	}

	/**
	 * Check for completed tasks on IDE reconnect and notify the user.
	 */
	async checkOnReconnect(): Promise<void> {
		const tasks = await this.listTasks();

		for (const task of tasks) {
			const previousStatus = this.trackedTasks.get(task.id);

			if (previousStatus === 'running' && task.status !== 'running') {
				// Task completed while IDE was closed
				this.onDidCompleteTaskEmitter.fire(task);
				this.showCompletionNotification(task);
			}

			this.trackedTasks.set(task.id, task.status);
		}

		// Start polling for any active tasks
		const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
		if (activeTasks.length > 0) {
			this.ensurePolling();
		}
	}

	private showCompletionNotification(task: BackgroundTask): void {
		const statusIcon = task.status === 'completed' ? '$(check)' : '$(error)';
		const message = `${statusIcon} Background task "${task.name}" ${task.status}`;

		const detail = task.status === 'completed'
			? task.progress.message
			: task.error ?? 'Unknown error';

		vscode.window.showInformationMessage(
			`${message} — ${detail}`,
			'View Results',
			'Dismiss'
		).then(choice => {
			if (choice === 'View Results') {
				vscode.commands.executeCommand('sota.showBackgroundTaskResults', task.id);
			}
		});
	}

	/**
	 * Start polling for task status updates.
	 */
	private ensurePolling(): void {
		if (this.pollingTimer) {
			return;
		}

		this.pollingTimer = setInterval(async () => {
			const tasks = await this.listTasks('active');

			if (tasks.length === 0) {
				this.stopPolling();
				return;
			}

			for (const task of tasks) {
				const previousStatus = this.trackedTasks.get(task.id);

				if (previousStatus !== task.status) {
					this.onDidUpdateTaskEmitter.fire(task);

					if (task.status !== 'running' && task.status !== 'pending') {
						this.onDidCompleteTaskEmitter.fire(task);
						this.showCompletionNotification(task);
					}
				}

				this.trackedTasks.set(task.id, task.status);
			}
		}, this.pollingIntervalMs);
	}

	private stopPolling(): void {
		if (this.pollingTimer) {
			clearInterval(this.pollingTimer);
			this.pollingTimer = null;
		}
	}

	dispose(): void {
		this.stopPolling();
		this.onDidUpdateTaskEmitter.dispose();
		this.onDidCompleteTaskEmitter.dispose();
	}
}
