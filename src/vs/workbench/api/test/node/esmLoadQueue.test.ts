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

	function run(queue: ESMLoadQueue, log: string[], name: string, load: () => Promise<void>): Promise<void> {
		return queue.run(load, () => log.push(`${name}:slotEnd`));
	}

	test('loads do not overlap, so each one is timed on its own work', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();

		await Promise.all([
			run(queue, log, 'a', microtaskLoad(log, 'a')),
			run(queue, log, 'b', microtaskLoad(log, 'b')),
			run(queue, log, 'c', microtaskLoad(log, 'c')),
		]);

		assert.deepStrictEqual(log, [
			'a:start', 'a:end', 'a:slotEnd',
			'b:start', 'b:end', 'b:slotEnd',
			'c:start', 'c:end', 'c:slotEnd',
		]);
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

	test('a load using top-level await stops being timed before the next loads run', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();
		let resume!: () => void;
		const suspended = new Promise<void>(resolve => { resume = resolve; });

		const suspending = run(queue, log, 'suspending', async () => {
			log.push('suspending:start');
			await suspended;
			log.push('suspending:end');
		});
		const behind = Promise.all([
			run(queue, log, 'a', microtaskLoad(log, 'a')),
			run(queue, log, 'b', microtaskLoad(log, 'b')),
		]);

		// the loads behind it get to run while it is still suspended
		await behind;
		resume();
		await suspending;

		// `suspending:slotEnd` lands before a and b, so their work is not counted against it
		assert.deepStrictEqual(log, [
			'suspending:start', 'suspending:slotEnd',
			'a:start', 'a:end', 'a:slotEnd',
			'b:start', 'b:end', 'b:slotEnd',
			'suspending:end',
		]);
	});

	test('a failing load does not break the queue', async () => {
		const log: string[] = [];
		const queue = new ESMLoadQueue();

		const failing = run(queue, log, 'failing', async () => {
			log.push('failing:start');
			throw new Error('boom');
		});
		const after = run(queue, log, 'a', microtaskLoad(log, 'a'));

		await assert.rejects(failing, /boom/);
		await after;

		assert.deepStrictEqual(log, [
			'failing:start', 'failing:slotEnd', 'a:start', 'a:end', 'a:slotEnd',
		]);
	});
});
