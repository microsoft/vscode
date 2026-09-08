/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../base/common/map.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubAccountHandle, GitHubFetch, GitHubRequestErrorKind, GitHubRequestPriority } from './githubTypes.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestQueue } from './githubRequestQueue.js';
import { IGitHubScheduler, schedulerDelay, systemGitHubScheduler } from './githubScheduler.js';

export type FetchFunction = GitHubFetch;

export interface IGitHubTransport {
	readonly rateLimits: GitHubRateLimitCoordinator;
	rest<T>(account: GitHubAccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>>;
	graphql<T>(account: GitHubAccountHandle, token: string, url: string, query: string, variables: Readonly<Record<string, unknown>>, signal: AbortSignal, priority?: GitHubRequestPriority): Promise<GitHubGraphQLResponse<T>>;
	download(account: GitHubAccountHandle, token: string, request: GitHubDownloadRequest, signal: AbortSignal): Promise<GitHubDownloadResponse>;
	invalidateAccount(account: GitHubAccountHandle, reason?: unknown): void;
	clear(): void;
}

export interface GitHubGraphQLError {
	readonly message?: string;
	readonly type?: string;
	readonly path?: readonly (string | number)[];
	readonly extensions?: {
		readonly code?: string;
	};
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

export interface GitHubDownloadRequest {
	readonly url: string;
	readonly maximumBytes: number;
	readonly timeout: number;
	readonly priority?: GitHubRequestPriority;
}

export interface GitHubDownloadResponse {
	readonly text: string;
	readonly truncated: boolean;
	readonly sourceUrl: string;
	readonly contentType?: string;
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
		private readonly _allowInsecureLoopbackDownloads = false,
		private readonly _logService?: ILogService,
	) {
		super();
		this._fetch = fetchFn ?? ((input, init) => globalThis.fetch(input, init));
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
		} else {
			this._logService?.trace(`[GitHubTransport] Reusing REST ${formatRequestUrl(finalUrl)} (waiters: ${shared.waiters + 1})`);
		}
		shared.waiters++;
		try {
			return await this._waitForShared<T>(shared, signal);
		} finally {
			shared.waiters--;
			if (shared.waiters === 0 && this._inFlight.get(coalescingKey) === shared) {
				this._inFlight.delete(coalescingKey);
				this._logService?.trace(`[GitHubTransport] Cancelling REST ${formatRequestUrl(finalUrl)} because all waiters detached`);
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
		return this._graphqlRead(account, token, url, query, variables, signal, priority);
	}

	async download(
		account: GitHubAccountHandle,
		token: string,
		request: GitHubDownloadRequest,
		signal: AbortSignal,
	): Promise<GitHubDownloadResponse> {
		const priority = request.priority ?? 'interactive';
		return this._logRequest('download', formatDownloadUrl(request.url), account, priority, signal, () => this._enqueueWithRateLimit(account, 'core', priority, signal, async () => {
			const controller = new AbortController();
			const timeout = this._scheduler.schedule(
				() => controller.abort(new GitHubRequestError('GitHub download timed out', 'network')),
				Math.max(0, request.timeout),
			);
			const combinedSignal = AbortSignal.any([signal, controller.signal]);
			try {
				const initialOrigin = new URL(request.url).origin;
				let url = request.url;
				let authenticated = true;
				for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
					const headers: Record<string, string> = {
						'Accept': authenticated ? 'application/vnd.github+json' : 'text/plain, application/octet-stream',
						'X-GitHub-Api-Version': defaultApiVersion,
					};
					if (authenticated) {
						headers['Authorization'] = `Bearer ${token}`;
					}
					let response: Response;
					try {
						response = await this._fetch(url, {
							method: 'GET',
							cache: 'no-store',
							headers,
							signal: combinedSignal,
							redirect: 'manual',
						});
					} catch (error) {
						if (combinedSignal.aborted) {
							throw combinedSignal.reason ?? error;
						}
						throw new GitHubRequestError(`GitHub download network request failed (host: ${formatDownloadUrl(url)}, redirect: ${redirectCount}, codes: ${formatNetworkErrorCodes(error)})`, 'network');
					}
					this._logService?.trace(`[GitHubTransport] Download request returned HTTP ${response.status}`);
					if (authenticated) {
						this._rateLimits.updateFromResponse(account, response);
					}
					if ([301, 302, 307, 308].includes(response.status)) {
						const location = response.headers.get('location');
						if (!location) {
							throw new GitHubRequestError('GitHub download redirect was missing a Location header', 'malformedResponse', response.status);
						}
						const redirected = new URL(location, url);
						validateDownloadUrl(redirected, this._allowInsecureLoopbackDownloads);
						authenticated = redirected.origin === initialOrigin;
						this._logService?.trace(`[GitHubTransport] Following download redirect to ${formatDownloadUrl(redirected.href)} (authenticated: ${authenticated})`);
						url = redirected.href;
						continue;
					}
					if (!response.ok) {
						const body = await response.text();
						throw this._httpError('GitHub download failed', response, body);
					}
					const body = await readBoundedResponse(response, request.maximumBytes, combinedSignal);
					this._logService?.trace(`[GitHubTransport] Downloaded ${body.bytes.byteLength} byte(s) (truncated: ${body.truncated})`);
					return {
						text: new TextDecoder().decode(body.bytes),
						truncated: body.truncated,
						sourceUrl: url,
						contentType: response.headers.get('content-type') ?? undefined,
					};
				}
				throw new GitHubRequestError('GitHub download exceeded the redirect limit', 'unknown');
			} finally {
				timeout.dispose();
			}
		}));
	}
	private async _graphqlRead<T>(
		account: GitHubAccountHandle,
		token: string,
		url: string,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
		priority: GitHubRequestPriority,
	): Promise<GitHubGraphQLResponse<T>> {
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
		} else {
			this._logService?.trace(`[GitHubTransport] Reusing GraphQL ${graphQLOperationName(query)} (waiters: ${shared.waiters + 1})`);
		}
		shared.waiters++;
		try {
			return await this._waitForSharedGraphQL<T>(shared, signal);
		} finally {
			shared.waiters--;
			if (shared.waiters === 0 && this._graphQlInFlight.get(key) === shared) {
				this._graphQlInFlight.delete(key);
				this._logService?.trace(`[GitHubTransport] Cancelling GraphQL ${graphQLOperationName(query)} because all waiters detached`);
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
		const operation = graphQLOperationName(query);
		return this._logRequest('GraphQL', operation, account, priority, signal, () => this._enqueueWithRateLimit(account, 'graphql', priority, signal, async () => {
			const response = await this._fetchWithRetry(url, {
				method: 'POST',
				cache: 'no-store',
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'X-GitHub-Api-Version': defaultApiVersion,
				},
				body: JSON.stringify({ query, variables }),
				signal,
				redirect: 'manual',
			}, !/^\s*mutation\b/i.test(query));
			this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned HTTP ${response.status}`);
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
			this._logRateLimit(account, 'graphql');
			this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned ${errors.length} error(s)`);
			return { data: json.data, errors, observedAt: this._scheduler.now() };
		}));
	}

