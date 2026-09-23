/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
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
	/** Require these scopes instead of falling back to any available session. */
	readonly authenticationScopes?: readonly string[];
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

	async authenticate(scopes: readonly string[], token: CancellationToken): Promise<void> {
		await this._getAuthToken(this._getConnection().authenticationProviderId, true, token, scopes);
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
		const cancellationToken = options?.token ?? CancellationToken.None;
		const token = await this._getAuthToken(authenticationProviderId, options?.createAuthenticationSession !== false, cancellationToken, options?.authenticationScopes);
		if (cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}

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
		}, cancellationToken);

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

	private async _getAuthToken(authenticationProviderId: string, createIfNone: boolean, token: CancellationToken, scopes?: readonly string[]): Promise<string> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		let sessions = await raceCancellationError(this._authenticationService.getSessions(authenticationProviderId, [], { silent: true }), token);
		if (!scopes && sessions.length === 0 && createIfNone) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			sessions = await raceCancellationError(this._authenticationService.getSessions(authenticationProviderId, [], { createIfNone: true }), token);
		}
		const matchingSessions = sessions.filter(session => session.accessToken && (!scopes || scopes.every(scope => session.scopes.includes(scope))));
		let session = matchingSessions.find(session => session.scopes.includes('repo')) ?? matchingSessions[0];
		if (!session && scopes && createIfNone) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			try {
				session = await raceCancellationError(this._authenticationService.createSession(authenticationProviderId, scopes, { activateImmediate: true }), token);
			} catch (error) {
				if (error === 'Cancelled' || (error instanceof Error && error.message === 'Cancelled')) {
					throw new CancellationError();
				}
				throw error;
			}
		}
		if (!session?.accessToken || (scopes && !scopes.every(scope => session.scopes.includes(scope)))) {
			throw new GitHubAuthenticationError();
		}

		return session.accessToken;
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
