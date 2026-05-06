/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { LanguageModelTextPart } from '../../../../vscodeTypes';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ILogService } from '../../../../platform/log/common/logService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ToolCallingLoop } from '../../../intents/node/toolCallingLoop';
import { Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCall, IToolCallRound } from '../../../prompt/common/intents';
import { ITodoListContextProvider } from '../../../prompt/node/todoListContextProvider';
import { normalizeToolSchema } from '../../../tools/common/toolSchemaNormalizer';
import { ToolName } from '../../../tools/common/toolNames';
import { IToolsService } from '../../../tools/common/toolsService';
import { renderPromptElement } from '../base/promptRenderer';
import { BackgroundTodoDeltaTracker, extractSessionResource, IBackgroundTodoDelta } from './backgroundTodoDelta';
import { BackgroundTodoPrompt } from './backgroundTodoPrompt';

/**
 * State machine for a background todo processor.
 *
 * Lifecycle:
 *   Idle → InProgress → Idle (success / no-op)
 *                     → Failed → InProgress (retry on next delta)
 *
 * Cancellation cascades from the parent token or an explicit cancel() call.
 */

export const enum BackgroundTodoProcessorState {
	Idle = 'Idle',
	InProgress = 'InProgress',
	Failed = 'Failed',
}

// ── Invocation policy ───────────────────────────────────────────

/** Typed outcome of the invocation policy decision. */
export const enum BackgroundTodoDecision {
	/** A background pass should start now. */
	Run = 'run',
	/** There is activity but the processor should wait for more. */
	Wait = 'wait',
	/** The background todo agent should not run at all. */
	Skip = 'skip',
}

/** Detailed reason behind a policy decision, useful for logging/telemetry. */
export type BackgroundTodoDecisionReason =
	| 'experimentDisabled'
	| 'todoToolExplicitlyEnabled'
	| 'nonAgentPrompt'
	| 'noProcessor'
	| 'noDelta'
	| 'processorInProgress'
	| 'initialPlanNeeded'
	| 'meaningfulActivity'
	| 'contextThresholdReached'
	| 'contextOnlyWaiting'
	| 'todoListExistsNoNewActivity'
	| 'ready';

export interface IBackgroundTodoDecisionResult {
	readonly decision: BackgroundTodoDecision;
	readonly reason: BackgroundTodoDecisionReason;
	/** The delta snapshot when decision is `Run`; `undefined` otherwise. */
	readonly delta?: IBackgroundTodoDelta;
}

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
	/** Whether a todo list already exists for this session. `undefined` means unknown. */
	readonly todoListExists?: boolean;
}

/**
 * Bundles the services the processor needs for execution but does not own.
 * Passed by the caller so the processor stays testable without full DI.
 */
export interface IBackgroundTodoExecutionContext {
	readonly instantiationService: IInstantiationService;
	readonly logService: ILogService;
	readonly toolsService: IToolsService;
	readonly telemetryService: ITelemetryService;
	readonly promptContext: IBuildPromptContext;
	/** Set on the synthetic context used by {@link BackgroundTodoProcessor.requestFinalReview}.
	 *  Switches the prompt into finalize mode so the bg agent can mark completions
	 *  the regular per-round passes never had a chance to see (the last round of a
	 *  turn has no follow-up `buildPrompt` to fire the bg agent against). */
	readonly isFinalReview?: boolean;
}

export interface IBackgroundTodoResult {
	/** 'success' when a todo tool call was made, 'noop' when the model decided no update was needed. */
	readonly outcome: 'success' | 'noop';
	readonly promptTokens?: number;
	readonly completionTokens?: number;
	readonly durationMs?: number;
	readonly model?: string;
}

/**
 * Manages a single background todo processor per chat session.
 *
 * Owns a {@link BackgroundTodoDeltaTracker} for high-watermark tracking
 * and a two-slot queue (regular pass + final review) so that at most one
 * background pass runs at a time and final review always drains after
 * regular work regardless of processor state.
 *
 * Drain order:
 *   1. Pending regular pass (coalesced — only the latest survives).
 *   2. Pending final review (at most once per turn).
 */
export class BackgroundTodoProcessor {

	/** Minimum number of context-only tool calls before triggering a background pass. */
	static readonly CONTEXT_TOOL_CALL_THRESHOLD = 5;

	/** Minimum number of meaningful tool calls before triggering a background pass. */
	static readonly MEANINGFUL_TOOL_CALL_THRESHOLD = 3;

	private _state: BackgroundTodoProcessorState = BackgroundTodoProcessorState.Idle;
	private _promise: Promise<void> | undefined;
	private _cts: CancellationTokenSource | undefined;
	private _lastError: unknown;
	private _hasCreatedTodos: boolean = false;
	private _passCount: number = 0;

	// ── Two-slot queue ──────────────────────────────────────────
	// Regular passes coalesce into one slot; final review occupies a
	// second independent slot that drains only after all regular work.

	private _pendingRegularDelta: IBackgroundTodoDelta | undefined;
	private _pendingRegularContext: IBackgroundTodoExecutionContext | undefined;
	private _pendingRegularToken: CancellationToken | undefined;

	/** Pending final-review execution context. When set, {@link _drainQueue}
	 *  will run a finalize pass after all regular work has drained. */
	private _pendingFinalReview: IBackgroundTodoExecutionContext | undefined;
	private _pendingFinalReviewToken: CancellationToken | undefined;
	/** Turn ID for which final review has already been attempted/queued.
	 *  Prevents duplicate finalize passes within a single turn. */
	private _finalReviewAttemptedTurnId: string | undefined;
	/** The most recent execution context from any {@link requestRegularPass}
	 *  call.  Used by {@link requestFinalReview} to build the synthetic
	 *  final-review delta when no explicit context is provided. */
	private _lastExecutionContext: IBackgroundTodoExecutionContext | undefined;

