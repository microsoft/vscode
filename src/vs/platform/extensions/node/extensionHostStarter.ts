/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializedError, transformErrorForSerialization } from 'vs/base/common/errors';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from 'vs/platform/extensions/common/extensionHostStarter';
import { Emitter, Event } from 'vs/base/common/event';
import { ChildProcess, fork } from 'child_process';
import { FileAccess } from 'vs/base/common/network';
import { StringDecoder } from 'string_decoder';
import * as platform from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { mixin } from 'vs/base/common/objects';
import { cwd } from 'vs/base/common/process';
import { StopWatch } from 'vs/base/common/stopwatch';
import { Promises, timeout } from 'vs/base/common/async';

export interface IPartialLogService {
	readonly _serviceBrand: undefined;
	info(message: string): void;
}

class ExtensionHostProcess extends Disposable {

	readonly _onStdout = this._register(new Emitter<string>());
	readonly onStdout = this._onStdout.event;

	readonly _onStderr = this._register(new Emitter<string>());
	readonly onStderr = this._onStderr.event;

	readonly _onMessage = this._register(new Emitter<any>());
	readonly onMessage = this._onMessage.event;

	readonly _onError = this._register(new Emitter<{ error: SerializedError; }>());
	readonly onError = this._onError.event;

	readonly _onExit = this._register(new Emitter<{ pid: number; code: number; signal: string }>());
	readonly onExit = this._onExit.event;

	private _process: ChildProcess | null = null;
	private _hasExited: boolean = false;

	constructor(
		public readonly id: string,
		@ILogService private readonly _logService: IPartialLogService
	) {
		super();
	}

	start(opts: IExtensionHostProcessOptions): { pid: number; } {
		const sw = StopWatch.create(false);
		this._process = fork(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			['--type=extensionHost', '--skipWorkspaceStorageLock'],
			mixin({ cwd: cwd() }, opts),
		);
		const forkTime = sw.elapsed();
		const pid = this._process.pid!;

		this._logService.info(`Starting extension host with pid ${pid} (fork() took ${forkTime} ms).`);

		const stdoutDecoder = new StringDecoder('utf-8');
		this._process.stdout?.on('data', (chunk) => {
			const strChunk = typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk);
			this._onStdout.fire(strChunk);
		});

		const stderrDecoder = new StringDecoder('utf-8');
		this._process.stderr?.on('data', (chunk) => {
			const strChunk = typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk);
			this._onStderr.fire(strChunk);
		});

		this._process.on('message', msg => {
			this._onMessage.fire(msg);
		});

		this._process.on('error', (err) => {
			this._onError.fire({ error: transformErrorForSerialization(err) });
		});

		this._process.on('exit', (code: number, signal: string) => {
			this._hasExited = true;
			this._onExit.fire({ pid, code, signal });
		});

		return { pid };
	}

	enableInspectPort(): boolean {
		if (!this._process) {
			return false;
		}

		this._logService.info(`Enabling inspect port on extension host with pid ${this._process.pid}.`);

		interface ProcessExt {
			_debugProcess?(n: number): any;
		}

		if (typeof (<ProcessExt>process)._debugProcess === 'function') {
			// use (undocumented) _debugProcess feature of node
			(<ProcessExt>process)._debugProcess!(this._process.pid!);
			return true;
		} else if (!platform.isWindows) {
			// use KILL USR1 on non-windows platforms (fallback)
			this._process.kill('SIGUSR1');
			return true;
		} else {
			// not supported...
			return false;
		}
	}

	kill(): void {
		if (!this._process) {
			return;
		}
		this._logService.info(`Killing extension host with pid ${this._process.pid}.`);
		this._process.kill();
	}

	async waitForExit(maxWaitTimeMs: number): Promise<void> {
		if (!this._process) {
			return;
		}
		const pid = this._process.pid;
		this._logService.info(`Waiting for extension host with pid ${pid} to exit.`);
		await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);

		if (!this._hasExited) {
			// looks like we timed out
			this._logService.info(`Extension host with pid ${pid} did not exit within ${maxWaitTimeMs}ms.`);
			this._process.kill();
		}
	}
}

export class ExtensionHostStarter implements IDisposable, IExtensionHostStarter {
	_serviceBrand: undefined;

	private static _lastId: number = 0;

	protected readonly _extHosts: Map<string, ExtensionHostProcess>;

	constructor(
		@ILogService private readonly _logService: IPartialLogService
	) {
		this._extHosts = new Map<string, ExtensionHostProcess>();
	}

	dispose(): void {
		// Intentionally not killing the extension host processes
	}

	private _getExtHost(id: string): ExtensionHostProcess {
		const extHostProcess = this._extHosts.get(id);
		if (!extHostProcess) {
			throw new Error(`Unknown extension host!`);
		}
		return extHostProcess;
	}

	onDynamicStdout(id: string): Event<string> {
		return this._getExtHost(id).onStdout;
	}

	onDynamicStderr(id: string): Event<string> {
		return this._getExtHost(id).onStderr;
	}

	onDynamicMessage(id: string): Event<any> {
		return this._getExtHost(id).onMessage;
	}

	onDynamicError(id: string): Event<{ error: SerializedError; }> {
		return this._getExtHost(id).onError;
	}

	onDynamicExit(id: string): Event<{ code: number; signal: string; }> {
		return this._getExtHost(id).onExit;
	}

	async createExtensionHost(): Promise<{ id: string; }> {
		const id = String(++ExtensionHostStarter._lastId);
		const extHost = new ExtensionHostProcess(id, this._logService);
		this._extHosts.set(id, extHost);
		extHost.onExit(({ pid, code, signal }) => {
			this._logService.info(`Extension host with pid ${pid} exited with code: ${code}, signal: ${signal}.`);
			setTimeout(() => {
				extHost.dispose();
				this._extHosts.delete(id);
			});
		});
		return { id };
	}

	async start(id: string, opts: IExtensionHostProcessOptions): Promise<{ pid: number; }> {
		return this._getExtHost(id).start(opts);
	}

	async enableInspectPort(id: string): Promise<boolean> {
		const extHostProcess = this._extHosts.get(id);
		if (!extHostProcess) {
			return false;
		}
		return extHostProcess.enableInspectPort();
	}

	async kill(id: string): Promise<void> {
		const extHostProcess = this._extHosts.get(id);
		if (!extHostProcess) {
			// already gone!
			return;
		}
		extHostProcess.kill();
	}

	async killAllNow(): Promise<void> {
		for (const [, extHost] of this._extHosts) {
			extHost.kill();
		}
	}

	async waitForAllExit(maxWaitTimeMs: number): Promise<void> {
		const exitPromises: Promise<void>[] = [];
		for (const [, extHost] of this._extHosts) {
			exitPromises.push(extHost.waitForExit(maxWaitTimeMs));
		}
		return Promises.settled(exitPromises).then(() => { });
	}
}

registerSingleton(IExtensionHostStarter, ExtensionHostStarter, true);
