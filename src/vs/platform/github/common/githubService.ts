/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IGitHubAnonymousClient } from './anonymous/anonymous.js';
import { AnonymousClient } from './anonymous/anonymousClient.js';
import { LocalApiRequestProvider } from './client/localApiRequestProvider.js';
import { BufferedApiRequestProvider } from './client/request.js';
import { LocalMissionControlRequestProvider, missionControlAccount } from './client/localMissionControlRequestProvider.js';
import { GitHubCredentialService, IGitHubCredentials } from './githubCredentialService.js';
import { BackoffGate } from './backoff.js';
import { deriveGitHubEndpoints, normalizeReadApiBaseUri, resolveReadApiUrl } from './githubEndpoints.js';
import { GitHubHostCapabilitiesService } from './githubHostCapabilitiesService.js';
import { PullRequestMutationApi } from './githubPullRequestMutationService.js';
import { GitHubQueryApi } from './githubQueryService.js';
import { GitHubQueryService } from './githubQueryServiceImpl.js';
import { GitHubRequestMetadata } from './githubRequestMetadata.js';
import { GitHubRequestTelemetry } from './githubRequestTelemetry.js';
import { RequestQueue } from './requestQueue.js';
import { GitHubRateLimitCoordinator } from './githubRateLimitCoordinator.js';
import { systemRequestScheduler } from './scheduler.js';
import { GitHubBootstrapReadOptions, GitHubRestResponse, GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { GitHubAuthorizationContext, GitHubBootstrapClientOptions, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions, IGitHubCredentialProvider, IGitHubEndpointProvider } from './githubTypes.js';
import { BootstrapAccount } from './types.js';
import { PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';
import { MissionControlClient } from './missionControl/missionControlClient.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

export type { IGitHubAnonymousClient };

/** Runtime-owned GitHub engine providing isolated clients with shared admission and quota state. */
export interface IGitHubService {
	readonly _serviceBrand: undefined;
	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient>;
	acquireAnonymousClient(): IGitHubAnonymousClient;
	/** Internal execution lease for IPC; uses the same pool as local anonymous clients. */
	acquireAnonymousRequestProviders(): IReference<ApiRequestProviders>;
	/** Isolates connection-owned credentials and private caches within the shared engine. */
	createRequestProviderScope(credentialProvider: IGitHubCredentialProvider): IGitHubRequestProviderScope;
	acquireBootstrapClient(options: GitHubBootstrapClientOptions): IReference<IGitHubBootstrapClient>;
}

export interface ApiRequestProviders {
	readonly rest: LocalApiRequestProvider;
	readonly rawContent?: LocalApiRequestProvider;
	readonly graphql?: LocalApiRequestProvider;
	readonly missionControl?: BufferedApiRequestProvider;
	readonly onDidInvalidate?: Event<void>;
	readonly onDidChangeCredentials?: Event<void>;
}

export interface AuthenticatedRequestProviders extends ApiRequestProviders {
	readonly authorization: GitHubAuthorizationContext;
	readonly graphql: LocalApiRequestProvider;
}

export interface IGitHubRequestProviderScope extends IDisposable {
	acquireClient(options: GitHubClientOptions): IReference<AuthenticatedRequestProviders>;
}

/** Explicit-credential reads that do not depend on account selection or accepted-token publication. */
export interface IGitHubBootstrapClient {
	readonly apiBaseUri: string;
	get<T>(path: string, signal: AbortSignal, options?: GitHubBootstrapReadOptions): Promise<GitHubRestResponse<T>>;
}

/** Authorization-scoped GitHub operations and resources shared by equivalent client leases. */
export interface IGitHubClient {
	readonly authorization: GitHubAuthorizationContext;
	readonly credentials: IGitHubCredentials;
	readonly query: GitHubQueryApi;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: PullRequestMutationApi;
}

/** Engine-owned grant entry retaining its leases, client resources and identity backoff. */
interface IClientEntry {
	readonly scope: number;
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
	private readonly _requestProviderScopes = this._register(new DisposableMap<number, DisposableStore>());
	private _nextRequestProviderScope = 0;
	private readonly _anonymousClient = this._register(new MutableDisposable<AnonymousClientEntry>());
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
		this._queue = this._register(new RequestQueue(systemRequestScheduler, context => this._rateLimits.getRequestDelay(context.account, context.resource), undefined, this._telemetry));
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
		return this._acquireClient(options, credentialProvider, 0);
	}

	private _acquireClient(options: GitHubClientOptions, credentialProvider: IGitHubCredentialProvider, scope: number): IReference<GitHubClient> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const authorization = options.authorization;
		if (!authorization.providerId || !authorization.sessionId || authorization.scopes.some(scope => !scope)) {
			throw new GitHubRequestError('Invalid GitHub authorization context', 'validation');
		}
		const normalized: GitHubClientOptions = {
			apiBaseUri: new URL(options.apiBaseUri).href.replace(/\/$/, ''),
			graphQlUri: new URL(options.graphQlUri).href,
			authorization: Object.freeze({ ...authorization, scopes: Object.freeze([...new Set(authorization.scopes)].sort()) }),
			missionControl: MissionControlClient.normalizeOptions(options.missionControl),
		};
		const key = JSON.stringify([scope, normalized.authorization.providerId, normalized.authorization.sessionId, normalized.authorization.accountId, normalized.authorization.scopes, normalized.authorization.authorizationServer, normalized.apiBaseUri, normalized.graphQlUri, normalized.missionControl]);
		let entry = this._clients.get(key);
		if (!entry) {
			this._ensureClientCapacity();
			const store = new DisposableStore();
			entry = {
				scope,
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

	createRequestProviderScope(credentialProvider: IGitHubCredentialProvider): IGitHubRequestProviderScope {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const scope = ++this._nextRequestProviderScope;
		const lifetime = new DisposableStore();
		this._requestProviderScopes.set(scope, lifetime);
		const controller = new AbortController();
		lifetime.add(toDisposable(() => {
			controller.abort(new CancellationError());
			for (const [key, entry] of this._clients) {
				if (entry.scope === scope) {
					this._clients.delete(key);
					entry.store.dispose();
				}
			}
		}));
		lifetime.add(credentialProvider.onDidChange(change => this._invalidateClients(change, scope)));
		const release = toDisposable(() => this._requestProviderScopes.deleteAndDispose(scope));
		return {
			acquireClient: options => {
				controller.signal.throwIfAborted();
				const lease = new DisposableStore();
				const leaseController = new AbortController();
				lease.add(toDisposable(() => leaseController.abort(new CancellationError())));
				try {
					const client = lease.add(this._acquireClient(options, credentialProvider, scope)).object;
					const missionControl = MissionControlClient.normalizeOptions(options.missionControl);
					const invalidated = lease.add(new Emitter<void>());
					const credentialsChanged = lease.add(new Emitter<void>());
					const invalidate = () => {
						leaseController.abort(new GitHubRequestError('GitHub client grant is no longer available', 'authentication'));
						invalidated.fire();
					};
					lease.add(client.onDidInvalidate(invalidate));
					lease.add(client.credentials.onDidInvalidate(event => {
						if (event.credential && missionControl) {
							client.transport.invalidateAccount(missionControlAccount(missionControl.endpoint, event.credential.account), event.credential.signal.reason);
						}
						if (event.reason === 'account') {
							invalidate();
						} else {
							credentialsChanged.fire();
						}
					}));
					const signal = AbortSignal.any([controller.signal, leaseController.signal]);
					const apiBaseUri = client.endpoint.getApiBaseUri();
					const defaults = deriveGitHubEndpoints(undefined);
					return {
						object: {
							authorization: client.authorization,
							rest: new LocalApiRequestProvider(apiBaseUri, client.transport, client.credentials, 'rest', signal),
							graphql: new LocalApiRequestProvider(client.endpoint.getGraphQlUri(), client.transport, client.credentials, 'graphql', signal),
							missionControl: missionControl && new LocalMissionControlRequestProvider(missionControl.endpoint, client.credentials, client.transport, this._logService, signal),
							onDidInvalidate: invalidated.event,
							onDidChangeCredentials: credentialsChanged.event,
							rawContent: apiBaseUri === defaults.apiBaseUri && defaults.rawBaseUri
								? new LocalApiRequestProvider(defaults.rawBaseUri, client.transport, undefined, 'rawContent', signal)
								: undefined,
						},
						dispose: () => lease.dispose(),
					};
				} catch (error) {
					lease.dispose();
					throw error;
				}
			},
			dispose: () => release.dispose(),
		};
	}

	acquireAnonymousClient(): IGitHubAnonymousClient {
		const reference = this.acquireAnonymousRequestProviders();
		return new AnonymousClient(reference.object.rest, reference.object.rawContent, reference);
	}

	acquireAnonymousRequestProviders(): IReference<ApiRequestProviders> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const { apiBaseUri, rawBaseUri } = deriveGitHubEndpoints(undefined);
		let client = this._anonymousClient.value;
		if (!client) {
			this._ensureClientCapacity();
			client = new AnonymousClientEntry(new GitHubTransport(this._options.fetch, undefined, false, this._logService, {
				coordination: { queue: this._queue, rateLimits: this._rateLimits },
				requestMetadata: this._options.clientMetadata ? new GitHubRequestMetadata(this._options.clientMetadata, {
					onDidChange: Event.None,
					getApiBaseUri: () => apiBaseUri,
					getGraphQlUri: () => apiBaseUri,
				}) : undefined,
			}, this._telemetry));
			this._anonymousClient.value = client;
		}
		const retained = client;
		retained.references++;
		const controller = new AbortController();
		const signal = AbortSignal.any([controller.signal, retained.signal]);
		const release = toDisposable(() => {
			controller.abort(new CancellationError());
			if (--retained.references === 0 && this._anonymousClient.value === retained) {
				this._anonymousClient.clear();
			}
		});
		return {
			object: {
				rest: new LocalApiRequestProvider(apiBaseUri, retained.transport, undefined, 'rest', signal),
				rawContent: rawBaseUri ? new LocalApiRequestProvider(rawBaseUri, retained.transport, undefined, 'rawContent', signal) : undefined,
			},
			dispose: () => release.dispose(),
		};
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
		if (this._clients.size + (this._anonymousClient.value ? 1 : 0) + this._bootstrapClients.size < GitHubService.maximumClients) {
			return;
		}
		const unused = [...this._clients].find(([, entry]) => entry.references === 0);
		if (!unused) {
			throw new GitHubRequestError('GitHub client capacity exceeded', 'overloaded');
		}
		this._clients.delete(unused[0]);
		unused[1].store.dispose();
	}

	private _invalidateClients(change: GitHubCredentialChange, scope = 0): void {
		for (const [key, entry] of [...this._clients]) {
			const authorization = entry.context.authorization;
			if (entry.scope === scope && authorization.providerId === change.providerId && (!change.sessionIds || change.sessionIds.includes(authorization.sessionId))) {
				this._clients.delete(key);
				entry.client.value?.invalidate();
				entry.store.dispose();
			}
		}
	}

	override dispose(): void {
		this._requestProviderScopes.clearAndDisposeAll();
		for (const entry of this._clients.values()) {
			entry.store.dispose();
		}
		this._clients.clear();
		super.dispose();
	}
}

class AnonymousClientEntry extends Disposable {
	references = 0;
	readonly signal: AbortSignal;

	constructor(readonly transport: GitHubTransport) {
		super();
		const controller = new AbortController();
		this.signal = controller.signal;
		this._register(toDisposable(() => controller.abort(new CancellationError())));
		this._register(transport);
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
	readonly query: GitHubQueryApi;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: PullRequestMutationApi;

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
			onDidChangeToken: credentialProvider.onDidChangeToken && Event.signal(Event.filter(credentialProvider.onDidChangeToken, change =>
				change.providerId === this.authorization.providerId && (!change.sessionIds || change.sessionIds.includes(this.authorization.sessionId)))),
		}, this.endpoint, logService, {
			host: new URL(context.apiBaseUri).host,
			accountId: `bootstrap:${JSON.stringify([context.authorization.providerId, context.authorization.sessionId, context.authorization.accountId, context.authorization.authorizationServer, context.apiBaseUri])}`,
		}, backoff));
		const capabilities = this._register(new GitHubHostCapabilitiesService(undefined, undefined, this.transport, this.endpoint, logService));
		const pullRequestQuery = new PullRequestQueryService(this.transport, capabilities, this.endpoint, logService);
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
			capabilities,
			logService,
		));
	}

	invalidate(): void {
		this._onDidInvalidate.fire();
		this.dispose();
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
