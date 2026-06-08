/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, ChatParticipantToolToken, Uri } from 'vscode';
import { IEndpointProvider } from '../../../../../lib/node/chatLibMain';
import { ILogger, ILogService } from '../../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry';
import { LazyStatefulPromise, Queue } from '../../../../../util/vs/base/common/async';
import { Disposable, MutableDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext } from '../../../../prompt/common/intents';
import { ITodoListContextProvider } from '../../../../prompt/node/todoListContextProvider';
import { ToolName } from '../../../../tools/common/toolNames';
import { normalizeToolSchema } from '../../../../tools/common/toolSchemaNormalizer';
import { IToolsService } from '../../../../tools/common/toolsService';
import { BackgroundTodoAgentSessionHistoryStore, ReadOnlyTurnHistory } from './backgroundTodoAgentSessionHistoryStore';
import { ChatFetchResponseType, ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { renderPromptElement } from '../../base/promptRenderer';
import { BackgroundTodoPrompt } from './backgroundTodoAgentPrompt';
import { CancellationTokenSource } from '../../../../../util/vs/base/common/cancellation';

/**
 * External state the policy needs but does not own.
 * Callers construct this once and pass it in.
 */
export interface IBackgroundTodoPolicyInput {
	/** Whether the combined background todo agent gate is enabled. */
	readonly backgroundTodoAgentEnabled: boolean;
	/** Whether the user explicitly referenced the todo tool (e.g. `#todo`), used for diagnostics. */
	readonly todoToolExplicitlyEnabled: boolean;
	/** Whether the current prompt is the main agent prompt. */
	readonly isAgentPrompt: boolean;
	/** The current prompt context for delta computation. */
	readonly promptContext: IBuildPromptContext;
	/** ID of the current user turn, used to reset turn-scoped policy backoff. */
	readonly turnId?: string;
	/** Whether a todo list already exists for this session. `undefined` means unknown. */
	readonly todoListExists?: boolean;
}


const enum BackgroundTodoAgentProcessorState {
	Idle = 'Idle',
	InProgress = 'InProgress',
}

type ToolCall = { name: string; arguments: string; id: string };

export class BackgroundTodoAgentProcessor extends Disposable {
	private readonly sessionHistoryStore = this._register(new BackgroundTodoAgentSessionHistoryStore());
	private readonly queue = this._register(new Queue());
	private readonly backOffTracker = new BackOffTracker();
	private readonly logger: ILogger;

	private state = BackgroundTodoAgentProcessorState.Idle;

	/**
	 * Per-generation cancellation source. `cancel()` aborts the in-flight and
	 * queued work of the current generation and installs a fresh source, so the
	 * processor stays reusable for later turns (mirrors BackgroundSummarizer).
	 *
	 * Held in a {@link MutableDisposable} so the active source is disposed both
	 * when it is replaced (on `cancel()`) and when the processor is disposed.
	 */
	private readonly _cts = this._register(new MutableDisposable<CancellationTokenSource>());
	private get cts(): CancellationTokenSource {
		return this._cts.value!;
	}

	private oldTurnTodos: string | undefined = undefined;

	private currentTurnId: string | undefined;
	private currentUserRequest: string | undefined;

	constructor(
		private readonly sessionId: string,
		private readonly sessionResource: string | undefined,
		private readonly toolsService: IToolsService,
		private readonly telemetryService: ITelemetryService,
		private readonly instantiationService: IInstantiationService,
		logService: ILogService
	) {
		super();
		this._cts.value = new CancellationTokenSource();
		this.currentTurnId = undefined;
		this.logger = logService.createSubLogger(['BackgroundTodoAgentProcessor', sessionId]);
	}

	private lazyTodoListContextProvider = new LazyStatefulPromise(() =>
		this.instantiationService.invokeFunction(async (accessor) => accessor.get<ITodoListContextProvider>(ITodoListContextProvider)));

	private lazyEndpointProvider = new LazyStatefulPromise(() =>
		this.instantiationService.invokeFunction(async (accessor) => accessor.get<IEndpointProvider>(IEndpointProvider)));


	trackTurnRound(promptContext: IBuildPromptContext, token: CancellationToken) {
		// Capture the current generation synchronously: if cancel() runs while this
		// task is still queued, the captured token is already cancelled so the task
		// bails, while a fresh generation handles future turns.
		const cts = this.cts;
		this.queue.queue(async () => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			const turnId = promptContext.conversation?.getLatestTurn().id;

			if (turnId === undefined) {
				this.logger.warn('skipping turn round: no turn ID found in prompt context');
				return;
			}

			const toolInvocationToken = promptContext.tools?.toolInvocationToken;
			if (toolInvocationToken === undefined) {
				this.logger.error(`no tool invocation token found for ${turnId} in session ${this.sessionId}`);
				return;
			}

			if (this.currentTurnId === undefined) {
				// First run for a turn
				this.logger.debug(`starting to track turn ${turnId}`);
				this.currentTurnId = turnId;
				this.currentUserRequest = promptContext.query;
				this.backOffTracker.reset();
				// clear existing todos
				await this.clearCurrentTodos(toolInvocationToken);
			}

			if (turnId !== this.currentTurnId) {
				this.logger.error(`tracked not current turn ID ${turnId} for session ${this.sessionId}`);
				return;
			}

			this.sessionHistoryStore.trackPromptContext(turnId, promptContext);

			// Abort this in-turn pass when EITHER the request stops (stop button or
			// the turn ending) OR the processor generation is cancelled.
			const linkedCts = new CancellationTokenSource(token);
			const sub = cts.token.onCancellationRequested(() => linkedCts.cancel());
			try {
				// TODO: block the queue?
				await this.doWork(turnId, toolInvocationToken, false, linkedCts.token);
			} finally {
				sub.dispose();
				linkedCts.dispose();
			}
		});
	}

	endTurn(turnId: string, toolInvocationToken: ChatParticipantToolToken) {
		// Capture the current generation synchronously (see trackTurnRound).
		const cts = this.cts;
		return this.queue.queue(async () => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			try {
				if (this.currentTurnId !== turnId) {
					this.logger.error(`Requested end turn ${turnId} but current tracked turn is ${this.currentTurnId}`);
					return;
				}

				this.logger.debug(`ending turn ${turnId}, running final pass`);

				// Use the processor generation token, NOT the request token: the
				// request token is (expectedly) cancelled once the turn is over, which
				// would abort this legitimate final pass. cancel() still stops us here.
				await this.doWork(turnId, toolInvocationToken, true, cts.token);

				// store current todos
				const oldTodos = await this.getCurrentTodoContext();
				if (oldTodos !== undefined) {
					this.oldTurnTodos = oldTodos;
				}
			} finally {
				if (this.currentTurnId === turnId) {
					this.currentTurnId = undefined;
				}
			}
		});
	}

	cancel() {
		// Once disposed the generation is already aborted (see dispose()) and the
		// queue is torn down, so there is nothing to reset. Guard here because the
		// endTurn() timeout fallback in agentIntent.ts may call cancel() after the
		// session — and thus this processor — has been disposed.
		if (this._store.isDisposed) {
			return;
		}
		this.logger.debug('cancelling background todo agent generation');
		// Abort the current generation and install a fresh one so the processor
		// stays reusable for later turns (mirrors BackgroundSummarizer.cancel()).
		// We deliberately do NOT clear the queue: Limiter.clear() drops queued
		// tasks without settling their promises, which would hang the awaited
		// endTurn() in agentIntent.ts. Queued tasks instead bail via their
		// captured, now-cancelled token.
		this.cts.cancel();
		// Assigning a new source disposes the previous (now-cancelled) one.
		this._cts.value = new CancellationTokenSource();
		this.currentTurnId = undefined;
	}

	override dispose(): void {
		// Abort any in-flight/queued generation before tearing down so pending
		// passes observe cancellation rather than running against disposed state.
		// The queue, the session history store and the MutableDisposable holding
		// the active source are all registered, so super.dispose() releases them.
		this._cts.value?.cancel();
		super.dispose();
	}

	private async doWork(turnId: string, toolInvocationToken: ChatParticipantToolToken, isFinal: boolean, token: CancellationToken) {
		if (this.state === BackgroundTodoAgentProcessorState.InProgress) {
			this.logger.debug(`skipping pass for turn ${turnId}: a pass is already in progress`);
			return;
		}

		try {
			this.state = BackgroundTodoAgentProcessorState.InProgress;

			const history = this.sessionHistoryStore.getTurnHistory(turnId);
			if (history === undefined || history.new.length === 0) {
				this.logger.debug(`skipping pass for turn ${turnId}: no unprocessed history`);
				return;
			}

			if (!this.backOffTracker.isReady(history.unprocessedSubstantiveRoundCount) && !isFinal) {
				this.logger.debug(`skipping pass for turn ${turnId}: ${history.unprocessedSubstantiveRoundCount} substantive round(s) below threshold ${this.backOffTracker.threshold}`);
				return;
			}

			try {
				this.logger.debug(`running ${isFinal ? 'final ' : ''}pass for turn ${turnId} with ${history.new.length} new round(s)`);
				const res = await this.makeChatRequest(history, toolInvocationToken, isFinal, token);

				// Only retire the delta when the pass did not error.
				if (res !== 'error') {
					this.sessionHistoryStore.markToolCallsAsProcessed(turnId, history.new);
				}

				// Every pass that fires grows the turn-length wait so the background
				// agent runs less often the longer a turn lasts.
				this.backOffTracker.recordPass();

				if (res === 'error' || res === 'noop') {
					this.backOffTracker.recordNoop();
				} else {
					this.backOffTracker.clearNoops();
				}

			} catch (err) {
				this.logger.error(err instanceof Error ? err : new Error(String(err)), `background todo pass failed for turn ${turnId}`);
			}

		} finally {
			this.state = BackgroundTodoAgentProcessorState.Idle;
		}
	}

	private async makeChatRequest(history: ReadOnlyTurnHistory, toolInvocationToken: ChatParticipantToolToken, isFinalReview: boolean, token: CancellationToken): Promise<'success' | 'error' | 'noop'> {
		const startTime = Date.now();
		const endPoint = await this.getUtilitySmallEndpoint();
		const normalizedTodoTools = getNormalizedTodoToolsSchema(endPoint, this.logger);

		const { messages } = await renderPromptElement(
			this.instantiationService,
			endPoint,
			BackgroundTodoPrompt,
			{
				currentTodos: await this.getCurrentTodoContext(),
				userRequest: this.currentUserRequest,
				previousTurnTodos: this.oldTurnTodos,
				history: history,
				isFinalReview,
			},
			undefined,
			token
		);

		if (token.isCancellationRequested) {
			this.logger.debug('aborting pass before request: cancellation requested during prompt rendering');
			return 'noop';
		}

		const toolCalls: ToolCall[] = [];
		const response = await endPoint.makeChatRequest2({
			debugName: 'backgroundTodoAgent',
			messages: messages,
			finishedCb: async (_text, _index, fetchDelta) => {
				if (fetchDelta.copilotToolCalls) {
					toolCalls.push(...fetchDelta.copilotToolCalls);
				}
				return undefined;
			},
			location: ChatLocation.Other,
			requestOptions: {
				temperature: 0,
				tools: normalizedTodoTools,
			},
			userInitiatedRequest: false,
			interactionTypeOverride: 'conversation-background',
			telemetryProperties: { associatedRequestId: this.currentTurnId },
		}, token);

		const durationMs = Date.now() - startTime;

		// Non-success responses (canceled, rate-limited, filtered, etc.) should
		// propagate as errors so the delta is NOT marked processed — a later pass
		// can retry with fresh or coalesced activity.
		if (response.type !== ChatFetchResponseType.Success) {
			this.logger.error(`[BackgroundTodo] copilot-utility-small returned non-success response: ${response.type}`);
			this.sendTelemetry('modelError', this.currentTurnId, durationMs);
			return 'error';
		}

		const usage = response.usage;

		const res = await this.handleTodoToolCall(toolCalls, toolInvocationToken, token);
		switch (res) {
			case 'noop':
				this.sendTelemetry('noop', this.currentTurnId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, endPoint.model);
				break;
			case 'error':
				this.sendTelemetry('toolInvokeError', this.currentTurnId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, endPoint.model);
				break;
			case 'success':
				this.sendTelemetry('success', this.currentTurnId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, endPoint.model);
				break;
		}

		return res;
	}

	private async handleTodoToolCall(toolCalls: ToolCall[], toolInvocationToken: ChatParticipantToolToken, token: CancellationToken): Promise<'success' | 'error' | 'noop'> {
		// Only accept manage_todo_list, pick the LAST matching call
		let todoToolCall: ToolCall | undefined;
		for (let i = toolCalls.length - 1; i >= 0; i--) {
			if (toolCalls[i].name === ToolName.CoreManageTodoList) {
				todoToolCall = toolCalls[i];
				break;
			}
		}

		if (todoToolCall === undefined) {
			this.logger.debug('[BackgroundTodo] model returned no todo tool call (no-op)');
			return 'noop';
		}

		let todoList: unknown;
		try {
			const parsed = JSON.parse(todoToolCall.arguments);
			if (typeof parsed !== 'object' || parsed === null) {
				this.logger.warn('[BackgroundTodo] tool call arguments were not a JSON object');
				return 'error';
			}
			todoList = (parsed as { todoList?: unknown }).todoList;
		} catch {
			this.logger.warn('[BackgroundTodo] failed to parse tool call arguments');
			return 'error';
		}

		if (!Array.isArray(todoList)) {
			this.logger.warn('[BackgroundTodo] tool call arguments missing a todoList array');
			return 'error';
		}

		try {
			// Forward only the model's todoList and pin the operation. The session is
			// resolved from the tool invocation token's context on the main thread.
			await this.toolsService.invokeTool(ToolName.CoreManageTodoList, {
				input: { operation: 'write', todoList },
				toolInvocationToken,
			}, token);
		} catch (err) {
			this.logger.warn(`[BackgroundTodo] tool invocation failed: ${err}`);
			return 'error';
		}

		this.logger.debug(`[BackgroundTodo] wrote ${todoList.length} todo item(s)`);
		return 'success';
	}

	private async getUtilitySmallEndpoint(): Promise<IChatEndpoint> {
		return await (await this.lazyEndpointProvider.getPromise()).getChatEndpoint('copilot-utility-small');
	}

	private async getCurrentTodoContext() {
		const sessionResource = this.sessionResource;
		if (sessionResource === undefined) {
			return undefined;
		}

		return await (await this.lazyTodoListContextProvider.getPromise()).getCurrentTodoContext(sessionResource);
	}

	private async clearCurrentTodos(toolInvocationToken: ChatParticipantToolToken) {
		return (await this.lazyTodoListContextProvider.getPromise()).clearCurrentTodoContext(toolInvocationToken);
	}

	private sendTelemetry(
		outcome: string,
		chatRequestId: string | undefined,
		durationMs: number,
		promptTokens?: number,
		completionTokens?: number,
		model?: string,
	) {
		/* __GDPR__
			"backgroundTodoAgent" : {
				"owner": "vritant24",
				"comment": "Tracks background todo agent pass outcomes.",
				"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The outcome of the background todo pass." },
				"conversationId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Id for the current chat conversation." },
				"chatRequestId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The chat request ID." },
				"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The model ID used." },
				"duration": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Duration in ms." },
				"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Prompt token count." },
				"completionTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "Completion token count." }
			}
		*/
		this.telemetryService.sendMSFTTelemetryEvent('backgroundTodoAgent', {
			outcome: outcome,
			conversationId: this.sessionId,
			chatRequestId: chatRequestId,
			model: model,
		}, {
			duration: durationMs,
			promptTokenCount: promptTokens,
			completionTokenCount: completionTokens,
		});
	}
}

