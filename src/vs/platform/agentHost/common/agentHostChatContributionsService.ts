/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostClientTelemetryContext } from './agentHostTelemetry.js';
import type { ErrorInfo, URI as ProtocolURI } from './state/sessionState.js';

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

/** The host operations that remain owned by {@link AgentSideEffects}. */
export interface IAgentHostChatContributionHost {
	drainQueuedMessages(channel: ProtocolURI): void;
	notifyTurnComplete(session: ProtocolURI): void;
	refineTitleFromFirstTurn(session: ProtocolURI, chat?: ProtocolURI): void;
	prepareRenameInstruction(session: ProtocolURI, chat: ProtocolURI): Promise<string | undefined>;
}

/** A self-contained behavior contributed to the agent host chat lifecycle. */
export interface IAgentHostChatContribution extends IDisposable {
	readonly id: string;
	/**
	 * Lower runs first. Contributions that require a specific relative sequence
	 * must declare an explicit order; registration order only breaks ties.
	 */
	readonly order?: number;
	/** Fires on every terminal outcome - success, cancellation, and error. Must not throw; the dispatcher isolates failures. */
	onTurnEnd?(turn: ITurnEnd): void;
	/** Awaited before the turn is sent. Results are concatenated in `order`; failures are isolated and do not block the send. */
	contributeSend?(turn: IOutgoingTurn): ISendContribution | undefined | Promise<ISendContribution | undefined>;
}

/** Dispatches chat lifecycle hooks to registered contributions. */
export interface IAgentHostChatContributions extends IDisposable {
	readonly _serviceBrand: undefined;

	/**
	 * Adds a contribution. Disposing the returned value unregisters and disposes
	 * the contribution.
	 */
	registerContribution(contribution: IAgentHostChatContribution): IDisposable;
	/**
	 * Registers the narrow AgentSideEffects-owned operations required by some
	 * contributions.
	 */
	registerHost(host: IAgentHostChatContributionHost): IDisposable;
	/** Returns the currently registered host, if AgentSideEffects has been constructed. */
	getHost(): IAgentHostChatContributionHost | undefined;
	turnEnd(turn: ITurnEnd): void;
	contributeSend(turn: IOutgoingTurn): Promise<readonly string[]>;
}
