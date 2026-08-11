/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSession, type AgentProvider } from '../common/agent.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostSessionTitleSignal = createDecorator<IAgentHostSessionTitleSignal>('agentHostSessionTitleSignal');

/** A session's title changed. */
export interface IAgentHostSessionTitleChangeEvent {
	/** The provider that owns `session`, derived from the session URI scheme. */
	readonly provider: AgentProvider;
	/** The owning session. */
	readonly session: URI;
	/**
	 * The provider-facing conversation id for `session` — the agent-host session
	 * id ({@link AgentSession.id}) every provider already correlates its
	 * telemetry by. Precomputed here so consumers do not re-derive it.
	 */
	readonly conversationId: string;
	/** The session's new title. */
	readonly title: string;
}

/**
 * Narrow, centrally derived session-title signal.
 *
 * Session titles are host-owned: Agent Host generates, renames, and persists
 * them, and providers only observe them (today, to emit an OTel metadata span
 * correlating the title with a provider conversation). This seam exposes that
 * one observation so a provider does not inject the whole
 * {@link AgentHostStateManager} for it, and so the provider filter
 * (`AgentSession.provider(session) === this.id`) and conversation-id derivation
 * are computed once, here, rather than repeated per provider.
 */
export interface IAgentHostSessionTitleSignal {
	readonly _serviceBrand: undefined;

	/**
	 * Fires whenever any session's title changes. Consumers that only care
	 * about their own sessions filter on {@link
	 * IAgentHostSessionTitleChangeEvent.provider}.
	 */
	readonly onDidChangeSessionTitle: Event<IAgentHostSessionTitleChangeEvent>;
}

export class AgentHostSessionTitleSignal extends Disposable implements IAgentHostSessionTitleSignal {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessionTitle = this._register(new Emitter<IAgentHostSessionTitleChangeEvent>());
	readonly onDidChangeSessionTitle = this._onDidChangeSessionTitle.event;

	constructor(
		@IAgentHostStateManager stateManager: AgentHostStateManager,
	) {
		super();
		this._register(stateManager.onDidChangeSessionTitle(({ session, title }) => {
			const provider = AgentSession.provider(session);
			if (!provider) {
				return;
			}
			this._onDidChangeSessionTitle.fire({
				provider,
				session: URI.parse(session),
				conversationId: AgentSession.id(session),
				title,
			});
		}));
	}
}