	readonly deltaTracker = new BackgroundTodoDeltaTracker();

	constructor(
		private readonly _logService?: ILogService,
	) { }

	get state(): BackgroundTodoProcessorState { return this._state; }
	get lastError(): unknown { return this._lastError; }
	/** Whether the processor has ever successfully invoked the todo tool in this session. */
	get hasCreatedTodos(): boolean { return this._hasCreatedTodos; }

	// ── Invocation policy ───────────────────────────────────────

	/**
	 * Evaluate the invocation policy and return a typed decision.
	 *
	 * The processor owns this method so that all decision logic lives
	 * next to the state it depends on (processor state, delta tracker).
	 * Callers supply only the external context they already have.
	 */
	shouldRun(input: IBackgroundTodoPolicyInput): IBackgroundTodoDecisionResult {
		// ── Hard gates ────────────────────────────────────────────
		if (input.todoToolExplicitlyEnabled) {
			return { decision: BackgroundTodoDecision.Skip, reason: 'todoToolExplicitlyEnabled' };
		}
		if (!input.backgroundTodoAgentEnabled) {
			return { decision: BackgroundTodoDecision.Skip, reason: 'experimentDisabled' };
		}
		if (!input.isAgentPrompt) {
			return { decision: BackgroundTodoDecision.Skip, reason: 'nonAgentPrompt' };
		}

		const delta = this.deltaTracker.peekDelta(input.promptContext);
		if (!delta) {
			return { decision: BackgroundTodoDecision.Skip, reason: 'noDelta' };
		}

		if (this._state === BackgroundTodoProcessorState.InProgress) {
			this._logService?.debug(`[BackgroundTodo] policy: Wait (processorInProgress) — meaningful=${delta.metadata.meaningfulToolCallCount}, context=${delta.metadata.contextToolCallCount}, rounds=${delta.metadata.newRoundCount}`);
			return { decision: BackgroundTodoDecision.Wait, reason: 'processorInProgress', delta };
		}

		const { meaningfulToolCallCount, contextToolCallCount, isInitialDelta, isRequestOnly } = delta.metadata;

		// ── Initial request (no tool calls yet) ────────────────────
		if (isRequestOnly && isInitialDelta) {
			// No tool activity yet — wait for meaningful work before creating
			// a plan. Running here would force the fast model to guess a plan
			// from the user request alone, which is too early.
			return { decision: BackgroundTodoDecision.Wait, reason: 'initialPlanNeeded', delta };
		}

		// ── Meaningful work → run after threshold ────────────────────
		if (meaningfulToolCallCount >= BackgroundTodoProcessor.MEANINGFUL_TOOL_CALL_THRESHOLD) {
			this._logService?.debug(`[BackgroundTodo] policy: Run (meaningfulActivity) — meaningful=${meaningfulToolCallCount} >= threshold=${BackgroundTodoProcessor.MEANINGFUL_TOOL_CALL_THRESHOLD}, context=${contextToolCallCount}, rounds=${delta.metadata.newRoundCount}`);
			return { decision: BackgroundTodoDecision.Run, reason: 'meaningfulActivity', delta };
		}

		// Context-only activity (read_file, list_dir, search, etc.) is exploration
		// and never on its own a reason to fire the bg agent — a research-only
		// request can rack up dozens of read calls without producing any work to
		// track. Wait until the agent does something mutating.
		this._logService?.debug(`[BackgroundTodo] policy: Wait (contextOnlyWaiting) — context=${contextToolCallCount}, meaningful=${meaningfulToolCallCount}`);
		return { decision: BackgroundTodoDecision.Wait, reason: 'contextOnlyWaiting', delta };
	}

	// ── Public queue API ────────────────────────────────────────

	/**
	 * Enqueue or coalesce a regular background pass. If a pass is already
	 * running, the delta is stashed and will drain when the current pass
	 * completes.  Always updates {@link _lastExecutionContext}.
	 */
	requestRegularPass(
		delta: IBackgroundTodoDelta,
		context: IBackgroundTodoExecutionContext,
		parentToken?: CancellationToken,
	): void {
		this._lastExecutionContext = context;
		this._logService?.debug(`[BackgroundTodo] requestRegularPass — newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}, state=${this._state}`);
		this._pendingRegularDelta = delta;
		this._pendingRegularContext = context;
		this._pendingRegularToken = parentToken;
		this._drainQueue();
	}

	/**
	 * Request a single final-review pass for this turn.  The pass runs
	 * after all pending regular work has drained, regardless of whether
	 * the processor is currently Idle, InProgress, or Failed.
	 *
	 * No-op when:
	 * - No execution context has been recorded (no prompt build happened).
	 * - No todos have been created yet (nothing to finalize).
	 * - Final review was already requested for the given {@link turnId}.
	 */
	requestFinalReview(turnId: string, parentToken?: CancellationToken): void {
		if (!this._hasCreatedTodos || !this._lastExecutionContext) {
			this._logService?.debug(`[BackgroundTodo] final review skipped — hasCreatedTodos=${this._hasCreatedTodos}, hasExecutionContext=${this._lastExecutionContext !== undefined}`);
			return;
		}
		if (this._finalReviewAttemptedTurnId === turnId) {
			this._logService?.debug(`[BackgroundTodo] final review skipped — already attempted for turn ${turnId}`);
			return;
		}
		this._finalReviewAttemptedTurnId = turnId;
		this._logService?.debug(`[BackgroundTodo] final review requested for turn ${turnId} — currentState=${this._state}`);

		this._pendingFinalReview = { ...this._lastExecutionContext, isFinalReview: true };
		this._pendingFinalReviewToken = parentToken;
		this._drainQueue();
	}

