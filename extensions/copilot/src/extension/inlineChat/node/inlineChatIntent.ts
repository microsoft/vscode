/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import { BudgetExceededError } from '@vscode/prompt-tsx/dist/base/materialized';
import type * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { CanceledResult, ChatFetchResponseType, ChatLocation, ChatResponse, getErrorDetailsFromChatFetchError } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEditSurvivalTrackerService } from '../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { Prediction } from '../../../platform/networking/common/fetch';
import { IChatEndpoint, IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { IParserService } from '../../../platform/parser/node/parserService';
import { getWasmLanguage } from '../../../platform/parser/node/treeSitterLanguages';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { toErrorMessage } from '../../../util/common/errorMessage';
import { isNonEmptyArray } from '../../../util/vs/base/common/arrays';
import { AsyncIterableSource, timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { ResourceSet } from '../../../util/vs/base/common/map';
import { clamp } from '../../../util/vs/base/common/numbers';
import { isFalsyOrWhitespace } from '../../../util/vs/base/common/strings';
import { assertType, isDefined } from '../../../util/vs/base/common/types';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditorData, ChatResponseTextEditPart, LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { Intent } from '../../common/constants';
import { getAgentTools } from '../../intents/node/agentIntent';
import { IIntentService } from '../../intents/node/intentService';
import { SelectionSplitKind, SummarizedDocumentData, SummarizedDocumentSplitMetadata } from '../../intents/node/testIntent/summarizedDocumentWithSelection';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { Conversation, Turn } from '../../prompt/common/conversation';
import { IToolCall } from '../../prompt/common/intents';
import { ToolCallRound } from '../../prompt/common/toolCallRound';
import { ChatTelemetryBuilder, InlineChatTelemetry } from '../../prompt/node/chatParticipantTelemetry';
import { DefaultIntentRequestHandler } from '../../prompt/node/defaultIntentRequestHandler';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IIntent, NoopReplyInterpreter, ReplyInterpreterMetaData, TelemetryData } from '../../prompt/node/intents';
import { ResponseProcessorContext } from '../../prompt/node/responseProcessorContext';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { ICompletedToolCallRound, InlineChat2Prompt, LARGE_FILE_LINE_THRESHOLD } from '../../prompts/node/inline/inlineChat2Prompt';
import { InlineChatEditCodePrompt } from '../../prompts/node/inline/inlineChatEditCodePrompt';
import { ToolName } from '../../tools/common/toolNames';
import { normalizeToolSchema } from '../../tools/common/toolSchemaNormalizer';
import { CopilotToolMode } from '../../tools/common/toolsRegistry';
import { isToolValidationError, isValidatedToolInput, IToolsService } from '../../tools/common/toolsService';
import { InlineChatProgressMessages } from './progressMessages';
import { CopilotInteractiveEditorResponse, InteractionOutcome, InteractionOutcomeComputer } from './promptCraftingTypes';


const INLINE_CHAT_EXIT_TOOL_NAME = 'inline_chat_exit';

interface IInlineChatEditResult {
	telemetry: InlineChatTelemetry;
	lastResponse: ChatResponse;
	needsExitTool: boolean;
	errorMessage?: string;
}

interface IInlineChatEditStrategy {
	executeEdit(endpoint: IChatEndpoint, conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext, chatTelemetry: ChatTelemetryBuilder): Promise<IInlineChatEditResult>;
}

export class InlineChatIntent implements IIntent {

	static readonly ID = Intent.InlineChat;

	static readonly _EDIT_TOOLS = new Set<string>([
		ToolName.ApplyPatch,
		ToolName.EditFile,
		ToolName.ReplaceString,
		ToolName.MultiReplaceString,
	]);

	readonly id = InlineChatIntent.ID;

	readonly locations = [ChatLocation.Editor];

	readonly description: string = '';

	private readonly _progressMessages: InlineChatProgressMessages;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IToolsService private readonly _toolsService: IToolsService,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IEditSurvivalTrackerService private readonly _editSurvivalTrackerService: IEditSurvivalTrackerService,
		@IIntentService private readonly _intentService: IIntentService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IParserService private readonly _parserService: IParserService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
	) {
		this._progressMessages = this._instantiationService.createInstance(InlineChatProgressMessages);
	}

	async handleRequest(conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext | undefined, _agentName: string, _location: ChatLocation, chatTelemetry: ChatTelemetryBuilder): Promise<vscode.ChatResult> {

		assertType(request.location2 instanceof ChatRequestEditorData);
		assertType(documentContext);

		if (await this._ignoreService.isCopilotIgnored(request.location2.document.uri, token)) {
			return {
				errorDetails: {
					message: l10n.t('inlineChat.ignored', 'Copilot is disabled for this file.'),
				}
			};
		}

		const endpoint = await this._endpointProvider.getChatEndpoint(request);

		if (!endpoint.supportsToolCalls) {
			return {
				errorDetails: {
					message: l10n.t('inlineChat.model', '{0} cannot be used for inline chat', endpoint.name),
				}
			};
		}

		const enableV2 = this._configurationService.getNonExtensionConfig<boolean>('inlineChat.enableV2');

		if (!enableV2) {
			// OLD world
			return this._handleRequestWithOldWorld(conversation, request, stream, token, documentContext, chatTelemetry);
		}

		return this._handleRequestWithNewWorld(endpoint, conversation, request, stream, token, documentContext, chatTelemetry);
	}

	// --- OLD world

	private async _handleRequestWithOldWorld(conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext, chatTelemetry: ChatTelemetryBuilder): Promise<vscode.ChatResult> {
		// OLD world
		let didEmitEdits = false;
		stream = ChatResponseStreamImpl.spy(stream, part => {
			if (part instanceof ChatResponseTextEditPart) {
				didEmitEdits = true;
			}
		});

		const intent = await this._selectIntent(conversation.turns, documentContext, request);

		if (isFalsyOrWhitespace(request.prompt)) {
			request = { ...request, prompt: intent.description };
		}

		const handler = this._instantiationService.createInstance(DefaultIntentRequestHandler, intent, conversation, request, stream, token, documentContext, ChatLocation.Editor, chatTelemetry, undefined, undefined);
		const result = await handler.getResult();

		if (!didEmitEdits && !result.errorDetails) {
			// BAILOUT: when no edits were emitted, invoke the exit tool manually
			await this._toolsService.invokeTool(INLINE_CHAT_EXIT_TOOL_NAME, { toolInvocationToken: request.toolInvocationToken, input: undefined }, token);
		}
		return result;
	}

	private async _selectIntent(history: readonly Turn[], documentContext: IDocumentContext, request: vscode.ChatRequest): Promise<IIntent> {

		if (request.command) {
			const result = this._intentService.getIntent(request.command, ChatLocation.Editor);
			if (result) {
				return result;
			}
		}

		let preferredIntent: Intent | undefined;
		if (documentContext && request.attempt === 0 && history.length === 1) {
			if (documentContext.selection.isEmpty && documentContext.document.lineAt(documentContext.selection.start.line).text.trim() === '') {
				preferredIntent = Intent.Generate;
			} else if (!documentContext.selection.isEmpty && documentContext.selection.start.line !== documentContext.selection.end.line) {
				preferredIntent = Intent.Edit;
			}
		}
		if (preferredIntent) {
			return this._intentService.getIntent(preferredIntent, ChatLocation.Editor) ?? this._intentService.unknownIntent;
		}
		return this._intentService.unknownIntent;
	}

	// --- NEW world

	private async _handleRequestWithNewWorld(endpoint: IChatEndpoint, conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext, chatTelemetry: ChatTelemetryBuilder): Promise<vscode.ChatResult> {
		assertType(request.location2 instanceof ChatRequestEditorData);
		assertType(documentContext);

		const editSurvivalTracker = this._editSurvivalTrackerService.initialize(request.location2.document);

		stream = ChatResponseStreamImpl.spy(stream, part => {
			if (part instanceof ChatResponseTextEditPart) {
				editSurvivalTracker.collectAIEdits(part.edits);
			}
		});

		// Don't use edit tools when the selection seems good enough
		let useToolsForEdit = true;
		const selectionRatioThreshold = clamp(this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.InlineChatSelectionRatioThreshold, this._experimentationService), 0, 1);
		if (!documentContext.selection.isEmpty
			&& selectionRatioThreshold > 0
			&& getWasmLanguage(documentContext.document.languageId)
		) {
			const data = await SummarizedDocumentData.create(this._parserService, documentContext.document, documentContext.fileIndentInfo, documentContext.selection, SelectionSplitKind.Adjusted);
			const { adjusted, original } = data.offsetSelections;
			const ratio = original.length / adjusted.length;
			if (ratio <= 1 && ratio >= selectionRatioThreshold) {
				request = { ...request, command: Intent.Edit };
				useToolsForEdit = false;
			}
		}

		// Start generating contextual message immediately
		const contextualMessagePromise = this._progressMessages.getContextualMessage(request.prompt, documentContext, token);

		// Show progress message after ~1 second delay (unless request completes first)
		timeout(1000, token).then(async () => {
			const message = await contextualMessagePromise;
			stream.progress(message);
		});

		let result: IInlineChatEditResult;
		try {
			const strategy: IInlineChatEditStrategy = useToolsForEdit
				? this._instantiationService.createInstance(InlineChatEditToolsStrategy, this)
				: this._instantiationService.createInstance(InlineChatEditHeuristicStrategy, this);

			result = await strategy.executeEdit(endpoint, conversation, request, stream, token, documentContext, chatTelemetry);
		} catch (err) {
			this._logService.error(err, 'InlineChatIntent: prompt rendering failed');
			return {
				errorDetails: {
					message: err instanceof BudgetExceededError
						? l10n.t('Sorry, this document is too large for inline chat.')
						: toErrorMessage(err),
				}
			};
		}

		if (token.isCancellationRequested) {
			return CanceledResult;
		}

		if (result.needsExitTool) {
			this._logService.warn('[InlineChat], BAIL_OUT because of needsExitTool');
			// BAILOUT: when no edits were emitted, invoke the exit tool manually
			await this._toolsService.invokeTool(INLINE_CHAT_EXIT_TOOL_NAME, {
				toolInvocationToken: request.toolInvocationToken, input: {
					response: result.lastResponse.type === ChatFetchResponseType.Success ? result.lastResponse.value : undefined,
				}
			}, token);
		}


		// store metadata for telemetry sending
		const turn = conversation.getLatestTurn();
		turn.setMetadata(new CopilotInteractiveEditorResponse(
			undefined,
			{ ...documentContext, query: request.prompt, intent: this },
			result.telemetry.telemetryMessageId, result.telemetry, editSurvivalTracker
		));

		if (result.errorMessage) {
			return {
				errorDetails: {
					message: result.errorMessage,
				}
			};
		}

		if (result.lastResponse.type !== ChatFetchResponseType.Success) {
			const outageStatus = await this._octoKitService.getGitHubOutageStatus();
			const details = getErrorDetailsFromChatFetchError(result.lastResponse, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
			return {
				errorDetails: {
					message: details.message,
					responseIsFiltered: details.responseIsFiltered
				}
			};
		}

		return {};
	}

	invoke(): Promise<never> {
		throw new TypeError();
	}
}

