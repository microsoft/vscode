/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canceled, SerializedError, transformErrorForSerialization } from 'vs/base/common/errors';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from 'vs/platform/extensions/common/extensionHostStarter';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ChildProcess, fork } from 'child_process';
import { StringDecoder } from 'string_decoder';
import { Promises, timeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { mixin } from 'vs/base/common/objects';
import * as platform from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import type { EventEmitter } from 'events';
import * as electron from 'electron';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

declare namespace UtilityProcessProposedApi {
	interface UtilityProcessOptions {
		serviceName?: string | undefined;
		execArgv?: string[] | undefined;
		env?: NodeJS.ProcessEnv | undefined;
	}
	export class UtilityProcess extends EventEmitter {
		readonly pid?: number | undefined;
		constructor(modulePath: string, args?: string[] | undefined, options?: UtilityProcessOptions);
		postMessage(channel: string, message: any, transfer?: Electron.MessagePortMain[]): void;
		kill(signal?: number | string): boolean;
		on(event: 'exit', listener: (code: number) => void): this;
		on(event: 'spawn', listener: () => void): this;
	}
}
const UtilityProcess = <typeof UtilityProcessProposedApi.UtilityProcess>((electron as any).UtilityProcess);
const canUseUtilityProcess = (typeof UtilityProcess !== 'undefined');

export class ExtensionHostStarter implements IDisposable, IExtensionHostStarter {
	_serviceBrand: undefined;

	private static _lastId: number = 0;

	protected readonly _extHosts: Map<string, ExtensionHostProcess | UtilityExtensionHostProcess>;
	private _shutdown = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IWindowsMainService private readonly _windowsMainService: IWindowsMainService,
	) {
		this._extHosts = new Map<string, ExtensionHostProcess | UtilityExtensionHostProcess>();

		// On shutdown: gracefully await extension host shutdowns
		lifecycleMainService.onWillShutdown((e) => {
			this._shutdown = true;
			e.join(this._waitForAllExit(6000));
		});
	}

	dispose(): void {
		// Intentionally not killing the extension host processes
	}

	private _getExtHost(id: string): ExtensionHostProcess | UtilityExtensionHostProcess {
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

	onDynamicError(id: string): Event<{ error: SerializedError }> {
		return this._getExtHost(id).onError;
	}

	onDynamicExit(id: string): Event<{ code: number; signal: string }> {
		return this._getExtHost(id).onExit;
	}

	async canUseUtilityProcess(): Promise<boolean> {
		return canUseUtilityProcess;
	}

	async createExtensionHost(useUtilityProcess: boolean): Promise<{ id: string }> {
		if (this._shutdown) {
			throw canceled();
		}
		const id = String(++ExtensionHostStarter._lastId);
		let extHost: UtilityExtensionHostProcess | ExtensionHostProcess;
		if (useUtilityProcess) {
			if (!canUseUtilityProcess) {
				throw new Error(`Cannot use UtilityProcess!`);
			}
			extHost = new UtilityExtensionHostProcess(id, this._logService, this._windowsMainService);
		} else {
			extHost = new ExtensionHostProcess(id, this._logService);
		}
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

	async start(id: string, opts: IExtensionHostProcessOptions): Promise<void> {
		if (this._shutdown) {
			throw canceled();
		}
		return this._getExtHost(id).start(opts);
	}

	async enableInspectPort(id: string): Promise<boolean> {
		if (this._shutdown) {
			throw canceled();
		}
		const extHostProcess = this._extHosts.get(id);
		if (!extHostProcess) {
			return false;
		}
		return extHostProcess.enableInspectPort();
	}

	async kill(id: string): Promise<void> {
		if (this._shutdown) {
			throw canceled();
		}
		const extHostProcess = this._extHosts.get(id);
		if (!extHostProcess) {
			// already gone!
			return;
		}
		extHostProcess.kill();
	}

	async _killAllNow(): Promise<void> {
		for (const [, extHost] of this._extHosts) {
			extHost.kill();
		}
	}

	async _waitForAllExit(maxWaitTimeMs: number): Promise<void> {
		const exitPromises: Promise<void>[] = [];
		for (const [, extHost] of this._extHosts) {
			exitPromises.push(extHost.waitForExit(maxWaitTimeMs));
		}
		return Promises.settled(exitPromises).then(() => { });
	}
}

class ExtensionHostProcess extends Disposable {

	readonly _onStdout = this._register(new Emitter<string>());
	readonly onStdout = this._onStdout.event;

	readonly _onStderr = this._register(new Emitter<string>());
	readonly onStderr = this._onStderr.event;

	readonly _onMessage = this._register(new Emitter<any>());
	readonly onMessage = this._onMessage.event;

	readonly _onError = this._register(new Emitter<{ error: SerializedError }>());
	readonly onError = this._onError.event;

	readonly _onExit = this._register(new Emitter<{ pid: number; code: number; signal: string }>());
	readonly onExit = this._onExit.event;

	private _process: ChildProcess | null = null;
	private _hasExited: boolean = false;

	constructor(
		public readonly id: string,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	start(opts: IExtensionHostProcessOptions): void {
		if (platform.isCI) {
			this._logService.info(`Calling fork to start extension host...`);
		}
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

class UtilityExtensionHostProcess extends Disposable {

	readonly onStdout = Event.None;
	readonly onStderr = Event.None;
	readonly onError = Event.None;

	readonly _onMessage = this._register(new Emitter<any>());
	readonly onMessage = this._onMessage.event;

	readonly _onExit = this._register(new Emitter<{ pid: number; code: number; signal: string }>());
	readonly onExit = this._onExit.event;

	private _process: UtilityProcessProposedApi.UtilityProcess | null = null;
	private _hasExited: boolean = false;

	constructor(
		public readonly id: string,
		@ILogService private readonly _logService: ILogService,
		@IWindowsMainService private readonly _windowsMainService: IWindowsMainService,
	) {
		super();
	}

	start(opts: IExtensionHostProcessOptions): void {
		const codeWindow = this._windowsMainService.getWindowById(opts.responseWindowId);
		if (!codeWindow) {
			this._logService.info(`Refusing to create new Extension Host UtilityProcess because requesting window cannot be found...`);
			return;
		}

		const responseWindow = codeWindow.win;
		if (!responseWindow || responseWindow.isDestroyed() || responseWindow.webContents.isDestroyed()) {
			this._logService.info(`Refusing to create new Extension Host UtilityProcess because requesting window cannot be found...`);
			return;
		}

		const serviceName = `extensionHost${this.id}`;
		const modulePath = FileAccess.asFileUri('bootstrap-fork.js', require).fsPath;
		const args: string[] = ['--type=extensionHost', '--skipWorkspaceStorageLock'];
		const execArgv: string[] = opts.execArgv || [];
		const env: { [key: string]: any } = { ...opts.env };

		// Make sure all values are strings, otherwise the process will not start
		for (const key of Object.keys(env)) {
			env[key] = String(env[key]);
		}

		this._logService.info(`Creating new UtilityProcess to start extension host...`);

		this._process = new UtilityProcess(modulePath, args, { serviceName, env, execArgv });

		this._process.on('spawn', () => {
			this._logService.info(`Utility process emits spawn!`);
		});
		this._process.on('exit', (code: number) => {
			this._logService.info(`Utility process emits exit!`);
			this._hasExited = true;
			this._onExit.fire({ pid: this._process!.pid!, code, signal: '' });
		});
		const listener = (event: electron.Event, details: electron.Details) => {
			if (details.type !== 'Utility') {
				return;
			}
			// Despite the fact that we pass the argument `seviceName`,
			// the details have a field called `name` where this value appears
			if (details.name === serviceName) {
				this._logService.info(`Utility process emits exit!`);
				this._hasExited = true;
				this._onExit.fire({ pid: this._process!.pid!, code: details.exitCode, signal: '' });
			}
		};
		electron.app.on('child-process-gone', listener);
		this._register(toDisposable(() => {
			electron.app.off('child-process-gone', listener);
		}));

		const { port1, port2 } = new electron.MessageChannelMain();

		this._process.postMessage('port', null, [port2]);
		responseWindow.webContents.postMessage(opts.responseChannel, opts.responseNonce, [port1]);
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
