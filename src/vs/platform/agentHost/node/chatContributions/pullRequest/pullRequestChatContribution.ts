/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../log/common/log.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IIncomingRequest, type IncomingRequestDisposition, type IOutgoingTurn, type ISendContribution, type ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { readAgentMergeFolderState, withAgentMergeFolderState } from '../../../common/agentMerge.js';
import { readPullRequestChatMeta, type IPullRequestAutopilotOptions } from '../../../common/meta/agentPullRequestOperationMeta.js';
import { readSessionArtifacts, SessionArtifactType } from '../../../common/sessionArtifacts.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { isAgentMergeEnabled } from '../../agentMergeConfiguration.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { resolveGitHubStateFolder } from '../../agentHostBranchChangesetScope.js';
import { IAgentHostPullRequestAutopilotService } from '../../agentHostPullRequestAutopilot.js';

/** Applies PR form automation choices only once its creation turn is admitted. */
export class PullRequestChatContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'pullRequest';
	readonly order = 150;

	/** Autopilot choices of admitted creation turns, by turn ID, applied to the pull request the turn records. */
	private readonly _pendingAutopilot = new Map<string, IPullRequestAutopilotOptions>();

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostPullRequestAutopilotService private readonly _autopilotService: IAgentHostPullRequestAutopilotService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		const options = readPullRequestChatMeta(request.message);
		if (options?.agentMerge && !isAgentMergeEnabled(this._configurationService)) {
			return {
				kind: 'reject',
				error: { errorType: 'invalidParams', message: localize('agentHost.pullRequestChat.agentMergeDisabled', "Agent Merge is disabled in the host configuration.") },
				stage: 'validation',
			};
		}
		if (options?.autopilot && !this._autopilotService.isAvailable()) {
			return {
				kind: 'reject',
				error: { errorType: 'invalidParams', message: localize('agentHost.pullRequestChat.autopilotDisabled', "Autopilot is unavailable because artifact integrations are disabled in the host configuration.") },
				stage: 'validation',
			};
		}
		return undefined;
	}

	/**
	 * Autopilot acts on a recorded pull request, which only exists once the agent created and recorded it, so the
	 * choices apply to the pull requests the turn recorded once it ends.
	 */
	onTurnEnd(turn: ITurnEnd): void {
		const autopilot = turn.turnId !== undefined ? this._pendingAutopilot.get(turn.turnId) : undefined;
		// A resumable error continues the same turn later, which may still record the pull request.
		if (!autopilot || !turn.turnId || (turn.reason.kind === 'error' && turn.reason.resumable)) {
			return;
		}
		this._pendingAutopilot.delete(turn.turnId);
		const turnId = turn.turnId;
		const pullRequests = readSessionArtifacts(this._stateManager.getSessionState(turn.session)?._meta)
			.filter(artifact => artifact.type === SessionArtifactType.PullRequest && artifact.isArtifact && artifact.origin?.turnId === turnId);
		if (!pullRequests.length) {
			this._logService.info(`[PullRequestChatContribution] No pull request was recorded in turn ${turnId}; Autopilot was not enabled.`);
			return;
		}
		for (const pullRequest of pullRequests) {
			this._autopilotService.enable(turn.session, pullRequest.id, autopilot).then(result => {
				if (result.unavailable.length) {
					this._logService.info(`[PullRequestChatContribution] Autopilot rules stayed off for ${pullRequest.link}: ${result.unavailable.join(', ')}`);
				}
			}, error => this._logService.warn(`[PullRequestChatContribution] Failed to enable Autopilot for ${pullRequest.link}: ${toErrorMessage(error)}`));
		}
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const options = readPullRequestChatMeta(turn.message);
		// Preparation can be cancelled before this hook runs; never configure an idle session.
		if (!options || this._stateManager.getChatState(turn.chat)?.activeTurn?.id !== turn.turnId) {
			return undefined;
		}
		if (options.autopilot) {
			this._pendingAutopilot.set(turn.turnId, options.autopilot);
		}
		const folder = resolveGitHubStateFolder(this._stateManager, turn.chat);
		if (folder.folderKey === undefined) {
			return undefined;
		}
		const sessionFolderKey = resolveGitHubStateFolder(this._stateManager, turn.session).folderKey;
		const values = this._configurationService.getSessionConfigValues(turn.session);
		const current = readAgentMergeFolderState(values, folder.folderKey, sessionFolderKey);
		if (options.agentMerge) {
			const overrides = { ...current?.overrides, ...options.agentMergeOptions };
			// A new pull request binds afresh, so the folder's earlier lifecycle state is not carried over.
			this._configurationService.updateSessionConfig(turn.session, withAgentMergeFolderState(values, folder.folderKey, sessionFolderKey, { enabled: true, overrides, chat: turn.chat }));
		} else if (current?.enabled) {
			this._configurationService.updateSessionConfig(turn.session, withAgentMergeFolderState(values, folder.folderKey, sessionFolderKey, { ...current, enabled: false }));
		}
		return undefined;
	}
}
