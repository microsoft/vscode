/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { timeout } from '../../../../util/vs/base/common/async';
import { URI } from '../../../../util/vs/base/common/uri';
import { filterIngoredResources, IIgnoreService } from '../ignoreService';

/** An ignore service whose verdict, and how long it takes to reach it, is decided by the test. */
function ignoreServiceWith(isCopilotIgnored: (file: URI) => Promise<boolean>): IIgnoreService {
	return {
		_serviceBrand: undefined,
		isEnabled: true,
		isRegexExclusionsEnabled: false,
		dispose: () => { },
		init: () => Promise.resolve(),
		isCopilotIgnored,
		asMinimatchPattern: () => Promise.resolve(undefined)
	};
}

function resources(count: number): URI[] {
	return Array.from({ length: count }, (_, index) => URI.file(`/workspace/src/file-${index}.ts`));
}

function isExcluded(file: URI): boolean {
	return file.path.endsWith('0.ts');
}

suite('filterIngoredResources', () => {
	test('drops excluded resources and keeps the rest in order, even when checks settle out of order', async () => {
		const files = resources(50);

		const filtered = await filterIngoredResources(ignoreServiceWith(async file => {
			// Every other check takes a trip through the event loop, so they finish out of order.
			if (files.indexOf(file) % 2 === 0) {
				await timeout(1);
			}
			return isExcluded(file);
		}), files);

		expect(filtered).toEqual(files.filter(file => !isExcluded(file)));
	});

	test('runs a bounded number of checks at a time', async () => {
		let running = 0;
		let mostRunning = 0;

		await filterIngoredResources(ignoreServiceWith(async () => {
			mostRunning = Math.max(mostRunning, ++running);
			await timeout(0);
			running--;
			return false;
		}), resources(100));

		expect(mostRunning).toBe(20);
	});

	test('stops checking once a check has failed', async () => {
		const files = resources(100);
		let checked = 0;

		const result = filterIngoredResources(ignoreServiceWith(async () => {
			if (++checked === 30) {
				throw new Error('git extension unavailable');
			}
			await timeout(0);
			return false;
		}), files);

		await expect(result).rejects.toThrow('git extension unavailable');
		// The caller already has its error, so the remaining workers must not carry on to the end.
		await timeout(10);
		expect(checked).toBeLessThan(files.length);
	});

	test('filters a whole workspace worth of results in linear time', async () => {
		// Queueing every result into a Limiter made this quadratic, because its pending queue is
		// drained with Array#shift: 200,000 fast checks took over ten seconds on a developer machine.
		const files = resources(200_000);
		const expected = files.filter(file => !isExcluded(file));

		const start = performance.now();
		const filtered = await filterIngoredResources(ignoreServiceWith(async file => isExcluded(file)), files);
		const elapsed = performance.now() - start;

		expect({ kept: filtered.length, inOrder: filtered.every((file, index) => file === expected[index]) })
			.toEqual({ kept: expected.length, inOrder: true });
		expect(elapsed).toBeLessThan(5_000);
	});
});
