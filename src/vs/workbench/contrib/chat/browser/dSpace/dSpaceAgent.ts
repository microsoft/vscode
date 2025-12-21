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
import {
	IDSpaceModelProviderService,
	IDSpaceMessage,
	IDSpaceTool,
	IDSpaceToolCall,
	DSpaceModelId,
} from './providers/modelProvider.js';

/**
 * Built-in DSpace AI Agent
 *
 * This agent is registered directly in the VS Code core and provides AI assistance
 * for the DSpace editor. It is provider-agnostic and delegates inference to the
 * active model provider (online or offline).
 *
 * Features:
 * - Streaming responses
 * - Tool calling (file operations)
 * - Provider switching (online/offline)
 * - Context management
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
				isDefault: true,
				isCore: true,
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
		@IFileService private readonly fileService: IFileService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@IDSpaceModelProviderService private readonly modelProviderService: IDSpaceModelProviderService
	) {
		super();
	}

	/**
	 * Main entry point when the agent receives a request
	 *
	 * The agent is provider-agnostic - it uses the active model provider
	 * for inference and handles tool execution locally.
	 */
	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken
	): Promise<IChatAgentResult> {
		// Update active provider based on user's model selection from the picker
		if (request.userSelectedModelId) {
			const selectedModelId = request.userSelectedModelId;
			if (selectedModelId === DSpaceModelId.Online || selectedModelId === DSpaceModelId.Offline) {
				this.modelProviderService.setActiveProvider(selectedModelId);
				this.logService.info(`[DSpaceAgent] User selected model: ${selectedModelId}`);
			}
		}

		const provider = this.modelProviderService.getActiveProvider();
		this.logService.info(`[DSpaceAgent] Received request, using provider: ${provider.name}`);

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

			// Convert messages to provider format
			const providerMessages = this.convertToProviderMessages(messages);

			// Stream from the active provider with tool execution loop
			await this.streamWithToolExecution(
				providerMessages,
				tools,
				progress,
				token,
				request.requestId,
				request.sessionResource
			);

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
	 * Convert internal messages to provider format
	 */
	private convertToProviderMessages(messages: Array<Record<string, unknown>>): IDSpaceMessage[] {
		return messages.map(msg => ({
			role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
			content: msg.content as string,
			tool_calls: msg.tool_calls as IDSpaceToolCall[] | undefined,
			tool_call_id: msg.tool_call_id as string | undefined,
			name: msg.name as string | undefined,
		}));
	}

	/**
	 * Get available tools in provider format
	 */
	private getAvailableTools(): IDSpaceTool[] {
		return [ReadFileTool, WriteFileTool, EditFileTool, ListFilesTool, DeleteFileTool, OpenFileTool]
			.filter((ToolClass) => ToolClass.getToolData().modelDescription)
			.map((ToolClass) => ({
				type: 'function' as const,
				function: {
					name: ToolClass.getToolData().id,
					description: ToolClass.getToolData().modelDescription!,
					parameters: ToolClass.getToolData().inputSchema || {
						type: 'object',
						properties: {},
						required: [],
					},
				},
			}));
	}

	/**
	 * Stream from provider and handle tool execution in a loop
	 */
	private async streamWithToolExecution(
		messages: IDSpaceMessage[],
		tools: IDSpaceTool[],
		progress: (parts: IChatProgress[]) => void,
		token: CancellationToken,
		requestId: string,
		sessionResource: URI
	): Promise<void> {
		const provider = this.modelProviderService.getActiveProvider();
		let currentMessages = [...messages];
		let iterationCount = 0;
		const maxIterations = 10; // Prevent infinite loops

		while (iterationCount < maxIterations && !token.isCancellationRequested) {
			iterationCount++;
			this.logService.info(`[DSpaceAgent] Iteration ${iterationCount}`);

			let pendingToolCalls: IDSpaceToolCall[] = [];

			// Stream from the provider
			for await (const chunk of provider.generateStream(currentMessages, tools, token)) {
				if (token.isCancellationRequested) {
					break;
				}

				switch (chunk.type) {
					case 'text':
						if (chunk.content) {
							progress([
								{
									kind: 'markdownContent',
									content: new MarkdownString(chunk.content),
								},
							]);
						}
						break;

					case 'tool_calls':
						if (chunk.toolCalls && chunk.toolCalls.length > 0) {
							pendingToolCalls = chunk.toolCalls;
							this.logService.info(`[DSpaceAgent] Received ${pendingToolCalls.length} tool call(s)`);
						}
						break;

					case 'done':
						this.logService.info(`[DSpaceAgent] Stream done, finish reason: ${chunk.finishReason}`);
						break;
				}
			}

			// If no tool calls, we're done
			if (pendingToolCalls.length === 0) {
				this.logService.info('[DSpaceAgent] No tool calls, finishing');
				break;
			}

			// Execute tool calls
			this.logService.info(`[DSpaceAgent] Executing ${pendingToolCalls.length} tool call(s)`);

			const toolResults: IDSpaceMessage[] = [];

			for (const toolCall of pendingToolCalls) {
				// Show progress
				const semanticMessage = this.getSemanticToolMessage(toolCall.function.name, toolCall.function.arguments);
				progress([
					{
						kind: 'progressMessage',
						content: new MarkdownString(semanticMessage),
					},
				]);

				// Execute the tool
				const result = await this.executeToolCall(
					toolCall.function.name,
					toolCall.function.arguments,
					requestId,
					sessionResource,
					token
				);

				toolResults.push({
					role: 'tool',
					content: result,
					tool_call_id: toolCall.id,
					name: toolCall.function.name,
				});
			}

			// Add assistant message with tool_calls and tool results to messages
			currentMessages = [
				...currentMessages,
				{
					role: 'assistant',
					content: '',
					tool_calls: pendingToolCalls,
				},
				...toolResults,
			];
		}

		if (iterationCount >= maxIterations) {
			this.logService.warn('[DSpaceAgent] Max iterations reached');
		}
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
		this.logService.info(`[DSpaceAgent] Executing tool: ${toolId}`);

		try {
			const args = JSON.parse(argumentsJson);

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
				for (const [fileUriStr, range] of selections.entries()) {
					const fileUri = URI.parse(fileUriStr);
					if (fileUri.fsPath === args.path || fileUri.fsPath.endsWith(args.path) || args.path.endsWith(fileUri.fsPath)) {
						fileRange = range;
						break;
					}
				}
			}

			// Create tool invocation context
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

			// Invoke the tool
			const toolResult = await this.languageModelToolsService.invokeTool(
				invocation,
				async (input: string) => {
					return Math.ceil(input.length / 4);
				},
				token
			);

			// Extract text content from the result
			const resultText = toolResult.content
				.map((part) => {
					if (part.kind === 'text') {
						return part.value;
					} else if (part.kind === 'promptTsx') {
						return JSON.stringify(part.value);
					} else if (part.kind === 'data') {
						return `[Binary data: ${part.value.data.byteLength} bytes, ${part.value.mimeType}]`;
					}
					return '';
				})
				.filter((text) => text.length > 0)
				.join('\n');

			if (toolResult.toolResultError) {
				return JSON.stringify({
					success: false,
					error: toolResult.toolResultError,
					content: resultText,
				});
			}

			return JSON.stringify({
				success: true,
				content: resultText || 'Tool executed successfully',
			});
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
	 * Get a user-friendly semantic message for a tool invocation
	 */
	private getSemanticToolMessage(toolName: string, toolArguments?: string): string {
		let filePath: string | undefined;
		if (toolArguments) {
			try {
				const args = JSON.parse(toolArguments);
				filePath = args.path;
				if (filePath) {
					const parts = filePath.replace(/\\/g, '/').split('/');
					filePath = parts[parts.length - 1];
				}
			} catch {
				// Ignore parsing errors
			}
		}

		const toolMessages: Record<string, string> = {
			'dSpace_readFile': filePath ? `Reading \`${filePath}\`...` : 'Reading file...',
			'dSpace_writeFile': filePath ? `Creating \`${filePath}\`...` : 'Creating file...',
			'dSpace_editFile': filePath ? `Editing \`${filePath}\`...` : 'Editing file...',
			'dSpace_listFiles': filePath ? `Listing files in \`${filePath}\`...` : 'Listing files...',
			'dSpace_deleteFile': filePath ? `Deleting \`${filePath}\`...` : 'Deleting file...',
			'dSpace_openFile': filePath ? `Opening \`${filePath}\`...` : 'Opening file...',
		};

		return toolMessages[toolName] || `Running \`${toolName}\`...`;
	}
}
