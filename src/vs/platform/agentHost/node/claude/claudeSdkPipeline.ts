/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionMode, Query, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ClaudeRuntimeEffortLevel } from '../../common/claudeModelConfig.js';
import { AgentSignal } from '../../common/agentService.js';
import { ISessionDatabase } from '../../common/sessionDataService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ClaudePromptQueue, IPendingSdkMessage } from './claudePromptQueue.js';
import { ClaudeSdkMessageRouter } from './claudeSdkMessageRouter.js';
import type { SubagentRegistry } from './claudeSubagentRegistry.js';

/**
 * Callback the agent supplies via {@link ClaudeSdkPipeline.attachRematerializer}
 * so the pipeline can rebuild its underlying {@link WarmQuery} /
 * {@link AbortController} on abort or crash recovery without depending on
 * the materializer service directly. The callback MUST start the SDK in
 * `resume` mode (i.e. pass `Options.resume = sessionId` instead of
 * `Options.sessionId`) and MUST NOT re-fire the agent's
 * `onDidMaterializeSession` event — that event is once-per-provisional
 * promotion (see `claudeAgent.ts` materialize path).
 */
export interface IRematerializer {
	(reason: 'restart' | 'recover'): Promise<{ readonly warm: WarmQuery; readonly abortController: AbortController }>;
}

/**
 * Owns one SDK Query lifecycle for a Claude session. Knows nothing about
 * protocol turns, the workbench mapper, file-edit observers, or
 * permission registries — the consuming session subscribes to
 * {@link onDidProduceSignal} and fans out to its own collaborators.
 *
 * Responsibilities:
 *   • Hold the {@link WarmQuery} + {@link AbortController} for the
 *     active SDK subprocess. Both are mutable: rebind on abort/crash
 *     recovery via the supplied {@link IRematerializer}.
 *   • Drive a {@link ClaudePromptQueue} whose iterable is handed to
 *     `WarmQuery.query()`.
 *   • Apply the current model / effort / permissionMode to the SDK
 *     eagerly when the consumer calls {@link setModel} /
 *     {@link setEffort} / {@link setPermissionMode}. The SDK only takes
 *     these into account on the NEXT user request, so mid-turn calls
 *     are safe — no need to align the SDK setter with the prompt yield.
 *     Re-applied to a fresh Query on rebind.
 *   • Drain the SDK message stream, dispatch each message to the
 *     {@link ClaudeSdkMessageRouter}, settle the matching entry's
 *     deferred on `result`, and emit `SessionTurnComplete` only when
 *     the queue fully drains (intermediate results during steering
 *     preemption do NOT fire turn-complete — CONTEXT.md M10).
 *
 * Disposing the pipeline aborts the controller (terminating the SDK
 * subprocess per `sdk.d.ts:982`) and async-disposes the WarmQuery.
 */
export class ClaudeSdkPipeline extends Disposable {

	private _query: Query | undefined;
	private _warm: WarmQuery;
	private _abortController: AbortController;

	private readonly _queue: ClaudePromptQueue;

	/** Flips to `true` on the first `system:init` SDK message. Drives `Options.resume` decisions for downstream phases. */
	private _isResumed = false;

	/** Last model / effort / permission mode applied to the SDK via the runtime setters. Reset on rebind. */
	private _appliedModel: string | undefined;
	private _appliedEffort: ClaudeRuntimeEffortLevel | undefined;
	private _appliedPermissionMode: PermissionMode | undefined;

	/** Current values the consumer has asked for. Replayed to a fresh Query on bind / rebind. */
	private _currentModel: string | undefined;
	private _currentEffort: ClaudeRuntimeEffortLevel | undefined;
	private _currentPermissionMode: PermissionMode | undefined;

	private _rematerializer: IRematerializer | undefined;

	/** Set when the consumer loop ends in error (cancellation OR crash). Read by {@link send} to trigger rebind. */
	private _needsRebind = false;

	/** Tracks whether the consumer loop is currently draining {@link _query}. */
	private _consumerLoopRunning = false;

	private readonly _onDidProduceSignal = this._register(new Emitter<AgentSignal>());
	/**
	 * Single fan-out for every {@link AgentSignal} this session produces:
	 *   • Router-mapped per-message signals (response parts, tool calls,
	 *     pending confirmations, etc.).
	 *   • `SessionTurnComplete` action, fired when the LAST entry in the
	 *     queue drains via `result` (intermediate results during steering
	 *     preempt do NOT fire — CONTEXT.md M10).
	 *   • `steering_consumed` signal, fired the moment the iterable yields
	 *     a steering entry to the SDK.
	 */
	readonly onDidProduceSignal: Event<AgentSignal> = this._onDidProduceSignal.event;

