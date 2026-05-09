/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, Query, SDKMessage, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { SessionInputAnswer, SessionInputRequest, SessionInputResponseKind, ToolCallPendingConfirmationState } from '../../common/state/protocol/state.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from './claudeMapSessionEvents.js';
import { ClaudePermissionKind } from './claudeToolDisplay.js';

/**
 * One in-flight {@link send} request. Length of {@link ClaudeAgentSession._inFlightRequests}
 * is at most 1 in Phase 6 thanks to the per-session sequencer in `ClaudeAgent`,
 * but the queue shape is preserved so Phase 7+ tools (intra-turn waits)
 * can extend without reshaping the loop.
 */
interface IQueuedRequest {
	readonly prompt: SDKUserMessage;
	readonly deferred: DeferredPromise<void>;
	/**
	 * Required (non-optional). The agent's `sendMessage` accepts
	 * `turnId?: string` (`agentService.ts:424`); `ClaudeAgent.sendMessage`
	 * generates a UUID if absent before forwarding here, so by the time
	 * a request reaches the session it always carries a turn id. The
	 * mapper depends on this for `SessionAction.turnId` population.
	 */
	readonly turnId: string;
}

/**
 * Per-session SDK Query owner.
 *
 * Holds the {@link WarmQuery}, the bound {@link Query}, the
 * per-session {@link AbortController}, the prompt iterable, and the
 * in-flight request queue. Disposing the session aborts the controller
 * which (per `sdk.d.ts:982`) terminates the SDK subprocess; the
 * WarmQuery is also explicitly disposed so any pending native handles
 * release.
 *
 * Plan section 3.5. Phase 6 deliberately keeps the message → signal mapping
 * out of this class — see `claudeMapSessionEvents.ts` (added Cycle 6).
 * Cycle 3 lands the bare consumer loop: drain the SDK iterator,
 * complete the in-flight deferred on `result`. Subsequent cycles add
 * the mapper call and the `_isResumed` / fatal-error / cancellation
 * branches.
 */
export class ClaudeAgentSession extends Disposable {

	/**
	 * SDK Query handle. Bound on the first {@link send} call (so every
	 * subsequent send pushes onto the same prompt iterable rather than
	 * spawning a new query). Phase 6 binds exactly once.
	 */
	private _query: Query | undefined;

	/**
	 * Wakes the prompt iterable's `next()` when a new prompt arrives or
	 * on abort. Replaced on every consumed prompt.
	 */
	private _pendingPromptDeferred = new DeferredPromise<void>();

	/**
	 * FIFO of in-flight requests. Length at most 1 in Phase 6 due to the
	 * agent-side `_sessionSequencer`. The mapper reads
	 * `_inFlightRequests[0]?.turnId` to populate `SessionAction.turnId`
	 * — only valid because of the single-in-flight invariant.
	 */
	private _inFlightRequests: IQueuedRequest[] = [];

	/**
	 * Prompts pushed by {@link send}, drained by the prompt iterable.
	 * Separate from {@link _inFlightRequests} because the iterable's
	 * consumer loop pops from here while the result-completion loop
	 * pops from the in-flight list.
	 */
	private _queuedPrompts: SDKUserMessage[] = [];

	/**
	 * Flips to `true` on the first `system:init` SDK message. Phase 7+
	 * teardown+recreate flows pass `Options.resume = sessionId` to the
	 * SDK on a recreated session iff `_isResumed === true`, signalling
	 * the SDK to reuse the existing transcript. Phase 6 only sets the
	 * flag — no recreate flow exists yet.
	 */
	private _isResumed = false;

	get isResumed(): boolean {
		return this._isResumed;
	}

	/**
	 * Latched once {@link _processMessages} terminates with an error
	 * (cancellation, transport failure, malformed SDK output). Every
	 * pending in-flight deferred is rejected with the same error, and
	 * subsequent {@link send} calls fast-fail with this latched value
	 * instead of parking on a dead query. Phase 7+ teardown+recreate
	 * flows clear this when the session is re-bound.
	 */
	private _fatalError: Error | undefined;

	/**
	 * Phase 7 / S3.2. Tool-permission deferreds parked inside
	 * {@link Options.canUseTool}. Keyed by SDK `tool_use_id`.
	 * {@link requestPermission} atomically registers the entry and
	 * fires `pending_confirmation`; the deferred resolves with `true`
	 * (allow) or `false` (deny) via {@link respondToPermissionRequest}
	 * or {@link _denyAllPending}.
	 */
	private readonly _pendingPermissions = new Map<string, DeferredPromise<boolean>>();

