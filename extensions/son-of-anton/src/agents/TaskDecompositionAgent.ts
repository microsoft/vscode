/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';
import { SpecGenerationRequest, SpecGenerationResult } from './specTypes';

/**
 * Task decomposition agent.
 * Takes an approved design document and generates dependency-ordered
 * implementation tasks, each mapped to a specialist agent and file scope.
 */
export class TaskDecompositionAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a task decomposition specialist for Son of Anton.',
			'You break down technical designs into ordered, actionable implementation tasks.',
			'',
			'## Output Format',
			'Generate a tasks.md file with these sections:',
			'1. Title (H1) — "<Feature> — Implementation Tasks"',
			'2. Task Order (dependency graph) — e.g., "1 → 2 → 3,4 (parallel) → 5"',
			'3. Tasks — each with:',
			'   - ### Task N: <title>',
			'   - **Status:** pending',
			'   - **Agent:** <anton-code|anton-test|anton-security|anton-docs|anton-review>',
			'   - **Files:** <comma-separated file paths> (append "(create)" for new files)',
			'   - **Depends on:** Task N (if applicable)',
			'   - **Description:** <what needs to be done>',
			'',
			'## Agent Assignment Rules',
			'- anton-code: Code creation, modification, refactoring',
			'- anton-test: Test writing, coverage analysis',
			'- anton-security: Security review, vulnerability scanning',
			'- anton-docs: Documentation updates',
			'- anton-review: Final review of all changes',
			'',
			'## Rules',
			'1. Tasks must be ordered by dependency — a task\'s dependencies must have lower IDs.',
			'2. Parallelisable tasks should be noted in the dependency graph.',
			'3. Every design file action must be covered by at least one task.',
			'4. Always include a test task and a review task.',
			'5. Keep tasks small enough for a single agent invocation.',
			'6. Query the code graph for accurate scope (which files actually exist).',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Task Decomposition', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			const codeContext = await this.gatherCodeContext(task.id);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildTasksPrompt(context, codeContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				'sonnet',
				systemPrompt,
				userMessage,
			);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes: [{
					filePath: 'tasks.md',
					changeType: 'create',
					content: text,
				}],
				summary: 'Generated implementation task decomposition.',
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Task decomposition failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Generate tasks from an approved design.
	 */
	async generateTasks(request: SpecGenerationRequest): Promise<SpecGenerationResult> {
		const task = this.agentManager.createTask(
			'Task Decomposition',
			`Decompose tasks for: ${request.featureName}`,
		);
		this.agentManager.startTask(task.id);

		try {
			const codeContext = await this.gatherCodeContext(task.id);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());

			const promptParts = [
				'## Approved Design',
				request.previousPhaseContent ?? 'No design provided.',
				'',
				'## Codebase Context',
				codeContext,
				'',
				'Generate a complete tasks.md with dependency-ordered implementation tasks.',
				'Each task must map to a specific agent and file scope.',
			];

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				'sonnet',
				systemPrompt,
				promptParts.join('\n'),
			);

			this.agentManager.completeTask(task.id);

			return {
				phase: 'tasks',
				content: text.trim(),
				needsClarification: false,
				summary: `Generated task decomposition for ${request.featureName}.`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				phase: 'tasks',
				content: '',
				needsClarification: false,
				summary: `Task decomposition failed: ${message}`,
			};
		}
	}

	private async gatherCodeContext(taskId: string): Promise<string> {
		try {
			const overview = await this.callMcpTool(taskId, 'code-graph', 'project_overview', {});
			return overview.content;
		} catch {
			return 'Code graph context unavailable.';
		}
	}

	private buildTasksPrompt(context: AgentContext, codeContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Codebase Context',
			codeContext,
			'',
			'## Graph Context',
			context.graphContext || 'No additional graph context.',
			'',
			'Generate dependency-ordered implementation tasks.',
		].join('\n');
	}
}
