/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseAgent, AgentContext } from './BaseAgent';
import { ReviewAgent } from './ReviewAgent';
import { MetricsTracker } from './MetricsTracker';
import { ProjectMemory } from './ProjectMemory';
import {
	AgentHandle,
	ExecutionPlan,
	ScopeDeclaration,
	ScopeEntry,
	Subtask,
	SubtaskResult,
} from './types';

/**
 * The orchestrator agent — brain of the multi-agent system.
 * Receives requests via @anton, decomposes them into subtasks,
 * queries the code graph for context, and delegates to specialists.
 */
export class OrchestratorAgent extends BaseAgent {
	private readonly specialists: Map<AgentHandle, BaseAgent> = new Map();
	private reviewAgent: ReviewAgent | undefined;
	private activePlan: ExecutionPlan | undefined;
	private nextPlanId = 1;

	registerSpecialist(agent: BaseAgent): void {
		this.specialists.set(agent.handle, agent);
	}

	setReviewAgent(agent: ReviewAgent): void {
		this.reviewAgent = agent;
	}

	protected getRoleDescription(): string {
		const specialistList = [...this.specialists.entries()]
			.map(([handle, agent]) => `- @${handle}: ${agent.displayName}`)
			.join('\n');

		return [
			'You are the orchestrator agent for Son of Anton.',
			'You receive developer requests, decompose them into subtasks, and delegate to specialist agents.',
			'',
			'## Available Specialists',
			specialistList,
			'',
			'## Rules',
			'1. Always query the code graph before planning to understand the codebase structure.',
			'2. Present the plan for developer approval before executing.',
			'3. Scope-lock files before dispatching to prevent conflicts.',
			'4. Break requests into the smallest reasonable subtasks.',
			'5. Specify execution order based on dependencies.',
			'',
			'## Response Format',
			'When decomposing a request, respond with a JSON plan in this format:',
			'```json',
			'{',
			'  "subtasks": [',
			'    {',
			'      "instruction": "What to do",',
			'      "assignee": "anton-code",',
			'      "scopeFiles": ["path/to/file.ts"],',
			'      "dependencies": []',
			'    }',
			'  ]',
			'}',
			'```',
		].join('\n');
	}