	/**
	 * Wait for any in-flight pass — and any pending queued pass that drains
	 * from it — to settle.  Returns immediately if idle with nothing queued.
	 */
	async waitForCompletion(): Promise<void> {
		while (this._promise) {
			const current = this._promise;
			await current;
			// If _drainQueue started a new pass, _promise has been replaced.
			// Loop until no new work was queued.
			if (this._promise === current) {
				break;
			}
		}
	}

	// ── Low-level start (kept for direct unit tests) ────────────

	/**
	 * Start a background pass if one is not already running.
	 *
	 * If a pass is in progress, the delta is stashed as a pending regular
	 * pass and will drain via {@link _drainQueue} when the current pass
	 * completes.
	 *
	 * @param delta The new activity to process.
	 * @param work  An async function that performs the actual model call and
	 *              tool invocation. It receives a cancellation token.
	 * @param parentToken Optional parent cancellation token.
	 * @param advanceCursor Whether to advance the delta tracker cursor on
	 *        success.  Regular passes set this to `true`; final review sets
	 *        it to `false` so it does not interfere with regular-pass tracking.
	 */
	start(
		delta: IBackgroundTodoDelta,
		work: (delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>,
		parentToken?: CancellationToken,
		advanceCursor: boolean = true,
	): void {
		if (this._state === BackgroundTodoProcessorState.InProgress) {
			// Coalesce into the regular-pass slot so _drainQueue picks it up.
			this._logService?.debug(`[BackgroundTodo] coalescing delta (pass #${this._passCount} in progress) — newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}`);
			this._pendingRegularDelta = delta;
			this._pendingRegularContext = undefined; // will use work callback directly
			this._pendingRegularToken = parentToken;
			// Stash the work callback so _drainQueue can use it for the
			// coalesced pass (preserves finalize-mode closures).
			this._pendingRegularWork = work;
			this._pendingRegularAdvanceCursor = advanceCursor;
			return;
		}

		this._runPass(delta, work, parentToken, advanceCursor);
	}

	/** Stashed work callback for coalesced start() calls. */
	private _pendingRegularWork: ((delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>) | undefined;
	private _pendingRegularAdvanceCursor: boolean = true;

	// ── Internal execution ──────────────────────────────────────

	/**
	 * Central scheduler.  Called after every state transition and after
	 * every enqueue.  Picks the next item to run:
	 *   1. Pending regular pass (coalesced — only the latest survives).
	 *   2. Pending final review.
	 * Does nothing if a pass is already running.
	 */
	private _drainQueue(): void {
		if (this._state === BackgroundTodoProcessorState.InProgress) {
			return;
		}

		// ── Regular pass first ──────────────────────────────────
		const regularDelta = this._pendingRegularDelta;
		if (regularDelta) {
			const ctx = this._pendingRegularContext;
			const token = this._pendingRegularToken;
			const stashedWork = this._pendingRegularWork;
			const advanceCursor = this._pendingRegularAdvanceCursor;
			this._pendingRegularDelta = undefined;
			this._pendingRegularContext = undefined;
			this._pendingRegularToken = undefined;
			this._pendingRegularWork = undefined;
			this._pendingRegularAdvanceCursor = true;

			if (stashedWork) {
				// Coalesced via start() — use the stashed callback directly.
				this._runPass(regularDelta, stashedWork, token, advanceCursor);
				return;
			} else if (ctx) {
				// Enqueued via requestRegularPass — recompute against the latest cursor.
				// This avoids replaying the in-flight delta when no new rounds arrived
				// while the previous pass was running, and retries the full delta if the
				// previous pass failed and did not advance the cursor.
				const latestDelta = this.deltaTracker.peekDelta(ctx.promptContext);
				if (!latestDelta) {
					this._logService?.debug('[BackgroundTodo] queued regular pass skipped: no new delta remains after in-flight pass');
				} else {
					this._runPass(
						latestDelta,
						(d, t) => BackgroundTodoProcessor._doExecute(d, ctx, t),
						token,
						true, // regular passes always advance cursor
					);
					return;
				}
			} else {
				this._logService?.debug('[BackgroundTodo] queued regular pass skipped: missing execution context');
			}
		}

		// ── Final review ────────────────────────────────────────
		const finalCtx = this._pendingFinalReview;
		if (finalCtx) {
			const token = this._pendingFinalReviewToken;
			this._pendingFinalReview = undefined;
			this._pendingFinalReviewToken = undefined;

			// Build a synthetic delta from the full trajectory so the
			// finalize prompt sees every round.
			const allRounds = collectAllRounds(
				finalCtx.promptContext.history,
				finalCtx.promptContext.toolCallRounds ?? [],
			);
			if (allRounds.length === 0) {
				return;
			}
			let meaningful = 0;
			let contextual = 0;
			for (const round of allRounds) {
				for (const call of round.toolCalls) {
					const category = classifyTool(call.name);
					if (category === 'meaningful') {
						meaningful++;
					} else if (category === 'context') {
						contextual++;
					}
				}
			}
			const delta: IBackgroundTodoDelta = {
				userRequest: finalCtx.promptContext.query,
				newRounds: allRounds,
				history: finalCtx.promptContext.history,
				sessionResource: extractSessionResource(finalCtx.promptContext),
				metadata: {
					newRoundCount: allRounds.length,
					newToolCallCount: meaningful + contextual,
					meaningfulToolCallCount: meaningful,
					contextToolCallCount: contextual,
					isInitialDelta: false,
					isRequestOnly: false,
				},
			};

			this._logService?.debug(`[BackgroundTodo] draining final review — rounds=${allRounds.length}, meaningful=${meaningful}, context=${contextual}`);
			this._runPass(
				delta,
				(d, t) => BackgroundTodoProcessor._doExecute(d, finalCtx, t),
				token,
				false, // final review must NOT advance the regular-pass cursor
			);
			return;
		}
	}

	private _runPass(
		delta: IBackgroundTodoDelta,
		work: (delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>,
		parentToken?: CancellationToken,
		advanceCursor: boolean = true,
	): void {
		this._passCount++;
		const passNum = this._passCount;
		this._state = BackgroundTodoProcessorState.InProgress;
		this._lastError = undefined;
		const cts = new CancellationTokenSource(parentToken);
		this._cts = cts;
		const token = cts.token;

		this._logService?.debug(`[BackgroundTodo] starting pass #${passNum} — newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}, context=${delta.metadata.contextToolCallCount}, advanceCursor=${advanceCursor}`);

		const passPromise = work(delta, token).then(
			(result) => {
				if (this._state !== BackgroundTodoProcessorState.InProgress || this._cts !== cts) {
					this._logService?.debug(`[BackgroundTodo] pass #${passNum} completed but state was ${this._state} (cancelled?)`);
					return; // cancelled while in flight
				}
				if (result.outcome === 'success') {
					this._hasCreatedTodos = true;
				}
				this._logService?.debug(`[BackgroundTodo] pass #${passNum} completed: outcome=${result.outcome}, durationMs=${result.durationMs ?? '?'}, model=${result.model ?? '?'}, promptTokens=${result.promptTokens ?? '?'}, completionTokens=${result.completionTokens ?? '?'}`);
				if (advanceCursor) {
					this.deltaTracker.markProcessed(delta);
				}
				this._disposeCts(cts);
				this._state = BackgroundTodoProcessorState.Idle;
				this._drainQueue();
				if (!this._promise || this._promise === passPromise) {
					this._promise = undefined;
				}
			},
			(err) => {
				if (this._state !== BackgroundTodoProcessorState.InProgress || this._cts !== cts) {
					return; // cancelled while in flight
				}
				this._lastError = err;
				this._disposeCts(cts);
				this._state = BackgroundTodoProcessorState.Failed;
				this._logService?.warn(`[BackgroundTodo] pass #${passNum} failed: ${err}`);
				// Do NOT advance the cursor — the delta's rounds remain unprocessed
				// so a subsequent pass can retry with fresh or coalesced activity.
				this._drainQueue();
				if (!this._promise || this._promise === passPromise) {
					this._promise = undefined;
				}
			},
		);
		this._promise = passPromise;
	}

	private _disposeCts(cts: CancellationTokenSource): void {
		if (this._cts === cts) {
			this._cts = undefined;
		}
		cts.dispose();
	}

	/**
	 * The actual background work: render the todo prompt against copilot-fast,
	 * parse tool calls, and invoke the todo tool.
	 */
	private static async _doExecute(
		delta: IBackgroundTodoDelta,
		context: IBackgroundTodoExecutionContext,
		token: CancellationToken,
	): Promise<IBackgroundTodoResult> {
		const startTime = Date.now();
		const conversationId = context.promptContext.conversation?.sessionId;
		const associatedRequestId = context.promptContext.conversation?.getLatestTurn()?.id;

		context.logService.debug(`[BackgroundTodo] executing pass — session=${conversationId}, requestId=${associatedRequestId}, newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}, context=${delta.metadata.contextToolCallCount}`);

		let fastEndpoint: IChatEndpoint;
		try {
			fastEndpoint = await context.instantiationService.invokeFunction(async (accessor) => {
				const ep = accessor.get(IEndpointProvider);
				return ep.getChatEndpoint('copilot-fast');
			});
		} catch (err) {
			context.logService.warn(`[BackgroundTodo] copilot-fast endpoint unavailable, skipping pass: ${err}`);
			BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'skipped', conversationId, associatedRequestId, Date.now() - startTime);
			return { outcome: 'noop' };
		}

		// Read current todo state
		const sessionResource = delta.sessionResource;
		const todoContext = sessionResource
			? await context.instantiationService.invokeFunction(async (accessor) => {
				const todoProvider = accessor.get<ITodoListContextProvider>(ITodoListContextProvider);
				return todoProvider.getCurrentTodoContext(sessionResource.toString());
			})
			: undefined;

		// Use the full trajectory (history + current turn rounds) so the model
		// can see completion evidence from earlier rounds — not just the new
		// activity since the last pass. The delta tracker drives *when* to fire
		// (policy); the full trajectory drives *what context* the model sees.
		const allRounds = collectAllRounds(context.promptContext.history, context.promptContext.toolCallRounds ?? []);
		const compressedHistory = compressHistory(allRounds, context.promptContext.toolCallResults);
		context.logService.debug(`[BackgroundTodo] compressed history — groups=${compressedHistory.groupedProgress.length}, previousRounds=${compressedHistory.previousRounds.length}, latestRoundTools=${compressedHistory.latestRound?.toolSummaries.length ?? 0}, assistantContextSnippets=${compressedHistory.assistantContext.length}, subagentDigests=${compressedHistory.subagentDigests.length}, hasTodos=${todoContext !== undefined}`);

		// Render the prompt
		const { messages } = await renderPromptElement(
			context.instantiationService,
			fastEndpoint,
			BackgroundTodoPrompt,
			{ currentTodos: todoContext, userRequest: delta.userRequest, history: compressedHistory, isFinalReview: !!context.isFinalReview },
			undefined,
			token,
		);

		// Build the single-tool schema for manage_todo_list
		const todoToolSchema = [{
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

		const normalizedTools = normalizeToolSchema(
			fastEndpoint.family,
			todoToolSchema,
			(tool, rule) => {
				context.logService.warn(`[BackgroundTodo] Tool ${tool} failed validation: ${rule}`);
			},
		);

		// Make the request
		const toolCalls: { name: string; arguments: string; id: string }[] = [];
		const response: ChatResponse = await fastEndpoint.makeChatRequest2({
			debugName: 'backgroundTodoAgent',
			messages: ToolCallingLoop.stripInternalToolCallIds(messages),
			finishedCb: async (_text, _index, fetchDelta) => {
				if (fetchDelta.copilotToolCalls) {
					toolCalls.push(...fetchDelta.copilotToolCalls);
				}
				return undefined;
			},
			location: ChatLocation.Other,
			requestOptions: {
				temperature: 0,
				stream: false,
				tools: normalizedTools,
			},
			userInitiatedRequest: false,
			interactionTypeOverride: 'conversation-background',
			telemetryProperties: associatedRequestId ? { associatedRequestId } : undefined,
		}, token);

		const durationMs = Date.now() - startTime;

		// Non-success responses (canceled, rate-limited, filtered, etc.) should
		// propagate as errors so the delta is NOT marked processed — a later pass
		// can retry with fresh or coalesced activity.
		if (response.type !== ChatFetchResponseType.Success) {
			context.logService.warn(`[BackgroundTodo] copilot-fast returned non-success response: ${response.type}`);
			BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'modelError', conversationId, associatedRequestId, durationMs);
			throw new Error(`Background todo model request failed: ${response.type}`);
		}

		const usage = response.usage;

		// Process tool calls — only accept manage_todo_list. Pick the LAST matching
		// call: the model occasionally emits a sequence of manage_todo_list calls
		// in a single response (e.g. an intermediate snapshot followed by the
		// finalized list). The last one represents the model's intended end state;
		// applying an earlier one would leave the list stale.
		let todoCall: typeof toolCalls[number] | undefined;
		for (let i = toolCalls.length - 1; i >= 0; i--) {
			if (toolCalls[i].name === ToolName.CoreManageTodoList) {
				todoCall = toolCalls[i];
				break;
			}
		}
		if (!todoCall) {
			context.logService.debug('[BackgroundTodo] model returned no todo tool call (no-op)');
			BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'noop', conversationId, associatedRequestId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, fastEndpoint.model);
			return { outcome: 'noop', promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, durationMs, model: fastEndpoint.model };
		}

		// Validate and invoke the tool
		let parsedInput: unknown;
		try {
			parsedInput = JSON.parse(todoCall.arguments);
		} catch {
			context.logService.warn('[BackgroundTodo] failed to parse tool call arguments');
			BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'toolInvokeError', conversationId, associatedRequestId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, fastEndpoint.model);
			return { outcome: 'noop', durationMs, model: fastEndpoint.model };
		}

		try {
			const toolInvocationToken = context.promptContext.tools?.toolInvocationToken;
			if (!toolInvocationToken) {
				context.logService.warn('[BackgroundTodo] todo tool invocation skipped: missing tool invocation token');
				BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'toolInvokeError', conversationId, associatedRequestId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, fastEndpoint.model);
				return { outcome: 'noop', durationMs, model: fastEndpoint.model };
			}
			await context.toolsService.invokeTool(ToolName.CoreManageTodoList, {
				input: parsedInput,
				toolInvocationToken,
			}, token);
		} catch (err) {
			context.logService.warn(`[BackgroundTodo] tool invocation failed: ${err}`);
			BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'toolInvokeError', conversationId, associatedRequestId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, fastEndpoint.model);
			return { outcome: 'noop', durationMs, model: fastEndpoint.model };
		}

