/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { GitHubCredential, IGitHubCredentials } from './githubCredentialService.js';
import { arrayProperty, asObject, nextLink } from './githubResponse.js';
import { GitHubRestRequest, GitHubRestResponse, IGitHubTransport } from './githubTransport.js';
import { GitHubCloudEndpoint, GitHubRequestError, IGitHubEndpointProvider } from './githubTypes.js';
import { AccountHandle } from './types.js';

/** Repository identity used to scope cloud API operations. */
export interface GitHubCloudRepository {
	readonly owner: string;
	readonly name: string;
}

/** Starting page, page size, and page limit for bounded cloud API list requests. */
export interface GitHubCloudListOptions {
	readonly page?: number;
	readonly perPage?: number;
	readonly maxPages?: number;
}

/** Collected cloud items with explicit completeness and a continuation page when capped. */
export type GitHubCloudList<T> = {
	readonly items: readonly T[];
} & ({ readonly complete: true } | { readonly complete: false; readonly nextPage: number });

/** Request parameters and transport policy for a cloud domain operation. */
interface GitHubCloudRequestOptions {
	readonly method: GitHubRestRequest['method'];
	readonly path: string;
	readonly body?: object;
	readonly api?: 'github';
	readonly credential?: boolean;
	readonly responseBody?: 'none';
	readonly accept?: string;
	readonly contentType?: GitHubRestRequest['contentType'];
}

/** Runs a request with the operation's captured credentials and parses its response. */
export type GitHubCloudRequest = <T>(options: GitHubCloudRequestOptions, parse: (response: GitHubRestResponse<unknown>) => T) => Promise<T>;

/** A dispatched write could not be confirmed. Callers must reconcile, never blindly replay it. */
export class GitHubCloudMutationUncertainError extends GitHubRequestError {
	readonly outcome = 'indeterminate';

	constructor(statusCode?: number) {
		super('GitHub may have accepted the cloud operation; reconcile before trying again', 'unknown', statusCode);
	}
}

/** Shares the owning client's credentials and transport without owning another network engine. */
export class GitHubCloudApi extends Disposable {
	constructor(
		private readonly _cloud: GitHubCloudEndpoint | undefined,
		private readonly _endpoint: IGitHubEndpointProvider,
		private readonly _credentials: IGitHubCredentials,
		private readonly _transport: IGitHubTransport,
	) {
		super();
		this._register(_credentials.onDidInvalidate(event => {
			if (_cloud && event.credential) {
				_transport.invalidateAccount(this._account(event.credential, _cloud));
			}
		}));
	}

