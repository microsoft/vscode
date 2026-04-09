/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IActionEnvelope, ISessionAction, IStateAction, isSessionAction } from './sessionActions.js';
import { rootReducer, sessionReducer } from './sessionReducers.js';
import { terminalReducer } from './protocol/reducers.js';
import type { IRootAction, ISessionAction as IProtocolSessionAction, ITerminalAction } from './protocol/action-origin.generated.js';
import type { IRootState, ISessionState, ITerminalState } from './protocol/state.js';
import type { IStateSnapshot } from './sessionProtocol.js';
import { StateComponents } from './sessionState.js';

// --- Public API --------------------------------------------------------------

/**
 * A read-only subscription to an agent host resource (root, session, or terminal).
 *
 * Subscriptions are hydrated from an initial server snapshot and kept in sync
 * via action envelopes. Session subscriptions support write-ahead
 * reconciliation — optimistic state is layered on top of confirmed state.
 */
export interface IAgentSubscription<T> {
	/**
	 * The current state value. For write-ahead subscriptions (sessions) this
	 * reflects the optimistic state (confirmed + pending replayed). For
	 * server-only subscriptions (root, terminal) this equals `verifiedValue`.
	 *
	 * `undefined` until the first snapshot arrives. An `Error` if subscription
	 * failed.
	 */
	readonly value: T | Error | undefined;

	/**
	 * The server-confirmed state with no pending optimistic actions applied.
	 * `undefined` until the first snapshot arrives.
	 */
	readonly verifiedValue: T | undefined;

	/** Fires when {@link value} changes (optimistic or confirmed). */
	readonly onDidChange: Event<T>;

	/** Fires before a server-originated action is applied to this subscription's state. */
	readonly onWillApplyAction: Event<IActionEnvelope>;

	/** Fires after a server-originated action is applied to this subscription's state. */
	readonly onDidApplyAction: Event<IActionEnvelope>;
}

// --- Base Implementation -----------------------------------------------------

/**
 * Base class for agent subscriptions. Handles envelope reception, confirmed
 * state management, and action event emission.
 *
 * Subclasses provide the reducer and optionally override reconciliation
 * behavior.
 */
abstract class BaseAgentSubscription<T> extends Disposable implements IAgentSubscription<T> {

	protected _confirmedState: T | undefined;
	private _error: Error | undefined;
	private _bufferedEnvelopes: IActionEnvelope[] | undefined;

	protected readonly _onDidChange = this._register(new Emitter<T>());
	readonly onDidChange: Event<T> = this._onDidChange.event;

	protected readonly _onWillApplyAction = this._register(new Emitter<IActionEnvelope>());
	readonly onWillApplyAction: Event<IActionEnvelope> = this._onWillApplyAction.event;

	protected readonly _onDidApplyAction = this._register(new Emitter<IActionEnvelope>());
	readonly onDidApplyAction: Event<IActionEnvelope> = this._onDidApplyAction.event;

	protected readonly _clientId: string;
	protected readonly _log: (msg: string) => void;

	constructor(clientId: string, log: (msg: string) => void) {
		super();
		this._clientId = clientId;
		this._log = log;
	}

	get value(): T | Error | undefined {
		if (this._error) {
			return this._error;
		}
		return this._getOptimisticState() ?? this._confirmedState;
	}

	get verifiedValue(): T | undefined {
		return this._confirmedState;
	}

	/**
	 * Apply an initial snapshot from the server.
	 */
	handleSnapshot(state: T, fromSeq: number): void {
		this._confirmedState = state;
		this._error = undefined;
		this._onSnapshotApplied(fromSeq);
		this._onDidChange.fire(this.value as T);
	}

	/**
	 * Mark this subscription as failed.
	 */
	setError(error: Error): void {
		this._error = error;
	}

