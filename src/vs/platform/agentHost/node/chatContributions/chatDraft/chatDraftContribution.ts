/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext, type IAppliedClientAction, type IRestoredChat } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, parseChatUri } from '../../../common/state/sessionState.js';

/**
 * Owns chat draft persistence in both directions. Restore runs eagerly at
 * catalog-registration time, before turns load, so it belongs on
 * {@link onHydrateChat} rather than {@link onHydrateTurns}.
 *
 * Persisting through `onDidApplyClientAction` covers client dispatch only, which is narrower than the
 * `onDidEmitEnvelope` observer this replaced. That is deliberate: `ChatDraftChangedAction`
 * is a `ClientChatAction` that nothing in production server-dispatches, and `onDidApplyClientAction` runs
 * after the reject-and-return guards in `_dispatchActionNow`, so a rejected draft is no
 * longer written.
 */
export class ChatDraftContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatDraft';
	readonly order = 600;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();
	}

	onDidApplyClientAction(observed: IAppliedClientAction): void {
		if (observed.action.type !== ActionType.ChatDraftChanged || !isAhpChatChannel(observed.channel) || !parseChatUri(observed.channel)) {
			return;
		}

		const { draft } = observed.action;
		void (async () => {
			try {
				const ref = this._sessionDataService.openDatabase(URI.parse(observed.session));
				try {
					await ref.object.setChatDraft(URI.parse(observed.channel), draft);
				} finally {
					ref.dispose();
				}
			} catch (err) {
				this._logService.warn(`[ChatDraftContribution] Failed to persist chat draft for ${observed.channel}`, err);
			}
		})();
	}

	async onHydrateChat(context: IHydrationContext, restored: IRestoredChat): Promise<IRestoredChat> {
		if (restored.draft !== undefined) {
			return restored;
		}

		try {
			const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(context.session));
			if (!ref) {
				return restored;
			}

			try {
				const draft = await ref.object.getChatDraft(URI.parse(context.chat));
				return draft !== undefined ? { ...restored, draft } : restored;
			} finally {
				ref.dispose();
			}
		} catch (err) {
			this._logService.warn(`[ChatDraftContribution] Failed to restore chat draft for ${context.chat}`, err);
			return restored;
		}
	}
}
