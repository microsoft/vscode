/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as cp from 'child_process';
import { ipcRenderer } from 'electron';
import { IDisposable } from 'monaco-editor';
import * as path from 'path';
import { AsyncIterableEmitter, AsyncIterableObject } from '../../../../src/util/vs/base/common/async';
import { CancellationToken } from '../../../../src/util/vs/base/common/cancellation';
import { REPO_ROOT } from './utils';

export const SIMULATION_MAIN_PATH = path.join(REPO_ROOT, './dist/simulationMain.js');

export interface ISpawnSimulationOptions {
	args: string[];
	ignoreNonJSONLines?: boolean;
}

export function spawnSimulation<T>(options: ISpawnSimulationOptions, token: CancellationToken = CancellationToken.None): AsyncIterableObject<T> {
	return extractJSONL<T>(forkSimulationMain(options.args, token), options);
}

/** spawn `npm run simulate` from Electron main process */
export function spawnSimulationFromMainProcess<T>(options: ISpawnSimulationOptions, token: CancellationToken = CancellationToken.None): AsyncIterableObject<T> {
	return extractJSONL<T>(forkSimulationMainFromMainProcess(options.args, token), options);
}

let mainRendererEventProcessor: MainProcessEventHandler | undefined;

function forkSimulationMainFromMainProcess(args: string[], token: CancellationToken): AsyncIterableObject<string> {
	if (!mainRendererEventProcessor) {
		mainRendererEventProcessor = new MainProcessEventHandler();
	}
	return mainRendererEventProcessor.spawn(args, token);
}

export function extractJSONL<T>(source: AsyncIterableObject<string>, options?: ISpawnSimulationOptions): AsyncIterableObject<T> {
	return splitToLines(source).map((line): T | null => {
		if (line.length === 0) {
			// always ignore empty lines
			return null;
		}

		if (!line.startsWith('{') || !line.endsWith('}')) {
			if (!options?.ignoreNonJSONLines) {
				console.warn(line);
			}
			return null;
		}

		try {
			const obj = JSON.parse(line);
			return obj as T;
		} catch (err) {
			if (!options?.ignoreNonJSONLines) {
				console.error(`ignoring invalid line: ${line}`);
			}
			return null;
		}
	}).coalesce();
}

/**
 * Split an incoming stream of text to a stream of lines.
 */
function splitToLines(source: AsyncIterable<string>): AsyncIterableObject<string> {
	return new AsyncIterableObject<string>(async (emitter) => {
		let buffer = '';
		for await (const str of source) {
			buffer += str;
			do {
				const newlineIndex = buffer.indexOf('\n');
				if (newlineIndex === -1) {
					break;
				}

				// take the first line
				const line = buffer.substring(0, newlineIndex);
				buffer = buffer.substring(newlineIndex + 1);

				emitter.emitOne(line);
			} while (true);
		}

		if (buffer.length > 0) {
			// last line which doesn't end with \n
			emitter.emitOne(buffer);
		}
	});
}

function forkSimulationMain(args: string[], token: CancellationToken): AsyncIterableObject<string> {
	return new AsyncIterableObject<string>((emitter) => {
		return new Promise<void>((resolve, reject) => {
			const proc = cp.spawn('node', [SIMULATION_MAIN_PATH, ...args], { stdio: 'pipe' });
			const listener = token.onCancellationRequested(() => {
				proc.kill('SIGTERM');
				// FIXME@ulugbekna: let's not reject the promise for now -- otherwise, stdout.json.txt isn't written
				// reject(new CancellationError());
			});
			proc.on('error', (err) => {
				listener.dispose();
				reject(err);
			});
			proc.on('exit', (code, signal) => {
				listener.dispose();
				if (code !== 0) {
					reject(new Error(`Process exited with code ${code}`));
					return;
				}
				resolve();
			});
			proc.stdout?.setEncoding('utf8');
			proc.stdout?.on('data', (data) => {
				emitter?.emitOne(data);
			});

			proc.stderr?.setEncoding('utf8');
			proc.stderr?.on('data', (data) => {
				console.error(data);
			});
		});
	});
}

type MainProcessEventHandle = {
	emitter: AsyncIterableEmitter<string>;
	cancellationListener: IDisposable;
	resolve: () => void;
	reject: (reason?: string) => void;
	stderrChunks: string[];
};

// change to configure logging, e.g., to `console.debug`
const log = {
	debug: (...args: any) => { }
};

class MainProcessEventHandler {

	private i: number;
	private idMap: Map<number, MainProcessEventHandle>;

	constructor() {
		this.i = 0;
		this.idMap = new Map<number, MainProcessEventHandle>();

		ipcRenderer.on('stdout-data', (_event, { id, data }) => {
			log.debug(`stdout-data (ID ${id}): ${data.toString()}`);
			const handle = this.getHandleOrThrow(id);
			handle.emitter.emitOne(data);
		});

		ipcRenderer.on('stderr-data', (_event, { id, data }) => {
			console.warn(`stderr-data (ID ${id}): ${data.toString()}`);
			const handle = this.idMap.get(id);
			if (!handle) {
				return;
			}
			handle.stderrChunks.push(data.toString());
		});

		ipcRenderer.on('process-exit', (_event, { id, code }) => {
			log.debug(`process exit (ID ${id}) with code ${code}`);
			const handle = this.getHandleOrThrow(id);
			this.idMap.delete(id);
			handle.cancellationListener.dispose();
			if (code === 0) {
				handle.resolve();
			} else {
				const stderr = handle.stderrChunks.join('');
				handle.reject(stderr || `Process exited with code ${code}`);
			}
		});
	}

	spawn(processArgs: string[], token: CancellationToken) {
		const id = this.i++;
		const idMap = this.idMap;

		return new AsyncIterableObject<string>((emitter) => {
			return new Promise<void>((resolve, reject) => {
				const cancellationListener = token.onCancellationRequested(() => {
					ipcRenderer.send('kill-process', { id });
				});

				idMap.set(id, { emitter, cancellationListener, resolve, reject, stderrChunks: [] });
				ipcRenderer.send('spawn-process', { id, processArgs });
			});
		});
	}

	private getHandleOrThrow(id: number) {
		const handle = this.idMap.get(id);
		if (!handle) {
			throw new Error(`[MainProcessEventHandler] No handle found for ID ${id}`);
		}
		return handle;
	}
}
