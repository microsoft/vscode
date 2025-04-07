/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, Details, MessageChannelMain, app, utilityProcess, UtilityProcess as ElectronUtilityProcess } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { StringDecoder } from 'string_decoder';
import { timeout } from '../../../base/common/async.js';
import { FileAccess } from '../../../base/common/network.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import Severity from '../../../base/common/severity.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { removeDangerousEnvVariables } from '../../../base/common/processes.js';
import { deepClone } from '../../../base/common/objects.js';
import { isWindows } from '../../../base/common/platform.js';
import { isUNCAccessRestrictionsDisabled, getUNCHostAllowlist } from '../../../base/node/unc.js';

export interface IUtilityProcessConfiguration {

	/**
	 * A way to group utility processes of same type together.
	 */
	readonly type: string;

	/**
	 * The entry point to load in the utility process.
	 */
	readonly entryPoint: string;

	/**
	 * An optional serializable object to be sent into the utility process
	 * as first message alongside the message port.
	 */
	readonly payload?: unknown;

	/**
	 * Environment key-value pairs. Default is `process.env`.
	 */
	readonly env?: { [key: string]: string | undefined };

	/**
	 * List of string arguments that will be available as `process.argv`
	 * in the child process.
	 */
	readonly args?: string[];

	/**
	 * List of string arguments passed to the executable.
	 */
	readonly execArgv?: string[];

	/**
	 * Allow the utility process to load unsigned libraries.
	 */
	readonly allowLoadingUnsignedLibraries?: boolean;

	/**
	 * Used in log messages to correlate the process
	 * with other components.
	 */
	readonly correlationId?: string;

	/**
	 * Optional pid of the parent process. If set, the
	 * utility process will be terminated when the parent
	 * process exits.
	 */
	readonly parentLifecycleBound?: number;

	/**
	 * HTTP 401 and 407 requests created via electron:net module
	 * will be redirected to the main process and can be handled
	 * via the app#login event.
	 */
	readonly respondToAuthRequestsFromMainProcess?: boolean;
}

export interface IWindowUtilityProcessConfiguration extends IUtilityProcessConfiguration {

	// --- message port response related

	readonly responseWindowId: number;
	readonly responseChannel: string;
	readonly responseNonce: string;

	// --- utility process options

	/**
	 * If set to `true`, will terminate the utility process
	 * when the associated browser window closes or reloads.
	 */
	readonly windowLifecycleBound?: boolean;
}

function isWindowUtilityProcessConfiguration(config: IUtilityProcessConfiguration): config is IWindowUtilityProcessConfiguration {
	const candidate = config as IWindowUtilityProcessConfiguration;

	return typeof candidate.responseWindowId === 'number';
}

interface IUtilityProcessExitBaseEvent {

	/**
	 * The process id of the process that exited.
	 */
	readonly pid: number;

	/**
	 * The exit code of the process.
	 */
	readonly code: number;
}

export interface IUtilityProcessExitEvent extends IUtilityProcessExitBaseEvent {

	/**
	 * The signal that caused the process to exit is unknown
	 * for utility processes.
	 */
	readonly signal: 'unknown';
}

export interface IUtilityProcessCrashEvent extends IUtilityProcessExitBaseEvent {

	/**
	 * The reason of the utility process crash.
	 */
	readonly reason: 'clean-exit' | 'abnormal-exit' | 'killed' | 'crashed' | 'oom' | 'launch-failed' | 'integrity-failure';
}

export interface IUtilityProcessInfo {
	readonly pid: number;
	readonly name: string;
}

export class UtilityProcess extends Disposable {

	private static ID_COUNTER = 0;

	private static readonly all = new Map<number, IUtilityProcessInfo>();
	static getAll(): IUtilityProcessInfo[] {
		return Array.from(UtilityProcess.all.values());
	}

	private readonly id = String(++UtilityProcess.ID_COUNTER);

	private readonly _onStdout = this._register(new Emitter<string>());
	readonly onStdout = this._onStdout.event;

	private readonly _onStderr = this._register(new Emitter<string>());
	readonly onStderr = this._onStderr.event;

