/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatRequest, ChatResponseProgressPart, ChatResponseReferencePart, ChatResponseStream, ChatResult, LanguageModelToolInformation, Progress } from 'vscode';
import { IAuthenticationChatUpgradeService } from '../../../platform/authentication/common/authenticationUpgrade';
import { IChatDebugFileLoggerService } from '../../../platform/chat/common/chatDebugFileLoggerService';
import { IChatHookService, SessionStartHookInput, SessionStartHookOutput, StopHookInput, StopHookOutput, SubagentStartHookInput, SubagentStartHookOutput, SubagentStopHookInput, SubagentStopHookOutput } from '../../../platform/chat/common/chatHookService';
import { FetchStreamSource, IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { CanceledResult, ChatFetchResponseType, ChatResponse } from '../../../platform/chat/common/commonTypes';
import { IHistoricalTurn, ISessionTranscriptService, ToolRequest } from '../../../platform/chat/common/sessionTranscriptService';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { isAnthropicFamily, isGeminiFamily } from '../../../platform/endpoint/common/chatModelCapabilities';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { rawPartAsThinkingData } from '../../../platform/endpoint/common/thinkingDataContainer';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitService } from '../../../platform/git/common/gitService';
import { ILogService } from '../../../platform/log/common/logService';
import { isOpenAIContextManagementResponse, OpenAiFunctionDef } from '../../../platform/networking/common/fetch';
import { IMakeChatRequestOptions } from '../../../platform/networking/common/networking';
import { OpenAIContextManagementResponse } from '../../../platform/networking/common/openai';
import { CopilotChatAttr, emitAgentTurnEvent, emitSessionStartEvent, GenAiAttr, GenAiMetrics, GenAiOperationName, GenAiProviderName, resolveWorkspaceOTelMetadata, StdAttr, truncateForOTel, workspaceMetadataToOTelAttributes } from '../../../platform/otel/common/index';
import { IOTelService, ISpanHandle, SpanKind, SpanStatusCode } from '../../../platform/otel/common/otelService';
import { getCurrentCapturingToken, IRequestLogger } from '../../../platform/requestLogger/node/requestLogger';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { computePromptTokenDetails } from '../../../platform/tokenizer/node/promptTokenDetails';
import { tryFinalizeResponseStream } from '../../../util/common/chatResponseStreamImpl';
import { ChatExtPerfMark, markChatExt } from '../../../util/common/performance';
import { DeferredPromise, timeout } from '../../../util/vs/base/common/async';
import { CancellationError, isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { Mutable } from '../../../util/vs/base/common/types';
import { URI } from '../../../util/vs/base/common/uri';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponsePullRequestPart, LanguageModelDataPart2, LanguageModelPartAudience, LanguageModelTextPart, LanguageModelToolResult2, MarkdownString } from '../../../vscodeTypes';
import { InteractionOutcomeComputer } from '../../inlineChat/node/promptCraftingTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { AnthropicTokenUsageMetadata, Conversation, IResultMetadata, ResponseStreamParticipant, TurnStatus } from '../../prompt/common/conversation';
import { IBuildPromptContext, InternalToolReference, IToolCall, IToolCallRound } from '../../prompt/common/intents';
import { cancelText, IToolCallIterationIncrease } from '../../prompt/common/specialRequestTypes';
import { ThinkingDataItem, ToolCallRound } from '../../prompt/common/toolCallRound';
import { IBuildPromptResult, IResponseProcessor } from '../../prompt/node/intents';
import { PseudoStopStartResponseProcessor } from '../../prompt/node/pseudoStartStopConversationCallback';
import { ResponseProcessorContext } from '../../prompt/node/responseProcessorContext';
import { SummarizedConversationHistoryMetadata } from '../../prompts/node/agent/summarizedConversationHistory';
import { ToolFailureEncountered, ToolResultMetadata } from '../../prompts/node/panel/toolCalling';
import { ToolName } from '../../tools/common/toolNames';
import { IToolsService, ToolCallCancelledError } from '../../tools/common/toolsService';
import { ReadFileParams } from '../../tools/node/readFileTool';
import { isHookAbortError, processHookResults } from './hookResultProcessor';
import { applyConfiguredPromptOverrides } from './promptOverride';

export const enum ToolCallLimitBehavior {
	Confirm,
	Stop,
}

export interface IToolCallingLoopOptions {
	conversation: Conversation;
	toolCallLimit: number;
	/**
	 * What to do when the limit is hit. Defaults to {@link ToolCallLimitBehavior.Stop}.
	 * If set to confirm you can use {@link isToolCallLimitCancellation} and
	 * {@link isToolCallIterationIncrease} to get followup data.
	 */
	onHitToolCallLimit?: ToolCallLimitBehavior;
	/**
	 * "mixins" that can be used to wrap the response stream.
	 */
	streamParticipants?: ResponseStreamParticipant[];
	/**
	 * Optional custom response stream processor.
	 */
	responseProcessor?: IResponseProcessor;
	/** Context for the {@link InteractionOutcomeComputer} */
	interactionContext?: URI;
	/**
	 * The current chat request
	 */
	request: ChatRequest;
	/**
	 * A getter that returns true if VS Code has requested the extension to
	 * gracefully yield. When set, it's likely that the editor will immediately
	 * follow up with a new request in the same conversation.
	 */
	yieldRequested?: () => boolean;
}

export interface IToolCallingResponseEvent {
	response: ChatResponse;
	interactionOutcome: InteractionOutcomeComputer;
	toolCalls: IToolCall[];
}

export interface IToolCallingBuiltPromptEvent {
	result: IBuildPromptResult;
	tools: LanguageModelToolInformation[];
}

export type ToolCallingLoopFetchOptions = Required<Pick<IMakeChatRequestOptions, 'messages' | 'finishedCb' | 'requestOptions' | 'userInitiatedRequest' | 'turnId'>> & Pick<IMakeChatRequestOptions, 'modelCapabilities' | 'summarizedAtRoundId'>;

interface StartHookResult {
	/**
	 * Additional context to add to the agent's context, if any.
	 */
	readonly additionalContext?: string;
}

interface StopHookResult {
	/**
	 * Whether the agent should continue (not stop).
	 */
	readonly shouldContinue: boolean;
	/**
	 * The reasons the agent should continue, if shouldContinue is true.
	 * Multiple hooks may block with different reasons.
	 */
	readonly reasons?: readonly string[];
}

interface SubagentStartHookResult {
	/**
	 * Additional context to add to the subagent's context, if any.
	 */
	readonly additionalContext?: string;
}

interface SubagentStopHookResult {
	/**
	 * Whether the subagent should continue (not stop).
	 */
	readonly shouldContinue: boolean;
	/**
	 * The reasons the subagent should continue, if shouldContinue is true.
	 * Multiple hooks may block with different reasons.
	 */
	readonly reasons?: readonly string[];
}

/**
 * Formats a hook context message from blocking reasons.
 * @param reasons The reasons hooks blocked the agent from stopping
 * @returns A formatted message for the model to address the requirements
 */
function formatHookContext(reasons: readonly string[]): string {
	if (reasons.length === 1) {
		return `You were about to complete but a hook blocked you with the following message: "${reasons[0]}". Please address this requirement before completing.`;
	}
	const formattedReasons = reasons.map((reason, i) => `${i + 1}. ${reason}`).join('\n');
	return `You were about to complete but multiple hooks blocked you with the following messages:\n${formattedReasons}\n\nPlease address all of these requirements before completing.`;
}

/**
 * This is a base class that can be used to implement a tool calling loop
 * against a model. It requires only that you build a prompt and is decoupled
 * from intents (i.e. the {@link DefaultIntentRequestHandler}), allowing easier
 * programmatic use.
 */
export abstract class ToolCallingLoop<TOptions extends IToolCallingLoopOptions = IToolCallingLoopOptions> extends Disposable {
	private static NextToolCallId = Date.now();

	private static readonly TASK_COMPLETE_TOOL_NAME = 'task_complete';

	private toolCallResults: Record<string, LanguageModelToolResult2> = Object.create(null);
	private toolCallRounds: IToolCallRound[] = [];
	private stopHookReason: string | undefined;
	private additionalHookContext: string | undefined;
	private stopHookUserInitiated = false;
	private agentSpan: ISpanHandle | undefined;
	private chatSessionIdForTools: string | undefined;
	private toolsAvailableEmitted = false;

	public appendAdditionalHookContext(context: string): void {
		if (!context) {
			return;
		}
		this.additionalHookContext = this.additionalHookContext
			? `${this.additionalHookContext}\n${context}`
			: context;
	}

	private readonly _onDidBuildPrompt = this._register(new Emitter<{ result: IBuildPromptResult; tools: LanguageModelToolInformation[]; promptTokenLength: number; toolTokenCount: number }>());
	public readonly onDidBuildPrompt = this._onDidBuildPrompt.event;

