/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from '../../../base/common/async.js';
import { canceled } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from '../common/extensionHostStarter.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { WindowUtilityProcess } from '../../utilityProcess/electron-main/utilityProcess.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';

export class ExtensionHostStarter extends Disposable implements IDisposable, IExtensionHostStarter {

	readonly _serviceBrand: undefined;

	private static _lastId: number = 0;

	private readonly _extHosts = new Map<string, WindowUtilityProcess>();
	private _shutdown = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ILifecycleMainService private readonly _lifecycleMainService: ILifecycleMainService,
		@IWindowsMainService private readonly _windowsMainService: IWindowsMainService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		// On shutdown: gracefully await extension host shutdowns
		this._register(this._lifecycleMainService.onWillShutdown(e => {
			this._shutdown = true;
			e.join('extHostStarter', this._waitForAllExit(6000));
		}));
	}

	override dispose(): void {
		// Intentionally not killing the extension host processes
		super.dispose();
	}

	private _getExtHost(id: string): WindowUtilityProcess {
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

	onDynamicExit(id: string): Event<{ code: number; signal: string }> {
		return this._getExtHost(id).onExit;
	}

	async createExtensionHost(): Promise<{ id: string }> {
		if (this._shutdown) {
			throw canceled();
		}
		const id = String(++ExtensionHostStarter._lastId);
		const extHost = new WindowUtilityProcess(this._logService, this._windowsMainService, this._telemetryService, this._lifecycleMainService);
		this._extHosts.set(id, extHost);
		const disposable = extHost.onExit(({ pid, code, signal }) => {
			disposable.dispose();
			this._logService.info(`Extension host with pid ${pid} exited with code: ${code}, signal: ${signal}.`);
			setTimeout(() => {
				extHost.dispose();
				this._extHosts.delete(id);
			});

			// See https://github.com/microsoft/vscode/issues/194477
			// We have observed that sometimes the process sends an exit
			// event, but does not really exit and is stuck in an endless
			// loop. In these cases we kill the process forcefully after
			// a certain timeout.
			setTimeout(() => {
				try {
					process.kill(pid, 0); // will throw if the process doesn't exist anymore.
					this._logService.error(`Extension host with pid ${pid} still exists, forcefully killing it...`);
					process.kill(pid);
				} catch (er) {
					// ignore, as the process is already gone
				}
			}, 1000);
		});
		return { id };
	}

	async start(id: string, opts: IExtensionHostProcessOptions): Promise<{ pid: number | undefined }> {
		if (this._shutdown) {
			throw canceled();
		}
		const extHost = this._getExtHost(id);
		extHost.start({
			...opts,
			type: 'extensionHost',
			entryPoint: 'vs/workbench/api/node/extensionHostProcess',
			args: ['--skipWorkspaceStorageLock'],
			execArgv: opts.execArgv,
			allowLoadingUnsignedLibraries: true,
			forceAllocationsToV8Sandbox: true,
			respondToAuthRequestsFromMainProcess: true,
			correlationId: id
		});
		const pid = await Event.toPromise(extHost.onSpawn);
		return { pid };
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
