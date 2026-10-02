/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserFetchService } from '../../browser/fetchService.js';

suite('BrowserFetchService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves streaming, cancellation and request policy without ambient credentials', async () => {
		const controller = new AbortController();
		const expected = new Response(new ReadableStream<Uint8Array>(), { status: 405 });
		const requests: Request[] = [];
		const service = new BrowserFetchService(async input => {
			assert.ok(input instanceof Request);
			requests.push(input);
			return expected;
		});
		const response = await service.fetch(new Request('https://api.test', {
			method: 'POST', body: '{}', credentials: 'include', redirect: 'follow',
		}), { cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
		const reason = new Error('stop');
		controller.abort(reason);
		await response.body!.cancel();
		assert.deepStrictEqual({
			egress: service.egress,
			sameResponse: response === expected,
			requests: requests.map(request => ({
				method: request.method, cache: request.cache, redirect: request.redirect,
				credentials: request.credentials, referrerPolicy: request.referrerPolicy, aborted: request.signal.reason === reason,
			})),
		}, {
			egress: 'browser',
			sameResponse: true,
			requests: [{ method: 'POST', cache: 'no-store', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', aborted: true }],
		});
	});

	test('does not retry or fall back after a browser failure', async () => {
		let attempts = 0;
		const reason = new TypeError('Failed to fetch');
		const service = new BrowserFetchService(async () => {
			attempts++;
			throw reason;
		});
		await assert.rejects(service.fetch('https://api.test', { method: 'POST', body: '{}' }), error => error === reason);
		assert.strictEqual(attempts, 1);
	});

	test('rejects cancellation, embedded credentials and unsupported schemes before network access', async () => {
		const service = new BrowserFetchService(async () => assert.fail('executor must not run'));
		const reason = new Error('stop');
		await assert.rejects(service.fetch('https://api.test', { signal: AbortSignal.abort(reason) }), error => error === reason);
		await assert.rejects(service.fetch('file:///private'), /HTTP\(S\)/);
		await assert.rejects(service.fetch('https://user:password@api.test'));
	});
});
