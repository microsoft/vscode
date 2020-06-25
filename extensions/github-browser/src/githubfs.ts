/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import {
	authentication,
	AuthenticationSession,
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	FileChangeEvent,
	FileSearchOptions,
	FileSearchProvider,
	FileSearchQuery,
	FileStat,
	FileSystemError,
	FileSystemProvider,
	FileType,
	Progress,
	Range,
	TextSearchComplete,
	TextSearchOptions,
	TextSearchProvider,
	TextSearchQuery,
	TextSearchResult,
	Uri,
	workspace,
} from 'vscode';
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql/';
import * as fuzzySort from 'fuzzysort';
import fetch from 'node-fetch';
import { Iterables } from './iterables';

const emptyDisposable = { dispose: () => { /* noop */ } };
const replaceBackslashRegex = /(\/|\\)/g;
const textEncoder = new TextEncoder();

interface Fuzzysort extends Fuzzysort.Fuzzysort {
	prepareSlow(target: string): Fuzzysort.Prepared;
	cleanup(): void;
}

export class GitHubFS implements FileSystemProvider, FileSearchProvider, TextSearchProvider, Disposable {
	static scheme = 'github';

	private _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
	get onDidChangeFile(): Event<FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	private readonly disposable: Disposable;
	private fsCache = new Map<string, any>();

	constructor() {
		this.disposable = Disposable.from(
			workspace.registerFileSystemProvider(GitHubFS.scheme, this, {
				isCaseSensitive: true,
				isReadonly: true,
			}),
			workspace.registerFileSearchProvider(GitHubFS.scheme, this),
			workspace.registerTextSearchProvider(GitHubFS.scheme, this),
		);
	}

	dispose() {
		this.disposable?.dispose();
	}

	private _github: Promise<GitHubApi | undefined> | undefined;
	get github(): Promise<GitHubApi | undefined> {
		if (this._github === undefined) {
			this._github = this.getGitHubApi();
		}
		return this._github;
	}

	private async getGitHubApi(): Promise<GitHubApi | undefined> {
		try {
			const session = await authentication.getSession('github', ['repo'], { createIfNone: true });
			return new GitHubApi(session);
		} catch (ex) {
			this._github = undefined;
			throw ex;
		}
	}

	//#region FileSystemProvider

	watch(): Disposable {
		return emptyDisposable;
	}

	async stat(uri: Uri): Promise<FileStat> {
		if (uri.path === '' || uri.path.lastIndexOf('/') === 0) {
			return { type: FileType.Directory, size: 0, ctime: 0, mtime: 0 };
		}

		const data = await this.fsQuery<{
			__typename: string;
			byteSize: number | undefined;
		}>(
			uri,
			`__typename
			...on Blob {
				byteSize
			}`,
			this.fsCache,
		);

		return {
			type: typenameToFileType(data?.__typename),
			size: data?.byteSize ?? 0,
			ctime: 0,
			mtime: 0,
		};
	}

	async readDirectory(uri: Uri): Promise<[string, FileType][]> {
		const data = await this.fsQuery<{
			entries: { name: string; type: string }[];
		}>(
			uri,
			`... on Tree {
				entries {
					name
					type
				}
			}`,
			this.fsCache,
		);

		return (data?.entries ?? []).map<[string, FileType]>(e => [
			e.name,
			typenameToFileType(e.type),
		]);
	}

	createDirectory(): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	async readFile(uri: Uri): Promise<Uint8Array> {
		const data = await this.fsQuery<{
			oid: string;
			isBinary: boolean;
			text: string;
		}>(
			uri,
			`... on Blob {
				oid,
				isBinary,
				text
			}`,
		);

		if (data?.isBinary) {
			const { owner, repo, path } = fromGitHubUri(uri);
			// e.g. https://raw.githubusercontent.com/eamodio/vscode-gitlens/HEAD/images/gitlens-icon.png
			const downloadUri = uri.with({
				scheme: 'https',
				authority: 'raw.githubusercontent.com',
				path: `/${owner}/${repo}/HEAD/${path}`,
			});

			return downloadBinary(downloadUri);
		}

		return textEncoder.encode(data?.text ?? '');
	}

	writeFile(): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	delete(): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	rename(): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	copy?(): void | Thenable<void> {
		throw FileSystemError.NoPermissions;
	}

	//#endregion

	//#region FileSearchProvider

	private fileSearchCache = new Map<string, Fuzzysort.Prepared[]>();

	async provideFileSearchResults(
		query: FileSearchQuery,
		options: FileSearchOptions,
		token: CancellationToken,
	): Promise<Uri[]> {
		let searchable = this.fileSearchCache.get(options.folder.toString(true));
		if (searchable === undefined) {
			const matches = await (await this.github)?.filesQuery(options.folder);
			if (matches === undefined || token.isCancellationRequested) { return []; }

			searchable = [...Iterables.map(matches, m => (fuzzySort as Fuzzysort).prepareSlow(m))];
			this.fileSearchCache.set(options.folder.toString(true), searchable);
		}

		if (options.maxResults === undefined || options.maxResults === 0 || options.maxResults >= searchable.length) {
			const results = searchable.map(m => Uri.joinPath(options.folder, m.target));
			return results;
		}

		const results = fuzzySort
			.go(query.pattern.replace(replaceBackslashRegex, '/'), searchable, {
				allowTypo: true,
				limit: options.maxResults,
			})
			.map(m => Uri.joinPath(options.folder, m.target));

		(fuzzySort as Fuzzysort).cleanup();

		return results;
	}

