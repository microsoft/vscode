/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IAgentHostChatContributions, type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext } from '../../../common/agentHostChatContributionsService.js';
import { isDefaultChatUri, type Turn } from '../../../common/state/sessionState.js';

/** Restores the worktree notice on the default chat when isolation is configured. */
export class WorktreeAnnouncementContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'worktreeAnnouncement';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostChatContributions private readonly _chatContributions: IAgentHostChatContributions,
	) {
		super();
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (!isDefaultChatUri(context.chat)) {
			return turns;
		}
		return this._chatContributions.getHost()?.applyWorktreeRestoreAnnouncement(context.session, turns) ?? turns;
	}
}
