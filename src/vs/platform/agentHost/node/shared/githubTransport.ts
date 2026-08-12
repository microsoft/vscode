/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { GitHubAccountHandle, GitHubRequestErrorKind, GitHubRequestPriority } from '../../common/githubService.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestQueue } from './githubRequestQueue.js';
import { IGitHubScheduler, schedulerDelay, systemGitHubScheduler } from './githubScheduler.js';

export type FetchFunction = typeof globalThis.fetch;

export const IGitHubTransport = createDecorator<IGitHubTransport>('gitHubTransport');

export interface IGitHubTransport {
	readonly _serviceBrand: undefined;
	readonly rateLimits: GitHubRateLimitCoordinator;
	rest<T>(account: GitHubAccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>>;
	graphql<T>(account: GitHubAccountHandle, token: string, url: string, query: string, variables: Readonly<Record<string, unknown>>, signal: AbortSignal, priority?: GitHubRequestPriority): Promise<GitHubGraphQLResponse<T>>;
	invalidateAccount(account: GitHubAccountHandle, reason?: unknown): void;
	clear(): void;
}

export interface GitHubGraphQLError {
	readonly message?: string;
	readonly type?: string;
	readonly path?: readonly (string | number)[];
}

export class GitHubRequestError extends Error {

	constructor(
		message: string,
		readonly kind: GitHubRequestErrorKind,
		readonly statusCode?: number,
		readonly responseBody?: string,
		readonly graphQLErrors?: readonly GitHubGraphQLError[],
	) {
		super(message);
		this.name = 'GitHubRequestError';
	}
}

export interface GitHubRestRequest {
	readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	readonly url: string;
	readonly body?: object;
	readonly accept?: string;
	readonly apiVersion?: string;
	readonly representationVersion?: number;
	readonly etag?: boolean;
	readonly unconditional?: boolean;
	readonly priority?: GitHubRequestPriority;
}

export interface GitHubRestResponse<T> {
	readonly data: T | undefined;
	readonly statusCode: number;
	readonly etag?: string;
	readonly finalUrl: string;
	readonly link?: string;
	readonly observedAt: number;
}

export interface GitHubGraphQLResponse<T> {
	readonly data: T | undefined;
	readonly errors: readonly GitHubGraphQLError[];
	readonly observedAt: number;
}

interface IRestCacheEntry {
	readonly accountKey: string;
	readonly etag: string;
	readonly body: string;
	readonly finalUrl: string;
	readonly fetchedAt: number;
	readonly link?: string;
	readonly representationVersion: number;
}

interface ISharedRequest {
	readonly controller: AbortController;
	readonly promise: Promise<GitHubRestResponse<unknown>>;
	waiters: number;
}

interface ISharedGraphQLRequest {
	readonly controller: AbortController;
	readonly promise: Promise<GitHubGraphQLResponse<unknown>>;
	waiters: number;
}

type RateLimitQueueResult<T> = { readonly blocked: true } | { readonly blocked: false; readonly value: T };

const defaultApiVersion = '2022-11-28';
const maximumErrorBodyLength = 500;
const maximumRedirects = 5;

export class GitHubTransport extends Disposable implements IGitHubTransport {

	declare readonly _serviceBrand: undefined;

	private readonly _fetch: FetchFunction;
	private readonly _queue: GitHubRequestQueue;
	private readonly _rateLimits: GitHubRateLimitCoordinator;
	private readonly _restCache = new LRUCache<string, IRestCacheEntry>(500);
	private readonly _redirects = new Map<string, string>();
	private readonly _inFlight = new Map<string, ISharedRequest>();
	private readonly _graphQlInFlight = new Map<string, ISharedGraphQLRequest>();

	constructor(
		fetchFn: FetchFunction | undefined,
		private readonly _scheduler: IGitHubScheduler = systemGitHubScheduler,
	) {
		super();
		this._fetch = fetchFn ?? globalThis.fetch;
		this._queue = this._register(new GitHubRequestQueue());
		this._rateLimits = this._register(new GitHubRateLimitCoordinator(_scheduler));
	}

	get rateLimits(): GitHubRateLimitCoordinator {
		return this._rateLimits;
	}

