/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { installWithRetry } from '../package.ts';

suite('Agent SDK install retry', () => {
	class RetryableError extends Error { }

	function run(outcomes: ('ok' | 'missing' | 'throws' | 'fatal')[]) {
		const events: string[] = [];
		let attempt = 0;
		const promise = installWithRetry({
			install: () => {
				events.push('install');
				if (outcomes[attempt] === 'throws') {
					attempt++;
					throw new RetryableError('npm ci exited 1');
				}
				if (outcomes[attempt] === 'fatal') {
					attempt++;
					throw new Error('npm ci failed to spawn');
				}
			},
			isRetryableError: error => error instanceof RetryableError,
			findProblem: () => outcomes[attempt++] === 'missing' ? 'native package missing.' : undefined,
			reset: () => events.push('reset'),
			delaysMs: [10, 30],
			sleep: async ms => { events.push(`sleep ${ms}`); },
		});
		return { promise, events };
	}

	test('does not retry a complete install', async () => {
		const { promise, events } = run(['ok']);
		await promise;
		assert.deepStrictEqual(events, ['install']);
	});

	test('retries when the native package was skipped, then succeeds', async () => {
		const { promise, events } = run(['missing', 'ok']);
		await promise;
		assert.deepStrictEqual(events, ['install', 'reset', 'sleep 10', 'install']);
	});

	test('retries when npm ci fails, then succeeds', async () => {
		const { promise, events } = run(['throws', 'missing', 'ok']);
		await promise;
		assert.deepStrictEqual(events, ['install', 'reset', 'sleep 10', 'install', 'reset', 'sleep 30', 'install']);
	});

	test('throws the last problem when every attempt fails', async () => {
		const { promise, events } = run(['missing', 'throws', 'missing']);
		await assert.rejects(promise, /native package missing/);
		assert.deepStrictEqual(events, ['install', 'reset', 'sleep 10', 'install', 'reset', 'sleep 30', 'install']);
	});
	test('does not retry other install errors', async () => {
		const { promise, events } = run(['fatal', 'ok']);
		await assert.rejects(promise, /failed to spawn/);
		assert.deepStrictEqual(events, ['install']);
	});
});
