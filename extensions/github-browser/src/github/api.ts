/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authentication, AuthenticationSession, Disposable, Event, EventEmitter, Range, Uri } from 'vscode';
import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';
import { fromGitHubUri } from './fs';
import { Iterables } from '../iterables';
import { ContextStore } from '../stores';

export const shaRegex = /^[0-9a-f]{40}$/;

export interface GitHubApiContext {
	sha: string;
	timestamp: number;
}

function getRootUri(uri: Uri) {
	const rootIndex = uri.path.indexOf('/', uri.path.indexOf('/', 1) + 1);
	return uri.with({
		path: uri.path.substring(0, rootIndex === -1 ? undefined : rootIndex),
		query: ''
	});
}

export class GitHubApi implements Disposable {
	private _onDidChangeContext = new EventEmitter<Uri>();
	get onDidChangeContext(): Event<Uri> {
		return this._onDidChangeContext.event;
	}

	private readonly disposable: Disposable;

	constructor(private readonly context: ContextStore<GitHubApiContext>) {
		this.disposable = Disposable.from(
			context.onDidChange(e => this._onDidChangeContext.fire(e))
		);
	}

	dispose() {
		this.disposable.dispose();
	}

	private _session: AuthenticationSession | undefined;
	async ensureAuthenticated() {
		if (this._session === undefined) {
			const providers = await authentication.getProviderIds();
			if (!providers.includes('github')) {
				await new Promise(resolve => {
					authentication.onDidChangeAuthenticationProviders(e => {
						if (e.added.includes('github')) {
							resolve();
						}
					});
				});
			}

			this._session = await authentication.getSession('github', ['repo'], { createIfNone: true });
		}

		return this._session;
	}

	private _graphql: typeof graphql | undefined;
	private async graphql() {
		if (this._graphql === undefined) {
			const session = await this.ensureAuthenticated();
			this._graphql = graphql.defaults({
				headers: {
					Authorization: `Bearer ${session.accessToken}`,
				}
			});
		}

		return this._graphql;
	}

	private _octokit: typeof Octokit | undefined;
	private async octokit(options?: ConstructorParameters<typeof Octokit>[0]) {
		if (this._octokit === undefined) {
			const session = await this.ensureAuthenticated();
			this._octokit = Octokit.defaults({ auth: `token ${session.accessToken}` });
		}
		return new this._octokit(options);
	}

	async commit(rootUri: Uri, message: string, files: { path: string; content: string }[]): Promise<string | undefined> {
		let { owner, repo, ref } = fromGitHubUri(rootUri);

		try {
			if (ref === undefined || ref === 'HEAD') {
				ref = await this.defaultBranchQuery(rootUri);
				if (ref === undefined) {
					throw new Error('Cannot commit — invalid ref');
				}
			}

			const context = await this.getContext(rootUri);
			if (context.sha === undefined) {
				throw new Error('Cannot commit — invalid context');
			}

			const github = await this.octokit();
			const treeResp = await github.git.getTree({
				owner: owner,
				repo: repo,
				tree_sha: context.sha
			});

			const updatedTreeItems: {
				path: string;
				mode?: '100644' | '100755' | '040000' | '160000' | '120000',
				type?: 'blob' | 'tree' | 'commit',
				sha?: string | undefined;
				content: string;
			}[] = [];

			for (const file of files) {
				for (const { path, mode, type } of treeResp.data.tree) {
					if (path === file.path) {
						updatedTreeItems.push({ path: path, mode: mode as any, type: type as any, content: file.content });
					}
				}
			}

			const updatedTreeResp = await github.git.createTree({
				owner: owner,
				repo: repo,
				base_tree: treeResp.data.sha,
				tree: updatedTreeItems
			});

			const resp = await github.git.createCommit({
				owner: owner,
				repo: repo,
				message: message,
				tree: updatedTreeResp.data.sha,
				parents: [context.sha]
			});

			this.updateContext(rootUri, { sha: resp.data.sha, timestamp: Date.now() });

			// TODO@eamodio need to send a file change for any open files

			await github.git.updateRef({
				owner: owner,
				repo: repo,
				ref: `heads/${ref}`,
				sha: resp.data.sha
			});

			return resp.data.sha;
		} catch (ex) {
			console.log(ex);
			throw ex;
		}
	}

	async defaultBranchQuery(uri: Uri) {
		const { owner, repo } = fromGitHubUri(uri);

		try {
			const query = `query defaultBranch($owner: String!, $repo: String!) {
	repository(owner: $owner, name: $repo) {
		defaultBranchRef {
			name
		}
	}
}`;

			const rsp = await this.gqlQuery<{
				repository: { defaultBranchRef: { name: string; target: { oid: string } } | null | undefined };
			}>(query, {
				owner: owner,
				repo: repo,
			});
			return rsp?.repository?.defaultBranchRef?.name ?? undefined;
		} catch (ex) {
			return undefined;
		}
	}

	async filesQuery(uri: Uri) {
		const { owner, repo, ref } = fromGitHubUri(uri);

		try {
			const context = await this.getContext(uri);

			const resp = await (await this.octokit()).git.getTree({
				owner: owner,
				repo: repo,
				recursive: '1',
				tree_sha: context?.sha ?? ref ?? 'HEAD',
			});
			return Iterables.filterMap(resp.data.tree, p => p.type === 'blob' ? p.path : undefined);
		} catch (ex) {
			return [];
		}
	}

