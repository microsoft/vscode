/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Endpoints } from '@octokit/types';
import { CCAModel, RemoteAgentJobPayload } from '@vscode/copilot-api';
import { createServiceIdentifier } from '../../../util/common/services';
import { decodeBase64 } from '../../../util/vs/base/common/buffer';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { addPullRequestCommentGraphQLRequest, AssignableActor, closePullRequest, getPullRequestFromGlobalId, makeGitHubAPIRequest, makeSearchGraphQLRequest, PullRequestComment, PullRequestSearchItem, SessionInfo } from './githubAPI';

/**
 * Options for controlling authentication behavior in OctoKit service methods.
 */
export interface AuthOptions {
	/**
	 * If provided, prompts the user to sign in if no authentication token is available,
	 * displaying the given detail message to explain why authentication is needed.
	 * If undefined, fails silently without prompting.
	 */
	readonly createIfNone?: { readonly detail: string };
}

export type IGetRepositoryInfoResponseData = Endpoints['GET /repos/{owner}/{repo}']['response']['data'];

export const IGithubRepositoryService = createServiceIdentifier<IGithubRepositoryService>('IGithubRepositoryService');
export const IOctoKitService = createServiceIdentifier<IOctoKitService>('IOctoKitService');

export const VSCodeTeamId = 1682102;

export type GithubRepositoryItem = {
	name: string;
	path: string;
	html_url: string;
	type: 'file' | 'dir';
};

export interface JobInfo {
	job_id: string;
	session_id: string;
	problem_statement: string;
	content_filter_mode?: string;
	status: string;
	result?: string;
	actor: {
		id: number;
		login: string;
	};
	created_at: string;
	updated_at: string;
	pull_request: {
		id: number;
		number: number;
	};
	workflow_run?: {
		id: number;
	};
	error?: {
		message: string;
	};
	event_type?: string;
	event_url?: string;
	event_identifiers?: string[];
}

export interface IGithubRepositoryService {

	_serviceBrand: undefined;

	/**
	 * Returns whether the given repository is available via GitHub APIs.
	 * @param org The GitHub organization
	 * @param repo The GitHub repository
	 */
	isAvailable(org: string, repo: string): Promise<boolean>;
	getRepositoryInfo(owner: string, repo: string): Promise<IGetRepositoryInfoResponseData>;
	getRepositoryItems(org: string, repo: string, path: string): Promise<GithubRepositoryItem[]>;
	getRepositoryItemContent(org: string, repo: string, path: string): Promise<Uint8Array | undefined>;
}

export interface IOctoKitUser {
	login: string;
	name: string | null;
	avatar_url: string;
}

/**
 * Result of checking if Copilot cloud agent is enabled for a repository.
 */
export interface CCAEnabledResult {
	/**
	 * Whether the cloud agent is enabled. `undefined` if unable to determine.
	 */
	enabled: boolean | undefined;
	/**
	 * The HTTP status code from the /enabled response. Known values: 401, 403, 422.
	 * Unexpected values (e.g. 429 rate-limit, 5xx) are also propagated for telemetry.
	 */
	statusCode?: number;
}

export interface IOctoKitSessionInfo {
	name: string;
	owner_id: number;
	premium_requests: number;
	repo_id: number;
	resource_global_id: string;
	resource_id: number;
	resource_state: string;
	resource_type: string;
	state: string;
	user_id: number;
	workflow_run_id: number;
	last_updated_at: string;
	created_at: string;
}

export interface RemoteAgentJobResponse {
	job_id: string;
	session_id: string;
	actor: {
		id: number;
		login: string;
	};
	created_at: string;
	updated_at: string;
}

export interface ErrorResponseWithStatusCode {
	status: number;
}

