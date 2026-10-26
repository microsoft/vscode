/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../../base/common/types.js';
import { ChangedFile } from '../../../../../platform/github/common/core/core.js';
import { IssueComment } from '../../../../../platform/github/common/core/issues.js';
import { ReviewComment } from '../../../../../platform/github/common/core/reviews.js';
import { IGitHubPullRequestContext, IGitHubPullRequestContextComment } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubPullRequestContextFetcher {
	constructor(private readonly _client: GitHubApiClient) { }

	getPullRequestContext(owner: string, repo: string, number: number): Promise<IGitHubPullRequestContext> {
		return this._client.withClient(async (client, signal) => {
			const repository = { owner, repo };
			const [pullRequest, files, issueComments, reviewComments] = await Promise.all([
				client.pullRequests.get(repository, number, signal),
				client.pullRequests.listFiles(repository, number, signal, { query: { page: 1, per_page: 100 }, maxPages: 100 }),
				client.issues.listComments(repository, number, signal, { query: { page: 1, per_page: 100 }, maxPages: 100 }),
				client.reviews.listComments(repository, number, signal, { query: { page: 1, per_page: 100 }, maxPages: 100 }),
			]);
			return {
				owner,
				repo,
				number: pullRequest.number,
				url: pullRequest.html_url,
				title: pullRequest.title,
				description: pullRequest.body ?? '',
				author: pullRequest.user?.login ?? 'ghost',
				isDraft: pullRequest.draft ?? false,
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
		});
	}
}

function createPatch(files: readonly ChangedFile[]): string {
	return files.map(file => [
		`diff --git a/${file.filename} b/${file.filename}`,
		file.patch ?? `[Patch unavailable: ${file.status}, +${file.additions} -${file.deletions}]`,
	].join('\n')).join('\n\n');
}

function mapComment(kind: 'issue' | 'review', comment: IssueComment | ReviewComment): IGitHubPullRequestContextComment {
	return {
		kind,
		author: comment.user?.login ?? 'ghost',
		body: comment.body ?? '',
		createdAt: comment.created_at,
		updatedAt: comment.updated_at,
		...(hasKey(comment, {
			path: true
		}) ? {
			path: comment.path,
			line: comment.line ?? comment.original_line ?? undefined
		} : {}),
	};
}
