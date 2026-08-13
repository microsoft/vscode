/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { GitHubHostCapabilities } from '../../../common/github/githubService.js';
import { IAgentHostGitHubEndpointService } from '../../agentHostGitHubEndpointService.js';
import { GitHubCredential } from './githubCredentialService.js';
import { GitHubGraphQLError, IGitHubTransport } from './githubTransport.js';

const unavailableCapabilities: GitHubHostCapabilities = {
	graphql: false,
	mergeQueue: false,
	internalMergeStatus: false,
	reviewThreads: false,
	checkContextRequiredness: false,
};

const capabilitiesQuery = `query AgentHostGitHubCapabilities {
	pullRequest: __type(name: "PullRequest") { fields { name } }
	repository: __type(name: "Repository") { fields { name } }
	requirableByPullRequest: __type(name: "RequirableByPullRequest") { fields { name } }
	rateLimit { limit remaining used resetAt }
}`;

interface ITypeFields {
	readonly fields?: readonly { readonly name?: string }[];
}

interface ICapabilitiesProbe {
	readonly pullRequest?: ITypeFields;
	readonly repository?: ITypeFields;
	readonly requirableByPullRequest?: ITypeFields;
}

interface ICapabilitiesProbeResult {
	readonly capabilities: GitHubHostCapabilities;
	readonly cache: boolean;
}

export interface IGitHubCapabilities {
	getCapabilities(credential: GitHubCredential, enterpriseVersion: string | undefined, signal: AbortSignal): Promise<GitHubHostCapabilities>;
	clear(): void;
}

export class GitHubHostCapabilitiesService extends Disposable implements IGitHubCapabilities {

	private readonly _cache = new Map<string, Promise<GitHubHostCapabilities>>();

	constructor(
		private readonly _transport: IGitHubTransport,
		private readonly _endpointService: IAgentHostGitHubEndpointService,
	) {
		super();
		this._register(this._endpointService.onDidChange(() => this.clear()));
	}

	getCapabilities(credential: GitHubCredential, enterpriseVersion: string | undefined, signal: AbortSignal): Promise<GitHubHostCapabilities> {
		const key = `${credential.account.host.toLowerCase()}\x00${enterpriseVersion ?? ''}`;
		let cached = this._cache.get(key);
		if (!cached) {
			const probe = this._probe(credential, signal);
			cached = probe.then(result => result.capabilities);
			this._cache.set(key, cached);
			void probe.then(
				result => {
					if (!result.cache && this._cache.get(key) === cached) {
						this._cache.delete(key);
					}
				},
				() => {
					if (this._cache.get(key) === cached) {
						this._cache.delete(key);
					}
				},
			);
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

	private async _probe(credential: GitHubCredential, signal: AbortSignal): Promise<ICapabilitiesProbeResult> {
		const response = await this._transport.graphql<ICapabilitiesProbe>(
			credential.account,
			credential.token,
			this._endpointService.getGraphQlUri(),
			capabilitiesQuery,
			{},
			AbortSignal.any([signal, credential.signal]),
			'enrichment',
		);
		if (response.errors.length > 0) {
			return {
				capabilities: unavailableCapabilities,
				cache: response.errors.every(isSchemaValidationError),
			};
		}
		if (!response.data?.pullRequest) {
			return { capabilities: unavailableCapabilities, cache: false };
		}
		const pullRequestFields = fieldNames(response.data.pullRequest);
		const repositoryFields = fieldNames(response.data.repository);
		const requirableFields = fieldNames(response.data.requirableByPullRequest);
		return {
			capabilities: {
				graphql: true,
				mergeQueue: pullRequestFields.has('mergeQueueEntry') && repositoryFields.has('mergeQueue'),
				internalMergeStatus: false,
				reviewThreads: pullRequestFields.has('reviewThreads'),
				checkContextRequiredness: requirableFields.has('isRequired'),
			},
			cache: true,
		};
	}
}

function isSchemaValidationError(error: GitHubGraphQLError): boolean {
	const type = error.type?.toUpperCase();
	const code = error.extensions?.code?.toUpperCase();
	return type === 'VALIDATION'
		|| type === 'GRAPHQL_VALIDATION_ERROR'
		|| type === 'GRAPHQL_VALIDATION_FAILED'
		|| code === 'UNDEFINEDFIELD'
		|| code === 'ARGUMENTNOTACCEPTED'
		|| code === 'VARIABLEMISMATCH';
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