	async run<T>(caller: string, signal: AbortSignal, task: (request: GitHubCloudRequest) => Promise<T>): Promise<T> {
		signal.throwIfAborted();
		if (!this._cloud) {
			throw new GitHubRequestError('This GitHub client has no approved cloud endpoint', 'validation');
		}
		const cloud = this._cloud;
		const credential = await this._credentials.getCredential(signal);
		const controller = new AbortController();
		const combinedSignal = AbortSignal.any([signal, credential.signal, controller.signal]);
		const request: GitHubCloudRequest = async (options, parse) => {
			combinedSignal.throwIfAborted();
			const apiBaseUri = options.api === 'github' ? this._endpoint.getApiBaseUri() : cloud.apiBaseUri;
			const url = new URL(`${apiBaseUri}${options.path}`);
			const base = new URL(apiBaseUri);
			if (!options.path.startsWith('/') || url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/+$/, '')}/`) || url.username || url.password || url.hash) {
				throw new GitHubRequestError('GitHub cloud request escaped its approved endpoint', 'validation');
			}
			let dispatched = false;
			try {
				const response = await this._transport.rest<unknown>(options.api === 'github' ? credential.account : this._account(credential, cloud), credential.token, {
					method: options.method,
					url: url.href,
					body: options.body,
					accept: options.accept ?? (options.api === 'github' ? 'application/vnd.github+json' : 'application/json'),
					apiVersion: options.api === 'github' ? undefined : cloud.apiVersion ?? null,
					contentType: options.contentType,
					caller,
					agents: options.api === 'github' ? undefined : {
						integrationId: cloud.integrationId,
						credential: options.credential,
						responseBody: options.responseBody,
						onDispatch: () => { dispatched = true; },
					},
				}, combinedSignal);
				combinedSignal.throwIfAborted();
				return parse(response);
			} catch (error) {
				this._credentials.handleRequestError(credential, error);
				if (dispatched && (options.method !== 'GET' || options.credential)
					&& !(error instanceof GitHubRequestError && error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500)) {
					throw new GitHubCloudMutationUncertainError(error instanceof GitHubRequestError ? error.statusCode : undefined);
				}
				throw error;
			}
		};
		try {
			return await task(request);
		} finally {
			controller.abort();
		}
	}

	private _account(credential: GitHubCredential, cloud: GitHubCloudEndpoint): AccountHandle {
		return {
			host: new URL(cloud.apiBaseUri).host,
			accountId: JSON.stringify([credential.account.host.toLowerCase(), credential.account.accountId]),
		};
	}
}

export function normalizeGitHubCloudEndpoint(value: GitHubCloudEndpoint): GitHubCloudEndpoint {
	let url: URL;
	try {
		url = new URL(value.apiBaseUri);
	} catch {
		throw new GitHubRequestError('Invalid GitHub cloud endpoint', 'validation');
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
		|| typeof value.integrationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value.integrationId)
		|| value.apiVersion !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value.apiVersion)) {
		throw new GitHubRequestError('Invalid GitHub cloud endpoint or headers', 'validation');
	}
	return Object.freeze({ apiBaseUri: url.href.replace(/\/+$/, ''), integrationId: value.integrationId, apiVersion: value.apiVersion });
}

export function cloudPathSegment(value: string): string {
	if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') {
		throw new GitHubRequestError('Invalid GitHub cloud identifier', 'validation');
	}
	return encodeURIComponent(value);
}

export function cloudRepositoryPath(repository: GitHubCloudRepository): string {
	return `${cloudPathSegment(repository.owner)}/${cloudPathSegment(repository.name)}`;
}

export function cloudQuery(path: string, parameters: Readonly<Record<string, string | number | boolean | undefined>>): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(parameters)) {
		if (value !== undefined) {
			query.set(key, String(value));
		}
	}
	return query.size > 0 ? `${path}?${query}` : path;
}

export function cloudPagination(options: GitHubCloudListOptions = {}): { page: number; perPage: number; maxPages: number } {
	const page = options.page ?? 1;
	const perPage = options.perPage ?? 100;
	const maxPages = options.maxPages ?? 10;
	if (!Number.isSafeInteger(page) || page < 1 || page > Number.MAX_SAFE_INTEGER - 10
		|| !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100
		|| !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) {
		throw new GitHubRequestError('Invalid GitHub cloud pagination', 'validation');
	}
	return { page, perPage, maxPages };
}

export async function collectCloudPages<T>(
	request: GitHubCloudRequest,
	path: string,
	property: string,
	options: ReturnType<typeof cloudPagination>,
	parameters: Readonly<Record<string, string | number | boolean | undefined>>,
	parse: (item: unknown) => T | Promise<T>,
): Promise<GitHubCloudList<T>> {
	const { page: firstPage, perPage, maxPages } = options;
	const items: T[] = [];
	for (let page = firstPage; page < firstPage + maxPages; page++) {
		const response = await request({ method: 'GET', path: cloudQuery(path, { ...parameters, page, per_page: perPage }) }, response => {
			cloudStatus(response, 200, 304);
			return { items: arrayProperty(cloudObject(response.data), property), next: nextLink(response.link) !== undefined };
		});
		if (response.items.length > perPage || response.next && response.items.length === 0) {
			throw new GitHubRequestError('GitHub cloud page was inconsistent', 'malformedResponse');
		}
		for (let offset = 0; offset < response.items.length; offset += 5) {
			items.push(...await Promise.all(response.items.slice(offset, offset + 5).map(async item => parse(item))));
		}
		if (!response.next) {
			return { items, complete: true };
		}
	}
	return { items, complete: false, nextPage: firstPage + maxPages };
}

export function cloudStatus(response: GitHubRestResponse<unknown>, ...statuses: readonly number[]): void {
	if (!statuses.includes(response.statusCode)) {
		throw new GitHubRequestError('GitHub cloud response had an unexpected status', 'malformedResponse', response.statusCode);
	}
}

export function cloudObject(value: unknown): object {
	return asObject(value, 'GitHub cloud response was malformed');
}

export function cloudOptionalString(value: object, key: string): string | undefined {
	const property: unknown = Reflect.get(value, key);
	if (property !== undefined && typeof property !== 'string') {
		throw new GitHubRequestError(`GitHub cloud response property ${key} was not a string`, 'malformedResponse');
	}
	return property;
}

export function cloudNullableString(value: object, key: string): string | null | undefined {
	return Reflect.get(value, key) === null ? null : cloudOptionalString(value, key);
}

export function cloudOptionalBoolean(value: object, key: string): boolean | undefined {
	const property: unknown = Reflect.get(value, key);
	if (property !== undefined && typeof property !== 'boolean') {
		throw new GitHubRequestError(`GitHub cloud response property ${key} was not a boolean`, 'malformedResponse');
	}
	return property;
}

export function cloudTimestamp(value: string): string {
	if (!Number.isFinite(Date.parse(value))) {
		throw new GitHubRequestError('GitHub cloud response had an invalid timestamp', 'malformedResponse');
	}
	return value;
}