		context.logService.debug(`[BackgroundTodo] todo list updated successfully (${durationMs}ms)`);
		BackgroundTodoProcessor._sendTelemetry(context.telemetryService, 'success', conversationId, associatedRequestId, durationMs, usage?.prompt_tokens, usage?.completion_tokens, fastEndpoint.model);
		return { outcome: 'success', promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens, durationMs, model: fastEndpoint.model };
	}

	private static _sendTelemetry(
		telemetryService: ITelemetryService,
		outcome: string,
		conversationId: string | undefined,
		chatRequestId: string | undefined,
		durationMs: number,
		promptTokens?: number,
		completionTokens?: number,
		model?: string,
	): void {
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
		telemetryService.sendMSFTTelemetryEvent('backgroundTodoAgent', {
			outcome,
			conversationId,
			chatRequestId,
			model,
		}, {
			duration: durationMs,
			promptTokenCount: promptTokens,
			completionTokenCount: completionTokens,
		});
	}

	/**
	 * Cancel any in-flight pass and reset to Idle.
	 */
	cancel(): void {
		this._cts?.cancel();
		this._cts?.dispose();
		this._cts = undefined;
		this._state = BackgroundTodoProcessorState.Idle;
		this._lastError = undefined;
		this._promise = undefined;
		this._pendingRegularDelta = undefined;
		this._pendingRegularContext = undefined;
		this._pendingRegularToken = undefined;
		this._pendingRegularWork = undefined;
		this._pendingRegularAdvanceCursor = true;
		this._pendingFinalReview = undefined;
		this._pendingFinalReviewToken = undefined;
		this._lastExecutionContext = undefined;
		this._finalReviewAttemptedTurnId = undefined;
	}
}

