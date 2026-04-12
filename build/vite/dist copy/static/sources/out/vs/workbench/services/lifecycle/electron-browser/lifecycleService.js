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
var NativeLifecycleService_1;
import { handleVetos } from '../../../../platform/lifecycle/common/lifecycle.js';
import { ILifecycleService, WillShutdownJoinerOrder } from '../common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractLifecycleService } from '../common/lifecycleService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { Promises, disposableTimeout, raceCancellation } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
let NativeLifecycleService = class NativeLifecycleService extends AbstractLifecycleService {
    static { NativeLifecycleService_1 = this; }
    static { this.BEFORE_SHUTDOWN_WARNING_DELAY = 5000; }
    static { this.WILL_SHUTDOWN_WARNING_DELAY = 800; }
    constructor(nativeHostService, storageService, logService) {
        super(logService, storageService);
        this.nativeHostService = nativeHostService;
        this.registerListeners();
    }
    registerListeners() {
        const windowId = this.nativeHostService.windowId;
        // Main side indicates that window is about to unload, check for vetos
        ipcRenderer.on('vscode:onBeforeUnload', async (event, ...args) => {
            const reply = args[0];
            this.logService.trace(`[lifecycle] onBeforeUnload (reason: ${reply.reason})`);
            // trigger onBeforeShutdown events and veto collecting
            const veto = await this.handleBeforeShutdown(reply.reason);
            // veto: cancel unload
            if (veto) {
                this.logService.trace('[lifecycle] onBeforeUnload prevented via veto');
                // Indicate as event
                this._onShutdownVeto.fire();
                ipcRenderer.send(reply.cancelChannel, windowId);
            }
            // no veto: allow unload
            else {
                this.logService.trace('[lifecycle] onBeforeUnload continues without veto');
                this.shutdownReason = reply.reason;
                ipcRenderer.send(reply.okChannel, windowId);
            }
        });
        // Main side indicates that we will indeed shutdown
        ipcRenderer.on('vscode:onWillUnload', async (event, ...args) => {
            const reply = args[0];
            this.logService.trace(`[lifecycle] onWillUnload (reason: ${reply.reason})`);
            // trigger onWillShutdown events and joining
            await this.handleWillShutdown(reply.reason);
            // trigger onDidShutdown event now that we know we will quit
            this._onDidShutdown.fire();
            // acknowledge to main side
            ipcRenderer.send(reply.replyChannel, windowId);
        });
    }
    async handleBeforeShutdown(reason) {
        const logService = this.logService;
        const vetos = [];
        const pendingVetos = new Set();
        let finalVeto = undefined;
        let finalVetoId = undefined;
        // before-shutdown event with veto support
        this._onBeforeShutdown.fire({
            reason,
            veto(value, id) {
                vetos.push(value);
                // Log any veto instantly
                if (value === true) {
                    logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
                }
                // Track promise completion
                else if (value instanceof Promise) {
                    pendingVetos.add(id);
                    value.then(veto => {
                        if (veto === true) {
                            logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
                        }
                    }).finally(() => pendingVetos.delete(id));
                }
            },
            finalVeto(value, id) {
                if (!finalVeto) {
                    finalVeto = value;
                    finalVetoId = id;
                }
                else {
                    throw new Error(`[lifecycle]: Final veto is already defined (id: ${id})`);
                }
            }
        });
        const longRunningBeforeShutdownWarning = disposableTimeout(() => {
            logService.warn(`[lifecycle] onBeforeShutdown is taking a long time, pending operations: ${Array.from(pendingVetos).join(', ')}`);
        }, NativeLifecycleService_1.BEFORE_SHUTDOWN_WARNING_DELAY);
        try {
            // First: run list of vetos in parallel
            let veto = await handleVetos(vetos, error => this.handleBeforeShutdownError(error, reason));
            if (veto) {
                return veto;
            }
            // Second: run the final veto if defined
            if (finalVeto) {
                try {
                    pendingVetos.add(finalVetoId);
                    veto = await finalVeto();
                    if (veto) {
                        logService.info(`[lifecycle]: Shutdown was prevented by final veto (id: ${finalVetoId})`);
                    }
                }
                catch (error) {
                    veto = true; // treat error as veto
                    this.handleBeforeShutdownError(error, reason);
                }
            }
            return veto;
        }
        finally {
            longRunningBeforeShutdownWarning.dispose();
        }
    }
    handleBeforeShutdownError(error, reason) {
        this.logService.error(`[lifecycle]: Error during before-shutdown phase (error: ${toErrorMessage(error)})`);
        this._onBeforeShutdownError.fire({ reason, error });
    }
    async handleWillShutdown(reason) {
        this._willShutdown = true;
        const joiners = [];
        const lastJoiners = [];
        const pendingJoiners = new Set();
        const cts = new CancellationTokenSource();
        this._onWillShutdown.fire({
            reason,
            token: cts.token,
            joiners: () => Array.from(pendingJoiners.values()),
            join(promiseOrPromiseFn, joiner) {
                pendingJoiners.add(joiner);
                if (joiner.order === WillShutdownJoinerOrder.Last) {
                    const promiseFn = typeof promiseOrPromiseFn === 'function' ? promiseOrPromiseFn : () => promiseOrPromiseFn;
                    lastJoiners.push(() => promiseFn().finally(() => pendingJoiners.delete(joiner)));
                }
                else {
                    const promise = typeof promiseOrPromiseFn === 'function' ? promiseOrPromiseFn() : promiseOrPromiseFn;
                    promise.finally(() => pendingJoiners.delete(joiner));
                    joiners.push(promise);
                }
            },
            force: () => {
                cts.dispose(true);
            }
        });
        const longRunningWillShutdownWarning = disposableTimeout(() => {
            this.logService.warn(`[lifecycle] onWillShutdown is taking a long time, pending operations: ${Array.from(pendingJoiners).map(joiner => joiner.id).join(', ')}`);
        }, NativeLifecycleService_1.WILL_SHUTDOWN_WARNING_DELAY);
        try {
            await raceCancellation(Promises.settled(joiners), cts.token);
        }
        catch (error) {
            this.logService.error(`[lifecycle]: Error during will-shutdown phase in default joiners (error: ${toErrorMessage(error)})`);
        }
        try {
            await raceCancellation(Promises.settled(lastJoiners.map(lastJoiner => lastJoiner())), cts.token);
        }
        catch (error) {
            this.logService.error(`[lifecycle]: Error during will-shutdown phase in last joiners (error: ${toErrorMessage(error)})`);
        }
        longRunningWillShutdownWarning.dispose();
    }
    shutdown() {
        return this.nativeHostService.closeWindow();
    }
};
NativeLifecycleService = NativeLifecycleService_1 = __decorate([
    __param(0, INativeHostService),
    __param(1, IStorageService),
    __param(2, ILogService)
], NativeLifecycleService);
export { NativeLifecycleService };
registerSingleton(ILifecycleService, NativeLifecycleService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlmZWN5Y2xlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvZWxlY3Ryb24tYnJvd3Nlci9saWZlY3ljbGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDakYsT0FBTyxFQUFrQixpQkFBaUIsRUFBNEIsdUJBQXVCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM5SCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN6RSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUUzRSxJQUFNLHNCQUFzQixHQUE1QixNQUFNLHNCQUF1QixTQUFRLHdCQUF3Qjs7YUFFM0Msa0NBQTZCLEdBQUcsSUFBSSxBQUFQLENBQVE7YUFDckMsZ0NBQTJCLEdBQUcsR0FBRyxBQUFOLENBQU87SUFFMUQsWUFDc0MsaUJBQXFDLEVBQ3pELGNBQStCLEVBQ25DLFVBQXVCO1FBRXBDLEtBQUssQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFKRyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBTTFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzFCLENBQUM7SUFFTyxpQkFBaUI7UUFDeEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQztRQUVqRCxzRUFBc0U7UUFDdEUsV0FBVyxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsRUFBRSxLQUFLLEVBQUUsS0FBYyxFQUFFLEdBQUcsSUFBZSxFQUFFLEVBQUU7WUFDcEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBeUUsQ0FBQztZQUM5RixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFFOUUsc0RBQXNEO1lBQ3RELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUUzRCxzQkFBc0I7WUFDdEIsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO2dCQUV2RSxvQkFBb0I7Z0JBQ3BCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRTVCLFdBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRCxDQUFDO1lBRUQsd0JBQXdCO2lCQUNuQixDQUFDO2dCQUNMLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7Z0JBRTNFLElBQUksQ0FBQyxjQUFjLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztnQkFDbkMsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzdDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUVILG1EQUFtRDtRQUNuRCxXQUFXLENBQUMsRUFBRSxDQUFDLHFCQUFxQixFQUFFLEtBQUssRUFBRSxLQUFjLEVBQUUsR0FBRyxJQUFlLEVBQUUsRUFBRTtZQUNsRixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFxRCxDQUFDO1lBQzFFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztZQUU1RSw0Q0FBNEM7WUFDNUMsTUFBTSxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBRTVDLDREQUE0RDtZQUM1RCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO1lBRTNCLDJCQUEyQjtZQUMzQixXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDaEQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRVMsS0FBSyxDQUFDLG9CQUFvQixDQUFDLE1BQXNCO1FBQzFELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFFbkMsTUFBTSxLQUFLLEdBQW1DLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRXZDLElBQUksU0FBUyxHQUFtRCxTQUFTLENBQUM7UUFDMUUsSUFBSSxXQUFXLEdBQXVCLFNBQVMsQ0FBQztRQUVoRCwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQztZQUMzQixNQUFNO1lBQ04sSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFO2dCQUNiLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRWxCLHlCQUF5QjtnQkFDekIsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7b0JBQ3BCLFVBQVUsQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ3BFLENBQUM7Z0JBRUQsMkJBQTJCO3FCQUN0QixJQUFJLEtBQUssWUFBWSxPQUFPLEVBQUUsQ0FBQztvQkFDbkMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDckIsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTt3QkFDakIsSUFBSSxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUM7NEJBQ25CLFVBQVUsQ0FBQyxJQUFJLENBQUMsNENBQTRDLEVBQUUsR0FBRyxDQUFDLENBQUM7d0JBQ3BFLENBQUM7b0JBQ0YsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDM0MsQ0FBQztZQUNGLENBQUM7WUFDRCxTQUFTLENBQUMsS0FBSyxFQUFFLEVBQUU7Z0JBQ2xCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztvQkFDaEIsU0FBUyxHQUFHLEtBQUssQ0FBQztvQkFDbEIsV0FBVyxHQUFHLEVBQUUsQ0FBQztnQkFDbEIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE1BQU0sSUFBSSxLQUFLLENBQUMsbURBQW1ELEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzNFLENBQUM7WUFDRixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxnQ0FBZ0MsR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUU7WUFDL0QsVUFBVSxDQUFDLElBQUksQ0FBQywyRUFBMkUsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25JLENBQUMsRUFBRSx3QkFBc0IsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBRXpELElBQUksQ0FBQztZQUVKLHVDQUF1QztZQUN2QyxJQUFJLElBQUksR0FBRyxNQUFNLFdBQVcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDNUYsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixPQUFPLElBQUksQ0FBQztZQUNiLENBQUM7WUFFRCx3Q0FBd0M7WUFDeEMsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZixJQUFJLENBQUM7b0JBQ0osWUFBWSxDQUFDLEdBQUcsQ0FBQyxXQUFnQyxDQUFDLENBQUM7b0JBQ25ELElBQUksR0FBRyxNQUFPLFNBQW9DLEVBQUUsQ0FBQztvQkFDckQsSUFBSSxJQUFJLEVBQUUsQ0FBQzt3QkFDVixVQUFVLENBQUMsSUFBSSxDQUFDLDBEQUEwRCxXQUFXLEdBQUcsQ0FBQyxDQUFDO29CQUMzRixDQUFDO2dCQUNGLENBQUM7Z0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztvQkFDaEIsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLHNCQUFzQjtvQkFFbkMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDL0MsQ0FBQztZQUNGLENBQUM7WUFFRCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7Z0JBQVMsQ0FBQztZQUNWLGdDQUFnQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVDLENBQUM7SUFDRixDQUFDO0lBRU8seUJBQXlCLENBQUMsS0FBWSxFQUFFLE1BQXNCO1FBQ3JFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDJEQUEyRCxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRTNHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRVMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLE1BQXNCO1FBQ3hELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1FBRTFCLE1BQU0sT0FBTyxHQUFvQixFQUFFLENBQUM7UUFDcEMsTUFBTSxXQUFXLEdBQTRCLEVBQUUsQ0FBQztRQUNoRCxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQUMzRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUM7WUFDekIsTUFBTTtZQUNOLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSztZQUNoQixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbEQsSUFBSSxDQUFDLGtCQUFrQixFQUFFLE1BQU07Z0JBQzlCLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBRTNCLElBQUksTUFBTSxDQUFDLEtBQUssS0FBSyx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDbkQsTUFBTSxTQUFTLEdBQUcsT0FBTyxrQkFBa0IsS0FBSyxVQUFVLENBQUMsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQztvQkFDM0csV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xGLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLE9BQU8sR0FBRyxPQUFPLGtCQUFrQixLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUM7b0JBQ3JHLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUN2QixDQUFDO1lBQ0YsQ0FBQztZQUNELEtBQUssRUFBRSxHQUFHLEVBQUU7Z0JBQ1gsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSw4QkFBOEIsR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUU7WUFDN0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMseUVBQXlFLEtBQUssQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDakssQ0FBQyxFQUFFLHdCQUFzQixDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFFdkQsSUFBSSxDQUFDO1lBQ0osTUFBTSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5RCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyw0RUFBNEUsY0FBYyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3SCxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osTUFBTSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xHLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHlFQUF5RSxjQUFjLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFILENBQUM7UUFFRCw4QkFBOEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQsUUFBUTtRQUNQLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQzdDLENBQUM7O0FBN0xXLHNCQUFzQjtJQU1oQyxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxXQUFXLENBQUE7R0FSRCxzQkFBc0IsQ0E4TGxDOztBQUVELGlCQUFpQixDQUFDLGlCQUFpQixFQUFFLHNCQUFzQixrQ0FBMEIsQ0FBQyJ9