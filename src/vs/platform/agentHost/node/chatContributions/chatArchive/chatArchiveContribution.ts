/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction, IHydrationContext, IRestoredChat } from '../../../common/agentHostChatContributionsService.js';
import { IAgentHostSessionStateStore } from '../../../common/agentHostSessionStateStore.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isSessionStatusRead } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostChatOwnershipService } from '../../agentHostChatOwnershipService.js';
import { IAgentHostPeerChatPersistenceService } from '../../agentHostPeerChatStore.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostArchivedChatWorkspaceService } from './archivedChatWorkspaceService.js';

/**
 * Persists independently archived peer-chat state after the protocol action has
 * been accepted and reduced, and detaches an archived chat's folders from the
 * session workspace until it is unarchived. Also records the chat's modified time,
 * which archiving advances, and restores it with an archived chat.
 */
export class ChatArchiveContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatArchive';
	readonly order = 750;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostPeerChatPersistenceService private readonly _peerChatPersistenceService: IAgentHostPeerChatPersistenceService,
		@IAgentHostArchivedChatWorkspaceService private readonly _archivedChatWorkspace: IAgentHostArchivedChatWorkspaceService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined
			|| dispatched.action.type !== ActionType.ChatIsArchivedChanged
			|| !isAhpChatChannel(dispatched.channel)
			|| this._chatOwnership.isDefaultChat(dispatched.session, dispatched.channel)) {
			return;
		}
		const session = URI.parse(dispatched.session);
		const chat = URI.parse(dispatched.channel);
		if (dispatched.action.isArchived) {
			this._providerService.getProviderForChat(session, chat)?.clearCanvasContinuity?.(session, chat);
		}
		// A chat whose history is not materialized carries its status on the session's chat summary.
		const summary = this._stateManager.getSessionState(dispatched.session)?.chats.find(chat => chat.resource === dispatched.channel);
		const status = this._stateManager.getChatState(dispatched.channel)?.status ?? summary?.status;
		if (dispatched.action.isArchived && !isSessionStatusRead(status)) {
			this._stateManager.dispatchServerAction(dispatched.channel, { type: ActionType.ChatIsReadChanged, isRead: true });
		}
		void this._peerChatPersistenceService.setArchived(session, chat, dispatched.action.isArchived).catch(error => {
			this._logService.error(error, `[ChatArchiveContribution] Failed to persist archived state for ${dispatched.channel}`);
		});
		void this._archivedChatWorkspace.setChatWorkspaceAttached(session, chat, !dispatched.action.isArchived).catch(error => {
			this._logService.error(error, `[ChatArchiveContribution] Failed to update the session workspace for ${dispatched.channel}`);
		});
		// A chat of an unloaded session has no summary here: its passive update records the time.
		const modifiedTime = summary ? Date.parse(summary.modifiedAt) : Number.NaN;
		if (Number.isFinite(modifiedTime)) {
			this._sessionStateStore.chatRows.setChatModifiedTime(session, chat, modifiedTime).catch(error => {
				this._logService.warn(`[ChatArchiveContribution] Failed to persist the modified time of ${dispatched.channel}`, error);
			});
		}
	}

	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		// Archiving changes no turn: only an archived chat's recorded time is its last update.
		if (context.isDefaultChat || !context.archived || restored.modifiedAt !== undefined) {
			return restored;
		}
		try {
			const modifiedTime = await this._sessionStateStore.chatRows.getChatModifiedTime(URI.parse(context.session), URI.parse(context.chat));
			return modifiedTime !== undefined ? { ...restored, modifiedAt: new Date(modifiedTime).toISOString() } : restored;
		} catch (err) {
			this._logService.warn(`[ChatArchiveContribution] Failed to restore the modified time of ${context.chat}`, err);
			return restored;
		}
	}
}