// ══════════════════════════════════════════════════════════════════
// History processing — classifies, groups, and renders tool-call
// rounds for the background todo prompt.
// ══════════════════════════════════════════════════════════════════

// ── Tool classification ─────────────────────────────────────────

export type ToolCategory = 'context' | 'meaningful' | 'excluded';

/** Read-only exploration tools — counted but not treated as meaningful progress. */
const CONTEXT_TOOLS: ReadonlySet<string> = new Set([
	ToolName.ReadFile,
	ToolName.FindFiles,
	ToolName.FindTextInFiles,
	ToolName.ListDirectory,
	ToolName.Codebase,
	ToolName.GetErrors,
	ToolName.GetScmChanges,
	ToolName.CoreTestFailure,
	ToolName.ViewImage,
	ToolName.ReadProjectStructure,
	ToolName.SearchWorkspaceSymbols,
	ToolName.GetNotebookSummary,
	ToolName.ReadCellOutput,
	ToolName.GithubSemanticRepoSearch,
	ToolName.GithubTextSearch,
	// Browser read-only
	ToolName.CoreScreenshotPage,
	ToolName.CoreReadPage,
	ToolName.CoreNavigatePage,
]);

/** Infrastructure tools that are not progress signals at all. */
const EXCLUDED_TOOLS: ReadonlySet<string> = new Set([
	ToolName.CoreManageTodoList,
	ToolName.ToolSearch,
	ToolName.CoreAskQuestions,
	ToolName.SwitchAgent,
	ToolName.CoreConfirmationTool,
	ToolName.CoreConfirmationToolWithOptions,
	ToolName.CoreTerminalConfirmationTool,
	ToolName.ResolveMemoryFileUri,
	ToolName.Memory,
	ToolName.Skill,
	ToolName.SessionStoreSql,
	ToolName.EditFilesPlaceholder,
]);

