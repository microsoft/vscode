/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmClient, ModelId } from '../llm/LlmClient';
import { McpClient, McpToolCall, McpToolResult } from '../mcp/McpClient';
import { AgentManager } from './AgentManager';
import { MetricsTracker } from './MetricsTracker';
import { ProjectMemory } from './ProjectMemory';
import {
	AgentConfig,
	AgentHandle,
	FileChange,
	SubtaskResult,
	TokenUsage,
} from './types';

/**
 * Context provided to specialist agents for each subtask.
 */
export interface AgentContext {
	instruction: string;
	scopeFiles: string[];
	graphContext: string;
	parentTaskId: string;
}

/**
 * Base class for all specialist agents.
 * Provides shared infrastructure: LLM calls, MCP tool access, tracing, and metrics.
 */
export abstract class BaseAgent {
	protected readonly config: AgentConfig;
	protected readonly llmClient: LlmClient;
	protected readonly mcpClient: McpClient;
	protected readonly agentManager: AgentManager;
	protected readonly metricsTracker: MetricsTracker;
	protected readonly projectMemory: ProjectMemory;

	constructor(
		config: AgentConfig,
		llmClient: LlmClient,
		mcpClient: McpClient,
		agentManager: AgentManager,
		metricsTracker: MetricsTracker,
		projectMemory: ProjectMemory,
	) {
		this.config = config;
		this.llmClient = llmClient;
		this.mcpClient = mcpClient;
		this.agentManager = agentManager;
		this.metricsTracker = metricsTracker;
		this.projectMemory = projectMemory;
	}

	get handle(): AgentHandle {
		return this.config.handle;
	}

	get displayName(): string {
		return this.config.displayName;
	}

	get defaultModel(): ModelId {
		return this.config.defaultModel;
	}

	/**
	 * Build the system prompt for this agent.
	 * Includes project memory for prompt cache hits.
	 */
	protected buildSystemPrompt(roleDescription: string): string {
		const memoryContext = this.projectMemory.getSystemContext();
		const sections = [roleDescription];

		if (memoryContext) {
			sections.push(memoryContext);
		}

		return sections.join('\n\n---\n\n');
	}

	/**
	 * Call an MCP tool and record a trace span.
	 */
	protected async callMcpTool(
		taskId: string,
		server: string,
		tool: string,
		inputs: Record<string, unknown>,
	): Promise<McpToolResult> {
		const span = this.agentManager.addSpan({
			taskId,
			name: `${server}/${tool}`,
			type: 'mcp_tool',
			startTime: Date.now(),
			attributes: { server, tool, inputs: JSON.stringify(inputs) },
		});

		const result = await this.mcpClient.callTool({ server, tool, inputs });

		span.endTime = Date.now();
		span.attributes['latencyMs'] = result.latencyMs;
		span.attributes['isError'] = result.isError;

		return result;
	}

	/**
	 * Make an LLM request and record a trace span.
	 */
	protected async callLlm(
		taskId: string,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
	): Promise<{ text: string; tokenUsage: TokenUsage }> {
		const span = this.agentManager.addSpan({
			taskId,
			name: `llm-${model}`,
			type: 'llm_call',
			startTime: Date.now(),
			attributes: { model },
		});

		const text = await this.llmClient.request({
			model,
			systemPrompt,
			messages: [{ role: 'user', content: userMessage }],
		});

		span.endTime = Date.now();

		const usage = this.llmClient.getTokenUsage();
		const tokenUsage: TokenUsage = {
			inputTokens: usage.input,
			outputTokens: usage.output,
			cachedTokens: usage.cached,
			naiveInputTokens: 0,
		};

		span.attributes['inputTokens'] = tokenUsage.inputTokens;
		span.attributes['outputTokens'] = tokenUsage.outputTokens;

		return { text, tokenUsage };
	}

