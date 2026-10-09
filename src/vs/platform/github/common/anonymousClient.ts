/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubCancellation, toAbortSignal } from './cancellation.js';
import { encodePathSegments } from './client/routing.js';
import { resolveReadApiUrl } from './githubEndpoints.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { asObject, requiredSha } from './githubResponse.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse, GitHubTransport } from './githubTransport.js';
import { GitHubRequestError, GitHubServiceOptions } from './githubTypes.js';
import { RequestQueue } from './requestQueue.js';
import { AnonymousAccount } from './types.js';

/** Decoded repository file content paired with the commit SHA it was read from. */
export interface IGitHubRepositoryFile {

	/** Commit SHA of the repository revision the file was read from. */
	readonly commitSha: string;

	/** File contents decoded as UTF-8 text. */
	readonly content: string;
}

/** Read-only access to public GitHub resources without authentication. */
export interface IGitHubAnonymousClient {

	readonly authorization: { readonly kind: 'anonymous' };
	readonly apiBaseUri: string;

	/** Reads JSON from an API-relative path. */
	get<T>(path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<T>>;

	/** Reads a file at the resolved repository HEAD. */
	getFile(owner: string, repo: string, path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<IGitHubRepositoryFile>;
}

/** Fetches public GitHub API data and repository files without authentication. */
export class GitHubAnonymousClient extends Disposable implements IGitHubAnonymousClient {

	readonly authorization = Object.freeze({ kind: 'anonymous' as const });
	references = 0;
	private readonly _account: AnonymousAccount;
	private readonly _transport: GitHubTransport;

	constructor(
		readonly apiBaseUri: string,
		private readonly _rawBaseUri: string | undefined,
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

	async getFile(owner: string, repo: string, path: string, signal: GitHubCancellation, options: GitHubAnonymousReadOptions = {}): Promise<IGitHubRepositoryFile> {
		const lifetime = new DisposableStore();
		try {
			const abortSignal = toAbortSignal(signal, lifetime);
			abortSignal.throwIfAborted();

			if (!this._rawBaseUri) {
				throw new GitHubRequestError('GitHub raw-content endpoint is not configured for this host.', 'validation');
			}

			const requestOptions: GitHubAnonymousReadOptions = { ...options, deadline: options.deadline ?? Date.now() + 5 * 60_000 };
			const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

			const commitResponse = await this.get<unknown>(`${repositoryPath}/commits/HEAD`, abortSignal, requestOptions);
			abortSignal.throwIfAborted();
			const commitSha = requiredSha(asObject(commitResponse.data, 'GitHub returned an invalid repository revision.'), 'sha');

			const base = new URL(`${this._rawBaseUri}/`);
			const root = new URL(`${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${commitSha}/`, base);
			const url = new URL(encodePathSegments(path), root);
			if (root.origin !== base.origin
				|| !root.pathname.startsWith(base.pathname)
				|| !url.href.startsWith(root.href)
				|| url.href === root.href) {
				throw new GitHubRequestError('GitHub file path escaped its pinned repository revision.', 'validation');
			}

			const file = await this._transport.anonymousDownload({ kind: 'anonymous', host: root.host, origin: root.origin }, root.pathname, {
				url: url.href,
				maximumBytes: 1024 * 1024,
				timeout: 5 * 60_000,
				caller: requestOptions.caller,
				priority: requestOptions.priority,
				deadline: requestOptions.deadline,
			}, abortSignal);

			abortSignal.throwIfAborted();
			if (file.truncated) {
				throw new GitHubRequestError('GitHub repository file exceeded its byte limit.', 'responseTooLarge');
			}

			return { commitSha, content: file.text };
		} finally {
			lifetime.dispose();
		}
	}
}
