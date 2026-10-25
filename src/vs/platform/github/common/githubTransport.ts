/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../base/common/map.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import { cancelResponseBody, parseResponseJson, readBoundedResponse } from './responseReader.js';
import { IInFlightOperation, OperationWaiters } from './operationWaiters.js';
import { GitHubGraphQLError, GitHubRequestError, GitHubRequestRateLimitError, GitHubRequestTimeoutError, GitHubResponseMetadata } from './githubTypes.js';
import { AccountHandle, AnonymousAccount, BootstrapAccount, GitHubRequestDomain, RequestFetch, RequestAccount, RequestContext, RequestErrorKind, RequestOptions, RequestPriority, RequestOutcome, requestOutcome, RequestError, RequestTimeoutError, RequestRateLimitError } from './types.js';
import { classifyGitHubHttpRateLimit, getGitHubRestResource, GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { RequestQueue, RequestQueueOptions } from './requestQueue.js';
import { IRequestScheduler, schedulerDelay, systemRequestScheduler } from './scheduler.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { parseRetryAfter } from './client/headers.js';
import { isRetryableMissionControlError, missionControlRetryDelay, parseMissionControlError } from './missionControl/missionControlError.js';
import { GraphQLRequest, parseGraphQLRequest, parseGraphQLResponse } from './client/graphql.js';
import { SchemaError } from './client/schema.js';

export type FetchFunction = RequestFetch;
export { GitHubRequestError } from './githubTypes.js';
export type { GitHubGraphQLError } from './githubTypes.js';

interface GitHubRequestOptions extends RequestOptions {
	readonly domain?: GitHubRequestDomain;
}

export interface IGitHubTransport {
	readonly rateLimits: GitHubRateLimitCoordinator;
	rest<T>(account: AccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>>;
	restText(account: AccountHandle, token: string, request: GitHubRestTextRequest, signal: AbortSignal): Promise<GitHubRestResponse<string>>;
	anonymousRestText(account: AnonymousAccount, apiBasePath: string, request: GitHubRestTextRequest & { readonly method: 'GET' | 'HEAD' }, signal: AbortSignal): Promise<GitHubRestResponse<string>>;
	graphql<T>(account: AccountHandle, token: string, url: string, query: string, variables: Readonly<Record<string, unknown>>, signal: AbortSignal, priority?: RequestPriority, options?: GitHubRequestOptions): Promise<GitHubGraphQLResponse<T>>;
	graphqlText(account: AccountHandle, token: string, url: string, bodyText: string, signal: AbortSignal, priority?: RequestPriority, options?: GitHubRequestOptions): Promise<GitHubGraphQLTextResponse>;
	download(account: AccountHandle, token: string, request: GitHubDownloadRequest, signal: AbortSignal): Promise<GitHubDownloadResponse>;
	anonymousDownload(account: AnonymousAccount, basePath: string, request: GitHubDownloadRequest, signal: AbortSignal): Promise<GitHubDownloadResponse>;
	/** Raises the priority of a caller's queued work without restarting dispatched requests. */
	promote(signal: AbortSignal, priority: RequestPriority): void;
	invalidateAccount(account: AccountHandle, reason?: unknown): void;
}

export function isSamlEnforcementError(message: string): boolean {
	return message.toLowerCase().includes('saml enforcement');
}

export interface GitHubRestRequest extends GitHubRequestOptions {
	readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	readonly url: string;
	readonly body?: object;
	readonly accept?: string;
	/** Null omits the GitHub REST default for APIs with a different version contract. */
	readonly apiVersion?: string | null;
	readonly integrationId?: string;
	/** Mission Control cooldowns are independent of GitHub REST quota buckets. */
	readonly rateLimitResource?: 'agents' | 'agents:sandbox' | 'agents:token_mint';
	readonly representationVersion?: number;
	readonly etag?: boolean;
	readonly unconditional?: boolean;
	readonly priority?: RequestPriority;
	readonly retry?: false;
	readonly coalesce?: false;
	readonly followRedirects?: false;
	/** Discard successful acknowledgement bodies instead of parsing them as JSON. */
	readonly responseBody?: 'none';
	/** Physical dispatch evidence for unshared operations whose outcome may be uncertain. */
	readonly onDidDispatch?: () => void;
}

/** Buffered REST execution; body text is forwarded without serialization or JSON decoding. */
export interface GitHubRestTextRequest extends Omit<GitHubRestRequest, 'method' | 'body' | 'responseBody'> {
	readonly method: GitHubRestRequest['method'] | 'HEAD';
	readonly bodyText?: string;
	/** Separates representation and acknowledgement modes in the cache and coalescing keys. */
	readonly responseBody?: 'json' | 'text' | 'none';
	/** A tighter response limit for an endpoint with smaller payloads. */
	readonly maximumResponseBytes?: number;
}

export interface GitHubRestResponse<T> extends GitHubResponseMetadata {
	readonly data: T | undefined;
	readonly statusCode: number;
	/** Validated Location target for a manually retained redirect. */
	readonly redirectUrl?: string;
	/** Original success status when a 304 revalidates a cached response. */
	readonly revalidatedStatusCode?: number;
	readonly etag?: string;
	readonly finalUrl: string;
	readonly link?: string;
	readonly observedAt: number;
}

export type GitHubAnonymousReadOptions = Omit<GitHubRestRequest, 'method' | 'url' | 'body'>;

export interface GitHubBootstrapReadOptions extends GitHubAnonymousReadOptions {
	/** Propagates a queued server cooldown to independently budgeted discovery waiters. */
	readonly onBlockedUntil?: (time: number) => void;
}

export interface GitHubGraphQLResponse<T> {
	readonly data: T | undefined;
	readonly errors: readonly GitHubGraphQLError[];
	readonly observedAt: number;
}

export interface GitHubGraphQLTextResponse extends GitHubResponseMetadata {
	readonly data: string;
	readonly statusCode: number;
	readonly errors: readonly GitHubGraphQLError[];
	readonly observedAt: number;
}

interface IGraphQLResult {
	readonly response: GitHubGraphQLTextResponse;
	readonly data: unknown;
}

export interface GitHubDownloadRequest extends GitHubRequestOptions {
	readonly url: string;
	readonly maximumBytes: number;
	readonly timeout: number;
	readonly priority?: RequestPriority;
}

export interface GitHubDownloadResponse {
	readonly statusCode: number;
	readonly text: string;
	readonly truncated: boolean;
	/** Captured bytes, never more than the requested maximumBytes. */
	readonly bytesRead?: number;
	readonly sourceUrl: string;
	readonly contentType?: string;
}

interface IRestCacheEntry {
	readonly accountKey: string;
	readonly etag: string;
	readonly body: string;
	readonly statusCode: number;
	readonly finalUrl: string;
	readonly fetchedAt: number;
	readonly link?: string;
	readonly representationVersion: number;
}

export interface GitHubTransportOptions {
	readonly requestTimeout: number;
	readonly maximumResponseBytes: number;
	readonly maximumSharedWaiters: number;
	/** Opts browser fetch into native following after an opaque repository redirect. */
	readonly useBrowserRedirects?: boolean;
	readonly queue?: Partial<RequestQueueOptions>;
	readonly requestMetadata?: GitHubRequestMetadata;
	readonly coordination?: {
		readonly queue: RequestQueue;
		readonly rateLimits: GitHubRateLimitCoordinator;
	};
}

const defaultApiVersion = '2022-11-28';
const maximumErrorBodyLength = 500;
const maximumDownloadErrorBytes = 8 * 1024;
const maximumRedirects = 5;

export class GitHubTransport extends Disposable implements IGitHubTransport {

	private readonly _fetch: FetchFunction;
	private readonly _queue: RequestQueue;
	private readonly _rateLimits: GitHubRateLimitCoordinator;
	private readonly _restCache = new LRUCache<string, IRestCacheEntry>(500);
	private readonly _redirects = new Map<string, string>();
	private readonly _inFlight = new Map<string, IInFlightOperation<GitHubRestResponse<string>>>();
	private readonly _graphQlInFlight = new Map<string, IInFlightOperation<IGraphQLResult>>();
	private readonly _options: GitHubTransportOptions;
	private readonly _accounts = new Map<string, RequestAccount>();

	constructor(
		fetchFn: FetchFunction | undefined,
		private readonly _scheduler: IRequestScheduler = systemRequestScheduler,
		private readonly _allowInsecureLoopbackDownloads = false,
		private readonly _logService?: ILogService,
		options: Partial<GitHubTransportOptions> = {},
		private readonly _telemetry?: GitHubRequestTelemetry,
	) {
		super();
		this._options = {
			requestTimeout: 5 * 60_000,
			maximumResponseBytes: 16 * 1024 * 1024,
			maximumSharedWaiters: 64,
			...options,
		};
		for (const value of [this._options.requestTimeout, this._options.maximumResponseBytes, this._options.maximumSharedWaiters]) {
			if (!Number.isSafeInteger(value) || value <= 0) {
				throw new GitHubRequestError('Invalid GitHub transport limits', 'validation');
			}
		}
		this._fetch = fetchFn ?? ((input, init) => globalThis.fetch(input, init));
		this._rateLimits = options.coordination?.rateLimits ?? this._register(new GitHubRateLimitCoordinator(_scheduler));
		this._queue = options.coordination?.queue ?? this._register(new RequestQueue(_scheduler, context => this._rateLimits.getRequestDelay(context.account, context.resource), options.queue, _telemetry));
	}

	get rateLimits(): GitHubRateLimitCoordinator {
		return this._rateLimits;
	}

	rest<T>(account: AccountHandle, token: string, request: GitHubRestRequest, signal: AbortSignal): Promise<GitHubRestResponse<T>> {
		if (typeof token !== 'string' || !token) {
			return Promise.reject(new GitHubRequestError('GitHub authentication is required', 'authentication'));
		}
		return this._trackRequest(signal, () => this._rest<T>(account, token, request, signal));
	}

	restText(account: AccountHandle, token: string, request: GitHubRestTextRequest, signal: AbortSignal): Promise<GitHubRestResponse<string>> {
		if (typeof token !== 'string' || !token) {
			return Promise.reject(new GitHubRequestError('GitHub authentication is required', 'authentication'));
		}
		return this._trackRequest(signal, () => this._restText(account, token, request, signal));
	}

	anonymousRestText(account: AnonymousAccount, apiBasePath: string, request: GitHubRestTextRequest & { readonly method: 'GET' | 'HEAD' }, signal: AbortSignal): Promise<GitHubRestResponse<string>> {
		return this._trackRequest(signal, () => {
			const url = new URL(request.followRedirects === false ? request.url : this._redirects.get(request.url) ?? request.url);
			if (request.method !== 'GET' && request.method !== 'HEAD' || request.bodyText !== undefined) {
				throw new GitHubRequestError('GitHub anonymous REST requests must be bodyless reads', 'validation');
			}
			if (url.origin !== account.origin || !apiBasePath || !url.pathname.startsWith(apiBasePath) || url.username || url.password || url.hash) {
				throw new GitHubRequestError('GitHub anonymous read escaped its API endpoint', 'authorization');
			}
			return this._restText(account, undefined, request, signal, apiBasePath);
		});
	}

	bootstrapGet<T>(account: BootstrapAccount, token: string, apiBasePath: string, request: GitHubBootstrapReadOptions & { readonly url: string }, signal: AbortSignal): Promise<GitHubRestResponse<T>> {
		return this._trackRequest(signal, () => this._rest<T>(account, token, { ...request, method: 'GET', body: undefined }, signal, apiBasePath, request.onBlockedUntil));
	}

	private async _rest<T>(account: RequestAccount, token: string | undefined, request: GitHubRestRequest, signal: AbortSignal, anonymousApiBasePath?: string, onBlockedUntil?: (time: number) => void): Promise<GitHubRestResponse<T>> {
		signal.throwIfAborted();
		const deadline = this._deadline(request);
		const { body, ...metadata } = request;
		const response = await this._restText(account, token, {
			...metadata,
			deadline,
			bodyText: body === undefined ? undefined : JSON.stringify(body),
		}, signal, anonymousApiBasePath, onBlockedUntil);
		return {
			...response,
			data: response.statusCode === 304
				? this._parseJson<T>(response.data ?? '', 'Cached GitHub response was not valid JSON')
				: response.data ? this._parseJson<T>(response.data, 'GitHub response was not valid JSON') : undefined,
		};
	}

	private async _restText(account: RequestAccount, token: string | undefined, request: GitHubRestTextRequest, signal: AbortSignal, anonymousApiBasePath?: string, onBlockedUntil?: (time: number) => void): Promise<GitHubRestResponse<string>> {
		signal.throwIfAborted();
		if (request.maximumResponseBytes !== undefined && (!Number.isSafeInteger(request.maximumResponseBytes) || request.maximumResponseBytes <= 0)) {
			throw new GitHubRequestError('Invalid GitHub response byte limit', 'validation');
		}
		const deadline = this._deadline(request);
		const finalUrl = request.followRedirects === false ? request.url : this._redirects.get(request.url) ?? request.url;
		const cacheKey = this._restCacheKey(account, request, finalUrl);
		if (request.method !== 'GET' || request.coalesce === false || request.onDidDispatch) {
			return this._executeRest(account, token, request, signal, cacheKey, anonymousApiBasePath);
		}

		const coalescingKey = this._restCoalescingKey(account, request, finalUrl);
		let shared = this._inFlight.get(coalescingKey);
		if (shared && shared.deadline <= this._scheduler.now()) {
			this._inFlight.delete(coalescingKey);
			shared.controller.abort(new GitHubRequestTimeoutError());
			shared = undefined;
		}
		const coalesced = shared !== undefined;
		if (!shared) {
			const controller = new AbortController();
			const requestDeadline = this._deadline({});
			let admitted = false;
			const promise = this._executeRest(account, token, { ...request, deadline: requestDeadline }, controller.signal, cacheKey, anonymousApiBasePath, () => { admitted = true; });
			if (!admitted) {
				return await promise;
			}
			shared = { controller, deadline: requestDeadline, waiters: new OperationWaiters() };
			this._inFlight.set(coalescingKey, shared);
			const created = shared;
			const updateCooldown = () => created.waiters.setBlockedUntil(this._queue.isPending(controller.signal)
				? this._scheduler.now() + this._rateLimits.getRequestDelay(account, request.rateLimitResource ?? getGitHubRestResource(finalUrl)) : 0);
			const cooldownListener = account.kind === 'bootstrap' ? this._rateLimits.onDidChange(updateCooldown) : undefined;
			if (cooldownListener) {
				updateCooldown();
			}
			void promise.then(
				value => {
					cooldownListener?.dispose();
					this._deleteRestRequest(coalescingKey, created);
					created.waiters.resolve(value);
				},
				error => {
					cooldownListener?.dispose();
					this._deleteRestRequest(coalescingKey, created);
					created.waiters.reject(error);
				},
			);
		} else {
			this._logService?.trace(`[GitHubTransport] Reusing REST ${formatRequestUrl(finalUrl)} (waiters: ${shared.waiters.size + 1})`);
		}
		if (shared.waiters.size >= this._options.maximumSharedWaiters) {
			this._telemetry?.recordRejection('waiter', request.domain);
			throw new GitHubRequestError('GitHub shared request capacity exceeded', 'overloaded');
		}
		if (coalesced) {
			this._telemetry?.record('coalesced');
		}
		this._queue.promote(shared.controller.signal, request.priority ?? 'interactive');
		try {
			return await shared.waiters.wait(signal, deadline, this._scheduler, () => new GitHubRequestTimeoutError(), account.kind === 'bootstrap' ? {
				error: delay => new GitHubRequestRateLimitError(delay), onBlockedUntil,
			} : undefined);
		} finally {
			if (shared.waiters.size === 0 && this._inFlight.get(coalescingKey) === shared) {
				this._inFlight.delete(coalescingKey);
				this._logService?.trace(`[GitHubTransport] Cancelling REST ${formatRequestUrl(finalUrl)} because all waiters detached`);
				shared.controller.abort(new Error('All GitHub request waiters cancelled'));
			}
		}
	}

	graphql<T>(
		account: AccountHandle,
		token: string,
		url: string,
		query: string,
		variables: Readonly<Record<string, unknown>>,
		signal: AbortSignal,
		priority: RequestPriority = 'interactive',
		options: GitHubRequestOptions = {},
	): Promise<GitHubGraphQLResponse<T>> {
		return this._trackRequest(signal, async () => {
			signal.throwIfAborted();
			const deadline = this._deadline(options);
			const result = await this._graphql(account, token, url, JSON.stringify({ query, variables }), signal, priority, { ...options, deadline });
			return { data: result.data as T | undefined, errors: result.response.errors, observedAt: result.response.observedAt };
		});
	}

	graphqlText(account: AccountHandle, token: string, url: string, bodyText: string, signal: AbortSignal, priority?: RequestPriority, options: GitHubRequestOptions = {}): Promise<GitHubGraphQLTextResponse> {
		return this._trackRequest(signal, async () => (await this._graphql(account, token, url, bodyText, signal, priority, options)).response);
	}

	private async _graphql(account: AccountHandle, token: string, url: string, bodyText: string, signal: AbortSignal, priority: RequestPriority | undefined, options: GitHubRequestOptions): Promise<IGraphQLResult> {
		signal.throwIfAborted();
		const deadline = this._deadline(options);
		let request: GraphQLRequest;
		try {
			request = parseGraphQLRequest(parseResponseJson<unknown>(bodyText, () => new GitHubRequestError('GitHub GraphQL request was not valid JSON', 'validation')));
		} catch (error) {
			if (error instanceof SchemaError) {
				throw new GitHubRequestError(`Invalid GitHub GraphQL request: ${error.message}`, 'validation');
			}
			throw error;
		}
		if (deadline <= this._scheduler.now()) {
			throw new GitHubRequestTimeoutError();
		}
		const read = isGraphQLRead(request.query);
		const requestPriority = priority ?? (read ? 'interactive' : 'mutation');
		return read
			? this._graphqlRead(account, token, url, request, bodyText, signal, requestPriority, { ...options, deadline })
			: this._executeGraphQL(account, token, url, request, bodyText, signal, requestPriority, { ...options, deadline });
	}

	download(
		account: AccountHandle,
		token: string,
		request: GitHubDownloadRequest,
		signal: AbortSignal,
	): Promise<GitHubDownloadResponse> {
		return this._trackRequest(signal, () => this._download(account, token, request, signal));
	}

	anonymousDownload(
		account: AnonymousAccount,
		basePath: string,
		request: GitHubDownloadRequest,
		signal: AbortSignal,
	): Promise<GitHubDownloadResponse> {
		return this._trackRequest(signal, () => this._download(account, undefined, request, signal, basePath));
	}

	private async _download(
		account: AccountHandle | AnonymousAccount,
		token: string | undefined,
		request: GitHubDownloadRequest,
		signal: AbortSignal,
		anonymousBasePath?: string,
	): Promise<GitHubDownloadResponse> {
		signal.throwIfAborted();
		const anonymous = account.kind === 'anonymous';
		if (anonymous) {
			const url = new URL(request.url);
			validateDownloadUrl(url, this._allowInsecureLoopbackDownloads);
			if (url.origin !== account.origin || !anonymousBasePath || !url.pathname.startsWith(anonymousBasePath)) {
				throw new GitHubRequestError('GitHub anonymous download escaped its content endpoint.', 'authorization');
			}
		}
		if (!Number.isFinite(request.maximumBytes) || !Number.isFinite(request.timeout)) {
			throw new GitHubRequestError('Invalid GitHub download limits', 'validation');
		}
		const deadline = this._deadline(request, Math.max(0, request.timeout));
		const priority = request.priority ?? 'interactive';
		return this._logRequest('download', formatDownloadUrl(request.url), account, priority, signal, () => this._enqueueWithRateLimit(account, anonymous ? 'raw' : getGitHubRestResource(request.url), priority, signal, async (combinedSignal, onDispatch) => {
			const initialOrigin = new URL(request.url).origin;
			let url = request.url;
			let authenticated = !anonymous;
			for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
				combinedSignal.throwIfAborted();
				const resource = anonymous ? 'raw' : getGitHubRestResource(url);
				if ((authenticated || anonymous) && this._rateLimits.getRequestDelay(account, resource) > 0) {
					throw new GitHubRequestError('GitHub download is rate limited', 'rateLimit');
				}
				const headers: Record<string, string> = {
					...(authenticated ? this._options.requestMetadata?.getHeaders(url, request.caller, false) : undefined),
					'Accept': authenticated ? 'application/vnd.github+json' : 'text/plain, application/octet-stream',
					...(anonymous ? {} : { 'X-GitHub-Api-Version': defaultApiVersion }),
				};
				if (authenticated) {
					headers['Authorization'] = `Bearer ${token}`;
				}
				let response: Response;
				try {
					onDispatch();
					this._telemetry?.recordWireAttempt(false, false);
					response = await this._fetch(url, {
						method: 'GET',
						cache: 'no-store',
						headers,
						signal: combinedSignal,
						redirect: 'manual',
						...(anonymous ? { credentials: 'omit', referrerPolicy: 'no-referrer' } as const : {}),
					});
					this._telemetry?.recordResponse(response.status);
					if (combinedSignal.aborted) {
						if (response.body) {
							cancelResponseBody(response.body, this._logService);
						}
						throw combinedSignal.reason;
					}
				} catch (error) {
					if (combinedSignal.aborted) {
						throw combinedSignal.reason ?? error;
					}
					throw new GitHubRequestError(`GitHub download network request failed (host: ${formatDownloadUrl(url)}, redirect: ${redirectCount}, codes: ${formatNetworkErrorCodes(error)})`, 'network');
				}
				this._logService?.trace(`[GitHubTransport] Download request returned HTTP ${response.status}`);
				if (authenticated || anonymous) {
					this._rateLimits.updateFromResponse(account, response, undefined, resource);
				}
				if ([301, 302, 307, 308].includes(response.status)) {
					if (response.body) {
						cancelResponseBody(response.body, this._logService);
					}
					const location = response.headers.get('location');
					if (!location) {
						throw new GitHubRequestError('GitHub download redirect was missing a Location header', 'malformedResponse', response.status);
					}
					let redirected: URL;
					try {
						redirected = new URL(location, url);
					} catch {
						throw new GitHubRequestError('GitHub download redirect used an invalid target', 'authorization');
					}
					validateDownloadUrl(redirected, this._allowInsecureLoopbackDownloads);
					if (anonymous && (redirected.origin !== initialOrigin || !anonymousBasePath || !redirected.pathname.startsWith(anonymousBasePath))) {
						throw new GitHubRequestError('GitHub anonymous download redirect escaped its pinned content path.', 'authorization', response.status);
					}
					authenticated = !anonymous && redirected.origin === initialOrigin;
					this._logService?.trace(`[GitHubTransport] Following download redirect to ${formatDownloadUrl(redirected.href)} (authenticated: ${authenticated})`);
					url = redirected.href;
					continue;
				}
				if (!response.ok) {
					let diagnosticBody = '';
					if ((authenticated || anonymous) && response.status === 403) {
						const prefix = await this._readResponseBody(response, Math.min(maximumDownloadErrorBytes, this._options.maximumResponseBytes), combinedSignal);
						diagnosticBody = new TextDecoder().decode(prefix.bytes);
						this._rateLimits.updateFromResponse(account, response, diagnosticBody, resource);
					} else if (response.body) {
						cancelResponseBody(response.body, this._logService);
					}
					const kind = !authenticated && !anonymous && response.status === 403 ? 'authorization' : classifyHttpError(response, diagnosticBody);
					if (response.status === 403 && kind === 'rateLimit') {
						this._telemetry?.record('rateLimitedResponses');
					}
					throw new GitHubRequestError(`GitHub download failed - HTTP ${response.status}`, kind, response.status);
				}
				const body = await this._readResponseBody(response, Math.min(request.maximumBytes, this._options.maximumResponseBytes), combinedSignal);
				this._logService?.trace(`[GitHubTransport] Downloaded ${body.bytes.byteLength} byte(s) (truncated: ${body.truncated})`);
				return {
					statusCode: response.status,
					text: new TextDecoder('utf-8', { ignoreBOM: anonymous }).decode(body.bytes),
					truncated: body.truncated,
					bytesRead: body.bytes.byteLength,
					sourceUrl: url,
					contentType: response.headers.get('content-type') ?? undefined,
				};
			}
			throw new GitHubRequestError('GitHub download exceeded the redirect limit', 'unknown');
		}, { ...request, deadline }));
	}

	private async _readResponseBody(response: Response, maximumBytes: number, signal: AbortSignal): Promise<Awaited<ReturnType<typeof readBoundedResponse>>> {
		try {
			return await readBoundedResponse(response, maximumBytes, signal, this._logService);
		} catch (error) {
			if (signal.aborted) {
				throw signal.reason ?? error;
			}
			throw new GitHubRequestError(`GitHub response body failed (codes: ${formatNetworkErrorCodes(error)})`, 'network');
		}
	}

	private async _graphqlRead(
		account: AccountHandle,
		token: string,
		url: string,
		request: GraphQLRequest,
		bodyText: string,
		signal: AbortSignal,
		priority: RequestPriority,
		options: GitHubRequestOptions & { readonly deadline: number },
	): Promise<IGraphQLResult> {
		const key = `${RequestQueue.accountKey(account)}\x00${url}\x00${request.query}\x00${canonicalJson(request.variables ?? {})}`;
		let shared = this._graphQlInFlight.get(key);
		if (shared && shared.deadline <= this._scheduler.now()) {
			this._graphQlInFlight.delete(key);
			shared.controller.abort(new GitHubRequestTimeoutError());
			shared = undefined;
		}
		const coalesced = shared !== undefined;
		if (!shared) {
			const controller = new AbortController();
			const requestDeadline = this._deadline({});
			let admitted = false;
			const promise = this._executeGraphQL(account, token, url, request, bodyText, controller.signal, priority, { caller: options.caller, domain: options.domain, deadline: requestDeadline }, () => { admitted = true; });
			if (!admitted) {
				return await promise;
			}
			shared = { controller, deadline: requestDeadline, waiters: new OperationWaiters() };
			this._graphQlInFlight.set(key, shared);
			const created = shared;
			void promise.then(
				value => {
					this._deleteGraphQLRequest(key, created);
					created.waiters.resolve(value);
				},
				error => {
					this._deleteGraphQLRequest(key, created);
					created.waiters.reject(error);
				},
			);
		} else {
			this._logService?.trace(`[GitHubTransport] Reusing GraphQL ${graphQLOperationName(request.query)} (waiters: ${shared.waiters.size + 1})`);
		}
		if (shared.waiters.size >= this._options.maximumSharedWaiters) {
			this._telemetry?.recordRejection('waiter', options.domain);
			throw new GitHubRequestError('GitHub shared request capacity exceeded', 'overloaded');
		}
		if (coalesced) {
			this._telemetry?.record('coalesced');
		}
		this._queue.promote(shared.controller.signal, priority);
		try {
			return await this._waitForShared(shared, signal, options.deadline);
		} finally {
			if (shared.waiters.size === 0 && this._graphQlInFlight.get(key) === shared) {
				this._graphQlInFlight.delete(key);
				this._logService?.trace(`[GitHubTransport] Cancelling GraphQL ${graphQLOperationName(request.query)} because all waiters detached`);
				shared.controller.abort(new Error('All GitHub GraphQL request waiters cancelled'));
			}
		}
	}

	private async _executeGraphQL(
		account: AccountHandle,
		token: string,
		url: string,
		request: GraphQLRequest,
		bodyText: string,
		signal: AbortSignal,
		priority: RequestPriority,
		options: GitHubRequestOptions,
		onAdmitted?: () => void,
	): Promise<IGraphQLResult> {
		const operation = graphQLOperationName(request.query);
		return this._logRequest('GraphQL', operation, account, priority, signal, () => this._enqueueWithRateLimit(account, 'graphql', priority, signal, async (signal, onDispatch) => {
			const { response, body } = await this._fetchWithRetry(account, 'graphql', url, {
				method: 'POST',
				cache: 'no-store',
				headers: {
					'Accept': 'application/json',
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json',
					'X-GitHub-Api-Version': defaultApiVersion,
				},
				body: bodyText,
				signal,
				redirect: 'manual',
			}, isGraphQLRead(request.query), options.caller, onDispatch, async response => {
				this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned HTTP ${response.status}`);
				return { response, body: await this._readResponse(account, response, signal, 'graphql') };
			});
			signal.throwIfAborted();
			if (!response.ok) {
				throw this._httpError('GitHub GraphQL request failed', response, body);
			}
			const metadata = this._responseMetadata(response);
			let json;
			try {
				json = parseGraphQLResponse(parseResponseJson<unknown>(body, () => new GitHubRequestError('GitHub GraphQL response was not valid JSON', 'malformedResponse', response.status, body, undefined, undefined, metadata)));
			} catch (error) {
				if (error instanceof SchemaError) {
					throw new GitHubRequestError(`Invalid GitHub GraphQL response: ${error.message}`, 'malformedResponse', response.status, body, undefined, undefined, metadata);
				}
				throw error;
			}
			const errors = json.errors;
			if (errors.length) {
				this._telemetry?.record('graphqlErrorResponses');
			}
			const rateLimit = readGraphQLRateLimit(json.data);
			this._rateLimits.updateFromGraphQL(account, rateLimit);
			if (errors.some(error => error.type === 'RATE_LIMIT' || error.type === 'RATE_LIMITED')) {
				this._telemetry?.record('rateLimitedResponses');
			}
			// RATE_LIMITED also covers resource updates and queries that cost more than the remaining points.
			if (errors.some(error => error.type === 'RATE_LIMIT') || rateLimit?.remaining === 0) {
				this._rateLimits.markGraphQLRateLimited(account, response.headers.get('retry-after'));
			}
			this._logRateLimit(account, 'graphql');
			this._logService?.trace(`[GitHubTransport] GraphQL ${operation} returned ${errors.length} error(s)`);
			return {
				data: json.data,
				response: { ...metadata, data: body, statusCode: response.status, errors, observedAt: this._scheduler.now() },
			};
		}, options, onAdmitted));
	}

	promote(signal: AbortSignal, priority: RequestPriority): void {
		for (const shared of [...this._inFlight.values(), ...this._graphQlInFlight.values()]) {
			if (shared.waiters.hasSignal(signal)) {
				this._queue.promote(shared.controller.signal, priority);
			}
		}
		this._queue.promote(signal, priority);
	}

	invalidateAccount(account: RequestAccount, reason?: unknown): void {
		const accountKey = RequestQueue.accountKey(account);
		const restRequests = [...this._inFlight.keys()].filter(key => key.startsWith(`${accountKey}\x00`)).length;
		const graphQlRequests = [...this._graphQlInFlight.keys()].filter(key => key.startsWith(`${accountKey}\x00`)).length;
		this._logService?.debug(`[GitHubTransport] Invalidating state for ${account.host} (REST requests: ${restRequests}, GraphQL requests: ${graphQlRequests})`);
		this._queue.cancelAccount(account, reason, this);
		this._rateLimits.releaseAccount(account, this);
		this._accounts.delete(accountKey);
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

	override dispose(): void {
		super.dispose();
		this._logService?.debug(`[GitHubTransport] Clearing transport state (cache: ${this._restCache.size}, REST requests: ${this._inFlight.size}, GraphQL requests: ${this._graphQlInFlight.size})`);
		this._queue.cancelOwner(this);
		for (const account of this._accounts.values()) {
			this._rateLimits.releaseAccount(account, this);
		}
		this._accounts.clear();
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

	private async _executeRest(
		account: RequestAccount,
		token: string | undefined,
		request: GitHubRestTextRequest,
		signal: AbortSignal,
		cacheKey: string,
		anonymousApiBasePath?: string,
		onAdmitted?: () => void,
	): Promise<GitHubRestResponse<string>> {
		const priority = request.priority ?? (request.method === 'GET' || request.method === 'HEAD' ? 'interactive' : 'mutation');
		const operation = `${request.method} ${formatRequestUrl(request.url)}`;
		const resource = request.rateLimitResource ?? getGitHubRestResource(request.followRedirects === false ? request.url : this._redirects.get(request.url) ?? request.url);
		return this._logRequest('REST', operation, account, priority, signal, () => this._enqueueWithRateLimit(account, resource, priority, signal, async (signal, onDispatch) => {
			const cached = request.etag !== false && !request.unconditional ? this._restCache.get(cacheKey) : undefined;
			if (cached) {
				this._logService?.trace(`[GitHubTransport] Using cached ETag for ${operation}`);
			}
			const headers: Record<string, string> = {
				'Accept': request.accept ?? 'application/vnd.github+json',
			};
			if (request.apiVersion !== null) {
				headers['X-GitHub-Api-Version'] = request.apiVersion ?? defaultApiVersion;
			}
			if (request.integrationId !== undefined) {
				headers['Copilot-Integration-Id'] = request.integrationId;
			}
			if (account.kind !== 'anonymous') {
				headers['Authorization'] = `Bearer ${token}`;
			}
			if (cached) {
				headers['If-None-Match'] = cached.etag;
			}
			if (request.bodyText !== undefined) {
				headers['Content-Type'] = 'application/json';
			}
			const { response, body } = await this._fetchRestWithRedirects(account, request, {
				method: request.method,
				cache: 'no-store',
				headers,
				body: request.bodyText,
				signal,
				redirect: 'manual',
				...(account.kind === 'anonymous' || account.kind === 'bootstrap' || request.rateLimitResource?.startsWith('agents') ? { credentials: 'omit', referrerPolicy: 'no-referrer' } as const : {}),
			}, () => {
				onDispatch();
				request.onDidDispatch?.();
			}, anonymousApiBasePath);
			this._logService?.trace(`[GitHubTransport] REST ${operation} returned HTTP ${response.status}`);
			const finalUrl = response.url || (request.followRedirects === false ? request.url : this._redirects.get(request.url) ?? request.url);
			signal.throwIfAborted();
			const metadata = this._responseMetadata(response);
			const noStore = /\bno-store\b/i.test(response.headers.get('cache-control') ?? '');
			const finalCacheKey = this._restCacheKey(account, request, finalUrl);
			this._logRateLimit(account, request.rateLimitResource ?? response.headers.get('x-ratelimit-resource') ?? resource);
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
				if (noStore) {
					this._restCache.delete(cacheKey);
					this._restCache.delete(finalCacheKey);
				} else {
					this._restCache.set(cacheKey, {
						...cached,
						etag: revalidatedEtag,
						link: revalidatedLink,
						fetchedAt: this._scheduler.now(),
					});
				}
				this._logService?.trace(`[GitHubTransport] Reused cached representation for ${operation}`);
				return {
					...metadata,
					data: cached.body,
					statusCode: 304,
					revalidatedStatusCode: cached.statusCode,
					etag: revalidatedEtag,
					finalUrl: cached.finalUrl,
					link: revalidatedLink,
					observedAt: this._scheduler.now(),
				};
			}
			let redirectUrl: string | undefined;
			if (request.followRedirects === false && [301, 302, 307, 308].includes(response.status)) {
				const location = response.headers.get('location');
				if (!location) {
					throw new GitHubRequestError('GitHub API redirect was missing a Location header', 'malformedResponse', response.status);
				}
				let redirect: URL;
				try {
					redirect = new URL(location, request.url);
				} catch {
					throw new GitHubRequestError('GitHub API redirect used an invalid target', 'malformedResponse', response.status);
				}
				if (redirect.protocol !== 'https:' || redirect.username || redirect.password) {
					throw new GitHubRequestError('GitHub API redirect used an unsafe target', 'authorization', response.status);
				}
				redirectUrl = redirect.href;
			} else if (!response.ok) {
				const requestUrl = new URL(request.url);
				const route = `${requestUrl.pathname.replace(/^\//, '')}${requestUrl.search}`;
				throw this._httpError(`GitHub API request failed: ${request.method} ${route}`, response, body);
			}
			const responseEtag = response.headers.get('etag') ?? undefined;
			const representationVersion = request.representationVersion ?? 1;
			if (request.method === 'GET' && request.etag !== false && request.responseBody !== 'none') {
				if (responseEtag && !noStore) {
					const entry: IRestCacheEntry = {
						accountKey: RequestQueue.accountKey(account),
						etag: responseEtag,
						body,
						statusCode: response.status,
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
				...metadata,
				data: request.responseBody === 'none' ? undefined : body,
				statusCode: response.status,
				...(redirectUrl ? { redirectUrl } : undefined),
				etag: responseEtag,
				finalUrl,
				link: response.headers.get('link') ?? undefined,
				observedAt: this._scheduler.now(),
			};
		}, request, onAdmitted));
	}

	private _enqueueWithRateLimit<T>(
		account: RequestAccount,
		resource: string,
		priority: RequestPriority,
		signal: AbortSignal,
		task: (signal: AbortSignal, onDispatch: () => void) => Promise<T>,
		options: GitHubRequestOptions,
		onAdmitted?: () => void,
	): Promise<T> {
		const context: RequestContext = {
			account, resource, priority, signal, owner: this,
			caller: options.caller ?? 'github',
			domain: options.domain,
			deadline: this._deadline(options),
		};
		// A rejected request never becomes active, so it must not cancel cleanup of an inactive cooldown.
		return this._queue.enqueue(context, task, () => {
			this._accounts.set(RequestQueue.accountKey(account), account);
			this._rateLimits.retainAccount(account, this);
			onAdmitted?.();
		});
	}

	private async _fetchRestWithRedirects(account: RequestAccount, request: GitHubRestTextRequest, init: RequestInit & { signal: AbortSignal; headers: Record<string, string> }, onDispatch: () => void, anonymousApiBasePath?: string): Promise<{ response: Response; body: string }> {
		const initialUrl = request.url;
		let url = request.followRedirects === false ? initialUrl : this._redirects.get(initialUrl) ?? initialUrl;
		const initialOrigin = new URL(url).origin;
		const readResponse = async (response: Response) => {
			const discardBody = response.ok && request.responseBody === 'none'
				|| request.followRedirects !== false && [301, 302, 307, 308].includes(response.status)
				|| response.type === 'opaqueredirect';
			if (discardBody && response.body) {
				cancelResponseBody(response.body, this._logService);
			}
			return { response, body: discardBody ? '' : await this._readResponse(account, response, init.signal, request.rateLimitResource ?? getGitHubRestResource(response.url || url), request.maximumResponseBytes) };
		};
		for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount++) {
			const result = await this._fetchWithRetry(account, request.rateLimitResource ?? getGitHubRestResource(url), url, init, (request.method === 'GET' || request.method === 'HEAD') && request.retry !== false, request.caller, onDispatch, readResponse);
			if (result.response.type === 'opaqueredirect' && this._options.useBrowserRedirects && isRepositoryRead(request)) {
				const headers: Record<string, string> = {};
				for (const name of ['Accept', 'Authorization', 'X-GitHub-Api-Version']) {
					if (init.headers[name] !== undefined) {
						headers[name] = init.headers[name];
					}
				}
				const followed = await this._fetchWithRetry(account, request.rateLimitResource ?? getGitHubRestResource(url), url, {
					...init, headers, redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer',
				}, request.retry !== false, request.caller, onDispatch, readResponse, response => {
					if (!response.url) {
						throw new GitHubRequestError('GitHub browser redirect did not expose a final URL', 'malformedResponse');
					}
					this._validateRestRedirect(account, new URL(response.url), initialOrigin, anonymousApiBasePath, response.status);
				});
				this._redirects.set(initialUrl, followed.response.url);
				return followed;
			}
			const { response } = result;
			if (request.followRedirects === false || ![301, 302, 307, 308].includes(response.status)) {
				if (url !== initialUrl) {
					this._redirects.set(initialUrl, url);
				}
				return result;
			}
			const location = response.headers.get('location');
			if (!location) {
				throw new GitHubRequestError('GitHub redirect was missing a Location header', 'malformedResponse', response.status);
			}
			url = new URL(location, url).href;
			const target = new URL(url);
			this._validateRestRedirect(account, target, initialOrigin, anonymousApiBasePath, response.status);
			this._logService?.trace(`[GitHubTransport] Following REST redirect to ${formatRequestUrl(url)}`);
		}
		throw new GitHubRequestError('GitHub API request exceeded the redirect limit', 'unknown');
	}

	private _validateRestRedirect(account: RequestAccount, target: URL, initialOrigin: string, anonymousApiBasePath: string | undefined, statusCode: number): void {
		if (target.origin !== initialOrigin || ((account.kind === 'anonymous' || account.kind === 'bootstrap') && (target.username || target.password))) {
			throw new GitHubRequestError('GitHub redirect changed origin', 'authorization', statusCode);
		}
		if ((account.kind === 'anonymous' || account.kind === 'bootstrap') && (!anonymousApiBasePath || !target.pathname.startsWith(anonymousApiBasePath))) {
			throw new GitHubRequestError('GitHub read redirect escaped its API endpoint', 'authorization', statusCode);
		}
	}

	private async _fetchWithRetry<T extends { body: string }>(account: RequestAccount, resource: string, url: string, init: RequestInit & { signal: AbortSignal; headers: Record<string, string> }, retry: boolean, caller: string | undefined, onDispatch: () => void, readResponse: (response: Response) => Promise<T>, validateResponse?: (response: Response) => void): Promise<T> {
		let failure: unknown;
		for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
			init.signal.throwIfAborted();
			const cooldown = this._rateLimits.getRequestDelay(account, resource);
			if (cooldown > 0) {
				throw account.kind === 'bootstrap' ? new GitHubRequestRateLimitError(cooldown)
					: new GitHubRequestError('GitHub request is rate limited', 'rateLimit');
			}
			// Browser-native redirects can forward custom headers to another origin.
			const headers = { ...init.headers, ...(init.redirect === 'follow' ? undefined : this._options.requestMetadata?.getHeaders(url, caller, attempt > 0)) };
			try {
				onDispatch();
				this._telemetry?.recordWireAttempt(attempt > 0, init.headers['If-None-Match'] !== undefined);
				const response = await this._fetch(url, { ...init, headers });
				this._telemetry?.recordResponse(response.status);
				if (init.signal.aborted) {
					if (response.body) {
						cancelResponseBody(response.body, this._logService);
					}
					throw init.signal.reason;
				}
				try {
					validateResponse?.(response);
				} catch (error) {
					if (response.body) {
						cancelResponseBody(response.body, this._logService);
					}
					throw error;
				}
				const agents = resource.startsWith('agents');
				if (!agents) {
					this._updateRateLimits(account, response, resource);
				}
				const result = agents && (response.status >= 500 || response.status === 408) ? await readResponse(response) : undefined;
				const code = result ? parseMissionControlError(result.body).code : undefined;
				if (result && !isRetryableMissionControlError(response.status, code)) {
					return result;
				}
				if (retry && attempt === 0 && (response.status >= 500 || agents && response.status === 408) && this._rateLimits.getRequestDelay(account, resource) === 0) {
					if (!result && response.body) {
						cancelResponseBody(response.body, this._logService);
					}
					this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after HTTP ${response.status}`);
					await schedulerDelay(this._scheduler, agents
						? missionControlRetryDelay(code, parseRetryAfter(response.headers.get('retry-after'), this._scheduler.now()), 1)
						: 100 + this._scheduler.jitter(200), init.signal);
					continue;
				}
				return result ?? await readResponse(response);
			} catch (error) {
				if (init.signal.aborted) {
					throw init.signal.reason;
				}
				if (error instanceof RequestError && error.kind !== 'network') {
					throw error;
				}
				failure = error;
				if (attempt === 0 && retry && this._rateLimits.getRequestDelay(account, resource) === 0) {
					this._logService?.debug(`[GitHubTransport] Retrying ${formatRequestUrl(url)} after a network failure`);
					await schedulerDelay(this._scheduler, resource.startsWith('agents') ? missionControlRetryDelay(undefined, undefined, 1) : 100 + this._scheduler.jitter(200), init.signal);
				} else {
					break;
				}
			}
		}
		if (failure instanceof RequestError) {
			throw failure;
		}
		throw new GitHubRequestError(`GitHub network request failed: ${String(failure)}`, 'network');
	}

	private async _readResponse(account: RequestAccount, response: Response, signal: AbortSignal, resource: string, maximumBytes = this._options.maximumResponseBytes): Promise<string> {
		const result = await this._readResponseBody(response, Math.min(maximumBytes, this._options.maximumResponseBytes), signal).catch(error => {
			if (resource.startsWith('agents')) {
				this._updateRateLimits(account, response, resource);
			}
			throw error;
		});
		signal.throwIfAborted();
		const body = new TextDecoder().decode(result.bytes);
		if (response.status === 403 && classifyHttpError(response, body) === 'rateLimit') {
			this._telemetry?.record('rateLimitedResponses');
		}
		this._updateRateLimits(account, response, resource, body);
		if (result.truncated && response.ok) {
			throw new GitHubRequestError('GitHub response exceeded its byte limit', 'responseTooLarge', response.status);
		}
		return body;
	}

	private _updateRateLimits(account: RequestAccount, response: Response, resource: string, body?: string): void {
		if (resource.startsWith('agents')) {
			this._rateLimits.updateFromAgentsResponse(account, response, body);
		} else {
			this._rateLimits.updateFromResponse(account, response, body, resource);
		}
	}

	private _deadline(options: RequestOptions, timeout = this._options.requestTimeout): number {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub client was disposed', 'unknown');
		}
		if (options.caller !== undefined && !options.caller.trim()
			|| options.deadline !== undefined && !Number.isFinite(options.deadline)) {
			throw new GitHubRequestError('Invalid GitHub request options', 'validation');
		}
		const now = this._scheduler.now();
		const deadline = Math.min(options.deadline ?? Infinity, now + Math.min(timeout, this._options.requestTimeout));
		if (deadline <= now) {
			throw new GitHubRequestTimeoutError();
		}
		return deadline;
	}

	private _restCacheKey(account: RequestAccount, request: GitHubRestTextRequest, url: string): string {
		return [
			RequestQueue.accountKey(account),
			request.method,
			url,
			request.accept ?? 'application/vnd.github+json',
			request.apiVersion === null ? '' : request.apiVersion ?? defaultApiVersion,
			request.integrationId ?? '',
			request.rateLimitResource ?? '',
			request.responseBody ?? 'json',
			request.representationVersion ?? 1,
			request.maximumResponseBytes ?? this._options.maximumResponseBytes,
		].join('\x00');
	}

	private _restCoalescingKey(account: RequestAccount, request: GitHubRestTextRequest, url: string): string {
		return [
			this._restCacheKey(account, request, url),
			request.etag === false ? 'etag-disabled' : 'etag-enabled',
			request.unconditional === true ? 'unconditional' : 'conditional',
			request.retry === false ? 'no-retry' : 'retry',
			request.followRedirects === false ? 'no-redirects' : 'redirects',
		].join('\x00');
	}

	private _deleteRestRequest(key: string, request: IInFlightOperation<GitHubRestResponse<string>>): void {
		if (this._inFlight.get(key) === request) {
			this._inFlight.delete(key);
		}
	}

	private _deleteGraphQLRequest(key: string, request: IInFlightOperation<IGraphQLResult>): void {
		if (this._graphQlInFlight.get(key) === request) {
			this._graphQlInFlight.delete(key);
		}
	}

	private _httpError(prefix: string, response: Response, body: string): GitHubRequestError {
		const detail = formatErrorBody(body);
		const message = `${prefix} - ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`;
		return new GitHubRequestError(message, classifyHttpError(response, body), response.status, body, undefined, response.statusText, this._responseMetadata(response));
	}

	private _responseMetadata(response: Response): GitHubResponseMetadata {
		return {
			serverDate: response.headers.get('date') ?? undefined,
			requestId: response.headers.get('x-github-request-id') ?? response.headers.get('x-request-id') ?? undefined,
			retryAfterSeconds: parseRetryAfter(response.headers.get('retry-after'), this._scheduler.now()),
		};
	}

	private _parseJson<T>(body: string, message: string): T {
		return parseResponseJson(body, () => new GitHubRequestError(message, 'malformedResponse'));
	}

	private async _logRequest<T>(
		kind: string,
		operation: string,
		account: RequestAccount,
		priority: RequestPriority,
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

	private async _trackRequest<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
		const finish = this._telemetry?.startRequest();
		let outcome: RequestOutcome = 'success';
		try {
			return await task();
		} catch (error) {
			outcome = requestOutcome(error, signal.aborted);
			if (!signal.aborted && !(error instanceof GitHubRequestError)) {
				if (error instanceof RequestTimeoutError) {
					throw new GitHubRequestTimeoutError(error.requestDispatched);
				} else if (error instanceof RequestRateLimitError) {
					throw new GitHubRequestRateLimitError(error.retryAfterMs);
				} else if (error instanceof RequestError) {
					throw new GitHubRequestError(`GitHub ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`, error.kind, error.statusCode, error.responseBody, undefined, error.statusText);
				}
			}
			throw error;
		} finally {
			finish?.(outcome);
		}
	}

	private _logRateLimit(account: RequestAccount, resource: string): void {
		const state = this._rateLimits.getState(account, resource);
		if (state) {
			this._logService?.trace(`[GitHubTransport] Rate limit ${resource} on ${account.host}: remaining=${state.remaining ?? 'unknown'}, limit=${state.limit ?? 'unknown'}, resetAt=${state.resetAt ?? 'unknown'}, blockedUntil=${state.blockedUntil ?? 'none'}`);
		}
	}

	private _waitForShared<T>(shared: IInFlightOperation<T>, signal: AbortSignal, deadline: number): Promise<T> {
		return shared.waiters.wait(signal, deadline, this._scheduler, () => new GitHubRequestTimeoutError());
	}

}

function isRepositoryRead(request: GitHubRestTextRequest): boolean {
	return (request.method === 'GET' || request.method === 'HEAD') && request.bodyText === undefined && request.followRedirects !== false
		&& request.onDidDispatch === undefined && !request.rateLimitResource?.startsWith('agents')
		&& /^\/(?:api\/v3\/)?(?:repos\/[^/]+\/[^/]+|repositories\/[0-9]+)(?:\/|$)/.test(new URL(request.url).pathname);
}

function isGraphQLRead(query: string): boolean {
	let offset = 0;
	while (offset < query.length) {
		if (query[offset] === '#') {
			while (offset < query.length && query[offset] !== '\r' && query[offset] !== '\n') {
				offset++;
			}
		} else if (/[\s,]/.test(query[offset])) {
			offset++;
		} else {
			break;
		}
	}
	return /^(?:query\b|\{)/.test(query.slice(offset));
}

function classifyHttpError(response: Response, body: string): RequestErrorKind {
	if (classifyGitHubHttpRateLimit(response, body)) {
		return 'rateLimit';
	}
	switch (response.status) {
		case 401: return 'authentication';
		case 403: return 'authorization';
		case 404: return 'notFound';
		case 422: return 'validation';
		default: return response.status >= 500 ? 'server' : 'unknown';
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
	return typeof property === 'number' && Number.isSafeInteger(property) && property >= 0 ? property : undefined;
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
	if (url.protocol === 'https:' && !url.username && !url.password) {
		return;
	}
	if (allowInsecureLoopback
		&& url.protocol === 'http:'
		&& !url.username && !url.password
		&& (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]')) {
		return;
	}
	throw new GitHubRequestError('GitHub download redirect used an unsafe target', 'authorization');
}
