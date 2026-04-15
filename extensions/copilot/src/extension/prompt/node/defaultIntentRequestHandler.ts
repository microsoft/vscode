/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import type { ChatRequest, ChatResponseReferencePart, ChatResponseStream, ChatResult, LanguageModelToolInformation, Progress } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IChatHookService, UserPromptSubmitHookInput, UserPromptSubmitHookOutput } from '../../../platform/chat/common/chatHookService';
import { CanceledResult, ChatFetchResponseType, ChatLocation, ChatResponse, getErrorDetailsFromChatFetchError } from '../../../platform/chat/common/commonTypes';
import { IConversationOptions } from '../../../platform/chat/common/conversationOptions';
import { ISessionTranscriptService } from '../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEditSurvivalTrackerService, IEditSurvivalTrackingSession, NullEditSurvivalTrackingSession } from '../../../platform/editSurvivalTracking/common/editSurvivalTrackerService';
import { isAnthropicFamily } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { HAS_IGNORED_FILES_MESSAGE } from '../../../platform/ignore/common/ignoreService';
import { ILogService } from '../../../platform/log/common/logService';
import { isAnthropicContextEditingEnabled, isAnthropicToolSearchEnabled } from '../../../platform/networking/common/anthropic';
import { FilterReason } from '../../../platform/networking/common/openai';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger } from '../../../platform/requestLogger/common/requestLogger';
import { ISurveyService } from '../../../platform/survey/common/surveyService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Event } from '../../../util/vs/base/common/event';
import { Iterable } from '../../../util/vs/base/common/iterator';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { mixin } from '../../../util/vs/base/common/objects';
import { assertType, Mutable } from '../../../util/vs/base/common/types';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMarkdownPart, ChatResponseProgressPart, ChatResponseTextEditPart, LanguageModelToolResult2 } from '../../../vscodeTypes';
import { CodeBlocksMetadata, CodeBlockTrackingChatResponseStream } from '../../codeBlocks/node/codeBlockProcessor';
import { CopilotInteractiveEditorResponse, InteractionOutcomeComputer } from '../../inlineChat/node/promptCraftingTypes';
import { formatHookErrorMessage, HookAbortError, isHookAbortError, processHookResults } from '../../intents/node/hookResultProcessor';
import { EmptyPromptError, IToolCallingBuiltPromptEvent, IToolCallingLoopOptions, IToolCallingResponseEvent, IToolCallLoopResult, ToolCallingLoop, ToolCallingLoopFetchOptions, ToolCallLimitBehavior } from '../../intents/node/toolCallingLoop';
import { UnknownIntent } from '../../intents/node/unknownIntent';
import { ResponseStreamWithLinkification } from '../../linkify/common/responseStreamWithLinkification';
import { SummarizedConversationHistoryMetadata } from '../../prompts/node/agent/summarizedConversationHistory';
import { normalizeToolSchema } from '../../tools/common/toolSchemaNormalizer';
import { ToolCallCancelledError } from '../../tools/common/toolsService';
import { IToolGrouping, IToolGroupingService } from '../../tools/common/virtualTools/virtualToolTypes';
import { ChatVariablesCollection } from '../common/chatVariablesCollection';
import { AnthropicTokenUsageMetadata, Conversation, getUniqueReferences, GlobalContextMessageMetadata, IResultMetadata, RenderedUserMessageMetadata, RequestDebugInformation, ResponseStreamParticipant, Turn, TurnStatus } from '../common/conversation';
import { IBuildPromptContext, IToolCallRound } from '../common/intents';
import { isToolCallLimitCancellation, ISwitchToAutoOnRateLimitConfirmation } from '../common/specialRequestTypes';
import { ChatTelemetry, ChatTelemetryBuilder } from './chatParticipantTelemetry';
import { IntentInvocationMetadata } from './conversation';
import { IDocumentContext } from './documentContext';
import { IBuildPromptResult, IIntent, IIntentInvocation, IResponseProcessor, TelemetryData } from './intents';
import { ConversationalBaseTelemetryData, createTelemetryWithId, sendModelMessageTelemetry } from './telemetry';

export interface IDefaultIntentRequestHandlerOptions {
	maxToolCallIterations: number;
	/**
	 * Whether to ask the user if they want to continue when the tool call limit
	 * is exceeded. Defaults to true.
	 */
	confirmOnMaxToolIterations?: boolean;
	temperature?: number;
	overrideRequestLocation?: ChatLocation;
}

