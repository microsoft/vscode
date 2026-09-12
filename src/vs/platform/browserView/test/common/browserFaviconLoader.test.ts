/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { BrowserFaviconLoader } from '../../common/browserFaviconLoader.js';

suite('BrowserFaviconLoader', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLoader() {
		const requests = new Map<string, DeferredPromise<string>>();
		const applied: (string | undefined)[] = [];
		const loader = store.add(new BrowserFaviconLoader(url => {
			const request = new DeferredPromise<string>();
			requests.set(url, request);
			return request.p;
		}, favicon => applied.push(favicon), new NullLogService()));
		return { loader, requests, applied };
	}

	test('does not publish an older request that completes after the current request', async () => {
		const { loader, requests, applied } = createLoader();
		const older = loader.load(['older']);
		const current = loader.load(['current']);
		await requests.get('current')!.complete('current-icon');
		await current;
		await requests.get('older')!.complete('older-icon');
		await older;

		assert.deepStrictEqual(applied, ['current-icon']);
	});

	test('does not publish after a navigation invalidates the request', async () => {
		const { loader, requests, applied } = createLoader();
		const pending = loader.load(['older']);
		loader.invalidate();
		await requests.get('older')!.complete('older-icon');
		await pending;

		assert.deepStrictEqual(applied, []);
	});

	test('does not clear the current icon or fetch fallbacks after an older request fails', async () => {
		const { loader, requests, applied } = createLoader();
		const older = loader.load(['older', 'fallback']);
		loader.invalidate();
		const current = loader.load(['current']);
		await requests.get('current')!.complete('current-icon');
		await current;
		await requests.get('older')!.error(new Error('Older favicon unavailable'));
		await older;

		assert.deepStrictEqual({ requested: [...requests.keys()], applied }, {
			requested: ['older', 'current'], applied: ['current-icon'],
		});
	});

	test('tries the next favicon after a current request fails', async () => {
		const { loader, requests, applied } = createLoader();
		const pending = loader.load(['missing', 'fallback']);
		await requests.get('missing')!.error(new Error('Favicon unavailable'));
		await requests.get('fallback')!.complete('fallback-icon');
		await pending;

		assert.deepStrictEqual(applied, ['fallback-icon']);
	});

	test('clears the favicon when all current candidates fail', async () => {
		const { loader, requests, applied } = createLoader();
		const pending = loader.load(['missing']);
		await requests.get('missing')!.error(new Error('Favicon unavailable'));
		await pending;

		assert.deepStrictEqual(applied, [undefined]);
	});

	test('an empty favicon update supersedes an earlier request', async () => {
		const { loader, requests, applied } = createLoader();
		const pending = loader.load(['older']);
		await loader.load([]);
		await requests.get('older')!.complete('older-icon');
		await pending;

		assert.deepStrictEqual(applied, [undefined]);
	});

	test('disposal prevents pending completions and new requests', async () => {
		const { loader, requests, applied } = createLoader();
		const pending = loader.load(['older']);
		loader.dispose();
		await requests.get('older')!.complete('older-icon');
		await pending;
		await loader.load(['after-disposal']);

		assert.deepStrictEqual({ requested: [...requests.keys()], applied }, { requested: ['older'], applied: [] });
	});
});
