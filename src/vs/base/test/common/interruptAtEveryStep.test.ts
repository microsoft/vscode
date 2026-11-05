/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../common/async.js';
import { CancellationError } from '../../common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../common/lifecycle.js';
import { interruptAtEveryStep } from './interruptAtEveryStep.js';
import { runWithFakedTimers } from './virtualScheduling/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('interruptAtEveryStep', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	async function connect(): Promise<IDisposable> {
		await Promise.resolve();
		return toDisposable(() => { });
	}

	class Session extends Disposable {
		async open(): Promise<void> {
			const connection = await connect();
			if (this._store.isDisposed) {
				connection.dispose();
				return;
			}
			this._register(connection);
		}

		async openWithoutCheck(): Promise<void> {
			// eslint-disable-next-line local/code-no-register-after-await -- the leak that the helper reports
			this._register(await connect());
		}

		async load(errorWhenDisposed: () => Error): Promise<void> {
			await timeout(0);
			if (this._store.isDisposed) {
				throw errorWhenDisposed();
			}
		}
	}

	/** The first line of the error that `promise` rejects with. */
	async function failureOf(promise: Promise<unknown>): Promise<string> {
		try {
			await promise;
			return 'no failure';
		} catch (error) {
			return error.message.split('\n')[0];
		}
	}

	test('reports the step after which a run leaks', async () => {
		const failure = await failureOf(interruptAtEveryStep(store => {
			const session = store.add(new Session());
			return { promise: session.openWithoutCheck(), interrupt: () => session.dispose() };
		}));
		assert.strictEqual(failure, 'Interrupted after 0 steps: There are 1 undisposed disposables!');
	});

	test('interrupts every step once until a run completes', async () => {
		let interrupts = 0;
		const steps = await interruptAtEveryStep(store => {
			const session = store.add(new Session());
			return { promise: session.open(), interrupt: () => { interrupts++; session.dispose(); } };
		});
		assert.strictEqual(interrupts, steps);
	});

	test('reports unexpected errors, but not cancellation of interrupted runs', () => runWithFakedTimers({}, async () => {
		const loadInterrupted = (errorWhenDisposed: () => Error) => interruptAtEveryStep(store => {
			const session = store.add(new Session());
			return { promise: session.load(errorWhenDisposed), interrupt: () => session.dispose() };
		}, { step: 'macrotask' });
		assert.deepStrictEqual({
			cancellation: await failureOf(loadInterrupted(() => new CancellationError())),
			error: await failureOf(loadInterrupted(() => new Error('Session disposed'))),
		}, {
			cancellation: 'no failure',
			error: 'Interrupted after 0 steps: An unexpected error occurred:',
		});
	}));

	test('needs macrotask steps when the operation waits on a timer', () => runWithFakedTimers({}, async () => {
		const loadInterrupted = (step: 'microtask' | 'macrotask') => interruptAtEveryStep(store => {
			const session = store.add(new Session());
			return { promise: session.load(() => new CancellationError()), interrupt: () => session.dispose() };
		}, { step, maxSteps: 3 });
		assert.deepStrictEqual({
			microtask: await failureOf(loadInterrupted('microtask')),
			macrotask: await failureOf(loadInterrupted('macrotask')),
		}, {
			microtask: 'The operation did not complete within 3 steps. If it waits on a timer or on I/O, use `step: \'macrotask\'`.',
			macrotask: 'no failure',
		});
	}));
});
