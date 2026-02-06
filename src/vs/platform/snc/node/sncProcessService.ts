/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProcessOptions, IProcessResult, ISNCProcessService, IVisualizationItem, SNCCommand, SNCStreamMessage, SNCTimingData } from '../common/snc.js';
import { Emitter } from '../../../base/common/event.js';

// Get the directory name equivalent to __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * State tracking for a preloaded Python runner process (Checkpoint 1)
 *
 * Checkpoint 1: Process with visualizers preloaded, ready to receive code.
 * When code is received, it forks a child to transform and execute.
 * The parent remains ready for the next run.
 */
interface PreloadedProcess {
	child: ChildProcess;
	buffer: string;
	visualizersHash: string;
	workingDirectory: string;
	ready: boolean;
	lastUsed: number;
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

export class SNCProcessService extends Disposable implements ISNCProcessService {

	// Preloaded checkpoint 1 process
	private checkpoint1Process: PreloadedProcess | null = null;

	// Active runs
	private readonly runs = new Map<string, RunState>();

	constructor() {
		super();

		// Start preloading a checkpoint 1 process
		this.ensureCheckpoint1Process();
	}

	private readonly _onStream = this._register(new Emitter<SNCStreamMessage>());
	public readonly onStream = this._onStream.event;

	/**
	 * Path to the Python runner script
	 */
	private get runnerPath(): string {
		return path.join(__dirname, 'python_runner.py');
	}

	/**
	 * Ensure we have a checkpoint 1 process ready for the given working directory
	 */
	private ensureCheckpoint1Process(workingDirectory?: string): void {
		const wd = workingDirectory || process.cwd();

		if (this.checkpoint1Process?.ready && this.checkpoint1Process.workingDirectory === wd) {
			return;
		}

		if (this.checkpoint1Process) {
			try { this.checkpoint1Process.child.kill(); } catch { /* ignore */ }
			this.checkpoint1Process = null;
		}

		try {
			const child = spawn('python', [this.runnerPath, '--preload', wd]);

			const preloaded: PreloadedProcess = {
				child,
				buffer: '',
				visualizersHash: '',
				workingDirectory: wd,
				ready: false,
				lastUsed: Date.now()
			};

			this.checkpoint1Process = preloaded;

			child.stdout.on('data', (data) => {
				preloaded.buffer += data.toString();
				this.processPreloadedBuffer(preloaded);
			});

			child.stderr.on('data', (_data) => {
				// Silently ignore stderr from preload process
			});

			child.on('error', (_err) => {
				if (this.checkpoint1Process === preloaded) {
					this.checkpoint1Process = null;
				}
			});

			child.on('close', (_code) => {
				if (this.checkpoint1Process === preloaded) {
					this.checkpoint1Process = null;
				}
			});
		} catch (_err) {
			// Failed to start preload process
		}
	}

