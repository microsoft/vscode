/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { disposableTimeout } from '../../common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../common/cancellation.js';
import { CancellationError, isCancellationError } from '../../common/errors.js';
import { DelayedPagedModel, IPager, IterativePagedModel, PageIteratorPager, PagedModel, mapPager } from '../../common/paging.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

function getPage(pageIndex: number, cancellationToken: CancellationToken): Promise<number[]> {
	if (cancellationToken.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}

	return Promise.resolve([0, 1, 2, 3, 4].map(i => i + (pageIndex * 5)));
}

class TestPager implements IPager<number> {

	readonly firstPage = [0, 1, 2, 3, 4];
	readonly pageSize = 5;
	readonly total = 100;
	readonly getPage: (pageIndex: number, cancellationToken: CancellationToken) => Promise<number[]>;

	constructor(getPageFn?: (pageIndex: number, cancellationToken: CancellationToken) => Promise<number[]>) {
		this.getPage = getPageFn || getPage;
	}
}

suite('PagedModel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('isResolved', () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(model.isResolved(0));
		assert(model.isResolved(1));
		assert(model.isResolved(2));
		assert(model.isResolved(3));
		assert(model.isResolved(4));
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));
		assert(!model.isResolved(99));
	});

	test('resolve single', async () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));

		await model.resolve(5, CancellationToken.None);
		assert(model.isResolved(5));
	});

	test('resolve page', async () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		await model.resolve(5, CancellationToken.None);
		assert(model.isResolved(5));
		assert(model.isResolved(6));
		assert(model.isResolved(7));
		assert(model.isResolved(8));
		assert(model.isResolved(9));
		assert(!model.isResolved(10));
	});

	test('resolve page 2', async () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		await model.resolve(10, CancellationToken.None);
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(model.isResolved(10));
	});

	test('preemptive cancellation works', async function () {
		const pager = new TestPager(() => {
			assert(false);
		});

		const model = new PagedModel(pager);

		try {
			await model.resolve(5, CancellationToken.Cancelled);
			return assert(false);
		}
		catch (err) {
			return assert(isCancellationError(err));
		}
	});

	test('cancellation works', function () {
		const pager = new TestPager((_, token) => new Promise((_, e) => {
			store.add(token.onCancellationRequested(() => e(new CancellationError())));
		}));

		const model = new PagedModel(pager);
		const tokenSource = store.add(new CancellationTokenSource());

		const promise = model.resolve(5, tokenSource.token).then(
			() => assert(false),
			err => assert(isCancellationError(err))
		);

		setTimeout(() => tokenSource.cancel(), 10);

		return promise;
	});

	test('same page cancellation works', function () {
		let state = 'idle';

		const pager = new TestPager((pageIndex, token) => {
			state = 'resolving';

			return new Promise((_, e) => {
				store.add(token.onCancellationRequested(() => {
					state = 'idle';
					e(new CancellationError());
				}));
			});
		});

		const model = new PagedModel(pager);

		assert.strictEqual(state, 'idle');

		const tokenSource1 = new CancellationTokenSource();
		const promise1 = model.resolve(5, tokenSource1.token).then(
			() => assert(false),
			err => assert(isCancellationError(err))
		);

		assert.strictEqual(state, 'resolving');

		const tokenSource2 = new CancellationTokenSource();
		const promise2 = model.resolve(6, tokenSource2.token).then(
			() => assert(false),
			err => assert(isCancellationError(err))
		);

		assert.strictEqual(state, 'resolving');

		store.add(disposableTimeout(() => {
			assert.strictEqual(state, 'resolving');
			tokenSource1.cancel();
			assert.strictEqual(state, 'resolving');

			store.add(disposableTimeout(() => {
				assert.strictEqual(state, 'resolving');
				tokenSource2.cancel();
				assert.strictEqual(state, 'idle');
			}, 10));
		}, 10));

		return Promise.all([promise1, promise2]);
	});

	test('supports array pagers and mapped pagers', async () => {
		const model = new PagedModel(['a', 'b', 'c']);
		assert.strictEqual(model.length, 3);
		assert.strictEqual(model.get(1), 'b');
		assert.strictEqual(await model.resolve(2, CancellationToken.None), 'c');

		const pager = mapPager(new TestPager(), value => value * 2);
		assert.deepStrictEqual(pager.firstPage, [0, 2, 4, 6, 8]);
		assert.deepStrictEqual(await pager.getPage(1, CancellationToken.None), [10, 12, 14, 16, 18]);
	});

	test('delays resolution and supports cancellation', async () => {
		const model = new DelayedPagedModel(new PagedModel([42]), 0);
		assert.strictEqual(await model.resolve(0, CancellationToken.None), 42);

		const tokenSource = store.add(new CancellationTokenSource());
		const promise = model.resolve(0, tokenSource.token);
		tokenSource.cancel();
		await assert.rejects(promise, err => isCancellationError(err));
	});

	test('loads pages from an iterator and caches them', async () => {
		const pages = [
			{ elements: [0, 1], total: 6, hasNextPage: true },
			{ elements: [2, 3], total: 6, hasNextPage: true },
			{ elements: [4, 5], total: 6, hasNextPage: false }
		];
		let pageIndex = 0;
		const getPage = (index: number) => ({
			elements: pages[index].elements,
			total: pages[index].total,
			hasNextPage: pages[index].hasNextPage,
			getNextPage: async () => getPage(++pageIndex)
		});
		const pager = new PageIteratorPager({
			...getPage(0)
		});

		assert.deepStrictEqual(await pager.getPage(2, CancellationToken.None), [4, 5]);
		assert.deepStrictEqual(await pager.getPage(1, CancellationToken.None), [2, 3]);
		await assert.rejects(pager.getPage(3, CancellationToken.None), /out of bounds/);
	});

	test('loads iterative pages and fires length events', async () => {
		const lengths: number[] = [];
		let pageIndex = 0;
		const model = new IterativePagedModel({
			firstPage: { items: [1], hasMore: true },
			getNextPage: async () => ({
				items: [++pageIndex + 1],
				hasMore: pageIndex < 2
			})
		});
		store.add(model.onDidIncrementLength(length => lengths.push(length)));

		assert.strictEqual(model.length, 2);
		assert(!model.isResolved(1));
		assert.strictEqual(await model.resolve(1, CancellationToken.None), 2);
		assert.strictEqual(await model.resolve(2, CancellationToken.None), 3);
		assert.strictEqual(model.length, 3);
		assert.deepStrictEqual(lengths, [3, 3]);
		assert.throws(() => model.get(3), /not resolved/);
		model.dispose();
	});
});
