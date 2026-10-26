/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IGitHubAccountClient } from '../../github/common/account/account.js';
import { AccountClient } from '../../github/common/account/accountClient.js';
import { GitHubService, IGitHubClient, IGitHubRequestProviderScope, IGitHubService } from '../../github/common/githubService.js';
import { GitHubClientOptions, GitHubRequestError, GitHubServiceOptions, IGitHubCredentialProvider } from '../../github/common/githubTypes.js';
import { authenticationAccountId } from '../common/meta/agentAuthenticationAccount.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostAuthTokenRequest } from '../common/agent.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { captureCredentialSource, isScopedCredentialUsable, type IAgentHostCredentialSource } from '../common/agentHostCredentials.js';
import { AhpErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

export const IAgentHostGitHubService = refineServiceDecorator<IGitHubService, IAgentHostGitHubService>(IGitHubService);

export interface IAgentHostGitHubService extends IGitHubService {
	getAgentMergeCredentialSource(chat: string): IAgentHostCredentialSource | undefined;
	getAgentMergeCredentialBinding(chat: string): IAgentHostCredentialSource | undefined;
	bindAgentMergeCredentialSource(session: string, chat: string, source: IAgentHostCredentialSource | undefined): void;
	readonly onDidChangeRepositoryClient: Event<void>;
	captureSessionCredentialSource(session: string, source?: IAgentHostCredentialSource, owningSession?: string, includeCopilot?: boolean, usage?: 'execution' | 'agentMerge'): IAgentHostCredentialSource | undefined;
	acquireRepositoryClient(signal: AbortSignal, source?: IAgentHostCredentialSource, session?: string): IReference<IGitHubClient>;
	acquireRepositoryApiClient(signal: AbortSignal, source?: IAgentHostCredentialSource, session?: string): IGitHubAccountClient;
}

interface IsolatedRepositoryService extends IDisposable {
	readonly service: GitHubService;
	readonly apiScope: IGitHubRequestProviderScope;
}

export class AgentHostGitHubService extends GitHubService implements IAgentHostGitHubService {

	private readonly _repositoryClient = this._register(new MutableDisposable<DisposableStore>());
	private readonly _repositoryApiClient = this._register(new MutableDisposable<DisposableStore>());
	private readonly _apiScope: IGitHubRequestProviderScope;
	private readonly _isolatedServices = this._register(new DisposableMap<string, IsolatedRepositoryService>());
	private readonly _isolatedReferences = new Map<string, number>();
	private readonly _credentialSourceIds = new WeakMap<IAgentHostCredentialSource, number>();
	private _nextCredentialSourceId = 0;
	private readonly _synchronizeRepositoryAccount: () => string | undefined;
	private readonly _onDidChangeRepositoryClient = this._register(new Emitter<void>());
	readonly onDidChangeRepositoryClient = this._onDidChangeRepositoryClient.event;

	constructor(
		private readonly _repositoryOptions: Omit<GitHubServiceOptions, 'credentialProvider'>,
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _repositoryLogService: ILogService,
		@ITelemetryService private readonly _repositoryTelemetryService: ITelemetryService,
	) {
		let hasRepositoryToken = false;
		const selectedAccount = () => {
			const resource = _endpointService.getRepoResource();
			return authenticationAccountId(_authenticationService.getAuthAccount({ resource: resource.resource, scopes: resource.scopes_supported }));
		};
		let repositoryAccountId = selectedAccount();
		const onDidChangeRepositoryAccount = new Emitter<void>();
		const synchronizeRepositoryAccount = () => {
			const accountId = selectedAccount();
			if (accountId !== repositoryAccountId) {
				repositoryAccountId = accountId;
				onDidChangeRepositoryAccount.fire();
			}
			return repositoryAccountId;
		};
		const onDidAuthenticate: Event<IAgentHostAuthTokenRequest> = _authenticationService.onDidAuthenticate ?? _authenticationService.onDidChangeAuthToken;
		const credentialProvider: IGitHubCredentialProvider = {
			onDidChangeToken: Event.map(onDidAuthenticate,
				event => ({ providerId: 'agent-host', sessionIds: [event.resource] })),
			onDidChange: Event.any(
				Event.map(Event.filter(_authenticationService.onDidChangeAuthToken, event => event.token === undefined), event => ({ providerId: 'agent-host', sessionIds: [event.resource] })),
				Event.map(_endpointService.onDidChange, () => ({ providerId: 'agent-host' })),
				Event.map(onDidChangeRepositoryAccount.event, () => ({ providerId: 'agent-host', sessionIds: [_endpointService.getRepoResource().resource] })),
			),
			getToken: (context, signal) => {
				signal.throwIfAborted();
				const request = { resource: context.sessionId, scopes: context.scopes };
				const accountId = context.sessionId === _endpointService.getRepoResource().resource
					? synchronizeRepositoryAccount()
					: authenticationAccountId(_authenticationService.getAuthAccount(request));
				if (accountId !== context.accountId) {
					return undefined;
				}
				const token = _authenticationService.getAuthToken(request);
				if (context.sessionId === _endpointService.getRepoResource().resource) {
					hasRepositoryToken ||= !!token;
				}
				return token;
			},
		};
		super({ ..._repositoryOptions, credentialProvider }, _repositoryLogService, _repositoryTelemetryService);
		this._apiScope = this._register(this.createRequestProviderScope(credentialProvider));
		this._synchronizeRepositoryAccount = synchronizeRepositoryAccount;
		this._register(onDidChangeRepositoryAccount);
		this._register(onDidChangeRepositoryAccount.event(() => this._resetRepositoryClient()));
		this._register(_endpointService.onDidChange(() => {
			hasRepositoryToken = false;
			repositoryAccountId = selectedAccount();
			this._resetRepositoryClient();
		}));
		this._register(_authenticationService.onDidChangeAuthToken(event => {
			if (event.resource === _endpointService.getRepoResource().resource) {
				const previousAccountId = repositoryAccountId;
				const selectionChanged = !hasRepositoryToken || event.token === undefined;
				hasRepositoryToken = !!event.token;
				synchronizeRepositoryAccount();
				if (previousAccountId === repositoryAccountId && selectionChanged) {
					this._resetRepositoryClient();
				}
			}
		}));
	}

	captureSessionCredentialSource(session: string, source?: IAgentHostCredentialSource, owningSession = session, includeCopilot = false, usage: 'execution' | 'agentMerge' = 'execution'): IAgentHostCredentialSource | undefined {
		const captured = source ?? (usage === 'agentMerge' ? this.getAgentMergeCredentialSource(session) : this._authenticationService.getSessionCredentialSource(session));
		if (captured) {
			return captureCredentialSource({
				principal: captured.principal,
				getCredential: request => captured.getCredential({ ...request, session }),
			}, [
				this._endpointService.getRepoResource(),
				...(includeCopilot ? [{ ...this._endpointService.getCopilotResource(), required: false }] : []),
			]);
		}
		const principal = this._authenticationService.getSessionCredentialPrincipal(owningSession);
		if (principal) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'An isolated session requires an authenticated sponsor');
		}
		return undefined;
	}

	/** An explicit operation sponsor takes precedence; otherwise monitoring follows the chat's execution sponsor. */
	getAgentMergeCredentialSource(chat: string): IAgentHostCredentialSource | undefined {
		return this.getAgentMergeCredentialBinding(chat) ?? this._authenticationService.getSessionCredentialSource(chat);
	}

	getAgentMergeCredentialBinding(chat: string): IAgentHostCredentialSource | undefined {
		return this._authenticationService.getSessionCredentialSource(chat, 'agentMerge');
	}

	bindAgentMergeCredentialSource(session: string, chat: string, source: IAgentHostCredentialSource | undefined): void {
		this._authenticationService.bindSessionCredentials(session, source, chat, 'agentMerge');
	}

	acquireRepositoryClient(signal: AbortSignal, source?: IAgentHostCredentialSource, session?: string): IReference<IGitHubClient> {
		signal.throwIfAborted();
		source ??= session ? this._authenticationService.getSessionCredentialSource(session) ?? this.captureSessionCredentialSource(session) : undefined;
		if (source) {
			return this._acquireIsolatedRepositoryClient(source, session, (entry, options) => entry.service.acquireClient(options));
		}
		const options = this._repositoryClientOptions(signal);
		if (!this._repositoryClient.value) {
			const store = new DisposableStore();
			this._repositoryClient.value = store;
			try {
				const client = store.add(this.acquireClient(options)).object;
				store.add(client.credentials.onDidInvalidate(event => {
					if (event.reason === 'account') {
						this._resetRepositoryClient();
					}
				}));
			} catch (error) {
				this._repositoryClient.clear();
				throw error;
			}
		}
		return this.acquireClient(options);
	}

	acquireRepositoryApiClient(signal: AbortSignal, source?: IAgentHostCredentialSource, session?: string): IGitHubAccountClient {
		signal.throwIfAborted();
		source ??= session ? this._authenticationService.getSessionCredentialSource(session) ?? this.captureSessionCredentialSource(session) : undefined;
		if (source) {
			const reference = this._acquireIsolatedRepositoryClient(source, session, (entry, options) => entry.apiScope.acquireClient(options));
			return new AccountClient(reference.object.authorization, reference.object, reference);
		}
		const options = this._repositoryClientOptions(signal);
		if (!this._repositoryApiClient.value) {
			const store = new DisposableStore();
			this._repositoryApiClient.value = store;
			try {
				const client = store.add(this._acquireApiClient(options));
				store.add(Event.once(client.onDidInvalidate)(() => {
					const resource = this._endpointService.getRepoResource();
					// External selection changes have their own reset; identity discovery does not.
					if (resource.resource === client.authorization.sessionId
						&& this._authenticationService.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported })
						&& this._synchronizeRepositoryAccount() === client.authorization.accountId) {
						this._resetRepositoryClient();
					} else {
						this._repositoryApiClient.clear();
					}
				}));
			} catch (error) {
				this._repositoryApiClient.clear();
				throw error;
			}
		}
		return this._acquireApiClient(options);
	}

	private _acquireApiClient(options: GitHubClientOptions): IGitHubAccountClient {
		const reference = this._apiScope.acquireClient(options);
		return new AccountClient(reference.object.authorization, reference.object, reference);
	}

	private _repositoryClientOptions(signal: AbortSignal): GitHubClientOptions {
		signal.throwIfAborted();
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const resource = this._endpointService.getRepoResource();
		const accountId = this._synchronizeRepositoryAccount();
		signal.throwIfAborted();
		return {
			authorization: { providerId: 'agent-host', sessionId: resource.resource, scopes: resource.scopes_supported ?? [], ...(accountId !== undefined ? { accountId } : {}) },
			apiBaseUri: this._endpointService.getApiBaseUri(),
			graphQlUri: this._endpointService.getGraphQlUri(),
		};
	}

	private _acquireIsolatedRepositoryClient<T>(source: IAgentHostCredentialSource, session: string | undefined, acquire: (entry: IsolatedRepositoryService, options: GitHubClientOptions) => IReference<T>): IReference<T> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub service was disposed', 'unknown');
		}
		const resource = this._endpointService.getRepoResource();
		const captured = captureCredentialSource({
			principal: source.principal,
			getCredential: request => source.getCredential({ ...request, session }),
		}, [resource]);
		const credential = captured.getCredential({ resource: resource.resource, scopes: resource.scopes_supported, session });
		const sourceId = this._credentialSourceIds.get(source) ?? ++this._nextCredentialSourceId;
		this._credentialSourceIds.set(source, sourceId);
		const key = JSON.stringify([sourceId, session, credential?.revision, credential?.expiresAt]);
		let entry = this._isolatedServices.get(key);
		if (!entry) {
			const credentialProvider: IGitHubCredentialProvider = {
				onDidChange: Event.map(this._endpointService.onDidChange, () => ({ providerId: 'agent-host-isolated' })),
				getToken: (context, signal) => {
					signal.throwIfAborted();
					if (source.principal && source.principal.apiOrigin !== new URL(this._endpointService.getApiBaseUri()).origin) {
						return undefined;
					}
					const credential = captured.getCredential({ resource: context.sessionId, scopes: context.scopes, session });
					return credential && isScopedCredentialUsable(credential)
						? credential.token
						: undefined;
				},
			};
			const store = new DisposableStore();
			const service = store.add(new GitHubService({
				...this._repositoryOptions,
				credentialProvider,
			}, this._repositoryLogService, this._repositoryTelemetryService));
			entry = { service, apiScope: store.add(service.createRequestProviderScope(credentialProvider)), dispose: () => store.dispose() };
			this._isolatedServices.set(key, entry);
		}
		const reference = acquire(entry, {
			authorization: {
				providerId: 'agent-host-isolated',
				sessionId: resource.resource,
				scopes: resource.scopes_supported ?? [],
				...(source.principal ? { accountId: source.principal.userId } : {}),
			},
			apiBaseUri: this._endpointService.getApiBaseUri(),
			graphQlUri: this._endpointService.getGraphQlUri(),
		});
		this._isolatedReferences.set(key, (this._isolatedReferences.get(key) ?? 0) + 1);
		const disposable = toDisposable(() => {
			reference.dispose();
			const remaining = (this._isolatedReferences.get(key) ?? 1) - 1;
			if (remaining) {
				this._isolatedReferences.set(key, remaining);
			} else {
				this._isolatedReferences.delete(key);
				this._isolatedServices.deleteAndDispose(key);
			}
		});
		return { object: reference.object, dispose: () => disposable.dispose() };
	}

	private _resetRepositoryClient(): void {
		this._repositoryClient.clear();
		this._repositoryApiClient.clear();
		this._onDidChangeRepositoryClient.fire();
	}
}