export function classifyTool(name: string): ToolCategory {
	if (EXCLUDED_TOOLS.has(name)) {
		return 'excluded';
	}
	if (CONTEXT_TOOLS.has(name)) {
		return 'context';
	}
	return 'meaningful';
}

// ── Target extraction ───────────────────────────────────────────

/** Keys commonly used for file paths across tool argument schemas. */
const FILE_PATH_KEYS = ['filePath', 'path', 'file'] as const;

/** Argument keys that hold a short human-readable description of *what* a
 *  call is trying to accomplish. Surfaced as a per-call note so the bg agent
 *  can tell apart visually-identical edit/subagent calls. */
const NOTE_KEYS = ['explanation', 'description', 'goal'] as const;
const NOTE_MAX = 120;

/**
 * Extract a short human-readable note describing what the call intends to do,
 * based on conventional argument keys (`explanation`, `description`, `goal`).
 * Returns `undefined` when no such note is present.
 */
function extractToolNote(call: IToolCall): string | undefined {
	try {
		const args = JSON.parse(call.arguments);
		if (args && typeof args === 'object') {
			for (const k of NOTE_KEYS) {
				const v = (args as Record<string, unknown>)[k];
				if (typeof v === 'string' && v.length > 0) {
					return v.length > NOTE_MAX ? v.slice(0, NOTE_MAX) + '…' : v;
				}
			}
		}
	} catch {
		// Arguments not parseable — no note
	}
	return undefined;
}

/**
 * Best-effort extraction of a human-readable target from tool call arguments.
 * Returns a file path for file-oriented tools, a category for others.
 */
export function extractTarget(call: IToolCall): string {
	// Terminal tools → group as "terminal"
	if (call.name === ToolName.CoreRunInTerminal ||
		call.name === ToolName.CoreGetTerminalOutput ||
		call.name === ToolName.CoreSendToTerminal ||
		call.name === ToolName.CoreKillTerminal ||
		call.name === ToolName.CoreTerminalLastCommand ||
		call.name === ToolName.CoreTerminalSelection) {
		return 'terminal';
	}

	// Test tools → group as "tests"
	if (call.name === ToolName.CoreRunTest || call.name === ToolName.CoreRunTask ||
		call.name === ToolName.CoreGetTaskOutput || call.name === ToolName.CoreCreateAndRunTask) {
		return 'tests/tasks';
	}

	// Browser tools → group as "browser"
	if (call.name.startsWith('open_browser') || call.name.startsWith('click_') ||
		call.name.startsWith('screenshot_') || call.name.startsWith('navigate_') ||
		call.name.startsWith('read_page') || call.name.startsWith('hover_') ||
		call.name.startsWith('drag_') || call.name.startsWith('type_in_') ||
		call.name.startsWith('handle_dialog') || call.name.startsWith('run_playwright')) {
		return 'browser';
	}

	// Subagent tools → group by subagent type
	if (call.name === ToolName.SearchSubagent || call.name === ToolName.ExploreSubagent) {
		return 'search subagent';
	}
	if (call.name === ToolName.ExecutionSubagent || call.name === ToolName.CoreRunSubagent) {
		return 'subagent';
	}

	// Try to parse a file path from arguments
	try {
		const args = JSON.parse(call.arguments);
		if (typeof args === 'object' && args !== null) {
			// Multi-edit tools (e.g. multi_replace_string_in_file) carry the file
			// paths inside replacements[]. Surface them so progress isn't bucketed
			// under the bare tool name.
			if (Array.isArray(args.replacements)) {
				const paths: string[] = [...new Set(
					(args.replacements as Array<Record<string, unknown> | undefined>)
						.map((r): string | undefined => {
							for (const key of FILE_PATH_KEYS) {
								const v = r?.[key];
								if (typeof v === 'string' && v.length > 0) {
									return v;
								}
							}
							return undefined;
						})
						.filter((p): p is string => typeof p === 'string')
				)];
				if (paths.length === 1) {
					return paths[0];
				}
				if (paths.length > 1) {
					return paths.length <= 3 ? paths.join(', ') : `${paths.length} files`;
				}
			}
			for (const key of FILE_PATH_KEYS) {
				const val = args[key];
				if (typeof val === 'string' && val.length > 0) {
					return val;
				}
			}
		}
	} catch {
		// Arguments not parseable — fall through
	}

	// Fallback: use the tool name itself
	return call.name;
}

// ── History types ───────────────────────────────────────────────

/**
 * A group of tool calls targeting the same file or category,
 * collapsed for token-efficient rendering in the background prompt.
 */
