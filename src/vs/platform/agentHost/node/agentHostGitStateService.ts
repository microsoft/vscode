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
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentHostGitHubApiError, IAgentHostOctoKitService, type CreatedPullRequest } from './shared/agentHostOctoKitService.js';
import { IAgentService } from '../common/agentService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { SequencerByKey, ThrottlerByKey, timeout } from '../../../base/common/async.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { AuthRequiredReason } from '../common/state/sessionActions.js';

const PULL_REQUEST_LOOKUP_MAX_ATTEMPTS = 3;
const PULL_REQUEST_LOOKUP_RETRY_BASE_DELAY_MS = 1_000;
const PULL_REQUEST_LOOKUP_RETRY_MAX_DELAY_MS = 30_000;

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === 'AbortError';
}

interface IPullRequestEndpointSnapshot {
	readonly resource: string;
	readonly apiBaseUri: string;
}

class PullRequestEndpointChangedError extends Error { }

export class AgentHostGitStateService extends Disposable implements IAgentHostGitStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRefreshSessionGitState = this._register(new Emitter<string>());
	readonly onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;

	private readonly _gitStateRefreshThrottler = this._register(new ThrottlerByKey<string>());
	private readonly _gitStateRefreshCancellationTokenSource = new CancellationTokenSource();
	private readonly _pullRequestLookupSequencer = new SequencerByKey<string>();
	private readonly _rejectedAuthTokens = new Map<string, Set<string>>();
	private readonly _pendingPullRequestSessions = new Map<string, Set<string>>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostOctoKitService private readonly _octoKitService: IAgentHostOctoKitService,
		@IAgentService private readonly _agentService: IAgentService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
	) {
		super();

		this._register(toDisposable(() => this._gitStateRefreshCancellationTokenSource.dispose(true)));
		this._register(this._gitHubEndpointService.onDidChange(() => this._handleGitHubEndpointChanged()));
		this._register(this._stateManager.onDidEmitNotification(notification => {
			if (notification.type === 'root/sessionRemoved') {
				for (const resource of this._pendingPullRequestSessions.keys()) {
					this._removePendingPullRequestSession(resource, notification.session);
				}
			}
		}));
	}

	async attachSessionGitHubPullRequest(sessionKey: string): Promise<void> {
		const queuedResource = this._gitHubEndpointService.getRepoResource().resource;
		await this._pullRequestLookupSequencer.queue(queuedResource, async () => {
			const repoResource = this._gitHubEndpointService.getRepoResource();
			const endpoint: IPullRequestEndpointSnapshot = {
				resource: repoResource.resource,
				apiBaseUri: this._gitHubEndpointService.getApiBaseUri(),
			};
			if (endpoint.resource !== queuedResource) {
				this._retryOrPendForCurrentEndpoint(sessionKey);
				return;
			}
			const state = this._stateManager.getSessionState(sessionKey);
			if (!state || state.lifecycle !== SessionLifecycle.Ready) {
				return;
			}

			const gitHubState = readSessionGitHubState(state._meta);
			if (!gitHubState?.owner || !gitHubState.repo || gitHubState.pullRequestUrl) {
				return;
			}

			const gitState = readSessionGitState(state._meta);
			if (!gitState?.branchName || gitState.branchName === gitState.baseBranchName) {
				return;
			}

			const authToken = this._agentService.getAuthToken({
				resource: repoResource.resource,
				scopes: repoResource.scopes_supported,
			});
			if (!authToken) {
				return;
			}
			if (this._rejectedAuthTokens.get(repoResource.resource)?.has(authToken)) {
				this._addPendingPullRequestSession(repoResource.resource, sessionKey);
				return;
			}

			try {
				const pr = await this._findPullRequestWithRetry(
					gitHubState.owner,
					gitHubState.repo,
					gitState.branchName,
					authToken,
					endpoint,
				);
				if (!pr?.url) {
					return;
				}

				await this.setSessionGitHubState(sessionKey, {
					owner: gitHubState.owner,
					repo: gitHubState.repo,
					pullRequestUrl: pr.url
				} satisfies ISessionGitHubState);
				this._removePendingPullRequestSession(repoResource.resource, sessionKey);
			} catch (error) {
				if (error instanceof AgentHostGitHubApiError && error.statusCode === 401) {
					if (!this.rejectAuthenticationToken(sessionKey, repoResource.resource, authToken)) {
						void this.attachSessionGitHubPullRequest(sessionKey);
					}
					return;
				}
				if (error instanceof PullRequestEndpointChangedError) {
					this._removePendingPullRequestSession(endpoint.resource, sessionKey);
					this._retryOrPendForCurrentEndpoint(sessionKey);
					return;
				}
				if (!isCancellationError(error) && !isAbortError(error)) {
					this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to find pull request for ${sessionKey}`, error);
				}
			}
		});
	}

	async handleAuthenticationTokenUpdated(resource: string): Promise<void> {
		if (resource !== this._gitHubEndpointService.getRepoResource().resource) {
			return;
		}
		const pendingSessions = this._pendingPullRequestSessions.get(resource);
		if (!pendingSessions) {
			return;
		}
		this._pendingPullRequestSessions.delete(resource);
		for (const sessionKey of pendingSessions) {
			if (this._stateManager.getSessionState(sessionKey)) {
				await this.attachSessionGitHubPullRequest(sessionKey);
			}
		}
	}

	isAuthenticationTokenRejected(resource: string, token: string): boolean {
		return resource === this._gitHubEndpointService.getRepoResource().resource
			&& this._rejectedAuthTokens.get(resource)?.has(token) === true;
	}

	rejectAuthenticationToken(sessionKey: string, resource: string, token: string): boolean {
		const repoResource = this._gitHubEndpointService.getRepoResource();
		if (resource !== repoResource.resource) {
			return false;
		}
		const currentToken = this._agentService.getAuthToken({
			resource: repoResource.resource,
			scopes: repoResource.scopes_supported,
		});
		if (currentToken && currentToken !== token) {
			return false;
		}
		let rejectedTokens = this._rejectedAuthTokens.get(resource);
		if (!rejectedTokens) {
			rejectedTokens = new Set();
			this._rejectedAuthTokens.set(resource, rejectedTokens);
		}
		rejectedTokens.add(token);
		this._addPendingPullRequestSession(resource, sessionKey);
		this._stateManager.emitAuthRequired({
			resource,
			reason: AuthRequiredReason.Expired,
		});
		return true;
	}

	async refreshSessionGitState(sessionKey: string, workingDirectory: URI | undefined): Promise<void> {
		const sessionState = this._stateManager.getSessionState(sessionKey);
		if (sessionState?.lifecycle === SessionLifecycle.CreationFailed) {
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

	private async _findPullRequestWithRetry(owner: string, repo: string, branch: string, authToken: string, endpoint: IPullRequestEndpointSnapshot): Promise<CreatedPullRequest | undefined> {
		const controller = new AbortController();
		const cancellationListener = this._gitStateRefreshCancellationTokenSource.token.onCancellationRequested(() => controller.abort());
		try {
			for (let attempt = 0; attempt < PULL_REQUEST_LOOKUP_MAX_ATTEMPTS; attempt++) {
				try {
					this._throwIfEndpointChanged(endpoint);
					const result = await this._octoKitService.findPullRequestByHeadBranch(
						owner,
						repo,
						branch,
						authToken,
						controller.signal,
						endpoint.apiBaseUri,
					);
					this._throwIfEndpointChanged(endpoint);
					return result;
				} catch (error) {
					this._throwIfEndpointChanged(endpoint);
					const isLastAttempt = attempt + 1 === PULL_REQUEST_LOOKUP_MAX_ATTEMPTS;
					if (isLastAttempt || !this._isRetryablePullRequestLookupError(error)) {
						throw error;
					}
					const delay = Math.min(
						error.retryAfterMs ?? this._pullRequestLookupRetryDelay(attempt),
						PULL_REQUEST_LOOKUP_RETRY_MAX_DELAY_MS,
					);
					this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Pull request lookup failed (attempt ${attempt + 1}), retrying in ${delay}ms`, error);
					await timeout(delay, this._gitStateRefreshCancellationTokenSource.token);
				}
			}

			return undefined;
		} finally {
			cancellationListener.dispose();
		}
	}

	private _throwIfEndpointChanged(endpoint: IPullRequestEndpointSnapshot): void {
		if (
			this._gitHubEndpointService.getRepoResource().resource !== endpoint.resource
			|| this._gitHubEndpointService.getApiBaseUri() !== endpoint.apiBaseUri
		) {
			throw new PullRequestEndpointChangedError();
		}
	}

	private _isRetryablePullRequestLookupError(error: unknown): error is AgentHostGitHubApiError {
		if (!(error instanceof AgentHostGitHubApiError)) {
			return false;
		}
		return error.statusCode === undefined
			|| error.statusCode === 408
			|| error.statusCode === 429
			|| (error.statusCode === 403 && error.retryAfterMs !== undefined)
			|| error.statusCode >= 500;
	}

	private _handleGitHubEndpointChanged(): void {
		const sessionKeys = new Set<string>();
		for (const pendingSessions of this._pendingPullRequestSessions.values()) {
			for (const sessionKey of pendingSessions) {
				if (this._stateManager.getSessionState(sessionKey)) {
					sessionKeys.add(sessionKey);
				}
			}
		}
		this._pendingPullRequestSessions.clear();
		this._rejectedAuthTokens.clear();
		for (const sessionKey of sessionKeys) {
			this._retryOrPendForCurrentEndpoint(sessionKey);
		}
	}

	private _retryOrPendForCurrentEndpoint(sessionKey: string): void {
		const resource = this._gitHubEndpointService.getRepoResource();
		const token = this._agentService.getAuthToken({
			resource: resource.resource,
			scopes: resource.scopes_supported,
		});
		if (token && !this.isAuthenticationTokenRejected(resource.resource, token)) {
			void this.attachSessionGitHubPullRequest(sessionKey);
		} else {
			this._addPendingPullRequestSession(resource.resource, sessionKey);
		}
	}

	protected _pullRequestLookupRetryDelay(attempt: number): number {
		const exponentialDelay = Math.min(
			PULL_REQUEST_LOOKUP_RETRY_MAX_DELAY_MS,
			PULL_REQUEST_LOOKUP_RETRY_BASE_DELAY_MS * 2 ** attempt,
		);
		return Math.round(exponentialDelay / 2 + Math.random() * exponentialDelay / 2);
	}

	private _addPendingPullRequestSession(resource: string, sessionKey: string): void {
		if (!this._stateManager.getSessionState(sessionKey)) {
			return;
		}
		let sessions = this._pendingPullRequestSessions.get(resource);
		if (!sessions) {
			sessions = new Set();
			this._pendingPullRequestSessions.set(resource, sessions);
		}
		sessions.add(sessionKey);
	}

	private _removePendingPullRequestSession(resource: string, sessionKey: string): void {
		const sessions = this._pendingPullRequestSessions.get(resource);
		sessions?.delete(sessionKey);
		if (sessions?.size === 0) {
			this._pendingPullRequestSessions.delete(resource);
		}
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
