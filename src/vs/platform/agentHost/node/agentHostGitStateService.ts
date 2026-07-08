/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE } from '../common/agentHostGitStateService.js';
import { ISessionGitHubState, readSessionGitHubState, readSessionGitState, SessionLifecycle, withSessionGitHubState, withSessionGitState, type ISessionGitState } from '../common/state/sessionState.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { IAgentService } from '../common/agentService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { ThrottlerByKey, timeout } from '../../../base/common/async.js';
import { isCancellationError } from '../../../base/common/errors.js';

export class AgentHostGitStateService extends Disposable implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;

	private readonly _gitStateRefreshThrottler = this._register(new ThrottlerByKey<string>());
	private readonly _gitStateRefreshCancellationTokenSource = new CancellationTokenSource();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();

		this._register(toDisposable(() => this._gitStateRefreshCancellationTokenSource.dispose(true)));
	}

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
		const gitHubState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
		if (!gitHubState?.owner || !gitHubState?.repo || gitHubState?.pullRequestUrl) {
			return;
		}

		// Git state
		const gitState = readSessionGitState(state._meta);
		if (!gitState?.branchName || (gitState.branchName === gitState.baseBranchName)) {
			return;
		}

		try {
			const repoResource = this._gitHubEndpointService.getRepoResource();
			const authToken = this._agentService.getAuthToken({
				resource: repoResource.resource,
				scopes: repoResource.scopes_supported,
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

	async refreshSessionGitState(sessionKey: string, workingDirectory: URI | undefined): Promise<void> {
		const sessionState = this._stateManager.getSessionState(sessionKey);
		if (sessionState?.lifecycle === SessionLifecycle.Creating) {
			return;
		}

		if (!workingDirectory) {
			const workingDirectoryStr = sessionState?.workingDirectory;
			if (workingDirectoryStr) {
				workingDirectory = URI.parse(workingDirectoryStr);
			}
		}

		if (!workingDirectory) {
			return;
		}

		await this._gitStateRefreshThrottler.queue(sessionKey, async () => {
			try {
				this._logService.trace(`[AgentHostGitStateService][refreshSessionGitState] Refreshing git state for ${sessionKey}, ${workingDirectory?.fsPath}`);

				const gitState = await this._gitService.getSessionGitState(workingDirectory);
				if (gitState) {
					const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
					if (!objectEquals(readSessionGitState(currentMeta), gitState)) {
						// Update the session's git state
						await this._setSessionGitState(sessionKey, gitState);

						// Update the session's GitHub state
						if (gitState.githubOwner && gitState.githubRepo) {
							await this.setSessionGitHubState(sessionKey, {
								owner: gitState.githubOwner,
								repo: gitState.githubRepo
							} satisfies ISessionGitHubState);
						}
					}
				}

				this._onDidRefreshSessionGitState.fire(sessionKey);

				// We want to ensure that we refresh the git state at
				// most every 5 seconds in order to avoid excessive git
				// operations and excessive traffic between the server
				// and the client(s).
				await timeout(5_000, this._gitStateRefreshCancellationTokenSource.token);
			} catch (error) {
				if (isCancellationError(error)) {
					return;
				}

				this._logService.warn(`[AgentHostGitStateService][refreshSessionGitState] Failed to compute git state for ${sessionKey}:`, error);
			}
		});
	}

	async setSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;

		const currentState = readSessionGitHubState(currentMeta);
		const nextState = { ...(currentState ?? {}), ...state } satisfies ISessionGitHubState;

		if (objectEquals(currentState, nextState)) {
			return;
		}

		// Update session state manager
		const nextMeta = withSessionGitHubState(currentMeta, nextState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);

		// Update session database
		await this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
	}

	private async _setSessionGitState(sessionKey: string, gitState: ISessionGitState): Promise<void> {
		// Update session state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const nextMeta = withSessionGitState(currentMeta, gitState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);

		// Update session database
		await this._saveSessionState(sessionKey, META_GIT_STATE, JSON.stringify(gitState));
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
