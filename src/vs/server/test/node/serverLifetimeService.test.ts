/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { IServerLifetimeOptions, ServerLifetimeService } from '../../node/serverLifetimeService.js';

suite('ServerLifetimeService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function create(opts: IServerLifetimeOptions = {}): ServerLifetimeService {
		return ds.add(new ServerLifetimeService(opts, () => undefined as never, new NullLogService()));
	}

	test('starts with no active consumers', () => {
		const service = create();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('active() marks a consumer and dispose releases it', () => {
		const service = create();
		const d = service.active('test');
		assert.strictEqual(service.hasActiveConsumers, true);
		d.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('multiple active consumers require all to dispose', () => {
		const service = create();
		const d1 = service.active('a');
		const d2 = service.active('b');
		assert.strictEqual(service.hasActiveConsumers, true);
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('same consumer name counted multiple times', () => {
		const service = create();
		const d1 = service.active('ext');
		const d2 = service.active('ext');
		assert.strictEqual(service.hasActiveConsumers, true);
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('dispose is idempotent', () => {
		const service = create();
		const d1 = service.active('a');
		const d2 = service.active('a');
		d1.dispose();
		d1.dispose();
		assert.strictEqual(service.hasActiveConsumers, true);
		d2.dispose();
		assert.strictEqual(service.hasActiveConsumers, false);
	});

	test('does not exit when a consumer becomes active during shutdown', async () => {
		let exits = 0;
		let aborts = 0;
		const service = ds.add(new ServerLifetimeService(
			{ enableAutoShutdown: true, shutdownWithoutDelay: true },
			() => { exits++; return undefined as never; },
			new NullLogService(),
		));
		const shutdownBarrier = new DeferredPromise<void>();
		ds.add(service.onWillShutdown(event => event.join(shutdownBarrier.p)));
		ds.add(service.onDidAbortShutdown(() => aborts++));

		const firstConsumer = service.active('first');
		firstConsumer.dispose();
		const secondConsumer = ds.add(service.active('second'));
		shutdownBarrier.complete();
		await timeout(0);

		assert.deepStrictEqual({
			hasActiveConsumers: service.hasActiveConsumers,
			exits,
			aborts,
		}, {
			hasActiveConsumers: true,
			exits: 0,
			aborts: 1,
		});
		secondConsumer.dispose();
		await timeout(0);
		assert.strictEqual(exits, 1);
	});

	test('does not exit when shutdown is delayed during a join', async () => {
		let exits = 0;
		const service = ds.add(new ServerLifetimeService(
			{ enableAutoShutdown: true, shutdownWithoutDelay: true },
			() => { exits++; return undefined as never; },
			new NullLogService(),
		));
		const shutdownBarrier = new DeferredPromise<void>();
		let shutdownCount = 0;
		ds.add(service.onWillShutdown(event => {
			shutdownCount++;
			if (shutdownCount === 1) {
				event.join(shutdownBarrier.p);
			}
		}));

		const consumer = service.active('first');
		consumer.dispose();
		service.delay();
		shutdownBarrier.complete();
		await timeout(0);

		assert.deepStrictEqual({
			shutdownCount,
			exits,
		}, {
			shutdownCount: 2,
			exits: 1,
		});
	});
});
