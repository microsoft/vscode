/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAgentChatBridge } from './agentChatBridge.js';
import { AgentState, IAgentLaneService } from './agentLaneService.js';
import {
	IOrchestratorService,
	IOrchestratorTask,
	ISubTaskSuggestion,
	ITaskDecomposition,
	TaskStatus,
} from './orchestratorService.js';

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_TASK_TIMEOUT_MS = 300_000; // 5 minutes

export class OrchestratorServiceImpl extends Disposable implements IOrchestratorService {
	declare readonly _serviceBrand: undefined;

	private readonly _tasks = new Map<string, MutableTask>();

	private readonly _onDidChangeTask = this._register(new Emitter<IOrchestratorTask>());
	readonly onDidChangeTask: Event<IOrchestratorTask> = this._onDidChangeTask.event;

	private readonly _onDidCompleteExecution = this._register(new Emitter<{ taskId: string; summary: string }>());
	readonly onDidCompleteExecution: Event<{ taskId: string; summary: string }> = this._onDidCompleteExecution.event;

	constructor(
		@IAgentLaneService private readonly _agentLaneService: IAgentLaneService,
		@IAgentChatBridge private readonly _chatBridge: IAgentChatBridge,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	// --- Task lifecycle ---

	async submitTask(description: string): Promise<IOrchestratorTask> {
		const task = new MutableTask(generateUuid(), description);
		this._tasks.set(task.id, task);
		this._onDidChangeTask.fire(task);
		this._logService.info(`[Orchestrator] Task submitted: ${task.id} — ${description}`);
		return task;
	}

	async decomposeTask(taskId: string): Promise<ITaskDecomposition> {
		const task = this._tasks.get(taskId);
		if (!task) {
			throw new Error(`Task not found: ${taskId}`);
		}

		// Use available agent definitions to determine what roles can handle sub-tasks
		const availableRoles = new Set(
			this._agentLaneService.getAgentDefinitions().map(d => d.role)
		);

		// For now, create a simple decomposition based on available roles
		// In production, this would use an LLM call to decompose the task
		const decomposition: ITaskDecomposition = {
			originalTask: task.description,
			subTasks: this._createDefaultDecomposition(task.description, availableRoles),
			executionPlan: `Decomposed "${task.description}" into sub-tasks based on available agent roles`,
		};

		this._logService.info(`[Orchestrator] Task decomposed: ${taskId} → ${decomposition.subTasks.length} sub-tasks`);
		return decomposition;
	}

	async delegateSubTasks(taskId: string, decomposition: ITaskDecomposition): Promise<readonly IOrchestratorTask[]> {
		const parentTask = this._tasks.get(taskId);
		if (!parentTask) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const subTasks: MutableTask[] = [];
		const subTaskIds: string[] = [];

		for (const suggestion of decomposition.subTasks) {
			const subTask = new MutableTask(generateUuid(), suggestion.description, taskId);
			subTask.suggestedRole = suggestion.suggestedRole;
			subTask.priority = suggestion.priority;

			// Map dependency indices to actual task IDs
			subTask.dependencies = suggestion.dependencies
				.filter(idx => idx < subTaskIds.length)
				.map(idx => subTaskIds[idx]);

			// Find an agent instance for this role, or spawn one
			const agentId = this._findOrSpawnAgent(suggestion.suggestedRole);
			if (agentId) {
				subTask.assignedAgentId = agentId;
			}

			this._tasks.set(subTask.id, subTask);
			subTasks.push(subTask);
			subTaskIds.push(subTask.id);
			this._onDidChangeTask.fire(subTask);
		}

		parentTask.status = 'in_progress';
		this._onDidChangeTask.fire(parentTask);
		this._logService.info(`[Orchestrator] Delegated ${subTasks.length} sub-tasks for: ${taskId}`);
		return subTasks;
	}

	async executeTask(taskId: string): Promise<void> {
		const parentTask = this._tasks.get(taskId);
		if (!parentTask) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const subTasks = this.getSubTasks(taskId);
		if (subTasks.length === 0) {
			// Single task, execute directly
			parentTask.status = 'completed';
			parentTask.completedAt = Date.now();
			this._onDidChangeTask.fire(parentTask);
			this._onDidCompleteExecution.fire({ taskId, summary: 'No sub-tasks to execute' });
			return;
		}

		// Execute sub-tasks respecting dependencies and concurrency
		await this._executeWithDependencies(subTasks as MutableTask[]);

		// Collect results
		const allSubTasks = this.getSubTasks(taskId);
		const allCompleted = allSubTasks.every(t => t.status === 'completed');
		const anyFailed = allSubTasks.some(t => t.status === 'failed');

		parentTask.status = allCompleted ? 'completed' : anyFailed ? 'failed' : 'completed';
		parentTask.completedAt = Date.now();
		parentTask.result = allSubTasks
			.map(t => `[${t.suggestedRole ?? 'unknown'}] ${t.status}: ${t.result ?? t.error ?? 'no result'}`)
			.join('\n');

		this._onDidChangeTask.fire(parentTask);
		this._onDidCompleteExecution.fire({
			taskId,
			summary: `${allSubTasks.filter(t => t.status === 'completed').length}/${allSubTasks.length} sub-tasks completed`,
		});
	}

	// --- Query ---

	getTask(taskId: string): IOrchestratorTask | undefined {
		return this._tasks.get(taskId);
	}

	getSubTasks(parentTaskId: string): readonly IOrchestratorTask[] {
		return Array.from(this._tasks.values()).filter(t => t.parentId === parentTaskId);
	}

	getActiveExecutions(): readonly IOrchestratorTask[] {
		return Array.from(this._tasks.values()).filter(
			t => !t.parentId && t.status === 'in_progress'
		);
	}

	// --- Control ---

	cancelTask(taskId: string): void {
		const task = this._tasks.get(taskId);
		if (!task) {
			return;
		}

		task.status = 'cancelled';
		// Cancel all sub-tasks too
		for (const subTask of this.getSubTasks(taskId) as MutableTask[]) {
			if (subTask.status === 'pending' || subTask.status === 'in_progress') {
				subTask.status = 'cancelled';
				this._onDidChangeTask.fire(subTask);
			}
		}
		this._onDidChangeTask.fire(task);
	}

	// --- Direct agent communication ---

	async sendToAgent(agentInstanceId: string, message: string): Promise<string> {
		const instance = this._agentLaneService.getAgentInstance(agentInstanceId);
		if (!instance) {
			throw new Error(`Agent instance not found: ${agentInstanceId}`);
		}

		const cts = new CancellationTokenSource();
		try {
			return await this._chatBridge.executeAgentTask(agentInstanceId, message, cts.token);
		} finally {
			cts.dispose();
		}
	}

	// --- Private helpers ---

	private _findOrSpawnAgent(role: string): string | undefined {
		// First check for idle instances matching the role
		const definitions = this._agentLaneService.getAgentDefinitions();
		const matchingDef = definitions.find(d => d.role === role);

		if (!matchingDef) {
			this._logService.warn(`[Orchestrator] No agent definition for role: ${role}`);
			return undefined;
		}

		// Check existing instances
		const instances = this._agentLaneService.getAgentInstances();
		const idleInstance = instances.find(
			i => i.definitionId === matchingDef.id && i.state === AgentState.Idle
		);

		if (idleInstance) {
			return idleInstance.id;
		}

		// Spawn new instance
		try {
			const newInstance = this._agentLaneService.spawnAgent(matchingDef.id);
			return newInstance.id;
		} catch (e) {
			this._logService.warn(`[Orchestrator] Failed to spawn agent for role ${role}: ${e}`);
			return undefined;
		}
	}

	private async _executeWithDependencies(tasks: MutableTask[]): Promise<void> {
		const taskMap = new Map(tasks.map(t => [t.id, t]));
		const completed = new Set<string>();
		let iterations = 0;
		const maxIterations = tasks.length * 2; // Safety valve

		while (completed.size < tasks.length && iterations < maxIterations) {
			iterations++;

			// Find ready tasks (all dependencies completed)
			const ready = tasks.filter(t =>
				t.status === 'pending' &&
				t.dependencies.every(depId => completed.has(depId))
			);

			if (ready.length === 0 && completed.size < tasks.length) {
				// Check for stuck tasks (failed dependencies)
				const stuck = tasks.filter(t => t.status === 'pending');
				for (const t of stuck) {
					const failedDep = t.dependencies.find(depId => {
						const dep = taskMap.get(depId);
						return dep && (dep.status === 'failed' || dep.status === 'cancelled');
					});
					if (failedDep) {
						t.status = 'cancelled';
						t.error = `Dependency failed: ${failedDep}`;
						completed.add(t.id);
						this._onDidChangeTask.fire(t);
					}
				}

				if (ready.length === 0) {
					break; // All remaining are stuck
				}
			}

			// Execute ready tasks in parallel (up to max concurrent)
			const batch = ready.slice(0, DEFAULT_MAX_CONCURRENT);
			await Promise.all(batch.map(task => this._executeSingleTask(task)));

			for (const task of batch) {
				completed.add(task.id);
			}
		}
	}

	private async _executeSingleTask(task: MutableTask): Promise<void> {
		task.status = 'in_progress';
		this._onDidChangeTask.fire(task);

		if (task.assignedAgentId) {
			const instance = this._agentLaneService.getAgentInstance(task.assignedAgentId);
			if (instance) {
				// Assign task while in Idle, then transition: Idle → Queued → Running
				this._agentLaneService.assignTask(task.assignedAgentId, task.id, task.description);
				this._agentLaneService.transitionState(task.assignedAgentId, AgentState.Queued);
				this._agentLaneService.transitionState(task.assignedAgentId, AgentState.Running);
			}
		}

		const cts = new CancellationTokenSource();
		const timeoutHandle = setTimeout(() => cts.cancel(), DEFAULT_TASK_TIMEOUT_MS);

		try {
			let result: string;

			if (task.assignedAgentId) {
				// Execute via chat bridge — real LLM call through provider rotation
				result = await this._chatBridge.executeAgentTask(
					task.assignedAgentId,
					task.description,
					cts.token,
				);
			} else {
				// No agent assigned — skip execution
				result = `No agent assigned for: ${task.description}`;
			}

			task.status = 'completed';
			task.completedAt = Date.now();
			task.result = result;

			if (task.assignedAgentId) {
				this._agentLaneService.completeTask(task.assignedAgentId, 'success', result);
				this._agentLaneService.transitionState(task.assignedAgentId, AgentState.Done);
				this._agentLaneService.transitionState(task.assignedAgentId, AgentState.Idle);
			}
		} catch (e) {
			task.status = 'failed';
			task.error = e instanceof Error ? e.message : String(e);

			if (task.assignedAgentId) {
				this._agentLaneService.completeTask(task.assignedAgentId, 'failure', task.error);
				this._agentLaneService.transitionState(task.assignedAgentId, AgentState.Error);
			}
		} finally {
			clearTimeout(timeoutHandle);
			cts.dispose();
		}

		this._onDidChangeTask.fire(task);
	}

	/**
	 * Default decomposition when LLM-based decomposition is not yet available.
	 * Creates a plan→code→test pipeline.
	 */
	private _createDefaultDecomposition(description: string, availableRoles: Set<string>): ISubTaskSuggestion[] {
		const subTasks: ISubTaskSuggestion[] = [];

		if (availableRoles.has('planner')) {
			subTasks.push({
				description: `Plan implementation for: ${description}`,
				suggestedRole: 'planner',
				dependencies: [],
				priority: 0,
			});
		}

		if (availableRoles.has('coder')) {
			subTasks.push({
				description: `Implement: ${description}`,
				suggestedRole: 'coder',
				dependencies: subTasks.length > 0 ? [0] : [],
				priority: 1,
			});
		}

		if (availableRoles.has('tester')) {
			subTasks.push({
				description: `Write tests for: ${description}`,
				suggestedRole: 'tester',
				dependencies: subTasks.length > 1 ? [1] : subTasks.length > 0 ? [0] : [],
				priority: 2,
			});
		}

		if (availableRoles.has('reviewer')) {
			subTasks.push({
				description: `Review implementation of: ${description}`,
				suggestedRole: 'reviewer',
				dependencies: subTasks.length > 1 ? [1] : [],
				priority: 2,
			});
		}

		return subTasks;
	}
}

/**
 * Mutable task for internal orchestrator state.
 */
class MutableTask implements IOrchestratorTask {
	status: TaskStatus = 'pending';
	assignedAgentId?: string;
	suggestedRole?: string;
	dependencies: string[] = [];
	result?: string;
	error?: string;
	completedAt?: number;
	priority: number = 0;

	constructor(
		readonly id: string,
		readonly description: string,
		readonly parentId?: string,
		readonly createdAt: number = Date.now(),
	) { }
}
