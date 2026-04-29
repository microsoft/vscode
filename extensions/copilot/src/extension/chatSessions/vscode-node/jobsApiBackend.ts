/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { GithubRepoId } from '../../../platform/git/common/gitService';
import { PullRequestSearchItem, SessionInfo } from '../../../platform/github/common/githubAPI';
import { AuthOptions, IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { SessionIdForPr } from '../vscode/copilotCodingAgentUtils';
import {
	CloudAgentBackend,
	CloudDelegationResult,
	CloudSessionData,
	CloudSessionIdentity,
	CreateCloudSessionParams,
	FollowUpResult,
} from './cloudAgentBackend';

const CLOUD_SESSIONS_AUTH_OPTIONS: AuthOptions = { createIfNone: { detail: l10n.t('Sign in to GitHub to access Copilot cloud sessions.') } };

/**
 * Jobs API backend — wraps the existing sweagentd Jobs API integration.
 *
 * This is the "old" backend that maintains exact behavioral parity with
 * the current CopilotCloudSessionsProvider implementation. It delegates
 * to the provider's existing methods to ensure zero behavior change.
 *
 * Pattern follows Mission Control's StrictTaskHandler wrapping the old Server.
 */
export class JobsApiBackend implements CloudAgentBackend {

	constructor(
		private readonly _octoKitService: IOctoKitService,
		private readonly _logService: ILogService,
	) {}

	async createSession(
		_params: CreateCloudSessionParams,
		_token: vscode.CancellationToken,
	): Promise<CloudDelegationResult> {
		// Complex orchestration — remains in provider for PR 1.
		throw new Error('JobsApiBackend.createSession must be called through the provider');
	}

	async fetchSessionList(
		repoIds: GithubRepoId[],
		isAgentWorkspace: boolean,
	): Promise<CloudSessionData[]> {
		let sessions: SessionInfo[];
		if (isAgentWorkspace || !repoIds || repoIds.length === 0) {
			sessions = await this._octoKitService.getAllSessions(undefined, true, {});
		} else {
			sessions = (await Promise.all(
				repoIds.map(repo => this._octoKitService.getAllSessions(
					`${repo.org}/${repo.repo}`, true, {}
				))
			)).flat();
		}

		// Group by resource_id, keep latest per resource
		const latestMap = new Map<number, SessionInfo>();
		for (const session of sessions) {
			const existing = latestMap.get(session.resource_id);
			if (!existing || new Date(session.created_at) > new Date(existing.created_at)) {
				latestMap.set(session.resource_id, session);
			}
		}

		// Fetch PRs for each unique resource
		const uniqueGlobalIds = new Set(
			Array.from(latestMap.values())
				.map(s => s.resource_global_id)
				.filter((id): id is string => !!id)
		);

		const prMap = new Map<string, PullRequestSearchItem>();
		await Promise.all(
			Array.from(uniqueGlobalIds).map(async globalId => {
				try {
					const pr = await this._octoKitService.getPullRequestFromGlobalId(globalId, {});
					if (pr) {
						prMap.set(globalId, pr);
					}
				} catch (e) {
					this._logService.warn(`Failed to fetch PR for globalId ${globalId}: ${e}`);
				}
			})
		);

		// Build CloudSessionData for each unique session
		const results: CloudSessionData[] = [];
		for (const session of latestMap.values()) {
			const pr = session.resource_global_id ? prMap.get(session.resource_global_id) : undefined;
			results.push({
				sessions: sessions.filter(s => s.resource_id === session.resource_id),
				pullRequest: pr ?? undefined,
			});
		}

		return results;
	}

	async fetchSessionContent(
		repoOwner: string,
		repoName: string,
		sessions: SessionInfo[],
	): Promise<{ initialPrompt?: string; logs: string }> {
		if (sessions.length === 0) {
			return { logs: '' };
		}

		let initialPrompt: string | undefined;
		try {
			const jobInfo = await this._octoKitService.getJobBySessionId(
				repoOwner, repoName, sessions[0].id,
				'vscode-copilot-chat', CLOUD_SESSIONS_AUTH_OPTIONS
			);
			initialPrompt = jobInfo?.problem_statement;
		} catch (e) {
			this._logService.warn(`Failed to fetch job info for session ${sessions[0].id}: ${e}`);
		}

		let logs = '';
		try {
			logs = await this._octoKitService.getSessionLogs(
				sessions[0].id, CLOUD_SESSIONS_AUTH_OPTIONS
			);
		} catch (e) {
			this._logService.warn(`Failed to fetch logs for session ${sessions[0].id}: ${e}`);
		}

		return { initialPrompt, logs };
	}

	async sendFollowUp(
		prNumberOrTaskId: number | string,
		_prompt: string,
		_targetAgent: string = 'copilot',
	): Promise<FollowUpResult> {
		if (typeof prNumberOrTaskId !== 'number') {
			return { success: false, message: 'JobsApiBackend only supports PR-based follow-ups' };
		}

		// Complex orchestration (PR lookup, comment posting) remains in provider for PR 1.
		// This stub validates the contract.
		throw new Error('JobsApiBackend.sendFollowUp must be called through the provider');
	}

	async getSessionLogs(
		sessionId: string,
	): Promise<string> {
		return this._octoKitService.getSessionLogs(
			sessionId, CLOUD_SESSIONS_AUTH_OPTIONS
		);
	}

	async getSessionInfo(
		sessionId: string,
	): Promise<SessionInfo | undefined> {
		return this._octoKitService.getSessionInfo(
			sessionId, CLOUD_SESSIONS_AUTH_OPTIONS
		);
	}

	async waitForSessionReady(
		sessionId: string,
		token: vscode.CancellationToken,
	): Promise<SessionInfo | undefined> {
		const startTime = Date.now();
		const timeout = 60_000; // 60 seconds
		while (Date.now() - startTime < timeout && !token.isCancellationRequested) {
			const info = await this.getSessionInfo(sessionId);
			if (info && info.state === 'in_progress') {
				return info;
			}
			if (info && (info.state === 'completed' || info.state === 'failed')) {
				return info;
			}
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
		return undefined;
	}

	parseSessionId(resource: vscode.Uri): CloudSessionIdentity | undefined {
		const parsed = SessionIdForPr.parse(resource);
		if (parsed) {
			return { type: 'pr', prNumber: parsed.prNumber, sessionIndex: parsed.sessionIndex };
		}
		const prNumber = SessionIdForPr.parsePullRequestNumber(resource);
		if (!isNaN(prNumber)) {
			return { type: 'pr', prNumber, sessionIndex: 0 };
		}
		return undefined;
	}

	async checkEnabled(_owner: string, _repo: string): Promise<{ enabled: boolean; message?: string }> {
		// Delegated to provider's isCCAEnabled for now
		return { enabled: true };
	}
}
