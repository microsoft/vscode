/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { COPILOT_INTEGRATION_ID } from '../../../../platform/endpoint/common/licenseAgreement.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { deriveGitHubEndpoints, GITHUB_DOT_COM_COPILOT_API_BASE_URI, IGitHubEndpoints } from '../../../../platform/github/common/githubEndpoints.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';

const LOG_PREFIX = '[GitHubApiClient]';
const TRACE_PREFIX = '[PR-ICON-TRACE]';

export interface IGitHubApiRequestOptions {
	readonly data?: unknown;
	readonly etag?: string;
	readonly token?: CancellationToken;
	readonly createAuthenticationSession?: boolean;
	/** Require these scopes instead of falling back to any available session. */
	readonly authenticationScopes?: readonly string[];
	readonly accountName?: string;
	readonly contentType?: string;
	readonly timeout?: number;
	/** Called immediately before handing the request to the request service. */
	readonly onDispatch?: () => void;
}

export interface IGitHubApiResponse<T> {
	readonly data: T | undefined;
	readonly statusCode: number;
	readonly etag?: string;
	readonly link?: string;
}

interface IGitHubGraphQLError {
	readonly message: string;
}

interface IGitHubGraphQLResponse<T> {
	readonly data?: T;
	readonly errors?: readonly IGitHubGraphQLError[];
}

