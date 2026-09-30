/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IAppliedClientAction, type IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { createAgentChatContext, getSessionChatsForFanOut } from '../../agentChatContext.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Prepares experimental drafts after selections or active-client tools change. */
export class DraftPreparationContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'draftPreparation';
	readonly order = 650;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onDidDispatchAction({ channel, session, action, rejectionReason }: IDispatchedAction): void {
		if (rejectionReason !== undefined) {
			return;
		}
		if (action.type === ActionType.ChatDraftChanged && isAhpChatChannel(channel)) {
			this._prepareDraft(session, URI.parse(channel));
		} else if (action.type === ActionType.SessionChatAdded && this._stateManager.getSessionState(session)?.activeClients?.length) {
			this._prepareSessionDrafts(session);
		}
	}

	onDidApplyClientAction({ session, action }: IAppliedClientAction): void {
		// Client tools are fanned out by the host after dispatch, before this hook.
		if (action.type === ActionType.SessionActiveClientSet) {
			this._prepareSessionDrafts(session);
		}
	}

	private _prepareSessionDrafts(session: ProtocolURI): void {
		for (const chat of getSessionChatsForFanOut(this._stateManager, session) ?? []) {
			this._prepareDraft(session, chat);
		}
	}

	private _prepareDraft(session: ProtocolURI, chat: URI): void {
		const agent = this._providerService.getProviderForSession(session);
		if (agent?.id !== 'copilotcli' || !agent.chats.prepareDraft) {
			return;
		}
		const draft = this._stateManager.getChatState(chat.toString())?.draft;
		void agent.chats.prepareDraft(chat, createAgentChatContext(this._stateManager, session, chat), draft ? { model: draft.model, agent: draft.agent } : {}).catch(error => {
			this._logService.warn('[DraftPreparationContribution] Experimental draft preparation failed', error);
		});
	}
}
