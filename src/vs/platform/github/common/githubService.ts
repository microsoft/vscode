/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubCredentialService, IGitHubCredentials } from './githubCredentialService.js';
import { GitHubHostCapabilitiesService, IGitHubCapabilities } from './githubHostCapabilitiesService.js';
import { GitHubQueryService, IGitHubQuery } from './githubQueryServiceImpl.js';
import { GitHubTransport, IGitHubTransport } from './githubTransport.js';
import { GitHubServiceOptions, IGitHubEndpointProvider } from './githubTypes.js';
import { IPullRequestMutations, PullRequestMutationService } from './pullRequestMutationService.js';
import { PullRequestQueryService } from './pullRequestQueryService.js';
import { IPullRequestResources, PullRequestResourceService } from './pullRequestResourceService.js';

export const IGitHubService = createDecorator<IGitHubService>('gitHubService');

export interface IGitHubService {
	readonly _serviceBrand: undefined;
	readonly endpoint: IGitHubEndpointProvider;
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
	readonly endpoint: IGitHubEndpointProvider;
	readonly credentials: IGitHubCredentials;
	readonly capabilities: IGitHubCapabilities;
	readonly query: IGitHubQuery;
	readonly pullRequests: IPullRequestResources;
	readonly mutations: IPullRequestMutations;

	constructor(
		options: GitHubServiceOptions,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._logService.debug('[GitHubService] Initializing reusable GitHub service');
		this.endpoint = options.endpoint;
		this.transport = this._register(new GitHubTransport(options.fetch, undefined, false, this._logService));
		this.credentials = this._register(new GitHubCredentialService(this.transport, options.tokenProvider, options.endpoint, this._logService));
		this.capabilities = this._register(new GitHubHostCapabilitiesService(this.transport, options.endpoint, this._logService));

		const pullRequestQuery = new PullRequestQueryService(this.transport, this.capabilities, options.endpoint, this._logService);
		this.pullRequests = this._register(new PullRequestResourceService(
			undefined,
			undefined,
			this.credentials,
			pullRequestQuery,
			this._logService,
		));
		this.mutations = this._register(new PullRequestMutationService(
			undefined,
			this.credentials,
			this.transport,
			this.pullRequests,
			options.endpoint,
			this._logService,
		));
		this.query = this._register(new GitHubQueryService(
			undefined,
			undefined,
			this.credentials,
			this.transport,
			options.endpoint,
			this.capabilities,
			this._logService,
		));
		this._logService.debug('[GitHubService] Reusable GitHub service initialized');
	}

	override dispose(): void {
		this._logService.debug('[GitHubService] Disposing reusable GitHub service');
		super.dispose();
	}
}