	private readonly _router: ClaudeSdkMessageRouter;

	constructor(
		readonly sessionId: string,
		readonly sessionUri: URI,
		warm: WarmQuery,
		abortController: AbortController,
		dbRef: IReference<ISessionDatabase>,
		subagents: SubagentRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._warm = warm;
		this._abortController = abortController;
		this._wireAbortHandler(abortController);
		this._queue = this._register(instantiationService.createInstance(
			ClaudePromptQueue,
			sessionId,
			() => this._abortController.signal,
			(pendingId: string) => this._onDidProduceSignal.fire({
				kind: 'steering_consumed',
				session: this.sessionUri,
				id: pendingId,
			}),
		));
		this._router = this._register(instantiationService.createInstance(
			ClaudeSdkMessageRouter, sessionUri, dbRef, subagents,
		));
		this._register(this._router.onDidProduceSignal(s => this._onDidProduceSignal.fire(s)));
		// Dispose chain → abort → SDK cleanup. Reads the *current*
		// `_abortController` so a swap aborts the live subprocess.
		this._register(toDisposable(() => this._abortController.abort()));
		this._register(toDisposable(() => {
			void Promise.resolve(this._warm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeSdkPipeline] WarmQuery dispose failed: ${err}`));
		}));
	}

	get isResumed(): boolean { return this._isResumed; }

	get isAborted(): boolean { return this._abortController.signal.aborted; }

	/** Attach the rematerializer hook for abort / crash recovery. Optional — tests that exercise only the dispose path skip this. */
	attachRematerializer(rematerializer: IRematerializer): void {
		this._rematerializer = rematerializer;
	}

	/**
	 * Seed the current + applied config from materialize-time `Options`.
	 * The SDK already starts with these values, so we mark them as both
	 * "current" (what the consumer wants) and "applied" (what the SDK has)
	 * to avoid a redundant `setModel` / `applyFlagSettings` on first use.
	 */
	seedCurrentConfig(model: string | undefined, effort: ClaudeRuntimeEffortLevel | undefined, permissionMode: PermissionMode | undefined): void {
		this._currentModel = model;
		this._currentEffort = effort;
		this._currentPermissionMode = permissionMode;
		this._appliedModel = model;
		this._appliedEffort = effort;
		this._appliedPermissionMode = permissionMode;
	}

	/**
	 * Eagerly push a model change to the SDK. Safe to call mid-turn:
	 * `Query.setModel` only takes effect on the NEXT user request. No-op
	 * if the value is unchanged. Buffered as `_currentModel` until the
	 * Query is bound (and replayed on rebind).
	 */
	async setModel(model: string): Promise<void> {
		this._currentModel = model;
		if (this._query && model !== this._appliedModel) {
			try {
				await this._query.setModel(model);
				this._appliedModel = model;
			} catch (err) {
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setModel failed: ${err}`);
			}
		}
	}

	/**
	 * Eagerly push an effort-level change to the SDK via
	 * `applyFlagSettings({ effortLevel })`. Same mid-turn safety as
	 * {@link setModel}.
	 */
	async setEffort(effort: ClaudeRuntimeEffortLevel): Promise<void> {
		this._currentEffort = effort;
		if (this._query && effort !== this._appliedEffort) {
			try {
				await this._query.applyFlagSettings({ effortLevel: effort });
				this._appliedEffort = effort;
			} catch (err) {
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setEffort failed: ${err}`);
			}
		}
	}

	/**
	 * Queue a user prompt for the SDK. Resolves when the matching
	 * `result` message arrives.
	 *
	 * If a previous turn aborted or crashed, this triggers a rebind via
	 * the attached rematerializer before queueing.
	 */
	async send(prompt: SDKUserMessage, turnId: string): Promise<void> {
		if (this._needsRebind) {
			await this._rebindQuery('recover');
		}
		if (this._abortController.signal.aborted) {
			throw new CancellationError();
		}
		if (!this._query) {
			this._query = this._warm.query(this._queue.iterable);
			await this._replayCurrentConfig();
		}
		this._ensureConsumerLoop();
		const entry: IPendingSdkMessage = {
			sdkMessage: prompt,
			sdkUuid: typeof prompt.uuid === 'string' ? prompt.uuid : turnId,
			turnId,
			deferred: new DeferredPromise<void>(),
		};
		return this._queue.push(entry);
	}

	/**
	 * Push a `priority: 'now'` steering message into the iterable. The
	 * caller pre-builds the {@link SDKUserMessage} (the pipeline is SDK
	 * messaging-shaped, not protocol-shaped). `pendingMessageId` is the
	 * protocol `PendingMessage.id` that {@link onSteeringConsumed} will
	 * carry when the SDK accepts the message.
	 *
	 * No-op if the pipeline is aborted or no in-flight / queued request
	 * exists to inherit a `turnId` from (CONTEXT.md M10: steering folds
	 * into the in-progress protocol Turn).
	 */
	injectSteering(prompt: SDKUserMessage, pendingMessageId: string): void {
		if (this._abortController.signal.aborted) {
			this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (controller aborted) id=${pendingMessageId}`);
			return;
		}
		const parent = this._queue.peekParent();
		if (!parent) {
			this._logService.warn(`[Claude:${this.sessionId}] injectSteering: dropped (no in-flight turn) id=${pendingMessageId}`);
			return;
		}
		const sdkUuid = typeof prompt.uuid === 'string' ? prompt.uuid : pendingMessageId;
		// Steering deferreds aren't observed by anyone (the agent's send
		// promise is the original entry's deferred); attach a no-op catch
		// so a `failAll` rejection on abort/crash doesn't surface as an
		// unhandled rejection.
		this._queue.push({
			sdkMessage: prompt,
			sdkUuid,
			turnId: parent.turnId,
			deferred: new DeferredPromise<void>(),
			steeringPendingId: pendingMessageId,
		}).catch(() => { /* expected on abort/crash */ });
		this._logService.info(`[Claude:${this.sessionId}] injectSteering: enqueued id=${pendingMessageId} sdkUuid=${sdkUuid}`);
	}

