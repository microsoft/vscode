/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ICopilotTokenManager } from '../../../platform/authentication/common/copilotTokenManager';
import { INTEGRATION_ID } from '../../../platform/endpoint/common/licenseAgreement';
import { IFetcherService, type Response } from '../../../platform/networking/common/fetcherService';
import { FetchBlockedError, type HttpFetchFn, type HttpResponse } from '../../../shared-fetch-utils/common/fetchTypes';
import { rateLimitBackoffMiddleware } from '../../../shared-fetch-utils/common/middleware/rateLimitBackoffMiddleware';
import type { CreateSessionFailureReason, CreateSessionResult, CloudSession, SessionEvent, SubmitSessionEventsResult } from '../common/cloudSessionTypes';

/** Timeout for individual cloud API requests (ms). */
const REQUEST_TIMEOUT_MS = 10_000;

/** Cloud sessions endpoint path. */
const SESSIONS_PATH = '/agents/sessions';

/** Initial backoff applied when the server reports a rate limit without a hint. */
const RATE_LIMIT_INITIAL_BACKOFF_MS = 60_000;

/** Upper bound on any rate limit backoff, including one the server asks for. */
const RATE_LIMIT_MAX_BACKOFF_MS = 600_000;

/** What a cloud request produced, so each caller can map it onto its own result shape. */
type CloudFetchOutcome =
	| { readonly kind: 'response'; readonly response: Response }
	| { readonly kind: 'rateLimited' }
	| { readonly kind: 'error' };

/** Carries the underlying response through the middleware, which only reads status and headers. */
type AdaptedResponse = HttpResponse & { readonly original: Response };