function getNormalizedTodoToolsSchema(endpoint: IChatEndpoint, logger: ILogger) {
	const schema = [{
		function: {
			name: ToolName.CoreManageTodoList,
			description: 'Update the todo list with current progress.',
			parameters: {
				type: 'object',
				properties: {
					todoList: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								id: { type: 'number' },
								title: { type: 'string' },
								status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
							},
							required: ['id', 'title', 'status'],
						},
					},
				},
				required: ['todoList'],
			},
		},
		type: 'function' as const,
	}];

	return normalizeToolSchema(
		endpoint.family,
		schema,
		(tool, rule) => {
			logger.warn(`[BackgroundTodo] Tool ${tool} failed validation: ${rule}`);
		}
	);
}

/**
 * Resolves the chat session resource from a prompt context, preferring the
 * typed request and falling back to the (opaque) tool invocation token.
 */
export function getSessionResource(promptContext: IBuildPromptContext): string | undefined {
	const fromRequest = promptContext.request?.sessionResource;
	if (fromRequest) {
		return fromRequest.toString();
	}

	const fromToken = (promptContext.tools?.toolInvocationToken as { sessionResource?: string | Uri } | undefined)?.sessionResource;
	if (fromToken) {
		return typeof fromToken === 'string' ? fromToken : fromToken.toString();
	}
	return undefined;
}

