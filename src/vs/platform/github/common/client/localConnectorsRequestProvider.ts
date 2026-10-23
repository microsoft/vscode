/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubCredentials, withGitHubCredentialDeadline } from '../githubCredentialService.js';
import { normalizeReadApiBaseUri, resolveReadApiUrl } from '../githubEndpoints.js';
import { IGitHubTransport } from '../githubTransport.js';
import { GitHubRequestError } from '../githubTypes.js';
import { AccountHandle, RequestError } from '../types.js';
import { ApiRequest, ApiResponse, BufferedApiRequestProvider, parseRequest } from './request.js';
import { pathSegment } from './routing.js';

export function connectorsAccount(host: string, account: AccountHandle): AccountHandle {
	return account.host.toLowerCase() === host.toLowerCase() ? account : {
		host, accountId: JSON.stringify([account.host.toLowerCase(), account.accountId]),
	};
}

/** Enforces Connector routes and bounds while leaving credential authorization to the service. */
export class LocalConnectorsRequestProvider extends BufferedApiRequestProvider {
	constructor(
		private readonly apiBaseUri: string,
		private readonly credentials: IGitHubCredentials,
		private readonly transport: IGitHubTransport,
		clientSignal?: AbortSignal,
	) {
		super(clientSignal);
	}

	protected async execute(request: Omit<ApiRequest, 'body'>, signal: AbortSignal, bodyText?: string): Promise<ApiResponse<string | undefined>> {
		const metadata = parseRequest(request);
		const catalog = metadata.method === 'GET' && metadata.path === '/plugins';
		const disconnect = metadata.method === 'DELETE';

		if ((disconnect ? metadata.responseBody !== 'none' : metadata.responseBody !== undefined && metadata.responseBody !== 'json') || metadata.redirect
			|| (metadata.method === 'PUT' ? bodyText !== '{"client_source":"VS_CODE"}' : bodyText !== undefined)) {
			throw new GitHubRequestError('Invalid Copilot connectors operation', 'validation');
		}

		if (!catalog) {
			const match = /^\/connectors\/managed\/(?<name>[^/?#]+)\/connection$/.exec(metadata.path);
			if (!(metadata.method === 'PUT' || metadata.method === 'DELETE') || !match?.groups) {
				throw new GitHubRequestError('Invalid Copilot connectors operation', 'validation');
			}
			let name: string;
			try {
				name = decodeURIComponent(match.groups.name);
			} catch {
				throw new GitHubRequestError('Invalid Copilot connector name encoding', 'validation');
			}
			if (name.length > 4096 || pathSegment(name) !== match.groups.name) {
				throw new GitHubRequestError('Invalid Copilot connector name', 'validation');
			}
		}

		const { url } = resolveReadApiUrl(normalizeReadApiBaseUri(this.apiBaseUri), metadata.path);
		const credential = await withGitHubCredentialDeadline(signal, signal => this.credentials.getCredential(signal), undefined, metadata.options?.deadline);
		const combinedSignal = AbortSignal.any([signal, credential.signal]);
		combinedSignal.throwIfAborted();

		try {
			const response = await this.transport.restText(connectorsAccount(url.host, credential.account), credential.token, {
				domain: 'connectors',
				method: metadata.method,
				url: url.href,
				bodyText,
				accept: 'application/json',
				apiVersion: null,
				responseBody: metadata.responseBody,
				maximumResponseBytes: 5 * 1024 * 1024,
				etag: catalog && !metadata.options?.noCache,
				coalesce: false,
				retry: false,
				followRedirects: false,
				caller: metadata.options?.caller ?? 'copilotConnectors',
				deadline: metadata.options?.deadline,
				priority: metadata.options?.priority,
			}, combinedSignal);

			combinedSignal.throwIfAborted();

			const status = response.revalidatedStatusCode ?? response.statusCode;
			if (status !== (disconnect ? 204 : 200)) {
				throw new GitHubRequestError('Copilot connectors returned an unexpected status', 'malformedResponse', status);
			}

			return { data: response.data, status };
		} catch (error) {
			signal.throwIfAborted();
			this.credentials.handleRequestError(credential, error);
			if (error instanceof RequestError) {
				throw new GitHubRequestError('Copilot connectors request failed', error.kind, error.statusCode);
			}
			throw error;
		}
	}
}
