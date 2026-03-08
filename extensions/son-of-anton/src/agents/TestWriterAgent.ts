/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult } from './types';

/**
 * Test writing specialist.
 * Generates tests for code including happy-path, edge cases, and error scenarios.
 * Uses the project's testing framework and existing patterns.
 */
export class TestWriterAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a test writing specialist for Son of Anton.',
			'You generate tests for code, covering happy-path, edge cases, and error scenarios.',
			'',
			'## Rules',
			'1. Use the project\'s existing testing framework and patterns.',
			'2. Use `describe` and `test` blocks consistently with existing patterns.',
			'3. Prefer snapshot-style `assert.deepStrictEqual` over many small assertions.',
			'4. Include: happy-path tests, edge cases, error scenarios, boundary conditions.',
			'5. Add tests to existing test files when they exist for the module.',
			'6. Create new test files following the project naming convention when needed.',
			'',
			'## Output Format',
			'Provide test code in ```diff``` or ```typescript``` code fences.',
			'For new test files, use <!-- CREATE: path/to/file.test.ts --> before the code block.',
			'Include a summary of what is tested.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Test Writer', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Gather context about what to test
			const testContext = await this.gatherTestContext(task.id, context);

			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildTestPrompt(context, testContext);

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
				summary: this.extractTestSummary(text),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Test generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	private async gatherTestContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			// Get function signatures and structure
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file}\n${summary}`);

			// Get dependencies to understand mocking needs
			const deps = await this.queryDependencies(taskId, file);
			sections.push(`### ${file} dependencies\n${deps}`);

			// Check for existing test files
			const testFile = this.guessTestPath(file);
			try {
				const testSummary = await this.queryFileGraph(taskId, testFile);
				sections.push(`### Existing tests: ${testFile}\n${testSummary}`);
			} catch {
				sections.push(`### No existing test file found for ${file}`);
			}
		}

		if (context.graphContext) {
			sections.push('### Additional Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildTestPrompt(context: AgentContext, testContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Files to Test',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Context',
			testContext,
			'',
			'## Requirements',
			'- Happy-path tests for all public functions',
			'- Edge case tests for boundary conditions',
			'- Error scenario tests for failure paths',
			'- Use the existing test framework and conventions',
			'- Add to existing test files when available',
		].join('\n');
	}

	private guessTestPath(filePath: string): string {
		// Common patterns: file.ts -> file.test.ts, file.ts -> __tests__/file.test.ts
		const withoutExt = filePath.replace(/\.(ts|js|tsx|jsx)$/, '');
		const ext = filePath.match(/\.(ts|js|tsx|jsx)$/)?.[1] ?? 'ts';
		return `${withoutExt}.test.${ext}`;
	}

	private extractTestSummary(llmOutput: string): string {
		const summaryMatch = llmOutput.match(/## Summary\n([\s\S]*?)(?:\n##|$)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}

		const testCount = (llmOutput.match(/\btest\s*\(/g) ?? []).length;
		return `Generated ${testCount} test(s).`;
	}
}
