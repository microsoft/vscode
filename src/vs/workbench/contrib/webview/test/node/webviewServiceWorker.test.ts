/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { join, resolve } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Webview service worker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const version = 3;

	async function activateWorker(cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<number> {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const source = readFileSync(join(sourceDir, '../../browser/pre/service-worker.js'), 'utf8');
		const activate = source.match(/sw\.addEventListener\('activate',[\s\S]*?\r?\n\}\);/)?.[0];
		assert.ok(activate);

		let claims = 0;
		let activation: Promise<void> | undefined;
		new Function('sw', 'caches', 'VERSION', activate)({
			clients: {
				claim: async () => { claims++; },
			},
			addEventListener: (_type: string, handler: (event: { waitUntil: (promise: Promise<void>) => void }) => void) => {
				handler({ waitUntil: promise => { activation = promise; } });
			},
		}, cacheStorage, version);

		assert.ok(activation);
		await activation;
		return claims;
	}

	test('removes only resource caches from older versions on activation', async () => {
		const currentCache = `vscode-resource-cache-${version}`;
		const newerCache = `vscode-resource-cache-${version + 1}`;
		const cacheNames = new Set([
			'vscode-resource-cache-1',
			'vscode-resource-cache-2',
			currentCache,
			newerCache,
			'extension-cache',
			'vscode-resource-cache-custom',
		]);
		const claims = await activateWorker({
			keys: async () => [...cacheNames],
			delete: async name => cacheNames.delete(name),
		});

		assert.deepStrictEqual({ caches: [...cacheNames], claims }, {
			caches: [currentCache, newerCache, 'extension-cache', 'vscode-resource-cache-custom'],
			claims: 1,
		});
	});

	for (const failure of ['keys', 'delete']) {
		test(`claims clients when cache ${failure} fails`, async () => {
			const claims = await activateWorker({
				keys: async () => {
					if (failure === 'keys') {
						throw new Error('Cache storage is unavailable');
					}
					return ['vscode-resource-cache-1'];
				},
				delete: async () => { throw new Error('Cache storage is unavailable'); },
			});

			assert.strictEqual(claims, 1);
		});
	}

	function loadWorkerComponents() {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		const source = readFileSync(join(sourceDir, '../../browser/pre/service-worker.js'), 'utf8');
		const match = source.match(/class RequestStore\s*\{[\s\S]*?\n\}\n\nclass AsyncSemaphore\s*\{[\s\S]*?\n\}/);
		assert.ok(match);
		return new Function('resolveTimeout', `${match[0]}; return { RequestStore, AsyncSemaphore };`)(500) as {
			RequestStore: new () => {
				create(webviewId?: string): { requestId: number; promise: Promise<{ status: string; value?: any }>; cancel: () => void };
				resolve(requestId: number, result: any): boolean;
				cancelForWebview(webviewId: string): void;
			};
			AsyncSemaphore: new (maxConcurrency: number) => {
				acquire(signal?: AbortSignal): Promise<() => void>;
			};
		};
	}

	test('RequestStore tracks requests per webview and cancels them on unload', async () => {
		const { RequestStore } = loadWorkerComponents();
		const store = new RequestStore();

		const r1 = store.create('webview-a');
		const r2 = store.create('webview-a');
		const r3 = store.create('webview-b');

		store.cancelForWebview('webview-a');
		store.resolve(r3.requestId, { status: 200, path: '/test.js' });

		const results = await Promise.all([r1.promise, r2.promise, r3.promise]);
		assert.deepStrictEqual(results, [
			{ status: 'disposed' },
			{ status: 'disposed' },
			{ status: 'ok', value: { status: 200, path: '/test.js' } }
		]);
	});

	test('RequestStore entry cancel aborts single request with disposed status', async () => {
		const { RequestStore } = loadWorkerComponents();
		const store = new RequestStore();

		const r1 = store.create('webview-a');
		r1.cancel();

		const res = await r1.promise;
		assert.deepStrictEqual(res, { status: 'disposed' });
	});

	test('AsyncSemaphore immediately rejects when acquiring with an already aborted signal', async () => {
		const { AsyncSemaphore } = loadWorkerComponents();
		const sem = new AsyncSemaphore(2);

		const ac = new AbortController();
		ac.abort();

		await assert.rejects(sem.acquire(ac.signal), /Aborted/);
	});

	test('AsyncSemaphore removes queued waiter when abort signal fires while waiting', async () => {
		const { AsyncSemaphore } = loadWorkerComponents();
		const sem = new AsyncSemaphore(1);

		const release1 = await sem.acquire();

		const ac = new AbortController();
		const waiterPromise = sem.acquire(ac.signal);
		ac.abort();

		await assert.rejects(waiterPromise, /Aborted/);

		// Next waiter should be granted immediately when slot 1 is released
		let acquiredThird = false;
		const thirdPromise = sem.acquire().then(release3 => {
			acquiredThird = true;
			release3();
		});

		release1();
		await thirdPromise;
		assert.ok(acquiredThird);
	});

	test('Closing webview frees semaphore slots so subsequent webview requests do not block', async () => {
		const { RequestStore, AsyncSemaphore } = loadWorkerComponents();
		const sem = new AsyncSemaphore(2);
		const store = new RequestStore();

		// Webview 1 acquires both slots
		const rel1 = await sem.acquire();
		const r1 = store.create('webview-1');
		const rel2 = await sem.acquire();
		const r2 = store.create('webview-1');

		// Webview 2 request queues behind Webview 1
		let webview2Acquired = false;
		const webview2Promise = sem.acquire().then(rel => {
			webview2Acquired = true;
			rel();
		});

		// Webview 1 is closed/unloaded: its pending requests are cancelled and slots released
		store.cancelForWebview('webview-1');
		const [res1, res2] = await Promise.all([r1.promise, r2.promise]);
		assert.strictEqual(res1.status, 'disposed');
		assert.strictEqual(res2.status, 'disposed');

		// Free slots upon disposal as resolveResourceEntry does
		rel1();
		rel2();

		await webview2Promise;
		assert.ok(webview2Acquired, 'Webview 2 should acquire slot immediately after Webview 1 is closed');
	});
});