/**
 * Owns the progressive back-off that decides how many substantive tool
 * rounds must accumulate before the next background pass fires.
 *
 * The wait grows along two independent axes, both measured in substantive
 * tool rounds and both advancing by the same configurable step:
 *
 *  - Turn length: every time the threshold is hit (a pass fires) the wait
 *    grows by one step, so the longer a turn runs the less often we run.
 *  - No-ops: consecutive passes that produce no useful todo update add
 *    further backoff on top, which is cleared once a pass succeeds.
 *
 * The combined wait is capped at a configurable maximum.
 *
 *   threshold = min(initial + (passes + consecutiveNoops) * step, max)
 *
 * @internal - exported for testing
 */
export class BackOffTracker {

	/** Substantive rounds to wait before the very first pass. */
	private static readonly DEFAULT_INITIAL_THRESHOLD = 3;

	/** Extra substantive rounds added to the wait each time the threshold is hit. */
	private static readonly DEFAULT_THRESHOLD_STEP = 2;

	/** Upper bound for the wait; once reached it stays steady. */
	private static readonly DEFAULT_MAX_THRESHOLD = 24;

	/** Number of passes that fired this turn (turn-length signal). */
	private passCount = 0;

	/** Consecutive passes that produced no useful todo update. */
	private consecutiveNoops = 0;

