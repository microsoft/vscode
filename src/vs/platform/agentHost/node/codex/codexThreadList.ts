/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure paging helper for the Codex `thread/list` path, extracted so it can be
 * unit-tested without standing up the whole {@link CodexAgent} (mirrors the
 * `codexForkPlan.ts` extraction). No protocol or service imports.
 */

/** Server-side `thread/list` page cap; a larger `limit` is silently clamped. */
export const THREAD_LIST_PAGE_SIZE = 100;

/** Safety stop for `thread/list` paging so a misbehaving server cannot hang startup. */
export const THREAD_LIST_MAX_PAGES = 50;

export interface IThreadListPageRequest {
	readonly limit: number;
	/**
	 * Explicitly empty: codex reads an omitted filter as "only the currently
	 * configured provider", which hides every thread recorded under a different
	 * one. An empty array is its documented "all providers" request.
	 */
	readonly modelProviders: string[];
	readonly cursor?: string;
}

export interface IThreadListPage<T> {
	readonly data: readonly T[];
	readonly nextCursor?: string | null;
}

export function buildThreadListPageRequest(cursor: string | undefined): IThreadListPageRequest {
	return {
		limit: THREAD_LIST_PAGE_SIZE,
		modelProviders: [],
		...(cursor !== undefined ? { cursor } : {}),
	};
}

/**
 * Page through `thread/list` until the server stops handing back a cursor.
 * `onTruncated` reports that the page cap was hit with more results pending.
 */
export async function collectThreadListPages<T>(
	fetchPage: (request: IThreadListPageRequest) => Promise<IThreadListPage<T>>,
	onTruncated?: (collected: number) => void,
): Promise<T[]> {
	const items: T[] = [];
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	for (let page = 0; page < THREAD_LIST_MAX_PAGES; page++) {
		const response = await fetchPage(buildThreadListPageRequest(cursor));
		items.push(...response.data);
		const nextCursor = response.nextCursor ?? undefined;
		// A server that keeps handing back the same cursor would loop forever.
		if (nextCursor === undefined || seenCursors.has(nextCursor)) {
			return items;
		}
		seenCursors.add(nextCursor);
		cursor = nextCursor;
	}
	onTruncated?.(items.length);
	return items;
}
