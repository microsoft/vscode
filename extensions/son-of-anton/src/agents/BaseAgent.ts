/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LlmClient, ModelId } from '../llm/LlmClient';
import { McpClient, McpToolResult } from '../mcp/McpClient';
import { AgentEvent } from './agentEvents';
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
	/**
	 * Optional per-token callback. When provided, the specialist should
	 * forward LLM tokens through this callback so the chat surface can
	 * render live streaming inside the active subtask card.
	 */
	onToken?: (token: string) => void;
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
	 *
	 * When `onToken` is provided, the request is routed through the streaming
	 * client so the caller can surface live tokens (e.g. into a subtask card).
	 * Without `onToken`, the cheaper non-streaming path is used to avoid the
	 * SSE overhead.
	 */
	protected async callLlm(
		taskId: string,
		model: ModelId,
		systemPrompt: string,
		userMessage: string,
		onToken?: (token: string) => void,
	): Promise<{ text: string; tokenUsage: TokenUsage }> {
		const span = this.agentManager.addSpan({
			taskId,
			name: `llm-${model}`,
			type: 'llm_call',
			startTime: Date.now(),
			attributes: { model },
		});

		if (onToken) {
			let text = '';
			for await (const event of this.llmClient.streamRequest({
				model,
				systemPrompt,
				messages: [{ role: 'user', content: userMessage }],
			})) {
				if (event.type === 'token') {
					text += event.token;
					onToken(event.token);
				} else if (event.type === 'error') {
					throw new Error(event.error);
				}
			}

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
	 * Stream a single chat turn against this agent's role prompt. Used by
	 * non-chat-participant surfaces (e.g. the WebView sidebar) that need the
	 * same behaviour as `handleChatRequest` but with a callback-based emit
	 * channel and an `AbortSignal`-friendly cancellation hook. Returns the
	 * full assistant text once the stream completes.
	 */
	async runChatTurn(
		userMessage: string,
		emit: (token: string) => void,
		cancellation: vscode.CancellationToken,
	): Promise<string> {
		const task = this.agentManager.createTask(this.displayName, userMessage);
		this.agentManager.startTask(task.id);

		const controller = new AbortController();
		const cancelSubscription = cancellation.onCancellationRequested(() => controller.abort());

		try {
			const systemPrompt = this.buildSystemPrompt(this.getRoleDescription());
			let fullText = '';
			for await (const event of this.llmClient.streamRequest({
				model: this.defaultModel,
				systemPrompt,
				messages: [{ role: 'user', content: userMessage }],
				signal: controller.signal,
				agentHandle: this.handle,
			})) {
				if (event.type === 'token') {
					emit(event.token);
					fullText += event.token;
				} else if (event.type === 'error') {
					throw new Error(event.error);
				}
			}
			this.agentManager.completeTask(task.id);
			return fullText;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.agentManager.failTask(task.id, message);
			throw err;
		} finally {
			cancelSubscription.dispose();
		}
	}

	/**
	 * Handle a VS Code chat request. Default implementation delegates to execute().
	 *
	 * `structuredEmit` is an optional out-of-band channel used by the WebView
	 * surface (via AgentBridge) to receive structured AgentEvents in addition
	 * to the markdown stream. Native chat-participant call sites omit it; the
	 * default implementation here ignores it because non-orchestrator agents
	 * don't currently emit structured plan/subtask events.
	 */
	async handleChatRequest(
		request: vscode.ChatRequest,
		_chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		_token: vscode.CancellationToken,
		_structuredEmit?: (event: AgentEvent) => void,
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
