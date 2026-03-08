/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';

/**
 * Failure classification for CI pipeline errors.
 */
type FailureType = 'test' | 'build' | 'lint' | 'flaky' | 'unknown';

interface CiFailure {
	type: FailureType;
	stage: string;
	message: string;
	logs: string;
}

/**
 * CI/CD retry specialist.
 * Monitors pipeline status, classifies failures, and attempts automatic fixes.
 * Escalates to human after MAX_RETRIES failed attempts.
 */
export class CiRetryAgent extends BaseAgent {
	private static readonly MAX_RETRIES = 3;

	protected getRoleDescription(): string {
		return [
			'You are a CI/CD pipeline specialist for Son of Anton.',
			'Your job is to analyse CI pipeline failures and generate fixes.',
			'',
			'## Failure Classification',
			'- **Test failure:** Read the failing test, understand the assertion, fix the code or test.',
			'- **Build failure:** Fix syntax errors, missing imports, type mismatches.',
			'- **Lint failure:** Apply lint fixes (formatting, naming, unused variables).',
			'- **Flaky test:** Identify tests that pass locally but fail in CI. Flag for human review.',
			'',
			'## Rules',
			'1. Always read the full failure log before attempting a fix.',
			'2. Classify the failure type accurately.',
			'3. For flaky tests, add a `@flaky` annotation and flag for human review.',
			'4. Never suppress errors — fix the root cause.',
			'5. Keep fixes minimal and focused on the failure.',
			'',
			'## Output Format',
			'Provide fixes in ```diff``` code fences.',
			'Include a classification of the failure type and confidence level.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('CI Retry', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Get pipeline status
			const pipelineInfo = await this.getPipelineStatus(task.id, context);

			if (pipelineInfo.status === 'passed') {
				this.agentManager.completeTask(task.id);
				return {
					success: true,
					changes: [],
					summary: 'Pipeline is passing. No fixes needed.',
					tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
				};
			}

			// Classify and fix failures
			const failures = await this.classifyFailures(task.id, pipelineInfo.logs);
			let allChanges = [];
			let attempt = 0;

			for (const failure of failures) {
				if (failure.type === 'flaky') {
					// Flag flaky tests for human review, don't auto-fix
					continue;
				}

				if (attempt >= CiRetryAgent.MAX_RETRIES) {
					break;
				}

				const fixResult = await this.generateFix(task.id, failure, context);
				allChanges.push(...fixResult.changes);
				attempt++;
			}

			const flakyTests = failures.filter(f => f.type === 'flaky');
			let summary = `Analysed ${failures.length} failure(s). Generated ${allChanges.length} fix(es).`;
			if (flakyTests.length > 0) {
				summary += ` ${flakyTests.length} flaky test(s) flagged for human review.`;
			}
			if (attempt >= CiRetryAgent.MAX_RETRIES) {
				summary += ' Maximum retry limit reached — escalating remaining failures to human.';
			}

			this.agentManager.completeTask(task.id);

			return {
				success: allChanges.length > 0,
				changes: allChanges,
				summary,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `CI retry failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Get CI pipeline status from the deployment MCP server.
	 */
	private async getPipelineStatus(
		taskId: string,
		context: AgentContext
	): Promise<{ status: string; logs: string }> {
		try {
			const branchMatch = context.instruction.match(/branch[:\s]+(\S+)/i);
			const prMatch = context.instruction.match(/pr[:\s#]+(\d+)/i);

			const statusResult = await this.callMcpTool(taskId, 'deployment', 'pipeline_status', {
				branch: branchMatch?.[1],
				pr: prMatch ? parseInt(prMatch[1], 10) : undefined,
			});

			const pipelineData = JSON.parse(statusResult.content);

			let logs = '';
			if (pipelineData.status === 'failed' && pipelineData.url) {
				try {
					const logsResult = await this.callMcpTool(taskId, 'deployment', 'deployment_logs', {
						deploymentId: pipelineData.commitSha,
					});
					logs = logsResult.content;
				} catch {
					logs = JSON.stringify(pipelineData.stages, null, 2);
				}
			}

			return { status: pipelineData.status, logs };
		} catch {
			return { status: 'unknown', logs: '' };
		}
	}

	/**
	 * Classify CI failures from log output.
	 */
	private async classifyFailures(taskId: string, logs: string): Promise<CiFailure[]> {
		if (!logs) {
			return [{ type: 'unknown', stage: 'unknown', message: 'No failure logs available', logs: '' }];
		}

		const systemPrompt = this.buildSystemPrompt([
			'You are a CI failure classifier. Given CI/CD pipeline logs, classify each failure.',
			'Return a JSON array of failures with: type (test|build|lint|flaky|unknown), stage, message.',
		].join('\n'));

		const { text } = await this.callLlm(
			taskId,
			'haiku',
			systemPrompt,
			`Classify these CI failures:\n\n${logs.slice(0, 20000)}`,
		);

		try {
			const jsonMatch = text.match(/\[[\s\S]*\]/);
			if (jsonMatch) {
				return JSON.parse(jsonMatch[0]) as CiFailure[];
			}
		} catch {
			// Fall through to default
		}

		return [{ type: 'unknown', stage: 'unknown', message: 'Failed to classify', logs }];
	}

	/**
	 * Generate a fix for a classified CI failure.
	 */
	private async generateFix(
		taskId: string,
		failure: CiFailure,
		context: AgentContext
	): Promise<SubtaskResult> {
		const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());

		const userMessage = [
			'## CI Failure to Fix',
			`**Type:** ${failure.type}`,
			`**Stage:** ${failure.stage}`,
			`**Message:** ${failure.message}`,
			'',
			'## Failure Logs',
			failure.logs.slice(0, 15000),
			'',
			'## Context Files',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'Generate a minimal fix for this failure.',
		].join('\n');

		const { text, tokenUsage } = await this.callLlm(
			taskId,
			this.defaultModel,
			systemPrompt,
			userMessage,
		);

		const changes = this.parseFileChanges(text);

		return {
			success: changes.length > 0,
			changes,
			summary: `Fix for ${failure.type} failure in ${failure.stage}`,
			tokenUsage,
		};
	}
}
