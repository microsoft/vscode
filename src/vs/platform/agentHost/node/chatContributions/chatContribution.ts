/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../log/common/log.js';
import type { IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { StateAction } from '../../common/state/sessionActions.js';
import { type ErrorInfo, type SessionSummary, type URI as ProtocolURI } from '../../common/state/sessionState.js';

/**
 * Why a turn ended. Contributions discriminate on `kind` to select their side
 * effects. The `success` and `cancelled` variants carry no payload on purpose —
 * add fields only when a contribution actually needs them.
 */
export type TurnEndReason =
	| { readonly kind: 'success' }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'error'; readonly error: ErrorInfo };

/** A terminal turn outcome, offered to contributions after the agent ended it. */
export interface ITurnEnd {
	/** The owning session URI (already normalized from a chat channel). */
	readonly session: ProtocolURI;
	/** The channel the turn ran on — the session URI, or a peer/subagent chat channel. */
	readonly channel: ProtocolURI;
	/** The terminal turn's id, when known. */
	readonly turnId: string | undefined;
	/** The reason the turn ended. */
	readonly reason: TurnEndReason;
	readonly clientContext?: IAgentHostClientTelemetryContext;
}

/** The narrow host capabilities a contribution may use. */
export interface IAgentHostChatContributionContext {
	readonly logService: ILogService;
	dispatch(channel: ProtocolURI, action: StateAction): void;
	getSessionSummary(session: ProtocolURI): SessionSummary | undefined;
}

/** A self-contained behavior contributed to the agent host chat lifecycle. */
export interface IAgentHostChatContribution extends IDisposable {
	readonly id: string;
	/** Lower runs first. Defaults to 0. Ties keep registration order. */
	readonly order?: number;
	/** Fires on every terminal outcome — success, cancellation, and error. Must not throw; the dispatcher isolates failures. */
	onTurnEnd?(turn: ITurnEnd): void;
}

/** Constructs an {@link IAgentHostChatContribution} bound to a context. */
export interface IAgentHostChatContributionCtor {
	new(context: IAgentHostChatContributionContext): IAgentHostChatContribution;
}

/**
 * Global registry of {@link IAgentHostChatContribution} constructors. Contribution
 * modules register themselves at load time; {@link AgentHostChatContributions}
 * instantiates all registered contributions for each agent-side-effects instance.
 */
class AgentHostChatContributionRegistryImpl {
	private readonly _ctors: IAgentHostChatContributionCtor[] = [];

	register(ctor: IAgentHostChatContributionCtor): void {
		this._ctors.push(ctor);
	}

	createAll(context: IAgentHostChatContributionContext): IAgentHostChatContribution[] {
		return this._ctors
			.map((ctor, index) => ({ contribution: new ctor(context), index }))
			.sort((a, b) => (a.contribution.order ?? 0) - (b.contribution.order ?? 0) || a.index - b.index)
			.map(({ contribution }) => contribution);
	}
}

export const AgentHostChatContributionRegistry = new AgentHostChatContributionRegistryImpl();

/** Dispatches chat lifecycle hooks to the registered contributions. */
export class AgentHostChatContributions extends Disposable {

	private readonly _contributions: readonly IAgentHostChatContribution[];

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
		this._contributions = AgentHostChatContributionRegistry.createAll(this._context).map(contribution => this._register(contribution));
	}

	/** Notifies contributions of a terminal turn outcome without allowing one to block the others. */
	turnEnd(turn: ITurnEnd): void {
		for (const contribution of this._contributions) {
			if (!contribution.onTurnEnd) {
				continue;
			}
			try {
				contribution.onTurnEnd(turn);
			} catch (err) {
				this._context.logService.error(`[AgentHostChatContributions] Contribution '${contribution.id}' failed: ${err instanceof Error ? err.message : String(err)}`, err);
			}
		}
	}
}
