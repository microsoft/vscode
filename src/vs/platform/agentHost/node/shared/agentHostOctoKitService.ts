/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LRUCache } from '../../../../base/common/map.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';

export type FetchFunction = typeof globalThis.fetch;

/**
 * Successful result of {@link IAgentHostOctoKitService.createPullRequest}.
 *
 * Mirrors the `CreatedPullRequest` type returned by `OctoKitService` in
 * `extensions/copilot/src/platform/github/common/githubService.ts` so the
 * shapes line up if/when the two are ported together.
 */
export interface CreatedPullRequest {
	readonly url: string;
	readonly number: number;
	readonly nodeId?: string;
}

/**
 * Merge strategy used when enabling auto-merge on a pull request.
 * Mirrors the GitHub GraphQL `PullRequestMergeMethod` enum.
 */
export type AutoMergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

interface GitHubPullRequestResponseItem {
	readonly number?: unknown;
	readonly html_url?: unknown;
	readonly node_id?: unknown;
}

export interface IGitHubApiResponse<T> {
	readonly data: T | undefined;
	readonly statusCode: number;
	readonly etag?: string;
}

/**
 * Minimal GitHub REST client living in the agent-host process.
 *
 * The agent host runs headless and has no access to the workbench
 * `IOctoKitService` / Octokit / VS Code auth providers. This service is a
 * deliberately small re-implementation of the bits we need, modelled on
 * `OctoKitService` from the Copilot extension so the API surface is
 * familiar. Only operations the agent host actually needs are exposed —
 * extend this interface as new changeset operations are added.
 *
 * The caller is responsible for supplying a GitHub OAuth token with the
 * scopes required by the operation (e.g. `repo` for {@link createPullRequest}).
 * Tokens are typically obtained from the agent host's
 * `authenticate(resource, token)` token store, which the workbench pushes
 * on session create via the same channel used for `ICopilotApiService`.
 */
export interface IAgentHostOctoKitService {
	readonly _serviceBrand: undefined;

	/**
	 * Creates a pull request on github.com.
	 *
	 * Mirrors `OctoKitService.createPullRequest` from the Copilot extension.
	 * Throws on non-2xx responses or malformed payloads.
	 */
	createPullRequest(
		owner: string,
		repo: string,
		title: string,
		body: string,
		head: string,
		base: string,
		draft: boolean,
		token: string,
		signal: AbortSignal,
	): Promise<CreatedPullRequest>;

	/** Finds the most recently updated pull request for `owner:branch`, if any. */
	findPullRequestByHeadBranch(owner: string, repo: string, branch: string, token: string, signal: AbortSignal): Promise<CreatedPullRequest | undefined>;

	/**
	 * Enables auto-merge on a pull request so GitHub merges it automatically
	 * once all required reviews and status checks pass.
	 *
	 * Issues the GraphQL `enablePullRequestAutoMerge` mutation. `pullRequestId`
	 * is the pull request's GraphQL global node id (see
	 * {@link CreatedPullRequest.nodeId}). Throws on GraphQL or transport errors,
	 * including when the repository does not allow the requested merge method or
	 * auto-merge is not enabled for the repository.
	 */
	enablePullRequestAutoMerge(pullRequestId: string, mergeMethod: AutoMergeMethod, token: string, signal: AbortSignal): Promise<void>;
}

export const IAgentHostOctoKitService = createDecorator<IAgentHostOctoKitService>('agentHostOctoKitService');

const GITHUB_API_HOST = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const MAX_ERROR_RESPONSE_BODY_LENGTH = 500;

const ENABLE_AUTO_MERGE_MUTATION = `mutation EnableAutoMerge($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
	enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
		pullRequest { id }
	}
}`;

export class AgentHostOctoKitService implements IAgentHostOctoKitService {

	declare readonly _serviceBrand: undefined;

	private readonly _fetch: FetchFunction;

	/**
	 * A cache of ETags for pull request search results.
	 */
	private readonly pullRequestSearchEtags = new LRUCache<string, string>(100);

	constructor(
		fetchFn: FetchFunction | undefined,
		@ILogService private readonly _logService: ILogService,
	) {
		this._fetch = fetchFn ?? globalThis.fetch;
	}

	async createPullRequest(
		owner: string,
		repo: string,
		title: string,
		body: string,
		head: string,
		base: string,
		draft: boolean,
		token: string,
		signal: AbortSignal,
	): Promise<CreatedPullRequest> {
		const response = await this._makeGHAPIRequest<GitHubPullRequestResponseItem>(
			`repos/${owner}/${repo}/pulls`,
			'POST',
			token,
			signal,
			{ title, body, head, base, draft },
		);

		const number = response.data?.number;
		const html_url = response.data?.html_url;
		if (typeof html_url !== 'string' || typeof number !== 'number') {
			throw new Error(`Failed to create pull request for ${owner}/${repo}`);
		}

		const node_id = response.data?.node_id;
		return { url: html_url, number, nodeId: typeof node_id === 'string' ? node_id : undefined };
	}

