/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IReference, MutableDisposable } from '../../../base/common/lifecycle.js';
import { IGitHubAccountClient } from '../../github/common/account/account.js';
import { AccountClient } from '../../github/common/account/accountClient.js';
import { GitHubService, IGitHubClient, IGitHubRequestProviderScope, IGitHubService } from '../../github/common/githubService.js';
import { GitHubClientOptions, GitHubRequestError, GitHubServiceOptions, IGitHubCredentialProvider } from '../../github/common/githubTypes.js';
import { authenticationAccountId } from '../common/meta/agentAuthenticationAccount.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';

export const IAgentHostGitHubService = refineServiceDecorator<IGitHubService, IAgentHostGitHubService>(IGitHubService);

export interface IAgentHostGitHubService extends IGitHubService {
	readonly onDidChangeRepositoryClient: Event<void>;
	acquireRepositoryClient(signal: AbortSignal): IReference<IGitHubClient>;
	acquireRepositoryApiClient(signal: AbortSignal): IGitHubAccountClient;
}

export class AgentHostGitHubService extends GitHubService implements IAgentHostGitHubService {

	private readonly _repositoryClient = this._register(new MutableDisposable<DisposableStore>());
	private readonly _repositoryApiClient = this._register(new MutableDisposable<DisposableStore>());
	private readonly _apiScope: IGitHubRequestProviderScope;
	private readonly _synchronizeRepositoryAccount: () => string | undefined;
	private readonly _onDidChangeRepositoryClient = this._register(new Emitter<void>());
	readonly onDidChangeRepositoryClient = this._onDidChangeRepositoryClient.event;

	constructor(
		options: Omit<GitHubServiceOptions, 'credentialProvider'>,
		@IAgentHostAuthenticationService _authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpointService: IAgentHostGitHubEndpointService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
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
		const credentialProvider: IGitHubCredentialProvider = {
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
		super({ ...options, credentialProvider }, logService, telemetryService);
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

	acquireRepositoryClient(signal: AbortSignal): IReference<IGitHubClient> {
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

	acquireRepositoryApiClient(signal: AbortSignal): IGitHubAccountClient {
		const options = this._repositoryClientOptions(signal);
		if (!this._repositoryApiClient.value) {
			const store = new DisposableStore();
			this._repositoryApiClient.value = store;
			try {
				const client = store.add(this._acquireApiClient(options));
				store.add(Event.once(client.onDidInvalidate)(() => this._repositoryApiClient.clear()));
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

	private _resetRepositoryClient(): void {
		this._repositoryClient.clear();
		this._repositoryApiClient.clear();
		this._onDidChangeRepositoryClient.fire();
	}
}