	/**
	 * Handle a direct chat request from @anton.
	 * This is the main entry point for the orchestrator.
	 */
	async handleChatRequest(
		request: vscode.ChatRequest,
		chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<void> {
		const task = this.agentManager.createTask('Orchestrator', request.prompt);
		this.agentManager.startTask(task.id);

		try {
			// Handle slash commands
			if (request.command === 'plan') {
				await this.handlePlanCommand(request, stream, task.id, token);
			} else if (request.command === 'approve') {
				await this.handleApproveCommand(stream, task.id, token);
			} else if (request.command === 'status') {
				await this.handleStatusCommand(stream);
			} else if (request.command === 'metrics') {
				await this.handleMetricsCommand(stream);
			} else {
				// Default: create a plan from the request
				await this.handlePlanCommand(request, stream, task.id, token);
			}

			this.agentManager.completeTask(task.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			stream.markdown(`\n\n**Error:** ${message}`);
		}
	}

	/**
	 * Create an execution plan from a developer request.
	 */
	private async handlePlanCommand(
		request: vscode.ChatRequest,
		stream: vscode.ChatResponseStream,
		taskId: string,
		token: vscode.CancellationToken,
	): Promise<void> {
		stream.markdown('**Analyzing request and querying code graph...**\n\n');

		// Step 1: Gather context from the code graph
		const graphContext = await this.gatherGraphContext(taskId, request.prompt);

		// Step 2: Ask the LLM to decompose the request
		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
		const planPrompt = [
			'Decompose the following developer request into subtasks.',
			'',
			'## Code Graph Context',
			graphContext,
			'',
			'## Developer Request',
			request.prompt,
			'',
			'Respond with a JSON plan wrapped in ```json``` code fences.',
		].join('\n');

		const { text: planResponse } = await this.callLlm(
			taskId,
			'opus',
			systemPrompt,
			planPrompt,
		);

		// Step 3: Parse the plan
		const plan = this.parsePlan(planResponse, request.prompt);
		this.activePlan = plan;

		// Step 4: Present the plan
		stream.markdown('## Execution Plan\n\n');
		stream.markdown(`**Request:** ${request.prompt}\n\n`);

		for (let i = 0; i < plan.subtasks.length; i++) {
			const subtask = plan.subtasks[i];
			const deps = subtask.dependencies.length > 0
				? ` (depends on: ${subtask.dependencies.join(', ')})`
				: '';
			stream.markdown(
				`${i + 1}. **@${subtask.assignee}**: ${subtask.instruction}${deps}\n`
				+ `   - Files: ${subtask.scopeFiles.join(', ') || 'TBD'}\n\n`
			);
		}

		stream.markdown('\n### Scope Declaration\n\n');
		for (const entry of plan.scopeDeclaration.entries) {
			stream.markdown(`- **@${entry.agent}** (${entry.accessType}): ${entry.files.join(', ')}\n`);
		}

		stream.markdown('\n---\n\nUse `/approve` to execute this plan, or refine your request.\n');
	}

	/**
	 * Execute the approved plan by dispatching subtasks to specialists.
	 */
	private async handleApproveCommand(
		stream: vscode.ChatResponseStream,
		taskId: string,
		token: vscode.CancellationToken,
	): Promise<void> {
		if (!this.activePlan) {
			stream.markdown('No active plan to approve. Use `@anton` to create a plan first.\n');
			return;
		}

		this.activePlan.approved = true;
		stream.markdown('**Plan approved. Executing subtasks...**\n\n');

		const results: Map<string, SubtaskResult> = new Map();

		// Execute subtasks in dependency order
		for (const subtask of this.getExecutionOrder(this.activePlan.subtasks)) {
			if (token.isCancellationRequested) {
				stream.markdown('\n**Execution cancelled.**\n');
				return;
			}

			// Check dependencies are satisfied
			const depsOk = subtask.dependencies.every(depId => {
				const depResult = results.get(depId);
				return depResult?.success;
			});

			if (!depsOk) {
				subtask.status = 'failed';
				stream.markdown(`**Skipping** ${subtask.instruction} — dependency failed.\n\n`);
				continue;
			}

			stream.markdown(`### Executing: ${subtask.instruction}\n`);
			stream.markdown(`Agent: @${subtask.assignee} | Files: ${subtask.scopeFiles.join(', ')}\n\n`);

			const result = await this.executeSubtask(subtask, taskId, stream);
			results.set(subtask.id, result);

			if (result.success) {
				subtask.status = 'completed';
				stream.markdown(`**Completed.** ${result.summary}\n\n`);
			} else {
				subtask.status = 'failed';
				stream.markdown(`**Failed.** ${result.summary}\n\n`);

				// Offer options on failure
				stream.markdown(
					'Options: retry this step, try an alternative approach, or skip.\n\n'
				);
			}
		}

		// Aggregate results
		stream.markdown('---\n\n## Summary\n\n');
		const allChanges = [...results.values()].flatMap(r => r.changes);
		const successCount = [...results.values()].filter(r => r.success).length;

		stream.markdown(`- **${successCount}/${results.size}** subtasks completed successfully\n`);
		stream.markdown(`- **${allChanges.length}** file changes proposed\n`);

		for (const change of allChanges) {
			stream.markdown(`  - ${change.changeType}: \`${change.filePath}\`\n`);
		}

		this.activePlan = undefined;
	}

	/**
	 * Execute a single subtask by dispatching to the assigned specialist.
	 */
	private async executeSubtask(
		subtask: Subtask,
		parentTaskId: string,
		stream: vscode.ChatResponseStream,
	): Promise<SubtaskResult> {
		const specialist = this.specialists.get(subtask.assignee);
		if (!specialist) {
			return {
				success: false,
				changes: [],
				summary: `No specialist registered for @${subtask.assignee}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}

		const startTime = Date.now();
		subtask.status = 'in_progress';

		// Build graph context for the subtask's scope
		let graphContext = '';
		for (const file of subtask.scopeFiles) {
			const summary = await this.queryFileGraph(parentTaskId, file);
			graphContext += `### ${file}\n${summary}\n\n`;
		}

		const context: AgentContext = {
			instruction: subtask.instruction,
			scopeFiles: subtask.scopeFiles,
			graphContext,
			parentTaskId,
		};

		// Execute with retry loop
		let result: SubtaskResult | undefined;
		let retryCount = 0;

		while (retryCount < this.config.maxRetries) {
			result = await specialist.execute(context);
			const latencyMs = Date.now() - startTime;

			this.metricsTracker.recordInvocation(subtask.assignee, latencyMs, result.tokenUsage);

			// Send through review agent if available
			if (this.reviewAgent && result.success) {
				const reviewResult = await this.reviewAgent.execute({
					instruction: `Review changes from @${subtask.assignee}: ${subtask.instruction}`,
					scopeFiles: result.changes.map(c => c.filePath),
					graphContext: '',
					parentTaskId,
				});

				if (!reviewResult.success) {
					if (retryCount < this.config.maxRetries) {
						// Retry with review feedback
						retryCount++;
						subtask.retryCount = retryCount;
						this.metricsTracker.recordRetry(subtask.assignee);

						context.instruction = [
							subtask.instruction,
							'',
							'## Previous Attempt Feedback',
							reviewResult.summary,
						].join('\n');

						stream.markdown(`*Retry ${retryCount}/${this.config.maxRetries}: incorporating review feedback...*\n`);
						continue;
					}

					// No retries left: mark subtask as failed according to review result
					result.success = false;
					result.reviewFeedback = reviewResult.reviewFeedback;
					result.summary = [
						result.summary || 'Subtask failed final review.',
						'',
						'Final review feedback:',
						reviewResult.summary,
					].join('\n');

					this.metricsTracker.recordEscalation(subtask.assignee);
				} else {
					result.reviewFeedback = reviewResult.reviewFeedback;
				}
			}

			if (retryCount === 0 && result.success) {
				this.metricsTracker.recordFirstPassSuccess(subtask.assignee);
			}

			break;
		}

		if (!result) {
			this.metricsTracker.recordEscalation(subtask.assignee);
			return {
				success: false,
				changes: [],
				summary: 'Max retries exceeded — escalating to developer.',
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}

		return result;
	}

	/**
	 * Show status of active agents.
	 */
	private async handleStatusCommand(stream: vscode.ChatResponseStream): Promise<void> {
		const active = this.agentManager.getActiveTasks();
		const pending = this.agentManager.getPendingTasks();

		stream.markdown('## Agent Status\n\n');

		if (active.length === 0 && pending.length === 0) {
			stream.markdown('No active or pending tasks.\n');
			return;
		}

		if (active.length > 0) {
			stream.markdown('### Active\n');
			for (const task of active) {
				stream.markdown(`- **${task.agentName}**: ${task.description}\n`);
			}
		}

		if (pending.length > 0) {
			stream.markdown('\n### Pending\n');
			for (const task of pending) {
				stream.markdown(`- **${task.agentName}**: ${task.description}\n`);
			}
		}

		if (this.activePlan) {
			stream.markdown('\n### Active Plan\n');
			const completed = this.activePlan.subtasks.filter(s => s.status === 'completed').length;
			stream.markdown(`Progress: ${completed}/${this.activePlan.subtasks.length} subtasks\n`);
		}
	}

	/**
	 * Show metrics summary.
	 */
	private async handleMetricsCommand(stream: vscode.ChatResponseStream): Promise<void> {
		stream.markdown(this.metricsTracker.formatSummary());
		await this.metricsTracker.persistMetrics();
		stream.markdown('\n*Metrics persisted to .son-of-anton/metrics/*\n');
	}

	/**
	 * Gather graph context for a request by querying the MCP code graph.
	 */
	private async gatherGraphContext(taskId: string, request: string): Promise<string> {
		const sections: string[] = [];

		// Query for relevant files based on the request
		try {
			const searchResult = await this.callMcpTool(
				taskId,
				'code-graph',
				'semantic_search',
				{ query: request, limit: 5 },
			);
			sections.push('## Relevant Files\n' + searchResult.content);
		} catch {
			sections.push('## Relevant Files\n(Code graph not available)');
		}

		return sections.join('\n\n');
	}

	/**
	 * Parse a plan from LLM output.
	 */
	private parsePlan(llmOutput: string, originalRequest: string): ExecutionPlan {
		const planId = `plan-${this.nextPlanId++}`;
		const subtasks: Subtask[] = [];
		const scopeEntries: ScopeEntry[] = [];

		// Extract JSON from the response
		const jsonMatch = llmOutput.match(/```json\s*\n([\s\S]*?)\n\s*```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				if (Array.isArray(parsed.subtasks)) {
					for (let i = 0; i < parsed.subtasks.length; i++) {
						const raw = parsed.subtasks[i];
						const subtask: Subtask = {
							id: `${planId}-subtask-${i}`,
							instruction: raw.instruction ?? '',
							assignee: raw.assignee ?? 'anton-code',
							scopeFiles: Array.isArray(raw.scopeFiles) ? raw.scopeFiles : [],
							dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
							status: 'pending',
							retryCount: 0,
						};
						subtasks.push(subtask);

						// Build scope declaration
						scopeEntries.push({
							agent: subtask.assignee,
							files: subtask.scopeFiles,
							accessType: subtask.assignee === 'anton-security' ? 'read' : 'write',
						});
					}
				}
			} catch {
				// Fallback: create a single subtask for the whole request
				subtasks.push({
					id: `${planId}-subtask-0`,
					instruction: originalRequest,
					assignee: 'anton-code',
					scopeFiles: [],
					dependencies: [],
					status: 'pending',
					retryCount: 0,
				});
			}
		} else {
			// No JSON found — single subtask fallback
			subtasks.push({
				id: `${planId}-subtask-0`,
				instruction: originalRequest,
				assignee: 'anton-code',
				scopeFiles: [],
				dependencies: [],
				status: 'pending',
				retryCount: 0,
			});
		}

		return {
			id: planId,
			originalRequest,
			subtasks,
			scopeDeclaration: { entries: scopeEntries },
			approved: false,
		};
	}

	/**
	 * Sort subtasks in dependency order using topological sort.
	 */
	private getExecutionOrder(subtasks: Subtask[]): Subtask[] {
		const taskMap = new Map(subtasks.map(s => [s.id, s]));
		const visited = new Set<string>();
		const result: Subtask[] = [];

		const visit = (subtask: Subtask): void => {
			if (visited.has(subtask.id)) {
				return;
			}
			visited.add(subtask.id);

			for (const depId of subtask.dependencies) {
				const dep = taskMap.get(depId);
				if (dep) {
					visit(dep);
				}
			}
			result.push(subtask);
		};

		for (const subtask of subtasks) {
			visit(subtask);
		}

		return result;
	}

	/**
	 * Not used directly — orchestrator overrides handleChatRequest.
	 */
	async execute(context: AgentContext): Promise<SubtaskResult> {
		return {
			success: true,
			changes: [],
			summary: 'Orchestrator does not execute subtasks directly.',
			tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
		};
	}
}
