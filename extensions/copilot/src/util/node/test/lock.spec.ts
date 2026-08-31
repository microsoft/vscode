/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { suite, test } from 'vitest';
import { Lock } from '../../common/lock';

suite('Lock', async function () {
	test('acquire and release', async function () {
		const lock = new Lock();
		await lock.acquire();
		assert.strictEqual(lock.locked, true);
		lock.release();
		assert.strictEqual(lock.locked, false);
	});

	test('queueing', async function () {
		const lock = new Lock();
		await lock.acquire();
		assert.strictEqual(lock.locked, true);

		let released = false;
		lock.acquire().then(() => {
			released = true;
		});

		assert.strictEqual(released, false);
		lock.release();

		// wait 1 tick
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.strictEqual(released, true);
		assert.strictEqual(lock.locked, true);

		lock.release();
		assert.strictEqual(lock.locked, false);
	});
});
