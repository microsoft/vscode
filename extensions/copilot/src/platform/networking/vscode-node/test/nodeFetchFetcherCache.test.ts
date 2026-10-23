/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import { IFetcherService } from '../../common/fetcherService';
import { createExtensionTestingServices } from '../../../../extension/test/vscode-node/services';
import { ITestingServicesAccessor } from '../../../test/node/services';

suite('NodeFetchFetcher cache - integration', function () {
	let server: http.Server;
	let origin: string;
	let originHits: number;
	let accessor: ITestingServicesAccessor;
	let fetcher: IFetcherService;

	suiteSetup(async function () {
		if (typeof (globalThis as { __vscodeCreateFetchPatch?: unknown }).__vscodeCreateFetchPatch !== 'function') {
			this.skip();
		}

		server = http.createServer((req, res) => {
			originHits++;
			const url = req.url ?? '';
			if (url.startsWith('/cacheable')) {
				res.writeHead(200, {
					'content-type': 'application/json',
					'cache-control': 'public, max-age=60',
					'x-custom-header': 'preserved',
				});
				res.end(JSON.stringify({ hits: originHits, path: url }));
				return;
			}
			if (url.startsWith('/private')) {
				res.writeHead(200, {
					'content-type': 'application/json',
					'cache-control': 'private, max-age=60',
				});
				res.end(JSON.stringify({ hits: originHits }));
				return;
			}
			if (url.startsWith('/etag')) {
				if (req.headers['if-none-match'] === '"v1"') {
					res.writeHead(304, { 'etag': '"v1"' });
					res.end();
					return;
				}
				res.writeHead(200, {
					'content-type': 'application/json',
					'cache-control': 'public, max-age=60',
					'etag': '"v1"',
				});
				res.end(JSON.stringify({ hits: originHits }));
				return;
			}
			if (url.startsWith('/no-store')) {
				res.writeHead(200, {
					'content-type': 'application/json',
					'cache-control': 'no-store',
				});
				res.end(JSON.stringify({ hits: originHits }));
				return;
			}
			res.writeHead(404);
			res.end();
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as { port: number }).port;
		origin = `http://127.0.0.1:${port}`;
	});

	suiteTeardown(async () => {
		if (!server) {
			return;
		}
		await new Promise<void>(resolve => server.close(() => resolve()));
	});

	setup(() => {
		originHits = 0;
		accessor = createExtensionTestingServices().createTestingAccessor();
		fetcher = accessor.get(IFetcherService);
	});

	test('serves the second cache-opted request from the in-memory store', async () => {
		const first = await fetcher.fetch(`${origin}/cacheable?key=hit-miss`, { callSite: 'test', cache: true });
		const firstBody = await first.json();
		const second = await fetcher.fetch(`${origin}/cacheable?key=hit-miss`, { callSite: 'test', cache: true });
		const secondBody = await second.json();

		assert.strictEqual(originHits, 1, 'origin should be hit exactly once');
		assert.strictEqual(first.cacheStatus, 'miss');
		assert.strictEqual(second.cacheStatus, 'hit');
		assert.deepStrictEqual(secondBody, firstBody, 'cached body should match origin body');
		assert.notStrictEqual(second.headers.get('age'), null, 'cache hit should carry age header');
	});

	test('leaves requests uncached when the caller does not opt in', async () => {
		const first = await fetcher.fetch(`${origin}/cacheable?key=no-opt-in`, { callSite: 'test' });
		await first.text();
		const second = await fetcher.fetch(`${origin}/cacheable?key=no-opt-in`, { callSite: 'test' });
		await second.text();

		assert.strictEqual(originHits, 2, 'every request should hit the origin');
		assert.strictEqual(first.cacheStatus, undefined);
		assert.strictEqual(second.cacheStatus, undefined);
	});

	test('respects cache-control: no-store from the origin', async () => {
		const first = await fetcher.fetch(`${origin}/no-store?key=no-store`, { callSite: 'test', cache: true });
		await first.text();
		const second = await fetcher.fetch(`${origin}/no-store?key=no-store`, { callSite: 'test', cache: true });
		await second.text();

		assert.strictEqual(originHits, 2, 'no-store responses must not be served from cache');
		assert.strictEqual(first.cacheStatus, 'miss');
		assert.strictEqual(second.cacheStatus, 'miss');
	});

	test('does not cache POST requests', async () => {
		const first = await fetcher.fetch(`${origin}/cacheable?key=post`, { callSite: 'test', cache: true, method: 'POST', body: '{}' });
		await first.text();
		const second = await fetcher.fetch(`${origin}/cacheable?key=post`, { callSite: 'test', cache: true, method: 'POST', body: '{}' });
		await second.text();

		assert.strictEqual(originHits, 2, 'POST requests must always reach the origin');
		assert.strictEqual(first.cacheStatus, 'miss');
		assert.strictEqual(second.cacheStatus, 'miss');
	});

	test('caches different URLs independently', async () => {
		const a1 = await fetcher.fetch(`${origin}/cacheable?key=urlA`, { callSite: 'test', cache: true });
		await a1.text();
		const b1 = await fetcher.fetch(`${origin}/cacheable?key=urlB`, { callSite: 'test', cache: true });
		await b1.text();
		const a2 = await fetcher.fetch(`${origin}/cacheable?key=urlA`, { callSite: 'test', cache: true });
		await a2.text();
		const b2 = await fetcher.fetch(`${origin}/cacheable?key=urlB`, { callSite: 'test', cache: true });
		await b2.text();

		assert.strictEqual(originHits, 2, 'each distinct URL should hit the origin once');
		assert.strictEqual(a1.cacheStatus, 'miss');
		assert.strictEqual(b1.cacheStatus, 'miss');
		assert.strictEqual(a2.cacheStatus, 'hit');
		assert.strictEqual(b2.cacheStatus, 'hit');
	});

	test('keys cache entries by query string', async () => {
		const v1 = await fetcher.fetch(`${origin}/cacheable?v=1`, { callSite: 'test', cache: true });
		await v1.text();
		const v2 = await fetcher.fetch(`${origin}/cacheable?v=2`, { callSite: 'test', cache: true });
		await v2.text();

		assert.strictEqual(originHits, 2, 'different query strings should not collide');
		assert.strictEqual(v1.cacheStatus, 'miss');
		assert.strictEqual(v2.cacheStatus, 'miss');
	});

	test('preserves status, body and response headers on a cache hit', async () => {
		const first = await fetcher.fetch(`${origin}/cacheable?key=headers`, { callSite: 'test', cache: true });
		const firstBody = await first.json();
		const second = await fetcher.fetch(`${origin}/cacheable?key=headers`, { callSite: 'test', cache: true });
		const secondBody = await second.json();

		assert.strictEqual(originHits, 1);
		assert.strictEqual(second.status, first.status);
		assert.strictEqual(second.statusText, first.statusText);
		assert.strictEqual(second.headers.get('content-type'), 'application/json');
		assert.strictEqual(second.headers.get('x-custom-header'), 'preserved');
		assert.deepStrictEqual(secondBody, firstBody);
	});

	test('caches Cache-Control: private responses in the private store', async () => {
		const first = await fetcher.fetch(`${origin}/private?key=private`, { callSite: 'test', cache: true });
		await first.text();
		const second = await fetcher.fetch(`${origin}/private?key=private`, { callSite: 'test', cache: true });
		await second.text();

		assert.strictEqual(originHits, 1, 'private responses should be cached in the private store');
		assert.strictEqual(first.cacheStatus, 'miss');
		assert.strictEqual(second.cacheStatus, 'hit');
	});

	test('reports revalidated when the origin returns 304 Not Modified', async () => {
		const first = await fetcher.fetch(`${origin}/etag?key=etag`, { callSite: 'test', cache: true });
		const firstBody = await first.json();
		const second = await fetcher.fetch(`${origin}/etag?key=etag`, { callSite: 'test', cache: true, headers: { 'cache-control': 'no-cache' } });
		const secondBody = await second.json();

		assert.strictEqual(originHits, 2, 'a 304 still counts as an origin request');
		assert.strictEqual(first.cacheStatus, 'miss');
		assert.strictEqual(second.cacheStatus, 'revalidated');
		assert.strictEqual(second.status, 200, 'revalidated response is served with the cached 200 status');
		assert.deepStrictEqual(secondBody, firstBody, 'revalidated response carries the cached body');
	});

	test('coalesces or caches concurrent requests so the second is not an extra miss', async () => {
		const [a, b] = await Promise.all([
			fetcher.fetch(`${origin}/cacheable?key=concurrent`, { callSite: 'test', cache: true }),
			fetcher.fetch(`${origin}/cacheable?key=concurrent`, { callSite: 'test', cache: true }),
		]);
		await Promise.all([a.text(), b.text()]);
		const third = await fetcher.fetch(`${origin}/cacheable?key=concurrent`, { callSite: 'test', cache: true });
		await third.text();
		assert.ok(originHits <= 2, `origin hit at most twice for concurrent fetches, got ${originHits}`);
		assert.strictEqual(third.cacheStatus, 'hit');
	});
});
