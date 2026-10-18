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
import { ChatOriginKind, isAhpChatChannel } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/**
 * Persists the config values a chat sets for itself (`ChatState.config`) in
 * the chat's own database and restores them with the chat. Covers changes from
 * clients, the host and providers alike. A subagent has no values of its own.
 */
export class ChatConfigContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatConfig';
	readonly order = 650;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostSessionStateStore private readonly _sessionStateStore: IAgentHostSessionStateStore,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.action.type !== ActionType.ChatConfigChanged || dispatched.rejectionReason || !isAhpChatChannel(dispatched.channel)
			|| this._stateManager.getChatOrigin(dispatched.channel)?.kind === ChatOriginKind.Tool) {
			return;
		}
		const values = this._stateManager.getChatConfig(dispatched.channel)?.values ?? {};
		this._sessionStateStore.chatRows.setChatConfig(URI.parse(dispatched.session), URI.parse(dispatched.channel), values).catch(err => {
			this._logService.warn(`[ChatConfigContribution] Failed to persist the config of ${dispatched.channel}`, err);
		});
	}

	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		if (restored.config !== undefined) {
			return restored;
		}
		try {
			const values = await this._sessionStateStore.chatRows.getChatConfig(URI.parse(context.session), URI.parse(context.chat));
			return values !== undefined ? { ...restored, config: { values } } : restored;
		} catch (err) {
			this._logService.warn(`[ChatConfigContribution] Failed to restore the config of ${context.chat}`, err);
			return restored;
		}
	}
}
