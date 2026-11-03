/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubCredentials, withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { normalizeReadApiBaseUri, resolveRawContentUrl, resolveReadApiUrl } from '../githubEndpoints.js';
import { GitHubRestTextRequest, IGitHubTransport } from '../githubTransport.js';
import { GitHubRequestError } from '../githubTypes.js';
import { throwGraphQLErrors } from './graphql.js';
import { getNextPagePath } from './pagination.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider, parseRequest } from './request.js';

/** Executes REST, GraphQL, or public raw-content reads through a caller-owned engine. */
export class LocalApiRequestProvider extends BufferedApiRequestProvider {
	private readonly apiBaseUri: string;

	constructor(
		apiBaseUri: string,
		private readonly transport: IGitHubTransport,
		private readonly credentials?: IGitHubCredentials,
		private readonly target: 'rest' | 'graphql' | 'rawContent' = 'rest',
		clientSignal?: AbortSignal,
	) {
		super(clientSignal);
		this.apiBaseUri = normalizeReadApiBaseUri(apiBaseUri);
	}

	protected async execute(request: Omit<ApiRequest, 'body'>, signal: AbortSignal, bodyText?: string): Promise<ApiResponse<string | undefined>> {
		const metadata = parseRequest(request);
		const read = metadata.method === 'GET' || metadata.method === 'HEAD';
		if (bodyText !== undefined && (read || typeof bodyText !== 'string')) {
			throw new GitHubRequestError('GitHub request body must be serialized JSON on a non-read operation', 'validation');
		}
		if (this.target === 'rawContent') {
			if (metadata.method !== 'GET' || metadata.responseBody !== 'text' || metadata.redirect) {
				throw new GitHubRequestError('GitHub raw content only supports text downloads', 'validation');
			}
			if (metadata.authentication === 'required') {
				throw new GitHubRequestError('GitHub raw content downloads must be anonymous', 'authentication');
			}
			const { url, basePath } = resolveRawContentUrl(this.apiBaseUri, metadata.path);
			const response = await this.transport.anonymousDownload({ kind: 'anonymous', host: url.host, origin: url.origin }, basePath, {
				url: url.href, maximumBytes: 1024 * 1024, timeout: 5 * 60_000,
				caller: metadata.options?.caller,
				deadline: metadata.options?.deadline,
				priority: metadata.options?.priority,
				domain: metadata.domain,
			}, signal);
			if (response.truncated) {
				throw new GitHubRequestError('GitHub repository file exceeded its byte limit.', 'responseTooLarge');
			}
			return { data: response.text, status: response.statusCode };
		}
		let graphQLBody: string | undefined;
		if (this.target === 'graphql') {
			if (metadata.method !== 'POST' || metadata.path !== '/' || metadata.redirect
				|| metadata.responseBody !== undefined && metadata.responseBody !== 'json'
				|| metadata.accept !== undefined && metadata.accept !== 'application/json'
				|| bodyText === undefined || bodyText.length === 0) {
				throw new GitHubRequestError('GitHub GraphQL requires a JSON POST to its fixed endpoint', 'validation');
			}
			graphQLBody = bodyText;
		}
		if (!this.credentials && (graphQLBody !== undefined || metadata.authentication === 'required')) {
			throw new GitHubRequestError('GitHub authentication is required', 'authentication');
		}
		const graphQLUri = graphQLBody !== undefined ? new URL(this.apiBaseUri) : undefined;
		const { url, apiBasePath } = graphQLUri ? { url: graphQLUri, apiBasePath: graphQLUri.pathname } : resolveReadApiUrl(this.apiBaseUri, metadata.path);
		const operation: GitHubRestTextRequest = {
			domain: metadata.domain,
			method: metadata.method,
			url: url.href,
			bodyText,
			accept: metadata.accept,
			responseBody: metadata.redirect === 'manual' ? 'none' : metadata.responseBody,
			followRedirects: metadata.redirect === 'manual' ? false : undefined,
			etag: metadata.options?.noCache ? false : undefined,
			caller: metadata.options?.caller,
			deadline: metadata.options?.deadline,
			priority: metadata.options?.priority,
		};
		const credentials = this.credentials;
		if (!credentials) {
			if (metadata.method !== 'GET' && metadata.method !== 'HEAD') {
				throw new GitHubRequestError('GitHub authentication is required', 'authentication');
			}
			const response = await this.transport.anonymousRestText(
				{ kind: 'anonymous', host: url.host, origin: url.origin }, apiBasePath,
				{ ...operation, method: metadata.method }, signal,
			);
			signal.throwIfAborted();
			const nextPath = getNextPagePath(this.apiBaseUri, response.finalUrl, response.link);
			return {
				data: metadata.redirect === 'manual' ? response.redirectUrl : response.data,
				status: response.revalidatedStatusCode ?? response.statusCode,
				...(nextPath === undefined ? {} : { metadata: { nextPath } }),
			};
		}
		const { credential, deadline } = await withGitHubCredentialDeadline(signal, async (signal, deadline) => ({
			credential: await credentials.getCredential(signal), deadline,
		}), undefined, metadata.options?.deadline);
		const operationSignal = AbortSignal.any([signal, credential.signal]);
		operationSignal.throwIfAborted();
		if (credential.account.host.toLowerCase() !== url.host.toLowerCase()) {
			throw new GitHubRequestError('GitHub credential does not match the API endpoint', 'authorization');
		}
		try {
			if (graphQLBody !== undefined) {
				const response = await this.transport.graphqlText(credential.account, credential.token, url.href, graphQLBody, operationSignal, metadata.options?.priority, {
					caller: metadata.options?.caller, domain: metadata.domain, deadline,
				});
				operationSignal.throwIfAborted();
				throwGraphQLErrors(response.errors, response.statusCode, response.data, {
					serverDate: response.serverDate, requestId: response.requestId, retryAfterSeconds: response.retryAfterSeconds,
				});
				return { data: response.data, status: response.statusCode };
			}
			const response = await this.transport.restText(credential.account, credential.token, { ...operation, deadline }, operationSignal);
			operationSignal.throwIfAborted();
			const nextPath = getNextPagePath(this.apiBaseUri, response.finalUrl, response.link);
			return {
				data: metadata.redirect === 'manual' ? response.redirectUrl : response.data,
				status: response.revalidatedStatusCode ?? response.statusCode,
				...(nextPath === undefined ? {} : { metadata: { nextPath } }),
			};
		} catch (error) {
			credentials.handleRequestError(credential, error);
			throw error;
		}
	}
}
