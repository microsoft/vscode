/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RemoteAgentJobPayload } from '@vscode/copilot-api';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { AuthOptions, IOctoKitService, JobInfo, RemoteAgentJobResponse } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { GenAiMetrics } from '../../../platform/otel/common/genAiMetrics';
import { IOTelService } from '../../../platform/otel/common/otelService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import {
	CloudDelegationResult,
	CloudSessionContent,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
	PrCloudAgentBackend,
} from '../vscode/cloudAgentBackend';
import { body_suffix, formatBodyPlaceholder, JOBS_API_VERSION, SessionIdForPr } from '../vscode/copilotCodingAgentUtils';

const CLOUD_SESSIONS_AUTH_OPTIONS: AuthOptions = { createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } };

/**
 * Cloud agent backend backed by the legacy Jobs API. This is the default and is
 * behaviorally identical to the inline code that previously lived in
 * `CopilotCloudSessionsProvider`.
 */
export class JobsApiBackend implements PrCloudAgentBackend {

	readonly kind = 'pr' as const;

	constructor(
		private readonly _octoKitService: IOctoKitService,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _otelService: IOTelService,
	) { }

	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined {
		const parsed = SessionIdForPr.parse(resource);
		if (parsed) {
			return { type: 'pr', prNumber: parsed.prNumber, sessionIndex: parsed.sessionIndex };
		}
		return undefined;
	}

	getSessionInfo(sessionId: string): Promise<SessionInfo | undefined> {
		return this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
	}

