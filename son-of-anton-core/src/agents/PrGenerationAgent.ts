/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { loadAgentPrompt } from './promptLoader';
import { SubtaskResult, FileChange } from './types';

/**
 * Describes a generated pull request.
 */
export interface GeneratedPr {
	branch: string;
	title: string;
	body: string;
	files: string[];
	testResults: TestResults;
}

interface TestResults {
	unitTests: { passed: number; failed: number };
	integrationTests: { passed: number; failed: number };
	securityScan: { clean: boolean; findings: number };
}

/**
 * PR generation specialist.
 * Creates merge-ready pull requests with comprehensive descriptions,
 * test results, spec links, and agent traces.
 */
export class PrGenerationAgent extends BaseAgent {
	protected getRoleDescription(): string {
		// H10 — role description loaded from `prompts/anton-pr.prompt.md`
		// at runtime so prompt iteration doesn't require a TypeScript edit.
		return loadAgentPrompt(this.handle);
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('PR Generation', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Gather information about the changes
			const changesContext = await this.gatherChangesContext(task.id, context);

			// Generate PR description
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildPrPrompt(context, changesContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
				context.onToken,
			);

			// Parse the generated PR metadata
			const prInfo = this.parsePrDescription(text, context);

			// Create a file with the PR description for the orchestrator to use
			const prDescriptionChange: FileChange = {
				filePath: '.son-of-anton/pr-description.md',
				changeType: 'create',
				content: prInfo.body,
			};

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes: [prDescriptionChange],
				summary: `PR description generated: "${prInfo.title}"`,
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `PR generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	private async gatherChangesContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		// Get file summaries from graph
		for (const file of context.scopeFiles) {
			try {
				const summary = await this.queryFileGraph(taskId, file);
				sections.push(`### ${file}\n${summary}`);
			} catch {
				sections.push(`### ${file}\n(No graph data available)`);
			}
		}

		// Check for spec documents
		if (context.graphContext) {
			sections.push('### Spec Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildPrPrompt(context: AgentContext, changesContext: string): string {
		return [
			'## Task',
			'Generate a comprehensive PR description for the following changes.',
			'',
			'## Feature Description',
			context.instruction,
			'',
			'## Changed Files',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Context',
			changesContext,
			'',
			'## Requirements',
			'- Follow the Son of Anton PR format',
			'- State the modification tier (Tier 1 for new files, Tier 2 for hooks into existing code, Tier 3 for core patches)',
			'- Include a test plan',
			'- Describe each file change',
			'- Generate a concise, descriptive PR title',
		].join('\n');
	}

	private parsePrDescription(llmOutput: string, context: AgentContext): GeneratedPr {
		// Extract title from the first heading or first line
		const titleMatch = llmOutput.match(/^#\s+(.+)$/m)
			?? llmOutput.match(/^(.+)$/m);
		const title = titleMatch?.[1]?.trim() ?? context.instruction.slice(0, 70);

		return {
			branch: `sota/${this.generateBranchName(context.instruction)}`,
			title,
			body: llmOutput,
			files: context.scopeFiles,
			testResults: {
				unitTests: { passed: 0, failed: 0 },
				integrationTests: { passed: 0, failed: 0 },
				securityScan: { clean: true, findings: 0 },
			},
		};
	}

	private generateBranchName(instruction: string): string {
		return instruction
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-')
			.slice(0, 50);
	}
}
