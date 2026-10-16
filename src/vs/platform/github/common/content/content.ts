/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ApiQueryOptions, ApiRequestOptions } from '../client/request.js';

/** Metadata for a repository file, directory, symlink, or submodule. */
export interface ContentEntry {
	/** Directory summaries may report submodules as files for API compatibility. */
	readonly type: 'file' | 'dir' | 'symlink' | 'submodule';
	/** Entry name; empty for the repository root. */
	readonly name: string;
	/** Repository-relative path; empty for the repository root. */
	readonly path: string;
	/** Git object SHA, not the repository commit from which the content was read. */
	readonly sha: string;
	/** Reported size in bytes; directories and submodules report zero. */
	readonly size: number;
	/** Contents API URL for this entry at the requested ref. */
	readonly url: string;
	/** Browser URL, or null when no GitHub page is available. */
	readonly html_url: string | null;
	/** Git data API URL, or null for a submodule not hosted on GitHub. */
	readonly git_url: string | null;
	/** Temporary download URL, or null when the entry cannot be downloaded directly. */
	readonly download_url: string | null;
	/** Links to the entry's API, Git, and browser representations. */
	readonly _links: {
		/** Contents API URL for this entry. */
		readonly self: string;
		/** Git data API URL, when available. */
		readonly git: string | null;
		/** Browser URL, when available. */
		readonly html: string | null;
	};
}

/** A file or a symlink resolved by GitHub to file content. */
export interface FileContent extends ContentEntry {
	/** Discriminator for a full file representation. */
	readonly type: 'file';
	/** Inline content in the declared encoding; empty when encoding is none. */
	readonly content: string;
	/** Encoding none means the content must be retrieved through a raw-file or blob request. */
	readonly encoding: 'base64' | 'none';
}

/** A directory returned by the Contents object media type. */
export interface DirectoryContent extends ContentEntry {
	/** Discriminator for a directory representation. */
	readonly type: 'dir';
	/** Immediate children, limited to 1,000 without a truncation flag; use Git trees for larger listings. */
	readonly entries: readonly ContentEntry[];
}

/** A symlink that GitHub could not resolve to a regular file. */
export interface SymlinkContent extends ContentEntry {
	/** Discriminator for an unresolved symlink. */
	readonly type: 'symlink';
	/** Link target as stored in the repository. */
	readonly target: string;
}

/** A reference to another Git repository and its commit. */
export interface SubmoduleContent extends ContentEntry {
	/** Discriminator for a full submodule representation. */
	readonly type: 'submodule';
	/** Configured Git URL, or null when the submodule has no usable .gitmodules entry. */
	readonly submodule_git_url: string | null;
}

/** The full Contents object representation, distinguished from directory-entry summaries. */
export type RepositoryContent = FileContent | DirectoryContent | SymlinkContent | SubmoduleContent;

/** A Git tree entry, including symlinks and submodule commits. */
export interface GitTreeEntry {
	/** Path relative to the requested tree, including parent directories for recursive results. */
	readonly path: string;
	/** Git mode string identifying ordinary files, executables, directories, symlinks, or submodules. */
	readonly mode: string;
	/** Git object kind; commit denotes a submodule and symlinks are blobs. */
	readonly type: 'blob' | 'tree' | 'commit';
	/** SHA of the referenced Git object. */
	readonly sha: string;
	/** Blob size in bytes; omitted for trees and submodule commits. */
	readonly size?: number;
	/** Git data API URL; omitted for submodule commits. */
	readonly url?: string;
}

/** A Git tree response whose completeness is explicitly reported by the server. */
export interface GitTree {
	/** SHA of the tree object, not the commit containing it. */
	readonly sha: string;
	/** Git data API URL for the tree. */
	readonly url: string;
	/** Entries included in the requested tree listing. */
	readonly tree: readonly GitTreeEntry[];
	/** Whether the server's size or entry-count limits left entries out of the response. */
	readonly truncated: boolean;
}

/** A Git blob containing base64-encoded file data. */
export interface GitBlob {
	/** Blob SHA, not the SHA of a commit containing the blob. */
	readonly sha: string;
	/** GraphQL node identifier for the blob. */
	readonly node_id: string;
	/** Size reported by GitHub in bytes. */
	readonly size: number;
	/** Git data API URL for the blob. */
	readonly url: string;
	/** Base64 content, preserving any embedded line breaks. */
	readonly content: string;
	/** Encoding used by the JSON blob representation. */
	readonly encoding: 'base64';
}

/** Revision selection for a Contents request. */
export type GetContentOptions = ApiQueryOptions<{
	/** Commit SHA, branch, or tag; omission uses the default branch, while a commit SHA pins the read. */
	readonly ref?: string;
}>;

/** Traversal options for a single Git trees request. */
export type GetTreeOptions = ApiQueryOptions<{
	/** Include nested entries; false or omission requests only immediate children. */
	readonly recursive?: boolean;
}>;

/** Operations for reading repository files, directory contents, and Git objects. */
export interface IContentClient {
	/** GET /repos/{owner}/{repo}/commits/{ref}: resolve a branch, tag, or HEAD to an immutable commit SHA. */
	resolveRef(owner: string, repo: string, ref: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<string>;

	/** Downloads public UTF-8 text at an immutable commit, preserving BOM/whitespace and rejecting files over 1 MiB. */
	getRawFile(owner: string, repo: string, commitSha: string, path: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<string>;

	/** GET /repos/{owner}/{repo}/contents/{path}: read the object representation, using an empty path for the root. */
	getContent(owner: string, repo: string, path: string, signal: AbortSignal, options?: GetContentOptions): Promise<RepositoryContent>;

	/** GET /repos/{owner}/{repo}/git/trees/{treeRef}: read a tree's entries and truncation status by tree/commit SHA or ref. */
	getTree(owner: string, repo: string, treeRef: string, signal: AbortSignal, options?: GetTreeOptions): Promise<GitTree>;

	/** GET /repos/{owner}/{repo}/git/blobs/{sha}: read base64-encoded file data. */
	getBlob(owner: string, repo: string, sha: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<GitBlob>;
}