export interface IToolCallGroup {
	/** File path or tool-type category (e.g. "terminal", "tests/tasks"). */
	readonly target: string;
	/** Short descriptions of meaningful (mutating) calls in this group. */
	readonly meaningfulCalls: readonly string[];
	/** Number of context (read-only) calls — count only, not enumerated. */
	readonly contextCallCount: number;
	/** Total calls in this group. */
	readonly totalCalls: number;
}

/** A single tool call rendered with enough context to distinguish similar calls. */
export interface IToolCallSummary {
	/** Tool name as exposed to the model. */
	readonly name: string;
	/** File path or tool-type category (e.g. "terminal", "tests/tasks"). */
	readonly target?: string;
	/** Optional human-readable intent extracted from tool arguments. */
	readonly note?: string;
}

/** Full-fidelity detail for one historical tool-call round. */
export interface IToolCallRoundDetail {
	/** Round id, used only as a stable label in rendered history. */
	readonly id: string;
	/** Tool name + optional target + optional human-readable note for each call in the round. */
	readonly toolSummaries: readonly IToolCallSummary[];
	/** The assistant's response text after this round. */
	readonly assistantResponse: string;
}

/**
 * Full-fidelity detail for the most recent tool-call round.
 */
export interface ILatestRoundDetail {
	/** Tool name + optional target + optional human-readable note for each call in the round. */
	readonly toolSummaries: readonly IToolCallSummary[];
	/** The assistant's response text after this round, truncated. */
	readonly assistantResponse: string;
}

/**
 * A short digest of a single subagent invocation: the target description plus
 * the textual output the subagent returned. Used so the background todo agent
 * can see *what was discovered* by exploration subagents, not just that an
 * exploration happened.
 */
export interface ISubagentDigest {
	/** Short label for the subagent call (tool name + extracted description). */
	readonly target: string;
	/** Concatenated text output from the subagent, truncated. */
	readonly output: string;
}

/**
 * Representation of conversation history for the background todo prompt.
 * Produced by {@link compressHistory}.
 */
export interface IBackgroundTodoHistory {
	/** Grouped progress from all rounds except the latest. */
	readonly groupedProgress: readonly IToolCallGroup[];
	/** Per-round tool activity from all rounds except the latest. */
	readonly previousRounds: readonly IToolCallRoundDetail[];
	/** Full-fidelity detail for the most recent round. */
	readonly latestRound: ILatestRoundDetail | undefined;
	/** 1–2 recent assistant response snippets for reasoning context. */
	readonly assistantContext: readonly string[];
	/** Digests of subagent outputs (search/explore/execution subagents). */
	readonly subagentDigests: readonly ISubagentDigest[];
}

// ── Compression logic ───────────────────────────────────────────


/** Tools whose output should be surfaced as a subagent digest. */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set([
	ToolName.SearchSubagent,
	ToolName.ExploreSubagent,
	ToolName.ExecutionSubagent,
	ToolName.CoreRunSubagent,
]);

const MAX_SUBAGENT_DIGEST_CHUNK_LENGTH = 4000;

/**
 * Collect all tool-call rounds from history turns and current-turn rounds
 * in chronological order.
 */
export function collectAllRounds(history: readonly Turn[], currentRounds: readonly IToolCallRound[]): IToolCallRound[] {
	const all: IToolCallRound[] = [];
	for (const turn of history) {
		for (const round of turn.rounds) {
			all.push(round);
		}
	}
	all.push(...currentRounds);
	return all;
}

/**
 * Process raw tool-call rounds into a structured history for the
 * background todo prompt. Older rounds are kept as per-round summaries
 * and also grouped as a compact fallback; the last round is kept at full
 * fidelity.
 *
 * If `toolCallResults` is provided, subagent outputs are extracted into
 * {@link IBackgroundTodoHistory.subagentDigests} so the background agent
 * can see what exploration subagents actually discovered.
 */
export function compressHistory(
	allRounds: readonly IToolCallRound[],
	toolCallResults?: Record<string, vscode.LanguageModelToolResult>,
): IBackgroundTodoHistory {
	if (allRounds.length === 0) {
		return { groupedProgress: [], previousRounds: [], latestRound: undefined, assistantContext: [], subagentDigests: [] };
	}

	const latestRoundRaw = allRounds[allRounds.length - 1];
	const olderRounds = allRounds.slice(0, -1);

	// ── Group older rounds ──────────────────────────────────
	const groupMap = new Map<string, { meaningful: string[]; contextCount: number; total: number }>();

	for (const round of olderRounds) {
		for (const call of round.toolCalls) {
			const category = classifyTool(call.name);
			if (category === 'excluded') {
				continue;
			}
			const target = extractTarget(call);
			let group = groupMap.get(target);
			if (!group) {
				group = { meaningful: [], contextCount: 0, total: 0 };
				groupMap.set(target, group);
			}
			group.total++;
			if (category === 'meaningful') {
				group.meaningful.push(call.name);
			} else {
				group.contextCount++;
			}
		}
	}

	// Sort: meaningful-heavy groups first, then by total count
	const groupedProgress: IToolCallGroup[] = [...groupMap.entries()]
		.sort((a, b) => {
			const meaningfulDiff = b[1].meaningful.length - a[1].meaningful.length;
			if (meaningfulDiff !== 0) {
				return meaningfulDiff;
			}
			return b[1].total - a[1].total;
		})
		.map(([target, g]) => ({
			target,
			meaningfulCalls: g.meaningful,
			contextCallCount: g.contextCount,
			totalCalls: g.total,
		}));

	const previousRounds = olderRounds
		.map(round => toToolCallRoundDetail(round))
		.filter(round => round.toolSummaries.length > 0 || round.assistantResponse.trim().length > 0);

	// ── Latest round detail ─────────────────────────────────
	const latestRound = toLatestRoundDetail(latestRoundRaw);

	// ── Assistant context ────────────────────────────────────
	const assistantContext = extractAssistantContext(allRounds);

	// ── Subagent digests ─────────────────────────────────────
	const subagentDigests = toolCallResults
		? extractSubagentDigests(allRounds, toolCallResults)
		: [];

	return { groupedProgress, previousRounds, latestRound, assistantContext, subagentDigests };
}