/*
* Handles a single chat-request via an intent-invocation.
*/
export class DefaultIntentRequestHandler {

	private readonly turn: Turn;

	private _editSurvivalTracker: IEditSurvivalTrackingSession = new NullEditSurvivalTrackingSession();
	private _loop!: DefaultToolCallingLoop;

	constructor(
		private readonly intent: IIntent,
		private readonly conversation: Conversation,
		protected readonly request: ChatRequest,
		protected readonly stream: ChatResponseStream,
		private readonly token: CancellationToken,
		protected readonly documentContext: IDocumentContext | undefined,
		private readonly location: ChatLocation,
		private readonly chatTelemetryBuilder: ChatTelemetryBuilder,
		private readonly handlerOptions: IDefaultIntentRequestHandlerOptions = { maxToolCallIterations: 15 },
		private readonly yieldRequested: (() => boolean) | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConversationOptions private readonly options: IConversationOptions,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@ISurveyService private readonly _surveyService: ISurveyService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IEditSurvivalTrackerService private readonly _editSurvivalTrackerService: IEditSurvivalTrackerService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IChatHookService private readonly _chatHookService: IChatHookService,
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		// Initialize properties
		this.turn = conversation.getLatestTurn();
	}

	async getResult(): Promise<ChatResult> {
		if (isToolCallLimitCancellation(this.request)) {
			// Just some friendly text instead of an empty message on cancellation:
			this.stream.markdown(l10n.t("Let me know if there's anything else I can help with!"));
			return {};
		}

		try {
			if (this.token.isCancellationRequested) {
				return CanceledResult;
			}

			this._logService.trace('Processing intent');
			const intentInvocation = await this.intent.invoke({ location: this.location, documentContext: this.documentContext, request: this.request });
			if (this.token.isCancellationRequested) {
				return CanceledResult;
			}
			this._logService.trace('Processed intent');

			this.turn.setMetadata(new IntentInvocationMetadata(intentInvocation));

			const confirmationResult = await this.handleConfirmationsIfNeeded();
			if (confirmationResult) {
				return confirmationResult;
			}

			// For subagent requests, use the subAgentInvocationId as the session ID.
			// This enables explicit linking between the parent's runSubagent tool call and the subagent trajectory.
			// For main requests, use the VS Code chat sessionId directly as the trajectory session ID.
			const isSubagent = !!this.request.subAgentInvocationId;
			const capturingToken = new CapturingToken(
				this.request.prompt,
				'comment',
				this.request.subAgentInvocationId,
				this.request.subAgentName,
				// For subagents, use invocation ID as chatSessionId so spans get their own log file
				isSubagent ? this.request.subAgentInvocationId : this.request.sessionId,
				// For subagents, link back to the parent session
				isSubagent ? this.request.sessionId : undefined,
				isSubagent ? `runSubagent-${this.request.subAgentName ?? 'default'}` : undefined,
			);
			const resultDetails = await this._requestLogger.captureInvocation(capturingToken, () => this.runWithToolCalling(intentInvocation));

			let chatResult = resultDetails.chatResult || {};
			this._surveyService.signalUsage(`${this.location === ChatLocation.Editor ? 'inline' : 'panel'}.${this.intent.id}`, this.documentContext?.document.languageId);

			const responseMessage = resultDetails.toolCallRounds.at(-1)?.response ?? '';
			const metadataFragment: Partial<IResultMetadata> = {
				toolCallRounds: resultDetails.toolCallRounds,
				toolCallResults: this._collectRelevantToolCallResults(resultDetails.toolCallRounds, resultDetails.toolCallResults),
				resolvedModel: resultDetails.response.type === ChatFetchResponseType.Success ? resultDetails.response.resolvedModel : undefined,
			};
			mixin(chatResult, { metadata: metadataFragment }, true);
			const baseModelTelemetry = createTelemetryWithId();
			chatResult = await this.processResult(resultDetails.response, responseMessage, chatResult, metadataFragment, baseModelTelemetry, resultDetails.toolCallRounds);
			if (chatResult.errorDetails && intentInvocation.modifyErrorDetails) {
				chatResult.errorDetails = intentInvocation.modifyErrorDetails(chatResult.errorDetails, resultDetails.response);
			}

			if (resultDetails.hadIgnoredFiles) {
				this.stream.markdown(HAS_IGNORED_FILES_MESSAGE);
			}

			return chatResult;
		} catch (err) {
			if (err instanceof ToolCallCancelledError) {
				this.turn.setResponse(TurnStatus.Cancelled, { message: err.message, type: 'meta' }, undefined, {});
				return {};
			} else if (isCancellationError(err)) {
				return CanceledResult;
			} else if (err instanceof EmptyPromptError) {
				return {};
			} else if (isHookAbortError(err)) {
				this._logService.info(`[DefaultIntentRequestHandler] Hook ${err.hookType} aborted: ${err.stopReason}`);
				return {};
			}

			this._logService.error(err);
			this._telemetryService.sendGHTelemetryException(err, 'Error');
			const errorMessage = (<Error>err).message;
			const chatResult = { errorDetails: { message: errorMessage } };
			this.turn.setResponse(TurnStatus.Error, { message: errorMessage, type: 'meta' }, undefined, chatResult);
			return chatResult;
		}
	}

