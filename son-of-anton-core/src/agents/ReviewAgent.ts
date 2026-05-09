/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { loadAgentPrompt } from './promptLoader';
import { ReviewCheck, ReviewFeedback, ReviewIssue, SubtaskResult } from './types';

/**
 * Review agent — the quality gate.
 * Every specialist's output goes through it before reaching the developer.
 * Runs automated checks: syntax, types, tests, security, and standards.
 */
export class ReviewAgent extends BaseAgent {
	protected getRoleDescription(): string {
		// H10 — role description loaded from `prompts/anton-review.prompt.md`
		// at runtime so prompt iteration doesn't require a TypeScript edit.
		return loadAgentPrompt(this.handle);
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
				context.onToken,
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
			const issues = this.parseIssues(parsed.issues);
			const suggestedNextStep = typeof parsed.suggestedNextStep === 'string'
				? parsed.suggestedNextStep.trim()
				: undefined;
			const rawConfidence = parsed.confidenceInRetrySuccess;
			const confidenceInRetrySuccess = typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
				? Math.max(0, Math.min(1, rawConfidence))
				: undefined;

			return {
				passed: Boolean(parsed.passed),
				checks,
				suggestions: Array.isArray(parsed.suggestions)
					? parsed.suggestions.map(String)
					: [],
				confidence,
				...(issues.length > 0 ? { issues } : {}),
				...(suggestedNextStep ? { suggestedNextStep } : {}),
				...(confidenceInRetrySuccess !== undefined ? { confidenceInRetrySuccess } : {}),
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

	/**
	 * Coerce a raw `issues` array from JSON into validated `ReviewIssue`
	 * objects. Skips entries with missing or unrecognised severity /
	 * category — better to drop a malformed issue than to surface
	 * `severity: undefined` to the orchestrator's retry logic.
	 */
	private parseIssues(raw: unknown): ReviewIssue[] {
		if (!Array.isArray(raw)) {
			return [];
		}
		const validSeverities = new Set<ReviewIssue['severity']>(['blocker', 'warning', 'suggestion']);
		const validCategories = new Set<ReviewIssue['category']>(['correctness', 'tests', 'style', 'performance', 'security', 'integration']);
		const out: ReviewIssue[] = [];
		let nextFallbackId = 1;
		for (const item of raw as ReadonlyArray<Record<string, unknown>>) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			const severity = String(item.severity ?? '') as ReviewIssue['severity'];
			const category = String(item.category ?? '') as ReviewIssue['category'];
			const description = typeof item.description === 'string' ? item.description.trim() : '';
			if (!description || !validSeverities.has(severity) || !validCategories.has(category)) {
				continue;
			}
			const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `I${nextFallbackId++}`;
			const issue: ReviewIssue = { id, severity, category, description };
			const rawLocation = item.location;
			if (rawLocation && typeof rawLocation === 'object') {
				const file = typeof (rawLocation as Record<string, unknown>).file === 'string'
					? (rawLocation as { file: string }).file
					: undefined;
				const line = typeof (rawLocation as Record<string, unknown>).line === 'number'
					? (rawLocation as { line: number }).line
					: undefined;
				if (file) {
					issue.location = line !== undefined ? { file, line } : { file };
				}
			}
			if (typeof item.proposedFix === 'string' && item.proposedFix.trim()) {
				issue.proposedFix = item.proposedFix.trim();
			}
			out.push(issue);
		}
		return out;
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

		// Structured issues, when present, take precedence over freeform
		// suggestions in the summary — they're more actionable and the
		// orchestrator's retry path consumes them directly.
		if (feedback.issues && feedback.issues.length > 0) {
			const issueLines = feedback.issues.map(issue => {
				const loc = issue.location?.file
					? ` [${issue.location.file}${issue.location.line !== undefined ? ':' + issue.location.line : ''}]`
					: '';
				const fix = issue.proposedFix ? ` — fix: ${issue.proposedFix}` : '';
				return `${issue.id} (${issue.severity}/${issue.category})${loc}: ${issue.description}${fix}`;
			});
			parts.push(`Issues:\n  ${issueLines.join('\n  ')}`);
		} else if (feedback.suggestions.length > 0) {
			parts.push(`Suggestions: ${feedback.suggestions.join('; ')}`);
		}

		if (feedback.suggestedNextStep) {
			parts.push(`Next step: ${feedback.suggestedNextStep}`);
		}

		if (feedback.confidenceInRetrySuccess !== undefined) {
			parts.push(`Retry confidence: ${(feedback.confidenceInRetrySuccess * 100).toFixed(0)}%`);
		}

		return parts.join('. ');
	}
}