	getSessionLogsSSE(sessionId: string): Promise<string> {
		return this._octoKitService.getSessionLogs(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
	}

	async fetchSessionList(repoIds: GithubRepoId[] | undefined, isAgentWorkspace: boolean, refresh: boolean): Promise<CloudSessionData[]> {
		const sessions = await this.fetchAllSessions(repoIds, isAgentWorkspace, refresh);

		// Group sessions by resource_id and keep only the latest per resource_id.
		const latestSessionsMap = new Map<number, SessionInfo>();
		for (const session of sessions) {
			const existing = latestSessionsMap.get(session.resource_id);
			if (!existing || new Date(session.last_updated_at) > new Date(existing.last_updated_at)) {
				latestSessionsMap.set(session.resource_id, session);
			}
		}

		// Fetch PRs for all unique resource_global_ids in parallel.
		const uniqueGlobalIds = new Set(Array.from(latestSessionsMap.values()).map(s => s.resource_global_id));
		const prFetches = Array.from(uniqueGlobalIds).map(async globalId => {
			try {
				const pr = await this._octoKitService.getPullRequestFromGlobalId(globalId, {});
				return { globalId, pr };
			} catch (e) {
				this._logService.warn(`Failed to fetch PR for global ID ${globalId}: ${e instanceof Error ? e.message : String(e)}`);
				return { globalId, pr: null as PullRequestSearchItem | null };
			}
		});
		const prResults = await Promise.all(prFetches);
		const prMap = new Map(prResults.filter(r => r.pr).map(r => [r.globalId, r.pr!]));

		return Array.from(latestSessionsMap.values()).map(latestSession => ({
			latestSession,
			pullRequest: prMap.get(latestSession.resource_global_id),
		}));
	}

	async fetchPullRequestContent(repoOwner: string, repoName: string, sessions: SessionInfo[]): Promise<CloudSessionContent> {
		if (sessions.length === 0 || !repoOwner || !repoName) {
			return {};
		}
		const jobInfo = await this._octoKitService.getJobBySessionId(repoOwner, repoName, sessions[0].id, 'vscode-copilot-chat', CLOUD_SESSIONS_AUTH_OPTIONS);
		return { initialPrompt: jobInfo?.problem_statement || undefined };
	}

	fetchSessionsForPullRequest(pr: PullRequestSearchItem): Promise<SessionInfo[]> {
		return this._octoKitService.getCopilotSessionsForPR(pr.fullDatabaseId.toString(), CLOUD_SESSIONS_AUTH_OPTIONS);
	}

	async sendFollowUpToPullRequest(prGlobalId: string, prompt: string, targetAgent?: string): Promise<FollowUpResult | undefined> {
		const agent = targetAgent && targetAgent.length > 0 ? targetAgent : 'copilot';
		// Trailing space preserved for byte-identical bodies vs the pre-seam inline implementation.
		const body = `@${agent} ${prompt} `;
		const commentResult = await this._octoKitService.addPullRequestComment(prGlobalId, body, CLOUD_SESSIONS_AUTH_OPTIONS);
		if (!commentResult) {
			return undefined;
		}
		return { url: commentResult.url };
	}

	async createSession(params: CreateCloudSessionParams, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<CloudDelegationResult> {
		const payload: RemoteAgentJobPayload = {
			problem_statement: params.problemStatement,
			event_content: params.prompt,
			event_type: 'visual_studio_code_remote_agent_tool_invoked',
			...(params.customAgent && { custom_agent: params.customAgent }),
			...(params.model && { model: params.model }),
			...(params.partnerAgentId !== undefined && { agent_id: params.partnerAgentId }),
			pull_request: {
				title: params.title,
				body_placeholder: formatBodyPlaceholder(params.title),
				base_ref: params.baseRef,
				body_suffix,
				...(params.headRef && { head_ref: params.headRef }),
			},
		};

		/* __GDPR__
			"copilotcloud.chat.remoteAgentJobInvoke" : {
				"owner": "joshspicer",
				"comment": "Event sent when a remote agent job invocation starts.",
				"hasHeadRef": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a head ref was provided for delegation." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobInvoke', {
			hasHeadRef: String(!!params.headRef),
		});

		stream?.progress(vscode.l10n.t('Delegating to cloud agent'));
		this._logService.debug(`[postCopilotAgentJob] Invoking cloud agent job with payload: ${JSON.stringify(payload)}`);
		const response = await this._octoKitService.postCopilotAgentJob(params.owner, params.repo, JOBS_API_VERSION, payload, CLOUD_SESSIONS_AUTH_OPTIONS);
		this._logService.debug(`[postCopilotAgentJob] Received response from cloud agent job invocation: ${JSON.stringify(response)}`);
		if (!this.validateRemoteAgentJobResponse(response)) {
			const statusCode = (response as { status?: number } | undefined)?.status;
			switch (statusCode) {
				case 401:
					throw new Error(vscode.l10n.t('Cloud agent is not authorized to run on this repository. This may be because the Copilot coding agent is disabled for your organization, or your active GitHub account does not have push access to the target repository.'));
				case 403:
					throw new Error(vscode.l10n.t('Cloud agent is not enabled for this repository. You may need to enable it in [GitHub settings]({0}) or contact your organization administrator.', `https://${params.host}/settings/copilot/coding_agent`));
				case 404:
					throw new Error(vscode.l10n.t('The repository `{0}/{1}` was not found or you do not have access to it.', params.owner, params.repo));
				case 422:
					throw new Error(vscode.l10n.t('Cloud agent was unable to create a pull request with the specified base branch `{0}`. Please push the branch to the remote and verify repository rules allow this operation. For empty repos, push an initial commit and try again.', params.baseRef));
				case 500:
					throw new Error(vscode.l10n.t('Cloud agent service encountered an internal error. Please try again later.'));
				default:
					throw new Error(vscode.l10n.t('Received invalid response {0} from cloud agent.', statusCode ? statusCode : ''));
			}
		}

		stream.progress(vscode.l10n.t('Creating pull request'));
		const jobInfo = await this.waitForJobWithPullRequest(params.owner, params.repo, response.job_id, token);

		if (!jobInfo || !jobInfo.pull_request) {
			throw new Error(vscode.l10n.t('Failed to retrieve pull request information from job'));
		}

		const { number } = jobInfo.pull_request;
		if (!number || isNaN(number)) {
			throw new Error(vscode.l10n.t('Invalid pull request number received from cloud agent'));
		}
		return { kind: 'pullRequest', prNumber: number, sessionId: response.session_id };
	}

	async waitForSessionReady(sessionId: string, token?: vscode.CancellationToken): Promise<SessionInfo | undefined> {
		let sessionInfo: SessionInfo | undefined;

		const waitForQueuedMaxRetries = 3;
		const waitForQueuedDelay = 5_000; // 5 seconds

		let waitForQueuedCount = 0;
		do {
			sessionInfo = await this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
			if (sessionInfo && sessionInfo.state === 'queued') {
				this._logService.trace('Queued session found');
				break;
			}
			if (waitForQueuedCount < waitForQueuedMaxRetries) {
				this._logService.trace('Session not yet queued, waiting...');
				await new Promise(resolve => setTimeout(resolve, waitForQueuedDelay));
			}
			++waitForQueuedCount;
		} while (waitForQueuedCount <= waitForQueuedMaxRetries && (!token || !token.isCancellationRequested));

		if (!sessionInfo || sessionInfo.state !== 'queued') {
			if (sessionInfo?.state === 'in_progress') {
				this._logService.trace('Session already in progress');
				return sessionInfo;
			}
			this._logService.trace('Failed to find queued session');
			return;
		}

		const maxWaitTime = 2 * 60 * 1_000; // 2 minutes
		const pollInterval = 3_000; // 3 seconds
		const startTime = Date.now();

		this._logService.trace(`Session ${sessionInfo.id} is queued, waiting for transition to in_progress...`);
		while (Date.now() - startTime < maxWaitTime && (!token || !token.isCancellationRequested)) {
			const info = await this._octoKitService.getSessionInfo(sessionId, CLOUD_SESSIONS_AUTH_OPTIONS);
			if (info?.state === 'in_progress') {
				this._logService.trace(`Session ${info.id} now in progress.`);
				return info;
			}
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}
		this._logService.error(`Timed out waiting for session ${sessionId} to transition from queued to in_progress.`);
		return undefined;
	}

	// https://github.com/github/sweagentd/blob/main/docs/adr/0001-create-job-api.md
	private validateRemoteAgentJobResponse(response: unknown): response is RemoteAgentJobResponse {
		return typeof response === 'object' && response !== null && 'job_id' in response && 'session_id' in response;
	}

	private async fetchAllSessions(repoIds: GithubRepoId[] | undefined, isAgentWorkspace: boolean, refresh: boolean): Promise<SessionInfo[]> {
		if (isAgentWorkspace || !repoIds || repoIds.length === 0) {
			return this._octoKitService.getAllSessions(undefined, refresh, {});
		}
		const all = await Promise.all(
			repoIds.map(repo => this._octoKitService.getAllSessions(`${repo.org}/${repo.repo}`, refresh, {})),
		);
		return all.flat();
	}

	private async waitForJobWithPullRequest(
		owner: string,
		repo: string,
		jobId: string,
		token?: vscode.CancellationToken,
	): Promise<JobInfo | undefined> {
		const maxWaitTime = 30 * 1000; // 30 seconds
		const pollInterval = 2000; // 2 seconds
		const startTime = Date.now();

		this._logService.trace(`Waiting for job ${jobId} to have pull request information...`);

		while (Date.now() - startTime < maxWaitTime && (!token || !token.isCancellationRequested)) {
			const jobInfo = await this._octoKitService.getJobByJobId(owner, repo, jobId, 'vscode-copilot-chat', CLOUD_SESSIONS_AUTH_OPTIONS);
			if (jobInfo && jobInfo.pull_request && jobInfo.pull_request.number) {
				/* __GDPR__
					"copilotcloud.chat.remoteAgentJobPullRequestReady" : {
						"owner": "joshspicer",
						"comment": "Event sent when a remote agent job first returns pull request information."
					}
				*/
				this._telemetryService.sendMSFTTelemetryEvent('copilotcloud.chat.remoteAgentJobPullRequestReady');
				GenAiMetrics.incrementCloudPrReadyCount(this._otelService);
				this._logService.trace(`Job ${jobId} now has pull request #${jobInfo.pull_request.number}`);
				return jobInfo;
			}
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		this._logService.warn(`Timed out waiting for job ${jobId} to have pull request information`);
		return undefined;
	}
}
