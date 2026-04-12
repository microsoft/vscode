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
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { MainContext } from './extHost.protocol.js';
let ExtHostPower = class ExtHostPower extends Disposable {
    constructor(extHostRpc) {
        super();
        // Events
        this._onDidSuspend = this._register(new Emitter());
        this.onDidSuspend = this._onDidSuspend.event;
        this._onDidResume = this._register(new Emitter());
        this.onDidResume = this._onDidResume.event;
        this._onDidChangeOnBatteryPower = this._register(new Emitter());
        this.onDidChangeOnBatteryPower = this._onDidChangeOnBatteryPower.event;
        this._onDidChangeThermalState = this._register(new Emitter());
        this.onDidChangeThermalState = this._onDidChangeThermalState.event;
        this._onDidChangeSpeedLimit = this._register(new Emitter());
        this.onDidChangeSpeedLimit = this._onDidChangeSpeedLimit.event;
        this._onWillShutdown = this._register(new Emitter());
        this.onWillShutdown = this._onWillShutdown.event;
        this._onDidLockScreen = this._register(new Emitter());
        this.onDidLockScreen = this._onDidLockScreen.event;
        this._onDidUnlockScreen = this._register(new Emitter());
        this.onDidUnlockScreen = this._onDidUnlockScreen.event;
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadPower);
    }
    // === Proxy callbacks (called by MainThread) ===
    $onDidSuspend() {
        this._onDidSuspend.fire();
    }
    $onDidResume() {
        this._onDidResume.fire();
    }
    $onDidChangeOnBatteryPower(isOnBattery) {
        this._onDidChangeOnBatteryPower.fire(isOnBattery);
    }
    $onDidChangeThermalState(state) {
        this._onDidChangeThermalState.fire(state);
    }
    $onDidChangeSpeedLimit(limit) {
        this._onDidChangeSpeedLimit.fire(limit);
    }
    $onWillShutdown() {
        this._onWillShutdown.fire();
    }
    $onDidLockScreen() {
        this._onDidLockScreen.fire();
    }
    $onDidUnlockScreen() {
        this._onDidUnlockScreen.fire();
    }
    // === API for extensions ===
    getSystemIdleState(idleThresholdSeconds) {
        return this._proxy.$getSystemIdleState(idleThresholdSeconds);
    }
    getSystemIdleTime() {
        return this._proxy.$getSystemIdleTime();
    }
    getCurrentThermalState() {
        return this._proxy.$getCurrentThermalState();
    }
    isOnBatteryPower() {
        return this._proxy.$isOnBatteryPower();
    }
    async startPowerSaveBlocker(type) {
        const id = await this._proxy.$startPowerSaveBlocker(type);
        const proxy = this._proxy;
        const isSupported = id >= 0;
        let disposed = false;
        return {
            id,
            get isStarted() {
                return isSupported && !disposed;
            },
            dispose: () => {
                if (isSupported && !disposed) {
                    disposed = true;
                    proxy.$stopPowerSaveBlocker(id);
                }
            }
        };
    }
};
ExtHostPower = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostPower);
export { ExtHostPower };
export const IExtHostPower = createDecorator('IExtHostPower');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFBvd2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdFBvd2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzVELE9BQU8sRUFBcUIsV0FBVyxFQUF1RixNQUFNLHVCQUF1QixDQUFDO0FBRXJKLElBQU0sWUFBWSxHQUFsQixNQUFNLFlBQWEsU0FBUSxVQUFVO0lBK0IzQyxZQUNxQixVQUE4QjtRQUVsRCxLQUFLLEVBQUUsQ0FBQztRQTVCVCxTQUFTO1FBQ1Esa0JBQWEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUM1RCxpQkFBWSxHQUFnQixJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQztRQUU3QyxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNELGdCQUFXLEdBQWdCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBRTNDLCtCQUEwQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVcsQ0FBQyxDQUFDO1FBQzVFLDhCQUF5QixHQUFtQixJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDO1FBRTFFLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXFCLENBQUMsQ0FB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