class InlineChatEditToolsStrategy implements IInlineChatEditStrategy {

	readonly id = InlineChatIntent.ID;
	readonly locations = [ChatLocation.Editor];
	readonly description = '';

	constructor(
		private readonly _intent: InlineChatIntent,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IToolsService private readonly _toolsService: IToolsService,
	) { }

	async executeEdit(endpoint: IChatEndpoint, conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext, chatTelemetry: ChatTelemetryBuilder): Promise<IInlineChatEditResult> {
		assertType(request.location2 instanceof ChatRequestEditorData);
		assertType(documentContext);

		const isLargeFile = documentContext.document.lineCount > LARGE_FILE_LINE_THRESHOLD;
		const availableTools = await this._getAvailableTools(request, isLargeFile);

		const previousRounds: ICompletedToolCallRound[] = [];
		let failedEditCount = 0;
		const toolCallRounds: ToolCallRound[] = [];
		let readOnlyRounds = 0;
		let telemetry: InlineChatTelemetry;
		let lastResponse: ChatResponse;
		let lastInteractionOutcome: InteractionOutcome;

		while (true) {

			const renderer = PromptRenderer.create(this._instantiationService, endpoint, InlineChat2Prompt, {
				request,
				previousRounds,
				hasFailedEdits: failedEditCount > 0,
				snapshotAtRequest: documentContext.document,
				data: request.location2,
				exitToolName: INLINE_CHAT_EXIT_TOOL_NAME,
				isLargeFile,
				readToolName: isLargeFile ? ToolName.ReadFile : undefined,
			});

			const renderResult = await renderer.render(undefined, token, { trace: true });

			const toolTokenCount = availableTools.length > 0 ? await endpoint.acquireTokenizer().countToolTokens(availableTools) : 0;
			telemetry = chatTelemetry.makeRequest(this._intent, ChatLocation.Editor, conversation, renderResult.messages, renderResult.tokenCount, renderResult.references, endpoint, [], availableTools.length, toolTokenCount);

			stream = ChatResponseStreamImpl.spy(stream, part => {
				if (part instanceof ChatResponseTextEditPart) {
					telemetry.markEmittedEdits(part.uri, part.edits);
				}
			});


			const result = await this._makeRequestAndRunTools(endpoint, request, stream, renderResult.messages, availableTools, telemetry, token);

			lastInteractionOutcome = new InteractionOutcome(telemetry.editCount > 0 ? 'inlineEdit' : 'none', []);
			lastResponse = result.fetchResult;

			// telemetry
			{
				const responseText = lastResponse.type === ChatFetchResponseType.Success ? lastResponse.value : '';
				telemetry.sendTelemetry(
					lastResponse.requestId, lastResponse.type, responseText,
					lastInteractionOutcome,
					result.toolCalls
				);

				toolCallRounds.push(ToolCallRound.create({
					response: responseText,
					toolCalls: result.toolCalls,
					toolInputRetry: failedEditCount
				}));
			}

			if (result.toolCalls.length === 0) {
				// BAILOUT: when no tools have been used
				break;
			}

			// Build a completed round from all tool calls in their original order
			const roundCalls: [IToolCall, vscode.ExtendedLanguageModelToolResult][] = [];
			for (const toolCall of result.toolCalls) {
				const toolResult = result.allCallResults.get(toolCall.id);
				if (toolResult) {
					roundCalls.push([toolCall, toolResult]);
				}
			}
			previousRounds.push({ calls: roundCalls });

			// Check if this round was read-only (only read_file calls, no edit tool calls)
			const hasEditToolCalls = result.toolCalls.some(tc => tc.name !== ToolName.ReadFile);

			if (!hasEditToolCalls) {
				// Read-only round: the model used read_file to gather more context.
				// Continue the loop so it can make edits with the new info.
				readOnlyRounds++;
				if (readOnlyRounds > 9) {
					this._logService.warn('Aborting inline chat edit: too many read-only rounds');
					break;
				}
				continue;
			}

			if (result.failedEdits.length === 0 || token.isCancellationRequested) {
				// DONE
				break;
			}

			failedEditCount += result.failedEdits.length;
			if (failedEditCount > 5) {
				// TOO MANY FAILED ATTEMPTS
				this._logService.error(`Aborting inline chat edit: too many failed edit attempts`);
				break;
			}
		}

		telemetry.sendToolCallingTelemetry(toolCallRounds, availableTools, token.isCancellationRequested ? 'cancelled' : lastResponse.type);

		const needsExitTool = lastResponse.type === ChatFetchResponseType.Success
			&& (toolCallRounds.length === 0 || (toolCallRounds.length > 0 && toolCallRounds[toolCallRounds.length - 1].toolCalls.length === 0));

		if (!needsExitTool && failedEditCount > 0 && telemetry.editCount === 0 && lastResponse.type === ChatFetchResponseType.Success) {
			return {
				lastResponse,
				telemetry,
				needsExitTool: false,
				errorMessage: l10n.t('Failed to edit the file. The requested change could not be applied.'),
			};
		}

		return { lastResponse, telemetry, needsExitTool };
	}

