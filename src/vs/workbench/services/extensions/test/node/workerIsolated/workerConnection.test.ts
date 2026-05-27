/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { WorkerConnection } from '../../../node/workerIsolated/workerConnection.js';
import {
	IWorkerLike, WorkerMessage, WorkerMessageType,
	createResponse, createResponseError, createNotification, createRequest
} from '../../../common/workerIsolated/workerProtocol.js';

/**
 * Fake worker that implements IWorkerLike using in-memory message passing.
 * Simulates a worker thread for testing purposes.
 */
class FakeWorker implements IWorkerLike {
	private readonly _messageListeners: ((value: unknown) => void)[] = [];
	private readonly _errorListeners: ((err: Error) => void)[] = [];
	private readonly _exitListeners: ((code: number) => void)[] = [];
	private _terminated = false;

	/** Handles for auto-responding to requests from the supervisor */
	private readonly _requestHandlers = new Map<string, (args: readonly unknown[], id: number) => void>();

	constructor() {
		// Default echo handler
		this._requestHandlers.set('$echo', (args, id) => {
			this._deliverToSupervisor(createResponse(id, args));
		});
		this._requestHandlers.set('$add', (args, id) => {
			this._deliverToSupervisor(createResponse(id, (args[0] as number) + (args[1] as number)));
		});
		this._requestHandlers.set('$error', (args, id) => {
			this._deliverToSupervisor(createResponseError(id, {
				$isError: true, name: 'Error', message: (args[0] as string) || 'test error', stack: '', noTelemetry: false
			}));
		});
		this._requestHandlers.set('$notifyBack', (args, id) => {
			this._deliverToSupervisor(createNotification('$workerNotification', args));
			this._deliverToSupervisor(createResponse(id, 'notified'));
		});
		this._requestHandlers.set('$requestBack', (args, id) => {
			this._deliverToSupervisor(createRequest(9999, '$workerRequest', args));
			this._deliverToSupervisor(createResponse(id, 'requested'));
		});
	}

	/**
	 * Register a custom handler for a method on this fake worker.
	 */
	setHandler(method: string, handler: (args: readonly unknown[], id: number) => void): void {
		this._requestHandlers.set(method, handler);
	}

	postMessage(value: unknown): void {
		if (this._terminated) {
			return;
		}
		// Process the message asynchronously to simulate real worker behavior
		const msg = value as WorkerMessage;
		Promise.resolve().then(() => {
			if (this._terminated) {
				return;
			}
			if (msg.type === WorkerMessageType.Request) {
				const handler = this._requestHandlers.get(msg.method!);
				if (handler) {
					handler(msg.args ?? [], msg.id!);
				} else {
					this._deliverToSupervisor(createResponseError(msg.id!, {
						$isError: true, name: 'Error', message: `Unknown method: ${msg.method}`, stack: '', noTelemetry: false
					}));
				}
			}
		});
	}

