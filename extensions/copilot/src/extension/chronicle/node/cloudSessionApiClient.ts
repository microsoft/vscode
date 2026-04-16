/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import type { CreateSessionFailureReason, CreateSessionResult, CloudSession, SessionEvent } from '../common/cloudSessionTypes';

/** Timeout for individual cloud API requests (ms). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Cloud sessions endpoint path. */
const SESSIONS_PATH = '/agents/sessions';

/**
 * HTTP client for the cloud session API.
 *
 * Creates sessions and submits event batches. All methods are non-blocking:
 * failures are logged but never thrown to avoid disrupting the chat session.
 */
export class CloudSessionApiClient {

	constructor(
		private readonly _tokenManager: ICopilotTokenManager,
		private readonly _authService: IAuthenticationService,
		private readonly _fetcherService: IFetcherService,
	) { }

	/**
	 * Create a session in the cloud.
	 *
	 * The response includes both the session ID and the associated task ID.
	 */
	async createSession(
		ownerId: number,
		repoId: number,
		sessionId: string,
		indexingLevel: 'user' | 'repo_and_user' = 'user',
	): Promise<CreateSessionResult> {
		try {
			const { url, headers } = await this._buildRequest(SESSIONS_PATH);
			if (!url) {
				return { ok: false, reason: 'error' };
			}

			const body = {
				owner_id: ownerId,
				repo_id: repoId,
				agent_task_id: sessionId,
				indexing_level: indexingLevel,
			};

			const res = await this._fetcherService.fetch(url, {
				callSite: 'chronicle.cloudCreateSession',
				method: 'POST',
				headers,
				json: body,
				timeout: REQUEST_TIMEOUT_MS,
			});

			if (!res.ok) {
				const reason: CreateSessionFailureReason = res.status === 403 ? 'policy_blocked' : 'error';
				return { ok: false, reason };
			}

			const response = await res.json() as { id: string; task_id?: string; agent_task_id?: string };
			return { ok: true, response };
		} catch (err) {
			return { ok: false, reason: 'error' };
		}
	}

	/**
	 * Submit a batch of events to a session.
	 * @returns true if the submission succeeded.
	 */
	async submitSessionEvents(
		sessionId: string,
		events: SessionEvent[],
	): Promise<boolean> {
		try {
			const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}/${sessionId}/events`);
			if (!url) {
				return false;
			}

			const res = await this._fetcherService.fetch(url, {
				callSite: 'chronicle.cloudSubmitEvents',
				method: 'POST',
				headers,
				json: { events },
				timeout: REQUEST_TIMEOUT_MS,
			});

			if (!res.ok) {
				return false;
			}

			return true;
		} catch (err) {
			return false;
		}
	}

	/**
	 * Get a session by ID (used for reattach verification).
	 */
	async getSession(sessionId: string): Promise<CloudSession | undefined> {
		try {
			const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}/${sessionId}`);
			if (!url) {
				return undefined;
			}

			const res = await this._fetcherService.fetch(url, {
				callSite: 'chronicle.cloudGetSession',
				method: 'GET',
				headers,
				timeout: REQUEST_TIMEOUT_MS,
			});

			if (!res.ok) {
				return undefined;
			}

			return (await res.json()) as CloudSession;
		} catch {
			return undefined;
		}
	}

	/**
	 * Build the full URL and auth headers for a cloud API request.
	 */
	private async _buildRequest(path: string): Promise<{ url: string | undefined; headers: Record<string, string> }> {
		try {
			const copilotToken = await this._tokenManager.getCopilotToken();
			const baseUrl = copilotToken.endpoints?.api;
			if (!baseUrl) {
				return { url: undefined, headers: {} };
			}

			// Prefer GitHub OAuth token, fallback to Copilot token
			const githubToken = this._authService.anyGitHubSession?.accessToken;
			const bearerToken = githubToken ?? copilotToken.token;

			const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${bearerToken}`,
				'Copilot-Integration-Id': 'vscode-chat',
			};

			return { url, headers };
		} catch {
			return { url: undefined, headers: {} };
		}
	}
}
