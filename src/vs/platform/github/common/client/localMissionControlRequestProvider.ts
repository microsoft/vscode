/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { ILogService } from '../../../log/common/log.js';
import { IGitHubCredentials, withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { GITHUB_DOT_COM_API_BASE_URI, GITHUB_DOT_COM_COPILOT_API_BASE_URI, resolveReadApiUrl } from '../githubEndpoints.js';
import { nextLink } from '../githubResponse.js';
import { IGitHubTransport } from '../githubTransport.js';
import { GitHubRequestError } from '../githubTypes.js';
import { ApiEndpoint, ApiRequestError, MutationUncertainError, parseApiError, missionControlRequestPolicy } from '../missionControl/missionControlClient.js';
import { parseCreatedTaskId, parseMissionControlError } from '../missionControl/missionControlError.js';
import { parseResponseJson } from '../responseReader.js';
import { AccountHandle, RequestError } from '../types.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider, parseRequest } from './request.js';
import { SchemaError } from './schema.js';
import { getNextPagePath } from './pagination.js';
import { parseGitHubRequestId } from './headers.js';

const gitHubDotComOrigin = new URL(GITHUB_DOT_COM_API_BASE_URI).origin;
const copilotApiOrigin = new URL(GITHUB_DOT_COM_COPILOT_API_BASE_URI).origin;

export function missionControlAccount(endpoint: ApiEndpoint, account: AccountHandle): AccountHandle {
	return { host: new URL(endpoint.apiBaseUri).host, accountId: JSON.stringify([account.host.toLowerCase(), account.accountId]) };
}

function getMissionControlNextPagePath(apiBaseUri: string, responseUrl: string, link: string | undefined): string | null | undefined {
	let path = getNextPagePath(apiBaseUri, responseUrl, link);
	const current = new URL(responseUrl);
	if (path === null) {
		const base = new URL(apiBaseUri);
		if (base.origin !== copilotApiOrigin || base.pathname.replace(/\/+$/, '') !== '/agents') {
			return null;
		}
		const next = nextLink(link);
		if (current.origin !== base.origin || current.pathname !== '/agents/tasks' || !next || /[\\\r\n\t]/.test(next)) {
			return null;
		}
		let target: URL;
		try {
			target = new URL(next, current);
		} catch {
			return null;
		}
		if (target.origin !== gitHubDotComOrigin || target.pathname !== current.pathname
			|| target.username || target.password || target.hash) {
			return null;
		}
		path = `/tasks${target.search}`;
	} else if (path !== undefined && current.pathname === '/agents/tasks' && new URL(path, current).pathname !== '/tasks') {
		return null;
	}
	if (path === undefined) {
		return path;
	}
	const target = new URL(path, current);
	const supplied = new Set(target.searchParams.keys());
	for (const [key, value] of current.searchParams) {
		if (key !== 'page' && key !== 'cursor' && !supplied.has(key)) {
			target.searchParams.append(key, value);
		}
	}
	return `${target.pathname}${target.search}`;
}

/** Enforces service-specific credential, retry, and response privacy policy at the execution boundary. */
export class LocalMissionControlRequestProvider extends BufferedApiRequestProvider {
	constructor(
		private readonly endpoint: ApiEndpoint,
		private readonly credentials: IGitHubCredentials,
		private readonly transport: IGitHubTransport,
		private readonly logService: ILogService,
		clientSignal?: AbortSignal,
	) {
		super(clientSignal);
	}

	protected override checkResponseCancellation(request: Omit<ApiRequest, 'body'>, signal: AbortSignal): void {
		if (signal.aborted && missionControlRequestPolicy(request).mutation) {
			throw new MutationUncertainError('unknown');
		}
		signal.throwIfAborted();
	}

	protected async execute(request: Omit<ApiRequest, 'body'>, signal: AbortSignal, bodyText?: string): Promise<ApiResponse<string | undefined>> {
		const metadata = parseRequest(request);
		if (metadata.method === 'HEAD' || metadata.method === 'PUT' || metadata.redirect || metadata.responseBody === 'json'
			|| metadata.method === 'GET' && bodyText !== undefined || /[\t]/.test(metadata.path)) {
			throw new GitHubRequestError('Invalid Mission Control operation', 'validation');
		}
		const feed = metadata.path === '/feed/connect';
		const identity = metadata.path === '/environments/tokens';
		const sealing = /^\/environments\/[^/?#]+\/seal-token$/.test(metadata.path);
		if (feed && (!this.endpoint.feedApiBaseUri || metadata.method !== 'GET' || bodyText !== undefined)) {
			throw new GitHubRequestError('No approved Mission Control feed endpoint is configured for this operation', 'validation');
		}
		if (identity && (!this.endpoint.identityApiBaseUri || metadata.method !== 'POST' || bodyText !== '{}')) {
			throw new GitHubRequestError('No approved Mission Control identity endpoint is configured for this operation', 'validation');
		}
		if (sealing && (!this.endpoint.identityApiBaseUri || metadata.method !== 'POST' || bodyText === undefined)) {
			throw new GitHubRequestError('No approved Mission Control sealing endpoint is configured for this operation', 'validation');
		}
		const endpoint = feed ? { ...this.endpoint, apiBaseUri: this.endpoint.feedApiBaseUri! }
			: identity || sealing ? { ...this.endpoint, apiBaseUri: this.endpoint.identityApiBaseUri! } : this.endpoint;
		// Model catalogs use the API version that exposes token-pricing metadata.
		const apiVersion = metadata.method === 'GET' && metadata.path === '/swe/models' ? '2026-06-01' : endpoint.apiVersion;
		const { url } = resolveReadApiUrl(endpoint.apiBaseUri, metadata.path);
		const { mutation, sensitive, retry } = missionControlRequestPolicy(metadata);
		let credential = await withGitHubCredentialDeadline(signal, signal => this.credentials.getCredential(signal), undefined, metadata.options?.deadline);
		let combinedSignal = AbortSignal.any([signal, credential.signal]);
		combinedSignal.throwIfAborted();
		for (let attempt = 0; ; attempt++) {
			let dispatched = false;
			try {
				const response = await this.transport.restText(missionControlAccount(endpoint, credential.account), credential.token, {
					domain: metadata.domain,
					method: metadata.method, url: url.href, bodyText, accept: metadata.accept ?? 'application/json',
					apiVersion: apiVersion ?? null, integrationId: endpoint.integrationId,
					rateLimitResource: mutation && metadata.method === 'GET' ? 'agents:token_mint' : metadata.policy?.rateLimitResource ?? 'agents',
					caller: metadata.options?.caller ?? 'github.missionControl', deadline: metadata.options?.deadline,
					priority: metadata.options?.priority ?? (mutation ? 'mutation' : 'interactive'), retry, etag: !sensitive && !metadata.options?.noCache, coalesce: sensitive ? false : undefined,
					followRedirects: false, responseBody: metadata.responseBody,
					onDidDispatch: mutation ? () => { dispatched = true; } : undefined,
				}, combinedSignal);
				combinedSignal.throwIfAborted();
				const status = response.revalidatedStatusCode ?? response.statusCode;
				if (!asArray(metadata.expectedStatus).includes(status) || response.redirectUrl) {
					throw new GitHubRequestError('API returned an unexpected success status', 'malformedResponse', status);
				}
				const requestId = parseGitHubRequestId(response.requestId);
				return {
					data: response.data, status,
					metadata: {
						...(requestId !== undefined ? { requestId } : {}),
						nextLink: nextLink(response.link),
						nextPath: getMissionControlNextPagePath(this.endpoint.apiBaseUri, response.finalUrl, response.link),
						serverDate: response.serverDate,
						retryAfterSeconds: response.retryAfterSeconds,
					},
				};
			} catch (error) {
				this.credentials.handleRequestError(credential, error);
				if (metadata.method === 'GET' && error instanceof GitHubRequestError && error.statusCode === 401 && attempt === 0) {
					const replacement = await withGitHubCredentialDeadline(signal, signal => this.credentials.getCredential(signal), undefined, metadata.options?.deadline).catch(refreshError => {
						if (!(refreshError instanceof RequestError) || refreshError.kind !== 'authentication') {
							throw refreshError;
						}
						this.logService.debug('[MissionControlClient] No replacement credential is available; reporting the original authentication refusal');
						return undefined;
					});
					if (replacement && replacement.token !== credential.token && replacement.account.accountId === credential.account.accountId && replacement.account.host === credential.account.host) {
						credential = replacement;
						combinedSignal = AbortSignal.any([signal, credential.signal]);
						combinedSignal.throwIfAborted();
						continue;
					}
				}

				if (error instanceof GitHubRequestError && error.statusCode !== undefined && error.responseMetadata) {
					const diagnostics = parseMissionControlError(error.responseBody, error.responseMetadata.requestId);
					let details;
					let createdTaskId: string | undefined;
					if (error.responseBody && !sensitive) {
						try {
							const body = parseResponseJson<unknown>(error.responseBody, () => new SchemaError('API error body was not JSON'));
							if (metadata.method === 'POST' && metadata.path === '/tasks') {
								createdTaskId = parseCreatedTaskId(body);
							}
							details = parseApiError(body);
						} catch (error) {
							if (!(error instanceof SchemaError)) {
								throw error;
							}
							this.logService.debug('[MissionControlClient] HTTP failure did not contain a supported error envelope');
						}
					}
					throw new ApiRequestError(error.statusCode, error.kind, details, diagnostics.requestId,
						error.responseMetadata.retryAfterSeconds, mutation && dispatched && error.statusCode >= 500 ? 'indeterminate' : undefined, diagnostics, createdTaskId);
				}
				if (mutation && dispatched) {
					throw new MutationUncertainError(error instanceof RequestError ? error.kind : 'unknown', error instanceof RequestError ? error.statusCode : undefined);
				}
				if (error instanceof RequestError && error.kind === 'network') {
					throw new GitHubRequestError('API network request failed', 'network');
				}
				throw error;
			}
		}
	}
}
