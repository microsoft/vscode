/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';

const GIT_BLOB_SCHEME = 'git-blob';

interface IGitBlobUriQuery {
	readonly sessionUri: string;
	readonly sha: string;
	readonly repoRelativePath: string;
}

/**
 * Builds a `git-blob:` URI that references a file blob at a specific git
 * commit, scoped to a given session. Resolved by reading the session's
 * working directory and shelling out to `git show <sha>:<path>`.
 *
 * The URI path is the absolute working-tree path so resource labels show a
 * recognizable file path and so the "before" side lines up with the
 * working-tree "after" side in diff editors. The session URI, SHA, and
 * repository-relative path needed to fetch the blob are carried in the
 * query.
 *
 * @param sessionUri Session the blob belongs to; used to find the working
 *   directory.
 * @param sha Git commit/ref the blob is read from.
 * @param repoRelativePath Repository-relative path passed to `git show`.
 * @param absolutePath Absolute working-tree path used as the display path.
 */
export function buildGitBlobUri(sessionUri: string, sha: string, repoRelativePath: string, absolutePath: string): string {
	return URI.from({
		scheme: GIT_BLOB_SCHEME,
		path: absolutePath,
		query: JSON.stringify({ sessionUri, sha, repoRelativePath } satisfies IGitBlobUriQuery),
	}).toString();
}

/** Parsed fields from a `git-blob:` content URI. */
export interface IGitBlobUriFields {
	readonly sessionUri: string;
	readonly sha: string;
	readonly repoRelativePath: string;
}

/**
 * Parses a `git-blob:` URI produced by {@link buildGitBlobUri}.
 * Returns `undefined` if the URI is not a valid `git-blob:` URI.
 */
export function parseGitBlobUri(raw: string): IGitBlobUriFields | undefined {
	let parsed: URI;
	try {
		parsed = URI.parse(raw);
	} catch {
		return undefined;
	}
	if (parsed.scheme !== GIT_BLOB_SCHEME || !parsed.query) {
		return undefined;
	}
	try {
		const query = JSON.parse(parsed.query) as Partial<IGitBlobUriQuery>;
		if (typeof query.sessionUri === 'string' && typeof query.sha === 'string' && typeof query.repoRelativePath === 'string') {
			return {
				sessionUri: query.sessionUri,
				sha: query.sha,
				repoRelativePath: query.repoRelativePath,
			};
		}
	} catch {
		return undefined;
	}
	return undefined;
}