export interface CustomAgentListItem {
	name: string;
	repo_owner_id: number;
	repo_owner: string;
	repo_id: number;
	repo_name: string;
	display_name: string;
	description: string;
	tools: string[];
	version: string;
	argument_hint?: string;
	metadata?: Record<string, string>;
	target?: string;
	config_error?: string;
	model?: string;
	disable_model_invocation?: boolean;
	user_invocable?: boolean;
	'mcp-servers'?: {
		[serverName: string]: {
			type: string;
			command?: string;
			args?: string[];
			tools?: string[];
			env?: { [key: string]: string };
			headers?: { [key: string]: string };
		};
	};
}

export interface CustomAgentListOptions {
	target?: 'github-copilot' | 'vscode';
	excludeInvalidConfig?: boolean;
	dedupe?: boolean;
	includeSources?: ('repo' | 'org' | 'enterprise')[];
}

export interface CustomAgentListOptions {
	target?: 'github-copilot' | 'vscode';
	excludeInvalidConfig?: boolean;
	dedupe?: boolean;
	includeSources?: ('repo' | 'org' | 'enterprise')[];
}

export interface CustomAgentDetails extends CustomAgentListItem {
	prompt: string;
}

export interface PullRequestFile {
	filename: string;
	status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	additions: number;
	deletions: number;
	changes: number;
	patch?: string;
	previous_filename?: string;
	sha?: string;
}

interface GitHubContentResponse {
	content?: string;
	encoding?: string;
	sha?: string;
}

interface GitHubBlobResponse {
	content: string;
	encoding: string;
}

export const enum GitHubOutageStatus {
	None,
	Minor,
	Major,
	Critical
}

export class PermissiveAuthRequiredError extends Error {
	constructor() {
		super('Permissive authentication is required');
		this.name = 'PermissiveAuthRequiredError';
	}
}

export interface IOctoKitService {

	_serviceBrand: undefined;

	/**
	 * @returns The currently authenticated user or undefined if there isn't one
	 */
	getCurrentAuthedUser(): Promise<IOctoKitUser | undefined>;

	/**
	 * Returns the list of Copilot pull requests for a given user on a specific repo.
	 * @param authOptions - Authentication options. By default, uses silent auth and returns empty array if not authenticated.
	 */
	getOpenPullRequestsForUser(owner: string, repo: string, authOptions: AuthOptions): Promise<PullRequestSearchItem[]>;

	/**
	 * Returns the list of Copilot sessions for a given pull request.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getCopilotSessionsForPR(prId: string, authOptions: AuthOptions): Promise<SessionInfo[]>;

	/**
	 * Returns the logs for a specific Copilot session.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getSessionLogs(sessionId: string, authOptions: AuthOptions): Promise<string>;

	/**
	 * Returns the information for a specific Copilot session.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getSessionInfo(sessionId: string, authOptions: AuthOptions): Promise<SessionInfo | undefined>;

	/**
	 * Posts a new Copilot agent job.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	postCopilotAgentJob(
		owner: string,
		name: string,
		apiVersion: string,
		payload: RemoteAgentJobPayload,
		authOptions: AuthOptions,
	): Promise<RemoteAgentJobResponse | ErrorResponseWithStatusCode | undefined>;

	/**
	 * Gets a job by its job ID.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getJobByJobId(owner: string, repo: string, jobId: string, userAgent: string, authOptions: AuthOptions): Promise<JobInfo | undefined>;

	/**
	 * Gets a job by session ID
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getJobBySessionId(owner: string, repo: string, sessionId: string, userAgent: string, authOptions: AuthOptions): Promise<JobInfo | undefined>;

	/**
	 * Adds a comment to a pull request.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	addPullRequestComment(pullRequestId: string, commentBody: string, authOptions: AuthOptions): Promise<PullRequestComment | null>;

	/**
	 * Gets all open Copilot sessions.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getAllSessions(nwo: string | undefined, open: boolean, authOptions: AuthOptions): Promise<SessionInfo[]>;

	/**
	 * Gets pull request from global id.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 */
	getPullRequestFromGlobalId(globalId: string, authOptions: AuthOptions): Promise<PullRequestSearchItem | null>;

