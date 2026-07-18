/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionEnvelope, ActionType, ChangesetAction, ChatAction, AnnotationsAction, ClientAnnotationsAction, ClientChangesetAction, IRootConfigChangedAction, SessionAction, StateAction, isChangesetAction, isChatAction, isAnnotationsAction, isSessionAction } from './sessionActions.js';
import { changesetReducer, chatReducer, annotationsReducer, rootReducer, sessionReducer } from './sessionReducers.js';
import { terminalReducer } from './protocol/reducers.js';
import type { RootAction, SessionAction as IProtocolSessionAction, ChatAction as IProtocolChatAction, TerminalAction } from './protocol/action-origin.generated.js';
import type { AnnotationsState, ChangesetState, ChatState, RootState, SessionState, TerminalState } from './protocol/state.js';
import type { IStateSnapshot } from './sessionProtocol.js';
import { isAhpRootChannel, ROOT_STATE_URI, StateComponents } from './sessionState.js';

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

	/** Fires when the subscription enters an error state. */
	readonly onDidError?: Event<Error>;

	/** Fires before a server-originated action is applied to this subscription's state. */
	readonly onWillApplyAction: Event<ActionEnvelope>;

	/** Fires after a server-originated action is applied to this subscription's state. */
	readonly onDidApplyAction: Event<ActionEnvelope>;
}

/**
 * Read-only snapshot describing a single active resource subscription. Used by
 * inspection/debug surfaces that enumerate everything a connection is currently
 * subscribed to. Does not include the always-live root state.
 */
export interface IActiveSubscriptionInfo {
	/** The protocol resource URI subscribed to. */
	readonly resource: URI;
	/** Which state component this subscription tracks. */
	readonly kind: StateComponents;
	/** Number of outstanding {@link IReference} holders. */
	readonly refCount: number;
	/**
	 * The named owners currently holding a reference to this subscription,
	 * with how many references each holds. Names come from the `owner`
	 * argument passed to {@link AgentSubscriptionManager.getSubscription}.
	 */
	readonly holders: readonly IActiveSubscriptionHolder[];
	/**
	 * Lifecycle status derived from the subscription's value:
	 * `pending` before the first snapshot, `error` if it failed, otherwise
	 * `snapshot`.
	 */
	readonly status: 'pending' | 'snapshot' | 'error';
}

/** A named owner holding one or more references to a subscription. */
export interface IActiveSubscriptionHolder {
	readonly owner: string;
	readonly count: number;
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
	private _bufferedEnvelopes: ActionEnvelope[] | undefined;

	protected readonly _onDidChange = this._register(new Emitter<T>());
	readonly onDidChange: Event<T> = this._onDidChange.event;

	protected readonly _onDidError = this._register(new Emitter<Error>());
	readonly onDidError: Event<Error> = this._onDidError.event;

	protected readonly _onWillApplyAction = this._register(new Emitter<ActionEnvelope>());
	readonly onWillApplyAction: Event<ActionEnvelope> = this._onWillApplyAction.event;

