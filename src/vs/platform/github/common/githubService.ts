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
import { GitHubBackoffGate } from './githubBackoff.js';
import { GitHubHostCapabilitiesService, IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { GitHubQueryService, IGitHubQuery } from './githubQueryServiceImpl.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { GitHubRequestQueue } from './githubRequestQueue.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { systemGitHubScheduler } from './githubScheduler.js';
import { GitHubAnonymousReadOptions, GitHubRestResponse, GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { GitHubAnonymousAccount, GitHubAnonymousClientOptions, GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions, IGitHubCredentialProvider, IGitHubEndpointProvider } from './githubTypes.js';
import { IPullRequestMutations, PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

export interface IGitHubService {
	readonly _serviceBrand: undefined;
	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient>;
	acquireAnonymousClient(options: GitHubAnonymousClientOptions): IReference<IGitHubAnonymousClient>;
}

export interface IGitHubAnonymousClient {
	readonly authorization: { readonly kind: 'anonymous' };
	readonly apiBaseUri: string;
	get<T>(path: string, signal: AbortSignal, options?: GitHubAnonymousReadOptions): Promise<GitHubRestResponse<T>>;
}

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

interface IClientEntry {
	readonly context: GitHubClientOptions;
	readonly store: DisposableStore;
	readonly client: MutableDisposable<GitHubClient>;
	readonly backoff: GitHubBackoffGate;
	readonly expiry: MutableDisposable<IDisposable>;
	references: number;
}

export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	private readonly _clients = new Map<string, IClientEntry>();
	private readonly _anonymousClients = this._register(new DisposableMap<string, GitHubAnonymousClient>());
	private readonly _telemetry: GitHubRequestTelemetry;
	private readonly _rateLimits: GitHubRateLimitCoordinator;
	private readonly _queue: GitHubRequestQueue;
	private static readonly maximumClients = 64;
	private static readonly unusedBackoffLifetime = 5 * 60_000;

	constructor(
		private readonly _options: GitHubServiceOptions,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super();
		this._telemetry = this._register(new GitHubRequestTelemetry(_options.telemetrySource ?? 'other', systemGitHubScheduler, telemetryService, _logService, _options.onDidChangeTelemetryLevel));
		this._rateLimits = this._register(new GitHubRateLimitCoordinator(systemGitHubScheduler));
		this._queue = this._register(new GitHubRequestQueue(systemGitHubScheduler, context => this._rateLimits.getDelay(context.account, context.resource), undefined, this._telemetry));
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
				retained.expiry.value = systemGitHubScheduler.schedule(() => {
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
		let endpoint: URL;
		try {
			endpoint = new URL(options.apiBaseUri);
		} catch {
			throw new GitHubRequestError('Invalid anonymous GitHub API endpoint', 'validation');
		}
		if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
			throw new GitHubRequestError('Invalid anonymous GitHub API endpoint', 'validation');
		}
		const key = endpoint.href.replace(/\/+$/, '');
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

	private _ensureClientCapacity(): void {
		if (this._clients.size + this._anonymousClients.size < GitHubService.maximumClients) {
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
		queue: GitHubRequestQueue,
		rateLimits: GitHubRateLimitCoordinator,
		telemetry: GitHubRequestTelemetry,
		backoff: GitHubBackoffGate,
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

class GitHubAnonymousClient extends Disposable implements IGitHubAnonymousClient {
	readonly authorization = Object.freeze({ kind: 'anonymous' as const });
	references = 0;
	private readonly _account: GitHubAnonymousAccount;
	private readonly _transport: GitHubTransport;

	constructor(
		readonly apiBaseUri: string,
		options: GitHubServiceOptions,
		queue: GitHubRequestQueue,
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
		if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
			throw new GitHubRequestError('Anonymous GitHub reads require an API-relative path', 'validation');
		}
		const url = new URL(`${this.apiBaseUri}${path}`);
		const endpoint = new URL(this.apiBaseUri);
		if (url.origin !== endpoint.origin || !url.pathname.startsWith(`${endpoint.pathname.replace(/\/+$/, '')}/`)
			|| url.username || url.password || url.hash) {
			throw new GitHubRequestError('Anonymous GitHub read escaped its API endpoint', 'validation');
		}
		return this._transport.anonymousGet<T>(this._account, { ...options, url: url.href }, signal);
	}
}