	constructor(
		private readonly initialThreshold: number = BackOffTracker.DEFAULT_INITIAL_THRESHOLD,
		private readonly thresholdStep: number = BackOffTracker.DEFAULT_THRESHOLD_STEP,
		private readonly maxThreshold: number = BackOffTracker.DEFAULT_MAX_THRESHOLD,
	) { }

	/** Current effective substantive-round threshold for the next pass. */
	get threshold(): number {
		const grown = this.initialThreshold + (this.passCount + this.consecutiveNoops) * this.thresholdStep;
		return Math.min(grown, this.maxThreshold);
	}

	/** Whether the wait has grown beyond its initial value. */
	get isBackedOff(): boolean {
		return this.threshold > this.initialThreshold;
	}

	/**
	 * Whether the given substantive tool-round count meets the current
	 * (possibly backed-off) threshold and a pass should run.
	 */
	isReady(substantiveRoundCount: number): boolean {
		return substantiveRoundCount >= this.threshold;
	}

	/**
	 * Record that a pass fired (the threshold was hit). Grows the
	 * turn-length component of the wait by one step.
	 */
	recordPass(): void {
		this.passCount++;
	}

	/** Record a no-op/error pass, adding further backoff on top of turn length. */
	recordNoop(): void {
		this.consecutiveNoops++;
	}

	/** Clear the no-op backoff after a useful pass; keep turn-length growth. */
	clearNoops(): void {
		this.consecutiveNoops = 0;
	}

	/** Reset all back-off at the start of a new turn. */
	reset(): void {
		this.passCount = 0;
		this.consecutiveNoops = 0;
	}
}
