/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentInfo, McpServerStatus, PermissionMode, Query, SDKUserMessage, SlashCommand, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
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
 * The model / effort / permissionMode the SDK `Options` were built with, seeded
 * into the pipeline's applied-config cache so the first runtime {@link ClaudeSdkPipeline.setModel}
 * / {@link ClaudeSdkPipeline.setPermissionMode} skips a redundant SDK call.
 */
export interface ISdkAppliedConfig {
	readonly model: string | undefined;
	readonly effort: ClaudeRuntimeEffortLevel | undefined;
	readonly permissionMode: PermissionMode | undefined;
}

/**
 * Snapshot of everything the SDK has currently resolved for this
 * session. Returned by {@link ClaudeSdkPipeline.snapshotResolvedCustomizations}.
 */
export interface ISdkResolvedCustomizations {
	readonly commands: readonly SlashCommand[];
	readonly agents: readonly AgentInfo[];
	readonly mcpServers: readonly McpServerStatus[];
	/**
	 * Native plugins the live session actually loaded, as reported by the
	 * SDK `system/init` message. Used to filter the disk-discovered native
	 * plugins post-materialize: a plugin declared in `enabledPlugins` but
	 * absent here (bad path, manifest error, untrusted workspace) is hidden.
	 *
	 * `source` is the plugin id (`<plugin>@<marketplace>`) and is the
	 * authoritative match key — the SDK's `path` is unreliable for
	 * workspace-`local`-scoped plugins (it can report a non-cache path). The
	 * SDK `.d.ts` types the element as `{ name, path }` but the runtime adds
	 * `source`, so it is captured as optional.
	 */
	readonly plugins: readonly { readonly name: string; readonly path: string; readonly source?: string }[];
}

/**
 * Owns ONE immutable SDK Query lifecycle for a Claude session. Knows nothing
 * about protocol turns, the workbench mapper, file-edit observers, or permission
 * registries — the consuming session subscribes to {@link onDidProduceSignal}.
 *
 * The {@link WarmQuery} / {@link AbortController} are fixed for the pipeline's
 * whole life (never swapped): a rebuild is the session disposing this pipeline
 * and constructing a fresh one. When the consumer loop ends abnormally
 * (abort / crash / stream-end) the pipeline reports {@link isDead} and stops; it
 * does NOT self-heal. Config is applied eagerly via {@link setModel} /
 * {@link setEffort} / {@link setPermissionMode} (the SDK takes these into account
 * on the next user request), deduped against the seeded {@link ISdkAppliedConfig}.
 *
 * Disposing the pipeline aborts the controller (terminating the SDK subprocess)
 * and async-disposes the WarmQuery.
 */
export class ClaudeSdkPipeline extends Disposable {

	/**
	 * Phase 11 — snapshot the SDK's currently-resolved customization
	 * surface (slash commands / skills, subagents, MCP servers). This
	 * is the SDK's view of "what does this session actually have
	 * access to right now" — covers everything the SDK loaded itself
	 * (`~/.claude/**`, `.claude/agents/`, `settings.json` MCP) AND
	 * anything we fed in via `Options.plugins`. The host overlays
	 * client-side enablement separately.
	 */
	async snapshotResolvedCustomizations(): Promise<ISdkResolvedCustomizations> {
		const query = this._liveQuery();
		const [commands, agents, mcpServers] = await Promise.all([
			query.supportedCommands(),
			query.supportedAgents(),
			query.mcpServerStatus(),
		]);
		return { commands, agents, mcpServers, plugins: this._initPlugins };
	}

	async startMcpServer(serverName: string): Promise<boolean> {
		const lifecycle = this._liveQuery();
		if (lifecycle.toggleMcpServer && lifecycle.reconnectMcpServer) {
			await lifecycle.toggleMcpServer(serverName, true);
			await lifecycle.reconnectMcpServer(serverName);
			return true;
		}
		return false;
	}

	async stopMcpServer(serverName: string): Promise<boolean> {
		const lifecycle = this._liveQuery();
		if (!lifecycle.toggleMcpServer) {
			return false;
		}
		await lifecycle.toggleMcpServer(serverName, false);
		return true;
	}