	private _collectRelevantToolCallResults(toolCallRounds: IToolCallRound[], toolCallResults: Record<string, LanguageModelToolResult2>): Record<string, LanguageModelToolResult2> | undefined {
		const resultsUsedInThisTurn: Record<string, LanguageModelToolResult2> = {};
		for (const round of toolCallRounds) {
			for (const toolCall of round.toolCalls) {
				resultsUsedInThisTurn[toolCall.id] = toolCallResults[toolCall.id];
			}
		}

		return Object.keys(resultsUsedInThisTurn).length ? resultsUsedInThisTurn : undefined;
	}

	private _sendInitialChatReferences({ result: buildPromptResult }: IToolCallingBuiltPromptEvent) {
		const [includedVariableReferences, ignoredVariableReferences] = [getUniqueReferences(buildPromptResult.references), getUniqueReferences(buildPromptResult.omittedReferences)].map((refs) => refs.reduce((acc, ref) => {
			if ('variableName' in ref.anchor) {
				acc.add(ref.anchor.variableName);
			}
			return acc;
		}, new Set<string>()));
		for (const reference of buildPromptResult.references) {
			// Report variables which were partially sent to the model
			const options = reference.options ?? ('variableName' in reference.anchor && ignoredVariableReferences.has(reference.anchor.variableName)
				? { status: { kind: 2, description: l10n.t('Part of this attachment was not sent to the model due to context window limitations.') } }
				: undefined);
			if (!reference.options?.isFromTool) {
				// References reported by a tool result will be shown in a separate list, don't need to be reported as references
				this.stream.reference2(reference.anchor, undefined, options);
			}
		}
		for (const omittedReference of buildPromptResult.omittedReferences) {
			if ('variableName' in omittedReference.anchor && !includedVariableReferences.has(omittedReference.anchor.variableName)) {
				this.stream.reference2(omittedReference.anchor, undefined, { status: { kind: 3, description: l10n.t('This attachment was not sent to the model due to context window limitations.') } });
			}
		}
	}

	private makeResponseStreamParticipants(intentInvocation: IIntentInvocation): ResponseStreamParticipant[] {
		const participants: ResponseStreamParticipant[] = [];

		// 1. Tracking of code blocks. Currently used in stests. todo@connor4312:
		// can we simplify this so it's not used otherwise?
		participants.push(stream => {
			const codeBlockTrackingResponseStream = this._instantiationService.createInstance(CodeBlockTrackingChatResponseStream, stream, intentInvocation.codeblocksRepresentEdits);
			return ChatResponseStreamImpl.spy(
				codeBlockTrackingResponseStream,
				v => v,
				() => {
					const codeBlocksMetaData = codeBlockTrackingResponseStream.finish();
					this.turn.setMetadata(codeBlocksMetaData);
				}
			);
		});

		// 2. Track the survival of edits made in the editor
		if (this.documentContext && this.location === ChatLocation.Editor) {
			participants.push(stream => {
				const firstTurnWithAIEditCollector = this.conversation.turns.find(turn => turn.getMetadata(CopilotInteractiveEditorResponse)?.editSurvivalTracker);
				this._editSurvivalTracker = firstTurnWithAIEditCollector?.getMetadata(CopilotInteractiveEditorResponse)?.editSurvivalTracker ?? this._editSurvivalTrackerService.initialize(this.documentContext!.document.document);
				return ChatResponseStreamImpl.spy(stream, value => {
					if (value instanceof ChatResponseTextEditPart) {
						this._editSurvivalTracker.collectAIEdits(value.edits);
					}
				});
			});
		}


		// 3. Track the survival of other(?) interactions
		// todo@connor4312: can these two streams be combined?
		const interactionOutcomeComputer = new InteractionOutcomeComputer(this.documentContext?.document.uri);
		participants.push(stream => interactionOutcomeComputer.spyOnStream(stream));

		// 4. Linkify the stream unless told otherwise, or if this is a subagent request
		if (!intentInvocation.linkification?.disable && !this.request.subAgentInvocationId) {
			participants.push(stream => {
				const linkStream = this._instantiationService.createInstance(ResponseStreamWithLinkification, { requestId: this.turn.id, references: this.turn.references }, stream, intentInvocation.linkification?.additionaLinkifiers ?? [], this.token);
				return ChatResponseStreamImpl.spy(linkStream, p => p, () => {
					this._loop.telemetry.markAddedLinks(linkStream.totalAddedLinkCount);
				});
			});
		}

		// 5. General telemetry on emitted components
		participants.push(stream => ChatResponseStreamImpl.spy(stream, (part) => {
			if (part instanceof ChatResponseMarkdownPart) {
				this._loop.telemetry.markEmittedMarkdown(part.value);
			}
			if (part instanceof ChatResponseTextEditPart) {
				this._loop.telemetry.markEmittedEdits(part.uri, part.edits);
			}
		}));

		return participants;
	}

