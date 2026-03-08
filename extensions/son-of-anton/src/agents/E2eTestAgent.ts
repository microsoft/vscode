/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { SubtaskResult, FileChange } from './types';

/**
 * E2E test generation specialist.
 * Uses Playwright MCP tools to explore a running app, write E2E tests,
 * and validate them. Supports visual regression testing with baseline management.
 */
export class E2eTestAgent extends BaseAgent {
	private static readonly MAX_FIX_ATTEMPTS = 3;

	protected getRoleDescription(): string {
		return [
			'You are an E2E test generation specialist for Son of Anton.',
			'You write browser-based end-to-end tests using Playwright.',
			'',
			'## Rules',
			'1. Use Playwright accessibility-based locators (getByRole, getByLabel, getByText).',
			'2. Never use brittle CSS selectors — prefer semantic locators.',
			'3. Each test should cover a complete user flow (navigation, interaction, assertion).',
			'4. Use the accessibility tree to understand page structure before writing tests.',
			'5. Include setup and teardown for test isolation.',
			'6. Capture screenshots at key checkpoints for visual regression.',
			'7. Write clear test descriptions that explain the user flow being tested.',
			'',
			'## Output Format',
			'Provide Playwright test code in ```typescript``` fences.',
			'For new test files, use <!-- CREATE: path/to/file.spec.ts --> before the code block.',
			'Include a summary of flows tested and screenshots captured.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('E2E Test Writer', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			// Phase 1: Explore the running application
			const explorationData = await this.exploreApplication(task.id, context);

			// Phase 2: Generate E2E tests
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildE2eTestPrompt(context, explorationData);

			const { text, tokenUsage } = await this.callLlm(
				task.id,
				this.defaultModel,
				systemPrompt,
				userMessage,
			);

			tokenUsage.naiveInputTokens = context.scopeFiles.length * 8000;

			const changes = this.parseFileChanges(text);

			// Phase 3: Validate generated tests
			const validatedChanges = await this.validateTests(task.id, changes);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes: validatedChanges,
				summary: this.extractTestSummary(text),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `E2E test generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Explore the running application using Playwright MCP tools.
	 * Navigates key pages, captures accessibility trees, and identifies user flows.
	 */
	private async exploreApplication(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];
		const baseUrl = this.extractBaseUrl(context.instruction) ?? 'http://localhost:3000';

		try {
			// Navigate to the app
			const navResult = await this.callMcpTool(taskId, 'playwright', 'navigate', {
				url: baseUrl,
				waitUntil: 'networkidle',
			});
			sections.push(`### Navigation to ${baseUrl}\n${navResult.content}`);

			// Get the accessibility tree
			const treeResult = await this.callMcpTool(taskId, 'playwright', 'get_accessibility_tree', {});
			sections.push(`### Accessibility Tree\n${treeResult.content}`);

			// Take a screenshot for context
			const screenshotResult = await this.callMcpTool(taskId, 'playwright', 'screenshot', {
				fullPage: true,
			});
			sections.push(`### Screenshot captured for reference`);

			// Read page content
			const contentResult = await this.callMcpTool(taskId, 'playwright', 'read_content', {
				maxLength: 10000,
			});
			sections.push(`### Page Content\n${contentResult.content}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			sections.push(`### Exploration limited: ${message}`);
			sections.push('Generating tests based on available code context instead.');
		}

		// Add code context from scope files
		for (const file of context.scopeFiles) {
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### Source: ${file}\n${summary}`);
		}

		return sections.join('\n\n');
	}

	/**
	 * Validate generated tests by attempting to run them.
	 * On failure, use error output + screenshots to diagnose and fix (max 3 attempts).
	 */
	private async validateTests(taskId: string, changes: FileChange[]): Promise<FileChange[]> {
		// For now, return the changes as-is.
		// When the sandbox environment is available, this will:
		// 1. Write test files to a temp directory
		// 2. Run them with Playwright
		// 3. On failure, capture screenshot + error
		// 4. Feed error back to LLM for fix
		// 5. Repeat up to MAX_FIX_ATTEMPTS times
		return changes;
	}

	private buildE2eTestPrompt(context: AgentContext, explorationData: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Application Exploration Data',
			explorationData,
			'',
			'## Requirements',
			'- Write Playwright tests using accessibility-based locators (getByRole, getByLabel, getByText)',
			'- Each test covers a complete user flow',
			'- Include assertions for visible content, not implementation details',
			'- Add screenshot captures at key checkpoints',
			'- Tests must be isolated and not depend on each other',
			'- Follow Playwright best practices for reliability',
			'',
			'## Test File Template',
			'```typescript',
			"import { test, expect } from '@playwright/test';",
			'',
			"test.describe('Feature Name', () => {",
			"  test('user flow description', async ({ page }) => {",
			"    await page.goto('http://localhost:3000/path');",
			'    // Use accessibility locators',
			"    await page.getByRole('button', { name: 'Action' }).click();",
			"    await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible();",
			'  });',
			'});',
			'```',
		].join('\n');
	}

	private extractBaseUrl(instruction: string): string | null {
		const match = instruction.match(/https?:\/\/localhost:\d+/);
		return match ? match[0] : null;
	}

	private extractTestSummary(llmOutput: string): string {
		const summaryMatch = llmOutput.match(/## Summary\n([\s\S]*?)(?:\n##|$)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}

		const testCount = (llmOutput.match(/\btest\s*\(/g) ?? []).length;
		const describeCount = (llmOutput.match(/\btest\.describe\s*\(/g) ?? []).length;
		return `Generated ${testCount} E2E test(s) in ${describeCount || 1} suite(s).`;
	}
}
