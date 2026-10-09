/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { ChildProcess, spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { NativeExitObserver, validateNativeExitRecord, type INativeExitRecord } from './nativeExitObserver.ts';

function child(): ChildProcess {
	return Object.assign(new ChildProcess(), {
		pid: 12345, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
	});
}

test('only the exact named native runtime is matched', () => {
	const observer = new NativeExitObserver(() => { }, '/probe/copilot-runtime.exe');
	try {
		assert.ok(observer.matchesRuntime('/probe/copilot-runtime.exe'));
		assert.ok(!observer.matchesRuntime('/other/copilot-runtime.exe'));
		assert.ok(!observer.matchesRuntime('/probe/node.exe'));
	} finally {
		observer.dispose();
	}
});

test('a spontaneous owned exit stays fatal even when followed by host cleanup', () => {
	const records: INativeExitRecord[] = [];
	const observer = new NativeExitObserver(record => records.push(record), '/probe/copilot-runtime.exe');
	const native = child();
	try {
		observer.observeChild(native, 1);
		native.stdout!.emit('end');
		native.emit('exit', 3221225477, null);
		native.emit('close', 3221225477, null);
		assert.deepStrictEqual(records.filter(record => record.event === 'exit').map(({ exitCode, stopRequested, unexpected }) => ({ exitCode, stopRequested, unexpected })), [{ exitCode: 3221225477, stopRequested: false, unexpected: true }]);
		assert.equal(native.listenerCount('exit'), 0);
		assert.equal(native.stdout!.listenerCount('end'), 0);
	} finally {
		observer.dispose();
	}
});

test('explicit stop is distinguishable and preserves the original return promise', async () => {
	const records: INativeExitRecord[] = [];
	const observer = new NativeExitObserver(record => records.push(record), '/probe/copilot-runtime.exe');
	const native = child();
	const result = Promise.resolve<Error[]>([]);
	class Client {
		start(): Promise<void> { observer.observeChild(native, 1); return Promise.resolve(); }
		stop(): Promise<Error[]> { return result; }
		forceStop(): Promise<void> { return Promise.resolve(); }
	}
	const originalStart = Client.prototype.start;
	const originalStop = Client.prototype.stop;
	try {
		observer.install(Client.prototype);
		const client = new Client();
		await client.start();
		assert.equal(client.stop(), result);
		native.emit('exit', 0, null);
		assert.deepStrictEqual(records.filter(record => record.event === 'exit').map(({ stopRequested, unexpected }) => ({ stopRequested, unexpected })), [{ stopRequested: true, unexpected: false }]);
	} finally {
		observer.dispose();
	}
	assert.equal(Client.prototype.start, originalStart);
	assert.equal(Client.prototype.stop, originalStop);
	assert.equal(native.listenerCount('exit'), 0);
});

test('already exited children are observed once and listener registration is not deferred', () => {
	const records: INativeExitRecord[] = [];
	const observer = new NativeExitObserver(record => records.push(record), '/probe/copilot-runtime.exe');
	const native = Object.assign(child(), { exitCode: 7 });
	try {
		observer.observeChild(native, 1);
		native.emit('exit', 7, null);
		assert.equal(records.filter(record => record.event === 'exit').length, 1);
		assert.equal(records.find(record => record.event === 'exit')?.unexpected, true);
	} finally {
		observer.dispose();
	}
	assert.equal(native.listenerCount('exit'), 0);
});

test('schema rejects error text, paths, arguments, environment, and forged signal content', () => {
	const safe: INativeExitRecord = {
		timestamp: new Date().toISOString(), event: 'exit', hostPid: 1, nativePid: 2,
		clientInstance: 1, processInstance: 1, exitCode: 0, signal: null, unexpected: true,
	};
	validateNativeExitRecord(safe);
	for (const extra of [{ stderr: 'secret' }, { args: ['secret'] }, { env: { secret: 'secret' } }, { path: '/private' }, { signal: 'private content' }, { event: 'private content' }]) {
		assert.throws(() => validateNativeExitRecord({ ...safe, ...extra }));
	}
});

test('unrelated real subprocesses are not observed or altered', async () => {
	const records: INativeExitRecord[] = [];
	const observer = new NativeExitObserver(record => records.push(record), '/probe/copilot-runtime.exe');
	class Client {
		start(): Promise<void> {
			const unrelated = spawn(process.execPath, ['-e', 'process.stdout.write("private-sentinel")']);
			unrelated.stdout.resume();
			unrelated.stderr.resume();
			return new Promise<void>((done, reject) => {
				unrelated.once('error', reject);
				unrelated.once('close', code => code === 0 ? done() : reject(new Error('Calibration child failed')));
			});
		}
		stop(): Promise<Error[]> { return Promise.resolve([]); }
		forceStop(): Promise<void> { return Promise.resolve(); }
	}
	try {
		observer.install(Client.prototype);
		await new Client().start();
		assert.deepStrictEqual(records.map(record => record.event), ['observerReady']);
		assert.ok(!JSON.stringify(records).includes('private-sentinel'));
	} finally {
		observer.dispose();
	}
});
