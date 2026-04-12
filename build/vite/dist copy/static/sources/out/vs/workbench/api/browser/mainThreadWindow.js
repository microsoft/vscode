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
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IOpenerService } from '../../../platform/opener/common/opener.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IHostService } from '../../services/host/browser/host.js';
import { IUserActivityService } from '../../services/userActivity/common/userActivityService.js';
import { encodeBase64 } from '../../../base/common/buffer.js';
let MainThreadWindow = class MainThreadWindow {
    constructor(extHostContext, hostService, openerService, userActivityService) {
        this.hostService = hostService;
        this.openerService = openerService;
        this.userActivityService = userActivityService;
        this.disposables = new DisposableStore();
        this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostWindow);
        Event.latch(hostService.onDidChangeFocus)(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
        userActivityService.onDidChangeIsActive(this.proxy.$onDidChangeWindowActive, this.proxy, this.disposables);
        this.registerNativeHandle();
    }
    dispose() {
        this.disposables.dispose();
    }
    registerNativeHandle() {
        Event.latch(this.hostService.onDidChangeActiveWindow)(async (windowId) => {
            const handle = await this.hostService.getNativeWindowHandle(windowId);
            this.proxy.$onDidChangeActiveNativeWindowHandle(handle ? encodeBase64(handle) : undefined);
        }, this, this.disposables);
    }
    $getInitialState() {
        return Promise.resolve({
            isFocused: this.hostService.hasFocus,
            isActive: this.userActivityService.isActive,
        });
    }
    async $openUri(uriComponents, uriString, options) {
        const uri = URI.from(uriComponents);
        let target;
        if (uriString && URI.parse(uriString).toString() === uri.toString()) {
            // called with string and no transformation happened -> keep string
            target = uriString;
        }
        else {
            // called with URI or transformed -> use uri
            target = uri;
        }
        return this.openerService.open(target, {
            openExternal: true,
            allowTunneling: options.allowTunneling,
            allowContributedOpeners: options.allowContributedOpeners,
        });
    }
    async $asExternalUri(uriComponents, options) {
        const result = await this.openerService.resolveExternalUri(URI.revive(uriComponents), options);
        return result.resolved;
    }
};
MainThreadWindow = __decorate([
    extHostNamedCustomer(MainContext.MainThreadWindow),
    __param(1, IHostService),
    __param(2, IOpenerService),
    __param(3, IUserActivityService)
], MainThreadWindow);
export { MainThreadWindow };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFdpbmRvdy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkV2luZG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQXVDLFdBQVcsRUFBeUIsTUFBTSwrQkFBK0IsQ0FBQztBQUN4SSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbkUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDakcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBR3ZELElBQU0sZ0JBQWdCLEdBQXRCLE1BQU0sZ0JBQWdCO0lBSzVCLFlBQ0MsY0FBK0IsRUFDakIsV0FBMEMsRUFDeEMsYUFBOEMsRUFDeEMsbUJBQTBEO1FBRmpELGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ3ZCLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUN2Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBTmhFLGdCQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQVFwRCxJQUFJLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBRW5FLEtB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