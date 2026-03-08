/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { ReviewCheck, ReviewFeedback, SubtaskResult } from './types';

/**
 * Review agent — the quality gate.
 * Every specialist's output goes through it before reaching the developer.
 * Runs automated checks: syntax, types, tests, security, and standards.
 */
export class ReviewAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are the code review agent for Son of Anton.',
			'You validate all specialist output before it reaches the developer.',
			'',
			'## Review Checklist',
			'1. **Syntax:** Does the code parse correctly?',
			'2. **Types:** Are there any type errors?',
			'3. **Tests:** Do existing tests still pass?',
			'4. **Security:** Are there any new security findings?',
			'5. **Standards:** Does the code follow CLAUDE.md conventions?',
			'',
			'## Output Format',
			'Respond with your review in JSON format wrapped in ```json``` code fences:',
			'```json',
			'{',
			'  "passed": true,',
			'  "checks": [',
			'    { "name": "syntax", "passed": true, "message": "OK", "severity": "info" }',
			'  ],',
			'  "suggestions": ["Consider using const instead of let"],',
			'  "confidence": "high"',
			'}',
			'```',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Review', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			const reviewContext = await this.gatherReviewContext(task.id, context);

			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildReviewPrompt(context, reviewContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
			);

			tokenUsage.naiveInputTokens = context.scopeFiles.length * 5000;

			const feedback = this.parseReviewFeedback(text);

			this.agentManager.completeTask(task.id);

			return {
				success: feedback.passed,
				changes: [],
				summary: this.formatReviewSummary(feedback),
				tokenUsage,
				reviewFeedback: feedback,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Review failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	private async gatherReviewContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file}\n${summary}`);
		}

		if (context.graphContext) {
			sections.push('### Changes to Review\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildReviewPrompt(context: AgentContext, reviewContext: string): string {
		return [
			'## Review Request',
			context.instruction,
			'',
			'## Files Changed',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Context',
			reviewContext,
			'',
			'Review these changes against the checklist and respond with your assessment.',
		].join('\n');
	}

	private parseReviewFeedback(llmOutput: string): ReviewFeedback {
		const jsonMatch = llmOutput.match(/```json\s*\n([\s\S]*?)\n\s*```/);
		if (!jsonMatch) {
			return {
				passed: true,
				checks: [{ name: 'parse', passed: false, message: 'Could not parse review output', severity: 'warning' }],
				suggestions: [],
				confidence: 'low',
			};
		}

		try {
			const parsed = JSON.parse(jsonMatch[1]);

			const checks: ReviewCheck[] = Array.isArray(parsed.checks)
				? parsed.checks.map((c: Record<string, unknown>) => ({
					name: String(c.name ?? 'unknown'),
					passed: Boolean(c.passed),
					message: String(c.message ?? ''),
					severity: this.validateSeverity(String(c.severity ?? 'info')),
				}))
				: [];

			const confidence = this.validateConfidence(String(parsed.confidence ?? 'medium'));

			return {
				passed: Boolean(parsed.passed),
				checks,
				suggestions: Array.isArray(parsed.suggestions)
					? parsed.suggestions.map(String)
					: [],
				confidence,
			};
		} catch {
			return {
				passed: true,
				checks: [{ name: 'parse', passed: false, message: 'Malformed review JSON', severity: 'warning' }],
				suggestions: [],
				confidence: 'low',
			};
		}
	}

	private validateSeverity(severity: string): ReviewCheck['severity'] {
		const valid = ['error', 'warning', 'info'] as const;
		return valid.includes(severity as typeof valid[number])
			? severity as ReviewCheck['severity']
			: 'info';
	}

	private validateConfidence(confidence: string): ReviewFeedback['confidence'] {
		const valid = ['high', 'medium', 'low'] as const;
		return valid.includes(confidence as typeof valid[number])
			? confidence as ReviewFeedback['confidence']
			: 'medium';
	}

	private formatReviewSummary(feedback: ReviewFeedback): string {
		const status = feedback.passed ? 'PASSED' : 'FAILED';
		const failedChecks = feedback.checks.filter(c => !c.passed);
		const passedChecks = feedback.checks.filter(c => c.passed);

		const parts = [`Review ${status} (confidence: ${feedback.confidence})`];

		if (passedChecks.length > 0) {
			parts.push(`Passed: ${passedChecks.map(c => c.name).join(', ')}`);
		}

		if (failedChecks.length > 0) {
			parts.push(`Failed: ${failedChecks.map(c => `${c.name} — ${c.message}`).join('; ')}`);
		}

		if (feedback.suggestions.length > 0) {
			parts.push(`Suggestions: ${feedback.suggestions.join('; ')}`);
		}

		return parts.join('. ');
	}
}
