/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { GitHubCredentialService, IGitHubCredentials } from './githubCredentialService.js';
import { BackoffGate } from './backoff.js';
import { GitHubHostCapabilitiesService, IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { GitHubQueryService, IGitHubQuery } from './githubQueryServiceImpl.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { RequestQueue } from './requestQueue.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { systemRequestScheduler } from './scheduler.js';
import { GitHubAnonymousReadOptions, GitHubBootstrapReadOptions, GitHubRestResponse, GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { GitHubAnonymousClientOptions, GitHubAuthorizationContext, GitHubBootstrapClientOptions, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions, IGitHubCredentialProvider, IGitHubEndpointProvider } from './githubTypes.js';
import { AnonymousAccount, BootstrapAccount } from './types.js';
import { IPullRequestMutations, PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

/** Runtime-owned GitHub engine providing isolated clients with shared admission and quota state. */
export interface IGitHubService {
	readonly _serviceBrand: undefined;
	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient>;
	acquireAnonymousClient(options: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient>;
	acquireBootstrapClient(options: GitHubBootstrapClientOptions): IReference<IGitHubBootstrapClient>;
}

/** Credential-free public JSON reads confined to an approved API base. */
export interface IGitHubAnonymousClient {
	readonly authorization: { readonly kind: 'anonymous' };
	readonly apiBaseUri: string;
	get<T>(path: string, signal: AbortSignal, options?: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<T>>;
}

/** Explicit-credential reads that do not depend on account selection or accepted-token publication. */
export interface IGitHubBootstrapClient {
	readonly apiBaseUri: string;
	get<T>(path: string, signal: AbortSignal, options?: GitHubBootstrapReadOptions): Promise<GitHubRestResponse<T>>;
}

/** Authorization-scoped GitHub operations and resources shared by equivalent client leases. */
export interface IGitHubClient {
	readonly authorization: GitHubAuthorizationContext;
	readonly onDidInvalidate: Event<void>;
	readonly endpoint: IGitHubEndpointProvider;
	readonly credentials: IGitHubCredentials;
	readonly transport: IGitHubTransport;
	readonly capabilities: IGitHubCapabilities;
	readonly query: IGitHubQuery;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: IPullRequestMutations;
}

/** Engine-owned grant entry retaining its leases, client resources and identity backoff. */
interface IClientEntry {
	readonly context: GitHubClientOptions;
	readonly store: DisposableStore;
	readonly client: MutableDisposable<GitHubClient>;
	readonly backoff: BackoffGate;
	readonly expiry: MutableDisposable<IDisposable>;
	references: number;
}

/** Coordinates isolated GitHub clients using one runtime admission queue and quota owner. */
export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	private readonly _clients = new Map<string, IClientEntry>();
	private readonly _anonymousClients = this._register(new DisposableMap<string, GitHubAnonymousClient>());
	private readonly _bootstrapClients = this._register(new DisposableMap<string, GitHubBootstrapClient>());
	private readonly _telemetry: GitHubRequestTelemetry;
	private readonly _rateLimits: GitHubRateLimitCoordinator;
	private readonly _queue: RequestQueue;
	private static readonly maximumClients = 64;
	private static readonly unusedBackoffLifetime = 5 * 60_000;

	constructor(
		private readonly _options: GitHubServiceOptions,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._telemetry = this._register(new GitHubRequestTelemetry(_options.telemetrySource ?? 'other', systemRequestScheduler, telemetryService, _logService, _options.onDidChangeTelemetryLevel));
		this._rateLimits = this._register(new GitHubRateLimitCoordinator(systemRequestScheduler));
		this._queue = this._register(new RequestQueue(systemRequestScheduler, context => this._rateLimits.getDelay(context.account, context.resource), undefined, this._telemetry));
		if (_options.credentialProvider) {
			this._register(_options.credentialProvider.onDidChange(change => this._invalidateClients(change)));
		}
		this._logService.debug('[GitHubService] Reusable GitHub service initialized');
	}

	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const credentialProvider = this._options.credentialProvider;
		if (!credentialProvider) {
			throw new GitHubRequestError('GitHub authenticated clients require a credential provider', 'authentication');
		}
		const authorization = options.authorization;
		if (!authorization.providerId || !authorization.sessionId || authorization.scopes.some(scope => !scope)) {
			throw new GitHubRequestError('Invalid GitHub authorization context', 'validation');
		}
		const normalized: GitHubClientOptions = {
			apiBaseUri: new URL(options.apiBaseUri).href.replace(/\/$/, ''),
			graphQlUri: new URL(options.graphQlUri).href,
			authorization: Object.freeze({ ...authorization, scopes: Object.freeze([...new Set(authorization.scopes)].sort()) }),
		};
		const key = JSON.stringify([normalized.authorization.providerId, normalized.authorization.sessionId, normalized.authorization.accountId, normalized.authorization.scopes, normalized.authorization.authorizationServer, normalized.apiBaseUri, normalized.graphQlUri]);
		let entry = this._clients.get(key);
		if (!entry) {
			this._ensureClientCapacity();
			const store = new DisposableStore();
			entry = {
				context: normalized,
				store,
				backoff: store.add(GitHubCredentialService.createBackoff(undefined, this._logService)),
				client: store.add(new MutableDisposable<GitHubClient>()),
				expiry: store.add(new MutableDisposable()),
				references: 0,
			};
			this._clients.set(key, entry);
		}
		const retained = entry;
		retained.expiry.clear();
		retained.client.value ??= new GitHubClient(normalized, this._options, credentialProvider, this._queue, this._rateLimits, this._telemetry, retained.backoff, this._logService);
		const client = retained.client.value;
		retained.references++;
		const release = toDisposable(() => {
			if (--retained.references === 0 && !retained.store.isDisposed) {
				retained.client.clear();
				retained.expiry.value = systemRequestScheduler.schedule(() => {
					if (this._clients.get(key) === retained) {
						this._clients.delete(key);
					}
					retained.store.dispose();
				}, GitHubService.unusedBackoffLifetime);
			}
		});
		return { object: client, dispose: () => release.dispose() };
	}

	acquireAnonymousClient(options: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const key = normalizeReadApiBaseUri(options.apiBaseUri);
		let client = this._anonymousClients.get(key);
		if (!client) {
			this._ensureClientCapacity();
			client = new GitHubAnonymousClient(key, this._options, this._queue, this._rateLimits, this._telemetry, this._logService);
			this._anonymousClients.set(key, client);
		}
		const retained = client;
		retained.references++;
		const release = toDisposable(() => {
			if (--retained.references === 0 && this._anonymousClients.get(key) === retained) {
				this._anonymousClients.deleteAndDispose(key);
			}
		});
		return { object: retained, dispose: () => release.dispose() };
	}

	acquireBootstrapClient(options: GitHubBootstrapClientOptions): IReference<IGitHubBootstrapClient> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		if (typeof options.token !== 'string' || !options.token || options.accountId !== undefined && (typeof options.accountId !== 'string' || !options.accountId)) {
			throw new GitHubRequestError('Invalid GitHub bootstrap credential', 'validation');
		}
		const apiBaseUri = normalizeReadApiBaseUri(options.apiBaseUri);
		const key = JSON.stringify([apiBaseUri, options.accountId, options.token]);
		let client = this._bootstrapClients.get(key);
		if (!client) {
			this._ensureClientCapacity();
			client = new GitHubBootstrapClient(apiBaseUri, Object.freeze({ ...options, apiBaseUri }), this._options, this._queue, this._rateLimits, this._telemetry, this._logService);
			this._bootstrapClients.set(key, client);
		}
		const retained = client;
		retained.references++;
		const release = toDisposable(() => {
			if (--retained.references === 0 && this._bootstrapClients.get(key) === retained) {
				this._bootstrapClients.deleteAndDispose(key);
			}
		});
		return { object: retained, dispose: () => release.dispose() };
	}

	private _ensureClientCapacity(): void {
		if (this._clients.size + this._anonymousClients.size + this._bootstrapClients.size < GitHubService.maximumClients) {
			return;
		}
		const unused = [...this._clients].find(([, entry]) => entry.references === 0);
		if (!unused) {
			throw new GitHubRequestError('GitHub client capacity exceeded', 'overloaded');
		}
		this._clients.delete(unused[0]);
		unused[1].store.dispose();
	}

	private _invalidateClients(change: GitHubCredentialChange): void {
		for (const [key, entry] of [...this._clients]) {
			const authorization = entry.context.authorization;
			if (authorization.providerId === change.providerId && (!change.sessionIds || change.sessionIds.includes(authorization.sessionId))) {
				this._clients.delete(key);
				entry.client.value?.invalidate();
				entry.store.dispose();
			}
		}
	}

	override dispose(): void {
		for (const entry of this._clients.values()) {
			entry.store.dispose();
		}
		this._clients.clear();
		super.dispose();
	}
}

/** Owns the credential, transport and domain resources for one selected GitHub grant. */
class GitHubClient extends Disposable implements IGitHubClient {

	private readonly _onDidInvalidate = this._register(new Emitter<void>());
	readonly onDidInvalidate = this._onDidInvalidate.event;
	readonly authorization: GitHubAuthorizationContext;
	readonly transport: IGitHubTransport;
	readonly endpoint: IGitHubEndpointProvider;
	readonly credentials: IGitHubCredentials;
	readonly capabilities: IGitHubCapabilities;
	readonly query: IGitHubQuery;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: IPullRequestMutations;

	constructor(
		context: GitHubClientOptions,
		options: GitHubServiceOptions,
		credentialProvider: IGitHubCredentialProvider,
		queue: RequestQueue,
		rateLimits: GitHubRateLimitCoordinator,
		telemetry: GitHubRequestTelemetry,
		backoff: BackoffGate,
		logService: ILogService,
	) {
		super();

		this.authorization = context.authorization;
		this.endpoint = {
			onDidChange: Event.None,
			getApiBaseUri: () => context.apiBaseUri,
			getGraphQlUri: () => context.graphQlUri,
		};
		this.transport = this._register(new GitHubTransport(options.fetch, undefined, false, logService, {
			requestMetadata: options.clientMetadata ? new GitHubRequestMetadata(options.clientMetadata, this.endpoint) : undefined,
			coordination: { queue, rateLimits },
		}, telemetry));
		this.credentials = this._register(new GitHubCredentialService(undefined, undefined, this.transport, {
			getToken: signal => credentialProvider.getToken(this.authorization, signal),
			invalidateToken: token => credentialProvider.invalidateToken?.(this.authorization, token),
		}, this.endpoint, logService, {
			host: new URL(context.apiBaseUri).host,
			accountId: `bootstrap:${JSON.stringify([context.authorization.providerId, context.authorization.sessionId, context.authorization.accountId, context.authorization.authorizationServer, context.apiBaseUri])}`,
		}, backoff));
		this.capabilities = this._register(new GitHubHostCapabilitiesService(undefined, undefined, this.transport, this.endpoint, logService));

		const pullRequestQuery = new PullRequestQueryService(this.transport, this.capabilities, this.endpoint, logService);
		this.pullRequests = this._register(new PullRequestResourceService(
			undefined,
			undefined,
			this.credentials,
			pullRequestQuery,
			logService,
		));
		this.mutations = this._register(new PullRequestMutationService(
			undefined,
			this.credentials,
			this.transport,
			this.pullRequests,
			this.endpoint,
			logService,
		));
		this.query = this._register(new GitHubQueryService(
			undefined,
			undefined,
			this.credentials,
			this.transport,
			this.endpoint,
			this.capabilities,
			logService,
		));
	}

	invalidate(): void {
		this._onDidInvalidate.fire();
		this.dispose();
	}
}

/** Reference-counted public reader with no access to credential providers or private caches. */
class GitHubAnonymousClient extends Disposable implements IGitHubAnonymousClient {
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

	async get<T>(path: string, signal: AbortSignal, options: GitHubAnonymousReadOptions = {}): Promise<GitHubRestResponse<T>> {
		signal.throwIfAborted();
		const { url, apiBasePath } = resolveReadApiUrl(this.apiBaseUri, path);
		return this._transport.anonymousGet<T>(this._account, apiBasePath, { ...options, url: url.href }, signal);
	}
}

/** Reference-counted reader for a supplied bootstrap credential and its private request state. */
class GitHubBootstrapClient extends Disposable implements IGitHubBootstrapClient {
	references = 0;
	private readonly _account: BootstrapAccount;
	private readonly _transport: GitHubTransport;

	constructor(
		readonly apiBaseUri: string,
		private readonly _credential: GitHubBootstrapClientOptions,
		options: GitHubServiceOptions,
		queue: RequestQueue,
		rateLimits: GitHubRateLimitCoordinator,
		telemetry: GitHubRequestTelemetry,
		logService: ILogService,
	) {
		super();
		const endpoint = new URL(apiBaseUri);
		this._account = { kind: 'bootstrap', host: endpoint.host, origin: endpoint.origin, accountId: _credential.accountId };
		this._transport = this._register(new GitHubTransport(options.fetch, undefined, false, logService, {
			coordination: { queue, rateLimits },
			requestMetadata: options.clientMetadata ? new GitHubRequestMetadata(options.clientMetadata, {
				onDidChange: Event.None,
				getApiBaseUri: () => apiBaseUri,
				getGraphQlUri: () => apiBaseUri,
			}) : undefined,
		}, telemetry));
	}

	async get<T>(path: string, signal: AbortSignal, options: GitHubBootstrapReadOptions = {}): Promise<GitHubRestResponse<T>> {
		signal.throwIfAborted();
		const { url, apiBasePath } = resolveReadApiUrl(this.apiBaseUri, path);
		return this._transport.bootstrapGet<T>(this._account, this._credential.token, apiBasePath, { ...options, url: url.href }, signal);
	}
}

function normalizeReadApiBaseUri(apiBaseUri: string): string {
	let endpoint: URL;
	try {
		endpoint = new URL(apiBaseUri);
	} catch {
		throw new GitHubRequestError('Invalid GitHub read API endpoint', 'validation');
	}
	if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
		throw new GitHubRequestError('Invalid GitHub read API endpoint', 'validation');
	}
	return endpoint.href.replace(/\/+$/, '');
}

function resolveReadApiUrl(apiBaseUri: string, path: string): { url: URL; apiBasePath: string } {
	if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
		throw new GitHubRequestError('GitHub reads require an API-relative path', 'validation');
	}
	const url = new URL(`${apiBaseUri}${path}`);
	const endpoint = new URL(apiBaseUri);
	const apiBasePath = `${endpoint.pathname.replace(/\/+$/, '')}/`;
	if (url.origin !== endpoint.origin || !url.pathname.startsWith(apiBasePath) || url.username || url.password || url.hash) {
		throw new GitHubRequestError('GitHub read escaped its API endpoint', 'validation');
	}
	return { url, apiBasePath };
}
