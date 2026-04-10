/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { Readable } from 'stream';
import * as vscode from 'vscode';
import { TypeScriptServiceConfiguration } from '../configuration/configuration';
import { Disposable } from '../utils/dispose';
import { API } from './api';
import type * as Proto from './protocol/protocol';
import { TsServerLog, TsServerProcess, TsServerProcessFactory, TsServerProcessKind } from './server';
import { TypeScriptVersionManager } from './versionManager';
import { TypeScriptVersion } from './versionProvider';
import { NodeVersionManager } from './nodeManager';


const defaultSize: number = 8192;
const contentLength: string = 'Content-Length: ';
const contentLengthSize: number = Buffer.byteLength(contentLength, 'utf8');
const blank: number = Buffer.from(' ', 'utf8')[0];
const backslashR: number = Buffer.from('\r', 'utf8')[0];
const backslashN: number = Buffer.from('\n', 'utf8')[0];
const gracefulExitTimeout = 5000;
const tsServerExitRequest: Proto.Request = {
	seq: 0,
	type: 'request',
	command: 'exit',
};

class ProtocolBuffer {

	private index: number = 0;
	private buffer: Buffer = Buffer.allocUnsafe(defaultSize);

	public append(data: string | Buffer): void {
		let toAppend: Buffer | null = null;
		if (Buffer.isBuffer(data)) {
			toAppend = data;
		} else {
			toAppend = Buffer.from(data, 'utf8');
		}
		if (this.buffer.length - this.index >= toAppend.length) {
			toAppend.copy(this.buffer, this.index, 0, toAppend.length);
		} else {
			const newSize = (Math.ceil((this.index + toAppend.length) / defaultSize) + 1) * defaultSize;
			if (this.index === 0) {
				this.buffer = Buffer.allocUnsafe(newSize);
				toAppend.copy(this.buffer, 0, 0, toAppend.length);
			} else {
				this.buffer = Buffer.concat([this.buffer.slice(0, this.index), toAppend], newSize);
			}
		}
		this.index += toAppend.length;
	}

	public tryReadContentLength(): number {
		let result = -1;
		let current = 0;
		// we are utf8 encoding...
		while (current < this.index && (this.buffer[current] === blank || this.buffer[current] === backslashR || this.buffer[current] === backslashN)) {
			current++;
		}
		if (this.index < current + contentLengthSize) {
			return result;
		}
		current += contentLengthSize;
		const start = current;
		while (current < this.index && this.buffer[current] !== backslashR) {
			current++;
		}
		if (current + 3 >= this.index || this.buffer[current + 1] !== backslashN || this.buffer[current + 2] !== backslashR || this.buffer[current + 3] !== backslashN) {
			return result;
		}
		const data = this.buffer.toString('utf8', start, current);
		result = parseInt(data);
		this.buffer = this.buffer.slice(current + 4);
		this.index = this.index - (current + 4);
		return result;
	}

	public tryReadContent(length: number): string | null {
		if (this.index < length) {
			return null;
		}
		const result = this.buffer.toString('utf8', 0, length);
		let sourceStart = length;
		while (sourceStart < this.index && (this.buffer[sourceStart] === backslashR || this.buffer[sourceStart] === backslashN)) {
			sourceStart++;
		}
		this.buffer.copy(this.buffer, 0, sourceStart);
		this.index = this.index - sourceStart;
		return result;
	}
}

class Reader<T> extends Disposable {

	private readonly buffer: ProtocolBuffer = new ProtocolBuffer();
	private nextMessageLength: number = -1;

	public constructor(readable: Readable) {
		super();
		readable.on('data', data => this.onLengthData(data));
	}

	private readonly _onError = this._register(new vscode.EventEmitter<Error>());
	public readonly onError = this._onError.event;

	private readonly _onData = this._register(new vscode.EventEmitter<T>());
	public readonly onData = this._onData.event;