	/** The live SDK stream, or throw if the pipeline has died (the session rebuilds a fresh one). */
	private _liveQuery(): Query {
		if (this._dead) {
			throw new Error(`ClaudeSdkPipeline:${this.sessionId}: query is dead`);
		}
		return this._query;
	}

	/**
	 * The SDK stream, bound once off {@link _warm} in the constructor and never
	 * re-bound (the prompt iterable parks between turns rather than ending).
	 */
	private readonly _query: Query;
	private readonly _warm: WarmQuery;
	private readonly _abortController: AbortController;

	private readonly _queue: ClaudePromptQueue;

	/** Flips to `true` on the first `system:init` SDK message. */
	private _isResumed = false;

	/**
	 * Native plugins reported by the most recent `system:init` message.
	 * Captured on *every* init (including resume) so the post-materialize
	 * native-plugin filter always reflects the live set. `source` is the
	 * plugin id and is the reliable match key (see {@link ISdkResolvedCustomizations}).
	 */
	private _initPlugins: readonly { readonly name: string; readonly path: string; readonly source?: string }[] = [];

	/** Last model / effort / permission mode applied to the live Query (dedup only). Seeded at construction. */
	private _appliedModel: string | undefined;
	private _appliedEffort: ClaudeRuntimeEffortLevel | undefined;
	private _appliedPermissionMode: PermissionMode | undefined;

	/**
	 * Terminal health flag. Set synchronously by {@link abort} and when the
	 * consumer loop ends abnormally (crash / stream-end). Read by the session's
	 * `send` pre-flight to rebuild a fresh pipeline; the pipeline never revives.
	 */
	private _dead = false;

	/** Tracks whether the (single) consumer loop has been started. */
	private _consumerLoopRunning = false;

	private readonly _onDidProduceSignal = this._register(new Emitter<AgentSignal>());
	/**
	 * Single fan-out for every {@link AgentSignal} this session produces:
	 *   • Router-mapped per-message signals (response parts, tool calls,
	 *     pending confirmations, etc.).
	 *   • `ChatTurnComplete` action, fired when the LAST entry in the
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
		readonly chatChannelUri: URI,
		warm: WarmQuery,
		abortController: AbortController,
		dbRef: IReference<ISessionDatabase>,
		subagents: SubagentRegistry,
		clientToolOwner: ((toolName: string) => string | undefined) | undefined,
		appliedConfig: ISdkAppliedConfig,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._warm = warm;
		this._abortController = abortController;
		this._appliedModel = appliedConfig.model;
		this._appliedEffort = appliedConfig.effort;
		this._appliedPermissionMode = appliedConfig.permissionMode;
		this._wireAbortHandler(abortController);
		this._queue = this._register(instantiationService.createInstance(
			ClaudePromptQueue,
			sessionId,
			() => this._abortController.signal,
			(pendingId: string) => this._onDidProduceSignal.fire({
				kind: 'steering_consumed',
				chat: this.chatChannelUri,
				id: pendingId,
			}),
		));
		this._router = this._register(instantiationService.createInstance(
			ClaudeSdkMessageRouter, sessionUri, chatChannelUri, dbRef, subagents, clientToolOwner,
		));
		this._register(this._router.onDidProduceSignal(s => this._onDidProduceSignal.fire(s)));
		// Bind the SDK stream eagerly. The pipeline is immutable (never re-binds),
		// and binding here — before the session assigns `_pipeline` — guarantees a
		// runtime `setPermissionMode` that races the first send can never be lost
		// to an unbound query. The iterable parks until the first prompt is pushed,
		// so no turn runs until `send`.
		this._query = this._warm.query(this._queue.iterable);
		// Dispose chain → abort → SDK cleanup.
		this._register(toDisposable(() => this._abortController.abort()));
		this._register(toDisposable(() => {
			void Promise.resolve(this._warm[Symbol.asyncDispose]()).catch((err: unknown) =>
				this._logService.warn(`[ClaudeSdkPipeline] WarmQuery dispose failed: ${err}`));
		}));
	}

	get isResumed(): boolean { return this._isResumed; }

	get isAborted(): boolean { return this._abortController.signal.aborted; }

	/** Terminal: the consumer loop ended (abort / crash / stream-end). The session rebuilds. */
	get isDead(): boolean { return this._dead; }