	/**
	 * Gets the list of custom agents available for a repository.
	 * This includes both repo-level and org/enterprise-level custom agents.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param options Optional filtering options:
	 *   - targetPlatform: Only include agents for the specified platform.
	 *   - excludeInvalidConfigs: Exclude agents with invalid configurations.
	 *   - deduplicate: Remove duplicate agents from the result.
	 *   - source: Filter agents by their source (repo, org, enterprise).
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns An array of custom agent list items with basic metadata
	 */
	getCustomAgents(owner: string, repo: string, options: CustomAgentListOptions, authOptions: AuthOptions): Promise<CustomAgentListItem[]>;

	/**
	 * Gets the full configuration for a specific custom agent.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param agentName The name of the custom agent
	 * @param version Optional git ref (branch, tag, or commit SHA) to fetch from
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns The complete custom agent configuration including the prompt
	 */
	getCustomAgentDetails(owner: string, repo: string, agentName: string, version: string, authOptions: AuthOptions): Promise<CustomAgentDetails | undefined>;

	/**
	 * Gets the list of files changed in a pull request.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param pullNumber The pull request number
	 * @param authOptions - Authentication options. By default, uses silent auth and returns empty array if not authenticated.
	 * @returns An array of changed files with their metadata
	 */
	getPullRequestFiles(owner: string, repo: string, pullNumber: number, authOptions: AuthOptions): Promise<PullRequestFile[]>;

	/**
	 * Closes a pull request.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param pullNumber The pull request number
	 * @param authOptions - Authentication options. By default, uses silent auth and returns false if not authenticated.
	 * @returns A promise that resolves to true if the PR was successfully closed
	 */
	closePullRequest(owner: string, repo: string, pullNumber: number, authOptions: AuthOptions): Promise<boolean>;

	/**
	 * Finds a pull request by its head branch name in a given repository.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param headBranch The head branch name to search for
	 * @param authOptions - Authentication options. By default, uses silent auth and returns undefined if not authenticated.
	 * @returns The matching pull request or undefined if not found
	 */
	findPullRequestByHeadBranch(owner: string, repo: string, headBranch: string, authOptions: AuthOptions): Promise<PullRequestSearchItem | undefined>;

	/**
	 * Get file content from a specific commit.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param ref The commit SHA, branch name, or tag
	 * @param path The file path within the repository
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns The file content as a string
	 */
	getFileContent(owner: string, repo: string, ref: string, path: string, authOptions: AuthOptions): Promise<string>;

	/**
	 * Gets the list of organizations that the authenticated user belongs to.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @param pageSize - Number of organizations to fetch per page (max and default: 100)
	 * @returns An array of organization logins
	 */
	getUserOrganizations(authOptions: AuthOptions, pageSize?: number): Promise<string[]>;

	/**
	 * Checks if the authenticated user is a member of a specific organization.
	 * This makes a direct API call and avoids pagination issues with getUserOrganizations.
	 * @param org The organization login to check membership for
	 * @param authOptions - Authentication options. By default, uses silent auth.
	 * @returns True if the user is a member, false otherwise
	 */
	isUserMemberOfOrg(org: string, authOptions: AuthOptions): Promise<boolean>;

	/**
	 * Gets the list of repositories for an organization.
	 * @param org The organization name
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @param pageSize - Number of repositories to fetch per page (max and default: 100)
	 * @returns An array of repository names
	 */
	getOrganizationRepositories(org: string, authOptions: AuthOptions, pageSize?: number): Promise<string[]>;

	/**
	 * Gets the custom instructions prompt for an organization.
	 * @param orgLogin The organization login
	 * @returns The prompt string or undefined if not available
	 */
	getOrgCustomInstructions(orgLogin: string, authOptions: AuthOptions): Promise<string | undefined>;

	/**
	 * Gets the list of repositories the authenticated user has access to.
	 * This includes repositories the user owns, collaborates on, and has access to through organization membership.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @param query - Optional search query to filter repositories by name.
	 * @returns An array of repositories with owner/name format
	 */
	getUserRepositories(authOptions: AuthOptions, query?: string): Promise<{ owner: string; name: string }[]>;

