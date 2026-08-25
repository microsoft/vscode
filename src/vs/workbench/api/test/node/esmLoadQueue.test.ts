/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ESMLoadQueue } from '../../node/esmLoadQueue.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ESMLoadQueue', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	/** A load that only ever yields to the microtask queue, like a module without top-level await. */
	function microtaskLoad(log: string[], name: string): () => Promise<void> {
		return async () => {
			log.push(`${name}:start`);
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			log.push(`${name}:end`);
		};
	}

	test('loads do not overlap, so each one is timed on its own work', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();

		await Promise.all([
			queue.run(microtaskLoad(log, 'a')),
			queue.run(microtaskLoad(log, 'b')),
			queue.run(microtaskLoad(log, 'c')),
		]);

		assert.deepStrictEqual(log, ['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
	});

	test('without the queue those same loads interleave', async () => {
		const log: string[] = [];

		await Promise.all([
			microtaskLoad(log, 'a')(),
			microtaskLoad(log, 'b')(),
			microtaskLoad(log, 'c')(),
		]);

		assert.deepStrictEqual(log, ['a:start', 'b:start', 'c:start', 'a:end', 'b:end', 'c:end']);
	});

	test('a load using top-level await does not hold up the ones behind it', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();

		const suspending = queue.run(async () => {
			log.push('suspending:start');
			await new Promise<void>(resolve => setTimeout(resolve, 20));
			log.push('suspending:end');
		});

		await Promise.all([
			suspending,
			queue.run(microtaskLoad(log, 'a')),
			queue.run(microtaskLoad(log, 'b')),
		]);

		assert.deepStrictEqual(log, [
			'suspending:start', 'a:start', 'a:end', 'b:start', 'b:end', 'suspending:end'
		]);
	});

	test('a failing load does not break the queue', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();

		const failing = queue.run(async () => {
			log.push('failing:start');
			throw new Error('boom');
		});
		const after = queue.run(microtaskLoad(log, 'a'));

		await assert.rejects(failing, /boom/);
		await after;

		assert.deepStrictEqual(log, ['failing:start', 'a:start', 'a:end']);
	});
});
