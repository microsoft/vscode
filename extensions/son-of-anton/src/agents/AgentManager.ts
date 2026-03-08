/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { LlmClient } from '../llm/LlmClient';

export type AgentState = 'running' | 'pending' | 'completed' | 'failed';

export interface AgentTask {
	id: string;
	agentName: string;
	description: string;
	state: AgentState;
	startedAt?: number;
	completedAt?: number;
	error?: string;
	parentId?: string;
}

export interface TraceSpan {
	id: string;
	taskId: string;
	name: string;
	type: 'llm_call' | 'mcp_tool' | 'file_change' | 'hook' | 'lifecycle';
	startTime: number;
	endTime?: number;
	attributes: Record<string, string | number | boolean>;
}

/**
 * Manages the lifecycle of agent tasks and their traces.
 */
export class AgentManager {
	private readonly llmClient: LlmClient;
	private readonly tasks: Map<string, AgentTask> = new Map();
	private readonly spans: TraceSpan[] = [];
	private nextId = 1;

	private readonly _onDidChangeTasks = new vscode.EventEmitter<void>();
	readonly onDidChangeTasks: vscode.Event<void> = this._onDidChangeTasks.event;

	private readonly _onDidAddSpan = new vscode.EventEmitter<TraceSpan>();
	readonly onDidAddSpan: vscode.Event<TraceSpan> = this._onDidAddSpan.event;

	constructor(llmClient: LlmClient) {
		this.llmClient = llmClient;
	}

	createTask(agentName: string, description: string, parentId?: string): AgentTask {
		const id = `task-${this.nextId++}`;
		const task: AgentTask = {
			id,
			agentName,
			description,
			state: 'pending',
			parentId,
		};
		this.tasks.set(id, task);
		this._onDidChangeTasks.fire();
		return task;
	}

	startTask(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (task) {
			task.state = 'running';
			task.startedAt = Date.now();
			this._onDidChangeTasks.fire();
		}
	}

	completeTask(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (task) {
			task.state = 'completed';
			task.completedAt = Date.now();
			this._onDidChangeTasks.fire();
		}
	}

	failTask(taskId: string, error: string): void {
		const task = this.tasks.get(taskId);
		if (task) {
			task.state = 'failed';
			task.completedAt = Date.now();
			task.error = error;
			this._onDidChangeTasks.fire();
		}
	}

	addSpan(span: Omit<TraceSpan, 'id'>): TraceSpan {
		const fullSpan: TraceSpan = { ...span, id: `span-${this.nextId++}` };
		this.spans.push(fullSpan);
		this._onDidAddSpan.fire(fullSpan);
		return fullSpan;
	}

	getActiveTasks(): AgentTask[] {
		return [...this.tasks.values()].filter(t => t.state === 'running');
	}

	getPendingTasks(): AgentTask[] {
		return [...this.tasks.values()].filter(t => t.state === 'pending');
	}

	getRecentTasks(limit: number = 10): AgentTask[] {
		return [...this.tasks.values()]
			.filter(t => t.state === 'completed' || t.state === 'failed')
			.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
			.slice(0, limit);
	}

	getAllTasks(): AgentTask[] {
		return [...this.tasks.values()];
	}

	getSpansForTask(taskId: string): TraceSpan[] {
		return this.spans.filter(s => s.taskId === taskId);
	}

	getAllSpans(): TraceSpan[] {
		return [...this.spans];
	}

	hasActiveAgents(): boolean {
		return this.getActiveTasks().length > 0;
	}

	getLlmClient(): LlmClient {
		return this.llmClient;
	}
}