	/**
	 * Gets the list of repositories the authenticated user has recently committed to.
	 * Uses the GitHub Events API to find repositories from recent PushEvent activity.
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns An array of repositories with owner/name format, ordered by most recent commit
	 */
	getRecentlyCommittedRepositories(authOptions: AuthOptions): Promise<{ owner: string; name: string }[]>;

	/**
	 * Gets the list of available models for the Copilot coding agent.
	 * Returns an empty array if the user doesn't have access to the model picker
	 * (e.g., Copilot Business or Enterprise users before rollout).
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns An array of available models. The first model is always 'Auto' and should be the default.
	 */
	getCopilotAgentModels(authOptions: AuthOptions): Promise<CCAModel[]>;

	/**
	 * Gets the list of assignable actors (users/bots) for a repository.
	 * This is used to check if partner agents like Copilot are available for assignment.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param authOptions - Authentication options. By default, uses silent auth and throws {@link PermissiveAuthRequiredError} if not authenticated.
	 * @returns An array of assignable actors with their login names
	 */
	getAssignableActors(owner: string, repo: string, authOptions: AuthOptions): Promise<AssignableActor[]>;

	/**
	 * Checks if the Copilot cloud agent is enabled for a repository.
	 * @param owner The repository owner
	 * @param repo The repository name
	 * @param authOptions - Authentication options. By default, uses silent auth.
	 * @returns An object indicating enabled status and status code if disabled.
	 *          - 200: enabled = true
	 *          - 401: enabled = false, statusCode = 401
	 *          - 403: enabled = false, statusCode = 403
	 *          - 422: enabled = false, statusCode = 422
	 *          - Other errors: enabled = undefined
	 */
	isCCAEnabled(owner: string, repo: string, authOptions: AuthOptions): Promise<CCAEnabledResult>;

	getGitHubOutageStatus(): Promise<GitHubOutageStatus>;
}

/**
 * The same as {@link OctoKitService} but doesn't require the AuthService.
 * This is because we want to call certain Octokit method inside the Authservice and must
 * avoid a circular dependency.
 * Note: Only OctoKitService is exposed on the accessor to avoid confusion.
 */
export class BaseOctoKitService {

	private static readonly _outageStatusCacheTTL = 5 * 60 * 1000; // 5 minutes
	private _cachedOutageStatus: { value: GitHubOutageStatus; timestamp: number } | undefined;

	constructor(
		protected readonly _capiClientService: ICAPIClientService,
		protected readonly _fetcherService: IFetcherService,
		protected readonly _logService: ILogService,
		protected readonly _telemetryService: ITelemetryService
	) { }

	async getCurrentAuthedUserWithToken(token: string): Promise<IOctoKitUser | undefined> {
		return this._makeGHAPIRequest('user', 'GET', token, undefined, undefined, 'github-rest-get-user');
	}

	async getGitHubOutageStatus(): Promise<GitHubOutageStatus> {
		const now = Date.now();
		if (this._cachedOutageStatus && (now - this._cachedOutageStatus.timestamp) < BaseOctoKitService._outageStatusCacheTTL) {
			return this._cachedOutageStatus.value;
		}
		try {
			// See docs at https://www.githubstatus.com/api/
			const response = await this._fetcherService.fetch('https://www.githubstatus.com/api/v2/status.json', { method: 'GET', callSite: 'github-status' });
			const data = await response.json();
			const status = data?.status?.indicator;
			let result: GitHubOutageStatus;
			switch (status) {
				case 'none':
					result = GitHubOutageStatus.None;
					break;
				case 'minor':
					result = GitHubOutageStatus.Minor;
					break;
				case 'major':
					result = GitHubOutageStatus.Major;
					break;
				case 'critical':
					result = GitHubOutageStatus.Critical;
					break;
				default:
					result = GitHubOutageStatus.None;
					break;
			}
			this._cachedOutageStatus = { value: result, timestamp: now };
			return result;
		} catch {
			// Cache the failure as None so callers don't re-attempt on every invocation
			this._cachedOutageStatus = { value: GitHubOutageStatus.None, timestamp: now };
			return GitHubOutageStatus.None;
		}
	}

