/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/logService';
import { IFetcherService } from '../../networking/common/fetcherService';
import { ITelemetryService } from '../../telemetry/common/telemetry';

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export enum GraphQLErrorType {
	Unprocessable = 'UNPROCESSABLE',
}

export interface GraphQLError {
	extensions?: {
		code: string;
	};
	type?: GraphQLErrorType;
	message?: string;
}

export function getErrorCode(e: unknown): string | undefined {
	if (!isObject(e)) {
		return undefined;
	}

	if (e.status !== undefined) {
		return String(e.status);
	}

	const networkError = e.networkError;
	if (isObject(networkError) && networkError.statusCode !== undefined) {
		return String(networkError.statusCode);
	}

	const graphQLErrors = e.graphQLErrors;
	if (Array.isArray(graphQLErrors) && graphQLErrors.length > 0) {
		const firstGraphQLError = graphQLErrors[0] as GraphQLError | undefined;
		if (firstGraphQLError) {
			if (firstGraphQLError.extensions?.code !== undefined) {
				return String(firstGraphQLError.extensions.code);
			}
			if (firstGraphQLError.type !== undefined) {
				return String(firstGraphQLError.type);
			}
		}
	}

	if (e.code !== undefined) {
		return String(e.code);
	}

	if (typeof e.name === 'string' && e.name) {
		return e.name;
	}

	return undefined;
}

export interface PullRequestSearchItem {
	id: string;
	number: number;
	title: string;
	state: string;
	isDraft?: boolean;
	url: string;
	createdAt: string;
	updatedAt: string;
	author: {
		login: string;
	} | null;
	repository: {
		owner: {
			login: string;
		};
		name: string;
	};
	additions: number;
	deletions: number;
	files: {
		totalCount: number;
	};
	fullDatabaseId: number;
	headRefOid: string;
	baseRefOid?: string;
	headRefName?: string;
	baseRefName?: string;
	body: string;
}

export type PullRequestState = 'open' | 'closed' | 'merged' | 'draft';

/**
 * Derives a unified pull request state from the GitHub GraphQL `state` enum
 * and the `isDraft` boolean. Terminal states (merged, closed) take precedence
 * over draft — a closed draft PR is reported as 'closed', not 'draft'.
 */
export function derivePullRequestState(pr: Pick<PullRequestSearchItem, 'state' | 'isDraft'>): PullRequestState {
	const state = pr.state?.toUpperCase();
	if (state === 'MERGED') {
		return 'merged';
	}
	if (state === 'CLOSED') {
		return 'closed';
	}
	if (pr.isDraft) {
		return 'draft';
	}
	return 'open';
}

export interface PullRequestSearchResult {
	search: {
		nodes: PullRequestSearchItem[];
		pageInfo: {
			hasNextPage: boolean;
			endCursor: string | null;
		};
		issueCount: number;
	};
}

export interface SessionInfo {
	id: string;
	name: string;
	user_id: number;
	agent_id: number;
	logs: string;
	logs_blob_id: string;
	state: 'completed' | 'in_progress' | 'failed' | 'queued';
	owner_id: number;
	repo_id: number;
	resource_type: string;
	resource_id: number;
	last_updated_at: string;
	created_at: string;
	completed_at: string;
	event_type: string;
	workflow_run_id: number;
	premium_requests: number;
	error: string | null;
	resource_global_id: string;
}

export interface PullRequestComment {
	id: string;
	body: string;
	createdAt: string;
	author: {
		login: string;
	};
	url: string;
}

export interface AssignableActor {
	__typename: string;
	login: string;
	avatarUrl?: string;
	url?: string;
}

export interface AssignableActorsResponse {
	repository: {
		suggestedActors?: {
			nodes: AssignableActor[];
			pageInfo: {
				hasNextPage: boolean;
				endCursor: string | null;
			};
		};
		assignableUsers?: {
			nodes: AssignableActor[];
			pageInfo: {
				hasNextPage: boolean;
				endCursor: string | null;
			};
		};
	};
}