	/**
	 * Phase 7 S3.3 mapper state — one instance per session, threaded
	 * through every {@link mapSDKMessageToAgentSignals} call. Holds
	 * per-message `activeToolBlocks` (drained on `message_start`) and
	 * cross-message `toolCallTurnIds` / `toolCallNames` (drained on
	 * `tool_result`). Re-introduced after Phase 6.1's drop because
	 * cross-message `tool_use` → `tool_result` linkage is inherently
	 * stateful — see `phase6.1-plan.md:578` for the prediction.
	 */
	private readonly _mapperState = new ClaudeMapperState();

	/**
	 * Phase 7 / S3.2. User-input deferreds parked for
	 * {@link INTERACTIVE_CLAUDE_TOOLS} (`AskUserQuestion`,
	 * `ExitPlanMode`). Keyed by `SessionInputRequest.id`. The deferred
	 * resolves via {@link respondToUserInputRequest} (workbench answered)
	 * or {@link _denyAllPending} (session disposed mid-park).
	 */
	private readonly _pendingUserInputs = new Map<string, DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>>();

	constructor(
		readonly sessionId: string,
		readonly sessionUri: URI,
		readonly workingDirectory: URI | undefined,
		private readonly _warm: WarmQuery,
		private readonly _abortController: AbortController,
		private readonly _onDidSessionProgress: Emitter<AgentSignal>,
		private readonly _logService: ILogService,
	) {
		super();
		// Dispose chain → abort → SDK cleanup (sdk.d.ts:982).
		this._register(toDisposable(() => this._abortController.abort()));
		// Wake any parked prompt iterator so it can return `{ done: true }`.
		this._abortController.signal.addEventListener('abort', () => {
			this._pendingPromptDeferred.complete();
		}, { once: true });
		// The WarmQuery owns disposable resources (subprocess handle, etc.).
		// The dispose path is async but VS Code's lifecycle is sync — fire
		// and forget; log failures so a leaked handle surfaces. The SDK
		// types `Symbol.asyncDispose()` as `PromiseLike<void>`, so wrap in
		// `Promise.resolve` to get `.catch`.
		this._register(toDisposable(() => {
			void Promise.resolve(this._warm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeAgentSession] WarmQuery dispose failed: ${err}`));
		}));
	}

	/**
	 * Push a prompt onto the queue and await the turn's completion (the
	 * `result` SDKMessage). The first call also binds the prompt iterable
	 * to the WarmQuery and kicks off the consumer loop.
	 */
	async send(prompt: SDKUserMessage, turnId: string): Promise<void> {
		if (this._fatalError) {
			// Fast-fail: a previous turn crashed `_processMessages`. The
			// query and prompt iterable are already torn down, so a new
			// `send` here would push onto a dead pipe and park forever.
			throw this._fatalError;
		}
		if (this._abortController.signal.aborted) {
			throw new CancellationError();
		}
		if (!this._query) {
			this._query = this._warm.query(this._createPromptIterable());
			// Fire-and-forget: errors propagate via the in-flight deferred
			// (rejected by `_processMessages`'s catch latch) and are
			// re-logged here as a belt-and-suspenders for the no-inflight
			// case (e.g. a stream that errors before the first send).
			void this._processMessages().catch(err =>
				this._logService.error(`[ClaudeAgentSession] _processMessages crashed: ${err}`));
		}
		const deferred = new DeferredPromise<void>();
		this._inFlightRequests.push({ prompt, deferred, turnId });
		this._queuedPrompts.push(prompt);
		this._pendingPromptDeferred.complete();
		return deferred.p;
	}

	// #region Phase 7 / S3.2 — pending state

	/**
	 * Atomically register a pending-permission deferred and fire the
	 * `pending_confirmation` signal that surfaces the prompt to the
	 * workbench. The SDK is blocked on the returned promise inside its
	 * `canUseTool` callback until {@link respondToPermissionRequest}
	 * resolves it. Resolves with `false` if the session is already
	 * aborted.
	 *
	 * The register-fire-await sequence is deliberately atomic here:
	 * `agentSideEffects` auto-approves writes synchronously inside the
	 * fire path, so a deferred registered AFTER the fire would miss
	 * that response and the SDK's `canUseTool` would deadlock. Owning
	 * the sequence in the session keeps that ordering invariant in one
	 * place and mirrors {@link requestUserInput}.
	 */
	requestPermission(args: {
		readonly toolUseID: string;
		readonly state: ToolCallPendingConfirmationState;
		readonly permissionKind: ClaudePermissionKind;
		readonly permissionPath?: string;
	}): Promise<boolean> {
		if (this._abortController.signal.aborted) {
			return Promise.resolve(false);
		}
		const deferred = new DeferredPromise<boolean>();
		this._pendingPermissions.set(args.toolUseID, deferred);
		this._onDidSessionProgress.fire({
			kind: 'pending_confirmation',
			session: this.sessionUri,
			state: args.state,
			permissionKind: args.permissionKind,
			...(args.permissionPath !== undefined ? { permissionPath: args.permissionPath } : {}),
		});
		return deferred.p;
	}

	/**
	 * Resolve a parked permission deferred. Returns `true` if the id
	 * matched a pending entry, `false` otherwise so the agent's
	 * `_sessions.values()` iteration can short-circuit on first match.
	 * Mirrors {@link CopilotAgentSession.respondToPermissionRequest}.
	 */
	respondToPermissionRequest(requestId: string, approved: boolean): boolean {
		const deferred = this._pendingPermissions.get(requestId);
		if (!deferred) {
			return false;
		}
		this._pendingPermissions.delete(requestId);
		deferred.complete(approved);
		return true;
	}

	/**
	 * Fire a {@link ActionType.SessionInputRequested} action with the
	 * supplied {@link SessionInputRequest} and park on a deferred until
	 * {@link respondToUserInputRequest} resolves it.
	 *
	 * Generic over the request shape so both `AskUserQuestion` (carousel)
	 * and `ExitPlanMode` (single Approve/Deny) call sites share one seam.
	 * The agent (`_handleCanUseTool` / S3.5) builds the request and
	 * processes the response back into the SDK's `PermissionResult` shape.
	 *
	 * Resolves with `{ response: Cancel }` if the session is already
	 * aborted, so callers don't need to special-case the disposed path.
	 */
	requestUserInput(request: SessionInputRequest): Promise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }> {
		if (this._abortController.signal.aborted) {
			return Promise.resolve({ response: SessionInputResponseKind.Cancel });
		}
		const deferred = new DeferredPromise<{ response: SessionInputResponseKind; answers?: Record<string, SessionInputAnswer> }>();
		this._pendingUserInputs.set(request.id, deferred);
		this._onDidSessionProgress.fire({
			kind: 'action',
			session: this.sessionUri,
			action: {
				type: ActionType.SessionInputRequested,
				session: this.sessionUri.toString(),
				request,
			},
		});
		return deferred.p;
	}

	/**
	 * Resolve a parked user-input deferred. Returns `true` if the id
	 * matched, `false` otherwise. Symmetric to
	 * {@link respondToPermissionRequest}.
	 */
	respondToUserInputRequest(
		requestId: string,
		response: SessionInputResponseKind,
		answers?: Record<string, SessionInputAnswer>,
	): boolean {
		const deferred = this._pendingUserInputs.get(requestId);
		if (!deferred) {
			return false;
		}
		this._pendingUserInputs.delete(requestId);
		deferred.complete({ response, answers });
		return true;
	}

	/**
	 * Forwards to {@link Query.setPermissionMode} once the query is
	 * bound. Pre-bind, this is a no-op — the next materialize seeds the
	 * mode via `Options.permissionMode`. Phase 9 (yield-restart) will
	 * re-seed via the same `Options.permissionMode` path.
	 *
	 * Awaited so the SDK has acknowledged the mode change before the
	 * caller yields the next user message; otherwise a control-channel
	 * race could let `send` deliver a prompt under the previous mode.
	 */
	async setPermissionMode(mode: PermissionMode): Promise<void> {
		await this._query?.setPermissionMode(mode);
	}

	/**
	 * Resolve every parked permission with `false` and every parked
	 * input with `Cancel`. Called from {@link dispose} BEFORE
	 * `super.dispose()` (which fires the `_abortController.abort()`
	 * registered in the constructor) so the SDK's `canUseTool` callback
	 * unwinds cleanly with a deny result, the SDK's loop terminates,
	 * and the subprocess shuts down without orphaning a handle.
	 */
	private _denyAllPending(): void {
		for (const [, deferred] of this._pendingPermissions) {
			if (!deferred.isSettled) {
				deferred.complete(false);
			}
		}
		this._pendingPermissions.clear();

		for (const [, deferred] of this._pendingUserInputs) {
			if (!deferred.isSettled) {
				deferred.complete({ response: SessionInputResponseKind.Cancel });
			}
		}
		this._pendingUserInputs.clear();
	}

	override dispose(): void {
		// Order matters: deny BEFORE the abort-registered disposable in
		// `super.dispose()` so the SDK's `canUseTool` deferred resolves
		// with `false` and the SDK's `for await` loop unwinds before the
		// abort tears the subprocess down. Idempotent on re-entry.
		this._denyAllPending();
		super.dispose();
	}

	// #endregion

	/**
	 * Build the prompt iterable bound to {@link WarmQuery.query}.
	 * Each `next()` parks on {@link _pendingPromptDeferred} until either
	 * a prompt arrives ({@link send}) or the controller aborts.
	 */
	private _createPromptIterable(): AsyncIterable<SDKUserMessage> {
		return {
			[Symbol.asyncIterator]: () => ({
				next: async () => {
					while (this._queuedPrompts.length === 0) {
						if (this._abortController.signal.aborted) {
							return { done: true, value: undefined };
						}
						await this._pendingPromptDeferred.p;
						this._pendingPromptDeferred = new DeferredPromise<void>();
					}
					return { done: false, value: this._queuedPrompts.shift()! };
				},
			}),
		};
	}

	/**
	 * Consumer loop. Drains the SDK iterator, calls the pure mapper to
	 * convert each {@link SDKMessage} into {@link AgentSignal}s, fires
	 * them through `_onDidSessionProgress`, and completes the in-flight
	 * deferred on `result`. The mapper is called inside a try/catch so a
	 * single malformed SDK message can't kill the turn.
	 *
	 * On any uncaught error (cancellation, transport failure, or the
	 * post-loop "stream ended without result" guard) the catch block
	 * latches {@link _fatalError}, rejects every pending in-flight
	 * deferred with the same error, and rethrows so the void wrapper in
	 * {@link send} logs it. The latch ensures subsequent {@link send}
	 * calls fast-fail instead of parking on a dead query.
	 */
	private async _processMessages(): Promise<void> {
		const query = this._query;
		if (!query) {
			throw new Error('ClaudeAgentSession._processMessages called before query was bound');
		}
		try {
			for await (const message of query) {
				if (this._abortController.signal.aborted) {
					throw new CancellationError();
				}
				if (message.type === 'system' && message.subtype === 'init' && !this._isResumed) {
					this._isResumed = true;
				}
				// Mapper needs the current turn's `turnId`. Phase 6's
				// per-session sequencer keeps `_inFlightRequests.length <= 1`
				// while a turn is streaming, so the head element is the
				// active turn. Skip mapping if no turn is in flight (e.g.
				// the SDK emits a stray pre-prompt system message).
				const turnId = this._inFlightRequests[0]?.turnId;
				if (turnId !== undefined) {
					try {
						const signals = mapSDKMessageToAgentSignals(
							message,
							this.sessionUri,
							turnId,
							this._mapperState,
							this._logService,
						);
						for (const signal of signals) {
							this._onDidSessionProgress.fire(signal);
						}
					} catch (mapperErr) {
						this._logService.warn(`[ClaudeAgentSession] mapper threw, skipping message: ${mapperErr}`);
					}
				}
				if (message.type === 'result') {
					const completed = this._inFlightRequests.shift();
					completed?.deferred.complete();
				}
			}
			// Distinguish a cancelled stream (aborted controller drained
			// the iterator cleanly) from a truly anomalous end-of-stream.
			// The for-await above checks abort on each iteration, but a
			// dispose racing the very last `next()` lands here.
			if (this._abortController.signal.aborted) {
				throw new CancellationError();
			}
			throw new Error('Claude SDK stream ended without a result message');
		} catch (err) {
			const fatal = err instanceof Error ? err : new Error(String(err));
			this._fatalError = fatal;
			for (const req of this._inFlightRequests) {
				if (!req.deferred.isSettled) {
					req.deferred.error(fatal);
				}
			}
			this._inFlightRequests = [];
			throw fatal;
		}
	}
}

