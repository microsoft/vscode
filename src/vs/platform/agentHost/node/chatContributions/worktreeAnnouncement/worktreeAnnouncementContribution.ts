/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IHydrationContext } from '../../../common/agentHostChatContributionsService.js';
import { isDefaultChatUri, type Turn } from '../../../common/state/sessionState.js';
import { IAgentHostWorktreeIsolation } from '../../shared/worktreeIsolation.js';

/** Restores the worktree notice on the default chat when isolation is configured. */
export class WorktreeAnnouncementContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'worktreeAnnouncement';
	readonly order = 200;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
	) {
		super();
	}

	async onHydrateTurns(context: IHydrationContext, turns: readonly Turn[]): Promise<readonly Turn[]> {
		if (!isDefaultChatUri(context.chat)) {
			return turns;
		}
		return this._worktreeIsolation.applyRestoreAnnouncement(URI.parse(context.session), turns);
	}
}
