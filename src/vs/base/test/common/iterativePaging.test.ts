/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { IterativePagedModel, IIterativePager, IIterativePage } from '../../common/paging.js';

function createTestPager(pageSize: number, maxPages: number): IIterativePager<number> {
	let currentPage = 0;

	const createPage = (page: number): IIterativePage<number> => {
		const start = page * pageSize;
		const items: number[] = [];
		for (let i = 0; i < pageSize; i++) {
			items.push(start + i);
		}
		const hasMore = page + 1 < maxPages;
		return { items, hasMore };
	};

	return {
		firstPage: createPage(currentPage++),
		getNextPage: async (cancellationToken: CancellationToken): Promise<IIterativePage<number>> => {
			if (currentPage >= maxPages) {
				return { items: [], hasMore: false };
			}
			return createPage(currentPage++);
		}
	};
}

suite('IterativePagedModel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state', () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Initially first page is loaded, so length should be 10 + 1 sentinel
		assert.strictEqual(model.length, 11);
		assert.strictEqual(model.isResolved(0), true);
		assert.strictEqual(model.isResolved(9), true);
		assert.strictEqual(model.isResolved(10), false); // sentinel
	});

	test('load first page via sentinel access', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Access an item in the first page (already loaded)
		const item = await model.resolve(0, CancellationToken.None);

		assert.strictEqual(item, 0);
		assert.strictEqual(model.length, 11); // 10 items + 1 sentinel
		assert.strictEqual(model.isResolved(0), true);
		assert.strictEqual(model.isResolved(9), true);
		assert.strictEqual(model.isResolved(10), false); // sentinel
	});

	test('load multiple pages', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// First page already loaded
		assert.strictEqual(model.length, 11);

		// Load second page by accessing its sentinel
		await model.resolve(10, CancellationToken.None);
		assert.strictEqual(model.length, 21); // 20 items + 1 sentinel
		assert.strictEqual(model.get(10), 10); // First item of second page

		// Load third (final) page
		await model.resolve(20, CancellationToken.None);
		assert.strictEqual(model.length, 30); // 30 items, no sentinel (no more pages)
	});

	test('onDidIncrementLength event fires correctly', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));
		const lengths: number[] = [];

		store.add(model.onDidIncrementLength((length: number) => lengths.push(length)));

		// Load second page
		await model.resolve(10, CancellationToken.None);

		assert.strictEqual(lengths.length, 1);
		assert.strictEqual(lengths[0], 21); // 20 items + 1 sentinel

		// Load third page
		await model.resolve(20, CancellationToken.None);

		assert.strictEqual(lengths.length, 2);
		assert.strictEqual(lengths[1], 30); // 30 items, no sentinel
	});

	test('accessing regular items does not trigger loading', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		const initialLength = model.length;

		// Access items within the loaded range
		assert.strictEqual(model.get(5), 5);
		assert.strictEqual(model.isResolved(5), true);

		// Length should not change
		assert.strictEqual(model.length, initialLength);
	});

	test('reaching end of data removes sentinel', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Load all pages
		await model.resolve(10, CancellationToken.None);  // Page 2
		await model.resolve(20, CancellationToken.None);  // Page 3 (final)

		// After loading all data, there should be no more pages
		assert.strictEqual(model.length, 30); // Exactly 30 items, no sentinel

		// Accessing resolved items should work
		assert.strictEqual(model.isResolved(29), true);
		assert.strictEqual(model.isResolved(30), false);
	});

	test('concurrent access to sentinel only loads once', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Access sentinel concurrently
		const [item1, item2, item3] = await Promise.all([
			model.resolve(10, CancellationToken.None),
			model.resolve(10, CancellationToken.None),
			model.resolve(10, CancellationToken.None)
		]);

		// All should get the same item
		assert.strictEqual(item1, 10);
		assert.strictEqual(item2, 10);
		assert.strictEqual(item3, 10);
		assert.strictEqual(model.length, 21); // 20 items + 1 sentinel
	});

	test('empty pager with no items', () => {
		const emptyPager: IIterativePager<number> = {
			firstPage: { items: [], hasMore: false },
			getNextPage: async () => ({ items: [], hasMore: false })
		};
		const model = store.add(new IterativePagedModel(emptyPager));

		assert.strictEqual(model.length, 0);
		assert.strictEqual(model.isResolved(0), false);
	});

	test('single page pager with no more pages', () => {
		const singlePagePager: IIterativePager<number> = {
			firstPage: { items: [1, 2, 3], hasMore: false },
			getNextPage: async () => ({ items: [], hasMore: false })
		};
		const model = store.add(new IterativePagedModel(singlePagePager));

		assert.strictEqual(model.length, 3); // No sentinel
		assert.strictEqual(model.isResolved(0), true);
		assert.strictEqual(model.isResolved(2), true);
		assert.strictEqual(model.isResolved(3), false);
		assert.strictEqual(model.get(0), 1);
		assert.strictEqual(model.get(2), 3);
	});

	test('accessing item beyond loaded range throws', () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Try to access item beyond current length
		assert.throws(() => model.get(15), /Item not resolved yet/);
	});

	test('resolving item beyond all pages throws', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Load all pages
		await model.resolve(10, CancellationToken.None);
		await model.resolve(20, CancellationToken.None);

		// Try to resolve beyond the last item
		await assert.rejects(
			async () => model.resolve(30, CancellationToken.None),
			/Index out of bounds/
		);
	});

	test('cancelled token during initial resolve', async () => {
		const pager = createTestPager(10, 3);
		const model = store.add(new IterativePagedModel(pager));

		const cts = new CancellationTokenSource();
		cts.cancel();

		await assert.rejects(
			async () => model.resolve(0, cts.token),
			/Canceled/
		);
	});

	test('event fires for each page load', async () => {
		const pager = createTestPager(5, 4);
		const model = store.add(new IterativePagedModel(pager));
		const lengths: number[] = [];

		store.add(model.onDidIncrementLength((length: number) => lengths.push(length)));

		// Initially has first page (5 items + 1 sentinel = 6)
		assert.strictEqual(model.length, 6);

		// Load page 2
		await model.resolve(5, CancellationToken.None);
		assert.deepStrictEqual(lengths, [11]); // 10 items + 1 sentinel

		// Load page 3
		await model.resolve(10, CancellationToken.None);
		assert.deepStrictEqual(lengths, [11, 16]); // 15 items + 1 sentinel

		// Load page 4 (final)
		await model.resolve(15, CancellationToken.None);
		assert.deepStrictEqual(lengths, [11, 16, 20]); // 20 items, no sentinel
	});

	test('sequential page loads work correctly', async () => {
		const pager = createTestPager(5, 3);
		const model = store.add(new IterativePagedModel(pager));

		// Load pages sequentially
		for (let page = 1; page < 3; page++) {
			const sentinelIndex = page * 5;
			await model.resolve(sentinelIndex, CancellationToken.None);
		}

		// Verify all items are accessible
		assert.strictEqual(model.length, 15); // 3 pages * 5 items, no sentinel
		for (let i = 0; i < 15; i++) {
			assert.strictEqual(model.get(i), i);
			assert.strictEqual(model.isResolved(i), true);
		}
	});

	test('accessing items after loading all pages', async () => {
		const pager = createTestPager(10, 2);
		const model = store.add(new IterativePagedModel(pager));

		// Load second page
		await model.resolve(10, CancellationToken.None);

		// No sentinel after loading all pages
		assert.strictEqual(model.length, 20);
		assert.strictEqual(model.isResolved(19), true);
		assert.strictEqual(model.isResolved(20), false);

		// All items should be accessible
		for (let i = 0; i < 20; i++) {
			assert.strictEqual(model.get(i), i);
		}
	});

	test('pager with varying page sizes', async () => {
		let pageNum = 0;
		const varyingPager: IIterativePager<string> = {
			firstPage: { items: ['a', 'b', 'c'], hasMore: true },
			getNextPage: async (): Promise<IIterativePage<string>> => {
				pageNum++;
				if (pageNum === 1) {
					return { items: ['d', 'e'], hasMore: true };
				} else if (pageNum === 2) {
					return { items: ['f', 'g', 'h', 'i'], hasMore: false };
				}
				return { items: [], hasMore: false };
			}
		};

		const model = store.add(new IterativePagedModel(varyingPager));

		assert.strictEqual(model.length, 4); // 3 items + 1 sentinel

		// Load second page (2 items)
		await model.resolve(3, CancellationToken.None);
		assert.strictEqual(model.length, 6); // 5 items + 1 sentinel
		assert.strictEqual(model.get(3), 'd');

		// Load third page (4 items)
		await model.resolve(5, CancellationToken.None);
		assert.strictEqual(model.length, 9); // 9 items, no sentinel
		assert.strictEqual(model.get(5), 'f');
		assert.strictEqual(model.get(8), 'i');
	});
});
