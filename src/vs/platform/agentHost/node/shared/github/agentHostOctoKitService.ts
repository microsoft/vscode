/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { IAgentHostGitHubEndpointService } from '../../agentHostGitHubEndpointService.js';
import { IGitHubCredentials } from './githubCredentialService.js';
import { GitHubRequestError } from './githubTransport.js';
import { IGitHubTransport } from './githubTransport.js';

export type { FetchFunction } from './githubTransport.js';

export interface CreatedPullRequest {
	readonly url: string;
	readonly number: number;
	readonly nodeId?: string;
	readonly createdAt?: number;
}

export type AutoMergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

interface GitHubPullRequestResponseItem {
	readonly number?: unknown;
	readonly html_url?: unknown;
	readonly node_id?: unknown;
	readonly created_at?: unknown;
	readonly state?: unknown;
	readonly head?: { readonly sha?: unknown };
}

interface GitHubIssueOrPullRequestResponseItem {
	readonly title?: unknown;
	readonly body?: unknown;
}

export interface GitHubIssueOrPullRequest {
	readonly title: string;
	readonly body: string;
}

export interface IGitHubApiResponse<T> {
	readonly data: T | undefined;
	readonly statusCode: number;
	readonly etag?: string;
}

export interface IAgentHostOctoKitService {
	readonly _serviceBrand: undefined;
	createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string, draft: boolean, token: string, signal: AbortSignal): Promise<CreatedPullRequest>;
	findPullRequestByHeadBranch(owner: string, repo: string, branch: string, token: string, signal: AbortSignal, headOwner?: string): Promise<CreatedPullRequest | undefined>;
	findPullRequestByHeadSha(owner: string, repo: string, sha: string, token: string, signal: AbortSignal): Promise<CreatedPullRequest | undefined>;
	getIssueOrPullRequest(owner: string, repo: string, number: number, token: string, signal: AbortSignal): Promise<GitHubIssueOrPullRequest>;
	enablePullRequestAutoMerge(pullRequestId: string, mergeMethod: AutoMergeMethod, token: string, signal: AbortSignal): Promise<void>;
}

export const IAgentHostOctoKitService = createDecorator<IAgentHostOctoKitService>('agentHostOctoKitService');

const maximumCommitPullRequests = 100;
const commitPullRequestsRoute = /^repos\/[^/]+\/[^/]+\/commits\/[^/]+\/pulls\?per_page=\d+$/;

const enableAutoMergeMutation = `mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
	enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
		pullRequest { id }
	}
	rateLimit { limit remaining used resetAt }
}`;

