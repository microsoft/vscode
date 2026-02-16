import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProcessOptions, IProcessResult, ISNCProcessService, IVisualizationItem, SNCCommand, SNCStreamMessage, SNCTimingData } from '../common/snc.js';
import { Emitter } from '../../../base/common/event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * A pool worker process. Each worker starts in --pool-worker mode, loads
 * visualizers, and reaches checkpoint 1. It can optionally be advanced to
 * checkpoint 2 by sending an init_imports message. Each worker handles
 * exactly one run then exits.
 */
interface PoolWorker {
	child: ChildProcess;
	buffer: string;
	checkpoint: 1 | 2;
	ready: boolean;
	workingDirectory: string;
	/** For checkpoint 2 workers: the code whose imports are pre-loaded */
	code?: string;
}

/**
 * State for an active run
 */
interface RunState {
	runId: string;
	buffer: string;
	stderr: string;
	timeoutId?: NodeJS.Timeout;
	ended: boolean;
	tSpawn: number;
	tStdinEnd?: number;
	tStdoutFirst?: number;
	tFirstItem?: number;
	tEnd?: number;
}

const CP1_POOL_SIZE = 5;
const CP2_POOL_SIZE = 10;

export class SNCProcessService extends Disposable implements ISNCProcessService {

	private checkpoint1Pool: PoolWorker[] = [];
	private checkpoint2Pool: PoolWorker[] = [];

	/** The code for which checkpoint 2 workers have pre-loaded imports */
	private checkpoint2Code: string = '';

	/** The working directory for the current pool */
	private poolWorkingDirectory: string = '';

	/** The currently executing worker (killed on the next run) */
	private activeWorker: PoolWorker | null = null;

	/** Active runs */
	private readonly runs = new Map<string, RunState>();

	/**
	 * Callbacks waiting for any pool worker to become ready.
	 * Resolved by processWorkerBuffer when a checkpoint_ready message arrives.
	 */
	private readonly workerWaiters: Array<(worker: PoolWorker) => void> = [];

	private _disposed = false;

	constructor() {
		super();
	}

	private readonly _onStream = this._register(new Emitter<SNCStreamMessage>());
	public readonly onStream = this._onStream.event;

	private get runnerPath(): string {
		return path.join(__dirname, 'python_runner.py');
	}

	// -------------------------------------------------------------------
	// Pool management
	// -------------------------------------------------------------------

	/**
	 * Spawn a single pool worker process at checkpoint 1.
	 */
	private spawnWorker(workingDirectory: string): PoolWorker | null {
		try {
			const child = spawn('python', [this.runnerPath, '--pool-worker', workingDirectory]);

			const worker: PoolWorker = {
				child,
				buffer: '',
				checkpoint: 1,
				ready: false,
				workingDirectory,
			};

			child.stdout?.on('data', (data: Buffer) => {
				worker.buffer += data.toString();
				this.processWorkerBuffer(worker);
			});

			child.stderr?.on('data', (_data: Buffer) => {
				// Silently ignore stderr from pool workers
			});

			child.on('error', () => {
				this.removeWorkerFromPool(worker);
			});

			child.on('close', () => {
				this.removeWorkerFromPool(worker);
			});

			return worker;
		} catch {
			return null;
		}
	}

	/**
	 * Ensure both pools are filled to their target sizes.
	 */
	private ensurePoolFilled(workingDirectory: string): void {
		if (this._disposed) { return; }

		// If working directory changed, drain everything and restart
		if (this.poolWorkingDirectory && this.poolWorkingDirectory !== workingDirectory) {
			this.drainAllPools();
		}
		this.poolWorkingDirectory = workingDirectory;

		// Fill checkpoint 1 pool
		while (this.checkpoint1Pool.length < CP1_POOL_SIZE) {
			const worker = this.spawnWorker(workingDirectory);
			if (!worker) { break; }
			this.checkpoint1Pool.push(worker);
		}

		// Fill checkpoint 2 pool (only if we have code to warm with)
		if (this.checkpoint2Code) {
			while (this.checkpoint2Pool.length < CP2_POOL_SIZE) {
				const worker = this.spawnWorker(workingDirectory);
				if (!worker) { break; }
				// The worker starts at checkpoint 1. Once it's ready,
				// processWorkerBuffer will advance it to checkpoint 2
				// (because it's in the checkpoint2Pool).
				worker.code = this.checkpoint2Code;
				this.checkpoint2Pool.push(worker);
			}
		}
	}

	/**
	 * Send init_imports to advance a checkpoint-1-ready worker to checkpoint 2.
	 */
	private warmToCheckpoint2(worker: PoolWorker, code: string): void {
		try {
			const msg = JSON.stringify({ type: 'init_imports', code }) + '\n';
			worker.child.stdin?.write(msg);
			worker.code = code;
			worker.ready = false; // will become ready again when checkpoint_ready(2) arrives
		} catch {
			this.removeWorkerFromPool(worker);
		}
	}