	private async _makeRequestAndRunTools(endpoint: IChatEndpoint, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, messages: Raw.ChatMessage[], inlineChatTools: vscode.LanguageModelToolInformation[], telemetry: InlineChatTelemetry, token: CancellationToken) {

		const requestOptions: IMakeChatRequestOptions['requestOptions'] = {
			tool_choice: 'auto',
			tools: normalizeToolSchema(
				endpoint.family,
				inlineChatTools.map(tool => ({
					type: 'function',
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : undefined
					},
				})),
				(tool, rule) => {
					this._logService.warn(`Tool ${tool} failed validation: ${rule}`);
				},
			)
		};

		const toolCalls: IToolCall[] = [];
		const failedEdits: [IToolCall, vscode.ExtendedLanguageModelToolResult][] = [];
		const allCallResults = new Map<string, vscode.ExtendedLanguageModelToolResult>();

		const toolExecutions: Promise<unknown>[] = [];

		const fetchResult = await endpoint.makeChatRequest2({
			debugName: 'InlineChat2Intent',
			messages,
			userInitiatedRequest: true,
			location: ChatLocation.Editor,
			requestOptions,
			telemetryProperties: {
				messageId: telemetry.telemetryMessageId,
				conversationId: telemetry.sessionId,
				messageSource: this._intent.id
			},
			finishedCb: async (_text, _index, delta) => {

				telemetry.markReceivedToken();

				if (!isNonEmptyArray(delta.copilotToolCalls)) {
					return undefined;
				}

				const exitToolCall = delta.copilotToolCalls.find(candidate => candidate.name === INLINE_CHAT_EXIT_TOOL_NAME);
				const copilotToolCalls = exitToolCall ? [exitToolCall] : delta.copilotToolCalls;

				for (const toolCall of copilotToolCalls) {

					toolCalls.push(toolCall);

					const validationResult = this._toolsService.validateToolInput(toolCall.name, toolCall.arguments);

					if (isToolValidationError(validationResult)) {
						this._logService.warn(`Tool ${toolCall.name} invocation failed validation: ${validationResult}`);
						const errorResult = new LanguageModelToolResult([new LanguageModelTextPart(validationResult.error)]);
						allCallResults.set(toolCall.id, errorResult);
						failedEdits.push([toolCall, errorResult]);
						continue;
					}

					toolExecutions.push((async () => {
						try {
							let input = isValidatedToolInput(validationResult)
								? validationResult.inputObj
								: JSON.parse(toolCall.arguments);

							const copilotTool = this._toolsService.getCopilotTool(toolCall.name as ToolName);
							if (copilotTool?.resolveInput) {
								input = await copilotTool.resolveInput(input, {
									request,
									stream,
									query: request.prompt,
									chatVariables: new ChatVariablesCollection([...request.references]),
									history: [],
									allowedEditUris: request.location2 instanceof ChatRequestEditorData ? new ResourceSet([request.location2.document.uri]) : undefined,
								}, CopilotToolMode.FullContext);
							}

							const result = await this._toolsService.invokeToolWithEndpoint(toolCall.name, {
								input,
								toolInvocationToken: request.toolInvocationToken,
								// Split on `__vscode` so it's the chat stream id
								// TODO @lramos15 - This is a gross hack
								chatStreamToolCallId: toolCall.id.split('__vscode')[0],
							}, endpoint, token) as vscode.ExtendedLanguageModelToolResult;

							allCallResults.set(toolCall.id, result);

							if (result.hasError) {
								failedEdits.push([toolCall, result]);
								stream.progress(l10n.t('Looking not yet good, trying again...'));
							}

							this._logService.trace(`Tool ${toolCall.name} invocation result: ${JSON.stringify(result)}`);

						} catch (err) {
							this._logService.error(err, `Tool ${toolCall.name} invocation failed`);
							const errorResult = new LanguageModelToolResult([new LanguageModelTextPart(toErrorMessage(err))]);
							allCallResults.set(toolCall.id, errorResult);
							failedEdits.push([toolCall, errorResult]);
						}
					})());
				}

				return undefined;
			}
		}, token);