	async findPullRequestByHeadBranch(owner: string, repo: string, branch: string, token: string, signal: AbortSignal): Promise<CreatedPullRequest | undefined> {
		const routeSlug = `repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`;

		const etag = this.pullRequestSearchEtags.get(routeSlug);
		const response = await this._makeGHAPIRequest<GitHubPullRequestResponseItem[]>(routeSlug, 'GET', token, signal, undefined, etag);

		if (response.etag) {
			this.pullRequestSearchEtags.set(routeSlug, response.etag);
		}

		if (
			response.statusCode === 304 ||
			!Array.isArray(response.data) ||
			response.data.length === 0
		) {
			return undefined;
		}

		const first = response.data[0];
		const html_url = first?.html_url;
		const number = first?.number;
		const node_id = first?.node_id;
		return typeof html_url === 'string' && typeof number === 'number'
			? {
				number,
				url: html_url,
				nodeId: typeof node_id === 'string'
					? node_id
					: undefined
			}
			: undefined;
	}

	async enablePullRequestAutoMerge(pullRequestId: string, mergeMethod: AutoMergeMethod, token: string, signal: AbortSignal): Promise<void> {
		await this._makeGraphQLRequest(ENABLE_AUTO_MERGE_MUTATION, { pullRequestId, mergeMethod }, token, signal);
	}

	private async _makeGHAPIRequest<T>(
		routeSlug: string,
		method: 'GET' | 'POST',
		token: string,
		signal: AbortSignal,
		body?: Record<string, unknown>,
		etag?: string
	): Promise<IGitHubApiResponse<T>> {
		const url = `${GITHUB_API_HOST}/${routeSlug}`;
		const headers: Record<string, string> = {
			'Accept': 'application/vnd.github+json',
			'Authorization': `Bearer ${token}`,
			'X-GitHub-Api-Version': GITHUB_API_VERSION,
		};
		if (etag) {
			headers['If-None-Match'] = etag;
		}
		if (body) {
			headers['Content-Type'] = 'application/json';
		}

		let response: Response;
		try {
			response = await this._fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
				signal,
			});
		} catch (err) {
			if (signal.aborted) {
				throw err;
			}
			this._logService.error(`[AgentHostOctoKit] ${method} ${url} - Network error`, err);
			throw err;
		}

		// Inspect rate limit header
		const rateLimitHeader = response.headers.get('x-ratelimit-remaining');
		if (rateLimitHeader) {
			const rateLimitRemaining = parseRateLimitHeader(rateLimitHeader);
			if (rateLimitRemaining !== undefined && rateLimitRemaining < 100) {
				this._logService.warn(`[AgentHostOctoKitService] ${method} ${url} - GitHub API rate limit low: ${rateLimitRemaining} remaining`);
			}
		}

		const statusCode = response.status ?? 0;
		const responseETag = response.headers.get('etag') ?? undefined;

		if (
			statusCode === 204 /* No Content */ ||
			statusCode === 304 /* Not Modified */
		) {
			return { data: undefined, statusCode, etag: responseETag };
		}

		if (!response.ok) {
			const errorText = await response.text().catch(() => undefined);
			const errorDetail = this._formatErrorResponseBody(errorText);
			this._logService.error(`[AgentHostOctoKit] ${method} ${url} - Status: ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`);
			throw new Error(`GitHub API request failed: ${method} ${routeSlug} - ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`);
		}

		try {
			const data = await response.json();
			return { data, statusCode, etag: responseETag };
		} catch (err) {
			this._logService.error(`[AgentHostOctoKit] ${method} ${url} - Failed to parse JSON`, err);
			throw err;
		}
	}

	private async _makeGraphQLRequest(
		query: string,
		variables: Record<string, unknown>,
		token: string,
		signal: AbortSignal,
	): Promise<unknown> {
		const url = `${GITHUB_API_HOST}/graphql`;
		const headers: Record<string, string> = {
			'Accept': 'application/json',
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json',
			'X-GitHub-Api-Version': GITHUB_API_VERSION,
		};

		let response: Response;
		try {
			response = await this._fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify({ query, variables }),
				signal,
			});
		} catch (err) {
			if (signal.aborted) {
				throw err;
			}
			this._logService.error(`[AgentHostOctoKit] POST ${url} - Network error`, err);
			throw err;
		}

		if (!response.ok) {
			const errorText = await response.text().catch(() => undefined);
			const errorDetail = this._formatErrorResponseBody(errorText);
			this._logService.error(`[AgentHostOctoKit] POST ${url} - Status: ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`);
			throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`);
		}

		let json: { data?: unknown; errors?: ReadonlyArray<{ message?: unknown }> };
		try {
			json = await response.json();
		} catch (err) {
			this._logService.error(`[AgentHostOctoKit] POST ${url} - Failed to parse JSON`, err);
			throw err;
		}

		// GraphQL reports failures with a 200 status code and an `errors` array.
		if (Array.isArray(json.errors) && json.errors.length > 0) {
			const message = json.errors.map(error => {
				return typeof error?.message === 'string'
					? error.message
					: JSON.stringify(error);
			}).join('; ');
			this._logService.error(`[AgentHostOctoKit] POST ${url} - GraphQL error: ${message}`);
			throw new Error(`GitHub GraphQL request failed: ${message}`);
		}

		return json.data;
	}

	private _formatErrorResponseBody(errorText: string | undefined): string | undefined {
		const normalized = errorText?.replace(/\s+/g, ' ').trim();
		if (!normalized) {
			return undefined;
		}
		return normalized.length > MAX_ERROR_RESPONSE_BODY_LENGTH
			? `${normalized.substring(0, MAX_ERROR_RESPONSE_BODY_LENGTH)}...`
			: normalized;
	}
}

function parseRateLimitHeader(value: string | string[] | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const str = Array.isArray(value) ? value[0] : value;
	const parsed = parseInt(str, 10);
	return isNaN(parsed) ? undefined : parsed;
}
