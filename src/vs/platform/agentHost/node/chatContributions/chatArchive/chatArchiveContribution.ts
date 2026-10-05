/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isDefaultChatUri, isSessionStatusRead, parseRequiredSessionUriFromChatUri } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostPeerChatPersistenceService } from '../../agentHostPeerChatStore.js';

/**
 * Persists independently archived peer-chat state after the protocol action has
 * been accepted and reduced.
 */
export class ChatArchiveContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatArchive';
	readonly order = 750;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostPeerChatPersistenceService private readonly _peerChatPersistenceService: IAgentHostPeerChatPersistenceService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined
			|| dispatched.action.type !== ActionType.ChatIsArchivedChanged
			|| !isAhpChatChannel(dispatched.channel)
			|| isDefaultChatUri(dispatched.channel)) {
			return;
		}
		const session = URI.parse(parseRequiredSessionUriFromChatUri(dispatched.channel));
		const chat = URI.parse(dispatched.channel);
		if (dispatched.action.isArchived && !isSessionStatusRead(this._stateManager.getChatState(dispatched.channel)?.status)) {
			this._stateManager.dispatchServerAction(dispatched.channel, { type: ActionType.ChatIsReadChanged, isRead: true });
		}
		void this._peerChatPersistenceService.setArchived(session, chat, dispatched.action.isArchived).catch(error => {
			this._logService.error(error, `[ChatArchiveContribution] Failed to persist archived state for ${dispatched.channel}`);
		});
	}
}
