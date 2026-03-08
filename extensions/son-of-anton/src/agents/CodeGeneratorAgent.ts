/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult, TokenUsage } from './types';

/**
 * Code generation specialist.
 * Receives specific coding tasks with a defined scope and generates
 * minimal, targeted code changes using graph-routed context.
 */
export class CodeGeneratorAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a code generation specialist for Son of Anton.',
			'You receive specific coding tasks with a defined scope.',
			'',
			'## Rules',
			'1. Respect coding standards from CLAUDE.md.',
			'2. Only modify files within your declared scope.',
			'3. Generate diffs, not full files — be token-efficient.',
			'4. Use the code graph context to understand structure before making changes.',
			'5. Follow existing patterns in the codebase.',
			'',
			'## Output Format',
			'Provide your changes as unified diffs wrapped in ```diff``` code fences.',
			'For new files, use <!-- CREATE: path/to/file.ts --> before a code block.',
			'Include a brief summary of what you changed and why.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Code Generator', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Step 1: Gather precise context via MCP (graph-routed)
			const codeContext = await this.gatherCodeContext(task.id, context);

			// Step 2: Build the prompt
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildCodeGenPrompt(context, codeContext);

			// Step 3: Generate changes
			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
			);

			// Estimate naive token cost (full files instead of graph-routed)
			tokenUsage.naiveInputTokens = this.estimateNaiveTokens(context.scopeFiles);

			// Step 4: Parse the changes
			const changes = this.parseFileChanges(text);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes,
				summary: this.extractSummary(text),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Code generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Gather graph-routed context instead of dumping entire files.
	 */
	private async gatherCodeContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			// File summary (structural overview)
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file} (structure)\n${summary}`);

			// Dependencies
			const deps = await this.queryDependencies(taskId, file);
			sections.push(`### ${file} (dependencies)\n${deps}`);
		}

		// Include any graph context from the orchestrator
		if (context.graphContext) {
			sections.push('### Orchestrator Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildCodeGenPrompt(context: AgentContext, codeContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Scope',
			'You may only modify these files:',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Graph Context',
			codeContext,
			'',
			'Generate the minimal changes needed. Use diff format for modifications.',
		].join('\n');
	}

	private extractSummary(llmOutput: string): string {
		// Look for a summary section in the response
		const summaryMatch = llmOutput.match(/## Summary\n([\s\S]*?)(?:\n##|$)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}

		// Fall back to the first non-code paragraph
		const lines = llmOutput.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('#')) {
				return trimmed;
			}
		}

		return 'Code changes generated.';
	}

	/**
	 * Estimate how many tokens would be used without graph routing.
	 * Assumes ~4 characters per token, ~500 lines per file, ~40 chars per line.
	 */
	private estimateNaiveTokens(scopeFiles: string[]): number {
		return scopeFiles.length * 500 * 40 / 4;
	}
}