	/**
	 * Cancel the in-flight SDK turn via the abort controller. Mirrors
	 * the production reference (`claudeCodeAgent.ts:719`). Drops every
	 * pending entry's deferred (rejected with `CancellationError`),
	 * marks the pipeline for rebind on next {@link send}. Idempotent.
	 *
	 * Safe to call during rebind: {@link _rebindQuery} swaps in a fresh
	 * placeholder {@link AbortController} before awaiting the
	 * rematerializer, so an abort issued during recovery lands on that
	 * placeholder and is honored when the freshly-built pair arrives
	 * (the rebind discards the new pair and surfaces a cancellation).
	 */
	abort(): void {
		if (this._abortController.signal.aborted) {
			return;
		}
		this._abortController.abort();
		this._queue.failAll(new CancellationError());
		this._query = undefined;
		this._needsRebind = true;
	}

	/**
	 * Forwards to {@link Query.setPermissionMode} once the query is
	 * bound; the value is also remembered so it's re-applied after a
	 * rebind. Permission mode is whole-session (not per-entry).
	 */
	async setPermissionMode(mode: PermissionMode): Promise<void> {
		this._currentPermissionMode = mode;
		if (this._query && mode !== this._appliedPermissionMode) {
			await this._query.setPermissionMode(mode);
			this._appliedPermissionMode = mode;
		}
	}

	private _wireAbortHandler(controller: AbortController): void {
		controller.signal.addEventListener('abort', () => {
			this._queue.notifyAborted();
		}, { once: true });
	}

	private _ensureConsumerLoop(): void {
		if (this._consumerLoopRunning) {
			return;
		}
		this._consumerLoopRunning = true;
		void this._processMessages()
			.catch(err => this._logService.error(`[ClaudeSdkPipeline:${this.sessionId}] _processMessages crashed: ${err}`))
			.finally(() => { this._consumerLoopRunning = false; });
	}