	private async _onDidReceiveResponse({ response, toolCalls, interactionOutcome }: IToolCallingResponseEvent) {
		const responseMessage = (response.type === ChatFetchResponseType.Success ? response.value : '');
		await this._loop.telemetry.sendTelemetry(response.requestId, response.type, responseMessage, interactionOutcome.interactionOutcome, toolCalls);

		if (this.documentContext) {
			this.turn.setMetadata(new CopilotInteractiveEditorResponse(
				interactionOutcome.store,
				{ ...this.documentContext, intent: this.intent, query: this.request.prompt },
				this.chatTelemetryBuilder.telemetryMessageId,
				this._loop.telemetry,
				this._editSurvivalTracker,
			));

			const documentText = this.documentContext?.document.getText();
			this.turn.setMetadata(new RequestDebugInformation(
				this.documentContext.document.uri,
				this.intent.id,
				this.documentContext.document.languageId,
				documentText!,
				this.request.prompt,
				this.documentContext.selection
			));
		}
	}

	private async runWithToolCalling(intentInvocation: IIntentInvocation): Promise<IInternalRequestResult> {
		const store = new DisposableStore();
		const loop = this._loop = store.add(this._instantiationService.createInstance(
			DefaultToolCallingLoop,
			{
				conversation: this.conversation,
				intent: this.intent,
				invocation: intentInvocation,
				toolCallLimit: this.handlerOptions.maxToolCallIterations,
				onHitToolCallLimit: this.handlerOptions.confirmOnMaxToolIterations !== false
					? ToolCallLimitBehavior.Confirm : ToolCallLimitBehavior.Stop,
				request: this.request,
				documentContext: this.documentContext,
				streamParticipants: this.makeResponseStreamParticipants(intentInvocation),
				temperature: this.handlerOptions.temperature ?? this.options.temperature,
				location: this.location,
				overrideRequestLocation: this.handlerOptions.overrideRequestLocation,
				interactionContext: this.documentContext?.document.uri,
				responseProcessor: typeof intentInvocation.processResponse === 'function' ? intentInvocation as IResponseProcessor : undefined,
				yieldRequested: this.yieldRequested,
			},
			this.chatTelemetryBuilder,
		));

		store.add(Event.once(loop.onDidBuildPrompt)(this._sendInitialChatReferences, this));

		// We need to wait for all response handlers to finish before
		// we can dispose the store. This is because the telemetry machine
		// still needs the tokenizers to count tokens. There was a case in vitests
		// in which the store, and the tokenizers, were disposed before the telemetry
		// machine could count the tokens, which resulted in an error.
		// src/extension/prompt/node/chatParticipantTelemetry.ts#L521-L522
		//
		// cc @lramos15
		const responseHandlers: Promise<unknown>[] = [];
		store.add(loop.onDidReceiveResponse(res => {
			const promise = this._onDidReceiveResponse(res);
			responseHandlers.push(promise);
			return promise;
		}, this));

		try {
			// Execute start hooks first (SessionStart/SubagentStart), then UserPromptSubmit
			await loop.runStartHooks(this.stream, this.token);

			const userPromptSubmitResults = await this._chatHookService.executeHook('UserPromptSubmit', this.request.hooks, { prompt: this.request.prompt } satisfies UserPromptSubmitHookInput, this.conversation.sessionId, this.token);
			const additionalContexts: string[] = [];
			processHookResults({
				hookType: 'UserPromptSubmit',
				results: userPromptSubmitResults,
				outputStream: this.stream,
				logService: this._logService,
				onSuccess: (output) => {
					if (typeof output === 'object' && output !== null) {
						const typedOutput = output as UserPromptSubmitHookOutput & { additionalContext?: string };
						const additionalContext = typedOutput.hookSpecificOutput?.additionalContext ?? typedOutput.additionalContext;
						if (additionalContext) {
							additionalContexts.push(additionalContext);
						}
						// Check for block decision output
						if (typedOutput.decision === 'block') {
							const blockReason = typedOutput.reason || l10n.t('No reason provided');
							this._logService.info(`[DefaultIntentRequestHandler] UserPromptSubmit hook block decision: ${blockReason}`);
							this.stream.hookProgress('UserPromptSubmit', formatHookErrorMessage(blockReason));
							throw new HookAbortError('UserPromptSubmit', blockReason);
						}
					}
				},
			});

			if (additionalContexts.length > 0) {
				loop.appendAdditionalHookContext(additionalContexts.join('\n'));
			}

			const result = await loop.run(this.stream, this.token);
			if (!result.round.toolCalls.length || result.response.type !== ChatFetchResponseType.Success) {
				loop.telemetry.sendToolCallingTelemetry(result.toolCallRounds, result.availableTools, this.token.isCancellationRequested ? 'cancelled' : result.response.type);
			}
			result.chatResult ??= {};
			if ((result.chatResult.metadata as IResultMetadata)?.maxToolCallsExceeded) {
				loop.telemetry.sendToolCallingTelemetry(result.toolCallRounds, result.availableTools, 'maxToolCalls');
			}

			// TODO need proper typing for all chat metadata and a better pattern to build it up from random places
			result.chatResult = this.resultWithMetadatas(result.chatResult);
			return { ...result, lastRequestTelemetry: loop.telemetry };
		} finally {
			await Promise.allSettled(responseHandlers);
			store.dispose();
		}
	}