/** Options for a single cloud API call. */
type CloudRequestInit = {
	readonly method: string;
	readonly json?: unknown;
	/** Passed to the fetcher for request telemetry. */
	readonly callSite: string;
	/** Reported to {@link CloudSessionApiClient.onRateLimited}. */
	readonly operation: string;
};

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

	/** Timestamp (epoch ms) until which all requests should be skipped due to a rate limit. */
	private _rateLimitedUntil = 0;

	/** Callback fired when the server reports a new rate limit. */
	onRateLimited: ((callSite: string, retryAfterSec: number) => void) | undefined;

	/**
	 * Shared rate limit handling. Only this middleware is applied: `403` here means policy
	 * blocked rather than an auth failure, and `5xx` backoff is owned by the exporter's circuit
	 * breaker, so neither the auth nor the server error middleware belongs in this stack.
	 */
	private readonly _rateLimitedFetch: HttpFetchFn;

	constructor(
		private readonly _tokenManager: ICopilotTokenManager,
		private readonly _authService: IAuthenticationService,
		private readonly _fetcherService: IFetcherService,
		// Injectable so tests can exercise the backoff without waiting on the wall clock.
		private readonly _now: () => number = Date.now,
	) {
		this._rateLimitedFetch = rateLimitBackoffMiddleware({
			initialDelayMs: RATE_LIMIT_INITIAL_BACKOFF_MS,
			maxDelayMs: RATE_LIMIT_MAX_BACKOFF_MS,
			now: this._now,
		})(async (request) => {
			const { method, json, callSite } = request.state as CloudRequestInit;
			const original = await this._fetcherService.fetch(request.url, {
				callSite,
				// FetchOptions.method is typed narrowly (GET/POST/PUT) for CAPI
				// compatibility; the underlying fetcher accepts DELETE at runtime.
				method: method as 'POST',
				headers: request.headers,
				json,
				timeout: REQUEST_TIMEOUT_MS,
			});
			return {
				status: original.status,
				headers: original.headers,
				body: null,
				text: () => original.text(),
				json: () => original.json(),
				original,
			} satisfies AdaptedResponse;
		});
	}

	/** Returns true if we're currently rate-limited and should skip requests. */
	isRateLimited(): boolean {
		return this._now() < this._rateLimitedUntil;
	}

	/**
	 * Performs a cloud API request, short-circuiting while rate limited.
	 *
	 * The middleware decides how long to wait; this only mirrors that window so
	 * {@link isRateLimited} can be polled synchronously by the exporter.
	 */
	private async _fetch(path: string, init: CloudRequestInit): Promise<CloudFetchOutcome> {
		// Checked before building the request so a blocked call costs no token lookup, and so the
		// telemetry callback only fires for newly reported limits.
		if (this.isRateLimited()) {
			return { kind: 'rateLimited' };
		}
		const { url, headers } = await this._buildRequest(path);
		if (!url) {
			return { kind: 'error' };
		}
		try {
			const response = await this._rateLimitedFetch({ url, headers, state: init });
			return { kind: 'response', response: (response as AdaptedResponse).original };
		} catch (err) {
			if (err instanceof FetchBlockedError) {
				this._rateLimitedUntil = Math.max(this._rateLimitedUntil, this._now() + err.retryAfterMs);
				this.onRateLimited?.(init.operation, Math.round(err.retryAfterMs / 1000));
				return { kind: 'rateLimited' };
			}
			return { kind: 'error' };
		}
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
		const outcome = await this._fetch(SESSIONS_PATH, {
			method: 'POST',
			callSite: 'chronicle.cloudCreateSession',
			operation: 'createSession',
			json: {
				owner_id: ownerId,
				repo_id: repoId,
				agent_task_id: sessionId,
				indexing_level: indexingLevel,
			},
		});
		if (outcome.kind !== 'response') {
			return { ok: false, reason: outcome.kind === 'rateLimited' ? 'rate_limited' : 'error' };
		}

		const res = outcome.response;
		if (!res.ok) {
			const reason: CreateSessionFailureReason = res.status === 403 ? 'policy_blocked' : 'error';
			return { ok: false, reason };
		}

		try {
			const response = await res.json() as { id: string; task_id?: string; agent_task_id?: string };
			return { ok: true, response };
		} catch {
			return { ok: false, reason: 'error' };
		}
	}

	/**
	 * Submit a batch of events to a session.
	 * @returns ok on success, or a failure reason distinguishing policy-blocked
	 *          responses from generic/transient errors.
	 */
	async submitSessionEvents(
		sessionId: string,
		events: SessionEvent[],
	): Promise<SubmitSessionEventsResult> {
		const outcome = await this._fetch(`${SESSIONS_PATH}/${sessionId}/events`, {
			method: 'POST',
			callSite: 'chronicle.cloudSubmitEvents',
			operation: 'submitEvents',
			json: { events },
		});
		if (outcome.kind !== 'response') {
			return { ok: false, reason: outcome.kind === 'rateLimited' ? 'rate_limited' : 'error' };
		}

		const res = outcome.response;
		if (!res.ok) {
			const reason: 'policy_blocked' | 'error' = res.status === 403 ? 'policy_blocked' : 'error';
			return { ok: false, reason };
		}

		return { ok: true };
	}

	/**
	 * Get a session by ID (used for reattach verification).
	 */
	async getSession(sessionId: string): Promise<CloudSession | undefined> {
		const outcome = await this._fetch(`${SESSIONS_PATH}/${sessionId}`, {
			method: 'GET',
			callSite: 'chronicle.cloudGetSession',
			operation: 'getSession',
		});
		if (outcome.kind !== 'response' || !outcome.response.ok) {
			return undefined;
		}

		try {
			return (await outcome.response.json()) as CloudSession;
		} catch {
			return undefined;
		}
	}

	/**
	 * List VS Code cloud sessions for the authenticated user.
	 * Paginates through all pages and filters to only VS Code Chat sessions.
	 */
	async listSessions(): Promise<Array<{ id: string; task_id?: string; agent_task_id?: string; agent_id?: number; state: string; created_at: string }>> {
		const allSessions: Array<{ id: string; task_id?: string; agent_task_id?: string; agent_id?: number; state: string; created_at: string }> = [];
		const pageSize = 100;
		let page = 1;

		try {
			while (true) {
				const outcome = await this._fetch(`${SESSIONS_PATH}?page_size=${pageSize}&page_number=${page}`, {
					method: 'GET',
					callSite: 'chronicle.cloudListSessions',
					operation: 'listSessions',
				});
				if (outcome.kind !== 'response' || !outcome.response.ok) {
					return allSessions;
				}

				const data = await outcome.response.json();
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
	 * Delete a session from the cloud via the server task endpoint
	 * (`DELETE /agents/tasks/{taskId}` — soft-delete).
	 *
	 * Returns 'deleted' on any 2xx, 'not_found' if the task doesn't exist (404,
	 * treated as success), or 'error' on failure.
	 */
	async deleteSession(taskId: string): Promise<'deleted' | 'not_found' | 'error'> {
		const outcome = await this._fetch(`/agents/tasks/${encodeURIComponent(taskId)}`, {
			method: 'DELETE',
			callSite: 'chronicle.cloudDeleteSession',
			operation: 'deleteSession',
		});
		if (outcome.kind !== 'response') {
			return 'error';
		}

		const res = outcome.response;
		if (res.status === 404) {
			return 'not_found';
		}
		return res.ok ? 'deleted' : 'error';
	}

	/**
	 * Trigger bulk analytics backfill for all remote sessions at the given indexing level.
	 * Single API call that queues all eligible sessions for reindexing.
	 */
	async backfillAnalytics(indexingLevel: 'user' | 'repo_and_user'): Promise<{ ok: true; sessionsQueued: number } | { ok: false }> {
		const outcome = await this._fetch('/agents/analytics/backfill', {
			method: 'POST',
			callSite: 'chronicle.cloudBackfillAnalytics',
			operation: 'backfillAnalytics',
			json: { indexing_level: indexingLevel },
		});
		if (outcome.kind !== 'response' || !outcome.response.ok) {
			return { ok: false };
		}

		try {
			const data = await outcome.response.json() as { sessions_queued?: number };
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