	protected readonly _onDidApplyAction = this._register(new Emitter<ActionEnvelope>());
	readonly onDidApplyAction: Event<ActionEnvelope> = this._onDidApplyAction.event;

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
		this._onDidError.fire(error);
	}

	/**
	 * Process an incoming action envelope. The subscription determines
	 * whether the action is relevant via {@link _isRelevantEnvelope}.
	 */
	receiveEnvelope(envelope: ActionEnvelope): void {
		if (!this._isRelevantEnvelope(envelope)) {
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
	protected abstract _applyReducer(state: T, action: StateAction): T;

	/** Whether the given envelope targets this subscription. */
	protected abstract _isRelevantEnvelope(envelope: ActionEnvelope): boolean;

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
	protected _reconcile(envelope: ActionEnvelope, _isOwnAction: boolean): void {
		this._confirmedState = this._applyReducer(this._confirmedState!, envelope.action);
		this._onDidChange.fire(this.value as T);
	}
}

// --- Root State Subscription -------------------------------------------------

/**
 * Subscription to the root state at `agenthost:/root`.
 * Server-only mutations — no write-ahead.
 */
export class RootStateSubscription extends BaseAgentSubscription<RootState> {

	protected override _applyReducer(state: RootState, action: StateAction): RootState {
		return rootReducer(state, action as RootAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return isAhpRootChannel(envelope.channel) && envelope.action.type.startsWith('root/');
	}
}

// --- Session State Subscription ----------------------------------------------

interface IPendingAction {
	readonly clientSeq: number;
	readonly action: SessionAction;
}

/**
 * A pending optimistic action awaiting server confirmation, paired with the
 * channel it was dispatched to so it can be replayed across a reconnect. The
 * channel is a session channel for {@link SessionStateSubscription} actions and
 * a chat channel for {@link ChatStateSubscription} actions.
 */
export interface IPendingDispatchAction {
	readonly clientSeq: number;
	/** The optimistic action awaiting confirmation. */
	readonly action: SessionAction | ChatAction;
	/** URI of the channel this action targets, as stored on the subscription. */
	readonly channel: string;
}

/**
 * Subscription to a session at `copilot:/<uuid>`.
 * Supports write-ahead reconciliation for client-dispatchable actions.
 */
export class SessionStateSubscription extends BaseAgentSubscription<SessionState> {

	private readonly _pendingActions: IPendingAction[] = [];
	private _optimisticState: SessionState | undefined;
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
	applyOptimistic(action: SessionAction): number {
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

	protected override _getOptimisticState(): SessionState | undefined {
		return this._optimisticState;
	}

	protected override _applyReducer(state: SessionState, action: StateAction): SessionState {
		return sessionReducer(state, action as IProtocolSessionAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return isSessionAction(envelope.action) && envelope.channel === this._sessionUri;
	}

	protected override _onSnapshotApplied(fromSeq: number): void {
		// Replay buffered actions first
		super._onSnapshotApplied(fromSeq);
		// Re-apply pending actions on top of new confirmed state
		this._recomputeOptimistic();
	}

	protected override _reconcile(envelope: ActionEnvelope, isOwnAction: boolean): void {
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

	private _confirmedApply(action: StateAction): void {
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

	/**
	 * Snapshot of the currently-pending optimistic actions, with the session
	 * URI included so callers can re-issue them across a reconnect. The
	 * actions remain in the subscription so the optimistic state continues
	 * to reflect them — the client must explicitly drop entries echoed back
	 * by the server.
	 */
	getPendingActions(): IPendingDispatchAction[] {
		return this._pendingActions.map(p => ({ clientSeq: p.clientSeq, action: p.action, channel: this._sessionUri }));
	}

	/**
	 * Drop the pending entry whose `clientSeq` matches the supplied value.
	 * Used during reconnect to evict actions the server already echoed back
	 * in the replay buffer so they're not resent.
	 */
	dropPendingByClientSeq(clientSeq: number): boolean {
		const idx = this._pendingActions.findIndex(p => p.clientSeq === clientSeq);
		if (idx === -1) {
			return false;
		}
		this._pendingActions.splice(idx, 1);
		return true;
	}
}

// --- Chat State Subscription -------------------------------------------------

interface IPendingChatAction {
	readonly clientSeq: number;
	readonly action: ChatAction;
}

/**
 * Subscription to a chat channel (e.g. a session's default chat URI). Turns,
 * tool calls and pending/input state moved off the session onto the chat
 * channel in the multi-chat protocol, so this subscription carries the
 * conversation contents. Supports write-ahead reconciliation for
 * client-dispatchable chat actions (turn starts, confirmations, etc.).
 */
export class ChatStateSubscription extends BaseAgentSubscription<ChatState> {

	private readonly _pendingActions: IPendingChatAction[] = [];
	private _optimisticState: ChatState | undefined;
	private readonly _chatUri: string;
	private readonly _seqAllocator: () => number;

	constructor(
		chatUri: string,
		clientId: string,
		seqAllocator: () => number,
		log: (msg: string) => void,
	) {
		super(clientId, log);
		this._chatUri = chatUri;
		this._seqAllocator = seqAllocator;
	}

	/**
	 * Optimistically apply a chat action. Returns the clientSeq to send to
	 * the server so it can echo back for reconciliation.
	 */
	applyOptimistic(action: ChatAction): number {
		const clientSeq = this._seqAllocator();
		this._pendingActions.push({ clientSeq, action });
		const base = this._optimisticState ?? this.verifiedValue;
		if (base) {
			this._optimisticState = chatReducer(base, action as IProtocolChatAction, this._log);
			this._onDidChange.fire(this._optimisticState);
		}
		return clientSeq;
	}

	protected override _getOptimisticState(): ChatState | undefined {
		return this._optimisticState;
	}

	protected override _applyReducer(state: ChatState, action: StateAction): ChatState {
		return chatReducer(state, action as IProtocolChatAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return isChatAction(envelope.action) && envelope.channel === this._chatUri;
	}

	protected override _onSnapshotApplied(fromSeq: number): void {
		super._onSnapshotApplied(fromSeq);
		this._recomputeOptimistic();
	}

	protected override _reconcile(envelope: ActionEnvelope, isOwnAction: boolean): void {
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
			this._promotePendingTurnStartIfTerminal(envelope.action);
			this._confirmedApply(envelope.action);
		}
		this._recomputeOptimistic();
	}

	private _promotePendingTurnStartIfTerminal(action: StateAction): void {
		// A backend-originated terminal turn action may arrive without the clientSeq
		// that would normally confirm our optimistic turn start. Promote that start
		// first so the terminal action can close it instead of leaving it pending.
		if (!isChatAction(action)) {
			return;
		}
		if (action.type !== ActionType.ChatTurnComplete && action.type !== ActionType.ChatTurnCancelled && action.type !== ActionType.ChatError) {
			return;
		}
		const index = this._pendingActions.findIndex(p => p.action.type === ActionType.ChatTurnStarted && p.action.turnId === action.turnId);
		if (index === -1) {
			return;
		}
		const [{ action: pendingAction }] = this._pendingActions.splice(index, 1);
		if (this._confirmedState && (!this._confirmedState.activeTurn || this._confirmedState.activeTurn.id !== action.turnId)) {
			this._confirmedState = this._applyReducer(this._confirmedState, pendingAction);
		}
	}

	private _confirmedApply(action: StateAction): void {
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
			this._optimisticState = undefined;
			this._onDidChange.fire(confirmed);
			return;
		}
		let state = confirmed;
		for (const pending of this._pendingActions) {
			state = chatReducer(state, pending.action as IProtocolChatAction, this._log);
		}
		this._optimisticState = state;
		this._onDidChange.fire(state);
	}

	clearPending(): void {
		this._pendingActions.length = 0;
		this._optimisticState = undefined;
	}

	getPendingActions(): IPendingDispatchAction[] {
		return this._pendingActions.map(p => ({ clientSeq: p.clientSeq, action: p.action, channel: this._chatUri }));
	}

	dropPendingByClientSeq(clientSeq: number): boolean {
		const idx = this._pendingActions.findIndex(p => p.clientSeq === clientSeq);
		if (idx === -1) {
			return false;
		}
		this._pendingActions.splice(idx, 1);
		return true;
	}
}

// --- Terminal State Subscription ---------------------------------------------

/**
 * Subscription to a terminal at an agent-host terminal URI.
 * Server-only mutations — no write-ahead (terminal I/O is side-effect-only).
 */
export class TerminalStateSubscription extends BaseAgentSubscription<TerminalState> {

	private readonly _terminalUri: string;

	constructor(terminalUri: string, clientId: string, log: (msg: string) => void) {
		super(clientId, log);
		this._terminalUri = terminalUri;
	}

	protected override _applyReducer(state: TerminalState, action: StateAction): TerminalState {
		return terminalReducer(state, action as TerminalAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return envelope.action.type.startsWith('terminal/') && envelope.channel === this._terminalUri;
	}
}

// --- Changeset State Subscription --------------------------------------------

/**
 * Subscription to a changeset at an expanded changeset URI (e.g.
 * `<sessionUri>/changeset/session`).
 *
 * Changeset review actions are client-dispatchable, so this subscription
 * supports write-ahead reconciliation.
 */
export class ChangesetStateSubscription extends BaseAgentSubscription<ChangesetState> {

	private readonly _pendingActions: { readonly clientSeq: number; readonly action: ClientChangesetAction }[] = [];
	private _optimisticState: ChangesetState | undefined;
	private readonly _changesetUri: string;
	private readonly _seqAllocator: () => number;

	constructor(changesetUri: string, clientId: string, seqAllocator: () => number, log: (msg: string) => void) {
		super(clientId, log);
		this._changesetUri = changesetUri;
		this._seqAllocator = seqAllocator;
	}

	/**
	 * Optimistically apply a changeset action and return its client sequence.
	 */
	applyOptimistic(action: ClientChangesetAction): number {
		const clientSeq = this._seqAllocator();
		this._pendingActions.push({ clientSeq, action });
		const base = this._optimisticState ?? this.verifiedValue;
		if (base) {
			this._optimisticState = changesetReducer(base, action, this._log);
			this._onDidChange.fire(this._optimisticState);
		}
		return clientSeq;
	}

	protected override _getOptimisticState(): ChangesetState | undefined {
		return this._optimisticState;
	}

	protected override _applyReducer(state: ChangesetState, action: StateAction): ChangesetState {
		return changesetReducer(state, action as ChangesetAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return isChangesetAction(envelope.action) && envelope.channel === this._changesetUri;
	}

	protected override _onSnapshotApplied(fromSeq: number): void {
		super._onSnapshotApplied(fromSeq);
		this._recomputeOptimistic();
	}

	protected override _reconcile(envelope: ActionEnvelope, isOwnAction: boolean): void {
		if (isOwnAction && envelope.origin) {
			const index = this._pendingActions.findIndex(pending => pending.clientSeq === envelope.origin!.clientSeq);
			if (index !== -1) {
				if (!envelope.rejectionReason) {
					this._confirmedApply(envelope.action);
				}
				this._pendingActions.splice(index, 1);
			} else {
				this._confirmedApply(envelope.action);
			}
		} else {
			this._confirmedApply(envelope.action);
		}
		this._recomputeOptimistic();
	}

	private _confirmedApply(action: StateAction): void {
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
			this._optimisticState = undefined;
			this._onDidChange.fire(confirmed);
			return;
		}

		let state = confirmed;
		for (const pending of this._pendingActions) {
			state = changesetReducer(state, pending.action, this._log);
		}
		this._optimisticState = state;
		this._onDidChange.fire(state);
	}
}

type ManagedSubscription = SessionStateSubscription | ChatStateSubscription | TerminalStateSubscription | ChangesetStateSubscription | AnnotationsStateSubscription;

// --- Annotations State Subscription ------------------------------------------

interface IPendingAnnotationsAction {
	readonly clientSeq: number;
	readonly action: AnnotationsAction;
}

/**
 * Subscription to a session's annotations channel (e.g.
 * `<sessionUri>/annotations`).
 *
 * Annotations actions are client-dispatchable, so this subscription supports
 * write-ahead reconciliation: optimistic state is layered on top of confirmed
 * state and reconciled as the server echoes the client's own actions back.
 *
 * Like {@link ChangesetStateSubscription}, the subscription does NOT
 * self-tear-down on lifecycle events; cleanup is driven externally by the
 * holder releasing its `IReference`.
 */
export class AnnotationsStateSubscription extends BaseAgentSubscription<AnnotationsState> {

	private readonly _pendingActions: IPendingAnnotationsAction[] = [];
	private _optimisticState: AnnotationsState | undefined;
	private readonly _annotationsUri: string;
	private readonly _seqAllocator: () => number;

	constructor(annotationsUri: string, clientId: string, seqAllocator: () => number, log: (msg: string) => void) {
		super(clientId, log);
		this._annotationsUri = annotationsUri;
		this._seqAllocator = seqAllocator;
	}

	/**
	 * Optimistically apply an annotations action. Returns the clientSeq to
	 * send to the server so it can echo back for reconciliation.
	 */
	applyOptimistic(action: AnnotationsAction): number {
		const clientSeq = this._seqAllocator();
		this._pendingActions.push({ clientSeq, action });
		const base = this._optimisticState ?? this.verifiedValue;
		if (base) {
			this._optimisticState = annotationsReducer(base, action, this._log);
			this._onDidChange.fire(this._optimisticState);
		}
		return clientSeq;
	}

	protected override _getOptimisticState(): AnnotationsState | undefined {
		return this._optimisticState;
	}

	protected override _applyReducer(state: AnnotationsState, action: StateAction): AnnotationsState {
		return annotationsReducer(state, action as AnnotationsAction, this._log);
	}

	protected override _isRelevantEnvelope(envelope: ActionEnvelope): boolean {
		return isAnnotationsAction(envelope.action) && envelope.channel === this._annotationsUri;
	}

	protected override _onSnapshotApplied(fromSeq: number): void {
		super._onSnapshotApplied(fromSeq);
		this._recomputeOptimistic();
	}

	protected override _reconcile(envelope: ActionEnvelope, isOwnAction: boolean): void {
		if (isOwnAction && envelope.origin) {
			const idx = this._pendingActions.findIndex(p => p.clientSeq === envelope.origin!.clientSeq);
			if (idx !== -1) {
				if (!envelope.rejectionReason) {
					this._confirmedApply(envelope.action);
				}
				this._pendingActions.splice(idx, 1);
			} else {
				this._confirmedApply(envelope.action);
			}
		} else {
			this._confirmedApply(envelope.action);
		}
		this._recomputeOptimistic();
	}

	private _confirmedApply(action: StateAction): void {
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
			state = annotationsReducer(state, pending.action, this._log);
		}
		this._optimisticState = state;
		this._onDidChange.fire(state);
	}
}

type ManagedSubscriptionEntry = { sub: ManagedSubscription; kind: StateComponents; refCount: number; holders: Map<number, string> };

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

	private readonly _subscriptions = new ResourceMap<ManagedSubscriptionEntry>();
	private readonly _inflightCreates = new ResourceMap<Promise<unknown>>();
	private _referenceOwnerIds = 0;
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
	get rootState(): IAgentSubscription<RootState> {
		return this._rootState;
	}

	/**
	 * Initialize the root state from a snapshot received during the
	 * connection handshake.
	 */
	handleRootSnapshot(state: RootState, fromSeq: number): void {
		this._rootState.handleSnapshot(state, fromSeq);
	}

	/**
	 * Returns an existing subscription without affecting its refcount.
	 * Returns `undefined` if no subscription is active for the given resource.
	 */
	getSubscriptionUnmanaged<T>(resource: URI): IAgentSubscription<T> | undefined {
		const entry = this._subscriptions.get(resource);
		return entry?.sub as IAgentSubscription<T> | undefined;
	}

	/**
	 * Returns the in-flight `createSession` Promise for this URI, or `undefined` if no create is pending. Used by
	 * callers that need to gate their own work on a still-running eager `createSession` (e.g. the chat handler awaits
	 * this before deciding whether the sessions provider's eager-create raced first send).
	 */
	getInflightSessionCreate(resource: URI): Promise<unknown> | undefined {
		return this._inflightCreates.get(resource);
	}

	/**
	 * Register an in-flight `createSession` Promise for a session URI. Any
	 * subscribe issued for this resource while the create is pending waits
	 * for the Promise before issuing the wire-level subscribe.
	 */
	trackSessionCreate(resource: URI, promise: Promise<unknown>): void {
		this._inflightCreates.set(resource, promise);
		// This branch only observes settlement to evict the inflight entry; the
		// `createSession` caller (and the server, via logService.error) owns the
		// result. `finally` re-raises a rejection, so without this trailing
		// `catch` an expected create failure (e.g. AHP_AUTH_REQUIRED) would be
		// reported a second time as an unhandled rejection.
		void promise.finally(() => {
			if (this._inflightCreates.get(resource) === promise) {
				this._inflightCreates.delete(resource);
			}
		}).catch(() => { });
	}

	/**
	 * Get or create a refcounted subscription to any resource. Disposing
	 * the returned reference decrements the refcount; when it reaches zero
	 * the subscription is torn down and the server is notified.
	 *
	 * `owner` names the caller holding the reference so inspection surfaces
	 * (see {@link getActiveSubscriptions}) can attribute who is retaining a
	 * subscription. Use a stable, human-readable identifier such as the
	 * acquiring class name.
	 */
	getSubscription<T>(kind: StateComponents, resource: URI, owner: string): IReference<IAgentSubscription<T>> {
		const existing = this._subscriptions.get(resource);
		if (existing) {
			if (existing.sub.value instanceof Error) {
				// Failed subscriptions should not poison the resource forever. Evict
				// the errored entry so this acquire performs a fresh subscribe.
				this._subscriptions.delete(resource);
				this._disposeSubscriptionEntry(resource, existing);
			} else {
				existing.refCount++;
				return this._acquireReference<T>(resource, existing, owner);
			}
		}

		// Create new subscription based on caller-specified kind
		const key = resource.toString();
		const sub = this._createSubscription(kind, key);
		const entry: ManagedSubscriptionEntry = { sub, kind, refCount: 1, holders: new Map() };
		this._subscriptions.set(resource, entry);

		// Kick off server subscription asynchronously.
		// Capture the entry reference so we can validate it hasn't been
		// replaced by a new subscription for the same key (race guard).
		void (async () => {
			const inflight = this._inflightCreates.get(resource);
			if (inflight) {
				try {
					await inflight;
				} catch {
					// Swallow — fall through to subscribe so the error
					// surfaces consistently via setError() on the
					// subscription, matching the no-inflight path.
				}
			}
			try {
				const snapshot = await this._subscribe(resource);
				if (this._subscriptions.get(resource) === entry) {
					sub.handleSnapshot(snapshot.state as never, snapshot.fromSeq);
				}
			} catch (err) {
				if (this._subscriptions.get(resource) === entry) {
					sub.setError(err instanceof Error ? err : new Error(String(err)));
				}
			}
		})();

		return this._acquireReference<T>(resource, entry, owner);
	}

	/**
	 * Register `owner` as a holder of `entry` and return a reference whose
	 * disposal removes that holder and releases the subscription. The
	 * caller is responsible for the matching refcount increment (a fresh
	 * entry starts at 1; an existing entry is bumped before calling this).
	 */
	private _acquireReference<T>(resource: URI, entry: ManagedSubscriptionEntry, owner: string): IReference<IAgentSubscription<T>> {
		const ownerId = ++this._referenceOwnerIds;
		entry.holders.set(ownerId, owner);

		let isDisposed = false;
		return {
			object: entry.sub as unknown as IAgentSubscription<T>,
			dispose: () => {
				if (isDisposed) {
					return;
				}
				isDisposed = true;
				entry.holders.delete(ownerId);
				this._releaseSubscription(resource, entry);
			},
		};
	}

	private _disposeSubscriptionEntry(resource: URI, entry: ManagedSubscriptionEntry): void {
		this._tryUnsubscribe(resource);
		if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
			entry.sub.clearPending();
		}
		entry.sub.dispose();
	}

	private _tryUnsubscribe(resource: URI): void {
		try {
			this._unsubscribe(resource);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this._log(`Failed to unsubscribe ${resource.toString()}: ${message}`);
		}
	}

	/**
	 * Route an incoming action envelope to all active subscriptions.
	 */
	receiveEnvelope(envelope: ActionEnvelope): void {
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
	 *
	 * `channel` is the protocol URI string identifying the channel the
	 * action targets (a session URI for session actions, etc.).
	 */
	dispatchOptimistic(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction): number {
		if (isSessionAction(action)) {
			const entry = this._subscriptions.get(URI.parse(channel));
			if (entry?.sub instanceof SessionStateSubscription) {
				return entry.sub.applyOptimistic(action);
			}
		} else if (isChatAction(action)) {
			const entry = this._subscriptions.get(URI.parse(channel));
			if (entry?.sub instanceof ChatStateSubscription) {
				return entry.sub.applyOptimistic(action);
			}
		} else if (isChangesetAction(action)) {
			const entry = this._subscriptions.get(URI.parse(channel));
			if (entry?.sub instanceof ChangesetStateSubscription) {
				return entry.sub.applyOptimistic(action);
			}
		} else if (isAnnotationsAction(action)) {
			const entry = this._subscriptions.get(URI.parse(channel));
			if (entry?.sub instanceof AnnotationsStateSubscription) {
				return entry.sub.applyOptimistic(action);
			}
		}
		return this._seqAllocator();
	}

	/**
	 * URIs currently subscribed to via {@link getSubscription}. Used to
	 * build the `subscriptions` payload for a `reconnect` RPC so the
	 * server can restore them in one round-trip.
	 *
	 * Does NOT include the always-live root state, which the protocol
	 * client manages separately.
	 */
	currentSubscriptionUris(): URI[] {
		return [...this._subscriptions.keys()];
	}

	/**
	 * Read-only descriptors of every active resource subscription, for
	 * inspection/debug surfaces. Does NOT include the always-live root
	 * state, which the connection exposes separately via {@link rootState}.
	 */
	getActiveSubscriptions(): readonly IActiveSubscriptionInfo[] {
		const out: IActiveSubscriptionInfo[] = [];
		for (const [resource, entry] of this._subscriptions) {
			const value = entry.sub.value;
			const status = value === undefined ? 'pending' : value instanceof Error ? 'error' : 'snapshot';
			out.push({ resource, kind: entry.kind, refCount: entry.refCount, holders: this._summarizeHolders(entry), status });
		}
		return out;
	}

	/** Group an entry's holders by owner name, sorted by descending count. */
	private _summarizeHolders(entry: ManagedSubscriptionEntry): IActiveSubscriptionHolder[] {
		const counts = new Map<string, number>();
		for (const owner of entry.holders.values()) {
			counts.set(owner, (counts.get(owner) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([owner, count]) => ({ owner, count }))
			.sort((a, b) => b.count - a.count);
	}

	/**
	 * Snapshot of every pending optimistic action across all session
	 * subscriptions. Callers use this to replay actions after a transport
	 * reconnect; entries are kept on their subscriptions until they're
	 * either echoed back by the server or explicitly dropped via
	 * {@link dropPendingSessionAction}.
	 */
	getPendingSessionActions(): IPendingDispatchAction[] {
		const out: IPendingDispatchAction[] = [];
		for (const { sub } of this._subscriptions.values()) {
			if (sub instanceof SessionStateSubscription || sub instanceof ChatStateSubscription) {
				out.push(...sub.getPendingActions());
			}
		}
		return out;
	}

	/**
	 * Remove a single pending optimistic action for a session by its
	 * `clientSeq`. Used during reconnect to evict actions the server
	 * already processed (and replayed back to us) so they're not resent.
	 */
	dropPendingSessionAction(sessionUri: string, clientSeq: number): void {
		const entry = this._subscriptions.get(URI.parse(sessionUri));
		if (entry?.sub instanceof SessionStateSubscription || entry?.sub instanceof ChatStateSubscription) {
			entry.sub.dropPendingByClientSeq(clientSeq);
		}
	}

	/**
	 * Apply a fresh snapshot to a subscribed resource — used when the server
	 * responds to a `reconnect` request with `type: 'snapshot'` because the
	 * replay buffer no longer covers the client's gap. Routes to the root
	 * subscription when {@link ROOT_STATE_URI} matches, otherwise reseats the
	 * matching entry in {@link _subscriptions}. Unknown resources are ignored.
	 */
	applyReconnectSnapshot(resource: string, state: unknown, fromSeq: number): void {
		if (isAhpRootChannel(resource)) {
			this._rootState.handleSnapshot(state as RootState, fromSeq);
			return;
		}
		const entry = this._subscriptions.get(URI.parse(resource));
		if (!entry) {
			return;
		}
		// Clear any pending optimistic actions before reseating confirmed
		// state \u2014 they were predicated on the pre-disconnect confirmed
		// state and won't reconcile correctly against a fresh snapshot.
		if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
			entry.sub.clearPending();
		}
		entry.sub.handleSnapshot(state as never, fromSeq);
	}

	/**
	 * Mark a set of subscriptions as no longer resumable on the server
	 * (reported via `ReconnectReplayResult.missing`). The subscriptions
	 * themselves stay alive so consumers continue to hold valid references,
	 * but their value transitions to an `Error` until they're recreated.
	 */
	markSubscriptionsMissing(missing: readonly URI[]): void {
		for (const resource of missing) {
			const entry = this._subscriptions.get(resource);
			if (entry) {
				if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
					entry.sub.clearPending();
				}
				entry.sub.setError(new Error(`Subscription no longer available after reconnect: ${resource.toString()}`));
			}
		}
	}

	private _createSubscription(kind: StateComponents, key: string): ManagedSubscription {
		switch (kind) {
			case StateComponents.Session:
				return new SessionStateSubscription(key, this._clientId, this._seqAllocator, this._log);
			case StateComponents.Chat:
				return new ChatStateSubscription(key, this._clientId, this._seqAllocator, this._log);
			case StateComponents.Terminal:
				return new TerminalStateSubscription(key, this._clientId, this._log);
			case StateComponents.Changeset:
				return new ChangesetStateSubscription(key, this._clientId, this._seqAllocator, this._log);
			case StateComponents.Annotations:
				return new AnnotationsStateSubscription(key, this._clientId, this._seqAllocator, this._log);
			case StateComponents.Root:
				throw new Error('_createSubscription: root subscription is managed separately');
			default:
				assertNever(kind, `_createSubscription: unsupported StateComponents kind: ${kind}`);
		}
	}

	private _releaseSubscription(resource: URI, expected?: ManagedSubscriptionEntry): void {
		const entry = this._subscriptions.get(resource);
		// A failed subscription can be evicted and replaced while old references
		// still exist; stale disposals must not release the replacement entry.
		if (!entry || (expected && entry !== expected)) {
			return;
		}
		entry.refCount--;
		if (entry.refCount <= 0) {
			this._subscriptions.delete(resource);
			this._disposeSubscriptionEntry(resource, entry);
		}
	}

	override dispose(): void {
		for (const [resource, entry] of this._subscriptions) {
			this._tryUnsubscribe(resource);
			entry.sub.dispose();
		}
		this._subscriptions.clear();
		super.dispose();
	}
}

/** Returns whether an action envelope targets one of the subscribed channel URIs. */
export function isActionEnvelopeRelevantToSubscriptionUris(envelope: ActionEnvelope, subscribedUris: Iterable<string>): boolean {
	if (isAhpRootChannel(envelope.channel)) {
		for (const uri of subscribedUris) {
			if (isAhpRootChannel(uri)) {
				return true;
			}
		}
		return false;
	}
	for (const uri of subscribedUris) {
		if (uri === envelope.channel) {
			return true;
		}
	}
	return false;
}

// --- Observable Adapter ------------------------------------------------------

/**
 * Adapts an {@link IAgentSubscription} into an {@link IObservable} of the
 * subscription's value. Errors and the pre-snapshot phase are surfaced as
 * `undefined`; consumers that need the error itself should read
 * {@link IAgentSubscription.value} directly.
 */
export function observableFromSubscription<T>(owner: object | undefined, sub: IAgentSubscription<T>): IObservable<T | undefined> {
	return observableFromEvent(owner, sub.onDidChange, () => {
		const v = sub.value;
		return v instanceof Error ? undefined : v;
	});
}