interface IGitHubApiConnection {
	readonly authenticationProviderId: string;
	readonly endpoints: IGitHubEndpoints;
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		readonly statusCode: number,
		readonly rateLimitRemaining: number | undefined,
		readonly retryAfterSeconds?: number,
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
		return this._getConnection()?.endpoints.enterpriseHost;
	}

	async authenticate(scopes: readonly string[], token: CancellationToken): Promise<void> {
		await this._getAuthToken(this._defaultAccountService.getDefaultAccountAuthenticationProvider().id, true, token, scopes);
	}

	async request<T>(method: string, path: string, callSite: string, options?: IGitHubApiRequestOptions): Promise<IGitHubApiResponse<T>> {
		const connection = this._getConnection();
		if (!connection) {
			throw new GitHubAuthenticationError();
		}
		return this._request<T>(method, `${connection.endpoints.apiBaseUri}${path}`, path, 'application/vnd.github.v3+json', callSite, connection, options);
	}

	async requestCopilot<T>(method: string, path: string, callSite: string, options: IGitHubApiRequestOptions & { readonly accountName: string }): Promise<IGitHubApiResponse<T>> {
		const connection = this._getConnection();
		if (!connection) {
			throw new GitHubAuthenticationError();
		}
		if (connection.endpoints.enterpriseHost !== undefined) {
			throw new Error('This Copilot API is only supported on GitHub.com.');
		}
		return this._request<T>(method, `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}${path}`, path, 'application/json', callSite, connection, options, true);
	}

	async graphql<T>(query: string, callSite: string, variables?: Record<string, unknown>, options?: Pick<IGitHubApiRequestOptions, 'token' | 'createAuthenticationSession'>): Promise<T> {
		const connection = this._getConnection();
		if (!connection) {
			throw new GitHubAuthenticationError();
		}
		const response = await this._request<IGitHubGraphQLResponse<T>>(
			'POST',
			connection.endpoints.graphQlUri,
			'/graphql',
			'application/vnd.github+json',
			callSite,
			connection,
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

	private _getConnection(): IGitHubApiConnection | undefined {
		const authenticationProvider = this._defaultAccountService.getDefaultAccountAuthenticationProvider();
		const enterpriseUri = authenticationProvider.enterprise ? this._defaultAccountService.resolveGitHubUrl('') : undefined;
		if (authenticationProvider.enterprise && !enterpriseUri) {
			return undefined;
		}
		return {
			authenticationProviderId: authenticationProvider.id,
			endpoints: deriveGitHubEndpoints(enterpriseUri),
		};
	}

	private async _request<T>(method: string, url: string, pathForLogging: string, accept: string, callSite: string, connection: IGitHubApiConnection, options?: IGitHubApiRequestOptions, copilot = false): Promise<IGitHubApiResponse<T>> {
		const cancellationToken = options?.token ?? CancellationToken.None;
		const selectedAccount = options?.accountName !== undefined ? this._defaultAccountService.currentDefaultAccount : undefined;
		if (options?.accountName !== undefined && (selectedAccount?.accountName !== options.accountName || selectedAccount.authenticationProvider.id !== connection.authenticationProviderId)) {
			throw new GitHubAuthenticationError();
		}
		const selectedSessionId = selectedAccount?.sessionId;
		const token = await this._getAuthToken(connection.authenticationProviderId, options?.createAuthenticationSession !== false, cancellationToken, options?.authenticationScopes, selectedSessionId);
		if (cancellationToken.isCancellationRequested) {
			throw new CancellationError();
		}
		if (options?.accountName !== undefined) {
			const currentAccount = this._defaultAccountService.currentDefaultAccount;
			const currentConnection = this._getConnection();
			if (currentAccount?.accountName !== options.accountName
				|| currentAccount.sessionId !== selectedSessionId
				|| currentAccount.authenticationProvider.id !== connection.authenticationProviderId
				|| currentConnection?.authenticationProviderId !== connection.authenticationProviderId
				|| currentConnection.endpoints.apiBaseUri !== connection.endpoints.apiBaseUri) {
				throw new GitHubAuthenticationError();
			}
		}

		this._logService.trace(`${LOG_PREFIX} ${method} ${pathForLogging}`);
		this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] -> ${method} ${pathForLogging} (callSite ${callSite}${options?.etag !== undefined ? `, ifNoneMatch ${options.etag}` : ''})`);

		const requestOptions: IRequestOptions = {
			type: method,
			url,
			headers: {
				'Authorization': `${copilot ? 'Bearer' : 'token'} ${token}`,
				'Accept': accept,
				'User-Agent': 'VSCode-Sessions-GitHub',
				...(copilot ? { 'Copilot-Integration-Id': COPILOT_INTEGRATION_ID } : {}),
				...(options?.etag !== undefined ? { 'If-None-Match': options.etag } : {}),
				...(options?.data !== undefined ? { 'Content-Type': options.contentType ?? 'application/json' } : {}),
			},
			data: options?.data !== undefined ? JSON.stringify(options.data) : undefined,
			// The renderer cache can return stale 200 responses despite ETag polling.
			disableCache: true,
			disableRemoteFallback: copilot && method !== 'GET' && method !== 'HEAD',
			callSite,
			timeout: options?.timeout,
		};
		options?.onDispatch?.();
		const response = await this._requestService.request(requestOptions, cancellationToken);

		const rateLimitRemaining = parseRateLimitHeader(response.res.headers?.['x-ratelimit-remaining']);
		if (rateLimitRemaining !== undefined && rateLimitRemaining < 100) {
			this._logService.warn(`${LOG_PREFIX} GitHub API rate limit low: ${rateLimitRemaining} remaining`);
		}

		const statusCode = response.res.statusCode ?? 0;
		const responseETag = response.res.headers?.['etag'];
		const rawLink = response.res.headers?.['link'];
		const link = Array.isArray(rawLink) ? rawLink.join(', ') : rawLink;

		this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] <- ${method} ${pathForLogging} status ${statusCode}${responseETag ? `, etag ${responseETag}` : ''}${rateLimitRemaining !== undefined ? `, rateLimitRemaining ${rateLimitRemaining}` : ''} (callSite ${callSite})`);

		if (
			statusCode === 204 /* No Content */ ||
			statusCode === 304 /* Not Modified */
		) {
			return { data: undefined, statusCode, etag: responseETag, link };
		}

		const body = await asText(response);
		if (statusCode < 200 || statusCode >= 300) {
			let message = `GitHub API request failed: ${method} ${pathForLogging} (${statusCode})`;
			if (body) {
				try {
					const errorBody: { message?: string; errors?: { message?: string }[] } = JSON.parse(body);
					const details = Array.isArray(errorBody.errors) ? errorBody.errors.map(error => error.message).filter(message => typeof message === 'string') : [];
					message = [errorBody.message ?? message, ...details].join(': ');
				} catch (error) {
					this._logService.trace(`${LOG_PREFIX} Error response was not JSON`, error);
				}
			}
			throw new GitHubApiError(
				message,
				statusCode,
				rateLimitRemaining,
				parseRetryAfterHeader(response.res.headers?.['retry-after']),
			);
		}

		if (!body && statusCode === 202) {
			return { data: undefined, statusCode, etag: responseETag, link };
		}
		if (!body) {
			throw new GitHubApiError(
				`Failed to parse response for ${method} ${pathForLogging}`,
				statusCode,
				rateLimitRemaining,
			);
		}
		const data: T = JSON.parse(body);
		if (!data) {
			throw new GitHubApiError(`Failed to parse response for ${method} ${pathForLogging}`, statusCode, rateLimitRemaining);
		}

		return { data, statusCode, etag: responseETag, link };
	}

	private async _getAuthToken(authenticationProviderId: string, createIfNone: boolean, token: CancellationToken, scopes?: readonly string[], selectedSessionId?: string): Promise<string> {
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
		const selectedSession = selectedSessionId !== undefined ? sessions.find(session => session.id === selectedSessionId) : undefined;
		if (selectedSessionId !== undefined && !selectedSession) {
			throw new GitHubAuthenticationError();
		}
		const matchesAccount = (session: AuthenticationSession) => !selectedSession || (
			session.account.id === selectedSession.account.id
			&& session.authorizationServer?.toString() === selectedSession.authorizationServer?.toString()
			&& session.scopes.includes('repo'));
		const matchingSessions = sessions.filter(session =>
			session.accessToken
			&& (!scopes || scopes.every(scope => session.scopes.includes(scope)))
			&& matchesAccount(session));
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
		if (!session?.accessToken || (scopes && !scopes.every(scope => session.scopes.includes(scope)))
			|| !matchesAccount(session)) {
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

function parseRetryAfterHeader(value: string | string[] | undefined): number | undefined {
	const header = Array.isArray(value) ? value[0] : value;
	if (header === undefined) {
		return undefined;
	}
	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds >= 0) {
		return seconds;
	}
	const date = Date.parse(header);
	return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}