	async rest<T>(account: GitHubAccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>> {
		const finalUrl = this._redirects.get(request.url) ?? request.url;
		const cacheKey = this._restCacheKey(account, request, finalUrl);
		if (request.method !== 'GET') {
			return this._executeRest<T>(account, token, request, signal, cacheKey);
		}

		const coalescingKey = this._restCoalescingKey(account, request, finalUrl);
		let shared = this._inFlight.get(coalescingKey);
		if (!shared) {
			const controller = new AbortController();
			const promise = this._executeRest<unknown>(account, token, request, controller.signal, cacheKey);
			shared = { controller, promise, waiters: 0 };
			this._inFlight.set(coalescingKey, shared);
			const created = shared;
			void promise.then(
				() => this._deleteRestRequest(coalescingKey, created),
				() => this._deleteRestRequest(coalescingKey, created),
			);
		}
		shared.waiters++;
		try {
			return await this._waitForShared<T>(shared, signal);
		} finally {
			shared.waiters--;
			if (shared.waiters === 0 && this._inFlight.get(coalescingKey) === shared) {
				this._inFlight.delete(coalescingKey);
				shared.controller.abort(new Error('All GitHub request waiters cancelled'));
			}
		}
	}

	async graphql<T>(
		account: GitHubAccountHandle,
		token: string,
		url: string,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
		priority: GitHubRequestPriority = 'interactive',
	): Promise<GitHubGraphQLResponse<T>> {
		if (/^\s*mutation\b/i.test(query)) {
			return this._executeGraphQL<T>(account, token, url, query, variables, signal, priority);
		}
		const key = `${GitHubRequestQueue.accountKey(account)}\x00${url}\x00${query}\x00${canonicalJson(variables)}`;
		let shared = this._graphQlInFlight.get(key);
		if (!shared) {
			const controller = new AbortController();
			const promise = this._executeGraphQL<unknown>(account, token, url, query, variables, controller.signal, priority);
			shared = { controller, promise, waiters: 0 };
			this._graphQlInFlight.set(key, shared);
			const created = shared;
			void promise.then(
				() => this._deleteGraphQLRequest(key, created),
				() => this._deleteGraphQLRequest(key, created),
			);
		}
		shared.waiters++;
		try {
			return await this._waitForSharedGraphQL<T>(shared, signal);
		} finally {
			shared.waiters--;
			if (shared.waiters === 0 && this._graphQlInFlight.get(key) === shared) {
				this._graphQlInFlight.delete(key);
				shared.controller.abort(new Error('All GitHub GraphQL request waiters cancelled'));
			}
		}
	}

	private async _executeGraphQL<T>(
		account: GitHubAccountHandle,
		token: string,
		url: string,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
		priority: GitHubRequestPriority,
	): Promise<GitHubGraphQLResponse<T>> {
		return this._enqueueWithRateLimit(account, 'graphql', priority, signal, async () => {
			const response = await this._fetchWithRetry(url, {
				method: 'POST',
				cache: 'no-store',
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${token}`,
					'Cache-Control': 'no-store',
					'Content-Type': 'application/json',
					'X-GitHub-Api-Version': defaultApiVersion,
				},
				body: JSON.stringify({ query, variables }),
				signal,
				redirect: 'manual',
			}, !/^\s*mutation\b/i.test(query));
			const body = response.status === 204 ? '' : await response.text();
			this._rateLimits.updateFromResponse(account, response, body);
			if (!response.ok) {
				throw this._httpError('GitHub GraphQL request failed', response, body);
			}
			const json = this._parseJson<{ data?: T; errors?: readonly GitHubGraphQLError[] }>(body, 'GitHub GraphQL response was not valid JSON');
			const errors = Array.isArray(json.errors) ? json.errors : [];
			const rateLimit = readGraphQLRateLimit(json.data);
			this._rateLimits.updateFromGraphQL(account, rateLimit);
			if (errors.some(error => error.type === 'RATE_LIMITED')) {
				this._rateLimits.markGraphQLRateLimited(account);
			}
			return { data: json.data, errors, observedAt: this._scheduler.now() };
		});
	}

	invalidateAccount(account: GitHubAccountHandle, reason?: unknown): void {
		const accountKey = GitHubRequestQueue.accountKey(account);
		this._queue.cancelAccount(account, reason);
		this._rateLimits.clearAccount(account);
		const cacheKeys: string[] = [];
		for (const [key, entry] of this._restCache) {
			if (entry.accountKey === accountKey) {
				cacheKeys.push(key);
			}
		}
		for (const key of cacheKeys) {
			this._restCache.delete(key);
		}
		for (const [key, request] of this._inFlight) {
			if (key.startsWith(`${accountKey}\x00`)) {
				this._inFlight.delete(key);
				request.controller.abort(reason);
			}
		}
		for (const [key, request] of this._graphQlInFlight) {
			if (key.startsWith(`${accountKey}\x00`)) {
				this._graphQlInFlight.delete(key);
				request.controller.abort(reason);
			}
		}
	}

	clear(): void {
		this._restCache.clear();
		this._redirects.clear();
		for (const request of this._inFlight.values()) {
			request.controller.abort(new Error('GitHub transport state was cleared'));
		}
		this._inFlight.clear();
		for (const request of this._graphQlInFlight.values()) {
			request.controller.abort(new Error('GitHub transport state was cleared'));
		}
		this._graphQlInFlight.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private async _executeRest<T>(
		account: GitHubAccountHandle,
		token: string,
		request: GitHubRestRequest,
		signal: AbortSignal,
		cacheKey: string,
	): Promise<GitHubRestResponse<T>> {
		return this._enqueueWithRateLimit(account, 'core', request.priority ?? (request.method === 'GET' ? 'interactive' : 'mutation'), signal, async () => {
			const cached = request.etag !== false && !request.unconditional ? this._restCache.get(cacheKey) : undefined;
			const headers: Record<string, string> = {
				'Accept': request.accept ?? 'application/vnd.github+json',
				'Authorization': `Bearer ${token}`,
				'Cache-Control': 'no-store',
				'X-GitHub-Api-Version': request.apiVersion ?? defaultApiVersion,
			};
			if (cached) {
				headers['If-None-Match'] = cached.etag;
			}
			if (request.body !== undefined) {
				headers['Content-Type'] = 'application/json';
			}
			const response = await this._fetchRestWithRedirects(account, request.url, {
				method: request.method,
				cache: 'no-store',
				headers,
				body: request.body === undefined ? undefined : JSON.stringify(request.body),
				signal,
				redirect: 'manual',
			}, request.method === 'GET');
			const finalUrl = response.url || this._redirects.get(request.url) || request.url;
			const body = response.status === 204 || response.status === 304 ? '' : await response.text();
			this._rateLimits.updateFromResponse(account, response, body);
			if (response.status === 304) {
				if (!cached || response.headers.get('etag') !== null && response.headers.get('etag') !== cached.etag) {
					throw new GitHubRequestError('GitHub returned 304 without the exact cached representation', 'malformedResponse', 304);
				}
				return {
					data: this._parseJson<T>(cached.body, 'Cached GitHub response was not valid JSON'),
					statusCode: 304,
					etag: cached.etag,
					finalUrl: cached.finalUrl,
					link: cached.link,
					observedAt: this._scheduler.now(),
				};
			}
			if (!response.ok) {
				const requestUrl = new URL(request.url);
				const route = `${requestUrl.pathname.replace(/^\//, '')}${requestUrl.search}`;
				throw this._httpError(`GitHub API request failed: ${request.method} ${route}`, response, body);
			}
			const responseEtag = response.headers.get('etag') ?? undefined;
			const representationVersion = request.representationVersion ?? 1;
			const finalCacheKey = this._restCacheKey(account, request, finalUrl);
			if (request.method === 'GET' && request.etag !== false) {
				if (responseEtag) {
					const entry: IRestCacheEntry = {
						accountKey: GitHubRequestQueue.accountKey(account),
						etag: responseEtag,
						body,
						finalUrl,
						fetchedAt: this._scheduler.now(),
						link: response.headers.get('link') ?? undefined,
						representationVersion,
					};
					this._restCache.set(finalCacheKey, entry);
					if (finalCacheKey !== cacheKey) {
						this._restCache.delete(cacheKey);
						this._redirects.set(request.url, finalUrl);
					}
				} else {
					this._restCache.delete(cacheKey);
					this._restCache.delete(finalCacheKey);
				}
			}
			return {
				data: body ? this._parseJson<T>(body, 'GitHub response was not valid JSON') : undefined,
				statusCode: response.status,
				etag: responseEtag,
				finalUrl,
				link: response.headers.get('link') ?? undefined,
				observedAt: this._scheduler.now(),
			};
		});
	}

	private async _enqueueWithRateLimit<T>(
		account: GitHubAccountHandle,
		resource: string,
		priority: GitHubRequestPriority,
		signal: AbortSignal,
		task: () => Promise<T>,
	): Promise<T> {
		while (true) {
			await this._rateLimits.wait(account, resource, signal);
			const result = await this._queue.enqueue<RateLimitQueueResult<T>>(account, priority, signal, async () => {
				if (this._rateLimits.getDelay(account, resource) > 0) {
					return { blocked: true };
				}
				return { blocked: false, value: await task() };
			});
			if (!result.blocked) {
				return result.value;
			}
		}
	}

	private async _fetchRestWithRedirects(account: GitHubAccountHandle, initialUrl: string, init: RequestInit, retry: boolean): Promise<Response> {
		let url = this._redirects.get(initialUrl) ?? initialUrl;
		const initialOrigin = new URL(url).origin;
		for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
			const response = await this._fetchWithRetry(url, init, retry);
			if (![301, 302, 307, 308].includes(response.status)) {
				if (url !== initialUrl) {
					this._redirects.set(initialUrl, url);
				}
				return response;
			}
			const location = response.headers.get('location');
			if (!location) {
				throw new GitHubRequestError('GitHub redirect was missing a Location header', 'malformedResponse', response.status);
			}
			url = new URL(location, url).href;
			if (new URL(url).origin !== initialOrigin) {
				throw new GitHubRequestError('GitHub redirect changed origin', 'authorization', response.status);
			}
		}
		throw new GitHubRequestError('GitHub API request exceeded the redirect limit', 'unknown');
	}

	private async _fetchWithRetry(url: string, init: RequestInit, retry: boolean): Promise<Response> {
		let failure: unknown;
		for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
			try {
				const response = await this._fetch(url, init);
				if (retry && attempt === 0 && response.status >= 500) {
					await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), init.signal as AbortSignal);
					continue;
				}
				return response;
			} catch (error) {
				if ((init.signal as AbortSignal).aborted) {
					throw error;
				}
				failure = error;
				if (attempt === 0 && retry) {
					await schedulerDelay(this._scheduler, 100 + this._scheduler.jitter(200), init.signal as AbortSignal);
				}
			}
		}
		throw new GitHubRequestError(`GitHub network request failed: ${String(failure)}`, 'network');
	}

