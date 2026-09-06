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

export interface IAgentHostSessionTitleChangeEvent {
	/** Provider owning `session`, derived from the session URI scheme. */
	readonly provider: AgentProvider;
	readonly session: URI;
	/** Provider-facing conversation id ({@link AgentSession.id}), precomputed so consumers don't re-derive it. */
	readonly conversationId: string;
	readonly title: string;
}

/**
 * Session titles are host-owned; providers only observe them (e.g. to emit an
 * OTel span correlating the title with a conversation). This centralizes that
 * observation so providers need not inject the whole {@link AgentHostStateManager}.
 */
export interface IAgentHostSessionTitleSignal {
	readonly _serviceBrand: undefined;

	/** Fires for any session; filter on {@link IAgentHostSessionTitleChangeEvent.provider} for own sessions. */
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