	private resultWithMetadatas(chatResult: ChatResult | undefined): ChatResult | undefined {
		const codeBlocks = this.turn.getMetadata(CodeBlocksMetadata);
		const allSummarizedConversationHistory = this.turn.getAllMetadata(SummarizedConversationHistoryMetadata);
		const renderedUserMessageMetadata = this.turn.getMetadata(RenderedUserMessageMetadata);
		const globalContextMetadata = this.turn.getMetadata(GlobalContextMessageMetadata);
		const anthropicTokenUsageMetadata = this.turn.getMetadata(AnthropicTokenUsageMetadata);
		return codeBlocks || allSummarizedConversationHistory?.length || renderedUserMessageMetadata || globalContextMetadata || anthropicTokenUsageMetadata ?
			{
				...chatResult,
				metadata: {
					...chatResult?.metadata,
					...codeBlocks,
					...allSummarizedConversationHistory && allSummarizedConversationHistory.length > 0 && { summaries: allSummarizedConversationHistory },
					...renderedUserMessageMetadata,
					...globalContextMetadata,
					...anthropicTokenUsageMetadata,
				} satisfies Partial<IResultMetadata>,
			} : chatResult;
	}

	private async handleConfirmationsIfNeeded(): Promise<ChatResult | undefined> {
		const intentInvocation = this.turn.getMetadata(IntentInvocationMetadata)?.value;
		assertType(intentInvocation);
		if ((this.request.acceptedConfirmationData?.length || this.request.rejectedConfirmationData?.length) && intentInvocation.confirmationHandler) {
			await intentInvocation.confirmationHandler(this.request.acceptedConfirmationData, this.request.rejectedConfirmationData, this.stream);
			return {};
		}
	}

