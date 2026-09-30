/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore, IReference, MutableDisposable } from '../../../base/common/lifecycle.js';
import { GitHubService, IGitHubClient, IGitHubService } from '../../github/common/githubService.js';
import { GitHubServiceOptions } from '../../github/common/githubTypes.js';
import { refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';

export const IAgentHostGitHubService = refineServiceDecorator<IGitHubService, IAgentHostGitHubService>(IGitHubService);

export interface IAgentHostGitHubService extends IGitHubService {
	readonly onDidChangeRepositoryClient: Event<void>;
	acquireRepositoryClient(signal: AbortSignal): IReference<IGitHubClient>;
}

export class AgentHostGitHubService extends GitHubService implements IAgentHostGitHubService {

	private readonly _repositoryClient = this._register(new MutableDisposable<DisposableStore>());
	private readonly _onDidChangeRepositoryClient = this._register(new Emitter<void>());
	readonly onDidChangeRepositoryClient = this._onDidChangeRepositoryClient.event;

	constructor(
		options: Omit<GitHubServiceOptions, 'credentialProvider'>,
		@IAgentHostAuthenticationService authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpointService: IAgentHostGitHubEndpointService,
		@ILogService logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		let hasRepositoryToken = false;
		super({
			...options,
			credentialProvider: {
				onDidChange: Event.any(
					Event.map(Event.filter(authenticationService.onDidChangeAuthToken, event => event.token === undefined), event => ({ providerId: 'agent-host', sessionIds: [event.resource] })),
					Event.map(_endpointService.onDidChange, () => ({ providerId: 'agent-host' })),
				),
				getToken: (context, signal) => {
					signal.throwIfAborted();
					const token = authenticationService.getAuthToken({ resource: context.sessionId, scopes: context.scopes });
					if (context.sessionId === _endpointService.getRepoResource().resource) {
						hasRepositoryToken = !!token;
					}
					return token;
				},
			},
		}, logService, telemetryService);
		this._register(_endpointService.onDidChange(() => {
			hasRepositoryToken = false;
			this._resetRepositoryClient();
		}));
		this._register(authenticationService.onDidChangeAuthToken(event => {
			if (event.resource === _endpointService.getRepoResource().resource) {
				const selectionChanged = !hasRepositoryToken || event.token === undefined;
				hasRepositoryToken = !!event.token;
				if (selectionChanged) {
					this._resetRepositoryClient();
				}
			}
		}));
	}

	acquireRepositoryClient(signal: AbortSignal): IReference<IGitHubClient> {
		signal.throwIfAborted();
		const resource = this._endpointService.getRepoResource();
		const options = {
			authorization: { providerId: 'agent-host', sessionId: resource.resource, scopes: resource.scopes_supported ?? [] },
			apiBaseUri: this._endpointService.getApiBaseUri(),
			graphQlUri: this._endpointService.getGraphQlUri(),
		};
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

	private _resetRepositoryClient(): void {
		this._repositoryClient.clear();
		this._onDidChangeRepositoryClient.fire();
	}
}
