/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { GitHubApiClient } from '../githubApiClient.js';

export interface IGitHubRecentIssue {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
}

export interface IGitHubRecentPullRequest {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
	readonly hasMergeConflicts: boolean;
	readonly statusCheckRollupState: string | undefined;
	readonly latestCommitAt: string | undefined;
	readonly reviewThreads?: readonly IGitHubRecentPullRequestReviewThread[];
}

export interface IGitHubRecentPullRequestReviewThread {
	readonly isResolved: boolean;
	readonly latestCommentAt: string | undefined;
}

export interface IGitHubRecentUserWork {
	readonly issues: readonly IGitHubRecentIssue[];
	readonly pullRequests: readonly IGitHubRecentPullRequest[];
}

interface IGitHubRecentIssuesResponse {
	readonly search: {
		readonly nodes: readonly ({
			readonly __typename: 'Issue';
			readonly number: number;
			readonly title: string;
			readonly url: string;
			readonly updatedAt: string;
		} | null)[] | null;
	};
}

interface IGitHubIssueLinkageResponse {
	readonly repository: Record<string, {
		readonly closedByPullRequestsReferences: { readonly totalCount: number } | null;
	} | null> | null;
}

interface IGitHubRecentPullRequestsResponse {
	readonly search: {
		readonly nodes: readonly ({
			readonly __typename: 'PullRequest';
			readonly number: number;
			readonly title: string;
			readonly url: string;
			readonly updatedAt: string;
			readonly mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
			readonly commits: {
				readonly nodes: readonly ({
					readonly commit: {
						readonly committedDate: string;
						readonly statusCheckRollup: { readonly state: string } | null;
					};
				} | null)[] | null;
			};
		} | null)[] | null;
	};
}

interface IGitHubPullRequestReviewThreadsResponse {
	readonly repository: {
		readonly pullRequest: {
			readonly reviewThreads: {
				readonly nodes: readonly ({
					readonly isResolved: boolean;
					readonly comments: {
						readonly nodes: readonly ({
							readonly createdAt: string;
						} | null)[] | null;
					};
				} | null)[] | null;
			};
		} | null;
	} | null;
}

const RECENT_ISSUES_QUERY = `
	query RecentAssignedIssues($query: String!) {
		search(query: $query, type: ISSUE, first: 5) {
			nodes {
				... on Issue {
					__typename
					number
					title
					url
					updatedAt
				}
			}
		}
	}
`;

const RECENT_PULL_REQUESTS_QUERY = `
	query RecentAuthoredPullRequests($query: String!) {
		search(query: $query, type: ISSUE, first: 5) {
			nodes {
				... on PullRequest {
					__typename
					number
					title
					url
					updatedAt
					mergeable
					commits(last: 1) {
						nodes {
							commit {
								committedDate
								statusCheckRollup {
									state
								}
							}
						}
					}
				}
			}
		}
	}
`;

const PULL_REQUEST_REVIEW_THREADS_QUERY = `
	query PullRequestReviewThreads($owner: String!, $repo: String!, $pullRequestNumber: Int!) {
		repository(owner: $owner, name: $repo) {
			pullRequest(number: $pullRequestNumber) {
				reviewThreads(first: 100) {
					nodes {
						isResolved
						comments(last: 1) {
							nodes {
								createdAt
							}
						}
					}
				}
			}
		}
	}
`;

export class GitHubRecentUserWorkFetcher {
	constructor(private readonly _apiClient: GitHubApiClient) { }

	async getRecentAssignedIssues(owner: string, repo: string, token: CancellationToken): Promise<readonly IGitHubRecentIssue[]> {
		const data = await this._apiClient.graphql<IGitHubRecentIssuesResponse>(
			RECENT_ISSUES_QUERY,
			'githubApi.getRecentAssignedIssues',
			{ query: `repo:${owner}/${repo} is:issue is:open assignee:@me sort:updated-desc` },
			{ token, createAuthenticationSession: false },
		);

		return (data.search.nodes ?? [])
			.filter(isDefined)
			.map(issue => ({ number: issue.number, title: issue.title, url: issue.url, updatedAt: issue.updatedAt }));
	}

	async getRecentAuthoredPullRequests(owner: string, repo: string, token: CancellationToken): Promise<readonly IGitHubRecentPullRequest[]> {
		const data = await this._apiClient.graphql<IGitHubRecentPullRequestsResponse>(
			RECENT_PULL_REQUESTS_QUERY,
			'githubApi.getRecentAuthoredPullRequests',
			{ query: `repo:${owner}/${repo} is:pr is:open author:@me sort:updated-desc` },
			{ token, createAuthenticationSession: false },
		);

		return (data.search.nodes ?? [])
			.filter(isDefined)
			.map(pullRequest => {
				const latestCommit = pullRequest.commits.nodes?.find(isDefined)?.commit;
				return {
					number: pullRequest.number,
					title: pullRequest.title,
					url: pullRequest.url,
					updatedAt: pullRequest.updatedAt,
					hasMergeConflicts: pullRequest.mergeable === 'CONFLICTING',
					statusCheckRollupState: latestCommit?.statusCheckRollup?.state,
					latestCommitAt: latestCommit?.committedDate,
				};
			});
	}

	async getPullRequestReviewThreads(owner: string, repo: string, pullRequestNumber: number, token: CancellationToken): Promise<readonly IGitHubRecentPullRequestReviewThread[]> {
		const data = await this._apiClient.graphql<IGitHubPullRequestReviewThreadsResponse>(
			PULL_REQUEST_REVIEW_THREADS_QUERY,
			'githubApi.getPullRequestReviewThreads',
			{ owner, repo, pullRequestNumber },
			{ token, createAuthenticationSession: false },
		);

		return (data.repository?.pullRequest?.reviewThreads.nodes ?? [])
			.filter(isDefined)
			.map(thread => ({
				isResolved: thread.isResolved,
				latestCommentAt: thread.comments.nodes?.find(isDefined)?.createdAt,
			}));
	}

	async getIssuesWithLinkedPullRequests(owner: string, repo: string, issueNumbers: readonly number[], token: CancellationToken): Promise<ReadonlySet<number>> {
		if (issueNumbers.length === 0) {
			return new Set();
		}
		const issueVariables = issueNumbers.map((_, index) => `$issue${index}: Int!`).join(', ');
		const issueSelections = issueNumbers.map((_, index) => `
			issue${index}: issue(number: $issue${index}) {
				closedByPullRequestsReferences(first: 1, includeClosedPrs: true) {
					totalCount
				}
			}
		`).join('');
		const query = `
			query IssueLinkage($owner: String!, $repo: String!, ${issueVariables}) {
				repository(owner: $owner, name: $repo) {
					${issueSelections}
				}
			}
		`;
		const variables: Record<string, string | number> = { owner, repo };
		issueNumbers.forEach((issueNumber, index) => variables[`issue${index}`] = issueNumber);
		const data = await this._apiClient.graphql<IGitHubIssueLinkageResponse>(
			query,
			'githubApi.getIssuesWithLinkedPullRequests',
			variables,
			{ token, createAuthenticationSession: false },
		);

		const linkedIssueNumbers = new Set<number>();
		issueNumbers.forEach((issueNumber, index) => {
			if ((data.repository?.[`issue${index}`]?.closedByPullRequestsReferences?.totalCount ?? 0) > 0) {
				linkedIssueNumbers.add(issueNumber);
			}
		});
		return linkedIssueNumbers;
	}
}

function isDefined<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}