	private async processSuccessfulFetchResult(appliedText: string, requestId: string, chatResult: ChatResult, baseModelTelemetry: ConversationalBaseTelemetryData, rounds: IToolCallRound[]): Promise<ChatResult> {
		if (appliedText.length === 0 && !rounds.some(r => r.toolCalls.length)) {
			const message = l10n.t('The model unexpectedly did not return a response. Request ID: {0}', requestId);
			this.turn.setResponse(TurnStatus.Error, { type: 'meta', message }, baseModelTelemetry.properties.messageId, chatResult);
			return {
				errorDetails: {
					message
				},
			};
		}

		this.turn.setResponse(TurnStatus.Success, { type: 'model', message: appliedText }, baseModelTelemetry.properties.messageId, chatResult);
		baseModelTelemetry.markAsDisplayed();
		sendModelMessageTelemetry(
			this._telemetryService,
			this.conversation,
			this.location,
			appliedText,
			requestId,
			this.documentContext?.document,
			baseModelTelemetry,
			this.getModeNameForTelemetry()
		);

		return chatResult;
	}

	private getModeNameForTelemetry(): string {
		const modeInstructionsName = this.request.modeInstructions2?.name?.toLowerCase();
		if (modeInstructionsName) {
			return this.request.modeInstructions2?.isBuiltin ? this.request.modeInstructions2.name.toLowerCase() : 'custom';
		}

		if (this.intent.id === 'editAgent') {
			return 'agent';
		}

		if (this.intent.id === 'edit') {
			return 'edit';
		}

		return 'ask';
	}

	private processOffTopicFetchResult(baseModelTelemetry: ConversationalBaseTelemetryData): ChatResult {
		// Create starting off topic telemetry and mark event as issued and displayed
		this.stream.markdown(this.options.rejectionMessage);
		this.turn.setResponse(TurnStatus.OffTopic, { message: this.options.rejectionMessage, type: 'offtopic-detection' }, baseModelTelemetry.properties.messageId, {});
		return {};
	}

	private async processResult(fetchResult: ChatResponse, responseMessage: string, chatResult: ChatResult | void, metadataFragment: Partial<IResultMetadata>, baseModelTelemetry: ConversationalBaseTelemetryData, rounds: IToolCallRound[]): Promise<ChatResult> {
		switch (fetchResult.type) {
			case ChatFetchResponseType.Success:
				return await this.processSuccessfulFetchResult(responseMessage, fetchResult.requestId, chatResult ?? {}, baseModelTelemetry, rounds);
			case ChatFetchResponseType.OffTopic:
				return this.processOffTopicFetchResult(baseModelTelemetry);
			case ChatFetchResponseType.Canceled: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Cancelled, { message: errorDetails.message, type: 'user' }, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.QuotaExceeded:
			case ChatFetchResponseType.RateLimited: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				if (fetchResult.type === ChatFetchResponseType.RateLimited
					&& fetchResult.capiError?.code?.startsWith('user_model_rate_limited')
					&& !fetchResult.isAuto) {
					if (this._configurationService.getConfig(ConfigKey.RateLimitAutoSwitchToAuto)) {
						metadataFragment.shouldAutoSwitchToAuto = true;
					} else {
						errorDetails.confirmationButtons = [
							{ data: { copilotSwitchToAutoOnRateLimit: true, alwaysSwitchToAuto: true } satisfies ISwitchToAutoOnRateLimitConfirmation, label: l10n.t('Switch to Auto (always)') },
							{ data: { copilotSwitchToAutoOnRateLimit: true, alwaysSwitchToAuto: false } satisfies ISwitchToAutoOnRateLimitConfirmation, label: l10n.t('Switch to Auto') },
						];
					}
				}
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.BadRequest:
			case ChatFetchResponseType.NetworkError:
			case ChatFetchResponseType.Failed: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Error, { message: errorDetails.message, type: 'server' }, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.Filtered: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: { ...metadataFragment, filterReason: fetchResult.category } };
				this.turn.setResponse(TurnStatus.Filtered, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.PromptFiltered: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: { ...metadataFragment, filterReason: FilterReason.Prompt } };
				this.turn.setResponse(TurnStatus.PromptFiltered, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.AgentUnauthorized: {
				const chatResult = {};
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.AgentFailedDependency: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.Length: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.NotFound: // before we had `NotFound`, it would fall into Unknown, so behavior should be consistent
			case ChatFetchResponseType.Unknown: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.ExtensionBlocked: {
				const outageStatus = await this._octoKitService.getGitHubOutageStatus();
				const errorDetails = getErrorDetailsFromChatFetchError(fetchResult, (await this._authenticationService.getCopilotToken()).copilotPlan, outageStatus);
				const chatResult = { errorDetails, metadata: metadataFragment };
				// This shouldn't happen, only 3rd party extensions should be blocked
				this.turn.setResponse(TurnStatus.Error, undefined, baseModelTelemetry.properties.messageId, chatResult);
				return chatResult;
			}
			case ChatFetchResponseType.InvalidStatefulMarker:
				throw new Error('unreachable'); // retried within the endpoint
		}
	}
}

interface IInternalRequestResult {
	response: ChatResponse;
	round: IToolCallRound;
	chatResult?: ChatResult; // TODO should just be metadata
	hadIgnoredFiles: boolean;
	lastRequestMessages: Raw.ChatMessage[];
	lastRequestTelemetry: ChatTelemetry;
}

interface IDefaultToolLoopOptions extends IToolCallingLoopOptions {
	invocation: IIntentInvocation;
	intent: IIntent;
	documentContext: IDocumentContext | undefined;
	location: ChatLocation;
	temperature: number;
	overrideRequestLocation?: ChatLocation;
}

class DefaultToolCallingLoop extends ToolCallingLoop<IDefaultToolLoopOptions> {
	public telemetry!: ChatTelemetry;
	private toolGrouping?: IToolGrouping;

