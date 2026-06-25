/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri, formatSessionChangesetDescription } from '../common/changesetUri.js';
import { ISessionGitHubState, readSessionGitHubState, readSessionGitState, SessionLifecycle, withSessionGitHubState, withSessionGitState, type Changeset, type ISessionGitState } from '../common/state/sessionState.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { GITHUB_REPO_PROTECTED_RESOURCE, IAgentService } from '../common/agentService.js';

export const META_GIT_STATE = 'agentHost.git';
export const META_GITHUB_STATE = 'agentHost.github';

export class AgentHostGitStateService implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentService private readonly _agentService: IAgentService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) { }

	async attachSessionGitHubPullRequest(sessionKey: string): Promise<void> {
		const state = this._stateManager.getSessionState(sessionKey);
		if (!state) {
			return;
		}

		// New session
		if (state.lifecycle !== SessionLifecycle.Ready) {
			return;
		}

		// GitHub state
		const gitHubState = readSessionGitHubState(state.summary._meta);
		if (!gitHubState?.owner || !gitHubState?.repo || gitHubState?.pullRequestUrl) {
			return;
		}

		// Git state
		const gitState = readSessionGitState(state._meta);
		if (!gitState?.branchName || (gitState.branchName === gitState.baseBranchName)) {
			return;
		}

		try {
			const authToken = this._agentService.getAuthToken({
				resource: GITHUB_REPO_PROTECTED_RESOURCE.resource,
				scopes: GITHUB_REPO_PROTECTED_RESOURCE.scopes_supported,
			});
			if (!authToken) {
				return;
			}

			const signal = new AbortController().signal;
			const pr = await this._octoKitService.findPullRequestByHeadBranch(
				gitHubState.owner, gitHubState.repo, gitState.branchName, authToken, signal);
			if (!pr?.url) {
				return;
			}

			this.setSessionGitHubState(sessionKey, {
				owner: gitHubState.owner,
				repo: gitHubState.repo,
				pullRequestUrl: pr.url
			} satisfies ISessionGitHubState);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to find pull request for ${sessionKey}`, error);
		}
	}

	async refreshSessionGitState(sessionKey: string, workingDirectory: URI | undefined): Promise<ISessionGitState | undefined | null> {
		if (!workingDirectory) {
			const workingDirectoryStr = this._stateManager.getSessionState(sessionKey)?.summary.workingDirectory;
			if (workingDirectoryStr) {
				workingDirectory = URI.parse(workingDirectoryStr);
			}
		}

		if (!workingDirectory) {
			return null;
		}

		try {
			const gitState = await this._gitService.getSessionGitState(workingDirectory);
			if (!gitState) {
				this._stripGitOnlyChangesetEntries(sessionKey);
				return null;
			}

			const current = this._stateManager.getSessionState(sessionKey)?._meta;
			if (objectEquals(readSessionGitState(current), gitState)) {
				return undefined;
			}

			this._setSessionGitState(sessionKey, gitState);

			if (gitState.githubOwner && gitState.githubRepo) {
				void this.setSessionGitHubState(sessionKey, {
					owner: gitState.githubOwner,
					repo: gitState.githubRepo
				} satisfies ISessionGitHubState);
			}

			return gitState;
		} catch (e) {
			this._logService.warn(`[AgentHostGitStateService][refreshSessionGitState] Failed to compute git state for ${sessionKey}`, e);
			return null;
		}
	}

	async setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
		const currentMeta = this._stateManager.getSessionState(sessionKey)?.summary._meta;

		const currentState = readSessionGitHubState(currentMeta);
		const nextState = { ...(currentState ?? {}), ...state } satisfies ISessionGitHubState;

		if (objectEquals(currentState, nextState)) {
			return;
		}

		// Update session state manager
		const nextMeta = withSessionGitHubState(currentMeta, nextState);
		this._stateManager.setSessionSummaryMeta(sessionKey, nextMeta);

		// Update session database
		void this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
	}

	private _setSessionGitState(sessionKey: string, gitState: ISessionGitState): void {
		this._updateBranchChangesetDescription(sessionKey, gitState);

		// Update session state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const nextMeta = withSessionGitState(currentMeta, gitState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);

		// Update session database
		void this._saveSessionState(sessionKey, META_GIT_STATE, JSON.stringify(gitState));
	}

	private _stripGitOnlyChangesetEntries(sessionKey: string): void {
		const state = this._stateManager.getSessionState(sessionKey);
		const current = state?.changesets;
		if (!current || current.length === 0) {
			return;
		}
		const branchUri = buildSessionChangesetUri(sessionKey);
		const uncommittedUri = buildUncommittedChangesetUri(sessionKey);
		const filtered = current.filter((c: Changeset) => c.uriTemplate !== branchUri && c.uriTemplate !== uncommittedUri);
		if (filtered.length === current.length) {
			return;
		}
		this._stateManager.setSessionChangesets(sessionKey, filtered);
	}

	private _updateBranchChangesetDescription(sessionKey: string, gitState: ISessionGitState): void {
		const description = formatSessionChangesetDescription(gitState);
		const state = this._stateManager.getSessionState(sessionKey);
		const current = state?.changesets;
		if (!current || current.length === 0) {
			return;
		}
		const branchUri = buildBranchChangesetUri(sessionKey);
		let changed = false;
		const next = current.map((c: Changeset) => {
			if (c.uriTemplate !== branchUri) {
				return c;
			}
			if (c.description === description) {
				return c;
			}
			changed = true;
			if (description === undefined) {
				const { description: _omit, ...rest } = c;
				return rest;
			}
			return { ...c, description };
		});
		if (!changed) {
			return;
		}
		this._stateManager.setSessionChangesets(sessionKey, next);
	}

	private async _saveSessionState(sessionKey: string, key: string, value: string): Promise<void> {
		// Skip saving session state if the session is not materialized
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating) {
			return;
		}

		let databaseRef;
		try {
			databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionKey));
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to open session database for ${sessionKey}`, error);
			return;
		}

		try {
			await databaseRef.object.setMetadata(key, value);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to persist ${key}`, error);
		} finally {
			databaseRef.dispose();
		}
	}
}
