/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { AgentHostAutoAttachPullRequestsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { getSessionPullRequestUrlKey, getSessionRelatedPullRequestUrls, ISessionGitHubState, ISessionWithDefaultChat, readSessionGitHubState, readSessionGitState, readSessionSourceControlState, SessionLifecycle, SessionSourceControlOutcome, withInitialSessionPullRequest, withMostRecentSessionPullRequest, withSessionGitHubState, withSessionGitState, withSessionSourceControlState, type ISessionGitState, type ISessionSourceControlState, type SessionSummaryMeta } from '../common/state/sessionState.js';
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from '../common/agentHostGitService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { CreatedPullRequest, IAgentHostOctoKitService } from './shared/agentHostOctoKitService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { ThrottlerByKey, SequencerByKey, timeout } from '../../../base/common/async.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { AgentHostPullRequestAssociationResolver } from './agentHostPullRequestAssociationResolver.js';

const PULL_REQUEST_CREATION_CLOCK_SKEW_MS = 5 * 60_000;

export class AgentHostGitStateService extends Disposable implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;

	private readonly _onDidChangeSessionGitHubState = this._register(new Emitter<string>());
	readonly onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;

	private readonly _gitStateRefreshThrottler = this._register(new ThrottlerByKey<string>());
	private readonly _gitStateRefreshCancellationTokenSource = new CancellationTokenSource();

	/**
	 * Serializes pull request lookups per session so overlapping triggers (turn
	 * completion, session restore, a refresh observing a branch change) issue at
	 * most one GitHub request at a time and observe each other's writes.
	 */
	private readonly _pullRequestSequencer = new SequencerByKey<string>();
	private readonly _pullRequestAssociationResolver: AgentHostPullRequestAssociationResolver;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();

		this._pullRequestAssociationResolver = this._register(new AgentHostPullRequestAssociationResolver(this._gitService, this._octoKitService));
		this._register(toDisposable(() => this._gitStateRefreshCancellationTokenSource.dispose(true)));
		this._register(this._stateManager.onDidRemoveSession(sessionKey => this._pullRequestAssociationResolver.removeSession(sessionKey)));

		let automaticPullRequestAttachmentEnabled = this._isAutomaticPullRequestAttachmentEnabled();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			const nextEnabled = this._isAutomaticPullRequestAttachmentEnabled();
			if (automaticPullRequestAttachmentEnabled === nextEnabled) {
				return;
			}
			automaticPullRequestAttachmentEnabled = nextEnabled;
			this._pullRequestAssociationResolver.resetRestrictedState();
			for (const sessionKey of this._stateManager.getSessionUris()) {
				void this._queuePullRequestLookup(sessionKey).catch(error => {
					this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to reconcile pull request setting for ${sessionKey}`, error);
				});
			}
		}));
	}

	async attachSessionGitHubPullRequest(sessionKey: string, workingDirectory: URI | undefined): Promise<void> {
		await this.refreshSessionGitState(sessionKey, workingDirectory);
		await this._queuePullRequestLookup(sessionKey);
	}

	/**
	 * Queues a pull request lookup on the session's sequencer so overlapping
	 * triggers (turn completion, session restore, a refresh observing a branch
	 * change) issue at most one GitHub request at a time.
	 */
	private _queuePullRequestLookup(sessionKey: string): Promise<void> {
		return this._pullRequestSequencer.queue(sessionKey, () => this._attachSessionGitHubPullRequest(sessionKey));
	}

	private async _attachSessionGitHubPullRequest(sessionKey: string): Promise<void> {
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
		if (!gitHubState?.owner || !gitHubState?.repo) {
			return;
		}

		// Git state
		const gitState = readSessionGitState(state._meta);
		const branchName = gitState?.branchName;

		if (!this._isAutomaticPullRequestAttachmentEnabled()) {
			try {
				const result = await this._pullRequestAssociationResolver.reconcileRestricted({
					sessionKey,
					sessionState: state,
					gitHubState,
					gitState,
					getAuthToken: () => this._getGitHubAuthToken(),
					getCurrentSessionState: () => this._stateManager.getSessionState(sessionKey),
					isRestrictedMode: () => !this._isAutomaticPullRequestAttachmentEnabled(),
				});
				if (result.kind === 'retry') {
					void this._queuePullRequestLookup(sessionKey);
					return;
				}
				if (result.changed) {
					await this._replaceSessionGitHubState(sessionKey, result.gitHubState);
				}
				if (result.kind === 'failed') {
					this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to reconcile artifact pull requests for ${sessionKey}`, result.error);
				}
			} catch (error) {
				this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to reconcile artifact pull requests for ${sessionKey}`, error);
			}
			return;
		}
		this._pullRequestAssociationResolver.removeSession(sessionKey);
		if (!branchName || (branchName === gitState?.baseBranchName)) {
			return;
		}

		// A pull request is always tied to a branch: only stop looking once we
		// know a pull request for the branch that is currently checked out.
		// State persisted before pull requests were tracked per branch records
		// no branch, so its pull request is verified against the current branch
		// rather than assumed to belong to it.
		if (gitHubState.pullRequestBranchName === branchName) {
			return;
		}

		try {
			const authToken = this._getGitHubAuthToken();
			if (!authToken) {
				return;
			}

			const pr = await this._pullRequestAssociationResolver.resolveForCheckout(state, gitHubState.owner, gitHubState.repo, gitState, branchName, authToken);
			const currentBranchName = readSessionGitState(this._stateManager.getSessionState(sessionKey)?._meta)?.branchName;
			if (currentBranchName !== branchName) {
				return;
			}

			const currentState = this._stateManager.getSessionState(sessionKey);
			if (!currentState) {
				return;
			}
			const currentGitHubState = readSessionGitHubState(currentState._meta);
			if (!pr?.url) {
				if (this._isFolderSession(currentState, currentGitHubState) && currentGitHubState?.initialPullRequestUrls === undefined) {
					await this.setSessionGitHubState(sessionKey, withInitialSessionPullRequest(currentGitHubState));
				}
				this._logService.trace(`[AgentHostGitStateService][attachSessionGitHubPullRequest] No pull request found for ${sessionKey} on branch ${branchName}`);
				return;
			}

			let nextGitHubState = withMostRecentSessionPullRequest(currentGitHubState, pr.url, branchName);
			if (this._shouldAddToFolderBaseline(sessionKey, currentState, currentGitHubState, pr)) {
				nextGitHubState = {
					...nextGitHubState,
					...withInitialSessionPullRequest(currentGitHubState, pr.url),
				};
			} else if (this._isFolderSession(currentState, currentGitHubState) && currentGitHubState?.initialPullRequestUrls === undefined) {
				nextGitHubState = {
					...nextGitHubState,
					...withInitialSessionPullRequest(currentGitHubState),
				};
			}
			await this.setSessionGitHubState(sessionKey, nextGitHubState);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to find pull request for ${sessionKey}`, error);
		}
	}

	private _isAutomaticPullRequestAttachmentEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoAttachPullRequestsConfigKey) !== false;
	}

	private _getGitHubAuthToken(): string | undefined {
		const repoResource = this._gitHubEndpointService.getRepoResource();
		return this._authenticationService.getAuthToken({
			resource: repoResource.resource,
			scopes: repoResource.scopes_supported,
		});
	}

	private _shouldAddToFolderBaseline(sessionKey: string, state: ISessionWithDefaultChat, gitHubState: ISessionGitHubState | undefined, pullRequest: CreatedPullRequest): boolean {
		if (!this._isFolderSession(state, gitHubState) || getSessionRelatedPullRequestUrls(gitHubState).some(url => url.toLowerCase() === pullRequest.url.toLowerCase())) {
			return false;
		}
		if (pullRequest.createdAt !== undefined) {
			const sessionStart = Date.parse(this._stateManager.getSessionSummary(sessionKey)?.createdAt ?? '');
			return Number.isNaN(sessionStart) || pullRequest.createdAt < sessionStart - PULL_REQUEST_CREATION_CLOCK_SKEW_MS;
		}
		return gitHubState?.initialPullRequestUrls === undefined;
	}

	private _isFolderSession(state: ISessionWithDefaultChat, gitHubState: ISessionGitHubState | undefined): boolean {
		return state.config?.values[SessionConfigKey.Isolation] === 'folder'
			|| gitHubState?.initialPullRequestUrls !== undefined;
	}

	async refreshSessionGitState(sessionKey: string, workingDirectory: URI | undefined): Promise<void> {
		const sessionState = this._stateManager.getSessionState(sessionKey);
		if (sessionState?.lifecycle === SessionLifecycle.Failed) {
			return;
		}

		if (!workingDirectory) {
			const workingDirectoryStr = sessionState?.workingDirectories?.[0];
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

				const baseBranchName = await this.resolveSessionBaseBranchName(sessionKey);
				const gitState = await this._gitService.getSessionGitState(workingDirectory, baseBranchName);
				if (gitState) {
					const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
					const previousGitState = readSessionGitState(currentMeta);
					const gitStateChanged = !objectEquals(previousGitState, gitState);
					if (gitStateChanged) {
						// Update the session's git state
						await this._setSessionGitState(sessionKey, gitState);
					}

					if (gitState.githubOwner && gitState.githubRepo) {
						const currentGitHubState = readSessionGitHubState(currentMeta);
						if (currentGitHubState?.owner !== gitState.githubOwner || currentGitHubState.repo !== gitState.githubRepo) {
							await this.setSessionGitHubState(sessionKey, {
								owner: gitState.githubOwner,
								repo: gitState.githubRepo
							} satisfies ISessionGitHubState);
						}

						// The working copy switched to a different branch:
						// look for a pull request that belongs to the new
						// branch. The previously known pull request keeps
						// being reported until a new one is found. Awaited
						// so the refresh event below carries the pull
						// request of the new branch rather than stale
						// GitHub state.
						if (gitStateChanged && previousGitState?.branchName !== gitState.branchName) {
							await this._queuePullRequestLookup(sessionKey);
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
		await this._applySessionGitHubState(sessionKey, currentMeta, currentState, nextState);
	}

	private async _replaceSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const currentState = readSessionGitHubState(currentMeta);
		await this._applySessionGitHubState(sessionKey, currentMeta, currentState, state);
	}

	private async _applySessionGitHubState(sessionKey: string, currentMeta: SessionSummaryMeta | undefined, currentState: ISessionGitHubState | undefined, state: ISessionGitHubState): Promise<void> {
		let nextState = state;
		const currentPullRequest = getSessionRelatedPullRequestUrls(currentState)[0];
		const nextPullRequest = getSessionRelatedPullRequestUrls(nextState)[0];
		const nextPullRequestStateApplies = nextState.pullRequestStateUrl !== undefined
			&& nextPullRequest !== undefined
			&& getSessionPullRequestUrlKey(nextState.pullRequestStateUrl) === getSessionPullRequestUrlKey(nextPullRequest);
		if ((currentPullRequest !== nextPullRequest && state.pullRequestStateUrl === undefined)
			|| (nextState.pullRequestStateUrl !== undefined && !nextPullRequestStateApplies)) {
			const { pullRequestState: _ignoredState, pullRequestStateUrl: _ignoredStateUrl, ...stateWithoutPullRequestStatus } = nextState;
			nextState = stateWithoutPullRequestStatus;
		}
		const currentSourceControlState = readSessionSourceControlState(currentMeta);
		const nextSourceControlState = nextPullRequest && nextPullRequest !== currentPullRequest
			? { ...currentSourceControlState, latestOutcome: SessionSourceControlOutcome.PullRequest } satisfies ISessionSourceControlState
			: currentSourceControlState;
		const sourceControlStateChanged = !objectEquals(currentSourceControlState, nextSourceControlState);

		if (objectEquals(currentState, nextState) && !sourceControlStateChanged) {
			await this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
			return;
		}

		// Update session state manager
		const nextMeta = withSessionSourceControlState(withSessionGitHubState(currentMeta, nextState), nextSourceControlState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);
		this._onDidChangeSessionGitHubState.fire(sessionKey);

		// Update session database
		await this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
		if (sourceControlStateChanged && nextSourceControlState) {
			await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextSourceControlState));
		}
	}

	async resolveSessionBaseBranchName(sessionKey: string): Promise<string | undefined> {
		const state = this._stateManager.getSessionState(sessionKey);
		const configValues = state?.config?.values;
		const configuredBranch = configValues?.[SessionConfigKey.Isolation] === 'worktree'
			&& configValues[SessionConfigKey.WorktreeCreateNewBranch] !== false
			? configValues[SessionConfigKey.Branch]
			: undefined;
		if (typeof configuredBranch === 'string' && configuredBranch.trim()) {
			return resolveDiffBaseBranchName(configuredBranch.trim(), undefined);
		}

		const gitStateBaseBranch = readSessionGitState(state?._meta)?.baseBranchName;
		const workingDirectory = state?.workingDirectories?.[0];
		const project = state?.project?.uri;
		if (!workingDirectory || !project || isEqual(URI.parse(workingDirectory), URI.parse(project))) {
			return gitStateBaseBranch;
		}
		let databaseRef;
		try {
			databaseRef = await this._sessionDataService.tryOpenDatabase(URI.parse(sessionKey));
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService] Failed to open session database while resolving the base branch for ${sessionKey}`, error);
			return gitStateBaseBranch;
		}
		if (!databaseRef) {
			return gitStateBaseBranch;
		}
		try {
			return resolveDiffBaseBranchName(await databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH), gitStateBaseBranch);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService] Failed to read the persisted base branch for ${sessionKey}`, error);
			return gitStateBaseBranch;
		} finally {
			databaseRef.dispose();
		}
	}

	async recordSessionMerge(sessionKey: string, commit: string): Promise<void> {
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const currentState = readSessionSourceControlState(currentMeta);
		const nextState: ISessionSourceControlState = {
			...currentState,
			merge: { commit },
			latestOutcome: SessionSourceControlOutcome.Merge,
		};
		if (objectEquals(currentState, nextState)) {
			await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextState));
			return;
		}

		this._stateManager.setSessionMeta(sessionKey, withSessionSourceControlState(currentMeta, nextState));
		await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextState));
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