	/**
	 * Process an incoming action envelope. The subscription determines
	 * whether the action is relevant via {@link _isRelevantAction}.
	 */
	receiveEnvelope(envelope: IActionEnvelope): void {
		if (!this._isRelevantAction(envelope.action)) {
			return;
		}

		// Buffer actions that arrive before the snapshot has been applied.
		// They're replayed in _onSnapshotApplied().
		if (this._confirmedState === undefined) {
			if (!this._bufferedEnvelopes) {
				this._bufferedEnvelopes = [];
			}
			this._bufferedEnvelopes.push(envelope);
			return;
		}

		const isOwnAction = envelope.origin?.clientId === this._clientId;
		this._onWillApplyAction.fire(envelope);

		this._reconcile(envelope, isOwnAction);

		this._onDidApplyAction.fire(envelope);
	}

	/** Apply the reducer to confirmed state. Subclasses must implement. */
	protected abstract _applyReducer(state: T, action: IStateAction): T;

	/** Whether the given action targets this subscription. */
	protected abstract _isRelevantAction(action: IStateAction): boolean;

	/** Return optimistic state if write-ahead is active, otherwise `undefined`. */
	protected _getOptimisticState(): T | undefined {
		return undefined; // No write-ahead by default
	}

	/** Hook called after a snapshot is applied. Replays buffered actions. */
	protected _onSnapshotApplied(_fromSeq: number): void {
		// Replay any actions that arrived before the snapshot
		const buffered = this._bufferedEnvelopes;
		if (buffered) {
			this._bufferedEnvelopes = undefined;
			for (const envelope of buffered) {
				// Only replay actions with serverSeq > fromSeq (snapshot is authoritative up to fromSeq)
				if (envelope.serverSeq > _fromSeq) {
					const isOwnAction = envelope.origin?.clientId === this._clientId;
					this._reconcile(envelope, isOwnAction);
				}
			}
		}
	}

	/**
	 * Default reconciliation: apply to confirmed, fire change event.
	 * Session subscriptions override this for write-ahead.
	 */
	protected _reconcile(envelope: IActionEnvelope, _isOwnAction: boolean): void {
		this._confirmedState = this._applyReducer(this._confirmedState!, envelope.action);
		this._onDidChange.fire(this.value as T);
	}
}

// --- Root State Subscription -------------------------------------------------

/**
 * Subscription to the root state at `agenthost:/root`.
 * Server-only mutations — no write-ahead.
 */
export class RootStateSubscription extends BaseAgentSubscription<IRootState> {

	protected override _applyReducer(state: IRootState, action: IStateAction): IRootState {
		return rootReducer(state, action as IRootAction, this._log);
	}

	protected override _isRelevantAction(action: IStateAction): boolean {
		return action.type.startsWith('root/');
	}
}

// --- Session State Subscription ----------------------------------------------

interface IPendingAction {
	readonly clientSeq: number;
	readonly action: ISessionAction;
}

/**
 * Subscription to a session at `copilot:/<uuid>`.
 * Supports write-ahead reconciliation for client-dispatchable actions.
 */
export class SessionStateSubscription extends BaseAgentSubscription<ISessionState> {

	private readonly _pendingActions: IPendingAction[] = [];
	private _optimisticState: ISessionState | undefined;
	private readonly _sessionUri: string;
	private readonly _seqAllocator: () => number;

	constructor(
		sessionUri: string,
		clientId: string,
		seqAllocator: () => number,
		log: (msg: string) => void,
	) {
		super(clientId, log);
		this._sessionUri = sessionUri;
		this._seqAllocator = seqAllocator;
	}

	/**
	 * Optimistically apply a session action. Returns the clientSeq to send
	 * to the server so it can echo back for reconciliation.
	 */
	applyOptimistic(action: ISessionAction): number {
		const clientSeq = this._seqAllocator();
		this._pendingActions.push({ clientSeq, action });
		// Apply on top of current optimistic
		const base = this._optimisticState ?? this.verifiedValue;
		if (base) {
			this._optimisticState = sessionReducer(base, action as IProtocolSessionAction, this._log);
			this._onDidChange.fire(this._optimisticState);
		}
		return clientSeq;
	}

	protected override _getOptimisticState(): ISessionState | undefined {
		return this._optimisticState;
	}

