/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import type { IAgentChatUsageSignal } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { readChatUsage, withChatUsage, type IAgentChatUsage } from '../../../common/meta/agentUsageMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import type { URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { IAgentHostChatOwnershipService } from '../../agentHostChatOwnershipService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Publishes exact-chat aggregate billing independently of turn usage and content. */
export class ChatUsageContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatUsage';
	readonly order = 100;
	/** Resume can report billing before the orchestrator restores the chat catalog. */
	private readonly _pendingUsage = new Map<ProtocolURI, { readonly usage: IAgentChatUsage; readonly removedSessions: Set<ProtocolURI> }>();

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
	) {
		super();
		this._register(_stateManager.onDidRemoveSession(session => {
			for (const pending of this._pendingUsage.values()) {
				// Ownership may not exist yet. Reject the receipt if its eventual owner was removed.
				pending.removedSessions.add(session);
			}
		}));
	}

	onChatUsage(signal: IAgentChatUsageSignal): void {
		const chat = signal.chat.toString();
		this._pendingUsage.set(chat, { usage: signal.usage, removedSessions: new Set() });
		this._publishChatUsage(chat);
	}

	onDidRestoreSession(session: ProtocolURI): void {
		this._publishSessionUsage(session);
	}

	private _publishSessionUsage(session: ProtocolURI): void {
		for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
			this._publishChatUsage(chat.resource);
		}
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined) {
			return;
		}
		const { action, session } = dispatched;
		if (action.type === ActionType.SessionReady || action.type === ActionType.SessionChatAdded) {
			this._publishSessionUsage(session);
		} else if (action.type === ActionType.SessionChatRemoved) {
			this._pendingUsage.delete(action.chat);
			const state = this._stateManager.getSessionState(session);
			if (state && readChatUsage(state, action.chat)) {
				this._stateManager.setSessionMeta(session, withChatUsage(state, action.chat, undefined));
			}
		}
	}

	private _publishChatUsage(chat: ProtocolURI): void {
		const pending = this._pendingUsage.get(chat);
		if (!pending) {
			return;
		}
		const session = this._chatOwnership.getChatOwner(chat);
		if (session === undefined) {
			return;
		}
		const state = this._stateManager.getSessionState(session);
		if (!state?.chats.some(summary => summary.resource === chat)) {
			return;
		}
		this._pendingUsage.delete(chat);
		if (pending.removedSessions.has(session)) {
			return;
		}
		const { usage } = pending;
		if (!equals(readChatUsage(state, chat), usage)) {
			this._stateManager.setSessionMeta(session, withChatUsage(state, chat, usage));
		}
	}

	override dispose(): void {
		this._pendingUsage.clear();
		super.dispose();
	}
}