	invalidateAccount(account: GitHubAccountHandle, reason?: unknown): void {
		const accountKey = GitHubRequestQueue.accountKey(account);
		const restRequests = [...this._inFlight.keys()].filter(key => key.startsWith(`${accountKey}\x00`)).length;
		const graphQlRequests = [...this._graphQlInFlight.keys()].filter(key => key.startsWith(`${accountKey}\x00`)).length;
		this._logService?.debug(`[GitHubTransport] Invalidating state for ${account.host} (REST requests: ${restRequests}, GraphQL requests: ${graphQlRequests})`);
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
		this._logService?.debug(`[GitHubTransport] Clearing transport state (cache: ${this._restCache.size}, REST requests: ${this._inFlight.size}, GraphQL requests: ${this._graphQlInFlight.size})`);
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
		const priority = request.priority ?? (request.method === 'GET' ? 'interactive' : 'mutation');
		const operation = `${request.method} ${formatRequestUrl(request.url)}`;
		return this._logRequest('REST', operation, account, priority, signal, () => this._enqueueWithRateLimit(account, 'core', priority, signal, async () => {
			const cached = request.etag !== false && !request.unconditional ? this._restCache.get(cacheKey) : undefined;
			if (cached) {
				this._logService?.trace(`[GitHubTransport] Using cached ETag for ${operation}`);
			}
			const headers: Record<string, string> = {
				'Accept': request.accept ?? 'application/vnd.github+json',
				'Authorization': `Bearer ${token}`,
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
			this._logService?.trace(`[GitHubTransport] REST ${operation} returned HTTP ${response.status}`);
			const finalUrl = response.url || this._redirects.get(request.url) || request.url;
			const body = response.status === 204 || response.status === 304 ? '' : await response.text();
			this._rateLimits.updateFromResponse(account, response, body);
			this._logRateLimit(account, response.headers.get('x-ratelimit-resource') ?? 'core');
			if (response.status === 304) {
				if (!cached) {
					throw new GitHubRequestError('GitHub returned 304 without a cached representation', 'malformedResponse', 304);
				}
				// A 304 confirms the cached body is current, but the validator itself may be reissued
				// (for example a strong tag echoed as weak). Adopt it so the next revalidation sends
				// the validator GitHub last handed out instead of resending a stale one forever.
				const revalidatedEtag = response.headers.get('etag') ?? cached.etag;
				const revalidatedLink = response.headers.get('link') ?? cached.link;
				if (revalidatedEtag !== cached.etag) {
					this._logService?.trace(`[GitHubTransport] Adopting reissued validator for ${operation}`);
				}
				this._restCache.set(cacheKey, {
					...cached,
					etag: revalidatedEtag,
					link: revalidatedLink,
					fetchedAt: this._scheduler.now(),
				});
				this._logService?.trace(`[GitHubTransport] Reused cached representation for ${operation}`);
				return {
					data: this._parseJson<T>(cached.body, 'Cached GitHub response was not valid JSON'),
					statusCode: 304,
					etag: revalidatedEtag,
					finalUrl: cached.finalUrl,
					link: revalidatedLink,
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
					this._logService?.trace(`[GitHubTransport] Cached ETag for ${operation}`);
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
		}));
	}

	private async _enqueueWithRateLimit<T>(
		account: GitHubAccountHandle,
		resource: string,
		priority: GitHubRequestPriority,
		signal: AbortSignal,
		task: () => Promise<T>,
	): Promise<T> {
		while (true) {
			const delay = this._rateLimits.getDelay(account, resource);
			if (delay > 0) {
				this._logService?.debug(`[GitHubTransport] Waiting ${delay}ms for ${resource} rate limit on ${account.host}`);
				await this._rateLimits.wait(account, resource, signal);
			}
			const result = await this._queue.enqueue<RateLimitQueueResult<T>>(account, priority, signal, async () => {
				if (this._rateLimits.getDelay(account, resource) > 0) {
					this._logService?.trace(`[GitHubTransport] Requeueing ${resource} request because its rate limit changed`);
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
			this._logService?.trace(`[GitHubTransport] Following REST redirect to ${formatRequestUrl(url)}`);
		}
		throw new GitHubRequestError('GitHub API request exceeded the redirect limit', 'unknown');
	}

	private async _fetchWithRetry(url: string, init: RequestInit, retry: boolean): Promise<Response> {
		let failure: unknown;
		for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
			try {
				const response = await this._fetch(url, init);
				if (retry && attempt === 0 && response.status >= 500) {
					this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after HTTP ${response.status}`);
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
					this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after a network failure`);
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

	private async _logRequest<T>(
		kind: string,
		operation: string,
		account: GitHubAccountHandle,
		priority: GitHubRequestPriority,
		signal: AbortSignal,
		task: () => Promise<T>,
	): Promise<T> {
		const startedAt = this._scheduler.now();
		this._logService?.trace(`[GitHubTransport] ${kind} ${operation} started on ${account.host} (priority: ${priority})`);
		try {
			const result = await task();
			this._logService?.trace(`[GitHubTransport] ${kind} ${operation} completed in ${this._scheduler.now() - startedAt}ms`);
			return result;
		} catch (error) {
			const outcome = signal.aborted ? 'cancelled' : 'failed';
			this._logService?.debug(`[GitHubTransport] ${kind} ${operation} ${outcome} after ${this._scheduler.now() - startedAt}ms (${transportErrorKind(error)})`);
			throw error;
		}
	}

	private _logRateLimit(account: GitHubAccountHandle, resource: string): void {
		const state = this._rateLimits.getState(account, resource);
		if (state) {
			this._logService?.trace(`[GitHubTransport] Rate limit ${resource} on ${account.host}: remaining=${state.remaining ?? 'unknown'}, limit=${state.limit ?? 'unknown'}, resetAt=${state.resetAt ?? 'unknown'}, blockedUntil=${state.blockedUntil ?? 'none'}`);
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
	if (!data || typeof data !== 'object' || !hasKey(data, { rateLimit: true })) {
		return undefined;
	}
	const rateLimit = Reflect.get(data, 'rateLimit');
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

function formatRequestUrl(value: string): string {
	try {
		const url = new URL(value);
		return `${url.host}${url.pathname}`;
	} catch {
		return '<invalid-url>';
	}
}

function formatDownloadUrl(value: string): string {
	try {
		return new URL(value).host;
	} catch {
		return '<invalid-url>';
	}
}

function formatNetworkErrorCodes(error: unknown): string {
	const pending: unknown[] = [error];
	const codes = new Set<string>();
	for (let index = 0; index < pending.length && index < 16; index++) {
		const current = pending[index];
		if (!current || typeof current !== 'object') {
			continue;
		}
		const code = readString(current, 'code');
		if (code && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) {
			codes.add(code);
		}
		const cause = Reflect.get(current, 'cause');
		if (cause !== undefined) {
			pending.push(cause);
		}
		const errors = Reflect.get(current, 'errors');
		if (Array.isArray(errors)) {
			pending.push(...errors.slice(0, 16));
		}
	}
	return codes.size > 0 ? [...codes].join(', ') : 'unknown';
}

function graphQLOperationName(query: string): string {
	return /\b(?:query|mutation)\s+(?<name>[_A-Za-z][_0-9A-Za-z]*)/.exec(query)?.groups?.name ?? '<anonymous>';
}

function transportErrorKind(error: unknown): string {
	if (error instanceof GitHubRequestError) {
		return `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`;
	}
	return error instanceof Error ? error.name : typeof error;
}

function validateDownloadUrl(url: URL, allowInsecureLoopback: boolean): void {
	if (url.protocol === 'https:') {
		return;
	}
	if (allowInsecureLoopback
		&& url.protocol === 'http:'
		&& (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')) {
		return;
	}
	throw new GitHubRequestError('GitHub download redirect used an unsafe target', 'authorization');
}

async function readBoundedResponse(
	response: Response,
	maximumBytes: number,
	signal: AbortSignal,
): Promise<{ readonly bytes: Uint8Array; readonly truncated: boolean }> {
	const limit = Math.max(0, maximumBytes);
	if (!response.body) {
		return { bytes: new Uint8Array(), truncated: false };
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			if (signal.aborted) {
				throw signal.reason;
			}
			const result = await reader.read();
			if (result.done) {
				break;
			}
			if (length + result.value.byteLength > limit) {
				const remaining = Math.max(0, limit - length);
				if (remaining > 0) {
					chunks.push(result.value.slice(0, remaining));
					length += remaining;
				}
				await reader.cancel();
				return { bytes: concatenateBytes(chunks, length), truncated: true };
			}
			chunks.push(result.value);
			length += result.value.byteLength;
		}
		return { bytes: concatenateBytes(chunks, length), truncated: false };
	} finally {
		reader.releaseLock();
	}
}

function concatenateBytes(chunks: readonly Uint8Array[], length: number): Uint8Array {
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
