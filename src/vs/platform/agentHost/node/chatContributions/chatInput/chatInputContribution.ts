/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel } from '../../../common/state/sessionState.js';
import { IAgentHostChatInputService } from '../../agentHostChatInputService.js';
import { IAgentHostStateManager, AgentHostStateManager, ChatRemovalReason } from '../../agentHostStateManager.js';

/** Publishes late writer conflicts through the same state used by subscription checks. */
export class ChatInputContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'chatInput';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatInputService private readonly _inputService: IAgentHostChatInputService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onDidDispatchAction({ channel, session, action, rejectionReason }: IDispatchedAction): void {
		if (rejectionReason) {
			return;
		}
		if (action.type === ActionType.ChatError && isAhpChatChannel(channel) && action.part.error.errorType === 'CodexThreadInUse') {
			this._inputService.setBlocked(channel, action.part.error);
		} else if (action.type === ActionType.SessionChatRemoved) {
			// A moved chat keeps its input state.
			if (this._stateManager.chatRemovalReason(session, action.chat) === ChatRemovalReason.Moved) {
				this._inputService.transfer(session, action.chat);
			} else {
				this._inputService.clear(session, action.chat);
			}
		} else if (action.type === ActionType.SessionChatAdded) {
			// A session that ends by moving its chat under another never removes the chat, so its state follows the add.
			this._inputService.transferAdded(session, action.summary.resource);
		} else if (action.type === ActionType.ChatIsArchivedChanged && action.isArchived) {
			this._inputService.clear(session, channel);
		} else if (action.type === ActionType.SessionIsArchivedChanged && action.isArchived) {
			for (const chat of this._stateManager.getSessionState(session)?.chats ?? []) {
				this._inputService.clear(session, chat.resource);
			}
		}
	}
}
