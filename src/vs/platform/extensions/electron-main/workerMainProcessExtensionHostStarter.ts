/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { canceled, SerializedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionHostProcessOptions, IExtensionHostStarter } from 'vs/platform/extensions/common/extensionHostStarter';
import { Event } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { Worker } from 'worker_threads';
import { IWorker, IWorkerCallback, IWorkerFactory, SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import type { ExtensionHostStarter, IExtensionHostStarterWorkerHost } from 'vs/platform/extensions/node/extensionHostStarterWorker';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { StopWatch } from 'vs/base/common/stopwatch';

class NodeWorker implements IWorker {

	private readonly _worker: Worker;

	public readonly onError: Event<Error>;
	public readonly onExit: Event<number>;
	public readonly onMessageError: Event<Error>;

	constructor(callback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		this._worker = new Worker(
			FileAccess.asFileUri('vs/platform/extensions/node/extensionHostStarterWorkerMain.js', require).fsPath,
		);
		this._worker.on('message', callback);
		this._worker.on('error', onErrorCallback);
		this.onError = Event.fromNodeEventEmitter(this._worker, 'error');
		this.onExit = Event.fromNodeEventEmitter(this._worker, 'exit');
		this.onMessageError = Event.fromNodeEventEmitter(this._worker, 'messageerror');
	}

	getId(): number {
		return 1;
	}

	postMessage(message: any, transfer: ArrayBuffer[]): void {
		this._worker.postMessage(message, transfer);
	}

	dispose(): void {
		this._worker.terminate();
	}
}

class ExtensionHostStarterWorkerHost implements IExtensionHostStarterWorkerHost {
	constructor(
		@ILogService private readonly _logService: ILogService
	) { }

	public async logInfo(message: string): Promise<void> {
		this._logService.info(message);
	}
}

export class WorkerMainProcessExtensionHostStarter implements IDisposable, IExtensionHostStarter {
	_serviceBrand: undefined;

	private _proxy: ExtensionHostStarter | null;
	private readonly _worker: SimpleWorkerClient<ExtensionHostStarter, IExtensionHostStarterWorkerHost>;
	private _shutdown = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService
	) {
		this._proxy = null;

		const workerFactory: IWorkerFactory = {
			create: (moduleId: string, callback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker => {
				const worker = new NodeWorker(callback, onErrorCallback);
				worker.onError((err) => {
					this._logService.error(`ExtensionHostStarterWorker has encountered an error:`);
					this._logService.error(err);
				});
				worker.onMessageError((err) => {
					this._logService.error(`ExtensionHostStarterWorker has encountered a message error:`);
					this._logService.error(err);
				});
				worker.onExit((exitCode) => this._logService.info(`ExtensionHostStarterWorker exited with code ${exitCode}.`));
				worker.postMessage(moduleId, []);
				return worker;
			}
		};
		this._worker = new SimpleWorkerClient<ExtensionHostStarter, IExtensionHostStarterWorkerHost>(
			workerFactory,
			'vs/platform/extensions/node/extensionHostStarterWorker',
			new ExtensionHostStarterWorkerHost(this._logService)
		);
		this._initialize();

		// On shutdown: gracefully await extension host shutdowns
		lifecycleMainService.onWillShutdown((e) => {
			this._shutdown = true;
			if (this._proxy) {
				e.join(this._proxy.waitForAllExit(6000));
			}
		});
	}

	dispose(): void {
		// Intentionally not killing the extension host processes
	}

	async _initialize(): Promise<void> {
		this._proxy = await this._worker.getProxyObject();
		this._logService.info(`ExtensionHostStarterWorker created`);
	}

	onDynamicStdout(id: string): Event<string> {
		return this._proxy!.onDynamicStdout(id);
	}

	onDynamicStderr(id: string): Event<string> {
		return this._proxy!.onDynamicStderr(id);
	}

	onDynamicMessage(id: string): Event<any> {
		return this._proxy!.onDynamicMessage(id);
	}

	onDynamicError(id: string): Event<{ error: SerializedError; }> {
		return this._proxy!.onDynamicError(id);
	}

	onDynamicExit(id: string): Event<{ code: number; signal: string; }> {
		return this._proxy!.onDynamicExit(id);
	}

	async createExtensionHost(): Promise<{ id: string; }> {
		const proxy = await this._worker.getProxyObject();
		if (this._shutdown) {
			throw canceled();
		}
		return proxy.createExtensionHost();
	}

	async start(id: string, opts: IExtensionHostProcessOptions): Promise<{ pid: number; }> {
		const sw = StopWatch.create(false);
		const proxy = await this._worker.getProxyObject();
		if (this._shutdown) {
			throw canceled();
		}
		const timeout = setTimeout(() => {
			this._logService.info(`ExtensionHostStarterWorker.start() did not return within 30s. This might be a problem.`);
		}, 30000);
		const result = await proxy.start(id, opts);
		const duration = sw.elapsed();
		this._logService.info(`ExtensionHostStarterWorker.start() took ${duration} ms.`);
		clearTimeout(timeout);
		return result;
	}

	async enableInspectPort(id: string): Promise<boolean> {
		const proxy = await this._worker.getProxyObject();
		if (this._shutdown) {
			throw canceled();
		}
		return proxy.enableInspectPort(id);
	}

	async kill(id: string): Promise<void> {
		const proxy = await this._worker.getProxyObject();
		if (this._shutdown) {
			throw canceled();
		}
		return proxy.kill(id);
	}
}
