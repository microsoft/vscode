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
});
