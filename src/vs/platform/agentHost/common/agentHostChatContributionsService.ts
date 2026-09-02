/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { ISettableObservable } from '../../../base/common/observable.js';
import type { StopWatch } from '../../../base/common/stopwatch.js';
import { createDecorator, type BrandedService } from '../../instantiation/common/instantiation.js';
import type { IAgent } from './agent.js';
import type { AgentHostLaunchKind, AgentHostTurnFailureStage, IAgentHostClientTelemetryContext } from './agentHostTelemetry.js';
import type { StateAction } from './state/sessionActions.js';
import type { ErrorInfo, Message, Turn, URI as ProtocolURI } from './state/sessionState.js';

export const IAgentHostChatContributions = createDecorator<IAgentHostChatContributions>('agentHostChatContributions');

/**
 * Why a turn ended. Contributions must discriminate on `kind`: successful,
 * cancelled, failed, rejected, and host-handled local-command turns deliberately
 * run different side effects. A rejected request was refused or could not be
 * routed before its turn started, so contributions that finalize started turns
 * must ignore it because there is no turn or checkpoint to finalize.
 */
export type TurnEndReason =
	| { readonly kind: 'success' }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'error'; readonly error: ErrorInfo; readonly resumable: boolean }
	| { readonly kind: 'rejected'; readonly error: ErrorInfo }
	| { readonly kind: 'localCommand' };

/** A terminal turn outcome offered to contributions after a turn ended. */
export interface ITurnEnd {
	/** The owning session URI (already normalized from a chat channel). */
	readonly session: ProtocolURI;
	/** The channel the turn ran on - the session URI, or a peer/subagent chat channel. */
	readonly channel: ProtocolURI;
	/** The completed turn's id, when known. */
	readonly turnId: string | undefined;
	readonly reason: TurnEndReason;
	readonly clientContext?: IAgentHostClientTelemetryContext;
}

/** A turn about to be sent to an agent, carrying its owning session, target chat, message, and id. */
export interface IOutgoingTurn {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
	readonly message: Message;
	readonly turnId: string;
}

/**
 * Additive host context supplied by a contribution before a turn is sent.
 * The object form lets this hook grow without replacing a bare instruction array.
 */
export interface ISendContribution {
	readonly instructions?: readonly string[];
	/**
	 * Replaces the outgoing message text. Ordered contributions receive the
	 * previous replacement, and the dispatcher sends the final text.
	 *
	 * The turn's attachments, model, agent, origin, and metadata are committed
	 * before this hook runs and cannot be replaced here.
	 */
	readonly text?: string;
}

/** The combined output of all outgoing-turn contributions. */
export interface IOutgoingTurnContributionResult {
	/** Omitted when no contribution supplied an instruction. */
	readonly instructions?: readonly string[];
	/** The final message after ordered contributions have applied text replacements. */
	readonly message: Message;
}

/** A turn request that has entered host state and is asking to proceed to a provider. */
export interface IIncomingRequest {
	readonly session: ProtocolURI;
	/** The chat the turn targets. */
	readonly chat: ProtocolURI;
	/** The channel the turn's actions are dispatched on. */
	readonly turnChannel: ProtocolURI;
	readonly message: Message;
	readonly turnId: string;
	/** Whether the request came straight from a client or was drained from the queue. */
	readonly source: 'direct' | 'queued';
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
}

/**
 * What a contribution decided about an incoming request. `accept` is the
 * default, so a contribution that does not care returns `undefined`.
 *
 * `handled` means the host satisfied the request itself and no provider should
 * see it — a local command such as `/rename` or `!command`. The contribution
 * has already performed the work; the caller only stops.
 */
export type IncomingRequestDisposition =
	| { readonly kind: 'accept' }
	| { readonly kind: 'handled' }
	| {
		readonly kind: 'reject';
		readonly error: ErrorInfo;
		readonly stage: AgentHostTurnFailureStage;
	};

/** The chat and owning session whose complete restored turn list is being hydrated. */
export interface IHydrationContext {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
}

/**
 * Host-owned chat state restored from persistence before a chat enters the
 * session catalog. Distinct from turn hydration: this runs eagerly for every
 * restored chat, including peer chats whose turns stay unloaded until their
 * first content request.
 *
 * The object form lets this grow with further host-owned restorable fields
 * without adding another hook.
 */