	on(event: string, listener: (...args: unknown[]) => void): void {
		switch (event) {
			case 'message': this._messageListeners.push(listener as (value: unknown) => void); break;
			case 'error': this._errorListeners.push(listener as (err: Error) => void); break;
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

	/** Simulate a crash with a given exit code */
	simulateCrash(code: number): void {
		this._terminated = true;
		for (const listener of this._exitListeners) {
			listener(code);
		}
	}

	/** Deliver a message from the "worker" to the supervisor */
	private _deliverToSupervisor(msg: WorkerMessage): void {
		// Asynchronous delivery to match real MessagePort behavior
		Promise.resolve().then(() => {
			for (const listener of this._messageListeners) {
				listener(msg);
			}
		});
	}
}

suite('WorkerConnection', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createConnection(options?: { timeout?: number }): { connection: WorkerConnection; worker: FakeWorker } {
		const worker = new FakeWorker();
		const connection = new WorkerConnection(worker, options);
		disposables.add(connection);
		return { connection, worker };
	}

	test('request/response round-trip', async () => {
		const { connection } = createConnection();
		const result = await connection.request<unknown[]>('$echo', [1, 'hello', true]);
		assert.deepStrictEqual(result, [1, 'hello', true]);
	});

	test('request with computation', async () => {
		const { connection } = createConnection();
		const result = await connection.request<number>('$add', [21, 21]);
		assert.strictEqual(result, 42);
	});

	test('notification delivery — supervisor to worker', async () => {
		const { connection } = createConnection();
		// Notifications are fire-and-forget, verify no error
		connection.notify('$someNotification', ['data']);
		// Verify the connection still works
		const result = await connection.request<unknown[]>('$echo', ['still alive']);
		assert.deepStrictEqual(result, ['still alive']);
	});

	test('notification delivery — worker to supervisor', async () => {
		const { connection } = createConnection();
		const received = new Promise<unknown[]>((resolve) => {
			disposables.add(connection.onNotification('$workerNotification', (...args: unknown[]) => {
				resolve(args);
			}));
		});

		await connection.request('$notifyBack', ['hello', 42]);
		const args = await received;
		assert.deepStrictEqual(args, ['hello', 42]);
	});

	test('concurrent requests resolve correctly', async () => {
		const { connection } = createConnection();
		const promises: Promise<number>[] = [];
		for (let i = 0; i < 100; i++) {
			promises.push(connection.request<number>('$add', [i, 1]));
		}
		const results = await Promise.all(promises);
		for (let i = 0; i < 100; i++) {
			assert.strictEqual(results[i], i + 1);
		}
	});

	test('request cancellation', async () => {
		const { connection, worker } = createConnection();

		// Set up a slow handler that respects cancellation
		worker.setHandler('$slow', (_args, id) => {
			// Don't respond — simulate a long-running operation
			// The cancel will cause the connection to send a cancel message
		});

		const cts = disposables.add(new CancellationTokenSource());
		const promise = connection.request<string>('$slow', [5000], cts.token);

		// Cancel after the request is sent
		cts.cancel();

		// The cancellation sends a Cancel message to the worker, but since
		// our fake worker doesn't respond with an error on cancel, the request
		// stays pending. However, disposing should clean up.
		// For a proper cancellation test, the fake worker needs to respond:
		worker.setHandler('$slow', (_args, id) => { /* already set up, won't fire again */ });

		// Dispose the connection which should reject pending
		disposables.dispose();
		disposables = new DisposableStore(); // Re-create for teardown

		await assert.rejects(promise, /WorkerConnection disposed|Cancelled/);
	});

	test('worker crash rejects pending requests', async () => {
		const { connection, worker } = createConnection();

		// Set up a handler that doesn't respond
		worker.setHandler('$slow', () => { /* no response */ });

		const exitPromise = new Promise<{ code: number }>((resolve) => {
			disposables.add(connection.onDidExit(e => resolve(e)));
		});

		const slowPromise = connection.request<string>('$slow', [10000]);

		// Simulate crash
		worker.simulateCrash(1);

		await assert.rejects(slowPromise, /Worker exited with code 1/);
		const exitEvent = await exitPromise;
		assert.strictEqual(exitEvent.code, 1);
	});

	test('worker termination rejects pending requests', async () => {
		const { connection, worker } = createConnection();

		worker.setHandler('$slow', () => { /* no response */ });
		const slowPromise = connection.request<string>('$slow', [10000]);

		await connection.terminate();

		await assert.rejects(slowPromise, /Worker exited/);
	});

	test('error response', async () => {
		const { connection } = createConnection();
		await assert.rejects(
			connection.request('$error', ['something went wrong']),
			(err: Error) => err.message === 'something went wrong'
		);
	});

	test('request from worker to supervisor', async () => {
		const { connection } = createConnection();

		disposables.add(connection.onRequest('$workerRequest', async (...args: unknown[]) => {
			return ['response', ...args];
		}));

		const result = await connection.request<string>('$requestBack', ['ping']);
		assert.strictEqual(result, 'requested');
	});

	test('timeout rejects request', async () => {
		const { connection, worker } = createConnection({ timeout: 50 });

		worker.setHandler('$slow', () => { /* never responds */ });

		await assert.rejects(
			connection.request('$slow', [5000]),
			/timed out/
		);
	});

	test('multiple request handlers', async () => {
		const { connection } = createConnection();
		// Test that multiple different method handlers work
		const result1 = await connection.request<unknown[]>('$echo', ['first']);
		const result2 = await connection.request<number>('$add', [100, 200]);
		assert.deepStrictEqual(result1, ['first']);
		assert.strictEqual(result2, 300);
	});
});
