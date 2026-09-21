/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionCatalogCache } from '../../node/sessionCatalogCache.js';

suite('SessionCatalogCache', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares reads across callers and versions only reuse successful snapshots', async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(60_000));
		const gate = new DeferredPromise<number>();
		let reads = 0;
		const load = () => { reads++; return gate.p; };
		const first = cache.get('session', 'first', load);
		const concurrent = cache.get('session', 'first', load);
		gate.complete(1);
		const values = await Promise.all([first, concurrent]);
		values.push((await cache.get('session', 'first', load))!);
		values.push((await cache.get('session', 'second', async () => { reads++; return 2; }))!);
		assert.deepStrictEqual({ values, reads }, { values: [1, 1, 1, 2], reads: 2 });
	});

	test('an invalidated in-flight read cannot replace the newer snapshot', async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(60_000));
		const stale = new DeferredPromise<number>();
		const first = cache.get('session', '', () => stale.p);
		cache.delete('session');
		await cache.get('session', '', async () => 2);
		stale.complete(1);
		await first;
		assert.strictEqual(await cache.get('session', '', async () => { throw new Error('unexpected read'); }), 2);
	});

	test('does not retain unavailable results or failed reads', async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(60_000));
		let reads = 0;
		const readUnavailable = async () => { reads++; return undefined; };
		const readFailure = async () => { reads++; throw new Error('unavailable'); };
		await Promise.all([cache.get('session', '', readUnavailable), cache.get('session', '', readUnavailable)]);
		await assert.rejects(cache.get('session', '', readFailure), /unavailable/);
		const value = await cache.get('session', '', async () => { reads++; return 3; });
		assert.deepStrictEqual({ value, reads }, { value: 3, reads: 3 });
	});

	test('expires inactive snapshots without another lookup', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(100));
		let reads = 0;
		const load = async () => ++reads;
		await cache.get('session', '', load);
		await timeout(101);
		const retained = cache.peek('session');
		const refreshed = await cache.get('session', '', load);
		assert.deepStrictEqual({ retained, refreshed, reads }, { retained: undefined, refreshed: 2, reads: 2 });
	}));

	test('bounds retained entries and removes sessions no longer in the registry', async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(60_000));
		for (let index = 0; index <= 2048; index++) {
			await cache.get(String(index), '', async () => index);
		}
		const oldest = cache.peek('0');
		cache.retain(new Set(['2048']));
		assert.deepStrictEqual({
			oldest,
			removed: cache.peek('2047'),
			kept: cache.peek('2048'),
		}, { oldest: undefined, removed: undefined, kept: 2048 });
	});

	test('returns oversized snapshots without retaining them', async () => {
		const cache = disposables.add(new SessionCatalogCache<string>(60_000, undefined, value => value.length < 4));
		let reads = 0;
		const load = async () => { reads++; return 'large'; };
		const first = await cache.get('session', '', load);
		const second = await cache.get('session', '', load);
		assert.deepStrictEqual({ first, second, reads, retained: cache.peek('session') }, { first: 'large', second: 'large', reads: 2, retained: undefined });
	});

	test('disposal clears snapshots and ignores late completions', async () => {
		const cache = disposables.add(new SessionCatalogCache<number>(60_000));
		const pending = new DeferredPromise<number>();
		await cache.get('settled', '', async () => 1);
		const read = cache.get('pending', '', () => pending.p);
		cache.dispose();
		pending.complete(2);
		await read;
		assert.deepStrictEqual([cache.peek('settled'), cache.peek('pending')], [undefined, undefined]);
	});
});
