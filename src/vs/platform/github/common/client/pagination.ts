/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nextLink } from '../githubResponse.js';
import { GitHubRequestError } from '../githubTypes.js';
import { ApiRequest, ApiRequestOptions, ApiResponseMetadata, PaginationOptions } from './request.js';

export type PaginatedApiRequest = ApiRequest & {
	readonly method: 'GET';
	readonly responseBody?: 'json' | 'text';
	readonly options?: ApiRequestOptions & PaginationOptions;
};

/** More pages were available than the caller allowed the operation to collect. */
export class PaginationLimitError extends Error {
	constructor(readonly maxPages: number) {
		super(`GitHub pagination exceeded the limit of ${maxPages} pages`);
		this.name = 'PaginationLimitError';
	}
}

/** Collects sequential pages without treating failures or repeated continuations as partial success. */
export async function collectPages<T>(
	initial: string | undefined,
	fetchPage: (continuation: string | undefined) => Promise<T>,
	nextPage: (page: T) => string | undefined,
	merge: (pages: readonly T[]) => T,
	signal: AbortSignal,
	options: PaginationOptions = {},
): Promise<T> {
	const { maxPages, pageLimitBehavior = 'throw' } = options;
	if (maxPages !== undefined && (!Number.isSafeInteger(maxPages) || maxPages < 1)
		|| pageLimitBehavior !== 'throw' && pageLimitBehavior !== 'returnPartial') {
		throw new GitHubRequestError('Invalid GitHub pagination options', 'validation');
	}
	const pages: T[] = [];
	const seen = new Set(initial === undefined ? [] : [initial]);
	let continuation = initial;
	while (true) {
		signal.throwIfAborted();
		const page = await fetchPage(continuation);
		signal.throwIfAborted();
		pages.push(page);
		if (maxPages === undefined) {
			break;
		}
		continuation = nextPage(page);
		if (continuation === undefined) {
			break;
		}
		if (seen.has(continuation)) {
			throw new GitHubRequestError('GitHub pagination repeated a continuation', 'malformedResponse');
		}
		seen.add(continuation);
		if (pages.length === maxPages) {
			if (pageLimitBehavior === 'throw') {
				throw new PaginationLimitError(maxPages);
			}
			break;
		}
	}
	return pages.length === 1 ? pages[0] : merge(pages);
}

/** Concatenates array pages without changing their order or dropping entries. */
export function mergeArrayPages<T>(pages: readonly (readonly T[])[]): T[] {
	return pages.flat();
}

/** Reads an execution-provider continuation, rejecting invalid advertised links. */
export function nextPagePath(metadata: ApiResponseMetadata | undefined): string | undefined {
	if (metadata?.nextPath === null || metadata?.nextLink !== undefined && metadata.nextPath === undefined) {
		throw new GitHubRequestError('GitHub returned an invalid pagination link', 'malformedResponse');
	}
	return metadata?.nextPath;
}

/** Confines a next link to its configured API endpoint; invalid links remain explicit metadata. */
export function getNextPagePath(apiBaseUri: string, responseUrl: string, link: string | undefined): string | null | undefined {
	const next = nextLink(link);
	if (next === undefined) {
		return link && /\brel\s*=\s*["']?[^;,]*\bnext\b/i.test(link) ? null : undefined;
	}
	let target: URL;
	try {
		target = new URL(next, responseUrl);
	} catch {
		return null;
	}
	const base = new URL(apiBaseUri);
	const prefix = `${base.pathname.replace(/\/+$/, '')}/`;
	if (target.origin !== base.origin || target.username || target.password || target.hash
		|| !target.pathname.startsWith(prefix)
		|| /[\\\r\n\t]/.test(next)) {
		return null;
	}
	return `/${target.pathname.slice(prefix.length)}${target.search}`;
}
