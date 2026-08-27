/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentHostGitStateService } from '../../../common/agentHostGitStateService.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Attaches the session's current pull request after a successful turn. */
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
		if (turn.reason.kind === 'success') {
			const workingDirectory = this._stateManager.getSessionState(turn.session)?.workingDirectories?.[0];
			void this._gitStateService.attachSessionGitHubPullRequest(turn.session, workingDirectory ? URI.parse(workingDirectory) : undefined);
		}
	}
}