	protected override _applyReducer(state: ISessionState, action: IStateAction): ISessionState {
		return sessionReducer(state, action as IProtocolSessionAction, this._log);
	}

	protected override _isRelevantAction(action: IStateAction): boolean {
		return isSessionAction(action) && action.session === this._sessionUri;
	}

	protected override _onSnapshotApplied(fromSeq: number): void {
		// Replay buffered actions first
		super._onSnapshotApplied(fromSeq);
		// Re-apply pending actions on top of new confirmed state
		this._recomputeOptimistic();
	}

	protected override _reconcile(envelope: IActionEnvelope, isOwnAction: boolean): void {
		if (isOwnAction && envelope.origin) {
			const idx = this._pendingActions.findIndex(p => p.clientSeq === envelope.origin!.clientSeq);
			if (idx !== -1) {
				if (envelope.rejectionReason) {
					this._pendingActions.splice(idx, 1);
				} else {
					this._confirmedApply(envelope.action);
					this._pendingActions.splice(idx, 1);
				}
			} else {
				this._confirmedApply(envelope.action);
			}
		} else {
			this._confirmedApply(envelope.action);
		}
		this._recomputeOptimistic();
	}

	private _confirmedApply(action: IStateAction): void {
		if (this._confirmedState) {
			this._confirmedState = this._applyReducer(this._confirmedState, action);
		}
	}

	private _recomputeOptimistic(): void {
		const confirmed = this._confirmedState;
		if (!confirmed) {
			this._optimisticState = undefined;
			return;
		}

		if (this._pendingActions.length === 0) {
			this._optimisticState = undefined; // No pending → value falls through to confirmed
			this._onDidChange.fire(confirmed);
			return;
		}

		let state = confirmed;
		for (const pending of this._pendingActions) {
			state = sessionReducer(state, pending.action as IProtocolSessionAction, this._log);
		}
		this._optimisticState = state;
		this._onDidChange.fire(state);
	}

	/**
	 * Clear pending actions for this session (e.g., on unsubscribe).
	 */
	clearPending(): void {
		this._pendingActions.length = 0;
		this._optimisticState = undefined;
	}
}

// --- Terminal State Subscription ---------------------------------------------

/**
 * Subscription to a terminal at an agent-host terminal URI.
 * Server-only mutations — no write-ahead (terminal I/O is side-effect-only).
 */
export class TerminalStateSubscription extends BaseAgentSubscription<ITerminalState> {

	private readonly _terminalUri: string;

	constructor(terminalUri: string, clientId: string, log: (msg: string) => void) {
		super(clientId, log);
		this._terminalUri = terminalUri;
	}

	protected override _applyReducer(state: ITerminalState, action: IStateAction): ITerminalState {
		return terminalReducer(state, action as ITerminalAction, this._log);
	}

	protected override _isRelevantAction(action: IStateAction): boolean {
		return action.type.startsWith('terminal/') && (action as { terminal: string }).terminal === this._terminalUri;
	}
}

// --- Subscription Manager ----------------------------------------------------

/**
 * Manages the lifecycle of resource subscriptions for an agent connection.
 *
 * Provides refcounted access via {@link getSubscription} — the subscription
 * is created on first acquire, subscribes to the server, and stays alive
 * until the last reference is disposed.
 *
 * The connection feeds action envelopes to all active subscriptions via
 * {@link receiveEnvelope}.
 */
export class AgentSubscriptionManager extends Disposable {

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private readonly _subscriptions = new Map<string, { sub: BaseAgentSubscription<any>; refCount: number }>();
	private readonly _rootState: RootStateSubscription;
	private readonly _clientId: string;
	private readonly _seqAllocator: () => number;
	private readonly _log: (msg: string) => void;
	private readonly _subscribe: (resource: URI) => Promise<IStateSnapshot>;
	private readonly _unsubscribe: (resource: URI) => void;