	/**
	 * Whether a turn is currently in flight or queued. False between turns (the
	 * warm query parks with a drained queue). Used by non-destructive idle
	 * release to avoid tearing the pipeline down mid-turn.
	 */
	get hasActiveTurn(): boolean { return !this._queue.isEmpty; }

	/**
	 * Abort the live SDK subprocess and **await its actual exit**.
	 *
	 * `WarmQuery[Symbol.asyncDispose]()` calls the query's `close()`, which
	 * *fires* the SDK cleanup but does not await it — so it returns while the
	 * subprocess is still shutting down (and still re-flushing its transcript).
	 * `Query.return()` awaits the same (memoized) cleanup, which in turn awaits
	 * `transport.waitForExit()` — the OS process actually exiting after its
	 * final transcript flush. Awaiting that is what lets a caller safely reuse
	 * the `--session-id` (the CLI rejects a fresh spawn while `<id>.jsonl`
	 * still exists, and the dying process would otherwise recreate it).
	 */
	async shutdownAndWait(): Promise<void> {
		this._abortController.abort();
		this._dead = true;
		try {
			await this._warm[Symbol.asyncDispose]();
			await this._query.return(undefined);
		} catch (err) {
			this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] shutdownAndWait: teardown failed`, err);
		}
	}

	/**
	 * Eagerly push a model change to the SDK. Safe to call mid-turn:
	 * `Query.setModel` only takes effect on the NEXT user request. No-op if the
	 * value is unchanged or the pipeline has died.
	 */
	async setModel(model: string): Promise<void> {
		if (!this._dead && model !== this._appliedModel) {
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
	 *
	 * `undefined` means "clear the effort the SDK is currently applying" —
	 * issued as `applyFlagSettings({ effortLevel: null })` (sdk.d.ts:2263:
	 * passing `null` clears a key from the flag layer). This is what makes a
	 * switch to a model that does not support reasoning effort (e.g. Haiku)
	 * drop a `'high'` left over from a prior effort-capable model instead of
	 * replaying it onto a model the API will 400 on.
	 */
	async setEffort(effort: ClaudeRuntimeEffortLevel | undefined): Promise<void> {
		if (!this._dead && effort !== this._appliedEffort) {
			try {
				await this._query.applyFlagSettings({ effortLevel: effort ?? null });
				this._appliedEffort = effort;
			} catch (err) {
				this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] setEffort failed: ${err}`);
			}
		}
	}

	/**
	 * Forwards to {@link Query.setPermissionMode}. No-op if unchanged or dead.
	 * Permission mode is whole-session (not per-entry).
	 */
	async setPermissionMode(mode: PermissionMode): Promise<void> {
		if (!this._dead && mode !== this._appliedPermissionMode) {
			await this._query.setPermissionMode(mode);
			this._appliedPermissionMode = mode;
		}
	}

	/**
	 * Queue a user prompt for the SDK. Resolves when the matching `result`
	 * message arrives. The session's `send` pre-flight has already rebuilt a
	 * fresh pipeline if this one was dead, so this only runs on a live query.
	 */
	async send(prompt: SDKUserMessage, turnId: string): Promise<void> {
		if (this._abortController.signal.aborted) {
			throw new CancellationError();
		}
		this._ensureConsumerLoop();
		const entry: IPendingSdkMessage = {
			sdkMessage: prompt,
			sdkUuid: typeof prompt.uuid === 'string' ? prompt.uuid : turnId,
			turnId,
			stopWatch: StopWatch.create(false),
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
			stopWatch: parent.stopWatch,
			deferred: new DeferredPromise<void>(),
			steeringPendingId: pendingMessageId,
		}).catch(() => { /* expected on abort/crash */ });
		this._logService.info(`[Claude:${this.sessionId}] injectSteering: enqueued id=${pendingMessageId} sdkUuid=${sdkUuid}`);
	}

	/**
	 * Cancel the in-flight SDK turn via the abort controller. Drops every
	 * pending entry's deferred (rejected with `CancellationError`) and marks the
	 * pipeline {@link isDead} synchronously so the next `send` rebuilds a fresh
	 * pipeline rather than reusing this one.
	 *
	 * Idempotent on the pipeline's own terminal state ({@link isDead}), NOT on the
	 * shared `AbortController` signal: the session aborts the controller it shares
	 * with this pipeline *before* calling here, so a `signal.aborted` guard would
	 * skip `failAll` and strand the in-flight `send` deferred.
	 */
	abort(): void {
		if (this._dead) {
			return;
		}
		this._abortController.abort();
		this._queue.failAll(new CancellationError());
		this._dead = true;
	}

	private _wireAbortHandler(controller: AbortController): void {
		controller.signal.addEventListener('abort', () => {
			this._queue.notifyAborted();
		}, { once: true });
	}

	/**
	 * Start the single consumer loop for this pipeline's query if it isn't
	 * running. The loop runs for the pipeline's whole life (the iterable parks
	 * between turns); when it ends the query stream is over and the pipeline is
	 * dead — there is no hand-off to a fresh pass (rebuild mints a new pipeline).
	 */
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
	 * Consumer loop. Drains the SDK iterator, dispatches each message
	 * to the {@link ClaudeSdkMessageRouter} (awaited so async file-edit
	 * observation completes before the next message), settles the head
	 * entry's deferred on `result`, and fires `ChatTurnComplete` only
	 * when the queue fully drains.
	 *
	 * On any uncaught error (cancellation, transport failure, or the
	 * "stream ended without result" guard — the stream only ends on
	 * abort/crash/dispose since the iterable parks between turns) the catch
	 * rejects every pending entry's deferred and marks the pipeline
	 * {@link isDead}. Cancellation is swallowed; other errors propagate to the
	 * void caller's `.catch` for logging.
	 */
	private async _processMessages(): Promise<void> {
		const query = this._query;
		try {
			for await (const message of query) {
				if (this._abortController.signal.aborted) {
					throw new CancellationError();
				}
				if (message.type === 'system' && message.subtype === 'init') {
					// Capture the loaded native-plugin list on every init (incl.
					// resume) so the post-materialize filter is fresh.
					this._initPlugins = message.plugins ?? [];
					if (!this._isResumed) {
						this._isResumed = true;
					}
				}
				const turnId = this._queue.peekParent()?.turnId;
				const turnDuration = this._queue.peekParent()?.stopWatch.elapsed();
				try {
					await this._router.handle(message, turnId, turnDuration);
				} catch (handlerErr) {
					this._logService.warn(`[ClaudeSdkPipeline:${this.sessionId}] router threw, skipping: ${handlerErr}`);
				}
				if (message.type === 'result') {
					const completed = this._queue.settleHead();
					this._logService.info(`[Claude:${this.sessionId}] result for sdkUuid=${completed?.sdkUuid}`);
					// Final result: queue fully drained → protocol turn done.
					// Intermediate result (still pending entries from a
					// steering preempt) does NOT fire ChatTurnComplete.
					if (completed && this._queue.isEmpty) {
						this._onDidProduceSignal.fire({
							kind: 'action',
							resource: this.chatChannelUri,
							action: {
								type: ActionType.ChatTurnComplete,
								turnId: completed.turnId,
								duration: Math.max(0, completed.stopWatch.elapsed()),
							},
						});
					}
				}
			}
			if (this._abortController.signal.aborted) {
				throw new CancellationError();
			}
			// The parked iterable only ends on abort / crash / dispose, so an end
			// without a result is a dead subprocess — mark the pipeline for rebuild.
			throw new Error('Claude SDK stream ended without a result message');
		} catch (err) {
			const fatal = err instanceof Error ? err : new Error(String(err));
			this._queue.failAll(fatal);
			this._dead = true;
			if (!isCancellationError(fatal)) {
				throw fatal;
			}
		}
	}
}
