/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { INTEGRATION_ID } from '../../../platform/endpoint/common/licenseAgreement';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import type { CreateSessionFailureReason, CreateSessionResult, CloudSession, SessionEvent } from '../common/cloudSessionTypes';

/** Timeout for individual cloud API requests (ms). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Cloud sessions endpoint path. */
const SESSIONS_PATH = '/agents/sessions';

// ── Cloud agent application IDs ─────────────────────────────────────────────────

/** Agent application IDs used by the cloud sessions API (`agent_id` field). */
export const CloudAgentId = {
	VSCodeChat: 797352,
	CopilotChat: 894184,
	CopilotPRReviews: 946600,
	CopilotDeveloper: 1143301,
	CopilotDeveloperCLI: 1693627,
} as const;

/**
 * HTTP client for the cloud session API.
 *
 * Creates sessions and submits event batches. All methods are non-blocking:
 * failures are logged but never thrown to avoid disrupting the chat session.
 *
 * Respects HTTP 429 (Too Many Requests) by backing off all requests until
 * the Retry-After period expires.
 */
export class CloudSessionApiClient {

	/** Timestamp (epoch ms) until which all requests should be skipped due to 429. */
	private _rateLimitedUntil = 0;

	/** Number of times we've been rate-limited. */
	private _rateLimitCount = 0;

	/** Callback fired when a 429 is received. */
	onRateLimited: ((callSite: string, retryAfterSec: number) => void) | undefined;

	constructor(
		private readonly _tokenManager: ICopilotTokenManager,
		private readonly _authService: IAuthenticationService,
		private readonly _fetcherService: IFetcherService,
	) { }

	/** Returns true if we're currently rate-limited and should skip requests. */
	private _isRateLimited(): boolean {
		return Date.now() < this._rateLimitedUntil;
	}

	/** Record a 429 response and back off for the indicated duration. */
	private _handleRateLimit(res: { headers?: { get?(name: string): string | null } }, callSite: string): void {
		let retryAfterSec = 60; // Default: 60 seconds
		try {
			const header = res.headers?.get?.('Retry-After');
			if (header) {
				const parsed = parseInt(header, 10);
				if (!isNaN(parsed) && parsed > 0 && parsed <= 600) {
					retryAfterSec = parsed;
				}
			}
		} catch {
			// Use default
		}
		this._rateLimitedUntil = Date.now() + retryAfterSec * 1000;
		this._rateLimitCount++;
		this.onRateLimited?.(callSite, retryAfterSec);
	}

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
		if (this._isRateLimited()) {
			return { ok: false, reason: 'error' };
		}
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

			if (res.status === 429) {
				this._handleRateLimit(res, 'createSession');
				return { ok: false, reason: 'error' };
			}

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
		if (this._isRateLimited()) {
			return false;
		}
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

			if (res.status === 429) {
				this._handleRateLimit(res, 'submitEvents');
				return false;
			}

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
		if (this._isRateLimited()) {
			return undefined;
		}
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

			if (res.status === 429) {
				this._handleRateLimit(res, 'getSession');
				return undefined;
			}

			if (!res.ok) {
				return undefined;
			}

			return (await res.json()) as CloudSession;
		} catch {
			return undefined;
		}
	}

	/**
	 * List VS Code cloud sessions for the authenticated user.
	 * Paginates through all pages and filters to only VS Code Chat sessions.
	 */
	async listSessions(): Promise<Array<{ id: string; agent_task_id?: string; agent_id?: number; state: string; created_at: string }>> {
		const allSessions: Array<{ id: string; agent_task_id?: string; agent_id?: number; state: string; created_at: string }> = [];
		if (this._isRateLimited()) {
			return allSessions;
		}
		const pageSize = 100;
		let page = 1;

		try {
			while (true) {
				const { url, headers } = await this._buildRequest(`${SESSIONS_PATH}?page_size=${pageSize}&page_number=${page}`);
				if (!url) {
					return allSessions;
				}

				const res = await this._fetcherService.fetch(url, {
					callSite: 'chronicle.cloudListSessions',
					method: 'GET',
					headers,
					timeout: REQUEST_TIMEOUT_MS,
				});

				if (res.status === 429) {
					this._handleRateLimit(res, 'listSessions');
					return allSessions;
				}

				if (!res.ok) {
					return allSessions;
				}

				const data = await res.json();
				const sessions = Array.isArray(data) ? data : (data as Record<string, unknown>).sessions;
				const pageSessions = Array.isArray(sessions) ? sessions : [];

				// Filter to VS Code Chat sessions only
				for (const session of pageSessions) {
					if (session.agent_id === CloudAgentId.VSCodeChat) {
						allSessions.push(session);
					}
				}

				// Stop if we got fewer than a full page (last page)
				if (pageSessions.length < pageSize) {
					break;
				}
				page++;
			}
		} catch {
			// Return whatever we've collected so far
		}

		return allSessions;
	}

	/**
	 * Delete a session from the cloud.
	 * Returns 'deleted' if queued for deletion (202), 'not_found' if the session
	 * doesn't exist in the cloud (404, treated as success), or 'error' on failure.
	 */
	async deleteSession(sessionId: string): Promise<'deleted' | 'not_found' | 'error'> {
		if (this._isRateLimited()) {
			return 'error';
		}
		try {
			const { url, headers } = await this._buildRequest('/agents/analytics/delete');
			if (!url) {
				return 'error';
			}

			const res = await this._fetcherService.fetch(url, {
				callSite: 'chronicle.cloudDeleteSession',
				method: 'POST',
				headers,
				json: { session_id: sessionId },
				timeout: REQUEST_TIMEOUT_MS,
			});

			if (res.status === 429) {
				this._handleRateLimit(res, 'deleteSession');
				return 'error';
			}
			if (res.status === 202) {
				return 'deleted';
			}
			if (res.status === 404) {
				return 'not_found';
			}
			return 'error';
		} catch {
			return 'error';
		}
	}

	/**
	 * Trigger bulk analytics backfill for all remote sessions at the given indexing level.
	 * Single API call that queues all eligible sessions for reindexing.
	 */
	async backfillAnalytics(indexingLevel: 'user' | 'repo_and_user'): Promise<{ ok: true; sessionsQueued: number } | { ok: false }> {
		if (this._isRateLimited()) {
			return { ok: false };
		}
		try {
			const { url, headers } = await this._buildRequest('/agents/analytics/backfill');
			if (!url) {
				return { ok: false };
			}

			const res = await this._fetcherService.fetch(url, {
				callSite: 'chronicle.cloudBackfillAnalytics',
				method: 'POST',
				headers,
				json: { indexing_level: indexingLevel },
				timeout: REQUEST_TIMEOUT_MS,
			});

			if (res.status === 429) {
				this._handleRateLimit(res, 'backfillAnalytics');
				return { ok: false };
			}

			if (!res.ok) {
				return { ok: false };
			}

			const data = await res.json() as { sessions_queued?: number };
			return { ok: true, sessionsQueued: data.sessions_queued ?? 0 };
		} catch {
			return { ok: false };
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
				'Copilot-Integration-Id': INTEGRATION_ID,
			};

			return { url, headers };
		} catch {
			return { url: undefined, headers: {} };
		}
	}
}
