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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IPowerService } from '../common/powerService.js';
import { Event } from '../../../../base/common/event.js';
/**
 * Desktop implementation of IPowerService using Electron's powerMonitor.
 */
let NativePowerService = class NativePowerService extends Disposable {
    constructor(nativeHostService) {
        super();
        this.nativeHostService = nativeHostService;
        // Forward events from native host service
        this.onDidSuspend = nativeHostService.onDidSuspendOS;
        this.onDidResume = Event.map(nativeHostService.onDidResumeOS, () => undefined);
        this.onDidChangeOnBatteryPower = nativeHostService.onDidChangeOnBatteryPower;
        this.onDidChangeThermalState = nativeHostService.onDidChangeThermalState;
        this.onDidChangeSpeedLimit = nativeHostService.onDidChangeSpeedLimit;
        this.onWillShutdown = nativeHostService.onWillShutdownOS;
        this.onDidLockScreen = nativeHostService.onDidLockScreen;
        this.onDidUnlockScreen = nativeHostService.onDidUnlockScreen;
    }
    async getSystemIdleState(idleThreshold) {
        return this.nativeHostService.getSystemIdleState(idleThreshold);
    }
    async getSystemIdleTime() {
        return this.nativeHostService.getSystemIdleTime();
    }
    async getCurrentThermalState() {
        return this.nativeHostService.getCurrentThermalState();
    }
    async isOnBatteryPower() {
        return this.nativeHostService.isOnBatteryPower();
    }
    async startPowerSaveBlocker(type) {
        return this.nativeHostService.startPowerSaveBlocker(type);
    }
    async stopPowerSaveBlocker(id) {
        return this.nativeHostService.stopPowerSaveBlocker(id);
    }
    async isPowerSaveBlockerStarted(id) {
        return this.nativeHostService.isPowerSaveBlockerStarted(id);
    }
};
NativePowerService = __decorate([
    __param(0, INativeHostService)
], NativePowerService);
export { NativePowerService };
registerSingleton(IPowerService, NativePowerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG93ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3Bvd2VyL2VsZWN0cm9uLWJyb3dzZXIvcG93ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGFBQWEsRUFBdUQsTUFBTSwyQkFBMkIsQ0FBQztBQUMvRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQ7O0dBRUc7QUFDSSxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFhakQsWUFDc0MsaUJBQXFDO1FBRTFFLEtBQUssRUFBRSxDQUFDO1FBRjZCLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFJMUUsMENBQTBDO1FBQzFDLElBQUksQ0FBQyxZQUFZLEdBQUcsaUJBQWlCLENBQUMsY0FBYyxDQUFDO1FBQ3JELElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0UsSUFBSSxDQUFDLHlCQUF5QixHQUFHLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDO1FBQzdFLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxpQkFBaUIsQ0FBQyx1QkFBdUIsQ0FBQztRQUN6RSxJQUFJLENBQUMscUJBQXFCLEdBQUcsaUJBQWlCLENBQUMscUJBQXFCLENBQUM7UUFDckUsSUFBSSxDQUFDLGNBQWMsR0FBRyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQztRQUN6RCxJQUFJLENBQUMsZUFBZSxHQUFHLGlCQUFpQixDQUFDLGVBQWUsQ0FBQztRQUN6RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsaUJBQWlCLENBQUMsaUJBQWlCLENBQUM7SUFDOUQsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxhQUFxQjtRQUM3QyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQjtRQUN0QixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQ25ELENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCO1FBQzNCLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDeEQsQ0FBQztJQUVELEtBQUssQ0FBQyxnQkFBZ0I7UUFDckIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUNsRCxDQUFDO0lBRUQsS0FBSyxDQUFDLHFCQUFxQixDQUFDLElBQTBCO1FBQ3JELE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsRUFBVTtRQUNwQyxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRUQsS0FBSyxDQUFDLHlCQUF5QixDQUFDLEVBQVU7UUFDekMsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNELENBQUE7QUF4RFksa0JBQWtCO0lBYzVCLFdBQUEsa0JBQWtCLENBQUE7R0FkUixrQkFBa0IsQ0F3RDlCOztBQUVELGlCQUFpQixDQUFDLGFBQWEsRUFBRSxrQkFBa0Isb0NBQTRCLENBQUMifQ==