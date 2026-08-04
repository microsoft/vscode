/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { derivePullRequestState } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IChatSessionWorktreeService } from '../common/chatSessionWorktreeService';

const PR_DETECTION_RETRY_COUNT = 5;
const PR_DETECTION_INITIAL_DELAY_MS = 2_000;

export interface IPullRequestDetectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when a pull request is detected or updated for a session.
	 * Consumers should refresh the session UI in response.
	 */
	readonly onDidDetectPullRequest: Event<string>;

	/**
	 * Detects a pull request for a session when the user opens it.
	 * If a PR is found, persists the URL and notifies the UI.
	 */
	detectPullRequest(sessionId: string): void;

	/**
	 * Called after a request completes to persist PR metadata on the session.
	 * If a PR URL is provided, uses that; otherwise attempts detection
	 * via the GitHub API with exponential-backoff retry.
	 */
	handlePullRequestCreated(sessionId: string, createdPullRequestUrl: string | undefined): void;
}
export const IPullRequestDetectionService = createServiceIdentifier<IPullRequestDetectionService>('IPullRequestDetectionService');

/**
 * Queries the GitHub API to find a pull request whose head branch matches the
 * given worktree branch. This covers cases where the MCP tool failed to report
 * a PR URL, or the user created the PR externally (e.g., via github.com).
 */
async function detectPullRequestFromGitHubAPI(
	branchName: string,
	repositoryPath: string,
	gitService: IGitService,
	octoKitService: IOctoKitService,
	logService: ILogService,
): Promise<{ url: string; state: string } | undefined> {
	const repoContext = await gitService.getRepository(URI.file(repositoryPath));
	if (!repoContext) {
		logService.debug(`[detectPullRequestFromGitHubAPI] No git repository found for path: ${repositoryPath}`);
		return undefined;
	}

	const repoInfo = getGitHubRepoInfoFromContext(repoContext);
	if (!repoInfo) {
		logService.debug(`[detectPullRequestFromGitHubAPI] Could not extract GitHub repo info from repository at: ${repositoryPath}`);
		return undefined;
	}

	logService.debug(`[detectPullRequestFromGitHubAPI] Querying GitHub API for PR on ${repoInfo.id.org}/${repoInfo.id.repo}, branch=${branchName}`);

	const pr = await octoKitService.findPullRequestByHeadBranch(
		repoInfo.id.org,
		repoInfo.id.repo,
		branchName,
		{},
	);

	if (pr?.url) {
		const prState = derivePullRequestState(pr);
		logService.trace(`[detectPullRequestFromGitHubAPI] Detected pull request via GitHub API: ${pr.url} ${prState}`);
		return { url: pr.url, state: prState };
	}

	logService.debug(`[detectPullRequestFromGitHubAPI] No PR found for ${repoInfo.id.org}/${repoInfo.id.repo}, branch=${branchName}`);
	return undefined;
}

/**
 * Encapsulates all pull-request detection and persistence logic for chat sessions.
 */
