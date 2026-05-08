/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LlmMessage } from '../llm/LlmClient';
import { BUILTIN_TOOLS } from '../tools/registry';
import type { Tool, ToolDefinition, ToolExecutionContext } from '../tools/types';
import { BaseAgent, AgentContext } from './BaseAgent';
import { FileChange, SubtaskResult, TokenUsage } from './types';

/**
 * Code generation specialist.
 *
 * Lands the harness's H1 migration: the agent now drives a native
 * Anthropic tool-use loop (read_file → edit_file → write_file → done)
 * instead of asking the model to emit a markdown diff and then
 * regex-parsing it out of the response. The legacy text-extraction path
 * is preserved as a fallback under `runWithLegacyDiff` so a host that
 * doesn't supply a `ToolExecutionContext` (e.g. a smoke-test harness)
 * still gets a usable result.
 */
export class CodeGeneratorAgent extends BaseAgent {
	protected getRoleDescription(): string {
		return [
			'You are a code generation specialist for Son of Anton.',
			'You receive specific coding tasks with a defined scope.',
			'',
			'## Rules',
			'1. Respect the project\'s coding standards from AGENTS.md / CLAUDE.md.',
			'2. Only modify files within your declared scope.',
			'3. Read the affected files before editing them — never blind-write.',
			'4. Use the smallest patch that solves the task. Avoid speculative refactors.',
			'5. Follow existing patterns in the codebase.',
			'',
			'## Tools',
			'Use the supplied tools to accomplish the task: `read_file`, `list_directory`,',
			'`search_workspace`, `write_file`, and `run_command` (when explicitly needed).',
			'When you finish, reply with a brief summary of what you changed and why —',
			'no code blocks, just prose. Don\'t emit raw diffs in your reply; the changes',
			'are already applied via the write_file tool calls.',
		].join('\n');
	}

	async execute(context: AgentContext): Promise<SubtaskResult> {
		const task = this.agentManager.createTask('Code Generator', context.instruction, context.parentTaskId);
		this.agentManager.startTask(task.id);

		try {
			const codeContext = await this.gatherCodeContext(task.id, context);
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			const userMessage = this.buildCodeGenPrompt(context, codeContext);

			// When the host has wired a ToolExecutionContext (the IDE / CLI
			// activation paths both do), drive the model through the native
			// tool-use loop. The legacy diff-parse fallback runs only when no
			// context is supplied — a tiny safety net while the migration
			// stabilises.
			const toolExecutionContext = this.getToolExecutionContext();
			if (!toolExecutionContext) {
				return await this.runWithLegacyDiff(context, task.id, systemPrompt, userMessage);
			}

			const initialMessages: LlmMessage[] = [{ role: 'user', content: userMessage }];
			const tools = this.allowedToolDefinitions();

			let liveText = '';
			const result = await this.runToolLoop({
				taskId: task.id,
				model: this.defaultModel,
				systemPrompt,
				initialMessages,
				tools,
				maxIterations: 10,
				onToken: (tok) => {
					liveText += tok;
					context.onToken?.(tok);
				},
				executeTool: async (call) => {
					return await this.executeToolCall(call.name, call.input, toolExecutionContext);
				},
			});

			// Capture file changes from the tool calls so the orchestrator's
			// task board still surfaces a "files changed" footprint even though
			// the changes were applied directly via write_file.
			const changes = collectFileChanges(result.toolCalls);
			const tokenUsage: TokenUsage = result.tokenUsage;
			tokenUsage.naiveInputTokens = this.estimateNaiveTokens(context.scopeFiles);

			this.agentManager.completeTask(task.id);

			return {
				success: true,
				changes,
				summary: this.extractSummary(result.text || liveText),
				tokenUsage,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);

			return {
				success: false,
				changes: [],
				summary: `Code generation failed: ${message}`,
				tokenUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, naiveInputTokens: 0 },
			};
		}
	}

	/**
	 * Whether the host supplied a `ToolExecutionContext` we can use to run
	 * tools natively. Hooked through `BaseAgent`'s overridable getter so
	 * tests can stub a context, and the IDE / CLI activation can plug in
	 * their own (per-call workspace-trust gating, auto-approval policy,
	 * write-snapshot capture, etc).
	 *
	 * Returns `undefined` for now — the activation wiring will land
	 * separately when the host plumbs its existing `ToolRegistry` execution
	 * surface in. Until then, the legacy diff-parse path runs.
	 */
	protected getToolExecutionContext(): ToolExecutionContext | undefined {
		return undefined;
	}

	/**
	 * Restrict the tool surface exposed to the model to the ones a code
	 * generator should plausibly need. Excludes `emit_ui_block` (not useful
	 * for code edits) and `fetch_url` (out-of-scope side effect).
	 */
	private allowedToolDefinitions(): ReadonlyArray<ToolDefinition> {
		const allow = new Set([
			'read_file',
			'list_directory',
			'search_workspace',
			'glob',
			'write_file',
			'edit_file',
			'run_command',
		]);
		return BUILTIN_TOOLS
			.filter((t: Tool) => allow.has(t.definition.name))
			.map((t: Tool) => t.definition);
	}

	/**
	 * Run a tool by name against the host's `ToolExecutionContext`. The
	 * registry already gates execution + wraps thrown errors; we just adapt
	 * its `ToolExecutionResult` shape into the `{ result, isError }` shape
	 * `runToolLoop` expects.
	 */
	private async executeToolCall(
		name: string,
		input: Record<string, unknown>,
		ctx: ToolExecutionContext,
	): Promise<{ result: string; isError?: boolean }> {
		const tool = BUILTIN_TOOLS.find((t: Tool) => t.definition.name === name);
		if (!tool) {
			return { result: `Unknown tool: ${name}`, isError: true };
		}
		try {
			const result = await tool.execute(input, ctx);
			return { result: result.content, isError: !!result.isError };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { result: `Tool '${name}' threw: ${message}`, isError: true };
		}
	}

	/**
	 * Legacy text-extraction execution path. Preserved verbatim from the
	 * pre-H1 implementation so installations without a wired
	 * `ToolExecutionContext` still get a usable result while the migration
	 * rolls out.
	 */
	private async runWithLegacyDiff(
		context: AgentContext,
		taskId: string,
		systemPrompt: string,
		userMessage: string,
	): Promise<SubtaskResult> {
		const { text, tokenUsage } = await this.callLlm(
			taskId,
			this.defaultModel,
			systemPrompt,
			userMessage,
			context.onToken,
		);
		tokenUsage.naiveInputTokens = this.estimateNaiveTokens(context.scopeFiles);
		const changes = this.parseFileChanges(text);
		this.agentManager.completeTask(taskId);
		return {
			success: true,
			changes,
			summary: this.extractSummary(text),
			tokenUsage,
		};
	}

	/**
	 * Gather graph-routed context instead of dumping entire files.
	 */
	private async gatherCodeContext(taskId: string, context: AgentContext): Promise<string> {
		const sections: string[] = [];

		for (const file of context.scopeFiles) {
			// File summary (structural overview)
			const summary = await this.queryFileGraph(taskId, file);
			sections.push(`### ${file} (structure)\n${summary}`);

			// Dependencies
			const deps = await this.queryDependencies(taskId, file);
			sections.push(`### ${file} (dependencies)\n${deps}`);
		}

		// Include any graph context from the orchestrator
		if (context.graphContext) {
			sections.push('### Orchestrator Context\n' + context.graphContext);
		}

		return sections.join('\n\n');
	}

	private buildCodeGenPrompt(context: AgentContext, codeContext: string): string {
		return [
			'## Task',
			context.instruction,
			'',
			'## Scope',
			'You may only modify these files:',
			...context.scopeFiles.map(f => `- ${f}`),
			'',
			'## Code Graph Context',
			codeContext,
			'',
			'Use the tools to read, then write the files. End with a one-paragraph summary.',
		].join('\n');
	}

	private extractSummary(llmOutput: string): string {
		// Look for a summary section in the response
		const summaryMatch = llmOutput.match(/## Summary\n([\s\S]*?)(?:\n##|$)/);
		if (summaryMatch) {
			return summaryMatch[1].trim();
		}

		// Fall back to the first non-code paragraph
		const lines = llmOutput.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('#')) {
				return trimmed;
			}
		}

		return 'Code changes generated.';
	}

	/**
	 * Estimate how many tokens would be used without graph routing.
	 * Assumes ~4 characters per token, ~500 lines per file, ~40 chars per line.
	 */
	private estimateNaiveTokens(scopeFiles: string[]): number {
		return scopeFiles.length * 500 * 40 / 4;
	}
}

