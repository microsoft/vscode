/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { isMessageHiddenFromTranscript, isMessageRequestHiddenFromTranscript } from '../../../common/meta/agentMessageMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isSubagentSession, MessageKind, type Message } from '../../../common/state/sessionState.js';
import { IAgentHostRequestIndex } from '../../agentHostRequestIndex.js';
import { AgentHostStateManager, ChatRemovalReason, IAgentHostStateManager } from '../../agentHostStateManager.js';

/**
 * Keeps the host's request index in step with its chats: records each turn as
 * it starts, and follows truncations, removals, moves and title changes.
 */
export class RequestIndexContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'requestIndex';
	readonly order = 780;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostRequestIndex private readonly _index: IAgentHostRequestIndex,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onDidDispatchAction({ action, channel, session, origin, rejectionReason }: IDispatchedAction): void {
		if (rejectionReason !== undefined || isSubagentSession(session) || this._stateManager.isEphemeralSession(session)) {
			return;
		}
		switch (action.type) {
			case ActionType.ChatTurnStarted: {
				const isDefaultChat = channel === session || this._stateManager.isDefaultChat(session, channel);
				const summary = this._stateManager.getSessionSummary(session);
				this._index.recordTurn({
					session,
					chat: channel,
					isDefaultChat,
					storage: this._stateManager.getChatStorageResource(channel) ?? (isDefaultChat ? session : undefined),
					turnId: action.turnId,
					startedAt: Date.now(),
					text: isSearchableRequest(action.message) ? action.message.text : undefined,
					sessionTitle: summary?.title,
					chatTitle: isDefaultChat ? undefined : summary?.chats?.find(chat => chat.resource === channel)?.title,
				});
				return;
			}
			case ActionType.ChatTruncated:
				// The host refreshes a chat's history by truncating and reloading it; only a client truncation removes requests.
				if (origin !== undefined) {
					this._index.truncateChat(channel, action.turnId);
				}
				return;
			case ActionType.ChatMoved:
				this._index.moveChat(channel, action.session, this._stateManager.isDefaultChat(action.session, channel));
				return;
			case ActionType.SessionChatRemoved:
				// A chat moving to another session also leaves its source's catalog; `chat/moved` then reassigns its requests.
				if (this._stateManager.chatRemovalReason(channel, action.chat) === ChatRemovalReason.Deleted) {
					this._index.removeChat(action.chat);
				}
				return;
			case ActionType.SessionTitleChanged:
				this._index.setTitle(channel, action.title);
				return;
			case ActionType.SessionChatUpdated:
				if (action.changes.title) {
					this._index.setTitle(action.chat, action.changes.title);
				}
				return;
		}
	}
}

/** A message the user typed and can see in the transcript. */
function isSearchableRequest(message: Message): boolean {
	return message.origin.kind === MessageKind.User && !isMessageHiddenFromTranscript(message) && !isMessageRequestHiddenFromTranscript(message);
}
