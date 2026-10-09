/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentHostGitStateService } from '../../../common/agentHostGitStateService.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { isAhpChatChannel, isDefaultChatUri, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { resolveGitHubStateFolder } from '../../agentHostBranchChangesetScope.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Reconciles the current pull request of the folder a started turn ran in after it ends. */
export class GitHubReferencesContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'githubReferences';
	readonly order = 300;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'rejected' || turn.reason.kind === 'localCommand') {
			return;
		}
		const key = this._getPullRequestKey(turn);
		const workingDirectory = this._stateManager.getSessionState(key)?.workingDirectories?.[0];
		void this._gitStateService.attachSessionGitHubPullRequest(key, workingDirectory ? URI.parse(workingDirectory) : undefined);
	}

	/**
	 * A peer chat working in a folder other than the session folder, such as its
	 * own worktree, reconciles that folder's pull request. Every other turn
	 * reconciles the session folder's through the session.
	 */
	private _getPullRequestKey(turn: ITurnEnd): ProtocolURI {
		if (isAhpChatChannel(turn.channel) && !isDefaultChatUri(turn.channel)) {
			const folder = resolveGitHubStateFolder(this._stateManager, turn.channel);
			if (!folder.isSessionFolder && folder.folderKey !== undefined) {
				return turn.channel;
			}
		}
		return turn.session;
	}
}
