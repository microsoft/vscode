/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUtilityProcessWorkerCreateConfiguration, IOnDidTerminateUtilityrocessWorkerProcess, IUtilityProcessWorkerConfiguration, IUtilityProcessWorkerProcessExit, IUtilityProcessWorkerService } from '../common/utilityProcessWorkerService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { WindowUtilityProcess } from './utilityProcess.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { hash } from '../../../base/common/hash.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';

export const IUtilityProcessWorkerMainService = createDecorator<IUtilityProcessWorkerMainService>('utilityProcessWorker');

export interface IUtilityProcessWorkerMainService extends IUtilityProcessWorkerService {

	readonly _serviceBrand: undefined;
}

export class UtilityProcessWorkerMainService extends Disposable implements IUtilityProcessWorkerMainService {

	declare readonly _serviceBrand: undefined;

	private readonly workers = new Map<number /* id */, UtilityProcessWorker>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
		super();
	}

	async createWorker(configuration: IUtilityProcessWorkerCreateConfiguration): Promise<IOnDidTerminateUtilityrocessWorkerProcess> {
		const workerLogId = `window: ${configuration.reply.windowId}, moduleId: ${configuration.process.moduleId}`;
		this.logService.trace(`[UtilityProcessWorker]: createWorker(${workerLogId})`);

		// Ensure to dispose any existing process for config
		const workerId = this.hash(configuration);
		if (this.workers.has(workerId)) {
			this.logService.warn(`[UtilityProcessWorker]: createWorker() found an existing worker that will be terminated (${workerLogId})`);

			this.disposeWorker(configuration);
		}

		// Create new worker
		const worker = new UtilityProcessWorker(this.logService, this.windowsMainService, this.telemetryService, this.lifecycleMainService, configuration);
		if (!worker.spawn()) {
			return { reason: { code: 1, signal: 'EINVALID' } };
		}

		this.workers.set(workerId, worker);

		const onDidTerminate = new DeferredPromise<IOnDidTerminateUtilityrocessWorkerProcess>();
		Event.once(worker.onDidTerminate)(reason => {
			if (reason.code === 0) {
				this.logService.trace(`[UtilityProcessWorker]: terminated normally with code ${reason.code}, signal: ${reason.signal}`);
			} else {
				this.logService.error(`[UtilityProcessWorker]: terminated unexpectedly with code ${reason.code}, signal: ${reason.signal}`);
			}

			this.workers.delete(workerId);
			onDidTerminate.complete({ reason });
		});

		return onDidTerminate.p;
	}

	private hash(configuration: IUtilityProcessWorkerConfiguration): number {
		return hash({
			moduleId: configuration.process.moduleId,
			windowId: configuration.reply.windowId
		});
	}

	async disposeWorker(configuration: IUtilityProcessWorkerConfiguration): Promise<void> {
		const workerId = this.hash(configuration);
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}

		this.logService.trace(`[UtilityProcessWorker]: disposeWorker(window: ${configuration.reply.windowId}, moduleId: ${configuration.process.moduleId})`);

		worker.kill();
		worker.dispose();
		this.workers.delete(workerId);
	}
}

class UtilityProcessWorker extends Disposable {

	private readonly _onDidTerminate = this._register(new Emitter<IUtilityProcessWorkerProcessExit>());
	readonly onDidTerminate = this._onDidTerminate.event;

	private readonly utilityProcess: WindowUtilityProcess;

	constructor(
		@ILogService logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		private readonly configuration: IUtilityProcessWorkerCreateConfiguration
	) {
		super();

		this.utilityProcess = this._register(new WindowUtilityProcess(logService, windowsMainService, telemetryService, lifecycleMainService));

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.utilityProcess.onExit(e => this._onDidTerminate.fire({ code: e.code, signal: e.signal })));
		this._register(this.utilityProcess.onCrash(e => this._onDidTerminate.fire({ code: e.code, signal: 'ECRASH' })));
	}

	spawn(): boolean {
		const window = this.windowsMainService.getWindowById(this.configuration.reply.windowId);
		const windowPid = window?.win?.webContents.getOSProcessId();

		return this.utilityProcess.start({
			type: this.configuration.process.type,
			name: this.configuration.process.name,
			entryPoint: this.configuration.process.moduleId,
			parentLifecycleBound: windowPid,
			windowLifecycleBound: true,
			correlationId: `${this.configuration.reply.windowId}`,
			responseWindowId: this.configuration.reply.windowId,
			responseChannel: this.configuration.reply.channel,
			responseNonce: this.configuration.reply.nonce
		});
	}

	kill() {
		this.utilityProcess.kill();
	}
}
