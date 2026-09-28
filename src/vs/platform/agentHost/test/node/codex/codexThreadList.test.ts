/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IThreadListPage, IThreadListPageRequest, THREAD_LIST_MAX_PAGES, THREAD_LIST_PAGE_SIZE, buildThreadListPageRequest, collectThreadListPages } from '../../../node/codex/codexThreadList.js';

suite('codexThreadList', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('buildThreadListPageRequest', () => {

		test('always asks for all providers and omits the cursor on the first page', () => {
			assert.deepStrictEqual({
				first: buildThreadListPageRequest(undefined),
				next: buildThreadListPageRequest('cursor-1'),
			}, {
				first: { limit: THREAD_LIST_PAGE_SIZE, modelProviders: [] },
				next: { limit: THREAD_LIST_PAGE_SIZE, modelProviders: [], cursor: 'cursor-1' },
			});
		});
	});

	suite('collectThreadListPages', () => {

		/** Serve `pages` in order, recording the request each page was fetched with. */
		function pagedSource(pages: readonly IThreadListPage<string>[]) {
			const requests: IThreadListPageRequest[] = [];
			let index = 0;
			const fetchPage = async (request: IThreadListPageRequest): Promise<IThreadListPage<string>> => {
				requests.push(request);
				return pages[index++] ?? { data: [] };
			};
			return { requests, fetchPage };
		}

		test('follows the cursor across pages and concatenates them in order', async () => {
			const { requests, fetchPage } = pagedSource([
				{ data: ['a', 'b'], nextCursor: 'c1' },
				{ data: ['c'], nextCursor: 'c2' },
				{ data: ['d'], nextCursor: null },
			]);

			assert.deepStrictEqual({
				threads: await collectThreadListPages(fetchPage),
				cursors: requests.map(r => r.cursor),
			}, {
				threads: ['a', 'b', 'c', 'd'],
				cursors: [undefined, 'c1', 'c2'],
			});
		});

		test('stops on a missing cursor without fetching another page', async () => {
			const { requests, fetchPage } = pagedSource([{ data: ['only'] }]);

			assert.deepStrictEqual({
				threads: await collectThreadListPages(fetchPage),
				pagesFetched: requests.length,
			}, {
				threads: ['only'],
				pagesFetched: 1,
			});
		});

		test('stops when the server repeats a cursor instead of looping forever', async () => {
			let calls = 0;
			const fetchPage = async (): Promise<IThreadListPage<string>> => {
				calls++;
				return { data: ['x'], nextCursor: 'same' };
			};

			assert.deepStrictEqual({
				threads: await collectThreadListPages(fetchPage),
				calls,
			}, {
				threads: ['x', 'x'],
				calls: 2,
			});
		});

		test('gives up at the page cap and reports the truncation', async () => {
			let calls = 0;
			const fetchPage = async (): Promise<IThreadListPage<string>> => {
				calls++;
				return { data: ['x'], nextCursor: `cursor-${calls}` };
			};
			const truncatedAt: number[] = [];

			const threads = await collectThreadListPages(fetchPage, collected => truncatedAt.push(collected));

			assert.deepStrictEqual({
				calls,
				threadCount: threads.length,
				truncatedAt,
			}, {
				calls: THREAD_LIST_MAX_PAGES,
				threadCount: THREAD_LIST_MAX_PAGES,
				truncatedAt: [THREAD_LIST_MAX_PAGES],
			});
		});

		test('does not report truncation when paging completes normally', async () => {
			const { fetchPage } = pagedSource([{ data: ['a'], nextCursor: 'c1' }, { data: ['b'] }]);
			const truncatedAt: number[] = [];

			await collectThreadListPages(fetchPage, collected => truncatedAt.push(collected));

			assert.deepStrictEqual(truncatedAt, []);
		});
	});
});
