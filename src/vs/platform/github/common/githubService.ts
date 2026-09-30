/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
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
import { GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubCredentialChange, GitHubRequestError, GitHubServiceOptions, IGitHubEndpointProvider } from './githubTypes.js';
import { IPullRequestMutations, PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

export interface IGitHubService {
	readonly _serviceBrand: undefined;
	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient>;
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
		this._register(_options.credentialProvider.onDidChange(change => this._invalidateClients(change)));
		this._logService.debug('[GitHubService] Reusable GitHub service initialized');
	}

	acquireClient(options: GitHubClientOptions): IReference<IGitHubClient> {
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
		};
		const key = JSON.stringify([normalized.authorization.providerId, normalized.authorization.sessionId, normalized.authorization.accountId, normalized.authorization.scopes, normalized.authorization.authorizationServer, normalized.apiBaseUri, normalized.graphQlUri]);
		let entry = this._clients.get(key);
		if (!entry) {
			if (this._clients.size >= GitHubService.maximumClients) {
				const unused = [...this._clients].find(([, entry]) => entry.references === 0);
				if (!unused) {
					throw new GitHubRequestError('GitHub authorization client capacity exceeded', 'overloaded');
				}
				this._clients.delete(unused[0]);
				unused[1].store.dispose();
			}
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
		retained.client.value ??= new GitHubClient(normalized, this._options, this._queue, this._rateLimits, this._telemetry, retained.backoff, this._logService);
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
			getToken: signal => options.credentialProvider.getToken(this.authorization, signal),
			invalidateToken: token => options.credentialProvider.invalidateToken?.(this.authorization, token),
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