	/**
	 * Kill all checkpoint 2 workers with stale code and refill with new code.
	 */
	private invalidateCheckpoint2Pool(newCode: string): void {
		// Kill all existing CP2 workers (their imports are stale).
		// Do NOT spawn replacements here — they will be spawned lazily
		// after the current run completes (in handleRunMessage).
		// This prevents a spawn storm during rapid code changes.
		for (const worker of this.checkpoint2Pool) {
			try { worker.child.kill(); } catch { /* ignore */ }
		}
		this.checkpoint2Pool = [];
		this.checkpoint2Code = newCode;
	}

	/**
	 * Take a ready worker for the given code. If no worker is ready,
	 * returns a Promise that resolves when one becomes available.
	 */
	private takeReadyWorker(code: string): PoolWorker | Promise<PoolWorker> {
		// Prefer a checkpoint 2 worker with matching code
		if (code === this.checkpoint2Code) {
			const idx = this.checkpoint2Pool.findIndex(w => w.ready);
			if (idx !== -1) {
				return this.checkpoint2Pool.splice(idx, 1)[0];
			}
		}

		// Fall back to a checkpoint 1 worker
		const idx = this.checkpoint1Pool.findIndex(w => w.ready);
		if (idx !== -1) {
			return this.checkpoint1Pool.splice(idx, 1)[0];
		}

		// No workers ready — wait for the next one to reach its checkpoint
		return new Promise<PoolWorker>((resolve) => {
			this.workerWaiters.push(resolve);
		});
	}

	/**
	 * Remove a worker from whichever pool it belongs to.
	 */
	private removeWorkerFromPool(worker: PoolWorker): void {
		let idx = this.checkpoint1Pool.indexOf(worker);
		if (idx !== -1) {
			this.checkpoint1Pool.splice(idx, 1);
			return;
		}
		idx = this.checkpoint2Pool.indexOf(worker);
		if (idx !== -1) {
			this.checkpoint2Pool.splice(idx, 1);
		}
	}

	/**
	 * Kill all workers in both pools.
	 */
	private drainAllPools(): void {
		for (const worker of [...this.checkpoint1Pool, ...this.checkpoint2Pool]) {
			try { worker.child.kill(); } catch { /* ignore */ }
		}
		this.checkpoint1Pool = [];
		this.checkpoint2Pool = [];
	}

	// -------------------------------------------------------------------
	// Worker stdout processing
	// -------------------------------------------------------------------

	/**
	 * Process buffered NDJSON output from a pool worker.
	 */
	private processWorkerBuffer(worker: PoolWorker): void {
		let idx: number;
		while ((idx = worker.buffer.indexOf('\n')) !== -1) {
			const line = worker.buffer.slice(0, idx).trim();
			worker.buffer = worker.buffer.slice(idx + 1);
			if (!line) { continue; }

			try {
				const msg = JSON.parse(line);

				if (msg.type === 'checkpoint_ready') {
					if (msg.checkpoint === 1) {
						// If this worker is destined for CP2, advance it now
						if (this.checkpoint2Pool.includes(worker) && worker.code) {
							this.warmToCheckpoint2(worker, worker.code);
						} else {
							worker.ready = true;
							worker.checkpoint = 1;
							this.resolveNextWaiter(worker);
						}
					} else if (msg.checkpoint === 2) {
						worker.ready = true;
						worker.checkpoint = 2;
						this.resolveNextWaiter(worker);
					}
				} else if (msg.type === 'item' || msg.type === 'command' || msg.type === 'end') {
					const runId = msg.run_id || (msg.item && msg.item.runId);
					if (runId) {
						this.handleRunMessage(runId, msg);
					}
				}
			} catch {
				// Ignore non-JSON lines
			}
		}
	}

	/**
	 * If anyone is waiting for a ready worker, resolve the first waiter.
	 * Only resolves if the worker is still in a pool (not already taken).
	 */
	private resolveNextWaiter(worker: PoolWorker): void {
		if (this.workerWaiters.length === 0) { return; }

		// Remove the worker from its pool before handing it to the waiter
		const inCP1 = this.checkpoint1Pool.indexOf(worker);
		const inCP2 = this.checkpoint2Pool.indexOf(worker);
		if (inCP1 === -1 && inCP2 === -1) { return; }

		if (inCP1 !== -1) { this.checkpoint1Pool.splice(inCP1, 1); }
		if (inCP2 !== -1) { this.checkpoint2Pool.splice(inCP2, 1); }

		const resolve = this.workerWaiters.shift()!;
		resolve(worker);

		// Replenish the pool after handing out a worker
		if (this.poolWorkingDirectory) {
			this.ensurePoolFilled(this.poolWorkingDirectory);
		}
	}

