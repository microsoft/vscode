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
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadLabelService = class MainThreadLabelService extends Disposable {
    constructor(_, _labelService) {
        super();
        this._labelService = _labelService;
        this._resourceLabelFormatters = this._register(new DisposableMap());
    }
    $registerResourceLabelFormatter(handle, formatter) {
        // Dynamicily registered formatters should have priority over those contributed via package.json
        formatter.priority = true;
        const disposable = this._labelService.registerCachedFormatter(formatter);
        this._resourceLabelFormatters.set(handle, disposable);
    }
    $unregisterResourceLabelFormatter(handle) {
        this._resourceLabelFormatters.deleteAndDispose(handle);
    }
};
MainThreadLabelService = __decorate([
    extHostNamedCustomer(MainContext.MainThreadLabelService),
    __param(1, ILabelService)
], MainThreadLabelService);
export { MainThreadLabelService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZExhYmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTGFiZWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLGFBQWEsRUFBMEIsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUErQixNQUFNLCtCQUErQixDQUFDO0FBQ3pGLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUd0RyxJQUFNLHNCQUFzQixHQUE1QixNQUFNLHNCQUF1QixTQUFRLFVBQVU7SUFJckQsWUFDQyxDQUFrQixFQUNILGFBQTZDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBRndCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBSjVDLDZCQUF3QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQVUsQ0FBQyxDQUFDO0lBT3hGLENBQUM7SUFFRCwrQkFBK0IsQ0FBQyxNQUFjLEVBQUUsU0FBaUM7UUFDaEYsZ0dBQWdHO1FBQ2hHLFNBQVMsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1FBQzFCLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVELGlDQUFpQyxDQUFDLE1BQWM7UUFDL0MsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDRCxDQUFBO0FBckJZLHNCQUFzQjtJQURsQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsc0JBQXNCLENBQUM7SUFPdEQsV0FBQSxhQUFhLENBQUE7R0FOSCxzQkFBc0IsQ0FxQmxDIn0=