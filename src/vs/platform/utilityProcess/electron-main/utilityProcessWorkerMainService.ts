/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IOnDidTerminateSharedProcessWorkerProcess, ISharedProcessWorkerConfiguration, ISharedProcessWorkerCreateConfiguration, ISharedProcessWorkerProcessExit, ISharedProcessWorkerService } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { UtilityProcess } from 'vs/platform/utilityProcess/electron-main/utilityProcess';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { deepClone } from 'vs/base/common/objects';
import { removeDangerousEnvVariables } from 'vs/base/common/processes';
import { hash } from 'vs/base/common/hash';
import { Event, Emitter } from 'vs/base/common/event';
import { DeferredPromise } from 'vs/base/common/async';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';

export const IUtilityProcessWorkerMainService = createDecorator<IUtilityProcessWorkerMainService>('utilityProcessWorker');

export interface IUtilityProcessWorkerMainService extends ISharedProcessWorkerService {
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

	async createWorker(configuration: ISharedProcessWorkerCreateConfiguration): Promise<IOnDidTerminateSharedProcessWorkerProcess> {
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

		const onDidTerminate = new DeferredPromise<IOnDidTerminateSharedProcessWorkerProcess>();
		Event.once(worker.onDidTerminate)(e => {
			this.workers.delete(workerId);
			onDidTerminate.complete({ reason: e });
		});

		return onDidTerminate.p;
	}

	private hash(configuration: ISharedProcessWorkerConfiguration): number {
		return hash({
			...configuration.process,
			windowId: configuration.reply.windowId
		});
	}

	async disposeWorker(configuration: ISharedProcessWorkerConfiguration): Promise<void> {
		const workerId = this.hash(configuration);
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}

		this.logService.trace(`[UtilityProcessWorker]: disposeWorker(window: ${configuration.reply.windowId}, moduleId: ${configuration.process.moduleId})`);

		worker.kill();
		this.workers.delete(workerId);
	}
}

class UtilityProcessWorker extends Disposable {

	private readonly _onDidTerminate = this._register(new Emitter<ISharedProcessWorkerProcessExit>());
	readonly onDidTerminate = this._onDidTerminate.event;

	private readonly utilityProcess = new UtilityProcess(this.logService, this.windowsMainService, this.telemetryService, this.lifecycleMainService);

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		private readonly configuration: ISharedProcessWorkerCreateConfiguration
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.utilityProcess.onExit(e => this._onDidTerminate.fire({ code: e.code, signal: e.signal })));
		this._register(this.utilityProcess.onCrash(e => this._onDidTerminate.fire({ code: e.code, signal: 'unknown' })));
	}

	spawn(): boolean {
		return this.utilityProcess.start({
			windowLifecycleBound: true,
			correlationId: `${this.configuration.reply.windowId}`,
			responseWindowId: this.configuration.reply.windowId,
			responseChannel: this.configuration.reply.channel,
			responseNonce: this.configuration.reply.nonce,
			type: this.configuration.process.type,
			env: this.getEnv()
		});
	}

	private getEnv(): NodeJS.ProcessEnv {
		const env: NodeJS.ProcessEnv = {
			...deepClone(process.env),
			VSCODE_AMD_ENTRYPOINT: this.configuration.process.moduleId,
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
			VSCODE_PARENT_PID: String(process.pid)
		};

		// Sanitize environment
		removeDangerousEnvVariables(env);

		return env;
	}

	kill() {
		this.utilityProcess.kill();
	}
}
