/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as childProcess from 'child_process';
import type { HostToWorkerMessage, LoadOptions, WorkerToHostMessage } from '../common/protocol';
import type { DecisionResult, Question } from '../common/types';

/**
 * Minimal cancellation token, structurally compatible with `vscode.CancellationToken`.
 */
export interface CancellationTokenLike {
	readonly isCancellationRequested: boolean;
	onCancellationRequested(listener: () => unknown): { dispose(): unknown };
}

/**
 * The part of a child process that the client depends on. Abstracted so tests can provide an
 * in-process fake.
 */
export interface WorkerProcess {
	send(message: HostToWorkerMessage): void;
	onMessage(listener: (message: WorkerToHostMessage) => void): void;
	onExit(listener: (code: number | null, signal: string | null) => void): void;
	kill(): void;
}

export interface LayaWorkerClientOptions {
	/** Starts a new worker process. */
	readonly spawnWorker: () => WorkerProcess;
	/** Resolves where the model is and how to run it. Called each time a worker starts. */
	readonly resolveLoadOptions: () => Promise<LoadOptions>;
	/** Milliseconds without requests before the worker is stopped. `0` keeps it running. */
	readonly idleTimeoutMs: () => number;
	/** Base delay before restarting a worker after a failure. Doubles per consecutive failure. */
	readonly restartDelayMs?: number;
	/** Upper bound for the restart delay. */
	readonly maxRestartDelayMs?: number;
	readonly log?: (message: string) => void;
}

export type WorkerState = 'unloaded' | 'loading' | 'loaded';

export interface WorkerStatus {
	readonly state: WorkerState;
	readonly modelDir: string | undefined;
	readonly loadTimeMs: number | undefined;
	readonly lastInferenceTimeMs: number | undefined;
	readonly requestCount: number;
	readonly consecutiveFailures: number;
}

export class CancellationError extends Error {
	constructor() {
		super('Canceled');
		this.name = 'Canceled';
	}
}

interface PendingRequest {
	resolve(message: WorkerToHostMessage): void;
	reject(error: Error): void;
}

interface RunningWorker {
	process: WorkerProcess | undefined;
	ready: Promise<void>;
	modelDir: string | undefined;
	loaded: boolean;
	stopping: boolean;
	failed: boolean;
}

/**
 * Owns the lifecycle of the model worker process: starts it lazily on the first request, loads
 * the model, forwards requests, stops it after an idle period, and restarts it with backoff
 * after a crash.
 */
export class LayaWorkerClient {

	private worker: RunningWorker | undefined;
	private readonly pending = new Map<number, PendingRequest>();
	private nextRequestId = 1;
	private activeRequests = 0;
	private idleTimer: ReturnType<typeof setTimeout> | undefined;
	private consecutiveFailures = 0;
	private lastFailureTime = 0;
	private loadTimeMs: number | undefined;
	private lastInferenceTimeMs: number | undefined;
	private requestCount = 0;
	private disposed = false;

	constructor(private readonly options: LayaWorkerClientOptions) { }

	get status(): WorkerStatus {
		return {
			state: !this.worker ? 'unloaded' : this.worker.loaded ? 'loaded' : 'loading',
			modelDir: this.worker?.modelDir,
			loadTimeMs: this.worker?.loaded ? this.loadTimeMs : undefined,
			lastInferenceTimeMs: this.lastInferenceTimeMs,
			requestCount: this.requestCount,
			consecutiveFailures: this.consecutiveFailures,
		};
	}

	/**
	 * Answers every question about `state` in one forward pass of the model.
	 */
	async decide<Q extends Record<string, Question>>(state: unknown, questions: Q, token?: CancellationTokenLike): Promise<DecisionResult<Q>> {
		if (this.disposed) {
			throw new Error('The Laya worker client has been disposed.');
		}
		if (Object.keys(questions).length === 0) {
			throw new Error('At least one question is required.');
		}

		this.clearIdleTimer();
		this.activeRequests++;
		try {
			const worker = await raceCancellation(this.ensureWorker(), token);
			const response = await this.request(worker, id => ({ type: 'decide', id, state, questions }), token);
			if (response.type !== 'result') {
				throw new Error(`Unexpected response from the Laya worker: ${response.type}`);
			}
			this.requestCount++;
			this.lastInferenceTimeMs = response.inferenceTimeMs;
			return response.result as DecisionResult<Q>;
		} finally {
			this.activeRequests--;
			if (this.activeRequests === 0) {
				this.scheduleIdleUnload();
			}
		}
	}

	/**
	 * Stops the worker process and releases the model. The next request starts it again.
	 */
	unload(): void {
		this.clearIdleTimer();
		const worker = this.worker;
		if (!worker) {
			return;
		}
		this.options.log?.('Unloading model.');
		worker.stopping = true;
		this.worker = undefined;
		this.rejectAllPending(new Error('The Laya model was unloaded.'));
		worker.process?.kill();
	}

	dispose(): void {
		this.disposed = true;
		this.unload();
	}

	private ensureWorker(): Promise<RunningWorker> {
		if (!this.worker) {
			const worker: RunningWorker = { process: undefined, ready: Promise.resolve(), modelDir: undefined, loaded: false, stopping: false, failed: false };
			worker.ready = this.startWorker(worker).catch(error => {
				if (!worker.stopping) {
					this.markFailed(worker);
				}
				if (this.worker === worker) {
					worker.stopping = true;
					this.worker = undefined;
					worker.process?.kill();
				}
				throw error;
			});
			// Avoid unhandled rejections when every caller canceled before the load failed.
			worker.ready.catch(() => undefined);
			this.worker = worker;
		}
		const worker = this.worker;
		return worker.ready.then(() => worker);
	}

