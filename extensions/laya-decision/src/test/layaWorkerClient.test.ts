/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { HostToWorkerMessage, LoadOptions, WorkerToHostMessage } from '../common/protocol';
import type { ChoiceQuestion } from '../common/types';
import { CancellationError, CancellationTokenLike, LayaWorkerClient, LayaWorkerClientOptions, WorkerProcess } from '../node/layaWorkerClient';

class FakeWorker implements WorkerProcess {
	readonly sent: HostToWorkerMessage[] = [];
	killed = false;
	private messageListener: ((message: WorkerToHostMessage) => void) | undefined;
	private exitListener: ((code: number | null, signal: string | null) => void) | undefined;

	send(message: HostToWorkerMessage): void {
		this.sent.push(message);
	}
	onMessage(listener: (message: WorkerToHostMessage) => void): void {
		this.messageListener = listener;
	}
	onExit(listener: (code: number | null, signal: string | null) => void): void {
		this.exitListener = listener;
	}
	kill(): void {
		this.killed = true;
		this.exitListener?.(null, 'SIGTERM');
	}

	reply(message: WorkerToHostMessage): void {
		this.messageListener?.(message);
	}
	crash(): void {
		this.exitListener?.(1, null);
	}
	lastRequest(type: HostToWorkerMessage['type']): HostToWorkerMessage {
		const message = this.sent.filter(m => m.type === type).at(-1);
		assert.ok(message, `expected a ${type} message`);
		return message;
	}
}

class TestCancellationSource {
	private readonly listeners = new Set<() => unknown>();
	private canceled = false;

	readonly token: CancellationTokenLike = {
		isCancellationRequested: false,
		onCancellationRequested: listener => {
			this.listeners.add(listener);
			return { dispose: () => this.listeners.delete(listener) };
		},
	};

	cancel(): void {
		if (!this.canceled) {
			this.canceled = true;
			(this.token as { isCancellationRequested: boolean }).isCancellationRequested = true;
			for (const listener of [...this.listeners]) {
				listener();
			}
		}
	}
}

const questions = {
	intent: { type: 'choice', instructions: 'What does the user want?', criteria: ['edit', 'ask'] } satisfies ChoiceQuestion,
};

const loadOptions: LoadOptions = { modelDir: '/models/laya', intraOpNumThreads: 2 };

async function waitFor(condition: () => boolean): Promise<void> {
	const deadline = Date.now() + 2000;
	while (!condition() && Date.now() < deadline) {
		await new Promise(resolve => setTimeout(resolve, 1));
	}
	assert.ok(condition(), 'condition was not met');
}

