/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canceled, SerializedError, transformErrorForSerialization } from 'vs/base/common/errors';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
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
	interface UtilityProcessConstructorOptions {
		/**
		 * Environment key-value pairs. Default is `process.env`.
		 */
		env?: NodeJS.ProcessEnv;
		/**
		 * List of string arguments passed to the executable. Default is
		 * `process.execArgv`.
		 */
		execArgv?: string[];
		/**
		 * Child's stdout and stderr configuration. Default is `pipe`. String value can be
		 * one of `pipe`, `ignore`, `inherit`, for more details on these values you can
		 * refer to stdio documentation from Node.js. Currently this option does not allow
		 * configuring stdin and is always set to `ignore`. For example, the supported
		 * values will be processed as following:
		 */
		stdio?: (Array<'pipe' | 'ignore' | 'inherit'>) | (string);
		/**
		 * Name of the process that will appear in `name` property of `child-process-gone`
		 * event of `app`. Default is `node.mojom.NodeService`.
		 */
		serviceName?: string;
		/**
		 * With this flag, the utility process will be launched via the `Electron Helper
		 * (Plugin).app` helper executable on macOS, which can be codesigned with
		 * `com.apple.security.cs.disable-library-validation` and
		 * `com.apple.security.cs.allow-unsigned-executable-memory` entitlements. This will
		 * allow the utility process to load unsigned libraries. Unless you specifically
		 * need this capability, it is best to leave this disabled. Default is `false`.
		 *
		 * @platform darwin
		 */
		allowLoadingUnsignedLibraries?: boolean;
	}
	class UtilityProcess extends EventEmitter {

		// Docs: https://electronjs.org/docs/api/utility-process

		/**
		 * Emitted after the child process ends. `code` contains the exit code for the
		 * process obtained from waitpid on posix, or GetExitCodeProcess on windows.
		 */
		on(event: 'exit', listener: (event: Electron.Event,
			code: number) => void): this;
		once(event: 'exit', listener: (event: Electron.Event,
			code: number) => void): this;
		addListener(event: 'exit', listener: (event: Electron.Event,
			code: number) => void): this;
		removeListener(event: 'exit', listener: (event: Electron.Event,
			code: number) => void): this;
		/**
		 * Emitted when the child process sends a message using
		 * `process.parentPort.postMessage()`.
		 */
		on(event: 'message', listener: (event: Electron.Event,
			message: any) => void): this;
		once(event: 'message', listener: (event: Electron.Event,
			message: any) => void): this;
		addListener(event: 'message', listener: (event: Electron.Event,
			message: any) => void): this;
		removeListener(event: 'message', listener: (event: Electron.Event,
			message: any) => void): this;
		/**
		 * Emitted once the child process has spawned successfully.
		 */
		on(event: 'spawn', listener: Function): this;
		once(event: 'spawn', listener: Function): this;
		addListener(event: 'spawn', listener: Function): this;
		removeListener(event: 'spawn', listener: Function): this;
		/**
		 * UtilityProcess
		 */
		constructor(modulePath: string, args?: string[], options?: UtilityProcessConstructorOptions);
		/**
		 * Terminates the process gracefully. On POSIX, it uses SIGTERM but will ensure to
		 * reap the process on exit. This function returns true if kill succeeds, and false
		 * otherwise.
		 */
		kill(): boolean;
		/**
		 * Send a message to the child process, optionally transferring ownership of zero
		 * or more [`MessagePortMain`][] objects.
		 *
		 * For example:
		 */
		postMessage(message: any, transfer?: Electron.MessagePortMain[]): void;
		/**
		 * A `Integer | undefined` representing the process identifier (PID) of the child
		 * process. If the child process fails to spawn due to errors, then the value is
		 * `undefined`.
		 */
		pid: (number) | (undefined);
		/**
		 * A `NodeJS.ReadableStream | null | undefined` that represents the child process's
		 * stderr. If the child was spawned with options.stdio[2] set to anything other
		 * than 'pipe', then this will be `null`. The property will be `undefined` if the
		 * child process could not be successfully spawned.
		 */
		stderr: (NodeJS.ReadableStream) | (null) | (undefined);
		/**
		 * A `NodeJS.ReadableStream | null | undefined` that represents the child process's
		 * stdout. If the child was spawned with options.stdio[1] set to anything other
		 * than 'pipe', then this will be `null`. The property will be `undefined` if the
		 * child process could not be successfully spawned.
		 */
		stdout: (NodeJS.ReadableStream) | (null) | (undefined);
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

	readonly onError = Event.None;

	readonly _onStdout = this._register(new Emitter<string>());
	readonly onStdout = this._onStdout.event;

	readonly _onStderr = this._register(new Emitter<string>());
	readonly onStderr = this._onStderr.event;

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
			this._logService.info(`UtilityProcess<${this.id}>: Refusing to create new Extension Host UtilityProcess because requesting window cannot be found...`);
			return;
		}

		const responseWindow = codeWindow.win;
		if (!responseWindow || responseWindow.isDestroyed() || responseWindow.webContents.isDestroyed()) {
			this._logService.info(`UtilityProcess<${this.id}>: Refusing to create new Extension Host UtilityProcess because requesting window cannot be found...`);
			return;
		}

		const serviceName = `extensionHost${this.id}`;
		const modulePath = FileAccess.asFileUri('bootstrap-fork.js', require).fsPath;
		const args: string[] = ['--type=extensionHost', '--skipWorkspaceStorageLock'];
		const execArgv: string[] = opts.execArgv || [];
		const env: { [key: string]: any } = { ...opts.env };
		const allowLoadingUnsignedLibraries: boolean = true;

		// Make sure all values are strings, otherwise the process will not start
		for (const key of Object.keys(env)) {
			env[key] = String(env[key]);
		}

		this._logService.info(`UtilityProcess<${this.id}>: Creating new...`);

		this._process = new UtilityProcess(modulePath, args, { serviceName, env, execArgv, allowLoadingUnsignedLibraries });

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

		this._register(Event.fromNodeEventEmitter<void>(this._process, 'spawn')(() => {
			this._logService.info(`UtilityProcess<${this.id}>: received spawn event.`);
		}));
		const onExit = Event.fromNodeEventEmitter<number>(this._process, 'exit', (_, code: number) => code);
		this._register(onExit((code: number) => {
			this._logService.info(`UtilityProcess<${this.id}>: received exit event with code ${code}.`);
			this._hasExited = true;
			this._onExit.fire({ pid: this._process!.pid!, code, signal: '' });
		}));

		const { port1, port2 } = new electron.MessageChannelMain();

		this._process.postMessage('null', [port2]);
		responseWindow.webContents.postMessage(opts.responseChannel, opts.responseNonce, [port1]);
	}

	enableInspectPort(): boolean {
		if (!this._process) {
			return false;
		}

		this._logService.info(`UtilityProcess<${this.id}>: Enabling inspect port on extension host with pid ${this._process.pid}.`);

		interface ProcessExt {
			_debugProcess?(n: number): any;
		}

		if (typeof (<ProcessExt>process)._debugProcess === 'function') {
			// use (undocumented) _debugProcess feature of node
			(<ProcessExt>process)._debugProcess!(this._process.pid!);
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
		this._logService.info(`UtilityProcess<${this.id}>: Killing extension host with pid ${this._process.pid}.`);
		this._process.kill();
	}

	async waitForExit(maxWaitTimeMs: number): Promise<void> {
		if (!this._process) {
			return;
		}
		const pid = this._process.pid;
		this._logService.info(`UtilityProcess<${this.id}>: Waiting for extension host with pid ${pid} to exit.`);
		await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);

		if (!this._hasExited) {
			// looks like we timed out
			this._logService.info(`UtilityProcess<${this.id}>: Extension host with pid ${pid} did not exit within ${maxWaitTimeMs}ms, will kill it now.`);
			this._process.kill();
		}
	}
}
