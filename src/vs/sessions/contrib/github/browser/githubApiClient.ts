/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { deriveGitHubEndpoints, IGitHubEndpoints } from '../../../../platform/agentHost/common/githubEndpoints.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';

const LOG_PREFIX = '[GitHubApiClient]';
const TRACE_PREFIX = '[PR-ICON-TRACE]';

export interface IGitHubApiRequestOptions {
	readonly data?: unknown;
	readonly etag?: string;
	readonly token?: CancellationToken;
	readonly createAuthenticationSession?: boolean;
}

export interface IGitHubApiResponse<T> {
	readonly data: T | undefined;
	readonly statusCode: number;
	readonly etag?: string;
}

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

export class GitHubAuthenticationError extends Error {
	constructor() {
		super('No GitHub authentication sessions available');
		this.name = 'GitHubAuthenticationError';
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
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	get enterpriseHost(): string | undefined {
		return this._getConnection().endpoints.enterpriseHost;
	}

	async request<T>(method: string, path: string, callSite: string, options?: IGitHubApiRequestOptions): Promise<IGitHubApiResponse<T>> {
		const connection = this._getConnection();
		return this._request<T>(method, `${connection.endpoints.apiBaseUri}${path}`, path, 'application/vnd.github.v3+json', callSite, connection.authenticationProviderId, options);
	}

	async graphql<T>(query: string, callSite: string, variables?: Record<string, unknown>, options?: Pick<IGitHubApiRequestOptions, 'token' | 'createAuthenticationSession'>): Promise<T> {
		const connection = this._getConnection();
		const response = await this._request<IGitHubGraphQLResponse<T>>(
			'POST',
			connection.endpoints.graphQlUri,
			'/graphql',
			'application/vnd.github+json',
			callSite,
			connection.authenticationProviderId,
			{ ...options, data: { query, variables } }
		);

		if (response.data?.errors?.length) {
			throw new GitHubApiError(
				response.data.errors.map(error => error.message).join('; '),
				200,
				undefined,
			);
		}

		if (!response.data?.data) {
			throw new GitHubApiError('GitHub GraphQL response did not include data', 200, undefined);
		}

		return response.data.data;
	}

	private _getConnection(): { readonly authenticationProviderId: string; readonly endpoints: IGitHubEndpoints } {
		const authenticationProvider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		const enterpriseUri = authenticationProvider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined;
		return {
			authenticationProviderId: authenticationProvider.id,
			endpoints: deriveGitHubEndpoints(enterpriseUri),
		};
	}

	private async _request<T>(method: string, url: string, pathForLogging: string, accept: string, callSite: string, authenticationProviderId: string, options?: IGitHubApiRequestOptions): Promise<IGitHubApiResponse<T>> {
		const token = await this._getAuthToken(authenticationProviderId, options?.createAuthenticationSession !== false);

		this._logService.trace(`${LOG_PREFIX} ${method} ${pathForLogging}`);
		this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] -> ${method} ${pathForLogging} (callSite ${callSite}${options?.etag !== undefined ? `, ifNoneMatch ${options.etag}` : ''})`);

		const response = await this._requestService.request({
			type: method,
			url,
			headers: {
				'Authorization': `token ${token}`,
				'Accept': accept,
				'User-Agent': 'VSCode-Sessions-GitHub',
				...(options?.etag !== undefined ? { 'If-None-Match': options.etag } : {}),
				...(options?.data !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			data: options?.data !== undefined ? JSON.stringify(options.data) : undefined,
			// The renderer cache can return stale 200 responses despite ETag polling.
			disableCache: true,
			callSite
		}, options?.token ?? CancellationToken.None);

		const rateLimitRemaining = parseRateLimitHeader(response.res.headers?.['x-ratelimit-remaining']);
		if (rateLimitRemaining !== undefined && rateLimitRemaining < 100) {
			this._logService.warn(`${LOG_PREFIX} GitHub API rate limit low: ${rateLimitRemaining} remaining`);
		}

		const statusCode = response.res.statusCode ?? 0;
		const responseETag = response.res.headers?.['etag'];

		this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] <- ${method} ${pathForLogging} status ${statusCode}${responseETag ? `, etag ${responseETag}` : ''}${rateLimitRemaining !== undefined ? `, rateLimitRemaining ${rateLimitRemaining}` : ''} (callSite ${callSite})`);

		if (
			statusCode === 204 /* No Content */ ||
			statusCode === 304 /* Not Modified */
		) {
			return { data: undefined, statusCode, etag: responseETag };
		}

		if (statusCode < 200 || statusCode >= 300) {
			const errorBody = await asJson<{ message?: string }>(response).catch(() => undefined);
			throw new GitHubApiError(
				errorBody?.message ?? `GitHub API request failed: ${method} ${pathForLogging} (${statusCode})`,
				statusCode,
				rateLimitRemaining,
			);
		}

		const data = await asJson<T>(response);
		if (!data) {
			throw new GitHubApiError(
				`Failed to parse response for ${method} ${pathForLogging}`,
				statusCode,
				rateLimitRemaining,
			);
		}

		return { data, statusCode, etag: responseETag };
	}

	private async _getAuthToken(authenticationProviderId: string, createIfNone: boolean): Promise<string> {
		let sessions = await this._authenticationService.getSessions(authenticationProviderId, [], { silent: true });
		if ((!sessions || sessions.length === 0) && createIfNone) {
			sessions = await this._authenticationService.getSessions(authenticationProviderId, [], { createIfNone: true });
		}
		if (!sessions || sessions.length === 0) {
			throw new GitHubAuthenticationError();
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