	/**
	 * Spawns the process and loads the model. Not cancellable by an individual caller, because
	 * concurrent requests share the same load.
	 */
	private async startWorker(worker: RunningWorker): Promise<void> {
		const delay = this.getRestartDelay();
		if (delay > 0) {
			this.options.log?.(`Waiting ${delay}ms before restarting the model worker.`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		const loadOptions = await this.options.resolveLoadOptions();
		if (worker.stopping) {
			throw new Error('The Laya model was unloaded.');
		}
		worker.modelDir = loadOptions.modelDir;

		const process = this.options.spawnWorker();
		worker.process = process;
		process.onMessage(message => this.onWorkerMessage(message));
		process.onExit((code, signal) => this.onWorkerExit(worker, code, signal));

		this.options.log?.(`Loading model from ${loadOptions.modelDir} with ${loadOptions.intraOpNumThreads} thread(s).`);
		const response = await this.request(worker, id => ({ type: 'load', id, options: loadOptions }), undefined);
		if (response.type !== 'loaded') {
			throw new Error(`Unexpected response from the Laya worker: ${response.type}`);
		}
		worker.loaded = true;
		this.loadTimeMs = response.loadTimeMs;
		this.consecutiveFailures = 0;
		this.options.log?.(`Model loaded in ${Math.round(response.loadTimeMs)}ms.`);
	}

	private request(worker: RunningWorker, createMessage: (id: number) => HostToWorkerMessage, token: CancellationTokenLike | undefined): Promise<WorkerToHostMessage> {
		if (token?.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}

		const id = this.nextRequestId++;
		return new Promise<WorkerToHostMessage>((resolve, reject) => {
			const cancellation = token?.onCancellationRequested(() => {
				// The worker cannot abort a running inference; drop its result when it arrives.
				this.pending.delete(id);
				reject(new CancellationError());
			});
			this.pending.set(id, {
				resolve: message => {
					cancellation?.dispose();
					resolve(message);
				},
				reject: error => {
					cancellation?.dispose();
					reject(error);
				},
			});
			try {
				if (!worker.process) {
					throw new Error('The Laya model worker is not running.');
				}
				worker.process.send(createMessage(id));
			} catch (error) {
				this.pending.delete(id);
				cancellation?.dispose();
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private onWorkerMessage(message: WorkerToHostMessage): void {
		const pending = this.pending.get(message.id);
		if (!pending) {
			return;
		}
		this.pending.delete(message.id);
		if (message.type === 'error') {
			pending.reject(new Error(message.message));
		} else {
			pending.resolve(message);
		}
	}

	private onWorkerExit(worker: RunningWorker, code: number | null, signal: string | null): void {
		if (worker.stopping) {
			return;
		}
		this.options.log?.(`Model worker exited unexpectedly (code: ${code}, signal: ${signal}).`);
		if (this.worker === worker) {
			this.worker = undefined;
		}
		this.markFailed(worker);
		this.rejectAllPending(new Error(`The Laya model worker exited unexpectedly (code: ${code}, signal: ${signal}).`));
	}

	private markFailed(worker: RunningWorker): void {
		if (worker.failed) {
			return;
		}
		worker.failed = true;
		this.consecutiveFailures++;
		this.lastFailureTime = Date.now();
	}

	private getRestartDelay(): number {
		if (this.consecutiveFailures === 0) {
			return 0;
		}
		const base = this.options.restartDelayMs ?? 1000;
		const max = this.options.maxRestartDelayMs ?? 30_000;
		const delay = Math.min(base * 2 ** (this.consecutiveFailures - 1), max);
		return Math.max(0, this.lastFailureTime + delay - Date.now());
	}

	private rejectAllPending(error: Error): void {
		const pending = [...this.pending.values()];
		this.pending.clear();
		for (const request of pending) {
			request.reject(error);
		}
	}

	private scheduleIdleUnload(): void {
		this.clearIdleTimer();
		const timeout = this.options.idleTimeoutMs();
		if (timeout <= 0 || !this.worker) {
			return;
		}
		this.idleTimer = setTimeout(() => {
			this.idleTimer = undefined;
			if (this.activeRequests === 0) {
				this.options.log?.('Model idle; unloading.');
				this.unload();
			}
		}, timeout);
	}

	private clearIdleTimer(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = undefined;
		}
	}
}

function raceCancellation<T>(promise: Promise<T>, token: CancellationTokenLike | undefined): Promise<T> {
	if (!token) {
		return promise;
	}
	if (token.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}
	return new Promise<T>((resolve, reject) => {
		const listener = token.onCancellationRequested(() => {
			listener.dispose();
			reject(new CancellationError());
		});
		promise.then(value => {
			listener.dispose();
			resolve(value);
		}, error => {
			listener.dispose();
			reject(error);
		});
	});
}

/**
 * Starts the worker script as a Node child process with an IPC channel.
 */
export function forkWorker(workerPath: string, log: (message: string) => void): WorkerProcess {
	const child = childProcess.fork(workerPath, [], {
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
		serialization: 'advanced',
	});
	child.stderr?.setEncoding('utf8');
	child.stderr?.on('data', (data: string) => log(`[worker] ${data.trimEnd()}`));
	child.on('error', error => log(`Model worker error: ${error.message}`));
	return {
		send: message => {
			if (!child.connected) {
				throw new Error('The Laya model worker is not running.');
			}
			child.send(message);
		},
		onMessage: listener => child.on('message', message => listener(message as WorkerToHostMessage)),
		onExit: listener => child.on('exit', listener),
		kill: () => {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill();
			}
		},
	};
}
