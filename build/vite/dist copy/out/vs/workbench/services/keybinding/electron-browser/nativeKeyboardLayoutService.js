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
import { macLinuxKeyboardMappingEquals, windowsKeyboardMappingEquals } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { Emitter } from '../../../../base/common/event.js';
import { OS } from '../../../../base/common/platform.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const INativeKeyboardLayoutService = createDecorator('nativeKeyboardLayoutService');
let NativeKeyboardLayoutService = class NativeKeyboardLayoutService extends Disposable {
    constructor(mainProcessService) {
        super();
        this._onDidChangeKeyboardLayout = this._register(new Emitter());
        this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
        this._keyboardLayoutService = ProxyChannel.toService(mainProcessService.getChannel('keyboardLayout'));
        this._initPromise = null;
        this._keyboardMapping = null;
        this._keyboardLayoutInfo = null;
        this._register(this._keyboardLayoutService.onDidChangeKeyboardLayout(async ({ keyboardLayoutInfo, keyboardMapping }) => {
            await this.initialize();
            if (keyboardMappingEquals(this._keyboardMapping, keyboardMapping)) {
                // the mappings are equal
                return;
            }
            this._keyboardMapping = keyboardMapping;
            this._keyboardLayoutInfo = keyboardLayoutInfo;
            this._onDidChangeKeyboardLayout.fire();
        }));
    }
    initialize() {
        if (!this._initPromise) {
            this._initPromise = this._doInitialize();
        }
        return this._initPromise;
    }
    async _doInitialize() {
        const keyboardLayoutData = await this._keyboardLayoutService.getKeyboardLayoutData();
        const { keyboardLayoutInfo, keyboardMapping } = keyboardLayoutData;
        this._keyboardMapping = keyboardMapping;
        this._keyboardLayoutInfo = keyboardLayoutInfo;
    }
    getRawKeyboardMapping() {
        return this._keyboardMapping;
    }
    getCurrentKeyboardLayout() {
        return this._keyboardLayoutInfo;
    }
};
NativeKeyboardLayoutService = __decorate([
    __param(0, IMainProcessService)
], NativeKeyboardLayoutService);
export { NativeKeyboardLayoutService };
function keyboardMappingEquals(a, b) {
    if (OS === 1 /* OperatingSystem.Windows */) {
        return windowsKeyboardMappingEquals(a, b);
    }
    return macLinuxKeyboardMappingEquals(a, b);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvZWxlY3Ryb24tYnJvd3Nlci9uYXRpdmVLZXlib2FyZExheW91dFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBNEYsNkJBQTZCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNyTyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFtQixFQUFFLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUU1RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTdGLE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLGVBQWUsQ0FBK0IsNkJBQTZCLENBQUMsQ0FBQztBQVNsSCxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFZMUQsWUFDc0Isa0JBQXVDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBWFEsK0JBQTBCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDekUsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQVcxRSxJQUFJLENBQUMsc0JBQXNCLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBbUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztRQUN4SSxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQzdCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFaEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMseUJBQXlCLENBQUMsS0FBSyxFQUFFLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLEVBQUUsRUFBRTtZQUN0SCxNQUFNLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN4QixJQUFJLHFCQUFxQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsRUFBRSxDQUFDO2dCQUNuRSx5QkFBeUI7Z0JBQ3pCLE9BQU87WUFDUixDQUFDO1lBRUQsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsQ0FBQztZQUN4QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7WUFDOUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU0sVUFBVTtRQUNoQixJQUFJLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ3hCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzFDLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhO1FBQzFCLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUNyRixNQUFNLEVBQUUsa0JBQWtCLEVBQUUsZUFBZSxFQUFFLEdBQUcsa0JBQWtCLENBQUM7UUFDbkUsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGVBQWUsQ0FBQztRQUN4QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsa0JBQWtCLENBQUM7SUFDL0MsQ0FBQztJQUVNLHFCQUFxQjtRQUMzQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztJQUM5QixDQUFDO0lBRU0sd0JBQXdCO1FBQzlCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDO0lBQ2pDLENBQUM7Q0FDRCxDQUFBO0FBdkRZLDJCQUEyQjtJQWFyQyxXQUFBLG1CQUFtQixDQUFBO0dBYlQsMkJBQTJCLENBdUR2Qzs7QUFFRCxTQUFTLHFCQUFxQixDQUFDLENBQTBCLEVBQUUsQ0FBMEI7SUFDcEYsSUFBSSxFQUFFLG9DQUE0QixFQUFFLENBQUM7UUFDcEMsT0FBTyw0QkFBNEIsQ0FBaUMsQ0FBQyxFQUFrQyxDQUFDLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBRUQsT0FBTyw2QkFBNkIsQ0FBa0MsQ0FBQyxFQUFtQyxDQUFDLENBQUMsQ0FBQztBQUM5RyxDQUFDIn0=