	private readonly _onDidReceiveResponse = this._register(new Emitter<IToolCallingResponseEvent>());
	public readonly onDidReceiveResponse = this._onDidReceiveResponse.event;

	private get turn() {
		return this.options.conversation.getLatestTurn();
	}

	constructor(
		protected readonly options: TOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IEndpointProvider private readonly _endpointProvider: IEndpointProvider,
		@ILogService protected readonly _logService: ILogService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
		@IAuthenticationChatUpgradeService private readonly _authenticationChatUpgradeService: IAuthenticationChatUpgradeService,
		@ITelemetryService protected readonly _telemetryService: ITelemetryService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IExperimentationService protected readonly _experimentationService: IExperimentationService,
		@IChatHookService private readonly _chatHookService: IChatHookService,
		@ISessionTranscriptService protected readonly _sessionTranscriptService: ISessionTranscriptService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IOTelService protected readonly _otelService: IOTelService,
		@IGitService private readonly _gitService: IGitService,
	) {
		super();
	}

	/** Builds a prompt with the context. */
	protected abstract buildPrompt(buildPromptContext: IBuildPromptContext, progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart>, token: CancellationToken): Promise<IBuildPromptResult>;

	/** Gets the tools that should be callable by the model. */
	protected abstract getAvailableTools(outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<LanguageModelToolInformation[]>;

	/** Creates the prompt context for the request. */
	protected createPromptContext(availableTools: LanguageModelToolInformation[], outputStream: ChatResponseStream | undefined): Mutable<IBuildPromptContext> {
		const { request } = this.options;
		const chatVariables = new ChatVariablesCollection(request.references);

		const isContinuation = this.turn.isContinuation || !!this.stopHookReason;
		let query: string;
		let hasStopHookQuery = false;
		if (this.stopHookReason) {
			// Include the stop hook reason as a user message so the model knows what to do.
			// Wrap with context so the model understands it needs to take action.
			query = formatHookContext([this.stopHookReason]);
			this._logService.info(`[ToolCallingLoop] Using stop hook reason as query: ${query}`);
			this.stopHookReason = undefined; // Clear after use
			hasStopHookQuery = true;
		} else if (isContinuation) {
			query = 'Please continue';
		} else {
			query = this.turn.request.message;
		}
		// exclude turns from the history that errored due to prompt filtration
		const history = this.options.conversation.turns.slice(0, -1).filter(turn => turn.responseStatus !== TurnStatus.PromptFiltered);

		return {
			requestId: this.turn.id,
			query,
			history,
			toolCallResults: this.toolCallResults,
			toolCallRounds: this.toolCallRounds,
			editedFileEvents: this.options.request.editedFileEvents,
			request: this.options.request,
			stream: outputStream,
			conversation: this.options.conversation,
			chatVariables,
			tools: {
				toolReferences: request.toolReferences.map(InternalToolReference.from),
				toolInvocationToken: request.toolInvocationToken,
				availableTools
			},
			isContinuation,
			hasStopHookQuery,
			modeInstructions: this.options.request.modeInstructions2,
			additionalHookContext: this.additionalHookContext,
		};
	}

	protected abstract fetch(
		options: ToolCallingLoopFetchOptions,
		token: CancellationToken
	): Promise<ChatResponse>;

	/**
	 * The context window widget in chat input should represent only the parent request.
	 * Subagent usage must stay isolated to avoid inflating the parent widget.
	 */
	private shouldReportUsageToContextWidget(): boolean {
		return !this.options.request.subAgentInvocationId;
	}

	/**
	 * Called before the loop stops to give hooks a chance to block the stop.
	 * @param input The stop hook input containing stop_hook_active flag
	 * @param outputStream The output stream for displaying messages
	 * @param token Cancellation token
	 * @returns Result indicating whether to continue and the reasons
	 */
	protected async executeStopHook(input: StopHookInput, sessionId: string, outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<StopHookResult> {
		try {
			const results = await this._chatHookService.executeHook('Stop', this.options.request.hooks, input, sessionId, token);

			const blockingReasons = new Set<string>();
			processHookResults({
				hookType: 'Stop',
				results,
				outputStream,
				logService: this._logService,
				onSuccess: (output) => {
					if (typeof output === 'object' && output !== null) {
						const hookOutput = output as StopHookOutput;
						const specific = hookOutput.hookSpecificOutput;
						this._logService.trace(`[ToolCallingLoop] Checking hook output: decision=${specific?.decision}, reason=${specific?.reason}`);
						if (specific?.decision === 'block' && specific.reason) {
							this._logService.trace(`[ToolCallingLoop] Stop hook blocked: ${specific.reason}`);
							blockingReasons.add(specific.reason);
						}
					}
				},
				// Collect errors as blocking reasons (stderr from exit code != 0)
				onError: (errorMessage) => {
					if (errorMessage) {
						this._logService.trace(`[ToolCallingLoop] Stop hook error collected as blocking reason: ${errorMessage}`);
						blockingReasons.add(errorMessage);
					}
				},
			});

			if (blockingReasons.size > 0) {
				return { shouldContinue: true, reasons: [...blockingReasons] };
			}
			return { shouldContinue: false };
		} catch (error) {
			if (isHookAbortError(error)) {
				throw error;
			}
			this._logService.error('[ToolCallingLoop] Error executing Stop hook', error);
			return { shouldContinue: false };
		}
	}

	/**
	 * Shows a message when the stop hook blocks the agent from stopping.
	 * Override in subclasses to customize the display.
	 * @param outputStream The output stream for displaying messages
	 * @param reasons The reasons the stop hook blocked stopping
	 */
	protected showStopHookBlockedMessage(outputStream: ChatResponseStream | undefined, reasons: readonly string[]): void {
		if (outputStream) {
			if (reasons.length === 1) {
				outputStream.hookProgress('Stop', reasons[0]);
			} else {
				const formattedReasons = reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
				outputStream.hookProgress('Stop', formattedReasons);
			}
		}
		this._logService.trace(`[ToolCallingLoop] Stop hook blocked stopping: ${reasons.join('; ')}`);
	}

	private static readonly MAX_AUTOPILOT_RETRIES = 3;
	private static readonly MAX_AUTOPILOT_ITERATIONS = 5;
	private autopilotRetryCount = 0;
	private autopilotIterationCount = 0;

	private taskCompleted = false;
	private autopilotStopHookActive = false;
	private autopilotProgressDeferred: DeferredPromise<void> | undefined;

	/**
	 * Autopilot stop hook — the model needs to call `task_complete` to signal it's done.
	 * If it stops without calling it, we nudge it to keep going. Returns a continuation
	 * message or `undefined` to let the loop stop.
	 */
	protected shouldAutopilotContinue(result: IToolCallSingleResult): string | undefined {
		if (this.taskCompleted) {
			this._logService.info('[ToolCallingLoop] Autopilot: task_complete was called, stopping');
			return undefined;
		}

		// might have called task_complete alongside other tools in an earlier round
		const calledTaskComplete = this.toolCallRounds.some(
			round => round.toolCalls.some(tc => tc.name === ToolCallingLoop.TASK_COMPLETE_TOOL_NAME)
		);
		if (calledTaskComplete) {
			this.taskCompleted = true;
			this._logService.info('[ToolCallingLoop] Autopilot: task_complete found in history, stopping');
			return undefined;
		}

		// safety valve — only give up after exhausting all continuation attempts
		if (this.autopilotIterationCount >= ToolCallingLoop.MAX_AUTOPILOT_ITERATIONS) {
			this._logService.info(`[ToolCallingLoop] Autopilot: hit max iterations (${ToolCallingLoop.MAX_AUTOPILOT_ITERATIONS}), letting it stop`);
			return undefined;
		}

		this.autopilotIterationCount++;
		return 'You have not yet marked the task as complete using the task_complete tool. ' +
			'You must call task_complete when done — whether the task involved code changes, answering a question, or any other interaction.\n\n' +
			'Do NOT repeat or restate your previous response. Pick up where you left off.\n\n' +
			'If you were planning, stop planning and start implementing. ' +
			'You are not done until you have fully completed the task.\n\n' +
			'IMPORTANT: Do NOT call task_complete if:\n' +
			'- You have open questions or ambiguities — make good decisions and keep working\n' +
			'- You encountered an error — try to resolve it or find an alternative approach\n' +
			'- There are remaining steps — complete them first\n\n' +
			'When you ARE done, first provide a brief text summary of what was accomplished, then call task_complete. ' +
			'Both the summary message and the tool call are required.\n\n' +
			'Keep working autonomously until the task is truly finished, then call task_complete.';
	}

	/**
	 * Shows a progress spinner in the chat stream while autopilot continues.
	 * The spinner resolves to the past-tense message when {@link resolveAutopilotProgress} is called.
	 */
	private showAutopilotProgress(outputStream: ChatResponseStream | undefined, message: string, pastTenseMessage: string): void {
		this.resolveAutopilotProgress();
		const deferred = new DeferredPromise<void>();
		this.autopilotProgressDeferred = deferred;
		outputStream?.progress(message, async () => {
			await deferred.p;
			return pastTenseMessage;
		});
	}

	/**
	 * Resolves any pending autopilot progress spinner, transitioning it to its past-tense message.
	 */
	private resolveAutopilotProgress(): void {
		if (this.autopilotProgressDeferred) {
			this.autopilotProgressDeferred.complete(undefined);
			this.autopilotProgressDeferred = undefined;
		}
	}

	/**
	 * Ensures the `task_complete` tool is present in the available tools when running in
	 * autopilot mode. If it's missing (e.g. filtered out by the tool picker), it's resolved
	 * from the tools service and appended so the model can always signal completion.
	 */
	protected ensureAutopilotTools(availableTools: LanguageModelToolInformation[]): LanguageModelToolInformation[] {
		if (this.options.request.permissionLevel !== 'autopilot') {
			return availableTools;
		}
		if (availableTools.some(t => t.name === ToolCallingLoop.TASK_COMPLETE_TOOL_NAME)) {
			return availableTools;
		}
		const taskCompleteTool = this._instantiationService.invokeFunction(
			accessor => accessor.get(IToolsService).getTool(ToolCallingLoop.TASK_COMPLETE_TOOL_NAME)
		);
		if (taskCompleteTool) {
			this._logService.info('[ToolCallingLoop] Added task_complete tool for autopilot mode');
			return [...availableTools, taskCompleteTool];
		}
		this._logService.warn('[ToolCallingLoop] task_complete tool not found — autopilot completion may not work');
		return availableTools;
	}

	/**
	 * Whether the loop should auto-retry after a failed fetch in auto-approve/autopilot mode.
	 * Does not retry rate-limited, quota-exceeded, or cancellation errors.
	 */
	private shouldAutoRetry(response: ChatResponse): boolean {
		const permLevel = this.options.request.permissionLevel;
		if (permLevel !== 'autoApprove' && permLevel !== 'autopilot') {
			return false;
		}
		if (this.autopilotRetryCount >= ToolCallingLoop.MAX_AUTOPILOT_RETRIES) {
			return false;
		}
		switch (response.type) {
			case ChatFetchResponseType.RateLimited:
			case ChatFetchResponseType.QuotaExceeded:
			case ChatFetchResponseType.Canceled:
			case ChatFetchResponseType.OffTopic:
				return false;
			default:
				return response.type !== ChatFetchResponseType.Success;
		}
	}

	/**
	 * Called when a session starts to allow hooks to provide additional context.
	 * @param input The session start hook input containing source
	 * @param outputStream The output stream for displaying messages
	 * @param token Cancellation token
	 * @returns Result containing additional context from hooks
	 */
	protected async executeSessionStartHook(input: SessionStartHookInput, sessionId: string, outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<StartHookResult> {
		try {
			const results = await this._chatHookService.executeHook('SessionStart', this.options.request.hooks, input, sessionId, token);

			const additionalContexts: string[] = [];
			processHookResults({
				hookType: 'SessionStart',
				results,
				outputStream,
				logService: this._logService,
				onSuccess: (output) => {
					if (typeof output === 'object' && output !== null) {
						const hookOutput = output as SessionStartHookOutput;
						const additionalContext = hookOutput.hookSpecificOutput?.additionalContext;
						if (additionalContext) {
							additionalContexts.push(additionalContext);
							this._logService.trace(`[ToolCallingLoop] SessionStart hook provided context: ${additionalContext.substring(0, 100)}...`);
						}
					}
				},
				// SessionStart blocking errors and stopReason are silently ignored
				ignoreErrors: true,
			});

			return {
				additionalContext: additionalContexts.length > 0 ? additionalContexts.join('\n') : undefined
			};
		} catch (error) {
			if (isHookAbortError(error)) {
				throw error;
			}
			this._logService.error('[ToolCallingLoop] Error executing SessionStart hook', error);
			return {};
		}
	}

	/**
	 * Called when a subagent starts to allow hooks to provide additional context.
	 * @param input The subagent start hook input containing agent_id and agent_type
	 * @param outputStream The output stream for displaying messages
	 * @param token Cancellation token
	 * @returns Result containing additional context from hooks
	 */
	protected async executeSubagentStartHook(input: SubagentStartHookInput, sessionId: string, outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<SubagentStartHookResult> {
		try {
			const results = await this._chatHookService.executeHook('SubagentStart', this.options.request.hooks, input, sessionId, token);

			const additionalContexts: string[] = [];
			processHookResults({
				hookType: 'SubagentStart',
				results,
				outputStream,
				logService: this._logService,
				onSuccess: (output) => {
					if (typeof output === 'object' && output !== null) {
						const hookOutput = output as SubagentStartHookOutput;
						const additionalContext = hookOutput.hookSpecificOutput?.additionalContext;
						if (additionalContext) {
							additionalContexts.push(additionalContext);
							this._logService.trace(`[ToolCallingLoop] SubagentStart hook provided context: ${additionalContext.substring(0, 100)}...`);
						}
					}
				},
				// SubagentStart blocking errors and stopReason are silently ignored
				ignoreErrors: true,
			});

			return {
				additionalContext: additionalContexts.length > 0 ? additionalContexts.join('\n') : undefined
			};
		} catch (error) {
			if (isHookAbortError(error)) {
				throw error;
			}
			this._logService.error('[ToolCallingLoop] Error executing SubagentStart hook', error);
			return {};
		}
	}

	/**
	 * Called before a subagent stops to give hooks a chance to block the stop.
	 * @param input The subagent stop hook input containing agent_id, agent_type, and stop_hook_active flag
	 * @param outputStream The output stream for displaying messages
	 * @param token Cancellation token
	 * @returns Result indicating whether to continue and the reasons
	 */
	protected async executeSubagentStopHook(input: SubagentStopHookInput, sessionId: string, outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<SubagentStopHookResult> {
		try {
			const results = await this._chatHookService.executeHook('SubagentStop', this.options.request.hooks, input, sessionId, token);

			const blockingReasons = new Set<string>();
			processHookResults({
				hookType: 'SubagentStop',
				results,
				outputStream,
				logService: this._logService,
				onSuccess: (output) => {
					if (typeof output === 'object' && output !== null) {
						const hookOutput = output as SubagentStopHookOutput;
						const specific = hookOutput.hookSpecificOutput;
						this._logService.trace(`[ToolCallingLoop] Checking SubagentStop hook output: decision=${specific?.decision}, reason=${specific?.reason}`);
						if (specific?.decision === 'block' && specific.reason) {
							this._logService.trace(`[ToolCallingLoop] SubagentStop hook blocked: ${specific.reason}`);
							blockingReasons.add(specific.reason);
						}
					}
				},
				// Collect errors as blocking reasons (stderr from exit code != 0)
				onError: (errorMessage) => {
					if (errorMessage) {
						this._logService.trace(`[ToolCallingLoop] SubagentStop hook error collected as blocking reason: ${errorMessage}`);
						blockingReasons.add(errorMessage);
					}
				},
			});

			if (blockingReasons.size > 0) {
				return { shouldContinue: true, reasons: [...blockingReasons] };
			}
			return { shouldContinue: false };
		} catch (error) {
			if (isHookAbortError(error)) {
				throw error;
			}
			this._logService.error('[ToolCallingLoop] Error executing SubagentStop hook', error);
			return { shouldContinue: false };
		}
	}

	/**
	 * Shows a message when the subagent stop hook blocks the subagent from stopping.
	 * Override in subclasses to customize the display.
	 * @param outputStream The output stream for displaying messages
	 * @param reasons The reasons the subagent stop hook blocked stopping
	 */
	protected showSubagentStopHookBlockedMessage(outputStream: ChatResponseStream | undefined, reasons: readonly string[]): void {
		if (outputStream) {
			if (reasons.length === 1) {
				outputStream.hookProgress('SubagentStop', reasons[0]);
			} else {
				const formattedReasons = reasons.map((r, i) => `${i + 1}. ${r}`).join('\n');
				outputStream.hookProgress('SubagentStop', formattedReasons);
			}
		}
		this._logService.trace(`[ToolCallingLoop] SubagentStop hook blocked stopping: ${reasons.join('; ')}`);
	}

	private throwIfCancelled(token: CancellationToken) {
		if (token.isCancellationRequested) {
			this.turn.setResponse(TurnStatus.Cancelled, undefined, undefined, CanceledResult);
			throw new CancellationError();
		}
	}

	/**
	 * Executes start hooks (SessionStart for regular sessions, SubagentStart for subagents).
	 * Should be called before run() to allow hooks to provide context before the first prompt.
	 *
	 * - For subagents: Always executes SubagentStart hook
	 * - For regular sessions: Only executes SessionStart hook on the first turn
	 * @throws HookAbortError if a hook requests the session/subagent to abort
	 */
	public async runStartHooks(outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<void> {
		const sessionId = this.options.conversation.sessionId;
		const hasHooks = this.options.request.hasHooksEnabled;

		// Report which hooks are configured for this request
		this._chatHookService.logConfiguredHooks(this.options.request.hooks);

		// Execute SubagentStart hook for subagent requests, or SessionStart hook for first turn of regular sessions
		if (this.options.request.subAgentInvocationId) {
			const startHookResult = await this.executeSubagentStartHook({
				agent_id: this.options.request.subAgentInvocationId,
				agent_type: this.options.request.subAgentName ?? 'default',
			}, sessionId, outputStream, token);
			if (startHookResult.additionalContext) {
				this.additionalHookContext = startHookResult.additionalContext;
				this._logService.info(`[ToolCallingLoop] SubagentStart hook provided context for subagent ${this.options.request.subAgentInvocationId}`);
			}
		} else {
			const isFirstTurn = this.options.conversation.turns.length === 1;

			if (hasHooks) {
				// Build history from prior turns (excluding the current one) for transcript replay
				const priorTurns = this.options.conversation.turns.slice(0, -1);
				const history: IHistoricalTurn[] = priorTurns.map(turn => ({
					userMessage: turn.request.message,
					timestamp: turn.startTime,
					rounds: turn.rounds.map(round => ({
						response: round.response,
						toolCalls: round.toolCalls.map(tc => ({
							name: tc.name,
							arguments: tc.arguments,
							id: tc.id,
						})),
						reasoningText: round.thinking
							? (Array.isArray(round.thinking.text) ? round.thinking.text.join('') : round.thinking.text)
							: undefined,
						timestamp: round.timestamp,
					})),
				}));

				// Start the transcript (will replay history if no file exists yet)
				await this._sessionTranscriptService.startSession(sessionId, undefined, history.length > 0 ? history : undefined);
			}

			if (isFirstTurn) {
				const startHookResult = await this.executeSessionStartHook({
					source: 'new',
				}, sessionId, outputStream, token);
				if (startHookResult.additionalContext) {
					this.additionalHookContext = startHookResult.additionalContext;
					this._logService.info('[ToolCallingLoop] SessionStart hook provided context for session');
				}
			}
		}

		// Log the user message for the transcript (no-ops if session was not started)
		this._sessionTranscriptService.logUserMessage(
			sessionId,
			this.turn.request.message,
		);
	}

	public async run(outputStream: ChatResponseStream | undefined, token: CancellationToken): Promise<IToolCallLoopResult> {
		const agentName = (this.options.request as { subAgentName?: string }).subAgentName
			?? (this.options.request as { participant?: string }).participant
			?? 'GitHub Copilot Chat';

		// Extract custom mode name for debug logging (kept separate from agentName to avoid metric cardinality)
		const modeInstructions = (this.options.request as { modeInstructions2?: { name?: string; isBuiltin?: boolean } }).modeInstructions2;
		const customModeName = modeInstructions?.name && !modeInstructions.isBuiltin ? modeInstructions.name : undefined;

		// If this is a subagent request, look up the parent trace context stored by the parent agent's execute_tool span
		// Try subAgentInvocationId first (unique per subagent, supports parallel), then request-level key
		const subAgentInvocationId = this.options.request.subAgentInvocationId;
		const parentRequestId = this.options.request.parentRequestId;
		const parentTraceContext = (subAgentInvocationId
			? this._otelService.getStoredTraceContext(`subagent:invocation:${subAgentInvocationId}`)
			: undefined)
			?? (() => {
				// For request-level fallback, read and re-store so parallel subagents can all read it
				if (!parentRequestId) { return undefined; }
				const ctx = this._otelService.getStoredTraceContext(`subagent:request:${parentRequestId}`);
				if (ctx) { this._otelService.storeTraceContext(`subagent:request:${parentRequestId}`, ctx); }
				return ctx;
			})();

		// Get the VS Code chat session ID from the CapturingToken (same mechanism as old debug panel)
		const chatSessionId = getCurrentCapturingToken()?.chatSessionId;
		const parentChatSessionId = getCurrentCapturingToken()?.parentChatSessionId;
		const debugLogLabel = getCurrentCapturingToken()?.debugLogLabel;

		return this._otelService.startActiveSpan(
			`invoke_agent ${agentName}`,
			{
				kind: SpanKind.INTERNAL,
				attributes: {
					[GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT,
					[GenAiAttr.PROVIDER_NAME]: GenAiProviderName.GITHUB,
					[GenAiAttr.AGENT_NAME]: agentName,
					[GenAiAttr.CONVERSATION_ID]: this.options.conversation.sessionId,
					[CopilotChatAttr.SESSION_ID]: this.options.conversation.sessionId,
					...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}),
					...(parentChatSessionId ? { [CopilotChatAttr.PARENT_CHAT_SESSION_ID]: parentChatSessionId } : {}),
					...(debugLogLabel ? { [CopilotChatAttr.DEBUG_LOG_LABEL]: debugLogLabel } : {}),
					...(customModeName ? { 'copilot_chat.mode_name': customModeName } : {}),
					...workspaceMetadataToOTelAttributes(resolveWorkspaceOTelMetadata(this._gitService)),
				},
				parentTraceContext,
			},
			async (span) => {
				const otelStartTime = Date.now();

				// Register this session as a child of its parent so that debug
				// log entries are routed to a dedicated child JSONL file.
				// parentChatSessionId is only set on subagent requests
				// (see CapturingToken setup in defaultIntentRequestHandler).
				if (chatSessionId) {
					const fileLogger = this._instantiationService.invokeFunction(accessor =>
						accessor.get(IChatDebugFileLoggerService));

					// Register this session as a child of its parent so that debug
					// log entries are routed to a dedicated child JSONL file.
					// parentChatSessionId is only set on subagent requests
					// (see CapturingToken setup in defaultIntentRequestHandler).
					if (parentChatSessionId) {
						const childLabel = debugLogLabel ?? `runSubagent-${agentName}`;
						fileLogger.startChildSession(
							chatSessionId, parentChatSessionId, childLabel, parentTraceContext?.spanId);
						// Also register the invoke_agent span's ID so that hook spans
						// (whose parentSpanId is this span) are routed to the child session.
						const invokeSpanId = span.getSpanContext()?.spanId;
						if (invokeSpanId) {
							fileLogger.registerSpanSession(invokeSpanId, chatSessionId);
						}
					} else {
						// For top-level agent invocations (not subagents), start a debug
						// file logging session so entries are flushed to JSONL on disk.
						// This is idempotent — calling startSession on an already-started
						// session just promotes it if needed.
						fileLogger.startSession(chatSessionId).catch(() => { /* best effort */ });
					}
				}

				// Emit session start event and metric for top-level agent invocations (not subagents)
				if (!parentTraceContext) {
					GenAiMetrics.incrementSessionCount(this._otelService);
					try {
						const endpoint = await this._endpointProvider.getChatEndpoint(this.options.request);
						emitSessionStartEvent(this._otelService, this.options.conversation.sessionId, endpoint.model, agentName);
					} catch {
						emitSessionStartEvent(this._otelService, this.options.conversation.sessionId, 'unknown', agentName);
					}
				}

				// Set request model from the endpoint
				try {
					const endpoint = await this._endpointProvider.getChatEndpoint(this.options.request);
					span.setAttribute(GenAiAttr.REQUEST_MODEL, endpoint.model);
				} catch { /* endpoint not available yet, will be set on response */ }

				// Always capture user input message for the debug panel
				{
					const userMessage = this.turn.request.message;
					span.setAttribute(GenAiAttr.INPUT_MESSAGES, truncateForOTel(JSON.stringify([
						{ role: 'user', parts: [{ type: 'text', content: userMessage }] }
					])));
					// Emit user_message span event for real-time debug panel streaming
					if (userMessage) {
						span.addEvent('user_message', { content: userMessage, ...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}) });
					}
				}

				// Accumulate token usage across all LLM turns per GenAI agent span spec
				let totalInputTokens = 0;
				let totalOutputTokens = 0;
				let lastResolvedModel: string | undefined;
				let turnIndex = 0;
				const tokenListener = this.onDidReceiveResponse(({ response }) => {
					const turnInputTokens = response.type === ChatFetchResponseType.Success ? (response.usage?.prompt_tokens || 0) : 0;
					const turnOutputTokens = response.type === ChatFetchResponseType.Success ? (response.usage?.completion_tokens || 0) : 0;
					if (response.type === ChatFetchResponseType.Success && response.usage) {
						totalInputTokens += turnInputTokens;
						totalOutputTokens += turnOutputTokens;
					}
					if (response.type === ChatFetchResponseType.Success && response.resolvedModel) {
						lastResolvedModel = response.resolvedModel;
					}
					emitAgentTurnEvent(this._otelService, turnIndex, turnInputTokens, turnOutputTokens, 0);
					turnIndex++;
				});

				try {
					const result = await this._runLoop(outputStream, token, span, chatSessionId);
					span.setAttributes({
						[CopilotChatAttr.TURN_COUNT]: result.toolCallRounds.length,
						[GenAiAttr.USAGE_INPUT_TOKENS]: totalInputTokens,
						[GenAiAttr.USAGE_OUTPUT_TOKENS]: totalOutputTokens,
						...(lastResolvedModel ? { [GenAiAttr.RESPONSE_MODEL]: lastResolvedModel } : {}),
					});
					// Always capture agent output message and tool definitions for the debug panel
					{
						const lastRound = result.toolCallRounds.at(-1);
						if (lastRound?.response) {
							const responseText = Array.isArray(lastRound.response) ? lastRound.response.join('') : lastRound.response;
							span.setAttribute(GenAiAttr.OUTPUT_MESSAGES, truncateForOTel(JSON.stringify([
								{ role: 'assistant', parts: [{ type: 'text', content: responseText }] }
							])));
						}
						// Log tool definitions once on the agent span (same set across all turns)
						if (result.availableTools.length > 0) {
							span.setAttribute(GenAiAttr.TOOL_DEFINITIONS, JSON.stringify(
								result.availableTools.map(t => ({ type: 'function', name: t.name, description: t.description }))
							));
						}
					}
					span.setStatus(SpanStatusCode.OK);

					// Record agent-level metrics
					const durationSec = (Date.now() - otelStartTime) / 1000;
					GenAiMetrics.recordAgentDuration(this._otelService, agentName, durationSec);
					GenAiMetrics.recordAgentTurnCount(this._otelService, agentName, result.toolCallRounds.length);

					return result;
				} catch (err) {
					span.setStatus(SpanStatusCode.ERROR, err instanceof Error ? err.message : String(err));
					span.setAttribute(StdAttr.ERROR_TYPE, err instanceof Error ? err.constructor.name : 'Error');
					throw err;
				} finally {
					tokenListener.dispose();
				}
			},
		);
	}

	private async _runLoop(outputStream: ChatResponseStream | undefined, token: CancellationToken, agentSpan?: ISpanHandle, chatSessionId?: string): Promise<IToolCallLoopResult> {
		let i = 0;
		let lastResult: IToolCallSingleResult | undefined;
		let lastRequestMessagesStartingIndexForRun: number | undefined;
		let stopHookActive = false;
		const sessionId = this.options.conversation.sessionId;

		// Store span context so runOne() can emit tools_available on first call
		this.agentSpan = agentSpan;
		this.chatSessionIdForTools = chatSessionId;
		this.toolsAvailableEmitted = false;

		while (true) {
			if (lastResult && i++ >= this.options.toolCallLimit) {
				// In Autopilot mode, silently increase the limit and continue
				// without showing the confirmation dialog, up to a hard cap.
				const permLevel = this.options.request.permissionLevel;
				if (permLevel === 'autopilot' && this.options.toolCallLimit < 200) {
					this.options.toolCallLimit = Math.min(Math.round(this.options.toolCallLimit * 3 / 2), 200);
					this.showAutopilotProgress(outputStream, l10n.t('Extending tool call limit with Autopilot...'), l10n.t('Extended tool call limit with Autopilot'));
				} else {
					lastResult = this.hitToolCallLimit(outputStream, lastResult);
					break;
				}
			}

			// Check if VS Code has requested we gracefully yield before starting the next iteration.
			// In autopilot mode, don't yield until the task is actually complete.
			if (lastResult && this.options.yieldRequested?.()) {
				if (this.options.request.permissionLevel !== 'autopilot' || this.taskCompleted) {
					break;
				}
			}

			try {
				const turnId = String(i);
				this._sessionTranscriptService.logAssistantTurnStart(sessionId, turnId);
				agentSpan?.addEvent('turn_start', { turnId, ...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}) });
				this.resolveAutopilotProgress();
				const result = await this.runOne(outputStream, i, token);
				if (lastRequestMessagesStartingIndexForRun === undefined) {
					lastRequestMessagesStartingIndexForRun = result.lastRequestMessages.length - 1;
				}
				lastResult = {
					...result,
					hadIgnoredFiles: lastResult?.hadIgnoredFiles || result.hadIgnoredFiles
				};

				this.toolCallRounds.push(result.round);
				this._sessionTranscriptService.logAssistantTurnEnd(sessionId, turnId);
				agentSpan?.addEvent('turn_end', { turnId, ...(chatSessionId ? { [CopilotChatAttr.CHAT_SESSION_ID]: chatSessionId } : {}) });

				// If the model produced productive (non-task_complete) tool calls after being nudged,
				// reset the stop hook flag and iteration count so it can be nudged again.
				if (this.autopilotStopHookActive && result.round.toolCalls.length && !result.round.toolCalls.some(tc => tc.name === ToolCallingLoop.TASK_COMPLETE_TOOL_NAME)) {
					this.autopilotStopHookActive = false;
					this.autopilotIterationCount = 0;
				}

				if (!result.round.toolCalls.length || result.response.type !== ChatFetchResponseType.Success) {
					// If cancelled, don't run stop hooks - just break immediately
					if (token.isCancellationRequested) {
						break;
					}

					// In auto-approve modes, auto-retry on transient errors (not rate-limited or quota-exceeded)
					if (result.response.type !== ChatFetchResponseType.Success && this.shouldAutoRetry(result.response)) {
						this.autopilotRetryCount++;
						this._logService.info(`[ToolCallingLoop] Auto-retrying on error (attempt ${this.autopilotRetryCount}/${ToolCallingLoop.MAX_AUTOPILOT_RETRIES}): ${result.response.type}`);
						if (this.options.request.permissionLevel === 'autopilot') {
							this.showAutopilotProgress(outputStream, l10n.t('Request failed, retrying with Autopilot...'), l10n.t('Request failed, retried with Autopilot'));
						} else {
							this.showAutopilotProgress(outputStream, l10n.t('Request failed, retrying request...'), l10n.t('Request failed, retried request'));
						}
						await timeout(1000, token);
						continue;
					}

					// Before stopping, execute the stop hook
					if (this.options.request.subAgentInvocationId) {
						const stopHookResult = await this.executeSubagentStopHook({
							agent_id: this.options.request.subAgentInvocationId,
							agent_type: this.options.request.subAgentName ?? 'default',
							stop_hook_active: stopHookActive,
						}, sessionId, outputStream, token);
						const joinedReasons = stopHookResult.reasons?.join('; ');
						this._logService.info(`[ToolCallingLoop] Subagent stop hook result: shouldContinue=${stopHookResult.shouldContinue}, reasons=${joinedReasons}`);
						if (stopHookResult.shouldContinue && stopHookResult.reasons?.length) {
							// The stop hook blocked stopping - show reasons and continue
							this.showSubagentStopHookBlockedMessage(outputStream, stopHookResult.reasons);
							// Store the joined reasons so it can be passed to the model in the next prompt
							this.stopHookReason = joinedReasons;
							// Also persist on the round so it survives across turns
							result.round.hookContext = formatHookContext(stopHookResult.reasons);
							this._logService.info(`[ToolCallingLoop] Subagent stop hook blocked, continuing with reasons: ${joinedReasons}`);
							stopHookActive = true;
							continue;
						}
					} else {
						const stopHookResult = await this.executeStopHook({ stop_hook_active: stopHookActive }, sessionId, outputStream, token);
						const joinedReasons = stopHookResult.reasons?.join('; ');
						this._logService.info(`[ToolCallingLoop] Stop hook result: shouldContinue=${stopHookResult.shouldContinue}, reasons=${joinedReasons}`);
						if (stopHookResult.shouldContinue && stopHookResult.reasons?.length) {
							// The stop hook blocked stopping - show reasons and continue
							this.showStopHookBlockedMessage(outputStream, stopHookResult.reasons);
							// Store the joined reasons so it can be passed to the model in the next prompt
							this.stopHookReason = joinedReasons;
							// Also persist on the round so it survives across turns
							result.round.hookContext = formatHookContext(stopHookResult.reasons);
							this._logService.info(`[ToolCallingLoop] Stop hook blocked, continuing with reasons: ${joinedReasons}`);
							stopHookActive = true;
							this.stopHookUserInitiated = true;
							continue;
						}
					}

					// In Autopilot mode, check if the task is actually done before stopping.
					// This acts as an internal stop hook that keeps the agent churning until completion.
					if (this.options.request.permissionLevel === 'autopilot' && result.response.type === ChatFetchResponseType.Success) {
						const autopilotContinue = this.shouldAutopilotContinue(result);
						if (autopilotContinue) {
							this._logService.info(`[ToolCallingLoop] Autopilot internal stop hook: continuing because task may not be complete`);
							this.showAutopilotProgress(outputStream, l10n.t('Continuing with Autopilot: Task not yet complete'), l10n.t('Continued with Autopilot: Task not yet complete'));
							this.stopHookReason = autopilotContinue;
							result.round.hookContext = formatHookContext([autopilotContinue]);
							this.autopilotStopHookActive = true;
							continue;
						}
					}

					break;
				}
			} catch (e) {
				if (isCancellationError(e) && lastResult) {
					break;
				}

				throw e;
			}
		}

		this.resolveAutopilotProgress();

		this.emitReadFileTrajectories().catch(err => {
			this._logService.error('Error emitting read file trajectories', err);
		});

		const toolCallRoundsToDisplay = lastResult.lastRequestMessages.slice(lastRequestMessagesStartingIndexForRun ?? 0).filter((m): m is Raw.ToolChatMessage => m.role === Raw.ChatRole.Tool);
		for (const toolRound of toolCallRoundsToDisplay) {
			const result = this.toolCallResults[toolRound.toolCallId];
			if (result instanceof LanguageModelToolResult2) {
				for (const part of result.content) {
					if (part instanceof LanguageModelDataPart2 && part.mimeType === 'application/pull-request+json' && part.audience?.includes(LanguageModelPartAudience.User)) {
						const data: { uri: string; title: string; description: string; author: string; linkTag: string } = JSON.parse(part.data.toString());
						outputStream?.push(new ChatResponsePullRequestPart({ command: 'github.copilot.chat.openPullRequestReroute', title: l10n.t('View Pull Request {0}', data.linkTag), arguments: [Number(data.linkTag.substring(1))] }, data.title, data.description, data.author, data.linkTag));
					}
				}
			}
		}
		return { ...lastResult, toolCallRounds: this.toolCallRounds, toolCallResults: this.toolCallResults };
	}

	private async emitReadFileTrajectories() {
		// We are tuning our `read_file` tool to read files more effectively and efficiently.
		// This is a likely-temporary function that emits trajectory telemetry read_files
		// at the end of each agentic loop so that we can do so, in addition to the
		// per-call telemetry in ReadFileTool

		function tryGetRFArgs(call: IToolCall): ReadFileParams | undefined {
			if (call.name !== ToolName.ReadFile) {
				return undefined;
			}
			try {
				return JSON.parse(call.arguments);
			} catch {
				return undefined;
			}
		}

		const consumed = new Set<string>();
		const tcrs = this.toolCallRounds;
		for (let i = 0; i < tcrs.length; i++) {
			const { toolCalls } = tcrs[i];
			for (const call of toolCalls) {
				if (consumed.has(call.id)) {
					continue;
				}
				const args = tryGetRFArgs(call);
				if (!args) {
					continue;
				}

				const seqArgs = [args];
				consumed.add(call.id);

				for (let k = i + 1; k < tcrs.length; k++) {
					for (const call2 of tcrs[k].toolCalls) {
						if (consumed.has(call2.id)) {
							continue;
						}

						const args2 = tryGetRFArgs(call2);
						if (!args2 || args2.filePath !== args.filePath) {
							continue;
						}

						consumed.add(call2.id);
						seqArgs.push(args2);
					}
				}

				let chunkSizeTotal = 0;
				let chunkSizeNo = 0;
				for (const arg of seqArgs) {
					if ('startLine' in arg) {
						chunkSizeNo++;
						chunkSizeTotal += arg.endLine - arg.startLine + 1;
					} else if (arg.limit) {
						chunkSizeNo++;
						chunkSizeTotal += arg.limit;
					}
				}

				/* __GDPR__
					"readFileTrajectory" : {
						"owner": "connor4312",
						"comment": "read_file tool invokation trajectory",
						"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model that invoked the tool" },
						"rounds": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of times the file was read sequentially" },
						"avgChunkSize": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The number of lines read at a time" }
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('readFileTrajectory',
					{
						// model will be undefined in the simulator
						model: this.options.request.model?.id,
					},
					{
						rounds: seqArgs.length,
						avgChunkSize: chunkSizeNo > 0 ? Math.round(chunkSizeTotal / chunkSizeNo) : -1,
					}
				);
			}
		}
	}

	private hitToolCallLimit(stream: ChatResponseStream | undefined, lastResult: IToolCallSingleResult) {
		if (stream && this.options.onHitToolCallLimit === ToolCallLimitBehavior.Confirm) {
			const messageString = new MarkdownString(l10n.t({
				message: 'Copilot has been working on this problem for a while. It can continue to iterate, or you can send a new message to refine your prompt. [Configure max requests]({0}).',
				args: [`command:workbench.action.openSettings?${encodeURIComponent('["chat.agent.maxRequests"]')}`],
				comment: 'Link to workbench settings for chat.maxRequests, which controls the maximum number of requests Copilot will make before stopping. This is used in the tool calling loop to determine when to stop iterating on a problem.'
			}));
			messageString.isTrusted = { enabledCommands: ['workbench.action.openSettings'] };

			stream.confirmation(
				l10n.t('Continue to iterate?'),
				messageString,
				{ copilotRequestedRoundLimit: Math.round(this.options.toolCallLimit * 3 / 2) } satisfies IToolCallIterationIncrease,
				[
					l10n.t('Continue'),
					cancelText(),
				]
			);
		}

		lastResult.chatResult = {
			...lastResult.chatResult,
			metadata: {
				...lastResult.chatResult?.metadata,
				maxToolCallsExceeded: true
			} satisfies Partial<IResultMetadata>,
		};

		return lastResult;
	}

	/** Runs a single iteration of the tool calling loop. */
	public async runOne(outputStream: ChatResponseStream | undefined, iterationNumber: number, token: CancellationToken): Promise<IToolCallSingleResult> {
		let availableTools = await this.getAvailableTools(outputStream, token);

		// Emit tools_available on the agent span once, before the first CHAT span
		// starts in fetch(). This lets the debug logger write tools_*.json early.
		if (!this.toolsAvailableEmitted && this.agentSpan && availableTools.length > 0) {
			this.toolsAvailableEmitted = true;
			this.agentSpan.addEvent('tools_available', {
				toolDefinitions: JSON.stringify(availableTools.map(t => ({ type: 'function', name: t.name, description: t.description }))),
				...(this.chatSessionIdForTools ? { [CopilotChatAttr.CHAT_SESSION_ID]: this.chatSessionIdForTools } : {}),
			});
		}

		const context = this.createPromptContext(availableTools, outputStream);
		const isContinuation = context.isContinuation || false;
		markChatExt(this.options.conversation.sessionId, ChatExtPerfMark.WillBuildPrompt);
		let buildPromptResult: IBuildPromptResult;
		try {
			buildPromptResult = await this.buildPrompt2(context, outputStream, token);
		} finally {
			markChatExt(this.options.conversation.sessionId, ChatExtPerfMark.DidBuildPrompt);
		}
		this.throwIfCancelled(token);
		this.turn.addReferences(buildPromptResult.references);
		// Possible the tool call resulted in new tools getting added.
		availableTools = await this.getAvailableTools(outputStream, token);

		// Apply debug prompt/tool overrides from either inline YAML text or a YAML file.
		const promptOverride = this._configurationService.getConfig(ConfigKey.Advanced.DebugPromptOverrideString);
		const promptOverrideFile = this._configurationService.getConfig(ConfigKey.Advanced.DebugPromptOverrideFile);
		let effectiveBuildPromptResult: IBuildPromptResult = buildPromptResult;
		if (promptOverride || promptOverrideFile) {
			const overrideResult = await applyConfiguredPromptOverrides(
				promptOverride,
				promptOverrideFile,
				buildPromptResult.messages,
				availableTools,
				this._fileSystemService,
				this._logService,
			);
			effectiveBuildPromptResult = { ...buildPromptResult, messages: overrideResult.messages };
			availableTools = overrideResult.tools;
		}

		// Ensure task_complete is available in autopilot mode so the model can signal completion
		availableTools = this.ensureAutopilotTools(availableTools);

		const isToolInputFailure = effectiveBuildPromptResult.metadata.get(ToolFailureEncountered);
		const conversationSummary = effectiveBuildPromptResult.metadata.get(SummarizedConversationHistoryMetadata);
		if (conversationSummary) {
			this.turn.setMetadata(conversationSummary);
		}

		// Find the latest summarized round.
		let summarizedAtRoundId: string | undefined;
		for (let i = this.toolCallRounds.length - 1; i >= 0; i--) {
			if (this.toolCallRounds[i].summary) {
				summarizedAtRoundId = this.toolCallRounds[i].id;
				break;
			}
		}
		if (!summarizedAtRoundId) {
			for (const turn of [...context.history].reverse()) {
				for (const round of [...turn.rounds].reverse()) {
					if (round.summary) {
						summarizedAtRoundId = round.id;
						break;
					}
				}
				if (summarizedAtRoundId) {
					break;
				}
			}
		}

		const endpoint = await this._endpointProvider.getChatEndpoint(this.options.request);
		const tokenizer = endpoint.acquireTokenizer();
		const promptTokenLength = await tokenizer.countMessagesTokens(effectiveBuildPromptResult.messages);
		const toolTokenCount = availableTools.length > 0 ? await tokenizer.countToolTokens(availableTools) : 0;
		this.throwIfCancelled(token);
		this._onDidBuildPrompt.fire({ result: effectiveBuildPromptResult, tools: availableTools, promptTokenLength, toolTokenCount });
		this._logService.trace('Built prompt');

		// Tool calls happen during prompt building. Check yield again here to see if we should abort prior to sending off the next request.
		if (iterationNumber > 0 && this.options.yieldRequested?.()) {
			throw new CancellationError();
		}

		// todo@connor4312: can interaction outcome logic be implemented in a more generic way?
		const interactionOutcomeComputer = new InteractionOutcomeComputer(this.options.interactionContext);

		const that = this;
		const responseProcessor = new class implements IResponseProcessor {

			private readonly context = new ResponseProcessorContext(that.options.conversation.sessionId, that.turn, effectiveBuildPromptResult.messages, interactionOutcomeComputer);

			async processResponse(_context: unknown, inputStream: AsyncIterable<IResponsePart>, responseStream: ChatResponseStream, token: CancellationToken): Promise<ChatResult | void> {
				let chatResult: ChatResult | void = undefined;
				if (that.options.responseProcessor) {
					chatResult = await that.options.responseProcessor.processResponse(this.context, inputStream, responseStream, token);
				} else {
					const responseProcessor = that._instantiationService.createInstance(PseudoStopStartResponseProcessor, [], undefined, { subagentInvocationId: that.options.request.subAgentInvocationId });
					await responseProcessor.processResponse(this.context, inputStream, responseStream, token);
				}
				return chatResult;
			}
		}();

		this._logService.trace('Sending prompt to model');

		const streamParticipants = outputStream ? [outputStream] : [];
		let fetchStreamSource: FetchStreamSource | undefined;
		let processResponsePromise: Promise<ChatResult | void> | undefined;
		let stopEarly = false;
		if (outputStream) {
			this.options.streamParticipants?.forEach(fn => {
				streamParticipants.push(fn(streamParticipants[streamParticipants.length - 1]));
			});
			const stream = streamParticipants[streamParticipants.length - 1];

			fetchStreamSource = new FetchStreamSource();
			processResponsePromise = responseProcessor.processResponse(undefined, fetchStreamSource.stream, stream, token);

			// Allows the response processor to do an early stop of the LLM request.
			processResponsePromise.finally(() => {
				// The response processor indicates that it has finished processing the response,
				// so let's stop the request if it's still in flight.
				stopEarly = true;
			});
		}

		if (effectiveBuildPromptResult.messages.length === 0) {
			// /fixTestFailure relies on this check running after processResponse
			fetchStreamSource?.resolve();
			await processResponsePromise;
			await finalizeStreams(streamParticipants);
			throw new EmptyPromptError();
		}

		const promptContextTools = availableTools.length ? availableTools.map(toolInfo => {
			return {
				name: toolInfo.name,
				description: toolInfo.description,
				parameters: toolInfo.inputSchema,
			} satisfies OpenAiFunctionDef;
		}) : undefined;

		let statefulMarker: string | undefined;
		const toolCalls: IToolCall[] = [];
		let thinkingItem: ThinkingDataItem | undefined;
		const shouldDisableThinking = isContinuation && isAnthropicFamily(endpoint) && !ToolCallingLoop.messagesContainThinking(effectiveBuildPromptResult.messages);
		const enableThinking = !shouldDisableThinking;
		let phase: string | undefined;
		let compaction: OpenAIContextManagementResponse | undefined;
		markChatExt(this.options.conversation.sessionId, ChatExtPerfMark.WillFetch);
		const fetchResult = await this.fetch({
			messages: this.applyMessagePostProcessing(effectiveBuildPromptResult.messages, { stripOrphanedToolCalls: isGeminiFamily(endpoint) }),
			turnId: this.turn.id,
			summarizedAtRoundId,
			finishedCb: async (text, index, delta) => {
				fetchStreamSource?.update(text, delta);
				if (delta.copilotToolCalls) {
					toolCalls.push(...delta.copilotToolCalls.map((call): IToolCall => ({
						...call,
						id: this.createInternalToolCallId(call.id),
						arguments: call.arguments === '' ? '{}' : call.arguments
					})));
				}
				if (delta.serverToolCalls) {
					for (const serverCall of delta.serverToolCalls) {
						const result: LanguageModelToolResult2 = {
							content: [new LanguageModelTextPart(JSON.stringify(serverCall.result, undefined, 2))]
						};
						this._requestLogger.logServerToolCall(serverCall.id, serverCall.name, serverCall.args, result);
					}
				}
				if (delta.statefulMarker) {
					statefulMarker = delta.statefulMarker;
				}
				if (delta.thinking) {
					thinkingItem = ThinkingDataItem.createOrUpdate(thinkingItem, delta.thinking);
				}
				if (delta.phase) {
					phase = delta.phase;
				}
				if (delta.contextManagement && isOpenAIContextManagementResponse(delta.contextManagement)) {
					compaction = delta.contextManagement;
				}
				return stopEarly ? text.length : undefined;
			},
			requestOptions: {
				tools: promptContextTools?.map(tool => ({
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.parameters && Object.keys(tool.parameters).length ? tool.parameters : undefined
					},
					type: 'function',
				})),
			},
			userInitiatedRequest: (iterationNumber === 0 && !isContinuation && !this.options.request.subAgentInvocationId && !this.options.request.isSystemInitiated) || this.stopHookUserInitiated,
			modelCapabilities: {
				enableThinking,
			},
		}, token).finally(() => {
			this.stopHookUserInitiated = false;
		});
		markChatExt(this.options.conversation.sessionId, ChatExtPerfMark.DidFetch);

		const promptTokenDetails = await computePromptTokenDetails({
			messages: effectiveBuildPromptResult.messages,
			tokenizer,
			tools: availableTools,
		});
		fetchStreamSource?.resolve();
		const chatResult = await processResponsePromise ?? undefined;

		// Report token usage to the stream for rendering the context window widget
		const stream = streamParticipants[streamParticipants.length - 1];
		if (fetchResult.type === ChatFetchResponseType.Success && fetchResult.usage && stream && this.shouldReportUsageToContextWidget()) {
			stream.usage({
				completionTokens: fetchResult.usage.completion_tokens,
				promptTokens: fetchResult.usage.prompt_tokens,
				outputBuffer: endpoint.maxOutputTokens,
				promptTokenDetails,
			});
		}

		// Validate authentication session upgrade and handle accordingly
		if (
			outputStream &&
			toolCalls.some(tc => tc.name === ToolName.Codebase) &&
			await this._authenticationChatUpgradeService.shouldRequestPermissiveSessionUpgrade()
		) {
			this._authenticationChatUpgradeService.showPermissiveSessionUpgradeInChat(outputStream, this.options.request);
			throw new ToolCallCancelledError(new CancellationError());
		}

		await finalizeStreams(streamParticipants);
		this._onDidReceiveResponse.fire({ interactionOutcome: interactionOutcomeComputer, response: fetchResult, toolCalls });

		this.turn.setMetadata(interactionOutcomeComputer.interactionOutcome);

		const toolInputRetry = isToolInputFailure ? (this.toolCallRounds.at(-1)?.toolInputRetry || 0) + 1 : 0;
		if (fetchResult.type === ChatFetchResponseType.Success) {
			// Store token usage metadata for Anthropic models using Messages API
			if (fetchResult.usage && isAnthropicFamily(endpoint)) {
				this.turn.setMetadata(new AnthropicTokenUsageMetadata(
					fetchResult.usage.prompt_tokens,
					fetchResult.usage.completion_tokens
				));
			}

			thinkingItem?.updateWithFetchResult(fetchResult);

			// Log the assistant message to the transcript
			const transcriptToolRequests: ToolRequest[] = toolCalls.map(tc => ({
				toolCallId: tc.id,
				name: tc.name,
				arguments: tc.arguments,
				type: 'function' as const,
			}));
			this._sessionTranscriptService.logAssistantMessage(
				this.options.conversation.sessionId,
				fetchResult.value,
				transcriptToolRequests,
				thinkingItem ? (Array.isArray(thinkingItem.text) ? thinkingItem.text.join('') : thinkingItem.text) : undefined,
			);

			return {
				response: fetchResult,
				round: ToolCallRound.create({
					response: fetchResult.value,
					toolCalls,
					toolInputRetry,
					statefulMarker,
					thinking: thinkingItem,
					phase,
					phaseModelId: phase ? endpoint.model : undefined,
					compaction,
				}),
				chatResult,
				hadIgnoredFiles: buildPromptResult.hasIgnoredFiles,
				lastRequestMessages: effectiveBuildPromptResult.messages,
				availableTools,
			};
		}

		return {
			response: fetchResult,
			hadIgnoredFiles: buildPromptResult.hasIgnoredFiles,
			lastRequestMessages: effectiveBuildPromptResult.messages,
			availableTools,
			round: new ToolCallRound('', toolCalls, toolInputRetry),
		};
	}

	/**
	 * Sometimes 4o reuses tool call IDs, so make sure they are unique. Really we should restructure how tool calls and results are represented
	 * to not expect them to be globally unique.
	 */
	private createInternalToolCallId(toolCallId: string): string {
		// Note- if this code is ever removed, these IDs will still exist in persisted session metadata!
		return toolCallId + `__vscode-${ToolCallingLoop.NextToolCallId++}`;
	}

	private applyMessagePostProcessing(messages: Raw.ChatMessage[], options?: { stripOrphanedToolCalls?: boolean }): Raw.ChatMessage[] {
		return this.validateToolMessages(
			ToolCallingLoop.stripInternalToolCallIds(messages), options);
	}

	public static stripInternalToolCallIds(messages: Raw.ChatMessage[]): Raw.ChatMessage[] {
		return messages.map(m => {
			if (m.role === Raw.ChatRole.Assistant) {
				return {
					...m,
					toolCalls: m.toolCalls?.map(tc => ({
						...tc,
						id: tc.id.split('__vscode-')[0]
					}))
				};
			} else if (m.role === Raw.ChatRole.Tool) {
				return {
					...m,
					toolCallId: m.toolCallId?.split('__vscode-')[0]
				};
			}

			return m;
		});
	}

	public static messagesContainThinking(messages: Raw.ChatMessage[]): boolean {
		let lastUserMessageIndex = -1;
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === Raw.ChatRole.User) {
				lastUserMessageIndex = i;
				break;
			}
		}

		// If no user message found, return false to disable thinking
		if (lastUserMessageIndex === -1) {
			return false;
		}

		for (let i = lastUserMessageIndex + 1; i < messages.length; i++) {
			const m = messages[i];
			if (m.role !== Raw.ChatRole.Assistant) {
				continue;
			}
			return Array.isArray(m.content) && m.content.some(part =>
				part.type === Raw.ChatCompletionContentPartKind.Opaque && rawPartAsThinkingData(part) !== undefined
			);
		}
		return false;
	}

	/**
	 * Apparently we can render prompts which have a tool message which is out of place.
	 * Don't know why this is happening, but try to detect this and fix it up.
	 *
	 * Validates tool messages in the conversation, ensuring:
	 * 1. Tool result messages have a matching tool_call in the preceding assistant message
	 * 2. (When stripOrphanedToolCalls is set) Every tool_call in an assistant message has
	 *    a matching tool result message. This prevents errors with models like Gemini which
	 *    strictly require 1:1 function_call ↔ function_response pairing.
	 *
	 * Returns the validated messages and an array of reasons for any corrections made.
	 */
	public static validateToolMessagesCore(messages: Raw.ChatMessage[], options?: { stripOrphanedToolCalls?: boolean }): { messages: Raw.ChatMessage[]; filterReasons: string[]; strippedToolCallCount: number } {
		const filterReasons: string[] = [];
		let strippedToolCallCount = 0;
		let previousAssistantMessage: Raw.AssistantChatMessage | undefined;
		const filtered = messages.filter(m => {
			if (m.role === Raw.ChatRole.Assistant) {
				previousAssistantMessage = m;
			} else if (m.role === Raw.ChatRole.Tool) {
				if (!previousAssistantMessage) {
					// No previous assistant message
					filterReasons.push('noPreviousAssistantMessage');
					return false;
				}

				if (!previousAssistantMessage.toolCalls?.length) {
					// The assistant did not call any tools
					filterReasons.push('noToolCalls');
					return false;
				}

				const toolCall = previousAssistantMessage.toolCalls.find(tc => tc.id === m.toolCallId);
				if (!toolCall) {
					// This tool call is excluded
					return false;
				}
			}

			return true;
		});

		// Second pass: strip tool_calls from assistant messages that lack matching tool result messages.
		// This prevents sending orphaned tool_calls that would cause errors with models like Gemini
		// which strictly require every function_call to have a corresponding function_response.
		// Gated behind stripOrphanedToolCalls to limit scope to models that need it.
		if (!options?.stripOrphanedToolCalls) {
			return { messages: filtered, filterReasons, strippedToolCallCount };
		}

		for (let i = 0; i < filtered.length; i++) {
			const m = filtered[i];
			if (m.role !== Raw.ChatRole.Assistant || !m.toolCalls?.length) {
				continue;
			}

			// Collect tool result IDs that follow this assistant message (up to the next assistant message)
			const toolResultIds = new Set<string>();
			for (let j = i + 1; j < filtered.length; j++) {
				const next = filtered[j];
				if (next.role === Raw.ChatRole.Assistant) {
					break;
				}
				if (next.role === Raw.ChatRole.Tool && next.toolCallId !== undefined) {
					toolResultIds.add(next.toolCallId);
				}
			}

			const orphanedToolCalls = m.toolCalls.filter(tc => !toolResultIds.has(tc.id));
			if (orphanedToolCalls.length > 0) {
				strippedToolCallCount += orphanedToolCalls.length;
				const validToolCalls = m.toolCalls.filter(tc => toolResultIds.has(tc.id));
				// Mutate in place — the assistant message was already shallow-copied by stripInternalToolCallIds
				(m as Mutable<Raw.AssistantChatMessage>).toolCalls = validToolCalls.length > 0 ? validToolCalls : undefined;
			}
		}

		return { messages: filtered, filterReasons, strippedToolCallCount };
	}

	private validateToolMessages(messages: Raw.ChatMessage[], options?: { stripOrphanedToolCalls?: boolean }): Raw.ChatMessage[] {
		const { messages: filtered, filterReasons, strippedToolCallCount } = ToolCallingLoop.validateToolMessagesCore(messages, options);

		if (filterReasons.length || strippedToolCallCount > 0) {
			const allReasons = strippedToolCallCount > 0 ? [...filterReasons, `orphanedToolCalls:${strippedToolCallCount}`] : filterReasons;
			const filterReasonsStr = allReasons.join(', ');
			this._logService.warn('Filtered invalid tool messages: ' + filterReasonsStr);
			/* __GDPR__
					"toolCalling.invalidToolMessages" : {
						"owner": "roblourens",
						"comment": "Provides info about invalid tool messages that were rendered in a prompt",
						"filterReasons": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Reasons for filtering the messages and stripping orphaned tool calls." },
						"filterCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of filtered messages." },
						"strippedToolCallCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Count of orphaned tool_calls stripped from assistant messages." }
					}
				*/
			this._telemetryService.sendMSFTTelemetryEvent('toolCalling.invalidToolMessages', {
				filterReasons: filterReasonsStr,
			}, {
				filterCount: filterReasons.length,
				strippedToolCallCount,
			});
		}

		return filtered;
	}

	private async buildPrompt2(buildPromptContext: IBuildPromptContext, stream: ChatResponseStream | undefined, token: CancellationToken): Promise<IBuildPromptResult> {
		const progress: Progress<ChatResponseReferencePart | ChatResponseProgressPart> = {
			report(obj) {
				stream?.push(obj);
			}
		};

		const buildPromptResult = await this.buildPrompt(buildPromptContext, progress, token);
		for (const metadata of buildPromptResult.metadata.getAll(ToolResultMetadata)) {
			this.logToolResult(buildPromptContext, metadata);
			this.toolCallResults[metadata.toolCallId] = metadata.result;
		}

		if (buildPromptResult.metadata.getAll(ToolResultMetadata).some(r => r.isCancelled)) {
			throw new CancellationError();
		}

		return buildPromptResult;
	}


	private logToolResult(buildPromptContext: IBuildPromptContext, metadata: ToolResultMetadata) {
		if (this.toolCallResults[metadata.toolCallId]) {
			return; // already logged this on a previous turn
		}

		const lastTurn = this.toolCallRounds.at(-1);
		let originalCall = lastTurn?.toolCalls.find(tc => tc.id === metadata.toolCallId);
		if (!originalCall) {
			const byRef = buildPromptContext.tools?.toolReferences.find(r => r.id === metadata.toolCallId);
			if (byRef) {
				originalCall = { id: byRef.id, arguments: JSON.stringify(byRef.input), name: byRef.name };
			}
		}

		if (originalCall) {
			this._requestLogger.logToolCall(originalCall.id || generateUuid(), originalCall.name, originalCall.arguments, metadata.result, lastTurn?.thinking);
		}
	}
}

async function finalizeStreams(streams: readonly ChatResponseStream[]) {
	for (const stream of streams) {
		await tryFinalizeResponseStream(stream);
	}
}

export class EmptyPromptError extends Error {
	constructor() {
		super('Empty prompt');
	}
}

export interface IToolCallSingleResult {
	response: ChatResponse;
	round: IToolCallRound;
	chatResult?: ChatResult; // TODO should just be metadata
	hadIgnoredFiles: boolean;
	lastRequestMessages: Raw.ChatMessage[];
	availableTools: readonly LanguageModelToolInformation[];
}

export interface IToolCallLoopResult extends IToolCallSingleResult {
	toolCallRounds: IToolCallRound[];
	toolCallResults: Record<string, LanguageModelToolResult2>;
}
