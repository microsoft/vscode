/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { GitHubHostCapabilities, IGitHubEndpointProvider } from './githubTypes.js';
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

interface ICachedCapabilities {
	readonly controller: AbortController;
	readonly promise: Promise<GitHubHostCapabilities>;
	waiters: number;
	settled: boolean;
}

export interface IGitHubCapabilities {
	getCapabilities(credential: GitHubCredential, enterpriseVersion: string | undefined, signal: AbortSignal): Promise<GitHubHostCapabilities>;
	clear(): void;
}

export class GitHubHostCapabilitiesService extends Disposable implements IGitHubCapabilities {

	private readonly _cache = new Map<string, ICachedCapabilities>();

	constructor(
		private readonly _transport: IGitHubTransport,
		private readonly _endpointService: IGitHubEndpointProvider,
		private readonly _logService?: ILogService,
	) {
		super();
		this._register(this._endpointService.onDidChange(() => this.clear()));
	}

	getCapabilities(credential: GitHubCredential, enterpriseVersion: string | undefined, signal: AbortSignal): Promise<GitHubHostCapabilities> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		const key = `${credential.account.host.toLowerCase()}\x00${enterpriseVersion ?? ''}`;
		let cached = this._cache.get(key);
		if (!cached) {
			this._logService?.debug(`[GitHubHostCapabilitiesService] Probing capabilities for ${credential.account.host}${enterpriseVersion ? ` (${enterpriseVersion})` : ''}`);
			const controller = new AbortController();
			const entry: ICachedCapabilities = {
				controller,
				promise: this._probe(credential, controller.signal)
					.then(result => {
						if (!result.cache && this._cache.get(key) === entry) {
							this._cache.delete(key);
						}
						this._logService?.debug(`[GitHubHostCapabilitiesService] Capabilities for ${credential.account.host}: ${formatCapabilities(result.capabilities)} (cached: ${result.cache})`);
						return result.capabilities;
					})
					.catch(error => {
						if (this._cache.get(key) === entry) {
							this._cache.delete(key);
						}
						this._logService?.debug(`[GitHubHostCapabilitiesService] Capability probe failed for ${credential.account.host} (${capabilityErrorKind(error)})`);
						throw error;
					})
					.finally(() => entry.settled = true),
				waiters: 0,
				settled: false,
			};
			cached = entry;
			this._cache.set(key, cached);
		} else {
			this._logService?.trace(`[GitHubHostCapabilitiesService] Reusing capability probe for ${credential.account.host}${enterpriseVersion ? ` (${enterpriseVersion})` : ''}`);
		}
		cached.waiters++;
		return waitForCapabilities(cached.promise, signal).finally(() => {
			cached.waiters--;
			if (cached.waiters === 0 && !cached.settled && this._cache.get(key) === cached) {
				this._cache.delete(key);
				cached.controller.abort(new Error('All GitHub capability waiters cancelled'));
			}
		});
	}

	clear(): void {
		if (this._cache.size > 0) {
			this._logService?.debug(`[GitHubHostCapabilitiesService] Clearing ${this._cache.size} cached capability probe(s)`);
		}
		for (const entry of this._cache.values()) {
			entry.controller.abort(new Error('GitHub capability cache was cleared'));
		}
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

function formatCapabilities(capabilities: GitHubHostCapabilities): string {
	return [
		`graphql=${capabilities.graphql}`,
		`mergeQueue=${capabilities.mergeQueue}`,
		`reviewThreads=${capabilities.reviewThreads}`,
		`checkContextRequiredness=${capabilities.checkContextRequiredness}`,
	].join(', ');
}

function capabilityErrorKind(error: unknown): string {
	return error instanceof Error ? error.name : typeof error;
}

function waitForCapabilities(promise: Promise<GitHubHostCapabilities>, signal: AbortSignal): Promise<GitHubHostCapabilities> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		void promise.then(
			value => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			error => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			},
		);
	});
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
