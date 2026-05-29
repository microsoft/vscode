/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';

const GIT_BLOB_SCHEME = 'git-blob';

interface IGitBlobUriQuery {
	readonly sessionUri: string;
	readonly sha: string;
}

/**
 * Builds a `git-blob:` URI that references a file blob at a specific git
 * commit, scoped to a given session. Resolved by reading the session's
 * working directory and shelling out to `git show <sha>:<path>`.
 *
 * The session URI is preserved so the resolver can find the session's
 * working directory; the SHA and repository-relative path identify the
 * blob to fetch. The URI path is the repository-relative path so normal
 * resource labels can display a recognizable file path.
 */
export function buildGitBlobUri(sessionUri: string, sha: string, repoRelativePath: string): string {
	return URI.from({
		scheme: GIT_BLOB_SCHEME,
		path: `/${repoRelativePath}`,
		query: JSON.stringify({ sessionUri, sha } satisfies IGitBlobUriQuery),
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
	if (parsed.scheme !== GIT_BLOB_SCHEME) {
		return undefined;
	}
	try {
		if (parsed.query) {
			const query = JSON.parse(parsed.query) as Partial<IGitBlobUriQuery>;
			const repoRelativePath = parsed.path.startsWith('/') ? parsed.path.substring(1) : parsed.path;
			if (typeof query.sessionUri === 'string' && typeof query.sha === 'string' && repoRelativePath) {
				return {
					sessionUri: query.sessionUri,
					sha: query.sha,
					repoRelativePath,
				};
			}
		}

		const [, sha, encodedPath] = parsed.path.split('/');
		if (!sha || !encodedPath) {
			return undefined;
		}
		return {
			sessionUri: decodeHex(parsed.authority).toString(),
			sha: decodeURIComponent(sha),
			repoRelativePath: decodeHex(encodedPath).toString(),
		};
	} catch {
		return undefined;
	}
}