export interface GitHubAPIRequestOptions {
	body?: unknown;
	version?: string;
	type?: 'json' | 'text';
	userAgent?: string;
	accept?: string;
	additionalHeaders?: { [key: string]: string };
	returnStatusCodeOnError?: boolean;
	silent404?: boolean;
	callSite?: string;
}

export async function makeGitHubAPIRequest(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	routeSlug: string,
	method: 'GET' | 'POST',
	token: string | undefined,
	options?: GitHubAPIRequestOptions) {
	const { body, version, type = 'json', userAgent, accept, additionalHeaders, returnStatusCodeOnError = false, silent404 = false, callSite = 'github-api-rest' } = options ?? {};
	const headers: { [key: string]: string } = {
		'Accept': accept ?? 'application/vnd.github+json',
		...additionalHeaders,
	};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	if (version) {
		headers['X-GitHub-Api-Version'] = version;
	}
	if (userAgent) {
		headers['User-Agent'] = userAgent;
	}

	const response = await fetcherService.fetch(`${host}/${routeSlug}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		callSite,
	});
	if (!response.ok) {
		if (!(silent404 && response.status === 404)) {
			logService.error(`[GitHubAPI] ${method} ${host}/${routeSlug} - Status: ${response?.status}`);
		}
		if (returnStatusCodeOnError) {
			return { status: response.status };
		}
		return undefined;
	}

	try {
		const result = type === 'json' ? await response.json() : await response.text();
		const rateLimit = Number(response.headers.get('x-ratelimit-remaining'));
		const logMessage = `[RateLimit] REST rate limit remaining: ${rateLimit}, ${routeSlug}`;
		if (rateLimit < 1000) {
			// Danger zone
			logService.warn(logMessage);
			telemetry.sendMSFTTelemetryEvent('githubAPI.approachingRateLimit', { rateLimit: rateLimit.toString() });
		} else {
			logService.debug(logMessage);
		}
		return result;
	} catch {
		return undefined;
	}
}

export async function makeGitHubGraphQLRequest(fetcherService: IFetcherService, logService: ILogService, telemetry: ITelemetryService, host: string, query: string, token: string | undefined, variables?: unknown, callSite: string = 'github-api-graphql') {
	const headers: { [key: string]: string } = {
		'Accept': 'application/vnd.github+json',
		'Content-Type': 'application/json',
	};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const body = JSON.stringify({
		query,
		variables
	});

	const response = await fetcherService.fetch(`${host}/graphql`, {
		method: 'POST',
		headers,
		body,
		callSite,
	});

	if (!response.ok) {
		logService.debug(`[GitHubAPI] GraphQL request to ${host}/graphql failed with status ${response.status}`);
		return undefined;
	}

	try {
		const result = await response.json();
		const rateLimit = Number(response.headers.get('x-ratelimit-remaining'));
		const logMessage = `[RateLimit] GraphQL rate limit remaining: ${rateLimit}, query: ${query}`;
		if (rateLimit < 1000) {
			// Danger zone
			logService.warn(logMessage);
			telemetry.sendMSFTTelemetryEvent('githubAPI.approachingRateLimit', { rateLimit: rateLimit.toString() });
		} else {
			logService.debug(logMessage);
		}
		return result;
	} catch {
		return undefined;
	}
}

export async function makeSearchGraphQLRequest(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	searchQuery: string,
	first: number = 20,
): Promise<PullRequestSearchItem[]> {
	const query = `
		query FetchCopilotAgentPullRequests($searchQuery: String!, $first: Int!, $after: String) {
			search(query: $searchQuery, type: ISSUE, first: $first, after: $after) {
				nodes {
					... on PullRequest {
						number
						id
						fullDatabaseId
						headRefOid
						baseRefOid
						title
						state
						isDraft
						url
						createdAt
						updatedAt
						additions
						deletions
						headRefName
						baseRefName
						files {
							totalCount
						}
						author {
							login
						}
						repository {
							owner {
								login
							}
							name
						}
						body
					}
				}
				pageInfo {
					hasNextPage
					endCursor
				}
				issueCount
			}
		}
	`;

	logService.debug(`[FolderRepositoryManager+0] Fetch pull request category ${searchQuery}`);

	const variables = {
		searchQuery,
		first
	};

	// TODO: Handle rate limiting
	//       result.errors[0]
	//         {type: 'RATE_LIMIT', code: 'graphql_rate_limit', message: 'API rate limit already exceeded for user ID xxxxxxx.'}

	const result = await makeGitHubGraphQLRequest(fetcherService, logService, telemetry, host, query, token, variables, 'github-graphql-search-prs');

	const nodes = result?.data?.search?.nodes ?? [];
	logService.debug(`[GitHubAPI] FetchCopilotAgentPullRequests: host=${host}, searchQuery=${searchQuery}, resultCount=${nodes.length}, errors=${JSON.stringify(result?.errors)}`);
	return nodes;
}

export async function getPullRequestFromGlobalId(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	globalId: string,
): Promise<PullRequestSearchItem | null> {
	const query = `
		query GetPullRequestGlobal($globalId: ID!) {
			node(id: $globalId) {
				... on PullRequest {
					number
					id
					fullDatabaseId
					headRefOid
					baseRefOid
					title
					state
					isDraft
					url
					createdAt
					updatedAt
					additions
					deletions
					headRefName
					baseRefName
					files {
						totalCount
					}
					author {
						login
					}
					repository {
						owner {
							login
						}
						name
					}
					body
				}
			}
		}
	`;

	logService.debug(`[GitHubAPI] Fetch pull request by global ID ${globalId}`);

	const variables = {
		globalId,
	};

	const result = await makeGitHubGraphQLRequest(fetcherService, logService, telemetry, host, query, token, variables, 'github-graphql-get-pr-by-id');

	const node = result?.data?.node;
	logService.debug(`[GitHubAPI] GetPullRequestGlobal: host=${host}, globalId=${globalId}, found=${!!node}, prNumber=${node?.number}, errors=${JSON.stringify(result?.errors)}`);

	if (!node) {
		const properties: { errorCode?: string; requestFailed: string } = {
			requestFailed: String(result === undefined),
		};
		const errorCode = getErrorCode(result?.errors?.[0]);
		if (errorCode) {
			properties.errorCode = errorCode;
		}
		/* __GDPR__
			"pr.getPullRequestFromGlobalIdFailed" : {
				"errorCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" },
				"requestFailed": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
			}
		*/
		telemetry.sendMSFTTelemetryErrorEvent('pr.getPullRequestFromGlobalIdFailed', properties);
	}

	return node;
}

export async function addPullRequestCommentGraphQLRequest(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	pullRequestId: string,
	commentBody: string,
): Promise<PullRequestComment | null> {
	const mutation = `
		mutation AddPullRequestComment($pullRequestId: ID!, $body: String!) {
			addComment(input: {subjectId: $pullRequestId, body: $body}) {
				commentEdge {
					node {
						id
						body
						createdAt
						author {
							login
						}
						url
					}
				}
			}
		}
	`;

	logService.debug(`[GitHubAPI] Adding comment to pull request ${pullRequestId}`);

	const variables = {
		pullRequestId,
		body: commentBody
	};

	const result = await makeGitHubGraphQLRequest(fetcherService, logService, telemetry, host, mutation, token, variables, 'github-graphql-add-pr-comment');

	return result?.data?.addComment?.commentEdge?.node || null;
}

export async function closePullRequest(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	owner: string,
	repo: string,
	pullNumber: number,
): Promise<boolean> {
	logService.debug(`[GitHubAPI] Closing pull request ${owner}/${repo}#${pullNumber}`);

	const result = await makeGitHubAPIRequest(
		fetcherService,
		logService,
		telemetry,
		host,
		`repos/${owner}/${repo}/pulls/${pullNumber}`,
		'POST',
		token,
		{ body: { state: 'closed' }, version: '2022-11-28', callSite: 'github-rest-close-pr' }
	);

	const success = result?.state === 'closed';
	if (success) {
		logService.debug(`[GitHubAPI] Successfully closed pull request ${owner}/${repo}#${pullNumber}`);
	} else {
		logService.error(`[GitHubAPI] Failed to close pull request ${owner}/${repo}#${pullNumber}. Its state is ${result?.state}`);
	}
	return success;
}

export async function makeGitHubAPIRequestWithPagination(
	fetcherService: IFetcherService,
	logService: ILogService,
	host: string,
	path: string,
	nwo: string,
	token: string,
): Promise<SessionInfo[]> {
	let hasNextPage = false;
	const sessionInfos: SessionInfo[] = [];
	const page_size = 20;
	let page = 1;
	do {
		const response = await fetcherService.fetch(
			`${host}/${path}?page_size=${page_size}&page_number=${page}&resource_state=draft,open&repo_nwo=${nwo}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/json',
				},
				callSite: 'github-api-sessions',
			});
		if (!response.ok) {
			logService.error(`[GitHubAPI] Failed to fetch sessions: ${response.status} ${response.statusText}`);
			return sessionInfos;
		}
		const sessions = await response.json();
		sessionInfos.push(...sessions.sessions);
		hasNextPage = sessions.sessions.length === page_size;
		page++;
	} while (hasNextPage);

	return sessionInfos;
}

/**
 * Fetches assignable actors (users/bots) for a repository using suggestedActors API.
 * This is the preferred API as it filters by capability (CAN_BE_ASSIGNED).
 */
export async function getAssignableActorsWithSuggestedActors(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	owner: string,
	repo: string,
): Promise<AssignableActor[]> {
	const query = `
		query GetSuggestedActors($owner: String!, $name: String!, $first: Int!, $after: String) {
			repository(owner: $owner, name: $name) {
				suggestedActors(
					first: $first
					after: $after
					capabilities: [CAN_BE_ASSIGNED]
				) {
					nodes {
						__typename
						login
						avatarUrl
						url
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		}
	`;

	const actors: AssignableActor[] = [];
	let after: string | null = null;
	let hasNextPage = true;

	while (hasNextPage) {
		const variables = {
			owner,
			name: repo,
			first: 100,
			after,
		};

		const result = await makeGitHubGraphQLRequest(fetcherService, logService, telemetry, host, query, token, variables, 'github-graphql-suggested-actors');

		if (!result?.data?.repository?.suggestedActors) {
			break;
		}

		const data = result.data.repository.suggestedActors;
		actors.push(...data.nodes);
		hasNextPage = data.pageInfo.hasNextPage;
		after = data.pageInfo.endCursor;
	}

	return actors;
}

/**
 * Fetches assignable users for a repository using assignableUsers API.
 * This is a fallback for older GitHub Enterprise Server instances that don't support suggestedActors.
 */
export async function getAssignableActorsWithAssignableUsers(
	fetcherService: IFetcherService,
	logService: ILogService,
	telemetry: ITelemetryService,
	host: string,
	token: string | undefined,
	owner: string,
	repo: string,
): Promise<AssignableActor[]> {
	const query = `
		query GetAssignableUsers($owner: String!, $name: String!, $first: Int!, $after: String) {
			repository(owner: $owner, name: $name) {
				assignableUsers(first: $first, after: $after) {
					nodes {
						__typename
						login
						avatarUrl
						url
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		}
	`;

	const actors: AssignableActor[] = [];
	let after: string | null = null;
	let hasNextPage = true;

	while (hasNextPage) {
		const variables = {
			owner,
			name: repo,
			first: 100,
			after,
		};

		const result = await makeGitHubGraphQLRequest(fetcherService, logService, telemetry, host, query, token, variables, 'github-graphql-assignable-users');

		if (!result?.data?.repository?.assignableUsers) {
			break;
		}

		const data = result.data.repository.assignableUsers;
		actors.push(...data.nodes);
		hasNextPage = data.pageInfo.hasNextPage;
		after = data.pageInfo.endCursor;
	}

	return actors;
}