	private _restCacheKey(account: GitHubAccountHandle, request: GitHubRestRequest, url: string): string {
		return [
			GitHubRequestQueue.accountKey(account),
			request.method,
			url,
			request.accept ?? 'application/vnd.github+json',
			request.apiVersion ?? defaultApiVersion,
			request.representationVersion ?? 1,
		].join('\x00');
	}

	private _restCoalescingKey(account: GitHubAccountHandle, request: GitHubRestRequest, url: string): string {
		return [
			this._restCacheKey(account, request, url),
			request.etag === false ? 'etag-disabled' : 'etag-enabled',
			request.unconditional === true ? 'unconditional' : 'conditional',
		].join('\x00');
	}

	private _deleteRestRequest(key: string, request: ISharedRequest): void {
		if (this._inFlight.get(key) === request) {
			this._inFlight.delete(key);
		}
	}

	private _deleteGraphQLRequest(key: string, request: ISharedGraphQLRequest): void {
		if (this._graphQlInFlight.get(key) === request) {
			this._graphQlInFlight.delete(key);
		}
	}

	private _httpError(prefix: string, response: Response, body: string): GitHubRequestError {
		const detail = formatErrorBody(body);
		const message = `${prefix} - ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`;
		return new GitHubRequestError(message, classifyHttpError(response.status, body), response.status, body);
	}

