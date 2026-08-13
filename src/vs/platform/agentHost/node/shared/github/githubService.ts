/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostAuthenticationService } from '../../agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from '../../agentHostGitHubEndpointService.js';
import { GitHubCredentialService, IGitHubCredentials } from './githubCredentialService.js';
import { GitHubHostCapabilitiesService, IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { GitHubQueryService, IGitHubQuery } from './githubQueryService.js';
import { FetchFunction, GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { IPullRequestMutations, PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

export interface IGitHubService {
	readonly _serviceBrand: undefined;
	readonly endpoint: IAgentHostGitHubEndpointService;
	readonly credentials: IGitHubCredentials;
	readonly transport: IGitHubTransport;
	readonly capabilities: IGitHubCapabilities;
	readonly query: IGitHubQuery;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: IPullRequestMutations;
}

export class GitHubService extends Disposable implements IGitHubService {

	declare readonly _serviceBrand: undefined;

	readonly transport: IGitHubTransport;
	readonly endpoint: IAgentHostGitHubEndpointService;
	readonly credentials: IGitHubCredentials;
	readonly capabilities: IGitHubCapabilities;
	readonly query: IGitHubQuery;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: IPullRequestMutations;

	constructor(
		fetchFn: FetchFunction | undefined,
		@IAgentHostAuthenticationService authenticationService: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService endpointService: IAgentHostGitHubEndpointService,
		@ILogService logService: ILogService,
	) {
		super();

		this.endpoint = endpointService;
		this.transport = this._register(new GitHubTransport(fetchFn));
		this.credentials = this._register(new GitHubCredentialService(this.transport, authenticationService, endpointService));
		this.capabilities = this._register(new GitHubHostCapabilitiesService(this.transport, endpointService));

		const pullRequestQuery = new PullRequestQueryService(this.transport, this.capabilities, endpointService);
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
			endpointService,
		));
		this.query = this._register(new GitHubQueryService(
			undefined,
			undefined,
			this.credentials,
			this.transport,
			endpointService,
			this.capabilities,
			logService,
		));
	}
}
