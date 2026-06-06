/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
}

interface GitHubPullRequestResponseItem {
	readonly html_url?: unknown;
	readonly number?: unknown;
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
}

export const IAgentHostOctoKitService = createDecorator<IAgentHostOctoKitService>('agentHostOctoKitService');

const GITHUB_API_HOST = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const MAX_ERROR_RESPONSE_BODY_LENGTH = 500;

export class AgentHostOctoKitService implements IAgentHostOctoKitService {

	declare readonly _serviceBrand: undefined;

	private readonly _fetch: FetchFunction;

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
		const response = await this._makeGHAPIRequest(
			`repos/${owner}/${repo}/pulls`,
			'POST',
			token,
			signal,
			{ title, body, head, base, draft },
		);

		const html_url = (response as { html_url?: unknown } | undefined)?.html_url;
		const number = (response as { number?: unknown } | undefined)?.number;
		if (typeof html_url !== 'string' || typeof number !== 'number') {
			throw new Error(`Failed to create pull request for ${owner}/${repo}`);
		}

		return { url: html_url, number };
	}

	async findPullRequestByHeadBranch(owner: string, repo: string, branch: string, token: string, signal: AbortSignal): Promise<CreatedPullRequest | undefined> {
		const response = await this._makeGHAPIRequest(
			`repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&sort=updated&direction=desc&per_page=1`,
			'GET',
			token,
			signal,
		);
		if (!Array.isArray(response) || response.length === 0) {
			return undefined;
		}
		const first = response[0] as GitHubPullRequestResponseItem | undefined;
		const html_url = first?.html_url;
		const number = first?.number;
		return typeof html_url === 'string' && typeof number === 'number'
			? { url: html_url, number }
			: undefined;
	}

	private async _makeGHAPIRequest(
		routeSlug: string,
		method: 'GET' | 'POST',
		token: string,
		signal: AbortSignal,
		body?: Record<string, unknown>,
	): Promise<unknown> {
		const url = `${GITHUB_API_HOST}/${routeSlug}`;
		const headers: Record<string, string> = {
			'Accept': 'application/vnd.github+json',
			'Authorization': `Bearer ${token}`,
			'X-GitHub-Api-Version': GITHUB_API_VERSION,
		};
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

		if (!response.ok) {
			const errorText = await response.text().catch(() => undefined);
			const errorDetail = this._formatErrorResponseBody(errorText);
			this._logService.error(`[AgentHostOctoKit] ${method} ${url} - Status: ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`);
			throw new Error(`GitHub API request failed: ${method} ${routeSlug} - ${response.status} ${response.statusText}${errorDetail ? ` - ${errorDetail}` : ''}`);
		}

		try {
			return await response.json();
		} catch (err) {
			this._logService.error(`[AgentHostOctoKit] ${method} ${url} - Failed to parse JSON`, err);
			throw err;
		}
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