	async fsQuery<T>(uri: Uri, innerQuery: string): Promise<T | undefined> {
		const { owner, repo, path, ref } = fromGitHubUri(uri);

		try {
			const context = await this.getContext(uri);

			const query = `query fs($owner: String!, $repo: String!, $path: String) {
	repository(owner: $owner, name: $repo) {
		object(expression: $path) {
			${innerQuery}
		}
	}
}`;

			const rsp = await this.gqlQuery<{
				repository: { object: T | null | undefined };
			}>(query, {
				owner: owner,
				repo: repo,
				path: `${context.sha ?? ref ?? 'HEAD'}:${path}`,
			});
			return rsp?.repository?.object ?? undefined;
		} catch (ex) {
			return undefined;
		}
	}

	async latestCommitQuery(uri: Uri) {
		const { owner, repo, ref } = fromGitHubUri(uri);

		try {
			if (ref === undefined || ref === 'HEAD') {
				const query = `query latest($owner: String!, $repo: String!) {
	repository(owner: $owner, name: $repo) {
		defaultBranchRef {
			target {
				oid
			}
		}
	}
}`;

				const rsp = await this.gqlQuery<{
					repository: { defaultBranchRef: { name: string; target: { oid: string } } | null | undefined };
				}>(query, {
					owner: owner,
					repo: repo,
				});
				return rsp?.repository?.defaultBranchRef?.target.oid ?? undefined;
			}

			const query = `query latest($owner: String!, $repo: String!, $ref: String!) {
	repository(owner: $owner, name: $repo) {
		ref(qualifiedName: $ref) {
			target {
				oid
			}
		}
}`;

			const rsp = await this.gqlQuery<{
				repository: { ref: { target: { oid: string } } | null | undefined };
			}>(query, {
				owner: owner,
				repo: repo,
				ref: ref ?? 'HEAD',
			});
			return rsp?.repository?.ref?.target.oid ?? undefined;
		} catch (ex) {
			return undefined;
		}
	}

	async searchQuery(
		query: string,
		uri: Uri,
		options: { maxResults?: number; context?: { before?: number; after?: number } },
	): Promise<SearchQueryResults> {
		const { owner, repo, ref } = fromGitHubUri(uri);

		// If we have a specific ref, don't try to search, because GitHub search only works against the default branch
		if (ref === undefined) {
			return { matches: [], limitHit: true };
		}

		try {
			const resp = await (await this.octokit({
				request: {
					headers: {
						accept: 'application/vnd.github.v3.text-match+json',
					},
				}
			})).search.code({
				q: `${query} repo:${owner}/${repo}`,
			});

			// Since GitHub doesn't return ANY line numbers just fake it at the top of the file 😢
			const range = new Range(0, 0, 0, 0);

			const matches: SearchQueryMatch[] = [];

			let counter = 0;
			let match: SearchQueryMatch;
			for (const item of resp.data.items) {
				for (const m of (item as typeof item & { text_matches: GitHubSearchTextMatch[] }).text_matches) {
					counter++;
					if (options.maxResults !== undefined && counter > options.maxResults) {
						return { matches: matches, limitHit: true };
					}

					match = {
						path: item.path,
						ranges: [],
						preview: m.fragment,
						matches: [],
					};

					for (const lm of m.matches) {
						let line = 0;
						let shartChar = 0;
						let endChar = 0;
						for (let i = 0; i < lm.indices[1]; i++) {
							if (i === lm.indices[0]) {
								shartChar = endChar;
							}

							if (m.fragment[i] === '\n') {
								line++;
								endChar = 0;
							} else {
								endChar++;
							}
						}

						match.ranges.push(range);
						match.matches.push(new Range(line, shartChar, line, endChar));
					}

					matches.push(match);
				}
			}

			return { matches: matches, limitHit: false };
		} catch (ex) {
			return { matches: [], limitHit: true };
		}
	}

	private async gqlQuery<T>(query: string, variables: { [key: string]: string | number }): Promise<T | undefined> {
		return (await this.graphql())<T>(query, variables);
	}

	private readonly pendingContextRequests = new Map<string, Promise<GitHubApiContext>>();
	async getContext(uri: Uri): Promise<GitHubApiContext> {
		const rootUri = getRootUri(uri);

		let pending = this.pendingContextRequests.get(rootUri.toString());
		if (pending === undefined) {
			pending = this.getContextCore(rootUri);
			this.pendingContextRequests.set(rootUri.toString(), pending);
		}

		try {
			return await pending;
		} finally {
			this.pendingContextRequests.delete(rootUri.toString());
		}
	}

	private readonly rootUriToContextMap = new Map<string, GitHubApiContext>();

	private async getContextCore(rootUri: Uri): Promise<GitHubApiContext> {
		let context = this.rootUriToContextMap.get(rootUri.toString());
		if (context === undefined) {
			const { ref } = fromGitHubUri(rootUri);
			if (ref !== undefined && shaRegex.test(ref)) {
				context = { sha: ref, timestamp: Date.now() };
			} else {
				context = this.context.get(rootUri);
				if (context?.sha === undefined) {
					const sha = await this.latestCommitQuery(rootUri);
					if (sha !== undefined) {
						context = { sha: sha, timestamp: Date.now() };
					} else {
						context = undefined;
					}
				}
			}

			if (context !== undefined) {
				this.updateContext(rootUri, context);
			}
		}

		return context ?? { sha: rootUri.authority, timestamp: Date.now() };
	}

	private updateContext(rootUri: Uri, context: GitHubApiContext) {
		this.rootUriToContextMap.set(rootUri.toString(), context);
		this.context.set(rootUri, context);
	}
}

interface GitHubSearchTextMatch {
	object_url: string;
	object_type: string;
	property: string;
	fragment: string;
	matches: {
		text: string;
		indices: number[];
	}[];
}

interface SearchQueryMatch {
	path: string;
	ranges: Range[];
	preview: string;
	matches: Range[];
}

interface SearchQueryResults {
	matches: SearchQueryMatch[];
	limitHit: boolean;
}