	constructor(
		options: IDefaultToolLoopOptions,
		telemetryBuilder: ChatTelemetryBuilder,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService logService: ILogService,
		@IRequestLogger requestLogger: IRequestLogger,
		@IEndpointProvider endpointProvider: IEndpointProvider,
		@IAuthenticationChatUpgradeService authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExperimentationService experimentationService: IExperimentationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IToolGroupingService private readonly toolGroupingService: IToolGroupingService,
		@IChatHookService chatHookService: IChatHookService,
		@ISessionTranscriptService sessionTranscriptService: ISessionTranscriptService,
		@IFileSystemService fileSystemService: IFileSystemService,
		@IOTelService otelService: IOTelService,
		@IGitService gitService: IGitService,
	) {
		super(options, instantiationService, endpointProvider, logService, requestLogger, authenticationChatUpgradeService, telemetryService, configurationService, experimentationService, chatHookService, sessionTranscriptService, fileSystemService, otelService, gitService);

		this._register(this.onDidBuildPrompt(({ result, tools, promptTokenLength, toolTokenCount }) => {
			if (result.metadata.get(SummarizedConversationHistoryMetadata)) {
				this.toolGrouping?.didInvalidateCache();
			}

			this.telemetry = telemetryBuilder.makeRequest(
				options.intent!,
				options.location,
				options.conversation,
				result.messages,
				promptTokenLength,
				result.references,
				options.invocation.endpoint,
				result.metadata.getAll(TelemetryData) ?? [],
				tools.length,
				toolTokenCount
			);
		}));

		this._register(this.onDidReceiveResponse(() => {
			this.toolGrouping?.didTakeTurn();
		}));
	}

	protected override createPromptContext(availableTools: LanguageModelToolInformation[], outputStream: ChatResponseStream | undefined): Mutable<IBuildPromptContext> {
		const context = super.createPromptContext(availableTools, outputStream);
		this._handleVirtualCalls(context);

		const extraVars = this.options.invocation.getAdditionalVariables?.(context);
		if (extraVars?.hasVariables()) {
			return {
				...context,
				chatVariables: ChatVariablesCollection.merge(context.chatVariables, extraVars),
			};
		}

		return context;
	}

	private _handleVirtualCalls(context: Mutable<IBuildPromptContext>) {
		if (!this.toolGrouping) {
			return;
		}

		for (const call of context.toolCallRounds?.at(-1)?.toolCalls || Iterable.empty()) {
			if (context.toolCallResults?.[call.id]) {
				continue;
			}
			const expanded = this.toolGrouping.didCall(context.toolCallRounds!.length, call.name);
			if (expanded) {
				context.toolCallResults ??= {};
				context.toolCallResults[call.id] = expanded;
			}
		}
	}

	protected override async buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult> {
		const buildPromptResult = await this.options.invocation.buildPrompt(buildPromptContext, progress, token);
		this.fixMessageNames(buildPromptResult.messages);
		return buildPromptResult;
	}

