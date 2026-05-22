/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { WorkerRegistry } from '../../../node/workerIsolated/workerRegistry.js';
import {
	IWorkerLike, WorkerMessage, WorkerMessageType,
	createResponse, createResponseError
} from '../../../common/workerIsolated/workerProtocol.js';

/**
 * Fake worker for registry tests.
 */
class FakeWorker implements IWorkerLike {
	private readonly _messageListeners: ((value: unknown) => void)[] = [];
	private readonly _exitListeners: ((code: number) => void)[] = [];
	private _terminated = false;

	postMessage(value: unknown): void {
		if (this._terminated) {
			return;
		}
		const msg = value as WorkerMessage;
		Promise.resolve().then(() => {
			if (this._terminated) {
				return;
			}
			if (msg.type === WorkerMessageType.Request) {
				if (msg.method === '$add') {
					this._deliver(createResponse(msg.id!, (msg.args![0] as number) + (msg.args![1] as number)));
				} else if (msg.method === '$exit') {
					this.simulateCrash(msg.args![0] as number);
				} else {
					this._deliver(createResponseError(msg.id!, {
						$isError: true, name: 'Error', message: `Unknown: ${msg.method}`, stack: '', noTelemetry: false
					}));
				}
			}
		});
	}

	on(event: string, listener: (...args: unknown[]) => void): void {
		switch (event) {
			case 'message': this._messageListeners.push(listener as (value: unknown) => void); break;
			case 'error': break;
			case 'exit': this._exitListeners.push(listener as (code: number) => void); break;
		}
	}

	async terminate(): Promise<number> {
		this._terminated = true;
		for (const listener of this._exitListeners) {
			listener(0);
		}
		return 0;
	}

	simulateCrash(code: number): void {
		this._terminated = true;
		for (const listener of this._exitListeners) {
			listener(code);
		}
	}

	private _deliver(msg: WorkerMessage): void {
		Promise.resolve().then(() => {
			for (const listener of this._messageListeners) {
				listener(msg);
			}
		});
	}
}

suite('WorkerRegistry', () => {

	let disposables: DisposableStore;
	let registry: WorkerRegistry;
	const fakeWorkers: FakeWorker[] = [];

	setup(() => {
		disposables = new DisposableStore();
		fakeWorkers.length = 0;
		registry = disposables.add(new WorkerRegistry((_scriptPath: string) => {
			const w = new FakeWorker();
			fakeWorkers.push(w);
			return w;
		}));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('create and use a worker', async () => {
		const extId = new ExtensionIdentifier('test.extension-a');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		const result = await conn.request<number>('$add', [10, 20]);
		assert.strictEqual(result, 30);
	});

	test('get existing worker', () => {
		const extId = new ExtensionIdentifier('test.extension-a');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		const retrieved = registry.getWorker(extId);
		assert.strictEqual(retrieved, conn);
	});

	test('get non-existent worker returns undefined', () => {
		const extId = new ExtensionIdentifier('test.nonexistent');
		assert.strictEqual(registry.getWorker(extId), undefined);
	});

	test('duplicate worker creation throws', () => {
		const extId = new ExtensionIdentifier('test.extension-a');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		assert.throws(() => {
			registry.createWorker(extId, 'unused.js');
		}, /already exists/);
	});

	test('terminate a single worker', async () => {
		const extId = new ExtensionIdentifier('test.extension-a');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		await registry.terminateWorker(extId);
		assert.strictEqual(registry.getWorker(extId), undefined);
	});

	test('terminate non-existent worker is no-op', async () => {
		await registry.terminateWorker(new ExtensionIdentifier('test.nonexistent'));
		// Should not throw
	});

	test('create 3 workers, terminate 1, others still work', async () => {
		const idA = new ExtensionIdentifier('test.ext-a');
		const idB = new ExtensionIdentifier('test.ext-b');
		const idC = new ExtensionIdentifier('test.ext-c');

		const connA = registry.createWorker(idA, 'unused.js');
		const connB = registry.createWorker(idB, 'unused.js');
		const connC = registry.createWorker(idC, 'unused.js');
		disposables.add(connA);
		disposables.add(connB);
		disposables.add(connC);

		// Verify all work
		assert.strictEqual(await connA.request<number>('$add', [1, 1]), 2);
		assert.strictEqual(await connB.request<number>('$add', [2, 2]), 4);
		assert.strictEqual(await connC.request<number>('$add', [3, 3]), 6);

		// Terminate B
		await registry.terminateWorker(idB);

		// A and C still work
		assert.strictEqual(await connA.request<number>('$add', [10, 10]), 20);
		assert.strictEqual(await connC.request<number>('$add', [30, 30]), 60);

		// B is gone
		assert.strictEqual(registry.getWorker(idB), undefined);
	});

	test('terminateAll terminates all workers', async () => {
		const idA = new ExtensionIdentifier('test.ext-a');
		const idB = new ExtensionIdentifier('test.ext-b');

		const connA = registry.createWorker(idA, 'unused.js');
		const connB = registry.createWorker(idB, 'unused.js');
		disposables.add(connA);
		disposables.add(connB);

		await registry.terminateAll();

		assert.strictEqual(registry.getWorker(idA), undefined);
		assert.strictEqual(registry.getWorker(idB), undefined);
		assert.strictEqual(registry.workers.size, 0);
	});

	test('worker exit event fires', async () => {
		const extId = new ExtensionIdentifier('test.extension-a');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		const exitPromise = new Promise<{ extensionId: ExtensionIdentifier; code: number }>((resolve) => {
			disposables.add(registry.onDidWorkerExit(e => resolve(e)));
		});

		// Simulate a crash
		fakeWorkers[0].simulateCrash(42);

		const exitEvent = await exitPromise;
		assert.strictEqual(ExtensionIdentifier.equals(exitEvent.extensionId, extId), true);
		assert.strictEqual(exitEvent.code, 42);
	});

	test('workers map returns current connections', () => {
		const idA = new ExtensionIdentifier('test.ext-a');
		const idB = new ExtensionIdentifier('test.ext-b');

		const connA = registry.createWorker(idA, 'unused.js');
		const connB = registry.createWorker(idB, 'unused.js');
		disposables.add(connA);
		disposables.add(connB);

		const workers = registry.workers;
		assert.strictEqual(workers.size, 2);
	});

	test('case-insensitive extension ID lookup', () => {
		const extId = new ExtensionIdentifier('Test.Extension-A');
		const conn = registry.createWorker(extId, 'unused.js');
		disposables.add(conn);

		// Look up with different casing
		const retrieved = registry.getWorker(new ExtensionIdentifier('test.extension-a'));
		assert.strictEqual(retrieved, conn);
	});
});
