/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isDefaultChatUri } from '../../../common/state/sessionState.js';
import { IAgentHostPeerChatPersistenceService } from '../../agentHostPeerChatStore.js';

/** Persists exact peer-chat recency independently from aggregate session recency. */
export class PeerChatModifiedTimeContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'peerChatModifiedTime';
	readonly order = 800;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostPeerChatPersistenceService private readonly _peerChatPersistenceService: IAgentHostPeerChatPersistenceService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined) {
			return;
		}
		const update = dispatched.action.type === ActionType.SessionChatAdded
			? { chat: dispatched.action.summary.resource, modifiedAt: dispatched.action.summary.modifiedAt }
			: dispatched.action.type === ActionType.SessionChatUpdated && dispatched.action.changes.modifiedAt !== undefined
				? { chat: dispatched.action.chat, modifiedAt: dispatched.action.changes.modifiedAt }
				: undefined;
		if (!update || isDefaultChatUri(update.chat)) {
			return;
		}
		void this._peerChatPersistenceService.setModifiedAt(URI.parse(dispatched.session), URI.parse(update.chat), update.modifiedAt).catch(error => {
			this._logService.error(error, `[PeerChatModifiedTimeContribution] Failed to persist modified time for ${update.chat}`);
		});
	}
}