/**
 * Translate the executed-tool log from `runToolLoop` into the
 * `FileChange[]` shape the orchestrator's task board renders. Only
 * `write_file` calls produce changes; all other tool calls (reads,
 * listings, shell commands) are evidence of context-gathering and
 * deliberately not surfaced as file diffs.
 */
function collectFileChanges(
	toolCalls: ReadonlyArray<{ name: string; input: Record<string, unknown>; result: string; isError: boolean }>,
): FileChange[] {
	const changes: FileChange[] = [];
	for (const call of toolCalls) {
		if (call.isError) {
			continue;
		}
		if (call.name === 'write_file') {
			const path = typeof call.input['path'] === 'string' ? call.input['path'] as string : undefined;
			const content = typeof call.input['content'] === 'string' ? call.input['content'] as string : undefined;
			if (!path) {
				continue;
			}
			changes.push({
				filePath: path,
				changeType: /\b(created|new file)\b/i.test(call.result) ? 'create' : 'modify',
				content,
			});
			continue;
		}
		if (call.name === 'edit_file') {
			// edit_file is always a modification — it errors out when the
			// target file doesn't exist, so a successful call always implies
			// an existing file was patched. We don't have the post-edit
			// content here (only the find/replace strings), so the change
			// entry surfaces the path + diff hint without the full content.
			const path = typeof call.input['path'] === 'string' ? call.input['path'] as string : undefined;
			const find = typeof call.input['find'] === 'string' ? call.input['find'] as string : '';
			const replace = typeof call.input['replace'] === 'string' ? call.input['replace'] as string : '';
			if (!path) {
				continue;
			}
			const diff = `--- a/${path}\n+++ b/${path}\n@@ surgical edit @@\n-${find.split('\n').join('\n-')}\n+${replace.split('\n').join('\n+')}`;
			changes.push({
				filePath: path,
				changeType: 'modify',
				diff,
			});
		}
	}
	return changes;
}
