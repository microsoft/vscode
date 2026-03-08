/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SecurityFinding, SubtaskResult } from './types';

/**
 * Security scanning specialist.
 * Analyses code for security vulnerabilities using automated scanning
 * and LLM-based analysis. Classifies findings by severity.
 */
export class SecurityScannerAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a security analysis specialist for Son of Anton.',
			'You analyse code for security vulnerabilities.',
			'',
			'## Rules',
			'1. Check for OWASP top 10 vulnerabilities.',
			'2. Classify findings by severity: critical, high, medium, low.',
			'3. Critical and high findings are blocking — the change should not be applied.',
			'4. Medium and low are advisory — the developer should be aware.',
			'5. Explain each vulnerability in plain language.',
			'6. Suggest specific fixes for each finding.',
			'',
			'## Output Format',
			'Respond with findings in JSON format wrapped in ```json``` code fences:',
			'```json',
			'{',
			'  "findings": [',
			'    {',
			'      "ruleId": "sql-injection",',
			'      "severity": "critical",',
			'      "message": "Description",',
			'      "filePath": "path/to/file.ts",',
			'      "line": 42,',
			'      "suggestedFix": "Use parameterized queries"',
			'    }',
			'  ]',
			'}',
			'```',
			'If no issues are found, return an empty findings array.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Security Scanner', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Gather file contents for analysis
			const securityContext = await this.gatherSecurityContext(task.id, context);

			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildSecurityPrompt(context, securityContext);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
			);

			tokenUsage.naiveInputTokens = context.scopeFiles.length * 5000;

			// Parse findings
			const findings = this.parseFindings(text);
			const hasBlockingFindings = findings.some(f => f.blocking);

			this.agentManager.completeTask(task.id);

			return {
				success: !hasBlockingFindings,
				changes: [],
				summary: this.formatFindingsSummary(findings),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Security scan failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	private async gatherSecurityContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file}\n${summary}`);

			// Get dependencies for supply chain analysis
			const deps = await this.queryDependencies(taskId, file);
			sections.push(`### ${file} dependencies\n${deps}`);
		}

		if (context.graphContext) {
			sections.push('### Additional Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildSecurityPrompt(context: AgentContext, securityContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Files to Scan',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Context',
			securityContext,
			'',
			'## Check For',
			'- SQL/NoSQL injection',
			'- XSS (cross-site scripting)',
			'- Command injection',
			'- Path traversal',
			'- Insecure deserialization',
			'- Hardcoded secrets or credentials',
			'- Insecure cryptographic usage',
			'- Missing input validation at system boundaries',
			'- Prototype pollution',
			'- Server-side request forgery (SSRF)',
		].join('\n');
	}

	private parseFindings(llmOutput: string): SecurityFinding[] {
		const jsonMatch = llmOutput.match(/```json\s*\n([\s\S]*?)\n\s*```/);
		if (!jsonMatch) {
			return [];
		}

		try {
			const parsed = JSON.parse(jsonMatch[1]);
			if (!Array.isArray(parsed.findings)) {
				return [];
			}

			return parsed.findings.map((f: Record<string, unknown>) => {
				const severity = this.validateSeverity(String(f.severity ?? 'low'));
				const blocking = severity === 'critical' || severity === 'high';

				return {
					ruleId: String(f.ruleId ?? 'unknown'),
					severity,
					message: String(f.message ?? ''),
					filePath: String(f.filePath ?? ''),
					line: typeof f.line === 'number' ? f.line : undefined,
					suggestedFix: f.suggestedFix ? String(f.suggestedFix) : undefined,
					blocking,
				};
			});
		} catch {
			return [];
		}
	}

	private validateSeverity(severity: string): SecurityFinding['severity'] {
		const valid = ['critical', 'high', 'medium', 'low'] as const;
		return valid.includes(severity as typeof valid[number])
			? severity as SecurityFinding['severity']
			: 'low';
	}

	private formatFindingsSummary(findings: SecurityFinding[]): string {
		if (findings.length === 0) {
			return 'No security issues found.';
		}

		const bySeverity = {
			critical: findings.filter(f => f.severity === 'critical'),
			high: findings.filter(f => f.severity === 'high'),
			medium: findings.filter(f => f.severity === 'medium'),
			low: findings.filter(f => f.severity === 'low'),
		};

		const parts: string[] = [];

		if (bySeverity.critical.length > 0) {
			parts.push(`${bySeverity.critical.length} CRITICAL`);
		}
		if (bySeverity.high.length > 0) {
			parts.push(`${bySeverity.high.length} high`);
		}
		if (bySeverity.medium.length > 0) {
			parts.push(`${bySeverity.medium.length} medium`);
		}
		if (bySeverity.low.length > 0) {
			parts.push(`${bySeverity.low.length} low`);
		}

		const blocking = findings.filter(f => f.blocking);
		const blockingNote = blocking.length > 0
			? ` (${blocking.length} blocking)`
			: '';

		return `Found ${findings.length} issue(s): ${parts.join(', ')}${blockingNote}`;
	}
}
