/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubCancellation, toAbortSignal } from './cancellation.js';
import { resolveReadApiUrl } from './githubEndpoints.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { asObject, requiredNumber, requiredString } from './githubResponse.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse, GitHubTransport } from './githubTransport.js';
import { GitHubRequestError, GitHubServiceOptions } from './githubTypes.js';
import { RequestQueue } from './requestQueue.js';
import { AnonymousAccount } from './types.js';

export interface IGitHubRepositoryFile {
	readonly commitSha: string;
	readonly content: string;
}

/** Credential-free public JSON reads confined to an approved API base. */
export interface IGitHubAnonymousClient {
	readonly authorization: { readonly kind: 'anonymous' };
	readonly apiBaseUri: string;
	get<T>(path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<T>>;
	/** Reads a file at the resolved repository HEAD using the owning client's API endpoint. */
	readFile(owner: string, repo: string, path: string, signal: GitHubCancellation, options?: GitHubAnonymousReadOptions): Promise<IGitHubRepositoryFile>;
}

/** Reference-counted public reader with no access to credential providers or private caches. */
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
		const endpoint = new URL(apiBaseUri);
		this._account = { kind: 'anonymous', host: endpoint.host, origin: endpoint.origin };
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
			const invalidCommit = localize('githubRepository.invalidCommit', "GitHub returned an invalid repository revision.");
			const commitSha = requiredString(asObject(commitResponse.data, invalidCommit), 'sha');
			if (!/^[a-f0-9]{40}$/.test(commitSha)) {
				throw new GitHubRequestError(invalidCommit, 'malformedResponse');
			}
			const fileResponse = await this.get<unknown>(`${repositoryPath}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commitSha}`, abortSignal, requestOptions);
			abortSignal.throwIfAborted();
			const file = asObject(fileResponse.data, localize('githubRepository.invalidFile', "GitHub returned an invalid repository file."));
			if (requiredString(file, 'type') !== 'file' || requiredString(file, 'encoding') !== 'base64') {
				throw new GitHubRequestError(localize('githubRepository.unsupportedFile', "GitHub did not return a base64-encoded repository file."), 'malformedResponse');
			}
			const size = requiredNumber(file, 'size');
			if (!Number.isSafeInteger(size) || size < 0 || size > 1024 * 1024) {
				throw new GitHubRequestError(localize('githubRepository.invalidSize', "GitHub returned an invalid repository file size. Files must not exceed 1 MiB."), 'malformedResponse');
			}
			const encoded = requiredString(file, 'content').replace(/[\r\n]/g, '');
			const invalidContent = localize('githubRepository.invalidContent', "GitHub returned invalid base64 repository file contents.");
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
			if (decoded.byteLength !== size || encodeBase64(decoded) !== encoded) {
				throw new GitHubRequestError(invalidContent, 'malformedResponse');
			}
			return { commitSha, content: decoded.toString() };
		} finally {
			lifetime.dispose();
		}
	}
}
