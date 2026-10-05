/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubCancellation, toAbortSignal } from './cancellation.js';
import { resolveReadApiUrl } from './githubEndpoints.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { asObject, requiredInteger, requiredSha, requiredString } from './githubResponse.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse, GitHubTransport } from './githubTransport.js';
import { GitHubRequestError, GitHubServiceOptions } from './githubTypes.js';
import { encodePathSegments } from './githubUrls.js';
import { RequestQueue } from './requestQueue.js';
import { AnonymousAccount } from './types.js';

/** Decoded repository file content paired with the commit SHA it was read from. */
export interface IGitHubRepositoryFile {
	readonly commitSha: string;
	readonly content: string;
}

/** Read-only access to public GitHub resources without authentication. */
export interface IGitHubAnonymousClient {
	readonly authorization: { readonly kind: 'anonymous' };
	readonly apiBaseUri: string;
	/** Reads JSON from an API-relative path. */
	get<T>(path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<T>>;
	/** Reads a file at the resolved repository HEAD. */
	readFile(owner: string, repo: string, path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<IGitHubRepositoryFile>;
}

/** Fetches public GitHub API data and repository files without authentication. */
export class GitHubAnonymousClient extends Disposable implements IGitHubAnonymousClient {
	readonly authorization = Object.freeze({ kind: 'anonymous' as const });
	references = 0;
	private readonly _account: AnonymousAccount;
	private readonly _transport: GitHubTransport;

	constructor(
		readonly apiBaseUri: string,
		options: GitHubServiceOptions,
		queue: RequestQueue,
		rateLimits: GitHubRateLimitCoordinator,
		telemetry: GitHubRequestTelemetry,
		logService: ILogService,
	) {
		super();
		const { host, origin } = new URL(apiBaseUri);
		this._account = { kind: 'anonymous', host, origin };
		this._transport = this._register(new GitHubTransport(options.fetch, undefined, false, logService, {
			coordination: { queue, rateLimits },
			requestMetadata: options.clientMetadata ? new GitHubRequestMetadata(options.clientMetadata, {
				onDidChange: Event.None,
				getApiBaseUri: () => apiBaseUri,
				getGraphQlUri: () => apiBaseUri,
			}) : undefined,
		}, telemetry));
	}

	async get<T>(path: string, signal: GitHubCancellation, options: GitHubAnonymousReadOptions = {}): Promise<GitHubRestResponse<T>> {
		const lifetime = new DisposableStore();
		try {
			const abortSignal = toAbortSignal(signal, lifetime);
			abortSignal.throwIfAborted();

			const { url, apiBasePath } = resolveReadApiUrl(this.apiBaseUri, path);
			return await this._transport.anonymousGet<T>(this._account, apiBasePath, { ...options, url: url.href }, abortSignal);
		} finally {
			lifetime.dispose();
		}
	}

	async readFile(owner: string, repo: string, path: string, signal: GitHubCancellation, options: GitHubAnonymousReadOptions = {}): Promise<IGitHubRepositoryFile> {
		const lifetime = new DisposableStore();
		try {
			const abortSignal = toAbortSignal(signal, lifetime);
			abortSignal.throwIfAborted();

			const requestOptions: GitHubAnonymousReadOptions = { ...options, deadline: options.deadline ?? Date.now() + 5 * 60_000 };
			const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

			const commitResponse = await this.get<unknown>(`${repositoryPath}/commits/HEAD`, abortSignal, requestOptions);
			abortSignal.throwIfAborted();
			const commitSha = requiredSha(asObject(commitResponse.data, 'GitHub returned an invalid repository revision.'), 'sha');

			const fileResponse = await this.get<unknown>(`${repositoryPath}/contents/${encodePathSegments(path)}?ref=${commitSha}`, abortSignal, requestOptions);
			abortSignal.throwIfAborted();
			const file = asObject(fileResponse.data, 'GitHub returned an invalid repository file.');
			if (requiredString(file, 'type') !== 'file' || requiredString(file, 'encoding') !== 'base64') {
				throw new GitHubRequestError('GitHub did not return a base64-encoded repository file.', 'malformedResponse');
			}

			const size = requiredInteger(file, 'size', 0, 1024 * 1024);
			const encoded = requiredString(file, 'content').replace(/\s/g, '');
			const invalidContent = 'GitHub returned invalid base64 repository file contents.';
			if (encoded.length !== Math.ceil(size / 3) * 4) {
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}

			let decoded: VSBuffer;
			try {
				decoded = decodeBase64(encoded);
			} catch (error) {
				if (!(error instanceof SyntaxError)) {
					throw error;
				}
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}

			if (decoded.byteLength !== size) {
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}

			return { commitSha, content: decoded.toString() };
		} finally {
			lifetime.dispose();
		}
	}
}
