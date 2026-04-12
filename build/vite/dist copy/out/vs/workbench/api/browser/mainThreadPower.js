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
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IPowerService } from '../../services/power/common/powerService.js';
let MainThreadPower = class MainThreadPower extends Disposable {
    constructor(extHostContext, powerService) {
        super();
        this.powerService = powerService;
        this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostPower);
        // Forward power events to extension host
        this._register(this.powerService.onDidSuspend(this.proxy.$onDidSuspend, this.proxy));
        this._register(this.powerService.onDidResume(this.proxy.$onDidResume, this.proxy));
        this._register(this.powerService.onDidChangeOnBatteryPower(this.proxy.$onDidChangeOnBatteryPower, this.proxy));
        this._register(this.powerService.onDidChangeThermalState((state) => this.proxy.$onDidChangeThermalState(state), this));
        this._register(this.powerService.onDidChangeSpeedLimit(this.proxy.$onDidChangeSpeedLimit, this.proxy));
        this._register(this.powerService.onWillShutdown(this.proxy.$onWillShutdown, this.proxy));
        this._register(this.powerService.onDidLockScreen(this.proxy.$onDidLockScreen, this.proxy));
        this._register(this.powerService.onDidUnlockScreen(this.proxy.$onDidUnlockScreen, this.proxy));
    }
    async $getSystemIdleState(idleThreshold) {
        return this.powerService.getSystemIdleState(idleThreshold);
    }
    async $getSystemIdleTime() {
        return this.powerService.getSystemIdleTime();
    }
    async $getCurrentThermalState() {
        return this.powerService.getCurrentThermalState();
    }
    async $isOnBatteryPower() {
        return this.powerService.isOnBatteryPower();
    }
    async $startPowerSaveBlocker(type) {
        return this.powerService.startPowerSaveBlocker(type);
    }
    async $stopPowerSaveBlocker(id) {
        return this.powerService.stopPowerSaveBlocker(id);
    }
    async $isPowerSaveBlockerStarted(id) {
        return this.powerService.isPowerSaveBlockerStarted(id);
    }
};
MainThreadPower = __decorate([
    extHostNamedCustomer(MainContext.MainThreadPower),
    __param(1, IPowerService)
], MainThreadPower);
export { MainThreadPower };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFBvd2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRQb3dlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQXFCLFdBQVcsRUFBdUYsTUFBTSwrQkFBK0IsQ0FBQztBQUNwTCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHckUsSUFBTSxlQUFlLEdBQXJCLE1BQU0sZUFBZ0IsU0FBUSxVQUFVO0lBSTlDLFlBQ0MsY0FBK0IsRUFDQyxZQUEyQjtRQUUzRCxLQUFLLEVBQUUsQ0FBQztRQUZ3QixpQkFBWSxHQUFaLFlBQVksQ0FBZTtRQUczRCxJQUFJLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRWxFLHlDQUF5QztRQUN6QyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDbkYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDL0csSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLHVCQUF1QixDQUFDLENBQUMsS0FBd0IsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3ZHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDekYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsYUFBcUI7UUFDOUMsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzlDLENBQUM7SUFFRCxLQUFLLENBQUMsdUJBQXVCO1FBQzVCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO0lBQ25ELENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCO1FBQ3RCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzdDLENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCLENBQUMsSUFBMEI7UUFDdEQsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCLENBQUMsRUFBVTtRQUNyQyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxFQUFVO1FBQzFDLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN4RCxDQUFDO0NBQ0QsQ0FBQTtBQWpEWSxlQUFlO0lBRDNCLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUM7SUFPL0MsV0FBQSxhQUFhLENBQUE7R0FOSCxlQUFlLENBaUQzQiJ9