	private _parseJson<T>(body: string, message: string): T {
		try {
			return JSON.parse(body);
		} catch {
			throw new GitHubRequestError(message, 'malformedResponse');
		}
	}

	private _waitForShared<T>(shared: ISharedRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(signal.reason);
			signal.addEventListener('abort', onAbort, { once: true });
			void shared.promise.then(
				response => {
					signal.removeEventListener('abort', onAbort);
					resolve(response as GitHubRestResponse<T>);
				},
				error => {
					signal.removeEventListener('abort', onAbort);
					reject(error);
				},
			);
		});
	}

	private _waitForSharedGraphQL<T>(shared: ISharedGraphQLRequest, signal: AbortSignal): Promise<GitHubGraphQLResponse<T>> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(signal.reason);
			signal.addEventListener('abort', onAbort, { once: true });
			void shared.promise.then(
				response => {
					signal.removeEventListener('abort', onAbort);
					resolve(response as GitHubGraphQLResponse<T>);
				},
				error => {
					signal.removeEventListener('abort', onAbort);
					reject(error);
				},
			);
		});
	}
}

function classifyHttpError(statusCode: number, body: string): GitHubRequestErrorKind {
	switch (statusCode) {
		case 401: return 'authentication';
		case 403: return body.toLowerCase().includes('rate limit') ? 'rateLimit' : 'authorization';
		case 404: return 'notFound';
		case 422: return 'validation';
		case 429: return 'rateLimit';
		default: return statusCode >= 500 ? 'server' : 'unknown';
	}
}

function formatErrorBody(body: string): string | undefined {
	const normalized = body.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.length > maximumErrorBodyLength
		? `${normalized.substring(0, maximumErrorBodyLength)}...`
		: normalized;
}

function readGraphQLRateLimit(data: unknown): { limit?: number; remaining?: number; used?: number; resetAt?: string } | undefined {
	if (!data || typeof data !== 'object' || !('rateLimit' in data)) {
		return undefined;
	}
	const rateLimit = data.rateLimit;
	if (!rateLimit || typeof rateLimit !== 'object') {
		return undefined;
	}
	return {
		limit: readNumber(rateLimit, 'limit'),
		remaining: readNumber(rateLimit, 'remaining'),
		used: readNumber(rateLimit, 'used'),
		resetAt: readString(rateLimit, 'resetAt'),
	};
}

function readNumber(value: object, key: string): number | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'number' ? property : undefined;
}

function readString(value: object, key: string): string | undefined {
	const property = Reflect.get(value, key);
	return typeof property === 'string' ? property : undefined;
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'undefined';
}