	protected override async fetch(opts: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse> {
		const messageSourcePrefix = this.options.location === ChatLocation.Editor ? 'inline' : 'chat';
		const debugName = this.options.request.subAgentInvocationId ?
			`tool/runSubagent${this.options.request.subAgentName ? `-${this.options.request.subAgentName}` : ''}` :
			`${ChatLocation.toStringShorter(this.options.location)}/${this.options.intent?.id}`;
		const location = this.options.overrideRequestLocation ?? this.options.location;
		const isThinkingLocation = location === ChatLocation.Agent || location === ChatLocation.MessagesProxy;
		const rawEffort = this.options.request.modelConfiguration?.reasoningEffort;
		const reasoningEffort = typeof rawEffort === 'string' ? rawEffort : undefined;
		const isSubagent = !!this.options.request.subAgentInvocationId;
		return this.options.invocation.endpoint.makeChatRequest2({
			...opts,
			modelCapabilities: {
				...opts.modelCapabilities,
				enableThinking: isThinkingLocation && opts.modelCapabilities?.enableThinking,
				reasoningEffort,
				enableToolSearch: !isSubagent && isAnthropicToolSearchEnabled(this.options.invocation.endpoint, this._configurationService),
				enableContextEditing: !isSubagent && isAnthropicContextEditingEnabled(this.options.invocation.endpoint, this._configurationService, this._experimentationService),
			},
			debugName,
			conversationId: this.options.conversation.sessionId,
			turnId: opts.turnId,
			finishedCb: (text, index, delta) => {
				this.telemetry.markReceivedToken();
				return opts.finishedCb!(text, index, delta);
			},
			location,
			requestOptions: {
				...opts.requestOptions,
				tools: normalizeToolSchema(
					this.options.invocation.endpoint.family,
					opts.requestOptions.tools,
					(tool, rule) => {
						this._logService.warn(`Tool ${tool} failed validation: ${rule}`);
					},
				),
				temperature: this.calculateTemperature(),
			},
			telemetryProperties: {
				messageId: this.telemetry.telemetryMessageId,
				conversationId: this.options.conversation.sessionId,
				messageSource: this.options.intent?.id && this.options.intent.id !== UnknownIntent.ID ? `${messageSourcePrefix}.${this.options.intent.id}` : `${messageSourcePrefix}.user`,
				subType: this.options.request.subAgentInvocationId ? `subagent` : this.options.request.isSystemInitiated ? 'system-initiated' : undefined,
				parentRequestId: this.options.request.parentRequestId,
			},
			requestKindOptions: this.options.request.subAgentInvocationId
				? { kind: 'subagent' }
				: undefined,
			enableRetryOnFilter: true
		}, token);
	}

	protected override async getAvailableTools(outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<LanguageModelToolInformation[]> {
		const tools = await this.options.invocation.getAvailableTools?.() ?? [];

		// Skip tool grouping when Anthropic tool search is enabled
		if (isAnthropicFamily(this.options.invocation.endpoint) && isAnthropicToolSearchEnabled(this.options.invocation.endpoint, this._configurationService)) {
			return tools;
		}

		if (this.toolGrouping) {
			this.toolGrouping.tools = tools;
		} else {
			this.toolGrouping = this.toolGroupingService.create(this.options.conversation.sessionId, tools);
			for (const ref of this.options.request.toolReferences) {
				this.toolGrouping.ensureExpanded(ref.name);
			}
		}

		const computePromise = this.toolGrouping.compute(this.options.request.prompt, token);		// Show progress if this takes a moment...
		const timeout = setTimeout(() => {
			outputStream?.progress(l10n.t('Optimizing tool selection...'), async () => {
				await computePromise;
			});
		}, 1000);

		try {
			return await computePromise;
		} finally {
			clearTimeout(timeout);
		}
	}

	private fixMessageNames(messages: Raw.ChatMessage[]): void {
		messages.forEach(m => {
			if (m.role !== Raw.ChatRole.System && 'name' in m && m.name === this.options.intent?.id) {
				// Assistant messages from the current intent should not have 'name' set.
				// It's not well-documented how this works in OpenAI models but this seems to be the expectation
				m.name = undefined;
			}
		});
	}

	private calculateTemperature(): number {
		if (this.options.request.attempt > 0) {
			return Math.min(
				this.options.temperature * (this.options.request.attempt + 1),
				2 /* MAX temperature - https://platform.openai.com/docs/api-reference/chat/create#chat/create-temperature */
			);
		} else {
			return this.options.temperature;
		}
	}
}

interface IInternalRequestResult extends IToolCallLoopResult {
	lastRequestTelemetry: ChatTelemetry;
}