	/**
	 * Process buffered output from a preloaded process
	 */
	private processPreloadedBuffer(preloaded: PreloadedProcess): void {
		let idx: number;
		while ((idx = preloaded.buffer.indexOf('\n')) !== -1) {
			const line = preloaded.buffer.slice(0, idx).trim();
			preloaded.buffer = preloaded.buffer.slice(idx + 1);
			if (!line) { continue; }

			try {
				const msg = JSON.parse(line);
				if (msg.type === 'checkpoint_ready') {
					if (msg.checkpoint === 1) {
						preloaded.ready = true;
						preloaded.visualizersHash = msg.visualizers_hash || '';
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
	 * Handle a message for a specific run
	 */
	private handleRunMessage(runId: string, msg: any): void {
		const state = this.runs.get(runId);
		if (!state) {
			return;
		}

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
		}
	}

	/**
	 * Start a program using the preloaded process pool
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

		if (this.checkpoint1Process && this.checkpoint1Process.workingDirectory !== options.workingDirectory) {
			try { this.checkpoint1Process.child.kill(); } catch { /* ignore */ }
			this.checkpoint1Process = null;
		}

		if (this.checkpoint1Process?.ready) {
			try {
				const cmd = JSON.stringify({
					type: 'run',
					run_id: runId,
					code: content,
					models_and_events: options.modelsAndEventsJson || ''
				}) + '\n';
				this.checkpoint1Process.child.stdin?.write(cmd);
				this.checkpoint1Process.lastUsed = Date.now();
				state.tStdinEnd = Date.now();
				return;
			} catch (_err) {
				this.checkpoint1Process = null;
			}
		}

		await this.startProgramDirect(content, options, runId, state);
		this.ensureCheckpoint1Process(options.workingDirectory);
	}

	/**
	 * Start a program using direct spawn (fallback)
	 */
	private async startProgramDirect(content: string, options: IProcessOptions, runId: string, state: RunState): Promise<void> {
		return new Promise<void>((resolve) => {
			try {
				const env = options.modelsAndEventsJson ?
					{ ...process.env, SNC_MODELS_AND_EVENTS: options.modelsAndEventsJson } :
					process.env;

				const child = spawn('python', [this.runnerPath, options.workingDirectory], { env });

				child.stdout.on('data', (data) => {
					if (!state.tStdoutFirst) {
						state.tStdoutFirst = Date.now();
					}
					state.buffer += data.toString();
					let idx: number;
					while ((idx = state.buffer.indexOf('\n')) !== -1) {
						const line = state.buffer.slice(0, idx).trim();
						state.buffer = state.buffer.slice(idx + 1);
						if (!line) { continue; }
						try {
							const msg = JSON.parse(line);
							if (msg && msg.type === 'item' && msg.item) {
								if (!state.tFirstItem) {
									state.tFirstItem = Date.now();
								}
								this._onStream.fire({ runId, type: 'item', item: { ...msg.item, runId } as IVisualizationItem });
							} else if (msg && msg.type === 'command' && msg.command) {
								this._onStream.fire({ runId, type: 'command', command: msg.command as SNCCommand });
							} else if (msg && msg.type === 'end') {
								state.ended = true;
								state.tEnd = Date.now();
								const timing: SNCTimingData = {
									spawnTimeMs: state.tSpawn,
									spawnToStdinEndMs: typeof state.tStdinEnd === 'number' ? state.tStdinEnd - state.tSpawn : undefined,
									spawnToStdoutFirstMs: typeof state.tStdoutFirst === 'number' ? state.tStdoutFirst - state.tSpawn : undefined,
									spawnToFirstItemMs: typeof state.tFirstItem === 'number' ? state.tFirstItem - state.tSpawn : undefined,
									spawnToEndMs: typeof state.tEnd === 'number' ? state.tEnd - state.tSpawn : undefined,
								};
								this._onStream.fire({ runId, type: 'end', result: msg.result as IProcessResult, timing });
							}
						} catch {
							// Ignore non-JSON lines
						}
					}
				});

				child.stderr.on('data', (data) => {
					state.stderr += data.toString();
				});

				child.on('error', (err) => {
					if (state.timeoutId) {
						clearTimeout(state.timeoutId);
					}
					this._onStream.fire({ runId, type: 'error', error: String((err as any)?.message ?? err) });
					this.runs.delete(runId);
				});

				child.on('close', (_code) => {
					if (state.timeoutId) {
						clearTimeout(state.timeoutId);
					}
					if (!state.ended) {
						const lines = state.buffer.trim().split(/\r?\n/).filter(Boolean);
						let endedFromBuffer = false;
						for (let i = lines.length - 1; i >= 0; i--) {
							try {
								const msg = JSON.parse(lines[i]);
								if (msg && (msg.type === 'result' || msg.type === 'end') && msg.result) {
									this._onStream.fire({ runId, type: 'end', result: msg.result as IProcessResult });
									endedFromBuffer = true;
									break;
								}
							} catch {
								// ignore
							}
						}
						if (!endedFromBuffer) {
							const errMsg = state.stderr?.trim() || 'Process closed before emitting result';
							this._onStream.fire({ runId, type: 'error', error: errMsg });
						}
					}
					this.runs.delete(runId);
				});

				child.stdin.write(content);
				child.stdin.end();
				state.tStdinEnd = Date.now();

				resolve();
			} catch (err) {
				this._onStream.fire({ runId, type: 'error', error: String((err as any)?.message ?? err) });
				this.runs.delete(runId);
				resolve();
			}
		});
	}

	async cancel(runId: string): Promise<void> {
		const state = this.runs.get(runId);
		if (!state) {
			return;
		}
		if (state.timeoutId) {
			clearTimeout(state.timeoutId);
		}
		this.runs.delete(runId);
	}

	override dispose(): void {
		if (this.checkpoint1Process) {
			try { this.checkpoint1Process.child.kill(); } catch { /* ignore */ }
			this.checkpoint1Process = null;
		}
		super.dispose();
	}
}