		await Promise.allSettled(toolExecutions);

		return { fetchResult, toolCalls, failedEdits, allCallResults };
	}

	private async _getAvailableTools(request: vscode.ChatRequest, isLargeFile: boolean): Promise<vscode.LanguageModelToolInformation[]> {
		assertType(request.location2 instanceof ChatRequestEditorData);

		// const exitTool = this._toolsService.getTool(INLINE_CHAT_EXIT_TOOL_NAME);
		// if (!exitTool) {
		// 	this._logService.error('MISSING inline chat exit tool');
		// 	throw new Error('Missing inline chat exit tool');
		// }

		const enabledTools = new Set(InlineChatIntent._EDIT_TOOLS);
		if (!request.location2.selection.isEmpty) {
			// only used the multi-replace when there is no selection
			enabledTools.delete(ToolName.MultiReplaceString);
		}

		// ALWAYS enable editing tools (only) and ignore what the client did send
		const fakeRequest: vscode.ChatRequest = {
			...request,
			tools: new Map(
				Array.from(enabledTools)
					.map(t => this._toolsService.getTool(t))
					.filter(isDefined)
					.map(tool => [tool, true])
			),
		};

		const agentTools = await this._instantiationService.invokeFunction(getAgentTools, fakeRequest);
		let editTools = agentTools.filter(tool => enabledTools.has(tool.name));

		if (editTools.length === 0) {
			this._logService.error('MISSING inline chat edit tools');
			throw new Error('MISSING inline chat edit tools');
		}

		// EditFile is a poor performer, prefer other edit tools when available
		if (editTools.length > 1) {
			editTools = editTools.filter(tool => tool.name !== ToolName.EditFile);
		}
		// const result = [exitTool, ...editTools];
		const result = [...editTools];

		// For large files, also include the read tool so the model can read more of the file
		if (isLargeFile) {
			const readTool = this._toolsService.getTool(ToolName.ReadFile);
			if (readTool) {
				result.push(readTool);
			} else {
				this._logService.error('MISSING inline chat read tool for large file');
				throw new Error('MISSING inline chat read tool for large file');
			}
		}

		return result;
	}
}

