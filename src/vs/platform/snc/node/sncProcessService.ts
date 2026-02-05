/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ILogService } from '../../../platform/log/common/log.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IProcessOptions, IProcessResult, ISNCProcessService, IVisualizationItem, SNCCommand, SNCStreamMessage, SNCTimingData } from '../common/snc.js';
import { Emitter } from '../../../base/common/event.js';

// Get the directory name equivalent to __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SNCProcessService extends Disposable implements ISNCProcessService {

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	private readonly _onStream = this._register(new Emitter<SNCStreamMessage>());
	public readonly onStream = this._onStream.event;

	private readonly runs = new Map<string, { child: ReturnType<typeof spawn>; buffer: string; stderr: string; timeoutId?: NodeJS.Timeout; ended: boolean; tSpawn: number; tStdinEnd?: number; tStdoutFirst?: number; tFirstItem?: number; tEnd?: number }>();

	async startProgram(content: string, options: IProcessOptions, runId: string): Promise<void> {
		return new Promise<void>((resolve) => {
			try {
				// Path to our Python runner script
				const runnerPath = path.join(__dirname, 'python_runner.py');

				// Spawn the Python runner with working directory; send code via stdin; receive NDJSON on stdout
				// Pass UI event via environment variable if provided
				const env = options.modelsAndEventsJson ?
					{ ...process.env, SNC_MODELS_AND_EVENTS: options.modelsAndEventsJson } :
					process.env;
				const tSpawn = Date.now();
				const child = spawn('python', [runnerPath, options.workingDirectory], { env });

				const state = { child, buffer: '', stderr: '', timeoutId: undefined as NodeJS.Timeout | undefined, ended: false, tSpawn, tStdinEnd: undefined as number | undefined, tStdoutFirst: undefined as number | undefined, tFirstItem: undefined as number | undefined, tEnd: undefined as number | undefined };
				this.runs.set(runId, state);

				// Emit spawn timing message immediately so frontend can track trigger-to-spawn
				this._onStream.fire({
					runId,
					type: 'spawn',
					timing: { spawnTimeMs: tSpawn }
				});

				child.stdout.on('data', (data) => {
					if (!state.tStdoutFirst) {
						state.tStdoutFirst = Date.now();
						try { this.logService.info('SNC timing: stdout first byte', { runId, msFromSpawn: state.tStdoutFirst - state.tSpawn, msFromStdinEnd: typeof state.tStdinEnd === 'number' ? state.tStdoutFirst - state.tStdinEnd : undefined }); } catch { /* ignore */ }
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
									try { this.logService.info('SNC timing: first item parsed', { runId, msFromSpawn: state.tFirstItem - state.tSpawn, msFromStdoutFirst: typeof state.tStdoutFirst === 'number' ? state.tFirstItem - state.tStdoutFirst : undefined }); } catch { /* ignore */ }
								}
								this._onStream.fire({ runId, type: 'item', item: { ...msg.item, runId } as IVisualizationItem });
							} else if (msg && msg.type === 'command' && msg.command) {
								this._onStream.fire({ runId, type: 'command', command: msg.command as SNCCommand });
							} else if (msg && msg.type === 'meta') {
								try { this.logService.info('SNC runner meta', { runId, meta: (msg as any).meta, t: (msg as any).t }); } catch { /* ignore */ }
							} else if ((msg && msg.type === 'end')) {
								state.ended = true;
								state.tEnd = Date.now();
								// Build comprehensive timing data for the end message
								const timing: SNCTimingData = {
									spawnTimeMs: state.tSpawn,
									spawnToStdinEndMs: typeof state.tStdinEnd === 'number' ? state.tStdinEnd - state.tSpawn : undefined,
									spawnToStdoutFirstMs: typeof state.tStdoutFirst === 'number' ? state.tStdoutFirst - state.tSpawn : undefined,
									spawnToFirstItemMs: typeof state.tFirstItem === 'number' ? state.tFirstItem - state.tSpawn : undefined,
									spawnToEndMs: typeof state.tEnd === 'number' ? state.tEnd - state.tSpawn : undefined,
								};
								this._onStream.fire({ runId, type: 'end', result: msg.result as IProcessResult, timing });
								try {
									this.logService.info('SNC timing: run summary', { runId, ...timing });
								} catch { /* ignore */ }
							}
						} catch {
							// Ignore non-JSON or partial lines
						}
					}
				});

				child.stderr.on('data', (data) => {
					state.stderr += data.toString();
				});

				if (options?.timeout) {
					state.timeoutId = setTimeout(() => {
						try { child.kill(); } catch { /* ignore */ }
						if (!state.ended) {
							this._onStream.fire({ runId, type: 'error', error: `Process execution timed out after ${options.timeout}ms` });
						}
						this.runs.delete(runId);
					}, options.timeout);
				}

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
						// Try to parse a final result from any remaining buffered lines
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
				try { this.logService.info('SNC timing: stdin sent', { runId, msFromSpawn: state.tStdinEnd - state.tSpawn }); } catch { /* ignore */ }

				// Resolve once the process is started and input sent
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
		try { state.child.kill(); } catch { /* ignore */ }
		this.runs.delete(runId);
	}
}