	private onLengthData(data: Buffer | string): void {
		if (this.isDisposed) {
			return;
		}

		try {
			this.buffer.append(data);
			while (true) {
				if (this.nextMessageLength === -1) {
					this.nextMessageLength = this.buffer.tryReadContentLength();
					if (this.nextMessageLength === -1) {
						return;
					}
				}
				const msg = this.buffer.tryReadContent(this.nextMessageLength);
				if (msg === null) {
					return;
				}
				this.nextMessageLength = -1;
				const json = JSON.parse(msg);
				this._onData.fire(json);
			}
		} catch (e) {
			this._onError.fire(e);
		}
	}
}

function generatePatchedEnv(env: any, modulePath: string, hasExecPath: boolean): any {
	const newEnv = Object.assign({}, env);

	if (!hasExecPath) {
		newEnv['ELECTRON_RUN_AS_NODE'] = '1';
	}
	newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..');

	// Ensure we always have a PATH set
	newEnv['PATH'] = newEnv['PATH'] || process.env.PATH;

	return newEnv;
}

function getExecArgv(kind: TsServerProcessKind, configuration: TypeScriptServiceConfiguration): string[] {
	const args: string[] = [];

	const debugPort = getDebugPort(kind);
	if (debugPort) {
		const inspectFlag = getTssDebugBrk() ? '--inspect-brk' : '--inspect';
		args.push(`${inspectFlag}=${debugPort}`);
	}

	if (configuration.maxTsServerMemory) {
		args.push(`--max-old-space-size=${configuration.maxTsServerMemory}`);
	}

	if (configuration.diagnosticDir) {
		args.push(`--diagnostic-dir=${configuration.diagnosticDir}`);
	}

	if (configuration.heapSnapshot > 0) {
		args.push(`--heapsnapshot-near-heap-limit=${configuration.heapSnapshot}`);
	}

	if (configuration.heapProfile.enabled) {
		args.push('--heap-prof');
		if (configuration.heapProfile.dir) {
			args.push(`--heap-prof-dir=${configuration.heapProfile.dir}`);
		}
		if (configuration.heapProfile.interval) {
			args.push(`--heap-prof-interval=${configuration.heapProfile.interval}`);
		}
	}

	return args;
}

function getDebugPort(kind: TsServerProcessKind): number | undefined {
	if (kind === TsServerProcessKind.Syntax) {
		// We typically only want to debug the main semantic server
		return undefined;
	}
	const value = getTssDebugBrk() || getTssDebug();
	if (value) {
		const port = parseInt(value);
		if (!isNaN(port)) {
			return port;
		}
	}
	return undefined;
}

function getTssDebug(): string | undefined {
	return process.env[vscode.env.remoteName ? 'TSS_REMOTE_DEBUG' : 'TSS_DEBUG'];
}

function getTssDebugBrk(): string | undefined {
	return process.env[vscode.env.remoteName ? 'TSS_REMOTE_DEBUG_BRK' : 'TSS_DEBUG_BRK'];
}

class IpcChildServerProcess extends Disposable implements TsServerProcess {
	private _killTimeout: NodeJS.Timeout | undefined;
	private _isShuttingDown = false;

	constructor(
		private readonly _process: child_process.ChildProcess,
		private readonly _useGracefulShutdown: boolean,
	) {
		super();
		this._process.once('exit', () => this.clearKillTimeout());
	}

	write(serverRequest: Proto.Request): void {
		this._process.send(serverRequest);
	}

	onData(handler: (data: Proto.Response) => void): void {
		this._process.on('message', handler);
	}

	onExit(handler: (code: number | null, signal: string | null) => void): void {
		this._process.on('exit', handler);
	}

	onError(handler: (err: Error) => void): void {
		this._process.on('error', handler);
	}

	kill(): void {
		if (!this._useGracefulShutdown) {
			this._process.kill();
			return;
		}

		if (this._isShuttingDown) {
			return;
		}
		this._isShuttingDown = true;

		try {
			this._process.send(tsServerExitRequest);
		} catch {
			this._process.kill();
			return;
		}

		this._killTimeout = setTimeout(() => this._process.kill(), gracefulExitTimeout);
		this._killTimeout.unref?.();
	}

