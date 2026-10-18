/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../base/common/arrays.js';
import { ILogService } from '../../../log/common/log.js';
import { IGitHubCredentials, withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { resolveReadApiUrl } from '../githubEndpoints.js';
import { nextLink } from '../githubResponse.js';
import { IGitHubTransport } from '../githubTransport.js';
import { GitHubRequestError } from '../githubTypes.js';
import { ApiEndpoint, ApiRequestError, MutationUncertainError, parseApiError, missionControlRequestPolicy } from '../missionControl/missionControlClient.js';
import { parseMissionControlError } from '../missionControl/missionControlError.js';
import { parseResponseJson } from '../responseReader.js';
import { AccountHandle, RequestError } from '../types.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider, parseRequest } from './request.js';
import { SchemaError } from './schema.js';
import { getNextPagePath } from './pagination.js';

export function missionControlAccount(endpoint: ApiEndpoint, account: AccountHandle): AccountHandle {
	return { host: new URL(endpoint.apiBaseUri).host, accountId: JSON.stringify([account.host.toLowerCase(), account.accountId]) };
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
		const { url } = resolveReadApiUrl(this.endpoint.apiBaseUri, metadata.path);
		const { mutation, sensitive, retry } = missionControlRequestPolicy(metadata);
		let credential = await withGitHubCredentialDeadline(signal, signal => this.credentials.getCredential(signal), undefined, metadata.options?.deadline);
		let combinedSignal = AbortSignal.any([signal, credential.signal]);
		combinedSignal.throwIfAborted();
		for (let attempt = 0; ; attempt++) {
			let dispatched = false;
			try {
				const response = await this.transport.restText(missionControlAccount(this.endpoint, credential.account), credential.token, {
					method: metadata.method, url: url.href, bodyText, accept: metadata.accept ?? 'application/json',
					apiVersion: this.endpoint.apiVersion ?? null, integrationId: this.endpoint.integrationId,
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
				return {
					data: response.data, status,
					metadata: {
						nextLink: nextLink(response.link),
						nextPath: getNextPagePath(this.endpoint.apiBaseUri, response.finalUrl, response.link),
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
					if (error.responseBody && !sensitive) {
						try {
							details = parseApiError(parseResponseJson<unknown>(error.responseBody, () => new SchemaError('API error body was not JSON')));
						} catch (error) {
							if (!(error instanceof SchemaError)) {
								throw error;
							}
							this.logService.debug('[MissionControlClient] HTTP failure did not contain a supported error envelope');
						}
					}
					throw new ApiRequestError(error.statusCode, error.kind, details, diagnostics.requestId,
						error.responseMetadata.retryAfterSeconds, mutation && dispatched && error.statusCode >= 500 ? 'indeterminate' : undefined, diagnostics);
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
