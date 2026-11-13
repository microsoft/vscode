/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Internal GitHub clients for allowlisted built-in extensions, provided by the extension host. */
declare module '@vscode/internal-github' {
	import type * as vscode from 'vscode';

	export function getClient(sessionId: string, token?: vscode.CancellationToken): Thenable<GitHubClient>;

	export function getAnonymousClient(token?: vscode.CancellationToken): Thenable<GitHubAnonymousClient>;

	export interface GitHubAnonymousClient extends vscode.Disposable {
		readonly gists: GitHubGistReader;
	}

	export interface GitHubClient extends vscode.Disposable {
		readonly onDidInvalidate: vscode.Event<void>;
		readonly gists: GitHubGists;
		readonly repositories: GitHubRepositories;
		readonly users: {
			getAuthenticated(token?: vscode.CancellationToken): Thenable<{ readonly login: string }>
		};
		readonly search: {
			repositories(query: string, token?: vscode.CancellationToken): Thenable<readonly GitHubRepositorySearchItem[]>;
		};
		readonly pullRequests: {
			list(repository: GitHubRepositoryRef, options: { readonly head?: string; readonly state?: 'open' | 'closed' | 'all' }, token?: vscode.CancellationToken): Thenable<readonly GitHubPullRequest[]>;
			create(repository: GitHubRepositoryRef, request: GitHubCreatePullRequest, token?: vscode.CancellationToken): Thenable<GitHubPullRequest>;
		};
	}

	export interface GitHubRepositoryRef {
		readonly owner: string;
		readonly repo: string;
	}

	export interface GitHubRepository {
		readonly full_name: string;
		readonly description: string | null;
		readonly stargazers_count: number;
		readonly clone_url: string;
		readonly ssh_url: string;
		readonly html_url: string;
		readonly default_branch: string;
		readonly owner: { readonly login: string };
	}

	export type GitHubRepositorySearchItem = Pick<GitHubRepository, 'full_name' | 'description' | 'stargazers_count' | 'clone_url' | 'ssh_url'>;

	export interface GitHubPageOptions {
		readonly page?: number;
		readonly per_page?: number;
	}

	export interface GitHubCursorOptions {
		readonly after?: string;
		readonly maxPages?: number;
	}

	export interface GitHubConnection<T> {
		readonly nodes: readonly (T | null)[] | null;
		readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
	}

	export interface GitHubRepositoryViewerInfo {
		readonly defaultBranchRef: { readonly name: string } | null;
		readonly viewerPermission: 'ADMIN' | 'MAINTAIN' | 'WRITE' | 'TRIAGE' | 'READ' | null;
	}

	export interface GitHubRepositoryRuleset {
		readonly name: string;
		readonly target: string | null;
		readonly enforcement: string;
		readonly rules: { readonly totalCount: number } | null;
		readonly conditions: {
			readonly refName: {
				readonly include: readonly string[];
				readonly exclude: readonly string[];
			} | null;
		} | null;
	}

	export interface GitHubAssignableUser {
		readonly id: string;
		readonly login: string;
		readonly name: string | null;
		readonly email: string;
		readonly avatarUrl: string;
	}

	export interface GitHubCommitAuthor {
		readonly name: string | null;
		readonly email: string | null;
		readonly avatarUrl: string;
		readonly user: {
			readonly id: string;
			readonly login: string;
		} | null;
	}

	export interface GitHubRepositories {
		get(repository: GitHubRepositoryRef, token?: vscode.CancellationToken): Thenable<GitHubRepository>;
		listForAuthenticatedUser(options?: GitHubPageOptions & { readonly sort?: 'created' | 'updated' | 'pushed' | 'full_name' }, token?: vscode.CancellationToken): Thenable<readonly GitHubRepository[]>;
		listBranches(repository: GitHubRepositoryRef, options?: GitHubPageOptions, token?: vscode.CancellationToken): Thenable<readonly { readonly name: string }[]>;
		create(request: { readonly name: string; readonly private?: boolean }, token?: vscode.CancellationToken): Thenable<GitHubRepository>;
		fork(repository: GitHubRepositoryRef, token?: vscode.CancellationToken): Thenable<GitHubRepository>;
		getViewerInfo(repository: GitHubRepositoryRef, token?: vscode.CancellationToken): Thenable<GitHubRepositoryViewerInfo | null>;
		listRulesetConnection(repository: GitHubRepositoryRef, options?: GitHubCursorOptions, token?: vscode.CancellationToken): Thenable<GitHubConnection<GitHubRepositoryRuleset> | null>;
		listAssignableUsers(repository: GitHubRepositoryRef, token?: vscode.CancellationToken): Thenable<GitHubConnection<GitHubAssignableUser> | null>;
		getCommitAuthor(repository: GitHubRepositoryRef, ref: string, token?: vscode.CancellationToken): Thenable<GitHubCommitAuthor | null>;
	}

	export interface GitHubPullRequest {
		readonly number: number;
		readonly html_url: string;
	}

	export interface GitHubCreatePullRequest {
		readonly title: string;
		readonly body?: string;
		readonly head: string;
		readonly base: string;
	}

	export interface GitHubGistReader {
		get(gistId: string, token?: vscode.CancellationToken): Thenable<GitHubGist>;
	}

	export interface GitHubGists extends GitHubGistReader {
		create(gist: GitHubGistCreateOptions, token?: vscode.CancellationToken): Thenable<GitHubGist>;
	}

	export interface GitHubGistCreateOptions {
		readonly public?: boolean;
		readonly files: { readonly [fileName: string]: { readonly content: string } };
	}

	export interface GitHubGist {
		readonly id: string;
		readonly htmlUrl: vscode.Uri;
		readonly files: readonly GitHubGistFile[];
	}

	export interface GitHubGistFile {
		readonly content: string;
		readonly isBinary: boolean;
		readonly truncated: boolean;
	}

	export type GitHubErrorCode = 'authentication' | 'authorization' | 'notFound' | 'validation' | 'rateLimit' | 'network' | 'timeout' | 'server' | 'invalidResponse' | 'disposed' | 'unknown';

	export class GitHubError extends Error {
		readonly code: GitHubErrorCode;
		readonly status: number | undefined;
		constructor(message: string, code: GitHubErrorCode, status?: number);
	}
}