suite('LayaWorkerClient', () => {

	let workers: FakeWorker[];
	let clients: LayaWorkerClient[];

	setup(() => {
		workers = [];
		clients = [];
	});

	teardown(() => {
		for (const client of clients) {
			client.dispose();
		}
	});

	function createClient(overrides: Partial<LayaWorkerClientOptions> = {}): LayaWorkerClient {
		const client = new LayaWorkerClient({
			spawnWorker: () => {
				const worker = new FakeWorker();
				workers.push(worker);
				return worker;
			},
			resolveLoadOptions: async () => loadOptions,
			idleTimeoutMs: () => 0,
			restartDelayMs: 1,
			maxRestartDelayMs: 4,
			...overrides,
		});
		clients.push(client);
		return client;
	}

	async function loadWorker(): Promise<FakeWorker> {
		await waitFor(() => workers.length > 0 && workers.at(-1)!.sent.length > 0);
		const worker = workers.at(-1)!;
		const load = worker.lastRequest('load');
		worker.reply({ type: 'loaded', id: load.id, loadTimeMs: 10 });
		return worker;
	}

	async function answer(worker: FakeWorker, result: unknown = { model: 'laya', answers: {} }): Promise<void> {
		await waitFor(() => worker.sent.some(m => m.type === 'decide'));
		const decide = worker.lastRequest('decide');
		worker.reply({ type: 'result', id: decide.id, result, inferenceTimeMs: 5 });
	}

	test('starts the worker lazily and loads the model once for concurrent requests', async () => {
		const client = createClient();
		assert.strictEqual(workers.length, 0);

		const first = client.decide({ text: 'a' }, questions);
		const second = client.decide({ text: 'b' }, questions);
		const worker = await loadWorker();
		await waitFor(() => worker.sent.filter(m => m.type === 'decide').length === 2);
		for (const message of worker.sent.filter(m => m.type === 'decide')) {
			worker.reply({ type: 'result', id: message.id, result: { model: 'laya', answers: {} }, inferenceTimeMs: 5 });
		}
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			workers: workers.length,
			sent: worker.sent.map(m => m.type),
			load: worker.sent[0].type === 'load' ? worker.sent[0].options : undefined,
			status: client.status,
		}, {
			workers: 1,
			sent: ['load', 'decide', 'decide'],
			load: loadOptions,
			status: { state: 'loaded', modelDir: '/models/laya', loadTimeMs: 10, lastInferenceTimeMs: 5, requestCount: 2, consecutiveFailures: 0 },
		});
	});

	test('rejects empty question sets without starting the worker', async () => {
		const client = createClient();
		await assert.rejects(client.decide({}, {}), /At least one question/);
		assert.strictEqual(workers.length, 0);
	});

	test('surfaces worker errors for a request', async () => {
		const client = createClient();
		const result = client.decide({}, questions);
		const worker = await loadWorker();
		await waitFor(() => worker.sent.some(m => m.type === 'decide'));
		worker.reply({ type: 'error', id: worker.lastRequest('decide').id, message: 'bad input' });
		await assert.rejects(result, /bad input/);
	});

	test('cancellation rejects the caller and drops the late result', async () => {
		const client = createClient();
		const cts = new TestCancellationSource();
		const result = client.decide({}, questions, cts.token);
		const worker = await loadWorker();
		await waitFor(() => worker.sent.some(m => m.type === 'decide'));
		cts.cancel();
		await assert.rejects(result, CancellationError);

		worker.reply({ type: 'result', id: worker.lastRequest('decide').id, result: {}, inferenceTimeMs: 1 });
		assert.strictEqual(client.status.requestCount, 0);
	});

	test('cancellation during load does not abort the shared load', async () => {
		const client = createClient();
		const cts = new TestCancellationSource();
		const canceled = client.decide({}, questions, cts.token);
		const other = client.decide({}, questions);
		await waitFor(() => workers.length === 1 && workers[0].sent.length === 1);
		cts.cancel();
		await assert.rejects(canceled, CancellationError);

		const worker = await loadWorker();
		await answer(worker);
		await other;
		assert.deepStrictEqual(worker.sent.map(m => m.type), ['load', 'decide']);
	});

	test('a crash rejects pending requests and the next request restarts the worker', async () => {
		const client = createClient();
		const result = client.decide({}, questions);
		const first = await loadWorker();
		await waitFor(() => first.sent.some(m => m.type === 'decide'));
		first.crash();
		await assert.rejects(result, /exited unexpectedly/);
		assert.strictEqual(client.status.consecutiveFailures, 1);

		const retry = client.decide({}, questions);
		await waitFor(() => workers.length === 2);
		const second = await loadWorker();
		await answer(second);
		await retry;
		assert.deepStrictEqual(client.status.consecutiveFailures, 0);
	});

	test('a failing load is reported and counted as a failure', async () => {
		const client = createClient();
		const result = client.decide({}, questions);
		await waitFor(() => workers.length === 1 && workers[0].sent.length === 1);
		const worker = workers[0];
		worker.reply({ type: 'error', id: worker.lastRequest('load').id, message: 'missing laya.onnx' });
		await assert.rejects(result, /missing laya.onnx/);
		assert.deepStrictEqual({ killed: worker.killed, status: client.status }, {
			killed: true,
			status: { state: 'unloaded', modelDir: undefined, loadTimeMs: undefined, lastInferenceTimeMs: undefined, requestCount: 0, consecutiveFailures: 1 },
		});
	});

	test('a failure to resolve the model is reported without spawning a worker', async () => {
		const client = createClient({ resolveLoadOptions: async () => { throw new Error('not configured'); } });
		await assert.rejects(client.decide({}, questions), /not configured/);
		assert.strictEqual(workers.length, 0);
	});

	test('unloading during load rejects callers without counting a failure', async () => {
		const client = createClient();
		const result = client.decide({}, questions);
		await waitFor(() => workers.length === 1 && workers[0].sent.length === 1);
		client.unload();
		await assert.rejects(result, /unloaded/);
		assert.deepStrictEqual({ killed: workers[0].killed, state: client.status.state, failures: client.status.consecutiveFailures }, {
			killed: true,
			state: 'unloaded',
			failures: 0,
		});
	});

	test('unloads the worker after the idle timeout', async () => {
		const client = createClient({ idleTimeoutMs: () => 5 });
		const result = client.decide({}, questions);
		const worker = await loadWorker();
		await answer(worker);
		await result;
		assert.strictEqual(client.status.state, 'loaded');

		await new Promise(resolve => setTimeout(resolve, 20));
		assert.deepStrictEqual({ killed: worker.killed, state: client.status.state }, { killed: true, state: 'unloaded' });
	});

	test('rejects requests after dispose', async () => {
		const client = createClient();
		client.dispose();
		await assert.rejects(client.decide({}, questions), /disposed/);
	});
});
