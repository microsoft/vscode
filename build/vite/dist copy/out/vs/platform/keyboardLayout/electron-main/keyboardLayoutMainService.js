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
import * as platform from '../../../base/common/platform.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
export const IKeyboardLayoutMainService = createDecorator('keyboardLayoutMainService');
let KeyboardLayoutMainService = class KeyboardLayoutMainService extends Disposable {
    constructor(lifecycleMainService) {
        super();
        this._onDidChangeKeyboardLayout = this._register(new Emitter());
        this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
        this._initPromise = null;
        this._keyboardLayoutData = null;
        // perf: automatically trigger initialize after windows
        // have opened so that we can do this work in parallel
        // to the window load.
        lifecycleMainService.when(3 /* LifecycleMainPhase.AfterWindowOpen */).then(() => this._initialize());
    }
    _initialize() {
        if (!this._initPromise) {
            this._initPromise = this._doInitialize();
        }
        return this._initPromise;
    }
    async _doInitialize() {
        const nativeKeymapMod = await import('native-keymap');
        this._keyboardLayoutData = readKeyboardLayoutData(nativeKeymapMod);
        if (!platform.isCI) {
            // See https://github.com/microsoft/vscode/issues/152840
            // Do not register the keyboard layout change listener in CI because it doesn't work
            // on the build machines and it just adds noise to the build logs.
            nativeKeymapMod.onDidChangeKeyboardLayout(() => {
                this._keyboardLayoutData = readKeyboardLayoutData(nativeKeymapMod);
                this._onDidChangeKeyboardLayout.fire(this._keyboardLayoutData);
            });
        }
    }
    async getKeyboardLayoutData() {
        await this._initialize();
        return this._keyboardLayoutData;
    }
};
KeyboardLayoutMainService = __decorate([
    __param(0, ILifecycleMainService)
], KeyboardLayoutMainService);
export { KeyboardLayoutMainService };
function readKeyboardLayoutData(nativeKeymapMod) {
    const keyboardMapping = nativeKeymapMod.getKeyMap();
    const keyboardLayoutInfo = nativeKeymapMod.getCurrentKeyboardLayout();
    return { keyboardMapping, keyboardLayoutInfo };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRMYXlvdXRNYWluU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2VsZWN0cm9uLW1haW4va2V5Ym9hcmRMYXlvdXRNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEtBQUssUUFBUSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxxQkFBcUIsRUFBc0IsTUFBTSx1REFBdUQsQ0FBQztBQUVsSCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxlQUFlLENBQTZCLDJCQUEyQixDQUFDLENBQUM7QUFJNUcsSUFBTSx5QkFBeUIsR0FBL0IsTUFBTSx5QkFBMEIsU0FBUSxVQUFVO0lBVXhELFlBQ3dCLG9CQUEyQztRQUVsRSxLQUFLLEVBQUUsQ0FBQztRQVRRLCtCQUEwQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVCLENBQUMsQ0FBQztRQUN4Riw4QkFBeUIsR0FBRyxJQUFJLENBQUMsMEJBQTBCLENBQUMsS0FBSyxDQUFDO1FBUzFFLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFaEMsdURBQXVEO1FBQ3ZELHNEQUFzRDtRQUN0RCxzQkFBc0I7UUFDdEIsb0JBQW9CLENBQUMsSUFBSSw0Q0FBb0MsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDOUYsQ0FBQztJQUVPLFdBQVc7UUFDbEIsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN4QixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUMxQyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDO0lBQzFCLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYTtRQUMxQixNQUFNLGVBQWUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUV0RCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsc0JBQXNCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQix3REFBd0Q7WUFDeEQsb0ZBQW9GO1lBQ3BGLGtFQUFrRTtZQUNsRSxlQUFlLENBQUMseUJBQXlCLENBQUMsR0FBRyxFQUFFO2dCQUM5QyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsc0JBQXNCLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ25FLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7WUFDaEUsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO0lBQ0YsQ0FBQztJQUVNLEtBQUssQ0FBQyxxQkFBcUI7UUFDakMsTUFBTSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDekIsT0FBTyxJQUFJLENBQUMsbUJBQW9CLENBQUM7SUFDbEMsQ0FBQztDQUNELENBQUE7QUFqRFkseUJBQXlCO0lBV25DLFdBQUEscUJBQXFCLENBQUE7R0FYWCx5QkFBeUIsQ0FpRHJDOztBQUVELFNBQVMsc0JBQXNCLENBQUMsZUFBb0M7SUFDbkUsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ3BELE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFDLHdCQUF3QixFQUFFLENBQUM7SUFDdEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0FBQ2hELENBQUMifQ==