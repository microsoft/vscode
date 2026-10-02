/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ControlTransport, IControlTransportPolicy } from '../../common/controlTransport.js';
import { RequestAccount } from '../../common/types.js';

suite('Control transport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account: RequestAccount = { kind: 'anonymous', origin: 'https://catalog.example.test', host: 'catalog.example.test' };
	const policy: IControlTransportPolicy = {
		caller: 'catalog.search', resource: 'catalog', requestTimeout: 30_000,
		maximumResponseBytes: 1024, maximumSharedWaiters: 64,
		getResponseCooldown: () => 0,
	};

	test('uses domain-selected cooldown interpretation without assuming GitHub reset timestamps', () => runWithFakedTimers({}, async () => {
		let calls = 0;
		const transport = store.add(new ControlTransport({
			...policy,
			getResponseCooldown: response => response.status === 429 ? Number(response.headers.get('x-ratelimit-reset')) * 1000 : 0,
		}, new NullLogService()));
		const response = await transport.get('first', account, new AbortController().signal, Date.now() + 1000, async () => {
			calls++;
			return new Response('limited', { status: 429, headers: { 'x-ratelimit-reset': '4' } });
		});
		assert.strictEqual(response.status, 429);
		await assert.rejects(transport.get('second', account, new AbortController().signal, Date.now() + 1000, async () => {
			calls++;
			return Response.json({});
		}), { kind: 'rateLimit', statusCode: 429 });
		assert.strictEqual(calls, 1);
	}));

	test('coalesces compatible callers without owning either caller cancellation', async () => {
		const transport = store.add(new ControlTransport(policy, new NullLogService()));
		const response = new DeferredPromise<Response>();
		const started = new DeferredPromise<AbortSignal>();
		let calls = 0;
		const fetch = async (signal: AbortSignal) => {
			calls++;
			void started.complete(signal);
			return response.p;
		};
		const controller = new AbortController();
		const first = transport.get('same', account, controller.signal, Date.now() + 1000, fetch);
		const peer = transport.get('same', account, new AbortController().signal, Date.now() + 1000, fetch);
		const active = await started.p;
		const reason = new Error('Caller cancelled');
		controller.abort(reason);
		await assert.rejects(first, error => error === reason);
		assert.strictEqual(active.aborted, false);
		await response.complete(new Response('catalog'));
		assert.deepStrictEqual({ calls, body: (await peer).body }, { calls: 1, body: 'catalog' });
	});

	test('honors the owning service response-size limit', async () => {
		const transport = store.add(new ControlTransport({ ...policy, maximumResponseBytes: 3 }, new NullLogService()));
		await assert.rejects(transport.get('large', account, new AbortController().signal, Date.now() + 1000, async () => new Response('oversized')), {
			kind: 'responseTooLarge',
		});
	});
});