	private readonly _onMessage = this._register(new Emitter<unknown>());
	readonly onMessage = this._onMessage.event;

	private readonly _onSpawn = this._register(new Emitter<number | undefined>());
	readonly onSpawn = this._onSpawn.event;

	private readonly _onExit = this._register(new Emitter<IUtilityProcessExitEvent>());
	readonly onExit = this._onExit.event;

	private readonly _onCrash = this._register(new Emitter<IUtilityProcessCrashEvent>());
	readonly onCrash = this._onCrash.event;

	private process: ElectronUtilityProcess | undefined = undefined;
	private processPid: number | undefined = undefined;
	private configuration: IUtilityProcessConfiguration | undefined = undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleMainService protected readonly lifecycleMainService: ILifecycleMainService
	) {
		super();
	}

	protected log(msg: string, severity: Severity): void {
		let logMsg: string;
		if (this.configuration?.correlationId) {
			logMsg = `[UtilityProcess id: ${this.configuration?.correlationId}, type: ${this.configuration?.type}, pid: ${this.processPid ?? '<none>'}]: ${msg}`;
		} else {
			logMsg = `[UtilityProcess type: ${this.configuration?.type}, pid: ${this.processPid ?? '<none>'}]: ${msg}`;
		}

		switch (severity) {
			case Severity.Error:
				this.logService.error(logMsg);
				break;
			case Severity.Warning:
				this.logService.warn(logMsg);
				break;
			case Severity.Info:
				this.logService.trace(logMsg);
				break;
		}
	}

	private validateCanStart(): boolean {
		if (this.process) {
			this.log('Cannot start utility process because it is already running...', Severity.Error);

			return false;
		}

		return true;
	}

	start(configuration: IUtilityProcessConfiguration): boolean {
		const started = this.doStart(configuration);

		if (started && configuration.payload) {
			const posted = this.postMessage(configuration.payload);
			if (posted) {
				this.log('payload sent via postMessage()', Severity.Info);
			}
		}

		return started;
	}

	protected doStart(configuration: IUtilityProcessConfiguration): boolean {
		if (!this.validateCanStart()) {
			return false;
		}

		this.configuration = configuration;

		const serviceName = `${this.configuration.type}-${this.id}`;
		const modulePath = FileAccess.asFileUri('bootstrap-fork.js').fsPath;
		const args = this.configuration.args ?? [];
		const execArgv = this.configuration.execArgv ?? [];
		const allowLoadingUnsignedLibraries = this.configuration.allowLoadingUnsignedLibraries;
		const respondToAuthRequestsFromMainProcess = this.configuration.respondToAuthRequestsFromMainProcess;
		const stdio = 'pipe';
		const env = this.createEnv(configuration);

		this.log('creating new...', Severity.Info);

		// Fork utility process
		this.process = utilityProcess.fork(modulePath, args, {
			serviceName,
			env,
			execArgv, // !!! Add `--trace-warnings` for node.js tracing !!!
			allowLoadingUnsignedLibraries,
			respondToAuthRequestsFromMainProcess,
			stdio
		});

		// Register to events
		this.registerListeners(this.process, this.configuration, serviceName);

		return true;
	}

	private createEnv(configuration: IUtilityProcessConfiguration): { [key: string]: any } {
		const env: { [key: string]: any } = configuration.env ? { ...configuration.env } : { ...deepClone(process.env) };

		// Apply supported environment variables from config
		env['VSCODE_ESM_ENTRYPOINT'] = configuration.entryPoint;
		if (typeof configuration.parentLifecycleBound === 'number') {
			env['VSCODE_PARENT_PID'] = String(configuration.parentLifecycleBound);
		}
		env['VSCODE_CRASH_REPORTER_PROCESS_TYPE'] = configuration.type;
		if (isWindows) {
			if (isUNCAccessRestrictionsDisabled()) {
				env['NODE_DISABLE_UNC_ACCESS_CHECKS'] = '1';
			} else {
				env['NODE_UNC_HOST_ALLOWLIST'] = getUNCHostAllowlist().join('\\');
			}
		}

		// Remove any environment variables that are not allowed
		removeDangerousEnvVariables(env);

		// Ensure all values are strings, otherwise the process will not start
		for (const key of Object.keys(env)) {
			env[key] = String(env[key]);
		}

		return env;
	}

	private registerListeners(process: ElectronUtilityProcess, configuration: IUtilityProcessConfiguration, serviceName: string): void {

		// Stdout
		if (process.stdout) {
			const stdoutDecoder = new StringDecoder('utf-8');
			this._register(Event.fromNodeEventEmitter<string | Buffer>(process.stdout, 'data')(chunk => this._onStdout.fire(typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk))));
		}

		// Stderr
		if (process.stderr) {
			const stderrDecoder = new StringDecoder('utf-8');
			this._register(Event.fromNodeEventEmitter<string | Buffer>(process.stderr, 'data')(chunk => this._onStderr.fire(typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk))));
		}

		// Messages
		this._register(Event.fromNodeEventEmitter(process, 'message')(msg => this._onMessage.fire(msg)));

		// Spawn
		this._register(Event.fromNodeEventEmitter<void>(process, 'spawn')(() => {
			this.processPid = process.pid;

			if (typeof process.pid === 'number') {
				UtilityProcess.all.set(process.pid, { pid: process.pid, name: isWindowUtilityProcessConfiguration(configuration) ? `${configuration.type} [${configuration.responseWindowId}]` : configuration.type });
			}

			this.log('successfully created', Severity.Info);
			this._onSpawn.fire(process.pid);
		}));

		// Exit
		this._register(Event.fromNodeEventEmitter<number>(process, 'exit')(code => {
			this.log(`received exit event with code ${code}`, Severity.Info);

			// Event
			this._onExit.fire({ pid: this.processPid!, code, signal: 'unknown' });

			// Cleanup
			this.onDidExitOrCrashOrKill();
		}));

		// V8 Error
		this._register(Event.fromNodeEventEmitter(process, 'error', (type, location, report) => ({ type, location, report }))(({ type, location, report }) => {
			this.log(`crashed due to ${type} from V8 at ${location}`, Severity.Info);

			let addons: string[] = [];
			try {
				const reportJSON = JSON.parse(report);
				addons = reportJSON.sharedObjects
					.filter((sharedObject: string) => sharedObject.endsWith('.node'))
					.map((addon: string) => {
						const index = addon.indexOf('extensions') === -1 ? addon.indexOf('node_modules') : addon.indexOf('extensions');
						return addon.substring(index);
					});
			} catch (e) {
				// ignore
			}

			// Telemetry
			type UtilityProcessV8ErrorClassification = {
				processtype: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The type of utility process to understand the origin of the crash better.' };
				error: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The type of error from the utility process to understand the nature of the crash better.' };
				location: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The source location that triggered the crash to understand the nature of the crash better.' };
				addons: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The list of addons loaded in the utility process to understand the nature of the crash better' };
				owner: 'deepak1556';
				comment: 'Provides insight into V8 sandbox FATAL error caused by native addons.';
			};
			type UtilityProcessV8ErrorEvent = {
				processtype: string;
				error: string;
				location: string;
				addons: string[];
			};
			this.telemetryService.publicLog2<UtilityProcessV8ErrorEvent, UtilityProcessV8ErrorClassification>('utilityprocessv8error', {
				processtype: configuration.type,
				error: type,
				location,
				addons
			});
		}));

		// Child process gone
		this._register(Event.fromNodeEventEmitter<{ details: Details }>(app, 'child-process-gone', (event, details) => ({ event, details }))(({ details }) => {
			if (details.type === 'Utility' && details.name === serviceName) {
				this.log(`crashed with code ${details.exitCode} and reason '${details.reason}'`, Severity.Error);

				// Telemetry
				type UtilityProcessCrashClassification = {
					type: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The type of utility process to understand the origin of the crash better.' };
					reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The reason of the utility process crash to understand the nature of the crash better.' };
					code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the utility process to understand the nature of the crash better' };
					owner: 'bpasero';
					comment: 'Provides insight into reasons the utility process crashed.';
				};
				type UtilityProcessCrashEvent = {
					type: string;
					reason: string;
					code: number;
				};
				this.telemetryService.publicLog2<UtilityProcessCrashEvent, UtilityProcessCrashClassification>('utilityprocesscrash', {
					type: configuration.type,
					reason: details.reason,
					code: details.exitCode
				});

				// Event
				this._onCrash.fire({ pid: this.processPid!, code: details.exitCode, reason: details.reason });

				// Cleanup
				this.onDidExitOrCrashOrKill();
			}
		}));
	}

	once(message: unknown, callback: () => void): void {
		const disposable = this._register(this._onMessage.event(msg => {
			if (msg === message) {
				disposable.dispose();

				callback();
			}
		}));
	}

	postMessage(message: unknown, transfer?: Electron.MessagePortMain[]): boolean {
		if (!this.process) {
			return false; // already killed, crashed or never started
		}

		this.process.postMessage(message, transfer);

		return true;
	}

	connect(payload?: unknown): Electron.MessagePortMain {
		const { port1: outPort, port2: utilityProcessPort } = new MessageChannelMain();
		this.postMessage(payload, [utilityProcessPort]);

		return outPort;
	}

	enableInspectPort(): boolean {
		if (!this.process || typeof this.processPid !== 'number') {
			return false;
		}

		this.log('enabling inspect port', Severity.Info);

		interface ProcessExt {
			_debugProcess?(pid: number): unknown;
		}

		// use (undocumented) _debugProcess feature of node if available
		const processExt = <ProcessExt>process;
		if (typeof processExt._debugProcess === 'function') {
			processExt._debugProcess(this.processPid);

			return true;
		}

		// not supported...
		return false;
	}

	kill(): void {
		if (!this.process) {
			return; // already killed, crashed or never started
		}

		this.log('attempting to kill the process...', Severity.Info);
		const killed = this.process.kill();
		if (killed) {
			this.log('successfully killed the process', Severity.Info);
			this.onDidExitOrCrashOrKill();
		} else {
			this.log('unable to kill the process', Severity.Warning);
		}
	}

	private onDidExitOrCrashOrKill(): void {
		if (typeof this.processPid === 'number') {
			UtilityProcess.all.delete(this.processPid);
		}

		this.process = undefined;
	}

	async waitForExit(maxWaitTimeMs: number): Promise<void> {
		if (!this.process) {
			return; // already killed, crashed or never started
		}

		this.log('waiting to exit...', Severity.Info);
		await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);

		if (this.process) {
			this.log(`did not exit within ${maxWaitTimeMs}ms, will kill it now...`, Severity.Info);
			this.kill();
		}
	}
}

