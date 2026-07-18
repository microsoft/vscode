/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PendingRequestRegistry } from '../../common/pendingRequestRegistry.js';

suite('PendingRequestRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registerAndFire registers BEFORE invoking fire (synchronous responder finds the entry)', async () => {
		const registry = new PendingRequestRegistry<boolean>();
		// Synchronous responder mimics agentSideEffects._handleToolReady, which
		// resolves auto-approved writes inside the listener for the fired signal.
		// If registerAndFire fired before registering, respond() would return false
		// and the awaited promise would deadlock.
		const promise = registry.registerAndFire('k1', () => {
			const matched = registry.respond('k1', true);
			assert.strictEqual(matched, true, 'sync responder must find the entry');
		});
		assert.strictEqual(await promise, true);
	});

	test('respond on an unknown key returns false; on a known key resolves the deferred and removes the entry', async () => {
		const registry = new PendingRequestRegistry<string>();
		assert.strictEqual(registry.respond('missing', 'x'), false);

		const promise = registry.registerAndFire('k', () => { });
		assert.strictEqual(registry.respond('k', 'hello'), true);
		assert.strictEqual(await promise, 'hello');
		// Entry was removed: a second respond against the same key returns false.
		assert.strictEqual(registry.respond('k', 'world'), false);
	});

	test('denyAll resolves every pending entry with the supplied value and clears the registry', async () => {
		const registry = new PendingRequestRegistry<boolean>();
		const a = registry.registerAndFire('a', () => { });
		const b = registry.registerAndFire('b', () => { });

		registry.denyAll(false);

		assert.deepStrictEqual(await Promise.all([a, b]), [false, false]);
		// Cleared: post-denyAll respond calls find nothing.
		assert.strictEqual(registry.respond('a', true), false);
		assert.strictEqual(registry.respond('b', true), false);
	});

	test('denyAll is a no-op for already-settled entries (e.g. a sync responder resolved one before dispose)', async () => {
		const registry = new PendingRequestRegistry<boolean>();
		const promise = registry.registerAndFire('k', () => {
			registry.respond('k', true);
		});
		assert.strictEqual(await promise, true);
		// After respond removed it, denyAll has nothing to do — no throw, no second resolution.
		registry.denyAll(false);
	});

	test('rejectAll rejects every parked deferred with the supplied error and clears the registry', async () => {
		const registry = new PendingRequestRegistry<string>();
		const a = registry.registerAndFire('a', () => { });
		const b = registry.registerAndFire('b', () => { });
		const err = new Error('cancelled');

		registry.rejectAll(err);

		await Promise.all([a, b].map(async p => {
			try {
				await p;
				assert.fail('expected reject');
			} catch (e) {
				assert.strictEqual(e, err);
			}
		}));
		// Cleared: post-rejectAll respond calls find nothing.
		assert.strictEqual(registry.respond('a', 'x'), false);
		assert.strictEqual(registry.respond('b', 'y'), false);
	});

	test('respondOrBuffer: result arriving before register resolves the subsequent register', async () => {
		const registry = new PendingRequestRegistry<string>();
		// Completion races ahead of the awaiting handler.
		registry.respondOrBuffer('k', 'early');
		// The handler registers afterwards and resolves immediately from the buffer.
		assert.strictEqual(await registry.register('k'), 'early');
		// Buffer consumed exactly once: a fresh register parks a new deferred.
		const pending = registry.register('k');
		let settled = false;
		void pending.then(() => { settled = true; });
		await Promise.resolve();
		assert.strictEqual(settled, false);
		registry.respondOrBuffer('k', 'second');
		assert.strictEqual(await pending, 'second');
	});

	test('respondOrBuffer behaves like respond when a deferred is already parked', async () => {
		const registry = new PendingRequestRegistry<string>();
		const promise = registry.register('k');
		registry.respondOrBuffer('k', 'value');
		assert.strictEqual(await promise, 'value');
	});

	test('hasBufferedResult reports only unconsumed early results', async () => {
		const registry = new PendingRequestRegistry<string>();
		assert.strictEqual(registry.hasBufferedResult('k'), false);
		registry.respondOrBuffer('k', 'early');
		assert.strictEqual(registry.hasBufferedResult('k'), true);
		await registry.register('k');
		assert.strictEqual(registry.hasBufferedResult('k'), false);
	});

	test('respondOrBuffer: a buffered `undefined` value still resolves a subsequent register', async () => {
		// Guards against the `get() !== undefined` sentinel bug: when T includes
		// undefined, a buffered undefined must be distinguished from "no entry"
		// so register() resolves immediately instead of parking and hanging.
		const registry = new PendingRequestRegistry<string | undefined>();
		registry.respondOrBuffer('k', undefined);
		assert.strictEqual(await registry.register('k'), undefined);
		// Buffer consumed exactly once: a fresh register parks a new deferred.
		const pending = registry.register('k');
		let settled = false;
		void pending.then(() => { settled = true; });
		await Promise.resolve();
		assert.strictEqual(settled, false);
		registry.respondOrBuffer('k', 'second');
		assert.strictEqual(await pending, 'second');
	});

	test('rejectAll clears buffered early results', async () => {
		const registry = new PendingRequestRegistry<string>();
		registry.respondOrBuffer('k', 'early');
		registry.rejectAll(new Error('cancelled'));
		// Buffer dropped: a later register parks a fresh deferred rather than
		// resolving from the stale buffered value.
		const pending = registry.register('k');
		let settled = false;
		void pending.then(() => { settled = true; });
		await Promise.resolve();
		assert.strictEqual(settled, false);
		registry.respondOrBuffer('k', 'fresh');
		assert.strictEqual(await pending, 'fresh');
	});
});