	// -------------------------------------------------------------------
	// Run handling
	// -------------------------------------------------------------------

	/**
	 * Handle a message (item/command/end) for a specific run.
	 */
	private handleRunMessage(runId: string, msg: any): void {
		const state = this.runs.get(runId);
		if (!state) { return; }

		if (msg.type === 'item' && msg.item) {
			if (!state.tFirstItem) {
				state.tFirstItem = Date.now();
			}
			this._onStream.fire({
				runId,
				type: 'item',
				item: { ...msg.item, runId } as IVisualizationItem
			});
		} else if (msg.type === 'command' && msg.command) {
			this._onStream.fire({
				runId,
				type: 'command',
				command: msg.command as SNCCommand
			});
		} else if (msg.type === 'end') {
			state.ended = true;
			state.tEnd = Date.now();
			if (state.timeoutId) {
				clearTimeout(state.timeoutId);
			}
			const timing: SNCTimingData = {
				spawnTimeMs: state.tSpawn,
				spawnToStdinEndMs: typeof state.tStdinEnd === 'number' ? state.tStdinEnd - state.tSpawn : undefined,
				spawnToStdoutFirstMs: typeof state.tStdoutFirst === 'number' ? state.tStdoutFirst - state.tSpawn : undefined,
				spawnToFirstItemMs: typeof state.tFirstItem === 'number' ? state.tFirstItem - state.tSpawn : undefined,
				spawnToEndMs: typeof state.tEnd === 'number' ? state.tEnd - state.tSpawn : undefined,
			};
			this._onStream.fire({
				runId,
				type: 'end',
				result: msg.result as IProcessResult,
				timing
			});
			this.runs.delete(runId);
			this.activeWorker = null;

			// Lazily refill pools after a run completes (not during rapid edits).
			// This is where CP2 workers get spawned after code settles.
			if (this.poolWorkingDirectory && !this._disposed) {
				this.ensurePoolFilled(this.poolWorkingDirectory);
			}
		}
	}

	// -------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------

	/**
	 * Start a program using the process pool.
	 */
	async startProgram(content: string, options: IProcessOptions, runId: string): Promise<void> {
		const tSpawn = Date.now();

		const state: RunState = {
			runId,
			buffer: '',
			stderr: '',
			ended: false,
			tSpawn
		};
		this.runs.set(runId, state);

		this._onStream.fire({
			runId,
			type: 'spawn',
			timing: { spawnTimeMs: tSpawn }
		});

		if (options?.timeout) {
			state.timeoutId = setTimeout(() => {
				if (!state.ended) {
					this._onStream.fire({
						runId,
						type: 'error',
						error: `Process execution timed out after ${options.timeout}ms`
					});
				}
				this.runs.delete(runId);
			}, options.timeout);
		}

		// Kill the currently active worker (stale run).
		// models_and_events carries all UI state forward so nothing is lost.
		if (this.activeWorker) {
			try { this.activeWorker.child.kill(); } catch { /* ignore */ }
			this.activeWorker = null;
		}

		// Ensure pool is seeded for this working directory
		this.ensurePoolFilled(options.workingDirectory);

		// If code changed, invalidate checkpoint 2 workers and warm new ones
		if (content !== this.checkpoint2Code) {
			this.invalidateCheckpoint2Pool(content);
		}

		// Take a ready worker (or wait for one)
		const workerOrPromise = this.takeReadyWorker(content);
		const worker = workerOrPromise instanceof Promise ? await workerOrPromise : workerOrPromise;

		// Send the run command
		try {
			const cmd = JSON.stringify({
				type: 'run',
				run_id: runId,
				code: content,
				models_and_events: options.modelsAndEventsJson || ''
			}) + '\n';
			worker.child.stdin?.write(cmd);
			state.tStdinEnd = Date.now();
			this.activeWorker = worker;
		} catch (_err) {
			this._onStream.fire({ runId, type: 'error', error: 'Failed to write to worker stdin' });
			this.runs.delete(runId);
		}

		// Replenish the pool
		this.ensurePoolFilled(options.workingDirectory);
	}

	async cancel(runId: string): Promise<void> {
		const state = this.runs.get(runId);
		if (!state) { return; }
		if (state.timeoutId) {
			clearTimeout(state.timeoutId);
		}
		// Kill the active worker if it's handling this run
		if (this.activeWorker) {
			try { this.activeWorker.child.kill(); } catch { /* ignore */ }
			this.activeWorker = null;
		}
		this.runs.delete(runId);
	}

	override dispose(): void {
		this._disposed = true;
		if (this.activeWorker) {
			try { this.activeWorker.child.kill(); } catch { /* ignore */ }
			this.activeWorker = null;
		}
		this.drainAllPools();
		this.workerWaiters.length = 0;
		super.dispose();
	}
}