export class WindowUtilityProcess extends UtilityProcess {

	constructor(
		@ILogService logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService
	) {
		super(logService, telemetryService, lifecycleMainService);
	}

	override start(configuration: IWindowUtilityProcessConfiguration): boolean {
		const responseWindow = this.windowsMainService.getWindowById(configuration.responseWindowId);
		if (!responseWindow?.win || responseWindow.win.isDestroyed() || responseWindow.win.webContents.isDestroyed()) {
			this.log('Refusing to start utility process because requesting window cannot be found or is destroyed...', Severity.Error);

			return true;
		}

		// Start utility process
		const started = super.doStart(configuration);
		if (!started) {
			return false;
		}

		// Register to window events
		this.registerWindowListeners(responseWindow.win, configuration);

		// Establish & exchange message ports
		const windowPort = this.connect(configuration.payload);
		responseWindow.win.webContents.postMessage(configuration.responseChannel, configuration.responseNonce, [windowPort]);

		return true;
	}

	private registerWindowListeners(window: BrowserWindow, configuration: IWindowUtilityProcessConfiguration): void {

		// If the lifecycle of the utility process is bound to the window,
		// we kill the process if the window closes or changes

		if (configuration.windowLifecycleBound) {
			this._register(Event.filter(this.lifecycleMainService.onWillLoadWindow, e => e.window.win === window)(() => this.kill()));
			this._register(Event.fromNodeEventEmitter(window, 'closed')(() => this.kill()));
		}
	}
}
