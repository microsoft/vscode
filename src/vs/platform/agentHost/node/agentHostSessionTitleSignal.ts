/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ChatOriginKind } from '../common/state/protocol/state.js';
import type { ISessionPathRoot } from '../common/sessionPathDisplay.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AgentSession, type AgentProvider } from '../common/agent.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostSessionTitleSignal = createDecorator<IAgentHostSessionTitleSignal>('agentHostSessionTitleSignal');

export interface IAgentHostSessionTitleChangeEvent {
	/** Registered provider owning `session`. */
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
	/** Current host-owned title, including known sessions that have not been restored. */
	getSessionTitle(session: URI): string | undefined;
	/** Conversation title and recorded spawning relationship, without restoring chat state. */
	getChatPathIdentity(chat: URI, owner: URI): Pick<ISessionPathRoot, 'title' | 'parentSession' | 'parentTitle'>;
}

export class AgentHostSessionTitleSignal extends Disposable implements IAgentHostSessionTitleSignal {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSessionTitle = this._register(new Emitter<IAgentHostSessionTitleChangeEvent>());
	readonly onDidChangeSessionTitle = this._onDidChangeSessionTitle.event;

	constructor(
		@IAgentHostStateManager private readonly stateManager: AgentHostStateManager,
	) {
		super();
		this._register(stateManager.onDidChangeSessionTitle(({ session, title }) => {
			const provider = stateManager.getSessionSummary(session)?.provider ?? AgentSession.provider(session);
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

	getSessionTitle(session: URI): string | undefined {
		return (this.stateManager.getSessionSummary(session.toString()) ?? this.stateManager.getSurfacedSessionSummary(session.toString()))?.title;
	}

	getChatPathIdentity(chat: URI, owner: URI): Pick<ISessionPathRoot, 'title' | 'parentSession' | 'parentTitle'> {
		// Public summaries omit tool-origin chats; their retained titles are in the resident catalog.
		const summary = this.stateManager.getSessionState(owner.toString()) ?? this.stateManager.getSessionSummary(owner.toString()) ?? this.stateManager.getSurfacedSessionSummary(owner.toString());
		const state = this.stateManager.getChatState(chat.toString()) ?? summary?.chats?.find(candidate => candidate.resource === chat.toString());
		const title = state?.title.trim() ? state.title : this.stateManager.isDefaultChat(owner.toString(), chat.toString()) ? summary?.title : undefined;
		const origin = this.stateManager.getChatOrigin(chat.toString()) ?? state?.origin;
		const parent = origin?.kind === ChatOriginKind.Tool ? origin.chat : undefined;
		if (!parent) {
			return { title };
		}
		const parentOwner = this.stateManager.getChatOwner(parent) ?? this.stateManager.findRetainedChatOwner(parent);
		const parentSummary = parentOwner ? this.stateManager.getSessionState(parentOwner) ?? this.stateManager.getSessionSummary(parentOwner) ?? this.stateManager.getSurfacedSessionSummary(parentOwner) : undefined;
		const parentState = this.stateManager.getChatState(parent) ?? parentSummary?.chats?.find(candidate => candidate.resource === parent);
		const parentTitle = parentState?.title.trim() ? parentState.title : parentOwner && this.stateManager.isDefaultChat(parentOwner, parent) ? parentSummary?.title : undefined;
		return { title, parentSession: URI.parse(parent), parentTitle };
	}
}
