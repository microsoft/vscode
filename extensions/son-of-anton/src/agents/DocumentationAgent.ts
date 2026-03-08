/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';

/**
 * Documentation specialist.
 * Generates and updates documentation: JSDoc, docstrings, README updates,
 * and changelog entries based on code changes.
 */
export class DocumentationAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a documentation specialist for Son of Anton.',
			'You generate and update documentation for code changes.',
			'',
			'## Rules',
			'1. Use the appropriate documentation format for the language:',
			'   - TypeScript/JavaScript: JSDoc comments',
			'   - Python: docstrings',
			'   - Rust: doc comments (///)',
			'2. Document all exported/public API surfaces.',
			'3. Update README sections that reference modified APIs.',
			'4. Generate changelog entries summarising changes.',
			'5. Be concise — documentation should explain "why", not restate "what".',
			'',
			'## Output Format',
			'Provide changes as unified diffs wrapped in ```diff``` code fences.',
			'Include a changelog entry at the end of your response.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Documentation', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			const docContext = await this.gatherDocContext(task.id, context);

			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildDocPrompt(context, docContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
			);

			tokenUsage.naiveInputTokens = context.scopeFiles.length * 5000;

			const changes = this.parseFileChanges(text);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes,
				summary: this.extractDocSummary(text),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Documentation generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	private async gatherDocContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			// Get exported symbols and public API
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file}\n${summary}`);

			// Get references to understand usage
			const refs = await this.queryReferences(taskId, file);
			sections.push(`### ${file} references\n${refs}`);
		}

		if (context.graphContext) {
			sections.push('### Additional Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildDocPrompt(context: AgentContext, docContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Files',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Context',
			docContext,
			'',
			'## Requirements',
			'- Add JSDoc/docstring comments to all public functions and classes',
			'- Update any README sections that reference modified APIs',
			'- Generate a changelog entry summarising the changes',
			'- Be concise and explain intent, not just restate the code',
		].join('\n');
	}

	private extractDocSummary(llmOutput: string): string {
		const summaryMatch = llmOutput.match(/## Summary\n([\s\S]*?)(?:\n##|$)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}
		return 'Documentation updated.';
	}
}
