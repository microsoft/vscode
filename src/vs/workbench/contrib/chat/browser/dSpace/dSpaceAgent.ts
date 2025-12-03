/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../../services/extensions/common/extensions.js';
import {
	IChatAgentImplementation,
	IChatAgentRequest,
	IChatAgentResult,
	IChatAgentHistoryEntry,
	IChatAgentService,
	IChatAgentData,
} from '../../common/chatAgents.js';
import { IChatProgress } from '../../common/chatService.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IRequestService, asText } from '../../../../../platform/request/common/request.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import {
	ILanguageModelToolsService,
	IToolInvocation,
	IToolInvocationContext,
} from '../../common/languageModelToolsService.js';
import { ReadFileTool } from './tools/readFileTool.js';
import { WriteFileTool } from './tools/writeFileTool.js';
import { EditFileTool } from './tools/editFileTool.js';
import { ListFilesTool } from './tools/listFilesTool.js';
import { DeleteFileTool } from './tools/deleteFileTool.js';
import { OpenFileTool } from './tools/openFileTool.js';
import { buildMessages } from './utils/messageBuilder.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';

interface IDSpaceChatConfig {
	backendUrl?: string;
	apiKey?: string;
}

// Extend IProductService to include our custom DSpaceChat configuration

interface IProductServiceWithDSpace extends IProductService {
	dSpaceChat?: IDSpaceChatConfig;
}

/**
 * Built-in DSpace AI Agent
 *
 * This agent is registered directly in the VS Code core and provides AI assistance
 * for the DSpace editor. It reuses all VS Code infrastructure for:
 * - Streaming responses
 * - Tool calling
 * - File editing
 * - Context management
 *
 * The only custom part is the `invoke()` method that calls the DSpace AI backend.
 */
export class DSpaceAgent extends Disposable implements IChatAgentImplementation {
	private static readonly AGENT_ID = 'dspace.chat';
	private static readonly AGENT_NAME = 'chat';

	// Store file selections/ranges per request to pass to tools
	private fileSelections: Map<string, Map<string, IRange>> = new Map(); // requestId -> (fileUri -> range)

	/**
	 * Register the DSpace agent for all locations and modes
	 */
	static registerAgent(instantiationService: IInstantiationService): IDisposable {
		return instantiationService.invokeFunction((accessor) => {
			const chatAgentService = accessor.get(IChatAgentService);
			const disposables = new DisposableStore();

			// Register agent metadata
			const agentData: IChatAgentData = {
				id: DSpaceAgent.AGENT_ID,
				name: DSpaceAgent.AGENT_NAME,
				fullName: 'DSpace AI',
				description: 'AI assistant for the DSpace editor',
				extensionId: nullExtensionDescription.identifier,
				extensionVersion: '1.0.0',
				extensionDisplayName: 'DSpace',
				extensionPublisherId: 'DSpace',
				publisherDisplayName: 'DSpace',
				isDefault: true, // This makes it the default agent
				isCore: true, // This marks it as a core agent (no extension needed)
				metadata: {
					helpTextPrefix: new MarkdownString(
						localize('dSpaceAgent.helpText', "I'm your AI assistant for the DSpace editor.")
					),
					sampleRequest: localize('dSpaceAgent.sampleRequest', 'Help me write a function'),
				},
				slashCommands: [],
				locations: [
					ChatAgentLocation.Chat,
					ChatAgentLocation.Terminal,
					ChatAgentLocation.Notebook,
					ChatAgentLocation.EditorInline,
				],
				modes: [ChatModeKind.Ask, ChatModeKind.Agent, ChatModeKind.Edit],
				disambiguation: [],
			};

			disposables.add(chatAgentService.registerAgent(DSpaceAgent.AGENT_ID, agentData));

			// Register agent implementation
			const agent = disposables.add(instantiationService.createInstance(DSpaceAgent));
			disposables.add(chatAgentService.registerAgentImplementation(DSpaceAgent.AGENT_ID, agent));

			// Register file operation tools
			const toolsService = accessor.get(ILanguageModelToolsService);

			// Register all DSpace tools
			const toolClasses = [
				ReadFileTool,
				WriteFileTool,
				EditFileTool,
				ListFilesTool,
				DeleteFileTool,
				OpenFileTool,
			];

			for (const ToolClass of toolClasses) {
				const toolInstance = instantiationService.createInstance(ToolClass);
				disposables.add(toolsService.registerTool(ToolClass.getToolData(), toolInstance));
			}

			return disposables;
		});
	}