export interface IRestoredChat {
	readonly title?: string;
	readonly draft?: Message;
}

/** A client action after it has been reduced into host state. */
export interface IAppliedClientAction {
	readonly channel: ProtocolURI;
	readonly session: ProtocolURI;
	readonly action: StateAction;
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
}

/**
 * A dispatched action, from any origin, after its outcome is known.
 *
 * Unlike {@link IAppliedClientAction}, this covers server-dispatched actions — which is
 * most agent-produced state — and rejected actions, which never reduced. A contribution
 * that only cares about client dispatch should use `onDidApplyClientAction` instead;
 * observing both would see the same client action twice.
 */
export interface IDispatchedAction {
	readonly channel: ProtocolURI;
	/** The owning session URI, or the channel itself when it is not a chat channel. */
	readonly session: ProtocolURI;
	readonly action: StateAction;
	/** Set when the action was rejected and never reached state. */
	readonly rejectionReason?: string;
}

export interface IQueuedMessageSender {
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
}

export interface ISendTurnMessageOptions {
	readonly agent: IAgent;
	readonly sessionChannel: ProtocolURI;
	readonly turnChannel: ProtocolURI;
	readonly chat: ProtocolURI;
	readonly message: Message;
	readonly turnId: string;
	readonly senderClientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
	readonly turnStopWatch: StopWatch;
}

/** The host operations that remain owned by {@link AgentSideEffects}. */
export interface IAgentHostChatContributionHost {
	readonly hostLaunchKind: AgentHostLaunchKind;
	sendTurnMessage(options: ISendTurnMessageOptions): void;
}

type MementoKeySegment = string | boolean | number;
type MementoKeySegments = readonly MementoKeySegment[];

export interface IChatMementoKey<T, TExtra extends MementoKeySegments> {
	readonly scope: 'chat';
	readonly debugName: string;
	readonly create: () => T;
	readonly _extra?: TExtra;
}

export interface ISessionMementoKey<T, TExtra extends MementoKeySegments> {
	readonly scope: 'session';
	readonly debugName: string;
	readonly create: () => T;
	readonly _extra?: TExtra;
}

export function createChatMementoKey<T, TExtra extends MementoKeySegments = []>(debugName: string, create: () => T): IChatMementoKey<T, TExtra> {
	return { scope: 'chat', debugName, create };
}

export function createSessionMementoKey<T, TExtra extends MementoKeySegments = []>(debugName: string, create: () => T): ISessionMementoKey<T, TExtra> {
	return { scope: 'session', debugName, create };
}

/**
 * Per-contribution state that is centrally evicted with its owning chat or session.
 * Each registered contribution receives a distinct context, so memento names are
 * automatically namespaced by contribution.
 */
export interface IAgentHostChatContributionContext {
	readonly contributionId: string;
	memento<T, TExtra extends MementoKeySegments>(key: IChatMementoKey<T, TExtra> | ISessionMementoKey<T, TExtra>, resource: ProtocolURI, ...extra: TExtra): ISettableObservable<T>;
	/**
	 * Drops the memento for `key` on `resource`, so a later `memento` call starts
	 * from the key's initial value. Setting a memento to `undefined` only changes
	 * its value; the entry survives until its chat or session is disposed. Keys
	 * with extra segments must delete entries they no longer need, otherwise a
	 * long-lived chat accumulates one entry per segment value it has ever seen.
	 */
	deleteMemento<T, TExtra extends MementoKeySegments>(key: IChatMementoKey<T, TExtra> | ISessionMementoKey<T, TExtra>, resource: ProtocolURI, ...extra: TExtra): void;
}

