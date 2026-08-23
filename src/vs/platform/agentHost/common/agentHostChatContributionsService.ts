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
 * cancelled, and failed turns deliberately run different side effects.
 * `success` and `cancelled` carry no payload on purpose; add fields only when
 * a contribution actually needs them.
 */
export type TurnEndReason =
	| { readonly kind: 'success' }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'error'; readonly error: ErrorInfo };

/** A terminal turn outcome offered to contributions after the agent ended it. */
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

/** A turn about to be sent to an agent, carrying its owning session, target chat, and id. */
export interface IOutgoingTurn {
	readonly session: ProtocolURI;
	readonly chat: ProtocolURI;
	readonly turnId: string;
}

/**
 * Additive host context supplied by a contribution before a turn is sent.
 * The object form lets this hook grow without replacing a bare instruction array.
 */
export interface ISendContribution {
	readonly instructions?: readonly string[];
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
}

/** A self-contained behavior contributed to the agent host chat lifecycle. */
export interface IAgentHostChatContribution extends IDisposable {
	/**
	 * Lower runs first. Contributions that require a specific relative sequence
	 * must declare an explicit order; registration order only breaks ties.
	 */
	readonly order?: number;
	/** Fires on every terminal outcome - success, cancellation, and error. Must not throw; the dispatcher isolates failures. */
	onTurnEnd?(turn: ITurnEnd): void;
	/** Observes a direct user message after local-command handling. */
	onUserMessage?(session: ProtocolURI, text: string): void;
	/** Observes actions submitted through the client dispatch path after state reduction. */
	onAction?(action: IObservedAction): void;
	/** Fires only after a host-handled local command made a chat available for queue admission. */
	onTurnConsumable?(channel: ProtocolURI): void;
	/** Awaited before the turn is sent. Results are concatenated in `order`; failures are isolated and do not block the send. */
	contributeSend?(turn: IOutgoingTurn): ISendContribution | undefined | Promise<ISendContribution | undefined>;
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
	userMessage(session: ProtocolURI, text: string): void;
	action(action: IObservedAction): void;
	turnConsumable(channel: ProtocolURI): void;
	contributeSend(turn: IOutgoingTurn): Promise<readonly string[]>;
	hydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]>;
	disposeChatState(chat: ProtocolURI): void;
	disposeSessionState(session: ProtocolURI): void;
}