	constructor(
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService,
		@IFileService private readonly fileService: IFileService,
		@ILanguageModelToolsService
		private readonly languageModelToolsService: ILanguageModelToolsService,
		@IProductService private readonly productService: IProductService
	) {
		super();
	}

	/**
	 * Get the backend URL from product configuration or default
	 * Priority: product.overrides.json (local) > product.json (CI/CD) > default
	 * Note: This should return the base URL, as /v1/chat/completions is appended
	 */
	private getBackendUrl(): string {
		const config = (this.productService as IProductServiceWithDSpace).dSpaceChat;

		// Check if config exists and has a valid backendUrl (not a token placeholder)
		if (config?.backendUrl && config.backendUrl !== '__DSPACE_CHAT_BACKEND_URL__') {
			return config.backendUrl;
		}

		// Fall back to default (base URL only)
		return 'https://api.dspace.writefull.com';
	}

	/**
	 * Get the API key from product configuration
	 * Priority: product.overrides.json (local) > product.json (CI/CD)
	 * The API key must be configured and cannot be a token placeholder
	 */
	private getApiKey(): string {
		const config = (this.productService as IProductServiceWithDSpace).dSpaceChat;

		// Check if config exists and has a valid apiKey (not a token placeholder)
		if (config?.apiKey && config.apiKey !== '__DSPACE_CHAT_API_KEY__') {
			return config.apiKey;
		}

		// API key must be configured - throw error if missing
		throw new Error('DSpace Chat API key is not configured. Please set dSpaceChat.apiKey in product.json or product.overrides.json');
	}

	/**
	 * Main entry point when the agent receives a request
	 *
	 * VS Code automatically handles:
	 * - Progress reporting (streaming)
	 * - Tool invocation
	 * - File edits
	 * - Context gathering
	 *
	 * We call our backend which streams OpenAI responses with tool support
	 */
	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		this.logService.info('[DSpaceAgent] Received request:', request.message);

		const startTime = Date.now();