	constructor(
		clientId: string,
		seqAllocator: () => number,
		log: (msg: string) => void,
		subscribe: (resource: URI) => Promise<IStateSnapshot>,
		unsubscribe: (resource: URI) => void,
	) {
		super();
		this._clientId = clientId;
		this._seqAllocator = seqAllocator;
		this._log = log;
		this._subscribe = subscribe;
		this._unsubscribe = unsubscribe;
		this._rootState = this._register(new RootStateSubscription(clientId, log));
	}

	/** The always-live root state subscription. */
	get rootState(): IAgentSubscription<IRootState> {
		return this._rootState;
	}

	/**
	 * Initialize the root state from a snapshot received during the
	 * connection handshake.
	 */
	handleRootSnapshot(state: IRootState, fromSeq: number): void {
		this._rootState.handleSnapshot(state, fromSeq);
	}

	/**
	 * Get or create a refcounted subscription to any resource. Disposing
	 * the returned reference decrements the refcount; when it reaches zero
	 * the subscription is torn down and the server is notified.
	 */
	getSubscription<T>(kind: StateComponents, resource: URI): IReference<IAgentSubscription<T>> {
		const key = resource.toString();
		const existing = this._subscriptions.get(key);
		if (existing) {
			existing.refCount++;
			return {
				object: existing.sub,
				dispose: () => this._releaseSubscription(key),
			};
		}

		// Create new subscription based on caller-specified kind
		const sub = this._createSubscription(kind, key);
		const entry = { sub, refCount: 1 };
		this._subscriptions.set(key, entry);

		// Kick off server subscription asynchronously.
		// Capture the entry reference so we can validate it hasn't been
		// replaced by a new subscription for the same key (race guard).
		this._subscribe(resource).then(snapshot => {
			if (this._subscriptions.get(key) === entry) {
				sub.handleSnapshot(snapshot.state as never, snapshot.fromSeq);
			}
		}).catch(err => {
			if (this._subscriptions.get(key) === entry) {
				sub.setError(err instanceof Error ? err : new Error(String(err)));
			}
		});

		return {
			object: sub,
			dispose: () => this._releaseSubscription(key),
		};
	}

	/**
	 * Route an incoming action envelope to all active subscriptions.
	 */
	receiveEnvelope(envelope: IActionEnvelope): void {
		// Root state gets all root actions
		this._rootState.receiveEnvelope(envelope);
		// Other subscriptions get filtered actions
		for (const { sub } of this._subscriptions.values()) {
			sub.receiveEnvelope(envelope);
		}
	}

	/**
	 * Dispatch a client action. Applies optimistically to the relevant
	 * subscription if applicable, then returns the clientSeq.
	 */
	dispatchOptimistic(action: ISessionAction | ITerminalAction): number {
		if (isSessionAction(action)) {
			const key = action.session.toString();
			const entry = this._subscriptions.get(key);
			if (entry && entry.sub instanceof SessionStateSubscription) {
				return entry.sub.applyOptimistic(action);
			}
		}
		return this._seqAllocator();
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private _createSubscription(kind: StateComponents, key: string): BaseAgentSubscription<any> {
		switch (kind) {
			case StateComponents.Session:
				return new SessionStateSubscription(key, this._clientId, this._seqAllocator, this._log);
			case StateComponents.Terminal:
				return new TerminalStateSubscription(key, this._clientId, this._log);
			default:
				return new TerminalStateSubscription(key, this._clientId, this._log);
		}
	}

	private _releaseSubscription(key: string): void {
		const entry = this._subscriptions.get(key);
		if (!entry) {
			return;
		}
		entry.refCount--;
		if (entry.refCount <= 0) {
			this._subscriptions.delete(key);
			try { this._unsubscribe(URI.parse(key)); } catch { /* best-effort */ }
			if (entry.sub instanceof SessionStateSubscription) {
				entry.sub.clearPending();
			}
			entry.sub.dispose();
		}
	}

	override dispose(): void {
		for (const [key, entry] of this._subscriptions) {
			try { this._unsubscribe(URI.parse(key)); } catch { /* best-effort */ }
			entry.sub.dispose();
		}
		this._subscriptions.clear();
		super.dispose();
	}
}
