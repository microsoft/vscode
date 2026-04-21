/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';

const LOG_PREFIX = '[GitHubApiClient]';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_GRAPHQL_ENDPOINT = `${GITHUB_API_BASE}/graphql`;

interface IGitHubGraphQLError {
	readonly message: string;
}

interface IGitHubGraphQLResponse<T> {
	readonly data?: T;
	readonly errors?: readonly IGitHubGraphQLError[];
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		readonly statusCode: number,
		readonly rateLimitRemaining: number | undefined,
	) {
		super(message);
		this.name = 'GitHubApiError';
	}
}

/**
 * Low-level GitHub REST API client. Handles authentication,
 * request construction, and error classification.
 *
 * This class is stateless with respect to domain data — it only
 * manages auth tokens and raw HTTP communication.
 */
export class GitHubApiClient extends Disposable {

	constructor(
		@IRequestService private readonly _requestService: IRequestService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async request<T>(method: string, path: string, callSite: string, body?: unknown): Promise<T> {
		return this._request<T>(method, `${GITHUB_API_BASE}${path}`, path, 'application/vnd.github.v3+json', callSite, body);
	}

	async graphql<T>(query: string, callSite: string, variables?: Record<string, unknown>): Promise<T> {
		const response = await this._request<IGitHubGraphQLResponse<T>>(
			'POST',
			GITHUB_GRAPHQL_ENDPOINT,
			'/graphql',
			'application/vnd.github+json',
			callSite,
			{ query, variables },
		);

		if (response.errors?.length) {
			throw new GitHubApiError(
				response.errors.map(error => error.message).join('; '),
				200,
				undefined,
			);
		}

		if (!response.data) {
			throw new GitHubApiError('GitHub GraphQL response did not include data', 200, undefined);
		}

		return response.data;
	}

	private async _request<T>(method: string, url: string, pathForLogging: string, accept: string, callSite: string, body?: unknown): Promise<T> {
		const token = await this._getAuthToken();

		this._logService.trace(`${LOG_PREFIX} ${method} ${pathForLogging}`);

		const response = await this._requestService.request({
			type: method,
			url,
			headers: {
				'Authorization': `token ${token}`,
				'Accept': accept,
				'User-Agent': 'VSCode-Sessions-GitHub',
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			data: body !== undefined ? JSON.stringify(body) : undefined,
			callSite
		}, CancellationToken.None);

		const rateLimitRemaining = parseRateLimitHeader(response.res.headers?.['x-ratelimit-remaining']);
		if (rateLimitRemaining !== undefined && rateLimitRemaining < 100) {
			this._logService.warn(`${LOG_PREFIX} GitHub API rate limit low: ${rateLimitRemaining} remaining`);
		}

		const statusCode = response.res.statusCode ?? 0;
		if (statusCode < 200 || statusCode >= 300) {
			const errorBody = await asJson<{ message?: string }>(response).catch(() => undefined);
			throw new GitHubApiError(
				errorBody?.message ?? `GitHub API request failed: ${method} ${pathForLogging} (${statusCode})`,
				statusCode,
				rateLimitRemaining,
			);
		}

		if (statusCode === 204) {
			return undefined as unknown as T;
		}

		const data = await asJson<T>(response);
		if (!data) {
			throw new GitHubApiError(
				`Failed to parse response for ${method} ${pathForLogging}`,
				statusCode,
				rateLimitRemaining,
			);
		}

		return data;
	}

	private async _getAuthToken(): Promise<string> {
		let sessions = await this._authenticationService.getSessions('github', [], { silent: true });
		if (!sessions || sessions.length === 0) {
			sessions = await this._authenticationService.getSessions('github', [], { createIfNone: true });
		}
		if (!sessions || sessions.length === 0) {
			throw new Error('No GitHub authentication sessions available');
		}

		// Prefer a session with 'repo' scope, but fall back to the first available session
		const repoScopeSession = sessions.find(session => session.scopes.includes('repo'));
		return repoScopeSession?.accessToken ?? sessions[0].accessToken ?? '';
	}
}

function parseRateLimitHeader(value: string | string[] | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const str = Array.isArray(value) ? value[0] : value;
	const parsed = parseInt(str, 10);
	return isNaN(parsed) ? undefined : parsed;
}