		try {
			// Build messages array from history + current request
			const { messages, selections } = await buildMessages(history, request, this.fileService, this.logService);

			// Store file selections for this request
			if (selections.size > 0) {
				this.fileSelections.set(request.requestId, selections);
			}

			// Define tools available to the AI
			const tools = this.getAvailableTools();

			// Call backend API with streaming
			await this.callBackend(messages, tools, progress, token, request.requestId, request.sessionResource);

			const totalElapsed = Date.now() - startTime;
			this.logService.info(`[DSpaceAgent] Request completed in ${totalElapsed}ms`);

			// Clean up file selections after request is complete
			this.fileSelections.delete(request.requestId);

			return {
				timings: {
					totalElapsed,
				},
			};
		} catch (error) {
			this.logService.error('[DSpaceAgent] Error processing request:', error);

			// Clean up file selections even on error
			this.fileSelections.delete(request.requestId);

			const errorMessage = error instanceof Error ? error.message : String(error);

			progress([
				{
					kind: 'markdownContent',
					content: new MarkdownString(
						localize('DSpaceAgent.error', 'Sorry, I encountered an error: {0}', errorMessage)
					),
				},
			]);

			return {
				errorDetails: {
					message: errorMessage,
				},
			};
		}
	}


	/**
	 * Get available tools - only our own DSpace tools, not VS Code internal tools
	 */
	private getAvailableTools(): Array<{
		type: string;
		function: { name: string; description: string; parameters: unknown };
	}> {
		return [ReadFileTool, WriteFileTool, EditFileTool, ListFilesTool, DeleteFileTool, OpenFileTool]
			.filter((ToolClass) => ToolClass.getToolData().modelDescription)
			.map((ToolClass) => ({
				type: 'function',
				function: {
					name: ToolClass.getToolData().id,
					description: ToolClass.getToolData().modelDescription,
					parameters: ToolClass.getToolData().inputSchema || {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			}));
	}

	/**
	 * Call the backend API with streaming support
	 */
	private async callBackend(
		messages: Array<Record<string, unknown>>,
		tools: Array<{
			type: string;
			function: { name: string; description: string; parameters: unknown };
		}>,
		progress: (parts: IChatProgress[]) => void,
		token: CancellationToken,
		requestId: string,
		sessionResource: URI
	): Promise<void> {
		// Only send messages, tools, and tool_choice
		// Model configuration (model, temperature, max_tokens, stream) is handled by the backend
		const requestBody = {
			messages,
			tools,
		};

		const backendUrl = this.getBackendUrl();
		const apiKey = this.getApiKey();

		try {
			const response = await this.requestService.request(
				{
					type: 'POST',
					url: `${backendUrl}/v1/chat/completions`,
					data: JSON.stringify(requestBody),
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': apiKey,
					},
					timeout: 120000, // 2 minutes timeout
				},
				token
			);

			// Handle streaming response
			if (response.res.statusCode !== 200) {
				const errorText = await asText(response);
				throw new Error(`Backend returned ${response.res.statusCode}: ${errorText}`);
			}

			// Clear tool calls buffer for this request
			this.toolCallsBuffer.clear();
			let shouldExecuteTools = false;
			let lastFinishReason: string | undefined;

			// Process SSE stream
			await new Promise<void>((resolve, reject) => {
				const disposables = new DisposableStore();
				let buffer = '';
				const decoder = new TextDecoder();
				let isResolved = false;

				// Cleanup function to dispose all resources
				const cleanup = () => {
					if (!isResolved) {
						isResolved = true;
						disposables.dispose();
					}
				};

				// Ensure cleanup happens on both resolve and reject
				const wrappedResolve = () => {
					if (!isResolved) {
						cleanup();
						resolve();
					}
				};
				const wrappedReject = (error: unknown) => {
					if (!isResolved) {
						cleanup();
						reject(error);
					}
				};

				// Handle cancellation - add this FIRST before setting up stream handlers
				// to avoid race conditions
				const cancellationDisposable = token.onCancellationRequested(() => {
					wrappedReject(new CancellationError());
				});
				disposables.add(cancellationDisposable);

				response.stream.on('data', (chunk) => {
					if (token.isCancellationRequested) {
						wrappedReject(new CancellationError());
						return;
					}

					buffer += decoder.decode(chunk.buffer, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6);

							if (data === '[DONE]') {
								continue;
							}

							try {
								const parsed = JSON.parse(data);
								const result = this.handleStreamChunk(parsed, progress);
								if (result.shouldExecuteTools) {
									shouldExecuteTools = true;
								}
								if (result.finishReason) {
									lastFinishReason = result.finishReason;
									this.logService.info(
										`[DSpaceAgent] Finish reason: ${lastFinishReason}, tool calls in buffer: ${this.toolCallsBuffer.size}`
									);
								}
							} catch (e) {
								this.logService.warn('[DSpaceAgent] Failed to parse SSE chunk:', e);
							}
						}
					}
				});

				response.stream.on('end', async () => {
					this.logService.info(
						`[DSpaceAgent] Stream ended. Finish reason: ${lastFinishReason}, tool calls in buffer: ${this.toolCallsBuffer.size}`
					);

					// Execute tools if:
					// 1. finish_reason is "tool_calls", OR
					// 2. We have tool calls in the buffer (they might have been streamed but finish_reason wasn't set correctly)
					const hasToolCalls = this.toolCallsBuffer.size > 0;
					if (shouldExecuteTools || (hasToolCalls && lastFinishReason === 'tool_calls')) {
						this.logService.info(`[DSpaceAgent] Executing ${this.toolCallsBuffer.size} tool call(s)`);
						try {
							await this.executeToolCallsAndContinue(
								messages,
								tools,
								progress,
								token,
								requestId,
								sessionResource
							);
						} catch (error) {
							this.logService.error('[DSpaceAgent] Tool execution failed:', error);
							wrappedReject(error);
							return;
						}
					} else if (hasToolCalls) {
						this.logService.warn(
							`[DSpaceAgent] Tool calls detected in buffer but finish_reason was "${lastFinishReason}". Executing anyway.`
						);
						try {
							await this.executeToolCallsAndContinue(
								messages,
								tools,
								progress,
								token,
								requestId,
								sessionResource
							);
						} catch (error) {
							this.logService.error('[DSpaceAgent] Tool execution failed:', error);
							wrappedReject(error);
							return;
						}
					}

					wrappedResolve();
				});

				response.stream.on('error', (error) => {
					this.logService.error('[DSpaceAgent] Stream error:', error);
					wrappedReject(error);
				});
			});
		} catch (error) {
			this.logService.error('[DSpaceAgent] Backend call failed:', error);
			throw error;
		}
	}

	/**
	 * Execute tool calls and continue the conversation
	 */
	private async executeToolCallsAndContinue(
		originalMessages: Array<Record<string, unknown>>,
		tools: Array<{
			type: string;
			function: { name: string; description: string; parameters: unknown };
		}>,
		progress: (parts: IChatProgress[]) => void,
		token: CancellationToken,
		requestId: string,
		sessionResource: URI
	): Promise<void> {
		this.logService.info(`[DSpaceAgent] Executing ${this.toolCallsBuffer.size} tool call(s)`);

		// Convert buffer to array and add assistant message with tool_calls
		const toolCalls: Array<{
			id: string;
			type: string;
			function: { name: string; arguments: string };
		}> = [];
		const toolResults: Array<{
			role: string;
			content: string;
			tool_call_id: string;
			name: string;
		}> = [];

		for (const [index, toolCall] of this.toolCallsBuffer.entries()) {
			if (!toolCall.id || !toolCall.name || !toolCall.arguments) {
				this.logService.warn(`[DSpaceAgent] Skipping incomplete tool call at index ${index}`);
				continue;
			}

			toolCalls.push({
				id: toolCall.id,
				type: 'function',
				function: {
					name: toolCall.name,
					arguments: toolCall.arguments,
				},
			});

			// Show progress
			progress([
				{
					kind: 'progressMessage',
					content: new MarkdownString(`Executing: \`${toolCall.name}\``),
				},
			]);

			// Execute the tool using VS Code's tool service
			const result = await this.executeToolCall(toolCall.name, toolCall.arguments, requestId, sessionResource, token);

			toolResults.push({
				role: 'tool',
				content: result,
				tool_call_id: toolCall.id,
				name: toolCall.name,
			});
		}

		// Build new messages array for continuation
		const continuationMessages: Array<Record<string, unknown>> = [
			...originalMessages,
			{
				role: 'assistant',
				content: '', // Empty content when using tool_calls
				tool_calls: toolCalls,
			},
			...toolResults,
		];

		// Clear buffer before next call
		this.toolCallsBuffer.clear();

		// Make another request with tool results
		this.logService.info('[DSpaceAgent] Continuing conversation with tool results');
		await this.callBackend(continuationMessages, tools, progress, token, requestId, sessionResource);
	}

	/**
	 * Execute a single tool call using VS Code's registered tool implementation
	 */
	private async executeToolCall(
		toolId: string,
		argumentsJson: string,
		requestId: string,
		sessionResource: URI,
		token: CancellationToken
	): Promise<string> {
		this.logService.info(`[DSpaceAgent] Executing tool: ${toolId} with arguments: ${argumentsJson}`);

		try {
			const args = JSON.parse(argumentsJson);
			this.logService.info(`[DSpaceAgent] Parsed arguments:`, args);

			// Check if tool exists
			const toolData = this.languageModelToolsService.getTool(toolId);
			if (!toolData) {
				this.logService.warn(`[DSpaceAgent] Tool not found: ${toolId}`);
				return JSON.stringify({
					success: false,
					error: `Tool not found: ${toolId}`,
				});
			}

			// Get file selection for this request if available
			const selections = this.fileSelections.get(requestId);
			let fileRange: IRange | undefined;
			if (selections && args.path) {
				// Try to find matching file URI
				for (const [fileUriStr, range] of selections.entries()) {
					const fileUri = URI.parse(fileUriStr);
					// Check if the path matches (could be absolute or relative)
					if (fileUri.fsPath === args.path || fileUri.fsPath.endsWith(args.path) || args.path.endsWith(fileUri.fsPath)) {
						fileRange = range;
						this.logService.info(`[DSpaceAgent] Found selection for file ${args.path}: lines ${range.startLineNumber}-${range.endLineNumber}`);
						break;
					}
				}
			}

			// Create tool invocation context with selection info
			// Extend context with fileRange if available (using intersection type)
			const context: IToolInvocationContext & { fileRange?: IRange } = {
				sessionResource: sessionResource,
				sessionId: sessionResource.toString(),
			};
			if (fileRange) {
				context.fileRange = fileRange;
			}

			// Create tool invocation
			const invocation: IToolInvocation = {
				callId: `DSpace-${Date.now()}-${Math.random()}`,
				toolId: toolId,
				parameters: args,
				context: context,
				chatRequestId: requestId,
			};

			// Invoke the tool using VS Code's tool service
			// This will use the registered implementation (e.g., EditTool, etc.)
			const toolResult = await this.languageModelToolsService.invokeTool(
				invocation,
				async (input: string, token: CancellationToken) => {
					// Simple token counting - can be improved
					return Math.ceil(input.length / 4);
				},
				token
			);

			// Convert tool result to JSON string for the backend
			// Extract text content from the result
			const resultText = toolResult.content
				.map((part) => {
					if (part.kind === 'text') {
						return part.value;
					} else if (part.kind === 'promptTsx') {
						// For promptTsx, we might need to stringify it
						return JSON.stringify(part.value);
					} else if (part.kind === 'data') {
						return `[Binary data: ${part.value.data.byteLength} bytes, ${part.value.mimeType}]`;
					}
					return '';
				})
				.filter((text) => text.length > 0)
				.join('\n');

			// If there's an error, include it
			if (toolResult.toolResultError) {
				return JSON.stringify({
					success: false,
					error: toolResult.toolResultError,
					content: resultText,
				});
			}

			// Return success result
			const result = JSON.stringify({
				success: true,
				content: resultText || 'Tool executed successfully',
			});

			this.logService.info(`[DSpaceAgent] Tool ${toolId} result: ${result.substring(0, 200)}...`);
			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logService.error(`[DSpaceAgent] Tool ${toolId} failed:`, error);
			return JSON.stringify({
				success: false,
				error: errorMessage,
			});
		}
	}

	/**
	 * Handle individual stream chunks and accumulate tool calls
	 */
	private toolCallsBuffer: Map<number, { id?: string; name?: string; arguments?: string }> = new Map();

	private handleStreamChunk(
		chunk: {
			choices?: Array<{
				delta?: {
					content?: string;
					tool_calls?: Array<{
						index?: number;
						id?: string;
						function?: { name?: string; arguments?: string };
					}>;
				};
				finish_reason?: string;
			}>;
		},
		progress: (parts: IChatProgress[]) => void
	): { shouldExecuteTools: boolean; finishReason?: string } {
		const choice = chunk.choices?.[0];
		if (!choice) {
			return { shouldExecuteTools: false };
		}

		const delta = choice.delta;

		// Handle finish_reason even if there's no delta (final chunk)
		if (!delta) {
			const finishReason = choice.finish_reason;
			const shouldExecute = finishReason === 'tool_calls' && this.toolCallsBuffer.size > 0;
			if (finishReason) {
				this.logService.info(
					`[DSpaceAgent] Chunk without delta, finish_reason: ${finishReason}, tool calls: ${this.toolCallsBuffer.size}`
				);
			}
			return { shouldExecuteTools: shouldExecute, finishReason };
		}

		// Handle text content
		if (delta.content) {
			progress([
				{
					kind: 'markdownContent',
					content: new MarkdownString(delta.content),
				},
			]);
		}

		// Accumulate tool calls (streaming sends them in fragments)
		if (delta.tool_calls) {
			this.logService.info(`[DSpaceAgent] Received tool_calls delta with ${delta.tool_calls.length} call(s)`);
			for (const toolCall of delta.tool_calls) {
				const index = toolCall.index ?? 0;

				if (!this.toolCallsBuffer.has(index)) {
					this.toolCallsBuffer.set(index, {
						id: toolCall.id,
						name: toolCall.function?.name,
						arguments: toolCall.function?.arguments || '',
					});
					this.logService.info(`[DSpaceAgent] Started tool call ${index}: ${toolCall.function?.name}`);
				} else {
					const existing = this.toolCallsBuffer.get(index)!;
					if (toolCall.id) {
						existing.id = toolCall.id;
					}
					if (toolCall.function?.name) {
						existing.name = toolCall.function.name;
					}
					if (toolCall.function?.arguments) {
						existing.arguments += toolCall.function.arguments;
					}
				}
			}
		}

		// If finish_reason is "tool_calls", we need to execute them
		const shouldExecuteTools = choice.finish_reason === 'tool_calls' && this.toolCallsBuffer.size > 0;

		return { shouldExecuteTools, finishReason: choice.finish_reason };
	}
}