export class AgentHostOctoKitService implements IAgentHostOctoKitService {

	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _logService: ILogService,
		private readonly _endpoint: IAgentHostGitHubEndpointService,
		private readonly _credentials: IGitHubCredentials,
		private readonly _transport: IGitHubTransport,
	) { }

	async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string, draft: boolean, token: string, signal: AbortSignal): Promise<CreatedPullRequest> {
		const response = await this._rest<GitHubPullRequestResponseItem>(
			`repos/${owner}/${repo}/pulls`,
			'POST',
			token,
			signal,
			{ title, body, head, base, draft },
		);
		const created = toCreatedPullRequest(response);
		if (!created) {
			throw new Error(`Failed to create pull request for ${owner}/${repo}`);
		}
		return { url: created.url, number: created.number, nodeId: created.nodeId };
	}

	async findPullRequestByHeadBranch(owner: string, repo: string, branch: string, token: string, signal: AbortSignal, headOwner = owner): Promise<CreatedPullRequest | undefined> {
		const route = `repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${headOwner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`;
		const items = await this._searchPullRequests(route, token, signal);
		return toCreatedPullRequest(items[0]);
	}

	async findPullRequestByHeadSha(owner: string, repo: string, sha: string, token: string, signal: AbortSignal): Promise<CreatedPullRequest | undefined> {
		const route = `repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}/pulls?per_page=${maximumCommitPullRequests}`;
		const items = await this._searchPullRequests(route, token, signal);
		if (items.length >= maximumCommitPullRequests) {
			this._logService.warn(`[AgentHostOctoKitService] Not resolving a pull request for ${sha}: more than ${maximumCommitPullRequests} are associated with it`);
			return undefined;
		}
		const atHead = items.filter(item => item?.head?.sha === sha);
		const open = atHead.filter(item => item.state === 'open');
		const candidates = open.length > 0 ? open : atHead;
		return candidates.length === 1 ? toCreatedPullRequest(candidates[0]) : undefined;
	}

	async getIssueOrPullRequest(owner: string, repo: string, number: number, token: string, signal: AbortSignal): Promise<GitHubIssueOrPullRequest> {
		const data = await this._rest<GitHubIssueOrPullRequestResponseItem>(`repos/${owner}/${repo}/issues/${number}`, 'GET', token, signal);
		const title = data?.title;
		const body = data?.body;
		if (typeof title !== 'string' || (typeof body !== 'string' && body !== null)) {
			throw new Error(`Failed to fetch issue or pull request ${owner}/${repo}#${number}`);
		}
		return { title, body: body ?? '' };
	}

	async enablePullRequestAutoMerge(pullRequestId: string, mergeMethod: AutoMergeMethod, token: string, signal: AbortSignal): Promise<void> {
		const credential = await this._credentials.resolveCredential(token, signal);
		try {
			const response = await this._transport.graphql(
				credential.account,
				credential.token,
				this._endpoint.getGraphQlUri(),
				enableAutoMergeMutation,
				{ pullRequestId, mergeMethod },
				AbortSignal.any([signal, credential.signal]),
				'mutation',
			);
			if (response.errors.length > 0) {
				const message = response.errors.map(error => error.message ?? JSON.stringify(error)).join('; ');
				throw new GitHubRequestError(`GitHub GraphQL request failed: ${message}`, response.errors.some(error => error.type === 'RATE_LIMITED') ? 'rateLimit' : 'schema', 200, undefined, response.errors);
			}
		} catch (error) {
			this._credentials.handleRequestError(credential, error);
			throw error;
		}
	}

	private async _searchPullRequests(route: string, token: string, signal: AbortSignal): Promise<readonly GitHubPullRequestResponseItem[]> {
		try {
			const data = await this._rest<GitHubPullRequestResponseItem[]>(route, 'GET', token, signal);
			return Array.isArray(data) ? data : [];
		} catch (error) {
			if (error instanceof GitHubRequestError && isMissingCommitPullRequestsResponse(route, error)) {
				return [];
			}
			if (error instanceof GitHubRequestError && error.statusCode !== undefined) {
				const detail = formatErrorBody(error.responseBody);
				this._logService.error(`[AgentHostOctoKit] GET ${this._endpoint.getApiBaseUri()}/${route} - Status: ${error.statusCode}${detail ? ` - ${detail}` : ''}`);
			}
			throw error;
		}
	}

	private async _rest<T>(route: string, method: 'GET' | 'POST', token: string, signal: AbortSignal, body?: object): Promise<T | undefined> {
		const credential = await this._credentials.resolveCredential(token, signal);
		try {
			const response = await this._transport.rest<T>(credential.account, credential.token, {
				method,
				url: `${this._endpoint.getApiBaseUri()}/${route}`,
				body,
				etag: method === 'GET',
				priority: method === 'GET' ? 'interactive' : 'mutation',
			}, AbortSignal.any([signal, credential.signal]));
			return response.data;
		} catch (error) {
			this._credentials.handleRequestError(credential, error);
			throw error;
		}
	}
}

function toCreatedPullRequest(item: GitHubPullRequestResponseItem | undefined): CreatedPullRequest | undefined {
	const htmlUrl = item?.html_url;
	const number = item?.number;
	const nodeId = item?.node_id;
	const createdAtRaw = item?.created_at;
	const createdAt = typeof createdAtRaw === 'string' ? Date.parse(createdAtRaw) : undefined;
	return typeof htmlUrl === 'string' && typeof number === 'number'
		? {
			number,
			url: htmlUrl,
			nodeId: typeof nodeId === 'string' ? nodeId : undefined,
			...(createdAt !== undefined && Number.isFinite(createdAt) ? { createdAt } : {}),
		}
		: undefined;
}

function isMissingCommitPullRequestsResponse(route: string, error: GitHubRequestError): boolean {
	if (error.statusCode !== 422 || !commitPullRequestsRoute.test(route) || error.responseBody === undefined) {
		return false;
	}
	try {
		const body: { readonly message?: unknown } | null = JSON.parse(error.responseBody);
		return typeof body?.message === 'string' && body.message.startsWith('No commit found for SHA: ');
	} catch {
		return false;
	}
}

function formatErrorBody(body: string | undefined): string | undefined {
	const normalized = body?.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.length > 500 ? `${normalized.substring(0, 500)}...` : normalized;
}