	/**
	 * Stream an LLM response to a VS Code chat response stream.
	 */
	protected async streamToChat(
		stream: vscode.ChatResponseStream,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
	): Promise<string> {
		let fullText = '';

		for await (const event of this.llmClient.streamRequest({
			model,
			systemPrompt,
			messages: [{ role: 'user', content: userMessage }],
		})) {
			if (event.type === 'token') {
				stream.markdown(event.token);
				fullText += event.token;
			} else if (event.type === 'error') {
				stream.markdown(`\n\n**Error:** ${event.error}`);
				throw new Error(event.error);
			}
		}

		return fullText;
	}

	/**
	 * Query the code graph for file summary information.
	 */
	protected async queryFileGraph(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'file_summary', { filePath });
		return result.content;
	}

	/**
	 * Query the code graph for symbol lookup.
	 */
	protected async querySymbol(taskId: string, symbolName: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'symbol_lookup', { symbolName });
		return result.content;
	}

	/**
	 * Query the code graph for dependencies of a file.
	 */
	protected async queryDependencies(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'dependency_traversal', { filePath });
		return result.content;
	}

	/**
	 * Query the code graph for impact analysis.
	 */
	protected async queryImpact(taskId: string, filePath: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'impact_analysis', { filePath });
		return result.content;
	}

	/**
	 * Query references to a symbol.
	 */
	protected async queryReferences(taskId: string, symbolName: string): Promise<string> {
		const result = await this.callMcpTool(taskId, 'code-graph', 'find_references', { symbolName });
		return result.content;
	}

	/**
	 * Parse file changes from an LLM response.
	 * Expects the LLM to output changes in a structured format.
	 */
	protected parseFileChanges(llmOutput: string): FileChange[] {
		const changes: FileChange[] = [];
		const fileBlockRegex = /```(?:diff|patch)?\s*\n([\s\S]*?)```/g;

		let match;
		while ((match = fileBlockRegex.exec(llmOutput)) !== null) {
			const block = match[1] ?? '';
			const lines = block.split('\n');

			let filePath = '';
			let startIndex = 0;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Prefer +++ b/<path> when available
				const plusMatch = line.match(/^\+\+\+\s+b\/(.+)\s*$/);
				if (plusMatch) {
					filePath = plusMatch[1];
					startIndex = i + 1;
					break;
				}

				// Support diff --git a/... b/... headers
				const gitMatch = line.match(/^diff --git a\/.+ b\/(.+)\s*$/);
				if (gitMatch) {
					filePath = gitMatch[1];
					startIndex = i + 1;
					// Don't break yet; there may still be a +++ line later
				}

				// Fallback: use --- a/<path> if nothing else is found
				if (!filePath) {
					const minusMatch = line.match(/^---\s+a\/(.+)\s*$/);
					if (minusMatch) {
						filePath = minusMatch[1];
						startIndex = i + 1;
					}
				}
			}

			// If we couldn't determine a file path, skip this block
			if (!filePath) {
				continue;
			}

			const diff = lines.slice(startIndex).join('\n');

			if (diff.trim()) {
				changes.push({
					filePath,
					changeType: 'modify',
					diff: diff.trim(),
				});
			}
		}

		// Also look for full file outputs
		const createRegex = /<!-- CREATE: (.+?) -->\n```\w*\n([\s\S]*?)```/g;
		while ((match = createRegex.exec(llmOutput)) !== null) {
			changes.push({
				filePath: match[1],
				changeType: 'create',
				content: match[2].trim(),
			});
		}

		return changes;
	}

	/**
	 * Execute the agent's task. Implemented by each specialist.
	 */
	abstract execute(context: AgentContext): Promise<SubtaskResult>;

	/**
	 * Handle a VS Code chat request. Default implementation delegates to execute().
	 */
	async handleChatRequest(
		request: vscode.ChatRequest,
		chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken,
	): Promise<void> {
		const task = this.agentManager.createTask(this.displayName, request.prompt);
		this.agentManager.startTask(task.id);

		try {
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			await this.streamToChat(stream, this.defaultModel, systemPrompt, request.prompt);
			this.agentManager.completeTask(task.id);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
		}
	}

	/**
	 * Get the role description for this agent's system prompt.
	 */
	protected abstract getRoleDescription(): string;
}
