/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IAppliedClientAction, type IOutgoingTurn, type IRestoredChat, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isDefaultChatUri } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostSessionTitleController } from '../../agentHostSessionTitleController.js';
import { AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../shared/persistSessionMetadata.js';

/** Coordinates automatic and user-defined session and chat titles. */
export class SessionTitleContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionTitle';
	readonly order = 400;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostSessionTitleController private readonly _titleController: IAgentHostSessionTitleController,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind !== 'success') {
			return;
		}
		const chat = isAhpChatChannel(turn.channel) && !isDefaultChatUri(turn.channel) ? turn.channel : undefined;
		this._titleController.refineTitleFromFirstTurn(turn.session, chat);
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<ISendContribution | undefined> {
		const instruction = await this._titleController.prepareInstructionForAgent(turn.session, turn.chat);
		return instruction ? { instructions: [instruction] } : undefined;
	}

	onDidApplyClientAction(observed: IAppliedClientAction): void {
		if (observed.action.type !== ActionType.SessionTitleChanged) {
			return;
		}

		if (isAhpChatChannel(observed.channel)) {
			this._stateManager.updateChatTitle(observed.session, observed.channel, observed.action.title);
			this._persistSessionMetadata(observed.session, customChatTitleMetadataKey(observed.channel), observed.action.title);
			this._persistSessionMetadata(observed.session, customChatTitleSourceMetadataKey(observed.channel), AGENT_HOST_TITLE_SOURCE_USER);
			this._titleController.markTitleRenamed(observed.session, observed.channel);
			if (isDefaultChatUri(observed.channel)) {
				this._stateManager.dispatchServerAction(observed.session, observed.action);
				this._persistSessionMetadata(observed.session, SESSION_CUSTOM_TITLE_KEY, observed.action.title);
				this._persistSessionMetadata(observed.session, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
				this._titleController.markTitleRenamed(observed.session);
			}
			return;
		}

		this._persistSessionMetadata(observed.channel, SESSION_CUSTOM_TITLE_KEY, observed.action.title);
		this._persistSessionMetadata(observed.channel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
		this._titleController.markTitleRenamed(observed.channel);
	}

	/**
	 * Restores the user-set custom chat title recorded by {@link onDidApplyClientAction}. This runs at
	 * catalog-registration time so a restored peer chat shows its title before its turns load.
	 */
	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		if (restored.title !== undefined) {
			return restored;
		}

		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(context.session));
		if (!ref) {
			return restored;
		}

		try {
			const title = (await ref.object.getMetadata(customChatTitleMetadataKey(context.chat))) ?? undefined;
			return title !== undefined ? { ...restored, title } : restored;
		} catch (err) {
			this._logService.warn(`[SessionTitleContribution] Failed to restore custom chat title for ${context.chat}`, err);
			return restored;
		} finally {
			ref.dispose();
		}
	}

	private _persistSessionMetadata(session: string, key: string, value: string): void {
		persistSessionMetadata(this._sessionDataService, this._logService, session, key, value);
	}
}