	protected async _makeGHAPIRequest(routeSlug: string, method: 'GET' | 'POST', token: string, body?: { [key: string]: any }, options?: { silent404?: boolean }, callSite: string = 'github-api-rest') {
		return makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, routeSlug, method, token, { body, version: '2022-11-28', silent404: options?.silent404, callSite });
	}

	protected async getOpenPullRequestForUserWithToken(owner: string, repo: string, user: string, token: string) {
		const query = `repo:${owner}/${repo} is:open involves:${user}`;
		return makeSearchGraphQLRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, token, query);
	}

	protected async findPullRequestByHeadBranchWithToken(owner: string, repo: string, headBranch: string, token: string): Promise<PullRequestSearchItem | undefined> {
		const query = `repo:${owner}/${repo} head:${headBranch} is:pr`;
		const results = await makeSearchGraphQLRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, token, query, 5);
		return results.find(pr => pr.headRefName === headBranch);
	}

	protected async addPullRequestCommentWithToken(pullRequestId: string, commentBody: string, token: string): Promise<PullRequestComment | null> {
		return addPullRequestCommentGraphQLRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, token, pullRequestId, commentBody);
	}

	protected async getPullRequestFromSessionWithToken(globalId: string, token: string): Promise<PullRequestSearchItem | null> {
		return getPullRequestFromGlobalId(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, token, globalId);
	}

	protected async getPullRequestFilesWithToken(owner: string, repo: string, pullNumber: number, token: string): Promise<PullRequestFile[]> {
		const result = await makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, `repos/${owner}/${repo}/pulls/${pullNumber}/files`, 'GET', token, { version: '2022-11-28', callSite: 'github-rest-get-pr-files' });
		return result || [];
	}

	protected async closePullRequestWithToken(owner: string, repo: string, pullNumber: number, token: string): Promise<boolean> {
		return closePullRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, token, owner, repo, pullNumber);
	}

	protected async getFileContentWithToken(owner: string, repo: string, ref: string, path: string, token: string): Promise<string> {
		const route = `repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
		const response = await makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, route, 'GET', token, { callSite: 'github-rest-get-file-content' });

		if (!response || Array.isArray(response)) {
			throw new Error('Unable to fetch file content');
		}

		const typedResponse = response as GitHubContentResponse;

		if (typedResponse.content && typedResponse.encoding === 'base64') {
			return decodeBase64(typedResponse.content.replace(/\n/g, '')).toString();
		}

		if (typedResponse.sha) {
			const blob = await this.getBlobContentWithToken(owner, repo, typedResponse.sha, token);
			if (blob) {
				return blob;
			}
		}

		this._logService.error(`Failed to get file content for ${owner}/${repo}/${path} at ref ${ref}`);
		return '';
	}

	protected async getUserOrganizationsWithToken(token: string, pageSize: number = 100): Promise<string[]> {
		const result = await this._makeGHAPIRequest(`user/orgs?per_page=${pageSize}`, 'GET', token, undefined, undefined, 'github-rest-get-user-orgs');
		if (!result || !Array.isArray(result)) {
			return [];
		}
		return result.map((org: { login: string }) => org.login);
	}

	protected async isUserMemberOfOrgWithToken(org: string, token: string): Promise<boolean> {
		try {
			// GET /user/memberships/orgs/{org} returns 200 if the user is a member, 404 otherwise
			const result = await this._makeGHAPIRequest(`user/memberships/orgs/${encodeURIComponent(org)}`, 'GET', token, undefined, undefined, 'github-rest-check-org-membership');
			// If we get a result with state 'active' or 'pending', user is a member
			return result && (result.state === 'active' || result.state === 'pending');
		} catch {
			// 404 or other error means user is not a member
			return false;
		}
	}

	protected async getOrganizationRepositoriesWithToken(org: string, token: string, pageSize: number = 100): Promise<string[]> {
		const result = await this._makeGHAPIRequest(`orgs/${org}/repos?per_page=${pageSize}&sort=updated`, 'GET', token, undefined, { silent404: true }, 'github-rest-get-org-repos');
		if (!result || !Array.isArray(result) || result.length === 0) {
			return [];
		}
		return result.map((repo: { name: string }) => repo.name);
	}

	protected async getUserRepositoriesWithToken(token: string, query?: string): Promise<{ owner: string; name: string }[]> {
		// If query provided, use GitHub search API
		if (query && query.trim()) {
			return this.searchUserRepositoriesWithToken(token, query.trim());
		}

		// Fetch the most recently updated repos with push access
		const result = await this._makeGHAPIRequest(
			'user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
			'GET',
			token,
			undefined,
			undefined,
			'github-rest-get-user-repos'
		);

		if (!result || !Array.isArray(result)) {
			return [];
		}

		// Filter to repos with push access
		const items = result
			.filter((repo: { permissions?: { push?: boolean } }) => repo.permissions?.push)
			.map((repo: { name: string; owner: { login: string } }) => ({
				owner: repo.owner.login,
				name: repo.name
			}));
		return items || [];
	}

	private async searchUserRepositoriesWithToken(token: string, query: string): Promise<{ owner: string; name: string }[]> {
		// Use GitHub search API to find repos matching the query
		// Search in repos the user has push access to
		const searchQuery = encodeURIComponent(`${query} in:name fork:true`);
		const result = await this._makeGHAPIRequest(
			`search/repositories?q=${searchQuery}&sort=updated&per_page=100`,
			'GET',
			token,
			undefined,
			undefined,
			'github-rest-search-repos'
		);

		if (!result || !result.items || !Array.isArray(result.items)) {
			return [];
		}

		// Filter to only repos with push access
		const items = result.items
			.filter((repo: { permissions?: { push?: boolean } }) => repo.permissions?.push)
			.map((repo: { name: string; owner: { login: string } }) => ({
				owner: repo.owner.login,
				name: repo.name
			}));
		return items || [];
	}

	protected async getRecentlyCommittedReposWithToken(token: string): Promise<{ owner: string; name: string }[]> {
		// First, get the authenticated user's login
		const user = await this._makeGHAPIRequest('user', 'GET', token, undefined, undefined, 'github-rest-get-user');
		if (!user || !user.login) {
			return [];
		}

		// Fetch recent events for the user (includes push events)
		const events = await this._makeGHAPIRequest(
			`users/${user.login}/events?per_page=100`,
			'GET',
			token,
			undefined,
			undefined,
			'github-rest-get-user-events'
		);

		if (!events || !Array.isArray(events)) {
			return [];
		}

		// Extract unique repos from PushEvent entries, preserving order (most recent first)
		const repoSet = new Map<string, { owner: string; name: string }>();
		for (const event of events) {
			if (event.type === 'PushEvent' && event.repo?.name) {
				const [owner, name] = event.repo.name.split('/');
				if (owner && name && !repoSet.has(event.repo.name)) {
					repoSet.set(event.repo.name, { owner, name });
				}
			}
		}
		const items = Array.from(repoSet.values());
		return items || [];
	}

	private async getBlobContentWithToken(owner: string, repo: string, sha: string, token: string): Promise<string | undefined> {
		const blobRoute = `repos/${owner}/${repo}/git/blobs/${sha}`;
		const blobResponse = await makeGitHubAPIRequest(this._fetcherService, this._logService, this._telemetryService, this._capiClientService.dotcomAPIURL, blobRoute, 'GET', token, { version: '2022-11-28', callSite: 'github-rest-get-blob' });

		if (!blobResponse || Array.isArray(blobResponse)) {
			return undefined;
		}

		const typedBlob = blobResponse as GitHubBlobResponse;
		if (typedBlob.content && typedBlob.encoding === 'base64') {
			return decodeBase64(typedBlob.content.replace(/\n/g, '')).toString();
		}

		return undefined;
	}
}