class InlineChatEditHeuristicStrategy implements IInlineChatEditStrategy {

	readonly id = InlineChatIntent.ID;
	readonly locations = [ChatLocation.Editor];
	readonly description = '';

	constructor(
		private readonly _intent: InlineChatIntent,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	async executeEdit(endpoint: IChatEndpoint, conversation: Conversation, request: vscode.ChatRequest, stream: vscode.ChatResponseStream, token: CancellationToken, documentContext: IDocumentContext, chatTelemetry: ChatTelemetryBuilder): Promise<IInlineChatEditResult> {

		assertType(request.location2 instanceof ChatRequestEditorData);

		const outcomeComputer = new InteractionOutcomeComputer(request.location2.document.uri);
		const renderer = PromptRenderer.create(this._instantiationService, endpoint, InlineChatEditCodePrompt, {
			ignoreCustomInstructions: true,
			documentContext,
			promptContext: {
				query: request.prompt,
				chatVariables: new ChatVariablesCollection([...request.references]),
				history: conversation.turns.slice(0, -1),
			}
		});

		const renderResult = await renderer.render(undefined, token, { trace: true });

		const replyInterpreter = renderResult.metadata.get(ReplyInterpreterMetaData)?.replyInterpreter ?? new NoopReplyInterpreter();
		const telemetryData = renderResult.metadata.getAll(TelemetryData);

		const telemetry = chatTelemetry.makeRequest(this._intent, ChatLocation.Editor, conversation, renderResult.messages, renderResult.tokenCount, renderResult.references, endpoint, telemetryData, 0, 0);

		stream = ChatResponseStreamImpl.spy(stream, part => {
			if (part instanceof ChatResponseTextEditPart) {
				telemetry.markEmittedEdits(part.uri, part.edits);
			}
		});

		let prediction: Prediction | undefined;
		const documentSplit = renderResult.metadata.get(SummarizedDocumentSplitMetadata)?.split;
		if (documentSplit) {
			prediction = {
				type: 'content',
				content: ''
			};
			prediction.content = `\`\`\`${documentContext.document.languageId}\n${documentSplit.codeSelected}\n\`\`\``;
		}

		const source = new AsyncIterableSource<IResponsePart>();
		const responseProcessing = replyInterpreter.processResponse(new ResponseProcessorContext(conversation.sessionId, conversation.getLatestTurn(), renderResult.messages, outcomeComputer), source.asyncIterable, stream, token);

		const fetchResult = await endpoint.makeChatRequest2({
			debugName: 'InlineChat2Intent',
			messages: renderResult.messages,
			userInitiatedRequest: true,
			location: ChatLocation.Editor,
			telemetryProperties: {
				messageId: telemetry.telemetryMessageId,
				conversationId: telemetry.sessionId,
				messageSource: this._intent.id
			},
			requestOptions: {
				stream: true,
				prediction
			},
			finishedCb: async (_text, _index, delta) => {
				telemetry.markReceivedToken();
				source.emitOne({ delta });
				return undefined;
			}
		}, token);

		source.resolve();

		await responseProcessing;

		const responseText = fetchResult.type === ChatFetchResponseType.Success ? fetchResult.value : '';
		telemetry.sendTelemetry(
			fetchResult.requestId, fetchResult.type, responseText,
			new InteractionOutcome(telemetry.editCount > 0 ? 'inlineEdit' : 'none', []),
			[]
		);

		return {
			needsExitTool: telemetry.editCount === 0 && fetchResult.type === ChatFetchResponseType.Success,
			lastResponse: fetchResult,
			telemetry,
		};
	}
}