function toToolCallRoundDetail(round: IToolCallRound): IToolCallRoundDetail {
	return {
		id: round.id,
		toolSummaries: summarizeToolCalls(round.toolCalls),
		assistantResponse: round.response,
	};
}

function toLatestRoundDetail(round: IToolCallRound): ILatestRoundDetail {
	return {
		toolSummaries: summarizeToolCalls(round.toolCalls),
		assistantResponse: round.response,
	};
}

function summarizeToolCalls(calls: readonly IToolCall[]): IToolCallSummary[] {
	return calls
		.filter(call => classifyTool(call.name) !== 'excluded')
		.map(call => {
			const note = extractToolNote(call);
			return note
				? { name: call.name, target: extractTarget(call), note }
				: { name: call.name, target: extractTarget(call) };
		});
}

/**
 * Return all non-empty assistant response snippets in chronological order.
 * Truncation is deliberately NOT applied here; the prompt renders each snippet
 * as its own message with a descending priority so prompt-tsx prunes the
 * oldest snippets first when the budget is tight.
 */
function extractAssistantContext(allRounds: readonly IToolCallRound[]): string[] {
	const result: string[] = [];
	for (const round of allRounds) {
		const response = round.response.trim();
		if (response.length > 0) {
			result.push(response);
		}
	}
	return result;
}

/**
 * Extract textual outputs from subagent tool calls in chronological order.
 * Large digests are split into chunks; the prompt-tsx renderer is responsible
 * for pruning lower-priority blocks if the overall prompt exceeds the budget.
 */
function extractSubagentDigests(
	allRounds: readonly IToolCallRound[],
	toolCallResults: Record<string, vscode.LanguageModelToolResult>,
): ISubagentDigest[] {
	const digests: ISubagentDigest[] = [];

	for (const round of allRounds) {
		for (const call of round.toolCalls) {
			if (!SUBAGENT_TOOL_NAMES.has(call.name)) {
				continue;
			}
			const result = toolCallResults[call.id];
			if (!result) {
				continue;
			}
			const output = stringifyToolResult(result).trim();
			if (output.length === 0) {
				continue;
			}
			const target = extractSubagentDigestTarget(call);
			const chunks = splitSubagentDigestOutput(output);
			for (let i = 0; i < chunks.length; i++) {
				digests.push({
					target: chunks.length === 1 ? target : `${target} (part ${i + 1}/${chunks.length})`,
					output: chunks[i],
				});
			}
		}
	}

	return digests;
}

function extractSubagentDigestTarget(call: IToolCall): string {
	const target = extractTarget(call);
	const note = extractToolNote(call);
	return note ? `${target}: ${note}` : target;
}

function splitSubagentDigestOutput(output: string): string[] {
	const chunks: string[] = [];
	for (let start = 0; start < output.length; start += MAX_SUBAGENT_DIGEST_CHUNK_LENGTH) {
		chunks.push(output.slice(start, start + MAX_SUBAGENT_DIGEST_CHUNK_LENGTH));
	}
	return chunks;
}

function stringifyToolResult(result: vscode.LanguageModelToolResult): string {
	const parts: string[] = [];
	for (const part of result.content) {
		if (part instanceof LanguageModelTextPart) {
			parts.push(part.value);
		}
	}
	return parts.join('\n');
}

// ── Rendering helpers ───────────────────────────────────────────

/**
 * Render grouped progress into a compact string for the prompt.
 */
export function renderGroupedProgress(groups: readonly IToolCallGroup[]): string {
	if (groups.length === 0) {
		return '';
	}

	return groups.map(g => {
		const parts: string[] = [`[${g.target}]`];
		if (g.meaningfulCalls.length > 0) {
			// Deduplicate tool names within the group
			const unique = [...new Set(g.meaningfulCalls)];
			parts.push(`Actions: ${unique.join(', ')}`);
		}
		if (g.contextCallCount > 0) {
			parts.push(`(${g.contextCallCount} read${g.contextCallCount > 1 ? 's' : ''})`);
		}
		return parts.join(' ');
	}).join('\n');
}

export function renderToolCallRound(detail: IToolCallRoundDetail): string {
	const parts = [`Round ${detail.id}:`, renderToolSummaries(detail.toolSummaries)];
	if (detail.assistantResponse.length > 0) {
		parts.push(`\nAgent said: ${detail.assistantResponse}`);
	}
	return parts.join('\n');
}

/**
 * Render the latest round detail into a string for the prompt.
 */
export function renderLatestRound(detail: ILatestRoundDetail): string {
	const parts = ['Current tools:', renderToolSummaries(detail.toolSummaries)];
	if (detail.assistantResponse.length > 0) {
		parts.push(`\nAgent said: ${detail.assistantResponse}`);
	}
	return parts.join('\n');
}

function renderToolSummaries(toolSummaries: readonly IToolCallSummary[]): string {
	return toolSummaries.map(s => {
		const head = s.target ? `- ${s.name} → ${s.target}` : `- ${s.name}`;
		return s.note ? `${head}\n      ↳ ${s.note}` : head;
	}).join('\n');
}

/**
 * Render subagent digests into a compact string for the prompt.
 * Each digest shows the subagent target and its truncated text output.
 */
export function renderSubagentDigests(digests: readonly ISubagentDigest[]): string {
	if (digests.length === 0) {
		return '';
	}
	return digests.map((d, i) => `[${i + 1}] ${d.target}\n${d.output}`).join('\n\n');
}
