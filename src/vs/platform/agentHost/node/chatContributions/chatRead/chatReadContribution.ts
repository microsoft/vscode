/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, isAhpChatChannel, isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../../../common/state/sessionState.js';
import { IAgentHostPeerChatPersistenceService } from '../../agentHostPeerChatStore.js';
import { persistSessionMetadata } from '../../shared/persistSessionMetadata.js';

/** Persists accepted chat read-state changes. */
export class ChatReadContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatRead';
	readonly order = 760;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostPeerChatPersistenceService private readonly _peerChatPersistenceService: IAgentHostPeerChatPersistenceService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined
			|| dispatched.action.type !== ActionType.ChatIsReadChanged
			|| !isAhpChatChannel(dispatched.channel)) {
			return;
		}
		const sessionResource = parseRequiredSessionUriFromChatUri(dispatched.channel);
		if (isDefaultChatUri(dispatched.channel)) {
			persistSessionMetadata(this._sessionDataService, this._logService, sessionResource, AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, dispatched.action.isRead ? 'true' : '');
			return;
		}
		const session = URI.parse(sessionResource);
		const chat = URI.parse(dispatched.channel);
		void this._peerChatPersistenceService.setRead(session, chat, dispatched.action.isRead).catch(error => {
			this._logService.error(error, `[ChatReadContribution] Failed to persist read state for ${dispatched.channel}`);
		});
	}
}
