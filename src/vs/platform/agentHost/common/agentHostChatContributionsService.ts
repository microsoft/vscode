/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { ISettableObservable } from '../../../base/common/observable.js';
import type { StopWatch } from '../../../base/common/stopwatch.js';
import { createDecorator, type BrandedService } from '../../instantiation/common/instantiation.js';
import type { IAgent } from './agent.js';
import type { AgentHostLaunchKind, IAgentHostClientTelemetryContext } from './agentHostTelemetry.js';
import type { StateAction } from './state/sessionActions.js';
import type { ErrorInfo, Message, Turn, URI as ProtocolURI } from './state/sessionState.js';

export const IAgentHostChatContributions = createDecorator<IAgentHostChatContributions>('agentHostChatContributions');

/**
 * Why a turn ended. Contributions must discriminate on `kind`: successful,
 * cancelled, failed, and host-handled local-command turns deliberately run
 * different side effects. `success`, `cancelled`, and `localCommand` carry no
 * payload on purpose; add fields only when a contribution actually needs them.
 */
export type TurnEndReason =
	| { readonly kind: 'success' }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'error'; readonly error: ErrorInfo }
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

/** The chat and owning session whose complete restored turn list is being hydrated. */
export interface IHydrationContext {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
}

/** A client action after it has been reduced into host state. */
export interface IObservedAction {
	readonly channel: ProtocolURI;
	readonly session: ProtocolURI;
	readonly action: StateAction;
	readonly clientId: string | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
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
	 * Fires when a turn ends through the agent signal path, or when a host handled
	 * local command completes. It does NOT fire for a client dispatched
	 * cancellation, nor for the failures that report `ChatError` directly, such as
	 * a missing provider, a read-only or archived chat, or a send that throws.
	 * Unifying those paths is tracked in `chatContributions/TODO.md`.
	 *
	 * Must not throw; the dispatcher isolates failures.
	 */
	onTurnEnd?(turn: ITurnEnd): void;
	/** Observes actions submitted through the client dispatch path after state reduction. */
	onAction?(action: IObservedAction): void;
	/**
	 * Awaited before the turn is sent. Instructions are concatenated in `order`;
	 * text replacements are threaded in `order`, so each contribution observes
	 * the prior contribution's text. Failures are isolated and do not block the send.
	 */
	onOutgoingTurn?(turn: IOutgoingTurn): ISendContribution | undefined | Promise<ISendContribution | undefined>;
	/**
	 * Hydrates the complete restored turn list. Each ordered stage receives the previous stage's output;
	 * failures preserve that previous list so a failed enrichment never loses chat history.
	 */
	onHydrateTurns?(context: IHydrationContext, turns: readonly Turn[]): readonly Turn[] | Promise<readonly Turn[]>;
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
	action(action: IObservedAction): void;
	outgoingTurn(turn: IOutgoingTurn): Promise<IOutgoingTurnContributionResult>;
	hydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]>;
	disposeChatState(chat: ProtocolURI): void;
	disposeSessionState(session: ProtocolURI): void;
}
