/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';
import {
	SpecGenerationRequest,
	SpecGenerationResult,
	ClarifyingQuestion,
} from './specTypes';

/**
 * Requirements generation agent.
 * Takes a natural language feature description and generates
 * EARS-formatted requirements through interactive clarification.
 */
export class RequirementsAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a requirements engineering specialist for Son of Anton.',
			'You generate structured requirements using EARS (Easy Approach to Requirements Syntax) notation.',
			'',
			'## EARS Patterns',
			'- Ubiquitous: the system SHALL <action>',
			'- Event-driven: WHEN <trigger>, the system SHALL <action>',
			'- State-driven: WHILE <state>, the system SHALL <action>',
			'- Optional: WHERE <feature>, the system SHALL <action>',
			'- Unwanted: IF <condition>, THEN the system SHALL <action>',
			'',
			'## Output Format',
			'Generate a requirements.md file with these sections:',
			'1. Title (H1)',
			'2. User Stories — "As a <role>, I need <need> so that <benefit>."',
			'3. Requirements — each with an ID (REQ-001, REQ-002, ...) and EARS notation',
			'4. Edge Cases — bullet list of edge cases to consider',
			'5. Out of Scope — bullet list of things explicitly excluded',
			'',
			'## Rules',
			'1. Each requirement MUST use one of the EARS patterns.',
			'2. Requirements must be testable — each should map to at least one property-based test.',
			'3. Use parameterised values in braces: {maxRequests}, {windowSeconds}.',
			'4. Ask clarifying questions when requirements are ambiguous.',
			'5. Query the code graph to understand existing structure before generating.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Requirements Agent', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Query the code graph for project context
			const projectContext = await this.gatherProjectContext(task.id);

			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildRequirementsPrompt(context, projectContext);

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
					filePath: 'requirements.md',
					changeType: 'create',
					content: text,
				}],
				summary: 'Generated EARS requirements specification.',
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Requirements generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Generate requirements with interactive clarification support.
	 */
	async generateRequirements(request: SpecGenerationRequest): Promise<SpecGenerationResult> {
		const task = this.agentManager.createTask(
			'Requirements Agent',
			`Generate requirements for: ${request.featureName}`,
		);
		this.agentManager.startTask(task.id);

		try {
			const projectContext = await this.gatherProjectContext(task.id);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());

			const promptParts = [
				'## Feature Description',
				request.description,
				'',
				'## Project Context',
				projectContext,
			];

			if (request.clarifyingAnswers && request.clarifyingAnswers.length > 0) {
				promptParts.push('', '## Previously Answered Questions');
				for (const qa of request.clarifyingAnswers) {
					promptParts.push(`Q: ${qa.question}`);
					promptParts.push(`A: ${qa.answer}`);
					promptParts.push('');
				}
				promptParts.push(
					'',
					'Based on the answers above, generate the complete requirements.md.',
					'Do NOT ask further questions — proceed with generation.',
				);
			} else {
				promptParts.push(
					'',
					'First, identify 2-4 clarifying questions that would help produce better requirements.',
					'Format each question as:',
					'QUESTION: <your question>',
					'CONTEXT: <why this matters>',
					'OPTIONS: <suggested answers, comma-separated>',
					'',
					'Then generate the requirements.md based on reasonable defaults.',
					'The developer can refine after answering the questions.',
				);
			}

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				'opus',
				systemPrompt,
				promptParts.join('\n'),
			);

			const clarifyingQuestions = this.extractClarifyingQuestions(text);
			const requirementsContent = this.extractRequirementsContent(text);

			this.agentManager.completeTask(task.id);

			return {
				phase: 'requirements',
				content: requirementsContent,
				needsClarification: clarifyingQuestions.length > 0
					&& (!request.clarifyingAnswers || request.clarifyingAnswers.length === 0),
				clarifyingQuestions,
				summary: `Generated requirements for ${request.featureName} with ${clarifyingQuestions.length} clarifying questions.`,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				phase: 'requirements',
				content: '',
				needsClarification: false,
				summary: `Requirements generation failed: ${message}`,
			};
		}
	}

	/**
	 * Gather project context from the code graph.
	 */
	private async gatherProjectContext(taskId: string): Promise<string> {
		try {
			const overview = await this.callMcpTool(taskId, 'code-graph', 'project_overview', {});
			return overview.content;
		} catch {
			return 'Project context unavailable — code graph may not be indexed yet.';
		}
	}

	private buildRequirementsPrompt(context: AgentContext, projectContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Project Context',
			projectContext,
			'',
			'## Graph Context',
			context.graphContext || 'No additional graph context.',
			'',
			'Generate a complete requirements.md in EARS notation.',
		].join('\n');
	}

	/**
	 * Extract clarifying questions from LLM output.
	 */
	private extractClarifyingQuestions(text: string): ClarifyingQuestion[] {
		const questions: ClarifyingQuestion[] = [];
		const questionRegex = /QUESTION:\s*(?<question>.+)\nCONTEXT:\s*(?<context>.+)(?:\nOPTIONS:\s*(?<options>.+))?/g;

		let match;
		while ((match = questionRegex.exec(text)) !== null) {
			questions.push({
				question: match.groups!['question'].trim(),
				context: match.groups!['context'].trim(),
				suggestedOptions: match.groups?.['options']
					?.split(',')
					.map(o => o.trim())
					.filter(Boolean),
			});
		}

		return questions;
	}

	/**
	 * Extract the requirements markdown content from LLM output
	 * (after any clarifying questions section).
	 */
	private extractRequirementsContent(text: string): string {
		// Look for the requirements document starting with "# "
		const reqStart = text.indexOf('# ');
		if (reqStart >= 0) {
			return text.substring(reqStart).trim();
		}
		return text.trim();
	}
}
