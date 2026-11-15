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
});
