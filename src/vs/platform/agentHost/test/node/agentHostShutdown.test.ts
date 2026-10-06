/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { flushAgentHostPersistenceBeforeShutdown, shutdownAgentHostBeforeDispose } from '../../node/agentHostShutdown.js';

suite('AgentHostShutdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a failed persistence flush does not reject shutdown', async () => {
		await assert.doesNotReject(() => flushAgentHostPersistenceBeforeShutdown(
			[Promise.reject(new Error('storage unavailable'))],
			3000,
			new NullLogService(),
		));
	});

	test('a failed persistence flush still waits for the other writes', async () => {
		const pending = new DeferredPromise<void>();
		const errors: unknown[] = [];
		let flushed = false;
		const flush = flushAgentHostPersistenceBeforeShutdown(
			[Promise.reject(new Error('storage unavailable')), pending.p],
			3000,
			{ error: (_message, error) => errors.push(error), warn: () => { } },
		).then(() => { flushed = true; });
		try {
			await timeout(0);
			const flushedBeforeWrite = flushed;
			const errorsBeforeWrite = errors.length;
			pending.complete();
			await flush;
			assert.deepStrictEqual({
				flushedBeforeWrite,
				errorsBeforeWrite,
				errors: errors.map(error => error instanceof Error ? error.message : String(error)),
			}, {
				flushedBeforeWrite: false,
				errorsBeforeWrite: 1,
				errors: ['storage unavailable'],
			});
		} finally {
			pending.complete();
			await flush;
		}
	});

	test('providers shut down before persistence is flushed', async () => {
		const steps: string[] = [];

		await shutdownAgentHostBeforeDispose(
			async () => {
				steps.push('protocol drain');
			},
			async () => {
				steps.push('provider shutdown');
			},
			() => {
				steps.push('persistence flush');
				return [Promise.resolve()];
			},
			3000,
			new NullLogService(),
		);

		assert.deepStrictEqual(steps, ['protocol drain', 'provider shutdown', 'persistence flush']);
	});

	test('a failed provider shutdown still flushes persistence', async () => {
		let persistenceFlushed = false;

		await shutdownAgentHostBeforeDispose(
			() => Promise.resolve(),
			() => Promise.reject(new Error('provider unavailable')),
			() => {
				persistenceFlushed = true;
				return [Promise.resolve()];
			},
			3000,
			new NullLogService(),
		);

		assert.strictEqual(persistenceFlushed, true);
	});
});
