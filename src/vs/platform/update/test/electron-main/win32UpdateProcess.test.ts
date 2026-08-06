/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Win32UpdateProcess } from '../../electron-main/win32UpdateProcess.js';

class TestUpdateChildProcess extends EventEmitter {
	readonly pid = 123;
	exitCode: number | null = null;

	exit(code: number | null, signal: NodeJS.Signals | null = null): void {
		this.exitCode = code;
		this.emit('exit', code, signal);
	}

	fail(error: Error): void {
		this.emit('error', error);
	}
}

suite('Win32UpdateProcess', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
	});

	test('reports process exit', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());

		childProcess.exit(7, 'SIGTERM');

		assert.deepStrictEqual(await updateProcess.whenTerminated, {
			type: 'exit',
			code: 7,
			signal: 'SIGTERM'
		});
	});

	test('reports process errors', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());
		const error = new Error('spawn failed');

		childProcess.fail(error);

		assert.deepStrictEqual(await updateProcess.whenTerminated, {
			type: 'error',
			error
		});
	});

	test('uses only the first terminal process event', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());
		const error = new Error('spawn failed');

		childProcess.fail(error);
		childProcess.exit(1);

		assert.deepStrictEqual(await updateProcess.whenTerminated, {
			type: 'error',
			error
		});
	});

	test('recognizes an immediately ready update', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());
		let readyChecks = 0;

		const ready = await updateProcess.waitForReady(() => {
			readyChecks++;
			return true;
		}, 0);

		assert.deepStrictEqual({ ready, readyChecks }, { ready: true, readyChecks: 1 });
	});

	test('allows the ready mutex to appear after process exit', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());
		let readyChecks = 0;

		const ready = await updateProcess.waitForReady(() => ++readyChecks === 2, 0);

		assert.deepStrictEqual({ ready, readyChecks }, { ready: true, readyChecks: 2 });
	});

	test('reports when the ready mutex does not appear', async () => {
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = new Win32UpdateProcess(childProcess, () => Promise.resolve());

		const ready = await updateProcess.waitForReady(() => false, 0);

		assert.strictEqual(ready, false);
	});

	test('stops gracefully once for concurrent callers', async () => {
		const childProcess = new TestUpdateChildProcess();
		let cancellationCount = 0;
		let killCount = 0;
		const updateProcess = new Win32UpdateProcess(
			childProcess,
			async () => { cancellationCount++; },
			async () => { killCount++; }
		);

		const firstStop = updateProcess.stop();
		const secondStop = updateProcess.stop();
		childProcess.exit(0);

		assert.deepStrictEqual({
			samePromise: firstStop === secondStop,
			firstResult: await firstStop,
			secondResult: await secondStop,
			cancellationCount,
			killCount
		}, {
			samePromise: true,
			firstResult: { killed: false },
			secondResult: { killed: false },
			cancellationCount: 1,
			killCount: 0
		});
	});

	test('kills the process tree after graceful cancellation times out', async () => {
		const clock = sinon.useFakeTimers();
		const childProcess = new TestUpdateChildProcess();
		const killedPids: number[] = [];
		const updateProcess = new Win32UpdateProcess(
			childProcess,
			() => Promise.resolve(),
			async pid => { killedPids.push(pid); }
		);

		const stopPromise = updateProcess.stop();
		await clock.runAllAsync();
		const result = await stopPromise;

		assert.deepStrictEqual({ result, killedPids }, {
			result: { killed: true },
			killedPids: [123]
		});
	});

	test('continues stopping when signalling cancellation fails', async () => {
		const clock = sinon.useFakeTimers();
		const childProcess = new TestUpdateChildProcess();
		const killedPids: number[] = [];
		const updateProcess = new Win32UpdateProcess(
			childProcess,
			() => Promise.reject(new Error('cancel write failed')),
			async pid => { killedPids.push(pid); }
		);

		const stopPromise = updateProcess.stop();
		await clock.runAllAsync();
		const result = await stopPromise;

		assert.deepStrictEqual({
			cancelError: result.cancelError?.message,
			killed: result.killed,
			killedPids
		}, {
			cancelError: 'cancel write failed',
			killed: true,
			killedPids: [123]
		});
	});

	test('allows stopping to retry after killing the process fails', async () => {
		const clock = sinon.useFakeTimers();
		const childProcess = new TestUpdateChildProcess();
		let killAttempts = 0;
		const updateProcess = new Win32UpdateProcess(
			childProcess,
			() => Promise.resolve(),
			async () => {
				killAttempts++;
				if (killAttempts === 1) {
					throw new Error('kill failed');
				}
			}
		);

		const firstStop = updateProcess.stop();
		await clock.runAllAsync();
		await assert.rejects(firstStop, /kill failed/);
		const secondStop = updateProcess.stop();
		await clock.runAllAsync();
		const secondResult = await secondStop;

		assert.deepStrictEqual({ secondResult, killAttempts }, {
			secondResult: { killed: true },
			killAttempts: 2
		});
	});

	test('does not signal or kill a process that already exited', async () => {
		const childProcess = new TestUpdateChildProcess();
		childProcess.exit(0);
		let cancellationCount = 0;
		let killCount = 0;
		const updateProcess = new Win32UpdateProcess(
			childProcess,
			async () => { cancellationCount++; },
			async () => { killCount++; }
		);

		const result = await updateProcess.stop();

		assert.deepStrictEqual({ result, cancellationCount, killCount }, {
			result: { killed: false },
			cancellationCount: 0,
			killCount: 0
		});
	});
});