export class PullRequestDetectionService extends Disposable implements IPullRequestDetectionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidDetectPullRequest = this._register(new Emitter<string>());
	readonly onDidDetectPullRequest: Event<string> = this._onDidDetectPullRequest.event;

	constructor(
		@IChatSessionWorktreeService private readonly chatSessionWorktreeService: IChatSessionWorktreeService,
		@IGitService private readonly gitService: IGitService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Detects a pull request for a session when the user opens it.
	 * If a PR is found, persists the URL and notifies the UI.
	 */
	detectPullRequest(sessionId: string): void {
		this.doDetectPullRequestOnSessionOpen(sessionId).catch(ex =>
			this.logService.error(ex instanceof Error ? ex : new Error(String(ex)), `Failed to detect pull request on session open for ${sessionId}`));
	}

	private async doDetectPullRequestOnSessionOpen(sessionId: string): Promise<void> {
		const worktreeProperties = await this.chatSessionWorktreeService.getWorktreeProperties(sessionId);
		if (worktreeProperties?.version !== 2
			|| worktreeProperties.pullRequestState === 'merged'
			|| !worktreeProperties.branchName
			|| !worktreeProperties.repositoryPath) {
			this.logService.debug(`[PullRequestDetectionService] Skipping PR detection on session open for ${sessionId}: version=${worktreeProperties?.version}, prState=${worktreeProperties?.version === 2 ? worktreeProperties.pullRequestState : 'n/a'}, branch=${!!worktreeProperties?.branchName}, repoPath=${!!worktreeProperties?.repositoryPath}`);
			return;
		}

		this.logService.debug(`[PullRequestDetectionService] Detecting PR on session open for ${sessionId}, branch=${worktreeProperties.branchName}, existingPrUrl=${worktreeProperties.pullRequestUrl ?? 'none'}`);

		const prResult = await this.detectPullRequestForSession(sessionId);

		if (prResult) {
			// Re-read to get the latest information.
			const currentProperties = await this.chatSessionWorktreeService.getWorktreeProperties(sessionId);
			if (currentProperties?.version === 2
				&& (currentProperties.pullRequestUrl !== prResult.url || currentProperties.pullRequestState !== prResult.state)) {
				await this.chatSessionWorktreeService.setWorktreeProperties(sessionId, {
					...currentProperties,  // use fresh copy
					pullRequestUrl: prResult.url,
					pullRequestState: prResult.state,
					changes: undefined,
				});
				this._onDidDetectPullRequest.fire(sessionId);
			} else {
				this.logService.debug(`[PullRequestDetectionService] PR metadata unchanged for ${sessionId}, skipping update`);
			}
		} else {
			this.logService.debug(`[PullRequestDetectionService] No PR found via GitHub API for ${sessionId}`);
		}
	}

	/**
	 * Called after a request completes to persist PR metadata on the session.
	 * If the session reported a PR URL, uses that; otherwise attempts detection
	 * via the GitHub API with exponential-backoff retry.
	 * Fires {@link onDidDetectPullRequest} if a PR is detected and persisted.
	 */
	handlePullRequestCreated(sessionId: string, createdPullRequestUrl: string | undefined): void {
		this.doHandlePullRequestCreated(sessionId, createdPullRequestUrl).catch(ex =>
			this.logService.error(ex instanceof Error ? ex : new Error(String(ex)), `Failed to handle pull request creation for session ${sessionId}`));
	}

	private async doHandlePullRequestCreated(sessionId: string, createdPullRequestUrl: string | undefined): Promise<void> {
		let prUrl = createdPullRequestUrl;
		let prState = '';

		this.logService.debug(`[PullRequestDetectionService] handlePullRequestCreated for ${sessionId}: createdPullRequestUrl=${prUrl ?? 'none'}`);

		const worktreeProperties = await this.chatSessionWorktreeService.getWorktreeProperties(sessionId);
		if (!worktreeProperties || worktreeProperties.version !== 2) {
			return;
		}

		if (!prUrl) {
			if (worktreeProperties.branchName && worktreeProperties.repositoryPath) {
				this.logService.debug(`[PullRequestDetectionService] No PR URL from session, attempting retry detection for ${sessionId}, branch=${worktreeProperties.branchName}`);
				const prResult = await this.detectPullRequestWithRetry(sessionId);
				prUrl = prResult?.url;
				prState = prResult?.state ?? (prResult?.url ? 'open' : '');
			} else {
				this.logService.debug(`[PullRequestDetectionService] Skipping retry detection for ${sessionId}: branch=${worktreeProperties.branchName ?? 'none'}, repoPath=${!!worktreeProperties.repositoryPath}`);
			}
		}

		if (!prUrl) {
			this.logService.debug(`[PullRequestDetectionService] No PR detected for ${sessionId} after all attempts`);
			return;
		}

		try {
			await this.chatSessionWorktreeService.setWorktreeProperties(sessionId, {
				...worktreeProperties,
				pullRequestUrl: prUrl,
				pullRequestState: prState,
				changes: undefined,
			});
			this._onDidDetectPullRequest.fire(sessionId);
		} catch (error) {
			this.logService.error(error instanceof Error ? error : new Error(String(error)), `Failed to persist pull request metadata for session ${sessionId}`);
		}
	}

	/**
	 * Attempts to detect a pull request for a freshly-completed session using
	 * exponential backoff. The GitHub API may not have indexed the PR immediately
	 * after `gh pr create` returns, so we retry with increasing delays:
	 * attempt 1: 2s, attempt 2: 4s, attempt 3: 8s, ...
	 */
	private async detectPullRequestWithRetry(sessionId: string): Promise<{ url: string; state: string } | undefined> {
		for (let attempt = 0; attempt < PR_DETECTION_RETRY_COUNT; attempt++) {
			const delay = PR_DETECTION_INITIAL_DELAY_MS * Math.pow(2, attempt);
			this.logService.debug(`[PullRequestDetectionService] PR detection retry for ${sessionId}: attempt ${attempt + 1}/${PR_DETECTION_RETRY_COUNT}, waiting ${delay}ms`);
			await new Promise<void>(resolve => setTimeout(resolve, delay));

			const prResult = await this.detectPullRequestForSession(sessionId);
			if (prResult) {
				this.logService.debug(`[PullRequestDetectionService] PR detected on attempt ${attempt + 1} for ${sessionId}: url=${prResult.url}, state=${prResult.state}`);
				return prResult;
			}
		}

		this.logService.debug(`[PullRequestDetectionService] PR detection exhausted all ${PR_DETECTION_RETRY_COUNT} retries for ${sessionId}`);
		return undefined;
	}

	/**
	 * Queries the GitHub API to find a pull request whose head branch matches the
	 * session's worktree branch.
	 */
	private async detectPullRequestForSession(sessionId: string): Promise<{ url: string; state: string } | undefined> {
		try {
			const worktreeProperties = await this.chatSessionWorktreeService.getWorktreeProperties(sessionId);
			if (!worktreeProperties?.branchName || !worktreeProperties.repositoryPath) {
				this.logService.debug(`[PullRequestDetectionService] detectPullRequestForSession: missing worktree info for ${sessionId}, branch=${worktreeProperties?.branchName ?? 'none'}, repoPath=${!!worktreeProperties?.repositoryPath}`);
				return undefined;
			}

			return await detectPullRequestFromGitHubAPI(
				worktreeProperties.branchName,
				worktreeProperties.repositoryPath,
				this.gitService,
				this.octoKitService,
				this.logService,
			);
		} catch (error) {
			this.logService.debug(`[PullRequestDetectionService] Failed to detect pull request via GitHub API: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}
}