/** A self-contained behavior contributed to the agent host chat lifecycle. */
export interface IAgentHostChatContribution extends IDisposable {
	/**
	 * Lower runs first. Contributions that require a specific relative sequence
	 * must declare an explicit order; registration order only breaks ties.
	 */
	readonly order?: number;
	/**
	 * Fires on every terminal outcome a started turn can reach — the agent signal
	 * path, a host-handled local command, a send that throws, and a cancellation
	 * from either the client or the agent — and when admission refuses a request
	 * before its turn starts. Discriminate `rejected` from `error`: the former has
	 * no started turn to finalize and no checkpoint to capture.
	 *
	 * It does not fire for an agent-emitted terminal action that arrives when no
	 * turn is active, because the reducer no-ops for those.
	 *
	 * Must not throw; the dispatcher isolates failures.
	 */
	onTurnEnd?(turn: ITurnEnd): void;
	/**
	 * Observes a client-dispatched action after it was applied to host state.
	 * Rejected client actions never reach this hook, so an action seen here always
	 * reduced.
	 */
	onDidApplyClientAction?(action: IAppliedClientAction): void;
	/**
	 * Observes a dispatched action from any origin, after its outcome is known.
	 * This covers server-dispatched actions — which is most agent-produced state — and
	 * rejected actions, which never reduced. Check `rejectionReason` before acting on
	 * one.
	 *
	 * Prefer `onDidApplyClientAction` when a behavior genuinely only concerns client
	 * dispatch: a contribution implementing both sees every client action twice.
	 *
	 * Must not throw; the dispatcher isolates failures.
	 */
	onDidDispatchAction?(dispatched: IDispatchedAction): void;
	/**
	 * Awaited before the turn is sent. Instructions are concatenated in `order`;
	 * text replacements are threaded in `order`, so each contribution observes
	 * the prior contribution's text. Failures are isolated and do not block the send.
	 *
	 * Runs after admission and after the provider lookup, so a rejected turn and a turn
	 * that fails with `noAgent` never reach it: only messages that are actually sent are
	 * enriched.
	 */
	onOutgoingTurn?(turn: IOutgoingTurn): ISendContribution | undefined | Promise<ISendContribution | undefined>;
	/**
	 * Decides whether a turn request may proceed to its provider. Contributions run
	 * in `order` and the first non-accept disposition wins; later contributions are
	 * not consulted.
	 *
	 * Unlike every other hook, this one fails CLOSED: a contribution that throws
	 * rejects the request rather than being skipped. It is an admission gate, so
	 * treating a failure as an accept would let a request past a guard that exists
	 * to stop it.
	 *
	 * Deliberately synchronous. A gate must decide before the send path performs any
	 * await, so the state it reads cannot change under it between the decision and
	 * its effect. Every admission check the host performs today — read-only and
	 * archived chats, local commands, a missing provider — is synchronous.
	 */
	onIncomingRequest?(request: IIncomingRequest): IncomingRequestDisposition | undefined;
	/**
	 * Hydrates the complete restored turn list. Each ordered stage receives the previous stage's output;
	 * failures preserve that previous list so a failed enrichment never loses chat history.
	 */
	onHydrateTurns?(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] | Promise<readonly Turn[]>;
	/**
	 * Hydrates host-owned chat state before the chat is registered in the
	 * session catalog. Each ordered stage receives the previous stage's result;
	 * failures preserve that previous value, so a failed enrichment never drops
	 * an already-restored title or draft.
	 */
	onHydrateChat?(context: IHydrationContext, restored: IRestoredChat): IRestoredChat | Promise<IRestoredChat>;
}

export type IAgentHostChatContributionSignature<Services extends BrandedService[]> = new (context: IAgentHostChatContributionContext, ...services: Services) => IAgentHostChatContribution;

/** Dispatches chat lifecycle hooks to registered contributions. */
export interface IAgentHostChatContributions extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Creates and adds a contribution. Disposing the returned value unregisters
	 * and disposes the contribution.
	 */
	registerContribution<Services extends BrandedService[]>(contribution: IAgentHostChatContributionSignature<Services> & { readonly id: string }): IDisposable;
	/**
	 * Registers the narrow AgentSideEffects-owned operations required by some
	 * contributions.
	 */
	registerHost(host: IAgentHostChatContributionHost): IDisposable;
	/** Returns the currently registered host, if AgentSideEffects has been constructed. */
	getHost(): IAgentHostChatContributionHost | undefined;
	turnEnd(turn: ITurnEnd): void;
	didApplyClientAction(action: IAppliedClientAction): void;
	didDispatchAction(dispatched: IDispatchedAction): void;
	outgoingTurn(turn: IOutgoingTurn): Promise<IOutgoingTurnContributionResult>;
	incomingRequest(request: IIncomingRequest): IncomingRequestDisposition;
	hydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]>;
	hydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat>;
	disposeChatState(chat: ProtocolURI): void;
	disposeSessionState(session: ProtocolURI): void;
}
