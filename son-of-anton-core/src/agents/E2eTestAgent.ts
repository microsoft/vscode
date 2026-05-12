/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseAgent, AgentContext } from './BaseAgent';
import { loadAgentPrompt } from './promptLoader';
import { SubtaskResult, FileChange } from './types';

/**
 * E2E test generation specialist.
 * Uses Playwright MCP tools to explore a running app, write E2E tests,
 * and validate them. Supports visual regression testing with baseline management.
 */
export class E2eTestAgent extends BaseAgent {
	protected getRoleDescription(): string {
		// H10 — role description loaded from `prompts/anton-e2e.prompt.md`
		// at runtime so prompt iteration doesn't require a TypeScript edit.
		return loadAgentPrompt(this.handle);
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
				context.onToken,
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
			// Navigate to the app. mcpContentOrEmpty drops the McpClient
			// soft-error diagnostic ("(MCP server 'playwright' not
			// configured...)") when the Playwright server isn't reachable;
			// without it, "Navigation to http://… (MCP server not configured)"
			// would land in the test-generation prompt as if it were a real
			// page state. Empty content here is harmless — it just collapses
			// the section to its header.
			const navResult = await this.callMcpTool(taskId, 'playwright', 'navigate', {
				url: baseUrl,
				waitUntil: 'networkidle',
			});
			const navText = this.mcpContentOrEmpty(navResult);
			if (navText.length > 0) {
				sections.push(`### Navigation to ${baseUrl}\n${navText}`);
			}

			// Get the accessibility tree
			const treeResult = await this.callMcpTool(taskId, 'playwright', 'get_accessibility_tree', {});
			const treeText = this.mcpContentOrEmpty(treeResult);
			if (treeText.length > 0) {
				sections.push(`### Accessibility Tree\n${treeText}`);
			}

			// Take a screenshot for context
			await this.callMcpTool(taskId, 'playwright', 'screenshot', {
				fullPage: true,
			});
			sections.push(`### Screenshot captured for reference`);

			// Read page content
			const contentResult = await this.callMcpTool(taskId, 'playwright', 'read_content', {
				maxLength: 10000,
			});
			const contentText = this.mcpContentOrEmpty(contentResult);
			if (contentText.length > 0) {
				sections.push(`### Page Content\n${contentText}`);
			}
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
	private async validateTests(_taskId: string, changes: FileChange[]): Promise<FileChange[]> {
		// For now, return the changes as-is.
		// When the sandbox environment is available, this will:
		// 1. Write test files to a temp directory
		// 2. Run them with Playwright
		// 3. On failure, capture screenshot + error
		// 4. Feed error back to LLM for fix
		// 5. Repeat up to a fixed retry limit
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
			'import { test, expect } from \'@playwright/test\';',
			'',
			'test.describe(\'Feature Name\', () => {',
			'  test(\'user flow description\', async ({ page }) => {',
			'    await page.goto(\'http://localhost:3000/path\');',
			'    // Use accessibility locators',
			'    await page.getByRole(\'button\', { name: \'Action\' }).click();',
			'    await expect(page.getByRole(\'heading\', { name: \'Result\' })).toBeVisible();',
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
