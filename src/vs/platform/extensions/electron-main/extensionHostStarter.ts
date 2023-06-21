/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canceled } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from 'vs/platform/extensions/common/extensionHostStarter';
import { Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { Promises } from 'vs/base/common/async';
import { WindowUtilityProcess } from 'vs/platform/utilityProcess/electron-main/utilityProcess';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class ExtensionHostStarter implements IDisposable, IExtensionHostStarter {

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

		// On shutdown: gracefully await extension host shutdowns
		this._lifecycleMainService.onWillShutdown(e => {
			this._shutdown = true;
			e.join('extHostStarter', this._waitForAllExit(6000));
		});
	}

	dispose(): void {
		// Intentionally not killing the extension host processes
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
		this._getExtHost(id).start({
			...opts,
			type: 'extensionHost',
			entryPoint: 'vs/workbench/api/node/extensionHostProcess',
			args: ['--skipWorkspaceStorageLock'],
			execArgv: opts.execArgv,
			allowLoadingUnsignedLibraries: true,
			forceAllocationsToV8Sandbox: true,
			correlationId: id
		});
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
