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
	/** Set on the synthetic context used by {@link BackgroundTodoProcessor.executeFinalReview}.
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
 * and coalesces concurrent updates so at most one background pass runs
 * at a time.
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
	private _pendingDelta: IBackgroundTodoDelta | undefined;
	/** Work callback associated with {@link _pendingDelta}. Captured at queue time so a
	 *  coalesced finalize pass keeps its finalize-mode closure (regular per-round work
	 *  would otherwise overwrite finalize-mode behavior when the queued delta drains). */
	private _pendingWork: ((delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>) | undefined;
	private _hasCreatedTodos: boolean = false;
	private _passCount: number = 0;
	/** Cached on the most recent {@link executePass} call so {@link executeFinalReview}
	 *  can re-use the same services + most recent prompt context without a fresh build. */
	private _lastExecutionContext: IBackgroundTodoExecutionContext | undefined;
	/** True after a final review pass has been queued for this turn; reset on the next
	 *  regular {@link executePass}. Prevents duplicate finalize passes. */
	private _finalReviewQueued: boolean = false;

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

	/**
	 * Start a background pass if one is not already running.
	 *
	 * If a pass is in progress, the delta is stashed and will be processed
	 * automatically when the current pass completes.
	 *
	 * @param delta The new activity to process.
	 * @param work  An async function that performs the actual model call and
	 *              tool invocation. It receives a cancellation token.
	 * @param parentToken Optional parent cancellation token.
	 */
	start(
		delta: IBackgroundTodoDelta,
		work: (delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>,
		parentToken?: CancellationToken,
	): void {
		if (this._state === BackgroundTodoProcessorState.InProgress) {
			// Coalesce: stash the latest delta AND its work callback for when the current
			// pass finishes. Storing the callback is critical for finalize passes — they
			// carry an `isFinalReview: true` execution context in the closure that must
			// survive the queue. Without this, a finalize pass queued behind a regular
			// pass would silently drain in regular mode.
			this._logService?.debug(`[BackgroundTodo] coalescing delta (pass #${this._passCount} in progress) — newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}, replacingPending=${this._pendingDelta !== undefined}`);
			this._pendingDelta = delta;
			this._pendingWork = work;
			return;
		}

		this._runPass(delta, work, parentToken);
	}

	private _runPass(
		delta: IBackgroundTodoDelta,
		work: (delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>,
		parentToken?: CancellationToken,
	): void {
		this._passCount++;
		const passNum = this._passCount;
		this._state = BackgroundTodoProcessorState.InProgress;
		this._lastError = undefined;
		const cts = new CancellationTokenSource(parentToken);
		this._cts = cts;
		const token = cts.token;

		this._logService?.debug(`[BackgroundTodo] starting pass #${passNum} — newRounds=${delta.metadata.newRoundCount}, meaningful=${delta.metadata.meaningfulToolCallCount}, context=${delta.metadata.contextToolCallCount}`);

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
				this.deltaTracker.markProcessed(delta);
				this._disposeCts(cts);
				this._state = BackgroundTodoProcessorState.Idle;
				const hasPending = this._checkPending(work, parentToken);
				if (!hasPending && this._promise === passPromise) {
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
				const hasPending = this._checkPending(work, parentToken);
				if (!hasPending && this._promise === passPromise) {
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
	 * If a delta was stashed while a pass was running, start a new pass now.
	 */
	private _checkPending(
		work: (delta: IBackgroundTodoDelta, token: CancellationToken) => Promise<IBackgroundTodoResult>,
		parentToken?: CancellationToken,
	): boolean {
		const pending = this._pendingDelta;
		if (pending) {
			// Prefer the work callback that was stashed alongside the pending delta —
			// it preserves finalize-mode (or any future per-pass) context in its closure.
			// Fall back to the caller-provided work only if no stashed callback exists.
			const pendingWork = this._pendingWork ?? work;
			const usingStashed = this._pendingWork !== undefined;
			this._logService?.debug(`[BackgroundTodo] draining pending delta — newRounds=${pending.metadata.newRoundCount}, meaningful=${pending.metadata.meaningfulToolCallCount}, usingStashedWork=${usingStashed}`);
			this._pendingDelta = undefined;
			this._pendingWork = undefined;
			this._runPass(pending, pendingWork, parentToken);
			return true;
		}
		return false;
	}

	/**
	 * Wait for any in-flight pass — and any pending coalesced pass that drains
	 * from it — to settle. Returns immediately if idle.
	 */
	async waitForCompletion(): Promise<void> {
		while (this._promise) {
			const current = this._promise;
			await current;
			// If _checkPending started a new pass, _promise has been replaced.
			// Loop until no new work was queued.
			if (this._promise === current) {
				break;
			}
		}
	}

	// ── Execution ──────────────────────────────────────────────

	/**
	 * Convenience method: starts a background pass using the built-in
	 * execution logic (acquire copilot-fast endpoint → render prompt →
	 * call model → invoke todo tool).
	 */
	executePass(
		delta: IBackgroundTodoDelta,
		context: IBackgroundTodoExecutionContext,
		parentToken?: CancellationToken,
	): void {
		this._lastExecutionContext = context;
		this._finalReviewQueued = false;
		this.start(
			delta,
			(d, token) => BackgroundTodoProcessor._doExecute(d, context, token),
			parentToken,
		);
	}

	/**
	 * Fire one extra background pass after the agent loop has ended for this turn.
	 *
	 * The regular per-round bg passes never see the very last round (there is no
	 * follow-up `buildPrompt` to fire against), so any task that *just* completed
	 * on the final round stays stuck as 'in-progress' until the next user turn.
	 * This pass uses the cached execution context from the most recent
	 * {@link executePass} and runs in finalize mode so the model focuses on
	 * promoting completed work rather than re-planning.
	 *
	 * No-op when:
	 * - No bg pass has ever run for this session (no cached context).
	 * - No todos exist yet (nothing to finalize).
	 * - A final review has already been queued for this turn.
	 */
	executeFinalReview(parentToken?: CancellationToken): void {
		if (this._finalReviewQueued || !this._hasCreatedTodos || !this._lastExecutionContext) {
			this._logService?.debug(`[BackgroundTodo] final review skipped — alreadyQueued=${this._finalReviewQueued}, hasCreatedTodos=${this._hasCreatedTodos}, hasExecutionContext=${this._lastExecutionContext !== undefined}`);
			return;
		}
		this._finalReviewQueued = true;
		this._logService?.debug(`[BackgroundTodo] final review requested — currentState=${this._state}`);

		const ctx = this._lastExecutionContext;
		const finalCtx: IBackgroundTodoExecutionContext = { ...ctx, isFinalReview: true };

		// Build a synthetic delta that includes every round we know about so the
		// finalize prompt has full trajectory context. Skip cursor advancement
		// (markProcessed is intentionally not called) since this is a one-shot review.
		const allRounds = collectAllRounds(ctx.promptContext.history, ctx.promptContext.toolCallRounds ?? []);
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
			userRequest: ctx.promptContext.query,
			newRounds: allRounds,
			history: ctx.promptContext.history,
			sessionResource: extractSessionResource(ctx.promptContext),
			metadata: {
				newRoundCount: allRounds.length,
				newToolCallCount: meaningful + contextual,
				meaningfulToolCallCount: meaningful,
				contextToolCallCount: contextual,
				isInitialDelta: false,
				isRequestOnly: false,
			},
		};

		this._logService?.debug(`[BackgroundTodo] queueing final review — rounds=${allRounds.length}, meaningful=${meaningful}, context=${contextual}`);
		this.start(
			delta,
			(d, token) => BackgroundTodoProcessor._doExecute(d, finalCtx, token),
			parentToken,
		);
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
			requestKindOptions: { kind: 'background' },
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
		this._pendingDelta = undefined;
		this._pendingWork = undefined;
		this._lastExecutionContext = undefined;
		this._finalReviewQueued = false;
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
	ToolName.SearchViewResults,
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
