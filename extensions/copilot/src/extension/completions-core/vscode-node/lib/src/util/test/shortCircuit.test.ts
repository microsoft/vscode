/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { shortCircuit } from '../shortCircuit';

suite('Test shortCircuit', function () {
	const shortCircuitMs = 20;
	const shortCircuitReturn = 'Short circuited';
	let clock: sinon.SinonFakeTimers;
	setup(function () {
		clock = sinon.useFakeTimers();
	});

	teardown(function () {
		clock.restore();
	});

	test('returns the result of the function if it completes before the timeout', async function () {
		const fn = (n: number) => Promise.resolve(`Result: ${n}`);
		const shortCircuitedFn = shortCircuit(fn, shortCircuitMs, shortCircuitReturn);
		const result = await shortCircuitedFn(42);
		assert.strictEqual(result, 'Result: 42');
	});

	test('returns the short circuit value if the function does not complete before the timeout', async function () {
		let touched = false;
		const timeout = new Promise(resolve => setTimeout(resolve, shortCircuitMs * 2));
		async function fn(n: number): Promise<string> {
			await timeout;
			touched = true;
			return `Result: ${n}`;
		}
		const shortCircuitedFn = shortCircuit(fn, shortCircuitMs, shortCircuitReturn);
		const promisedResult = shortCircuitedFn(42); // start the function, but don't await it because time is stopped
		await clock.tickAsync(shortCircuitMs); // advance the clock by the short circuit time
		const result = await promisedResult;
		assert.strictEqual(result, 'Short circuited');
		assert.ok(!touched, 'at this point the function should still be processing and touched is not yet true');
		await clock.tickAsync(shortCircuitMs); // advance the clock to the function duration
		assert.ok(touched, 'at this point the function should have completed and touched should be true');
	});
});