	//#endregion

	//#region TextSearchProvider

	async provideTextSearchResults(
		query: TextSearchQuery,
		options: TextSearchOptions,
		progress: Progress<TextSearchResult>,
		token: CancellationToken,
	): Promise<TextSearchComplete> {
		const results = await (await this.github)?.searchQuery(
			query.pattern,
			options.folder,
			{ maxResults: options.maxResults, context: { before: options.beforeContext, after: options.afterContext } },
			token,
		);
		if (results === undefined) { return { limitHit: true }; }

		let uri;
		for (const m of results.matches) {
			uri = Uri.joinPath(options.folder, m.path);

			progress.report({
				uri: uri,
				ranges: m.ranges,
				preview: {
					text: m.preview,
					matches: m.matches,
				},
			});
		}

		return { limitHit: false };
	}

	//#endregion

	private async fsQuery<T>(uri: Uri, query: string, cache?: Map<string, any>): Promise<T | undefined> {
		const key = `${uri.toString()}:${getHashCode(query)}`;

		let data = cache?.get(key);
		if (data !== undefined) { return data as T; }

		data = await (await this.github)?.fsQuery<T>(uri, query);
		cache?.set(key, data);
		return data;
	}
}

async function downloadBinary(uri: Uri) {
	const resp = await fetch(uri.toString());
	const array = new Uint8Array(await resp.arrayBuffer());
	return array;
}

function typenameToFileType(typename: string | undefined | null) {
	if (typename) {
		typename = typename.toLocaleLowerCase();
	}

	switch (typename) {
		case 'blob':
			return FileType.File;
		case 'tree':
			return FileType.Directory;
		default:
			return FileType.Unknown;
	}
}

type RepoInfo = { owner: string; repo: string; path: string | undefined; ref?: string };
function fromGitHubUri(uri: Uri): RepoInfo {
	const [, owner, repo, ...rest] = uri.path.split('/');

	let ref;
	if (uri.authority) {
		ref = uri.authority;
	}
	return { owner: owner, repo: repo, path: rest.join('/'), ref: ref };
}

function getHashCode(s: string): number {
	let hash = 0;

	if (s.length === 0) {
		return hash;
	}

	let char;
	const len = s.length;
	for (let i = 0; i < len; i++) {
		char = s.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0; // Convert to 32bit integer
	}
	return hash;
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

class GitHubApi {
	constructor(private readonly session: AuthenticationSession) { }

	private _graphql: typeof graphql | undefined;
	private get graphql() {
		if (this._graphql === undefined) {
			this._graphql = graphql.defaults({
				headers: {
					Authorization: `Bearer ${this.token}`,
				}
			});
		}

		return this._graphql;
	}

	get token() {
		return this.session.accessToken;
	}

	async filesQuery(uri: Uri) {
		const { owner, repo, ref } = fromGitHubUri(uri);
		try {
			const resp = await new Octokit({
				auth: `token ${this.token}`,
			}).git.getTree({
				owner: owner,
				repo: repo,
				recursive: '1',
				tree_sha: ref ?? 'HEAD',
			});
			return Iterables.filterMap(resp.data.tree, p => p.type === 'blob' ? p.path : undefined);
		} catch (ex) {
			return [];
		}
	}

	async searchQuery(
		query: string,
		uri: Uri,
		options: { maxResults?: number; context?: { before?: number; after?: number } },
		_token: CancellationToken,
	): Promise<SearchQueryResults> {
		const { owner, repo, ref } = fromGitHubUri(uri);

		// If we have a specific ref, don't try to search, because GitHub search only works against the default branch
		if (ref === undefined) {
			return { matches: [], limitHit: true };
		}

		try {
			const resp = await new Octokit({
				auth: `token ${this.token}`,
				request: {
					headers: {
						accept: 'application/vnd.github.v3.text-match+json',
					},
				}
			}).search.code({
				q: `${query} repo:${owner}/${repo}`,
			});

			// Since GitHub doesn't return ANY line numbers just fake it at the top of the file 😢
			const range = new Range(0, 0, 0, 0);

			const matches: SearchQueryMatch[] = [];

			console.log(resp.data.items.length, resp.data.items);

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

	async fsQuery<T>(uri: Uri, innerQuery: string): Promise<T | undefined> {
		try {
			const query = `query fs($owner: String!, $repo: String!, $path: String) {
	repository(owner: $owner, name: $repo) {
		object(expression: $path) {
			${innerQuery}
		}
	}
}`;

			const { owner, repo, path, ref } = fromGitHubUri(uri);
			const variables = {
				owner: owner,
				repo: repo,
				path: `${ref ?? 'HEAD'}:${path}`,
			};

			const rsp = await this.query<{
				repository: { object: T | null | undefined };
			}>(query, variables);
			return rsp?.repository?.object ?? undefined;
		} catch (ex) {
			return undefined;
		}
	}

	query<T>(query: string, variables: { [key: string]: string | number }): Promise<T | undefined> {
		return this.graphql(query, variables) as Promise<T | undefined>;
	}
}

interface GitHubSearchTextMatch {
	object_url: string;
	object_type: string;
	property: string;
	fragment: string;
	matches: GitHubSearchMatch[];
}

interface GitHubSearchMatch {
	text: string;
	indices: number[];
}
