/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { GitHubHostCapabilities } from '../../common/githubService.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { GitHubCredential } from './githubCredentialService.js';
import { IGitHubTransport } from './githubTransport.js';

const unavailableCapabilities: GitHubHostCapabilities = {
	graphql: false,
	mergeQueue: false,
	internalMergeStatus: false,
	reviewThreads: false,
	checkContextRequiredness: false,
};

const capabilitiesQuery = `query AgentHostGitHubCapabilities {
	pullRequest: __type(name: "PullRequest") { fields { name } }
	statusCheckRollupContext: __type(name: "StatusCheckRollupContext") { fields { name } }
	rateLimit { limit remaining used resetAt }
}`;

interface ITypeFields {
	readonly fields?: readonly { readonly name?: string }[];
}

interface ICapabilitiesProbe {
	readonly pullRequest?: ITypeFields;
	readonly statusCheckRollupContext?: ITypeFields;
}

export class GitHubHostCapabilitiesService extends Disposable {

	private readonly _cache = new Map<string, Promise<GitHubHostCapabilities>>();

	constructor(
		@IGitHubTransport private readonly _transport: IGitHubTransport,
		@IAgentHostGitHubEndpointService private readonly _endpointService: IAgentHostGitHubEndpointService,
	) {
		super();
		this._register(this._endpointService.onDidChange(() => this.clear()));
	}

	getCapabilities(credential: GitHubCredential, enterpriseVersion: string | undefined, signal: AbortSignal): Promise<GitHubHostCapabilities> {
		const key = `${credential.account.host.toLowerCase()}\x00${enterpriseVersion ?? ''}`;
		let cached = this._cache.get(key);
		if (!cached) {
			cached = this._probe(credential, signal).catch(error => {
				this._cache.delete(key);
				throw error;
			});
			this._cache.set(key, cached);
		}
		return cached;
	}

	clear(): void {
		this._cache.clear();
	}

	override dispose(): void {
		this.clear();
		super.dispose();
	}

	private async _probe(credential: GitHubCredential, signal: AbortSignal): Promise<GitHubHostCapabilities> {
		const response = await this._transport.graphql<ICapabilitiesProbe>(
			credential.account,
			credential.token,
			this._endpointService.getGraphQlUri(),
			capabilitiesQuery,
			{},
			AbortSignal.any([signal, credential.signal]),
			'enrichment',
		);
		if (response.errors.length > 0 || !response.data?.pullRequest) {
			return unavailableCapabilities;
		}
		const pullRequestFields = fieldNames(response.data.pullRequest);
		const statusFields = fieldNames(response.data.statusCheckRollupContext);
		return {
			graphql: true,
			mergeQueue: pullRequestFields.has('mergeQueueEntry'),
			internalMergeStatus: false,
			reviewThreads: pullRequestFields.has('reviewThreads'),
			checkContextRequiredness: statusFields.has('isRequired'),
		};
	}
}

function fieldNames(type: ITypeFields | undefined): ReadonlySet<string> {
	const result = new Set<string>();
	for (const field of type?.fields ?? []) {
		if (typeof field.name === 'string') {
			result.add(field.name);
		}
	}
	return result;
}
