/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IPowerService } from '../common/powerService.js';
/**
 * Browser stub implementation of IPowerService.
 * Power APIs are not available in web environments.
 */
export class BrowserPowerService extends Disposable {
    constructor() {
        super(...arguments);
        // Events never fire in browser
        this.onDidSuspend = Event.None;
        this.onDidResume = Event.None;
        this.onDidChangeOnBatteryPower = Event.None;
        this.onDidChangeThermalState = Event.None;
        this.onDidChangeSpeedLimit = Event.None;
        this.onWillShutdown = Event.None;
        this.onDidLockScreen = Event.None;
        this.onDidUnlockScreen = Event.None;
    }
    async getSystemIdleState(_idleThreshold) {
        return 'unknown';
    }
    async getSystemIdleTime() {
        return 0;
    }
    async getCurrentThermalState() {
        return 'unknown';
    }
    async isOnBatteryPower() {
        return false;
    }
    async startPowerSaveBlocker(_type) {
        // Return a fake ID (no-op in browser)
        return -1;
    }
    async stopPowerSaveBlocker(_id) {
        return false;
    }
    async isPowerSaveBlockerStarted(_id) {
        return false;
    }
}
registerSingleton(IPowerService, BrowserPowerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG93ZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3Bvd2VyL2Jyb3dzZXIvcG93ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxhQUFhLEVBQXVELE1BQU0sMkJBQTJCLENBQUM7QUFFL0c7OztHQUdHO0FBQ0gsTUFBTSxPQUFPLG1CQUFvQixTQUFRLFVBQVU7SUFBbkQ7O1FBSUMsK0JBQStCO1FBQ3RCLGlCQUFZLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUMxQixnQkFBVyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDekIsOEJBQXlCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUN2Qyw0QkFBdUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3JDLDBCQUFxQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDbkMsbUJBQWMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzVCLG9CQUFlLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUM3QixzQkFBaUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBOEJ6QyxDQUFDO0lBNUJBLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxjQUFzQjtRQUM5QyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQjtRQUN0QixPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCxLQUFLLENBQUMsc0JBQXNCO1FBQzNCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMsZ0JBQWdCO1FBQ3JCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxLQUEyQjtRQUN0RCxzQ0FBc0M7UUFDdEMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFRCxLQUFLLENBQUMsb0JBQW9CLENBQUMsR0FBVztRQUNyQyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxLQUFLLENBQUMseUJBQXlCLENBQUMsR0FBVztRQUMxQyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRDtBQUVELGlCQUFpQixDQUFDLGFBQWEsRUFBRSxtQkFBbUIsb0NBQTRCLENBQUMifQ==