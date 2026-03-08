/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';
import { SpecGenerationRequest, SpecGenerationResult } from './specTypes';

/**
 * Design generation agent.
 * Takes approved requirements and generates a technical design document
 * grounded in the actual codebase structure via the code graph.
 */
export class DesignAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a technical design specialist for Son of Anton.',
			'You generate technical design documents from approved requirements.',
			'',
			'## Output Format',
			'Generate a design.md file with these sections:',
			'1. Title (H1) — "<Feature> — Technical Design"',
			'2. Approach — high-level technical approach',
			'3. Data Model — data structures, schemas, storage format',
			'4. Sequence Diagram(s) — Mermaid diagrams showing key flows',
			'5. Files to Create/Modify — list with CREATE/MODIFY/DELETE prefix',
			'',
			'## Rules',
			'1. Ground the design in reality: reference actual file paths, function names, and types from the codebase.',
			'2. Use the code graph to understand existing structure before proposing new files.',
			'3. Prefer extending existing patterns over introducing new ones.',
			'4. Include Mermaid sequence diagrams for non-trivial flows.',
			'5. Each file action must be prefixed with CREATE, MODIFY, or DELETE.',
			'6. Keep the design minimal — only include what is needed to implement the requirements.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Design Agent', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			const codeContext = await this.gatherCodeContext(task.id, context);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildDesignPrompt(context, codeContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				'opus',
				systemPrompt,
				userMessage,
			);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes: [{
					filePath: 'design.md',
					changeType: 'create',
					content: text,
				}],
				summary: 'Generated technical design document.',
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Design generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Generate a design document from approved requirements.
	 */
	async generateDesign(request: SpecGenerationRequest): Promise<SpecGenerationResult> {
		const task = this.agentManager.createTask(
			'Design Agent',
			`Generate design for: ${request.featureName}`,
		);
		this.agentManager.startTask(task.id);

		try {
			const codeContext = await this.gatherFullCodeContext(task.id);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());

			const promptParts = [
				'## Approved Requirements',
				request.previousPhaseContent ?? 'No requirements provided.',
				'',
				'## Existing Codebase Structure',
				codeContext,
				'',
				'Generate a complete design.md based on these approved requirements.',
				'Reference actual file paths and function names from the codebase.',
			];

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				'opus',
				systemPrompt,
				promptParts.join('\n'),
			);

			this.agentManager.completeTask(task.id);

			return {
				phase: 'design',
				content: text.trim(),
				needsClarification: false,
				summary: `Generated technical design for ${request.featureName}.`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				phase: 'design',
				content: '',
				needsClarification: false,
				summary: `Design generation failed: ${message}`,
			};
		}
	}

	private async gatherCodeContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file}\n${summary}`);
		}

		if (context.graphContext) {
			sections.push('### Additional Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private async gatherFullCodeContext(taskId: string): Promise<string> {
		try {
			const overview = await this.callMcpTool(taskId, 'code-graph', 'project_overview', {});
			return overview.content;
		} catch {
			return 'Code graph context unavailable.';
		}
	}

	private buildDesignPrompt(context: AgentContext, codeContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Codebase Context',
			codeContext,
			'',
			'Generate a complete design.md with approach, data model, diagrams, and file plan.',
		].join('\n');
	}
}
