/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiRequestOptions, IApiRequestProvider } from '../client/request.js';
import { pathSegment, pathSegments, repositoryPath, withQuery } from '../client/routing.js';
import { parse } from '../client/schema.js';
import { GitHubRequestError } from '../githubTypes.js';
import { ContentEntry, DirectoryContent, FileContent, GetContentOptions, GetTreeOptions, GitBlob, GitTree, IContentClient, RepositoryContent, SubmoduleContent, SymlinkContent } from './content.js';

export class ContentClient implements IContentClient {
	constructor(
		private readonly provider: IApiRequestProvider,
		private readonly rawContent?: IApiRequestProvider) { }

	async resolveRef(owner: string, repo: string, ref: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<string> {
		const response = await this.provider.request({
			domain: 'content',
			method: 'GET',
			path: `${repositoryPath(owner, repo)}/commits/${pathSegment(ref)}`,
			accept: 'application/vnd.github.sha',
			expectedStatus: 200,
			responseBody: 'text',
			options,
		}, signal, parse.sha);
		return response.data;
	}

	async getRawFile(owner: string, repo: string, commitSha: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<string> {
		signal.throwIfAborted();
		if (!this.rawContent) {
			throw new GitHubRequestError('GitHub raw-content endpoint is not configured for this host.', 'validation');
		}
		const response = await this.rawContent.request({
			domain: 'content',
			method: 'GET',
			path: `/${pathSegment(owner)}/${pathSegment(repo)}/${pathSegment(commitSha)}${pathSegments(path)}`,
			accept: 'text/plain, application/octet-stream',
			responseBody: 'text',
			expectedStatus: 200,
			options,
		}, signal, parse.string);
		return response.data;
	}

	async getContent(owner: string, repo: string, path: string, signal: AbortSignal, options?: GetContentOptions): Promise<RepositoryContent> {
		const { query, ...requestOptions } = options ?? {};
		const response = await this.provider.request({
			domain: 'content',
			method: 'GET',
			path: withQuery(`${repositoryPath(owner, repo)}/contents${pathSegments(path)}`, { ref: query?.ref }),
			accept: 'application/vnd.github.object+json',
			expectedStatus: 200,
			options: requestOptions,
		}, signal, parseContent);
		return response.data;
	}

	async getTree(owner: string, repo: string, treeRef: string, signal: AbortSignal, options?: GetTreeOptions): Promise<GitTree> {
		const { query, ...requestOptions } = options ?? {};
		const response = await this.provider.request({
			domain: 'content',
			method: 'GET',
			path: withQuery(`${repositoryPath(owner, repo)}/git/trees/${pathSegment(treeRef)}`, { recursive: query?.recursive ? 1 : undefined }),
			accept: 'application/vnd.github+json',
			expectedStatus: 200,
			options: requestOptions,
		}, signal, parseTree);
		return response.data;
	}

	async getBlob(owner: string, repo: string, sha: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<GitBlob> {
		const response = await this.provider.request({
			domain: 'content',
			method: 'GET',
			path: `${repositoryPath(owner, repo)}/git/blobs/${pathSegment(sha)}`,
			accept: 'application/vnd.github+json',
			expectedStatus: 200,
			options,
		}, signal, parseBlob);
		return response.data;
	}
}

const contentEntrySchema: parse.ObjectSchema<ContentEntry> = {
	type: parse.oneOf('file', 'dir', 'symlink', 'submodule'),
	name: parse.string,
	path: parse.string,
	sha: parse.nonEmptyString,
	size: parse.nonNegativeInteger,
	url: parse.nonEmptyString,
	html_url: parse.nullable(parse.nonEmptyString),
	git_url: parse.nullable(parse.nonEmptyString),
	download_url: parse.nullable(parse.nonEmptyString),
	_links: parse.object({
		self: parse.nonEmptyString,
		git: parse.nullable(parse.nonEmptyString),
		html: parse.nullable(parse.nonEmptyString),
	}),
};

const contentParsers = {
	file: parse.object<FileContent>({
		...contentEntrySchema,
		type: parse.exact('file'),
		content: parse.string,
		encoding: parse.oneOf('base64', 'none'),
	}),
	dir: parse.object<DirectoryContent>({
		...contentEntrySchema,
		type: parse.exact('dir'),
		entries: parse.arrayOf(parse.object(contentEntrySchema)),
	}),
	symlink: parse.object<SymlinkContent>({
		...contentEntrySchema,
		type: parse.exact('symlink'),
		target: parse.string,
	}),
	submodule: parse.object<SubmoduleContent>({
		...contentEntrySchema,
		type: parse.exact('submodule'),
		submodule_git_url: parse.nullable(parse.string),
	}),
};

const parseContentType = parse.object({ type: contentEntrySchema.type });
const parseContent: parse.Parser<RepositoryContent> = value => contentParsers[parseContentType(value).type](value);

const parseTree = parse.object<GitTree>({
	sha: parse.nonEmptyString,
	url: parse.nonEmptyString,
	tree: parse.arrayOf(parse.object({
		path: parse.nonEmptyString,
		mode: parse.nonEmptyString,
		type: parse.oneOf('blob', 'tree', 'commit'),
		sha: parse.nonEmptyString,
		size: parse.optional(parse.nonNegativeInteger),
		url: parse.optional(parse.nonEmptyString),
	})),
	truncated: parse.boolean,
});

const parseBlob = parse.object<GitBlob>({
	sha: parse.nonEmptyString,
	node_id: parse.nonEmptyString,
	size: parse.nonNegativeInteger,
	url: parse.nonEmptyString,
	content: parse.string,
	encoding: parse.exact('base64'),
});
