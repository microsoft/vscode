/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubPullRequestContext, IGitHubPullRequestContextComment } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

interface IGitHubPullRequestContextResponse {
	readonly number: number;
	readonly html_url: string;
	readonly title: string;
	readonly body: string | null;
	readonly user: { readonly login: string };
	readonly draft: boolean;
	readonly base: { readonly ref: string };
	readonly head: { readonly ref: string };
	readonly updated_at: string;
}

interface IGitHubPullRequestFileResponse {
	readonly filename: string;
	readonly status: string;
	readonly additions: number;
	readonly deletions: number;
	readonly patch?: string;
}

interface IGitHubIssueCommentResponse {
	readonly body: string;
	readonly user: { readonly login: string };
	readonly created_at: string;
	readonly updated_at: string;
}

interface IGitHubReviewCommentResponse extends IGitHubIssueCommentResponse {
	readonly path: string;
	readonly line: number | null;
	readonly original_line: number | null;
}

export class GitHubPullRequestContextFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getPullRequestContext(owner: string, repo: string, number: number): Promise<IGitHubPullRequestContext> {
		const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
		const [pullRequestResponse, files, issueComments, reviewComments] = await Promise.all([
			this._apiClient.request<IGitHubPullRequestContextResponse>('GET', `${root}/pulls/${number}`, 'githubApi.getPullRequestContext'),
			this._getAll<IGitHubPullRequestFileResponse>(`${root}/pulls/${number}/files`, 'githubApi.getPullRequestContextFiles'),
			this._getAll<IGitHubIssueCommentResponse>(`${root}/issues/${number}/comments`, 'githubApi.getPullRequestContextIssueComments'),
			this._getAll<IGitHubReviewCommentResponse>(`${root}/pulls/${number}/comments`, 'githubApi.getPullRequestContextReviewComments'),
		]);
		const pullRequest = pullRequestResponse.data;
		if (!pullRequest) {
			throw new Error(`GitHub pull request not found: ${owner}/${repo}#${number}`);
		}

		return {
			owner,
			repo,
			number: pullRequest.number,
			url: pullRequest.html_url,
			title: pullRequest.title,
			description: pullRequest.body ?? '',
			author: pullRequest.user.login,
			isDraft: pullRequest.draft,
			baseRef: pullRequest.base.ref,
			branchName: pullRequest.head.ref,
			headRef: pullRequest.head.ref,
			updatedAt: pullRequest.updated_at,
			patch: createPatch(files),
			comments: [
				...issueComments.map(comment => mapComment('issue', comment)),
				...reviewComments.map(comment => mapComment('review', comment)),
			].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.updatedAt.localeCompare(b.updatedAt)),
		};
	}

	private async _getAll<T>(path: string, callSite: string): Promise<readonly T[]> {
		const result: T[] = [];
		for (let page = 1; ; page++) {
			const response = await this._apiClient.request<readonly T[]>('GET', `${path}?per_page=100&page=${page}`, callSite);
			const items = response.data ?? [];
			result.push(...items);
			if (items.length < 100) {
				return result;
			}
		}
	}
}

function createPatch(files: readonly IGitHubPullRequestFileResponse[]): string {
	return files.map(file => [
		`diff --git a/${file.filename} b/${file.filename}`,
		file.patch ?? `[Patch unavailable: ${file.status}, +${file.additions} -${file.deletions}]`,
	].join('\n')).join('\n\n');
}

function mapComment(kind: 'issue' | 'review', comment: IGitHubIssueCommentResponse | IGitHubReviewCommentResponse): IGitHubPullRequestContextComment {
	const reviewComment = kind === 'review' ? comment as IGitHubReviewCommentResponse : undefined;
	return {
		kind,
		author: comment.user.login,
		body: comment.body,
		createdAt: comment.created_at,
		updatedAt: comment.updated_at,
		...(reviewComment ? {
			path: reviewComment.path,
			line: reviewComment.line ?? reviewComment.original_line ?? undefined,
		} : {}),
	};
}