	private clearKillTimeout(): void {
		if (this._killTimeout) {
			clearTimeout(this._killTimeout);
			this._killTimeout = undefined;
		}
	}
}

class StdioChildServerProcess extends Disposable implements TsServerProcess {
	private readonly _reader: Reader<Proto.Response>;
	private _killTimeout: NodeJS.Timeout | undefined;
	private _isShuttingDown = false;

	constructor(
		private readonly _process: child_process.ChildProcess,
		private readonly _useGracefulShutdown: boolean,
	) {
		super();
		this._reader = this._register(new Reader<Proto.Response>(this._process.stdout!));
		this._process.once('exit', () => this.clearKillTimeout());
	}

	write(serverRequest: Proto.Request): void {
		this._process.stdin!.write(JSON.stringify(serverRequest) + '\r\n', 'utf8');
	}

	onData(handler: (data: Proto.Response) => void): void {
		this._reader.onData(handler);
	}

	onExit(handler: (code: number | null, signal: string | null) => void): void {
		this._process.on('exit', handler);
	}

	onError(handler: (err: Error) => void): void {
		this._process.on('error', handler);
		this._reader.onError(handler);
	}

	kill(): void {
		if (!this._useGracefulShutdown) {
			this._process.kill();
			this._reader.dispose();
			return;
		}

		if (this._isShuttingDown) {
			return;
		}
		this._isShuttingDown = true;

		try {
			this._process.stdin?.write(JSON.stringify(tsServerExitRequest) + '\r\n', 'utf8');
			this._process.stdin?.end();
		} catch {
			this._process.kill();
			this._reader.dispose();
			return;
		}

		this._killTimeout = setTimeout(() => {
			this._process.kill();
			this._reader.dispose();
		}, gracefulExitTimeout);
		this._killTimeout.unref?.();
	}

	private clearKillTimeout(): void {
		if (this._killTimeout) {
			clearTimeout(this._killTimeout);
			this._killTimeout = undefined;
		}

		this._reader.dispose();
	}
}

export class ElectronServiceProcessFactory implements TsServerProcessFactory {
	fork(
		version: TypeScriptVersion,
		args: readonly string[],
		kind: TsServerProcessKind,
		configuration: TypeScriptServiceConfiguration,
		versionManager: TypeScriptVersionManager,
		nodeVersionManager: NodeVersionManager,
		_tsserverLog: TsServerLog | undefined,
	): TsServerProcess {
		let tsServerPath = version.tsServerPath;

		if (!fs.existsSync(tsServerPath)) {
			vscode.window.showWarningMessage(vscode.l10n.t("The path {0} doesn\'t point to a valid tsserver install. Falling back to bundled TypeScript version.", tsServerPath));
			versionManager.reset();
			tsServerPath = versionManager.currentVersion.tsServerPath;
		}

		const execPath = nodeVersionManager.currentVersion;

		const env = generatePatchedEnv(process.env, tsServerPath, !!execPath);
		const runtimeArgs = [...args];
		const execArgv = getExecArgv(kind, configuration);
		const useGracefulShutdown = configuration.heapProfile.enabled;
		const useIpc = !execPath && version.apiVersion?.gte(API.v460);
		if (useIpc) {
			runtimeArgs.push('--useNodeIpc');
		}

		const childProcess = execPath ?
			child_process.spawn(execPath, [...execArgv, tsServerPath, ...runtimeArgs], {
				windowsHide: true,
				cwd: undefined,
				env,
			}) :
			child_process.fork(tsServerPath, runtimeArgs, {
				silent: true,
				cwd: undefined,
				env,
				execArgv,
				stdio: useIpc ? ['pipe', 'pipe', 'pipe', 'ipc'] : undefined,
			});

		return useIpc ? new IpcChildServerProcess(childProcess, useGracefulShutdown) : new StdioChildServerProcess(childProcess, useGracefulShutdown);
	}
}
