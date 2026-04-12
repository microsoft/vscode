/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { WindowUtilityProcess } from './utilityProcess.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { hash } from '../../../base/common/hash.js';
import { Event, Emitter } from '../../../base/common/event.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
export const IUtilityProcessWorkerMainService = createDecorator('utilityProcessWorker');
let UtilityProcessWorkerMainService = class UtilityProcessWorkerMainService extends Disposable {
    constructor(logService, windowsMainService, telemetryService, lifecycleMainService) {
        super();
        this.logService = logService;
        this.windowsMainService = windowsMainService;
        this.telemetryService = telemetryService;
        this.lifecycleMainService = lifecycleMainService;
        this.workers = new Map();
    }
    async createWorker(configuration) {
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
        const onDidTerminate = new DeferredPromise();
        Event.once(worker.onDidTerminate)(reason => {
            if (reason.code === 0) {
                this.logService.trace(`[UtilityProcessWorker]: terminated normally with code ${reason.code}, signal: ${reason.signal}`);
            }
            else {
                this.logService.error(`[UtilityProcessWorker]: terminated unexpectedly with code ${reason.code}, signal: ${reason.signal}`);
            }
            this.workers.delete(workerId);
            onDidTerminate.complete({ reason });
        });
        return onDidTerminate.p;
    }
    hash(configuration) {
        return hash({
            moduleId: configuration.process.moduleId,
            windowId: configuration.reply.windowId
        });
    }
    async disposeWorker(configuration) {
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
};
UtilityProcessWorkerMainService = __decorate([
    __param(0, ILogService),
    __param(1, IWindowsMainService),
    __param(2, ITelemetryService),
    __param(3, ILifecycleMainService)
], UtilityProcessWorkerMainService);
export { UtilityProcessWorkerMainService };
let UtilityProcessWorker = class UtilityProcessWorker extends Disposable {
    constructor(logService, windowsMainService, telemetryService, lifecycleMainService, configuration) {
        super();
        this.windowsMainService = windowsMainService;
        this.configuration = configuration;
        this._onDidTerminate = this._register(new Emitter());
        this.onDidTerminate = this._onDidTerminate.event;
        this.utilityProcess = this._register(new WindowUtilityProcess(logService, windowsMainService, telemetryService, lifecycleMainService));
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.utilityProcess.onExit(e => this._onDidTerminate.fire({ code: e.code, signal: e.signal })));
        this._register(this.utilityProcess.onCrash(e => this._onDidTerminate.fire({ code: e.code, signal: 'ECRASH' })));
    }
    spawn() {
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
};
UtilityProcessWorker = __decorate([
    __param(0, ILogService),
    __param(1, IWindowsMainService),
    __param(2, ITelemetryService),
    __param(3, ILifecycleMainService)
], UtilityProcessWorker);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbGl0eVByb2Nlc3NXb3JrZXJNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3V0aWxpdHlQcm9jZXNzL2VsZWN0cm9uLW1haW4vdXRpbGl0eVByb2Nlc3NXb3JrZXJNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0RCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLEtBQUssRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFOUYsTUFBTSxDQUFDLE1BQU0sZ0NBQWdDLEdBQUcsZUFBZSxDQUFtQyxzQkFBc0IsQ0FBQyxDQUFDO0FBT25ILElBQU0sK0JBQStCLEdBQXJDLE1BQU0sK0JBQWdDLFNBQVEsVUFBVTtJQU05RCxZQUNjLFVBQXdDLEVBQ2hDLGtCQUF3RCxFQUMxRCxnQkFBb0QsRUFDaEQsb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBTHNCLGVBQVUsR0FBVixVQUFV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