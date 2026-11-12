/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { gigabytes, runWithinMemory } from '../memory.ts';

/** Runs jobs that need the given gigabytes, and returns the order in which they started and ended, and their results. */
async function run(memories: readonly number[], availableMemory: number, maxConcurrency?: number) {
	const events: string[] = [];
	const results = await runWithinMemory('test', memories.map((memory, index) => ({
		memory: gigabytes(memory),
		run: async () => {
			events.push(`start ${index}`);
			await new Promise(resolve => setTimeout(resolve, 0));
			events.push(`end ${index}`);
			return index;
		}
	})), { availableMemory: gigabytes(availableMemory), maxConcurrency });
	return { events, results };
}

suite('runWithinMemory', () => {
	test('runs the jobs at once when the memory affords them', async () => {
		assert.deepStrictEqual(await run([2, 1, 2], 8), {
			events: ['start 0', 'start 1', 'start 2', 'end 0', 'end 1', 'end 2'],
			results: [0, 1, 2],
		});
	});

	test('starts the jobs in order as memory frees up, and always runs one', async () => {
		// 4 GB available leaves 3 GB for the jobs, and the third job needs more than that on its own.
		assert.deepStrictEqual(await run([2, 1, 5, 1], 4), {
			events: ['start 0', 'start 1', 'end 0', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3'],
			results: [0, 1, 2, 3],
		});
	});

	test('runs at most maxConcurrency jobs at once', async () => {
		assert.deepStrictEqual((await run([1, 1, 1], 8, 2)).events, ['start 0', 'start 1', 'end 0', 'start 2', 'end 1', 'end 2']);
	});
});
