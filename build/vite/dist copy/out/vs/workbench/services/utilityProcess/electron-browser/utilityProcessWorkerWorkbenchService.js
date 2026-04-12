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
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { Client as MessagePortClient } from '../../../../base/parts/ipc/common/ipc.mp.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { acquirePort } from '../../../../base/parts/ipc/electron-browser/ipc.mp.js';
import { ipcUtilityProcessWorkerChannelName } from '../../../../platform/utilityProcess/common/utilityProcessWorkerService.js';
import { Barrier, timeout } from '../../../../base/common/async.js';
export const IUtilityProcessWorkerWorkbenchService = createDecorator('utilityProcessWorkerWorkbenchService');
let UtilityProcessWorkerWorkbenchService = class UtilityProcessWorkerWorkbenchService extends Disposable {
    get utilityProcessWorkerService() {
        if (!this._utilityProcessWorkerService) {
            const channel = this.mainProcessService.getChannel(ipcUtilityProcessWorkerChannelName);
            this._utilityProcessWorkerService = ProxyChannel.toService(channel);
        }
        return this._utilityProcessWorkerService;
    }
    constructor(windowId, logService, mainProcessService) {
        super();
        this.windowId = windowId;
        this.logService = logService;
        this.mainProcessService = mainProcessService;
        this._utilityProcessWorkerService = undefined;
        this.restoredBarrier = new Barrier();
    }
    async createWorker(process) {
        this.logService.trace('Renderer->UtilityProcess#createWorker');
        // We want to avoid heavy utility process work to happen before
        // the window has restored. As such, make sure we await the
        // `Restored` phase before making a connection attempt, but also
        // add a timeout to be safe against possible deadlocks.
        await Promise.race([this.restoredBarrier.wait(), timeout(2000)]);
        // Get ready to acquire the message port from the utility process worker
        const nonce = generateUuid();
        const responseChannel = 'vscode:createUtilityProcessWorkerMessageChannelResult';
        const portPromise = acquirePort(undefined /* we trigger the request via service call! */, responseChannel, nonce);
        // Actually talk with the utility process service
        // to create a new process from a worker
        const onDidTerminate = this.utilityProcessWorkerService.createWorker({
            process,
            reply: { windowId: this.windowId, channel: responseChannel, nonce }
        });
        // Dispose worker upon disposal via utility process service
        const disposables = new DisposableStore();
        disposables.add(toDisposable(() => {
            this.logService.trace('Renderer->UtilityProcess#disposeWorker', process);
            this.utilityProcessWorkerService.disposeWorker({
                process,
                reply: { windowId: this.windowId }
            });
        }));
        const port = await portPromise;
        const client = disposables.add(new MessagePortClient(port, `window:${this.windowId},module:${process.moduleId}`));
        this.logService.trace('Renderer->UtilityProcess#createWorkerChannel: connection established');
        onDidTerminate.then(({ reason }) => {
            if (reason?.code === 0) {
                this.logService.trace(`[UtilityProcessWorker]: terminated normally with code ${reason.code}, signal: ${reason.signal}`);
            }
            else {
                this.logService.error(`[UtilityProcessWorker]: terminated unexpectedly with code ${reason?.code}, signal: ${reason?.signal}`);
            }
        });
        return { client, onDidTerminate, dispose: () => disposables.dispose() };
    }
    notifyRestored() {
        if (!this.restoredBarrier.isOpen()) {
            this.restoredBarrier.open();
        }
    }
};
UtilityProcessWorkerWorkbenchService = __decorate([
    __param(1, ILogService),
    __param(2, IMainProcessService)
], UtilityProcessWorkerWorkbenchService);
export { UtilityProcessWorkerWorkbenchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbGl0eVByb2Nlc3NXb3JrZXJXb3JrYmVuY2hTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3V0aWxpdHlQcm9jZXNzL2VsZWN0cm9uLWJyb3dzZXIvdXRpbGl0eVByb2Nlc3NXb3JrZXJXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsTUFBTSxJQUFJLGlCQUFpQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBYSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3BGLE9BQU8sRUFBNkMsa0NBQWtDLEVBQThELE1BQU0sMkVBQTJFLENBQUM7QUFDdE8sT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVwRSxNQUFNLENBQUMsTUFBTSxxQ0FBcUMsR0FBRyxlQUFlLENBQXdDLHNDQUFzQyxDQUFDLENBQUM7QUF1RDdJLElBQU0sb0NBQW9DLEdBQTFDLE1BQU0sb0NBQXFDLFNBQVEsVUFBVTtJQUtuRSxJQUFZLDJCQUEyQjtRQUN0QyxJQUFJLENBQUMsSUFBSSxDQUFD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