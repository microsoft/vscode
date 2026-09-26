/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals as objectEquals } from '../../../base/common/objects.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Emitter } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitStateService, META_GIT_DATA_STATE, META_GIT_STATE, META_GITHUB_DATA_STATE, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { AgentHostAutoAttachPullRequestsConfigKey, platformRootSchema } from '../common/agentHostSchema.js';
import { AgentHostAutoAttachPullRequestsSettingId } from '../common/agentService.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../common/copilotCliConfig.js';
import { logSettingExperimentTrigger } from '../../telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { getSessionPullRequestUrlKey, getSessionRelatedPullRequestUrls, isAhpChatChannel, isDefaultChatUri, ISessionGitHubState, ISessionWithDefaultChat, readFolderGitHubState, readFolderScopeGitState, readSessionGitData, readSessionGitHubData, readSessionGitState, readSessionSourceControlState, SessionLifecycle, SessionSourceControlOutcome, withInitialSessionPullRequest, withMostRecentSessionPullRequest, withFolderGitHubState, withFolderScopeGitState, withSessionGitState, withSessionSourceControlState, type ISessionGitState, type ISessionSourceControlState, type SessionSummaryMeta } from '../common/state/sessionState.js';
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
import { resolveBranchChangesetScopeForSource, resolveGitHubStateFolder, type IGitHubStateFolder } from './agentHostBranchChangesetScope.js';
import { getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';

const PULL_REQUEST_CREATION_CLOCK_SKEW_MS = 5 * 60_000;

export class AgentHostGitStateService extends Disposable implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;

	private readonly _onDidChangeSessionGitHubState = this._register(new Emitter<string>());
	readonly onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;

	private readonly _gitStateRefreshThrottler = this._register(new ThrottlerByKey<string>());
	private readonly _gitStateRefreshCancellationTokenSource = new CancellationTokenSource();
	private readonly _gitStateSaves = new SequencerByKey<string>();

	/**
	 * Serializes pull request lookups per session so overlapping triggers (turn
	 * completion, session restore, a refresh observing a branch change) issue at
	 * most one GitHub request at a time and observe each other's writes.
	 */
	private readonly _pullRequestSequencer = new SequencerByKey<string>();
	/** Serializes GitHub state saves per session so the persisted folder map is never older than a previous save. */
	private readonly _gitHubStateSaves = new SequencerByKey<string>();
	private readonly _pullRequestAssociationResolver: AgentHostPullRequestAssociationResolver;
	/** Set while a lookup reached the auto-attach experiment's divergence before the assignment context arrived. */
	private _autoAttachExperimentTriggerPending = false;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._pullRequestAssociationResolver = this._register(new AgentHostPullRequestAssociationResolver(this._gitService, this._octoKitService));
		this._register(toDisposable(() => this._gitStateRefreshCancellationTokenSource.dispose(true)));
		this._register(this._stateManager.onDidRemoveSession(sessionKey => {
			this._pullRequestAssociationResolver.removeSession(sessionKey);
		}));

		let automaticPullRequestAttachmentEnabled = this._isAutomaticPullRequestAttachmentEnabled();
		this._register(this._configurationService.onDidRootConfigChange(() => {
			if (this._autoAttachExperimentTriggerPending) {
				// Deferred so that the listener installing the forwarded assignment context on telemetry runs first.
				queueMicrotask(() => {
					if (this._autoAttachExperimentTriggerPending && !this._store.isDisposed) {
						this._reportAutoAttachExperimentTrigger();
					}
				});
			}
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
		if (isAhpChatChannel(sessionKey) && !isDefaultChatUri(sessionKey)) {
			const folder = resolveGitHubStateFolder(this._stateManager, sessionKey);
			if (folder.folderKey !== undefined) {
				await this._queueFolderPullRequestLookup(folder);
				return;
			}
		}
		const sessionUri = isAhpChatChannel(sessionKey) ? resolveGitHubStateFolder(this._stateManager, sessionKey).sessionUri : sessionKey;
		await this._queuePullRequestLookup(sessionUri);
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
		const gitHubState = this.getGitHubState(sessionKey);
		if (!gitHubState?.owner || !gitHubState?.repo) {
			return;
		}

		// Git state
		const gitState = readSessionGitState(state._meta);
		const branchName = gitState?.branchName;

		// Automatic association looks up the pull request of a branch other than the base, while
		// restricted association also drops pull requests that are not artifacts or explicitly associated.
		if ((branchName && branchName !== gitState?.baseBranchName) || this._pullRequestAssociationResolver.wouldRestrictPullRequests(state._meta, gitHubState)) {
			this._reportAutoAttachExperimentTrigger();
		}

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
			const currentGitHubState = this.getGitHubState(sessionKey);
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

	/** Queues a pull request lookup for a folder other than the session folder. */
	private _queueFolderPullRequestLookup(folder: IGitHubStateFolder): Promise<void> {
		return this._pullRequestSequencer.queue(`${folder.sessionUri}#${folder.folderKey}`, () => this._attachFolderGitHubPullRequest(folder));
	}

	/**
	 * Associates the pull request of the current branch of a folder other than
	 * the session folder. Restricted mode reconciles only the session folder;
	 * other folders rely on the pull requests created from them.
	 */
	private async _attachFolderGitHubPullRequest(folder: IGitHubStateFolder): Promise<void> {
		const state = this._stateManager.getSessionState(folder.sessionUri);
		if (state?.lifecycle !== SessionLifecycle.Ready) {
			return;
		}
		const gitHubState = this.getGitHubState(folder.sourceUri);
		const gitState = this.getSessionGitState(folder.sourceUri);
		const branchName = gitState?.branchName;
		if (!gitHubState?.owner || !gitHubState.repo || !branchName || branchName === gitState?.baseBranchName) {
			return;
		}
		this._reportAutoAttachExperimentTrigger();
		if (!this._isAutomaticPullRequestAttachmentEnabled() || gitHubState.pullRequestBranchName === branchName) {
			return;
		}

		try {
			const authToken = this._getGitHubAuthToken();
			if (!authToken) {
				return;
			}
			const workingDirectory = folder.workingDirectory;
			const pr = await this._pullRequestAssociationResolver.resolveForCheckout(state, gitHubState.owner, gitHubState.repo, gitState, branchName, authToken, undefined, workingDirectory);
			if (!pr?.url || this.getSessionGitState(folder.sourceUri)?.branchName !== branchName) {
				return;
			}
			const currentGitHubState = this.getGitHubState(folder.sourceUri);
			let nextGitHubState = withMostRecentSessionPullRequest(currentGitHubState, pr.url, branchName);
			// Other folders are user-selected existing checkouts rather than
			// newly-created isolated worktrees, so they intentionally baseline
			// pre-existing pull requests like folder-isolated session folders.
			if (this._predatesSession(folder.sessionUri, pr)) {
				nextGitHubState = { ...nextGitHubState, ...withInitialSessionPullRequest(currentGitHubState, pr.url) };
			}
			await this.setSessionGitHubState(folder.sourceUri, nextGitHubState);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][attachFolderGitHubPullRequest] Failed to find pull request for ${folder.sourceUri}`, error);
		}
	}

	/** Whether a pull request was created before the session started, so the session inherited it. */
	private _predatesSession(sessionKey: string, pullRequest: CreatedPullRequest): boolean {
		if (pullRequest.createdAt === undefined) {
			return false;
		}
		const sessionStart = Date.parse(this._stateManager.getSessionSummary(sessionKey)?.createdAt ?? '');
		return !Number.isNaN(sessionStart) && pullRequest.createdAt < sessionStart - PULL_REQUEST_CREATION_CLOCK_SKEW_MS;
	}

	private _isAutomaticPullRequestAttachmentEnabled(): boolean {
		return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoAttachPullRequestsConfigKey) !== false;
	}

	/**
	 * Reports where automatic and restricted pull request association diverge. Agent host
	 * telemetry only carries the assignment context that ExP attributes the event by once the
	 * workbench has forwarded it, so until then the trigger stays pending.
	 */
	private _reportAutoAttachExperimentTrigger(): void {
		this._autoAttachExperimentTriggerPending = typeof this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeAssignmentContextKey] !== 'string';
		if (!this._autoAttachExperimentTriggerPending) {
			logSettingExperimentTrigger(this._telemetryService, AgentHostAutoAttachPullRequestsSettingId);
		}
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
		const initialPrimaryWorkingDirectory = sessionState?.workingDirectories?.[0];

		if (!workingDirectory) {
			const workingDirectoryStr = sessionState?.workingDirectories?.[0];
			if (workingDirectoryStr) {
				workingDirectory = URI.parse(workingDirectoryStr);
			}
		}

		if (!workingDirectory) {
			if (isAhpChatChannel(sessionKey) && this.getSessionGitState(sessionKey)) {
				await this._setChatGitState(sessionKey, undefined);
				this._onDidRefreshSessionGitState.fire(sessionKey);
			}
			return;
		}

		await this._gitStateRefreshThrottler.queue(sessionKey, async () => {
			try {
				this._logService.trace(`[AgentHostGitStateService][refreshSessionGitState] Refreshing git state for ${sessionKey}, ${workingDirectory?.fsPath}`);

				const baseBranchName = await this.resolveSessionBaseBranchName(sessionKey);
				const gitState = await this._gitService.getSessionGitState(workingDirectory, baseBranchName);
				const currentState = this._stateManager.getSessionState(sessionKey);
				const currentWorkingDirectory = currentState?.workingDirectories?.[0];
				const primaryWorkingDirectoryChanged = initialPrimaryWorkingDirectory === undefined
					? currentWorkingDirectory !== undefined
					: currentWorkingDirectory === undefined || !isEqual(URI.parse(initialPrimaryWorkingDirectory), URI.parse(currentWorkingDirectory));
				if (primaryWorkingDirectoryChanged) {
					return;
				}
				// An `undefined` result is inconclusive: it is returned both when
				// Git could not be queried (e.g. `git status` timed out) and when
				// no repository was found. Keep the last known state so a
				// transient failure does not drop the Git-backed changesets from
				// the catalogue.
				if (gitState) {
					const previousGitState = this.getSessionGitState(sessionKey);
					const gitStateChanged = !objectEquals(previousGitState, gitState);
					if (gitStateChanged) {
						if (isAhpChatChannel(sessionKey)) {
							await this._setChatGitState(sessionKey, gitState);
						} else {
							await this._setSessionGitState(sessionKey, gitState);
						}
					}

					const folder = isAhpChatChannel(sessionKey) ? resolveGitHubStateFolder(this._stateManager, sessionKey) : undefined;
					// The session folder is refreshed and looked up through the session itself.
					if (folder && !folder.isSessionFolder && gitState.githubOwner && gitState.githubRepo) {
						const currentGitHubState = this.getGitHubState(sessionKey);
						if (currentGitHubState?.owner !== gitState.githubOwner || currentGitHubState.repo !== gitState.githubRepo) {
							await this.setSessionGitHubState(sessionKey, {
								owner: gitState.githubOwner,
								repo: gitState.githubRepo
							} satisfies ISessionGitHubState);
						}
						if (gitStateChanged && previousGitState?.branchName !== gitState.branchName) {
							await this._queueFolderPullRequestLookup(folder);
						}
					}

					if (!isAhpChatChannel(sessionKey) && gitState.githubOwner && gitState.githubRepo) {
						const currentGitHubState = this.getGitHubState(sessionKey);
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

	getSessionGitState(sessionKey: string): ISessionGitState | undefined {
		if (!isAhpChatChannel(sessionKey)) {
			return readSessionGitState(this._stateManager.getSessionState(sessionKey)?._meta);
		}
		const scope = resolveBranchChangesetScopeForSource(this._stateManager, sessionKey);
		const sessionState = this._stateManager.getSessionState(scope.sessionUri);
		if (isDefaultChatUri(sessionKey)) {
			return readSessionGitState(sessionState?._meta);
		}
		return readFolderScopeGitState(sessionState?._meta, getWorkingDirectoryScopeId(scope.workingDirectories))
			?? (resolveGitHubStateFolder(this._stateManager, sessionKey).isSessionFolder ? readSessionGitState(sessionState?._meta) : undefined);
	}

	getMaterializedWorktreeMeta(sessionKey: string, branchName: string): SessionSummaryMeta | undefined {
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const currentGitState = readSessionGitState(currentMeta);
		return withSessionGitState(currentMeta, {
			branchName,
			...(currentGitState?.hasGitRemote !== undefined ? { hasGitRemote: currentGitState.hasGitRemote } : {}),
			...(currentGitState?.hasGitHubRemote !== undefined ? { hasGitHubRemote: currentGitState.hasGitHubRemote } : {}),
			...(currentGitState?.baseBranchName !== undefined ? { baseBranchName: currentGitState.baseBranchName } : {}),
			...(currentGitState?.githubOwner !== undefined ? { githubOwner: currentGitState.githubOwner } : {}),
			...(currentGitState?.githubRepo !== undefined ? { githubRepo: currentGitState.githubRepo } : {}),
		});
	}

	getGitHubState(key: string): ISessionGitHubState | undefined {
		const folder = resolveGitHubStateFolder(this._stateManager, key);
		return readFolderGitHubState(this._stateManager.getSessionState(folder.sessionUri)?._meta, folder.folderKey);
	}

	async setSessionGitHubState(key: string, state: ISessionGitHubState): Promise<void> {
		const folder = resolveGitHubStateFolder(this._stateManager, key);
		if (this._isUnresolvedFolder(folder, key)) {
			return;
		}
		const currentMeta = this._stateManager.getSessionState(folder.sessionUri)?._meta;
		const currentState = readFolderGitHubState(currentMeta, folder.folderKey);
		const nextState = { ...(currentState ?? {}), ...state } satisfies ISessionGitHubState;
		await this._applySessionGitHubState(folder, currentMeta, currentState, nextState);
	}

	private async _replaceSessionGitHubState(sessionKey: string, state: ISessionGitHubState): Promise<void> {
		const folder = resolveGitHubStateFolder(this._stateManager, sessionKey);
		if (this._isUnresolvedFolder(folder, sessionKey)) {
			return;
		}
		const currentMeta = this._stateManager.getSessionState(folder.sessionUri)?._meta;
		const currentState = readFolderGitHubState(currentMeta, folder.folderKey);
		await this._applySessionGitHubState(folder, currentMeta, currentState, state);
	}

	/**
	 * A session without working directories, or a folder changeset owner that no
	 * longer matches any chat, has no folder to record state for.
	 */
	private _isUnresolvedFolder(folder: IGitHubStateFolder, key: string): boolean {
		if (folder.folderKey !== undefined) {
			return false;
		}
		if (folder.isSessionFolder) {
			this._logService.trace(`[AgentHostGitStateService] Skipping GitHub state update for ${key}: the session has no working directory`);
		} else {
			this._logService.warn(`[AgentHostGitStateService] Skipping GitHub state update for ${key}: its folder no longer matches any chat`);
		}
		return true;
	}

	private async _applySessionGitHubState(folder: IGitHubStateFolder, currentMeta: SessionSummaryMeta | undefined, currentState: ISessionGitHubState | undefined, state: ISessionGitHubState): Promise<void> {
		const sessionKey = folder.sessionUri;
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
			await this._saveGitHubState(folder);
			return;
		}

		// Update session state manager
		const nextMeta = withSessionSourceControlState(withFolderGitHubState(currentMeta, folder.folderKey, nextState, folder.workingDirectory), nextSourceControlState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);
		this._onDidChangeSessionGitHubState.fire(sessionKey);

		// Update session database
		await this._saveGitHubState(folder);
		if (sourceControlStateChanged && nextSourceControlState) {
			await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextSourceControlState));
		}
	}

	/**
	 * Persists the GitHub state of every folder of a session. Saves are
	 * serialized per session and read the live state, so concurrent updates to
	 * different folders are never lost.
	 */
	private _saveGitHubState(folder: IGitHubStateFolder): Promise<void> {
		return this._gitHubStateSaves.queue(folder.sessionUri, async () => {
			const meta = this._stateManager.getSessionState(folder.sessionUri)?._meta;
			await this._saveSessionState(folder.sessionUri, META_GITHUB_DATA_STATE, JSON.stringify(Object.fromEntries(readSessionGitHubData(meta))));
		});
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

		const gitStateBaseBranch = this.getSessionGitState(sessionKey)?.baseBranchName;
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

	private async _setSessionGitState(sessionKey: string, gitState: ISessionGitState | undefined): Promise<void> {
		// Update session state manager
		const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
		const nextMeta = withSessionGitState(currentMeta, gitState);
		this._stateManager.setSessionMeta(sessionKey, nextMeta);

		// Update session database
		if (gitState) {
			await this._saveSessionState(sessionKey, META_GIT_STATE, JSON.stringify(gitState));
		} else {
			await this._deleteSessionState(sessionKey, [META_GIT_STATE]);
		}
	}

	private async _setChatGitState(sessionKey: string, gitState: ISessionGitState | undefined): Promise<void> {
		const scope = resolveBranchChangesetScopeForSource(this._stateManager, sessionKey);
		if (isDefaultChatUri(sessionKey)) {
			await this._setSessionGitState(scope.sessionUri, gitState);
			return;
		}
		const scopeId = getWorkingDirectoryScopeId(scope.workingDirectories);
		const currentMeta = this._stateManager.getSessionState(scope.sessionUri)?._meta;
		this._stateManager.setSessionMeta(scope.sessionUri, withFolderScopeGitState(currentMeta, scopeId, gitState, scope.workingDirectories));
		await this._gitStateSaves.queue(scope.sessionUri, async () => {
			const gitData = readSessionGitData(this._stateManager.getSessionState(scope.sessionUri)?._meta);
			await this._saveSessionState(scope.sessionUri, META_GIT_DATA_STATE, JSON.stringify(Object.fromEntries(gitData)));
		});
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

	private async _deleteSessionState(sessionKey: string, keys: readonly string[]): Promise<void> {
		const state = this._stateManager.getSessionState(sessionKey);
		if (state?.lifecycle === SessionLifecycle.Creating) {
			return;
		}

		let databaseRef;
		try {
			databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionKey));
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_deleteSessionState] Failed to open session database for ${sessionKey}`, error);
			return;
		}

		try {
			await databaseRef.object.deleteMetadata(keys);
		} catch (error) {
			this._logService.warn(`[AgentHostGitStateService][_deleteSessionState] Failed to delete ${keys.join(', ')}`, error);
		} finally {
			databaseRef.dispose();
		}
	}
}