	/**
	 * Push the current model / effort / permissionMode to the SDK if they
	 * diverge from what was last applied. Called after binding a fresh
	 * Query (initial first-send and after rebind). Failures are logged.
	 */
	private async _replayCurrentConfig(): Promise<void> {
		try {
			if (this._currentModel !== undefined && this._currentModel !== this._appliedModel) {
				await this._query?.setModel(this._currentModel);
				this._appliedModel = this._currentModel;
			}
			if (this._currentEffort !== undefined && this._currentEffort !== this._appliedEffort) {
				await this._query?.applyFlagSettings({ effortLevel: this._currentEffort });
				this._appliedEffort = this._currentEffort;
			}
			if (this._currentPermissionMode !== undefined && this._currentPermissionMode !== this._appliedPermissionMode) {
				await this._query?.setPermissionMode(this._currentPermissionMode);
				this._appliedPermissionMode = this._currentPermissionMode;
			}
		} catch (err) {
			this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] _replayCurrentConfig failed: ${err}`);
		}
	}

	/**
	 * Dispose the dead SDK plumbing and rebuild via the agent-supplied
	 * rematerializer in `resume` mode. Re-applies the current model /
	 * effort / permission mode to the fresh Query.
	 */
	private async _rebindQuery(reason: 'restart' | 'recover'): Promise<void> {
		if (!this._rematerializer) {
			throw new Error(`ClaudeSdkPipeline.rebind: no rematerializer attached (reason=${reason})`);
		}
		const oldWarm = this._warm;
		// Install a placeholder controller BEFORE awaiting the
		// rematerializer so a concurrent {@link abort} has a live target
		// instead of returning early as idempotent against the already-
		// aborted old controller.
		const placeholder = new AbortController();
		this._abortController = placeholder;
		const built = await this._rematerializer(reason);
		// Dispose may have run while we were awaiting the rematerializer.
		// The dispose chain has already torn down the OLD warm/controller;
		// the freshly-built pair would otherwise leak its subprocess. Mirror
		// the post-await abort gate in `_materializeProvisional`.
		if (this._store.isDisposed) {
			built.abortController.abort();
			void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-after-dispose: warm dispose failed: ${err}`));
			throw new CancellationError();
		}
		// Abort issued while we were awaiting the rematerializer landed on
		// the placeholder. Discard the freshly-built pair and surface a
		// cancellation to the in-flight `send`.
		if (placeholder.signal.aborted) {
			built.abortController.abort();
			void Promise.resolve(built.warm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] rebind-aborted: warm dispose failed: ${err}`));
			void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during aborted rebind: ${err}`));
			this._queue.failAll(new CancellationError());
			this._query = undefined;
			this._needsRebind = true;
			throw new CancellationError();
		}
		void Promise.resolve(oldWarm[Symbol.asyncDispose]()).catch((err: unknown) =>
			this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] previous WarmQuery dispose failed during rebind: ${err}`));
		this._warm = built.warm;
		this._abortController = built.abortController;
		this._wireAbortHandler(built.abortController);
		this._queue.resetForRebind();
		this._needsRebind = false;
		// New SDK starts with the materializer's `Options.model` / effort /
		// permissionMode but we don't trust that to match `_currentModel`
		// etc. — reset the applied cache and let `_replayCurrentConfig`
		// push whatever the consumer last set.
		this._appliedModel = undefined;
		this._appliedEffort = undefined;
		this._appliedPermissionMode = undefined;
		this._query = this._warm.query(this._queue.iterable);
		await this._replayCurrentConfig();
	}

	/**
	 * Consumer loop. Drains the SDK iterator, dispatches each message
	 * to the {@link ClaudeSdkMessageRouter} (awaited so async file-edit
	 * observation completes before the next message), settles the head
	 * entry's deferred on `result`, and fires `SessionTurnComplete` only
	 * when the queue fully drains.
	 *
	 * On any uncaught error (cancellation, transport failure, or the
	 * post-loop "stream ended without result" guard) the catch block
	 * rejects every pending entry's deferred with the same error and
	 * marks `_needsRebind=true`. Cancellation is swallowed (don't
	 * rethrow); other errors propagate to the void caller's `.catch` for
	 * logging.
	 */
	private async _processMessages(): Promise<void> {
		const query = this._query;
		if (!query) {
			throw new Error('ClaudeSdkPipeline._processMessages called before query was bound');
		}
		try {
			for await (const message of query) {
				if (this._abortController.signal.aborted) {
					throw new CancellationError();
				}
				if (message.type === 'system' && message.subtype === 'init' && !this._isResumed) {
					this._isResumed = true;
				}
				const turnId = this._queue.peekParent()?.turnId;
				try {
					await this._router.handle(message, turnId);
				} catch (handlerErr) {
					this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] router threw, skipping: ${handlerErr}`);
				}
				if (message.type === 'result') {
					const completed = this._queue.settleHead();
					this._logService.info(`[Claude:${this.sessionId}] result for sdkUuid=${completed?.sdkUuid}`);
					// Final result: queue fully drained → protocol turn done.
					// Intermediate result (still pending entries from a
					// steering preempt) does NOT fire SessionTurnComplete.
					if (completed && this._queue.isEmpty) {
						this._onDidProduceSignal.fire({
							kind: 'action',
							session: this.sessionUri,
							action: {
								type: ActionType.SessionTurnComplete,
								session: this.sessionUri.toString(),
								turnId: completed.turnId,
							},
						});
					}
				}
			}
			if (this._abortController.signal.aborted) {
				throw new CancellationError();
			}
			throw new Error('Claude SDK stream ended without a result message');
		} catch (err) {
			const fatal = err instanceof Error ? err : new Error(String(err));
			// A previous unwinding loop must NOT clobber a freshly
			// rebound query. Identity-check against the local capture so
			// only the loop that owns the live query nulls it.
			if (this._query === query) {
				this._queue.failAll(fatal);
				this._query = undefined;
				this._needsRebind = true;
			}
			if (!isCancellationError(fatal)) {
				throw fatal;
			}
		}
	}
}
