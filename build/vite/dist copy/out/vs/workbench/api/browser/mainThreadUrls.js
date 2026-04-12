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
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IURLService } from '../../../platform/url/common/url.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IExtensionUrlHandler } from '../../services/extensions/browser/extensionUrlHandler.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ITrustedDomainService } from '../../contrib/url/browser/trustedDomainService.js';
class ExtensionUrlHandler {
    constructor(proxy, handle, extensionId, extensionDisplayName) {
        this.proxy = proxy;
        this.handle = handle;
        this.extensionId = extensionId;
        this.extensionDisplayName = extensionDisplayName;
    }
    async handleURL(uri, options) {
        if (!ExtensionIdentifier.equals(this.extensionId, uri.authority)) {
            return false;
        }
        await this.proxy.$handleExternalUri(this.handle, uri);
        return true;
    }
}
let MainThreadUrls = class MainThreadUrls extends Disposable {
    constructor(context, trustedDomainService, urlService, extensionUrlHandler) {
        super();
        this.urlService = urlService;
        this.extensionUrlHandler = extensionUrlHandler;
        this.handlers = new Map();
        this.proxy = context.getProxy(ExtHostContext.ExtHostUrls);
    }
    async $registerUriHandler(handle, extensionId, extensionDisplayName) {
        const handler = new ExtensionUrlHandler(this.proxy, handle, extensionId, extensionDisplayName);
        const disposable = this.urlService.registerHandler(handler);
        this.handlers.set(handle, { extensionId, disposable });
        this.extensionUrlHandler.registerExtensionHandler(extensionId, handler);
        return undefined;
    }
    async $unregisterUriHandler(handle) {
        const tuple = this.handlers.get(handle);
        if (!tuple) {
            return undefined;
        }
        const { extensionId, disposable } = tuple;
        this.extensionUrlHandler.unregisterExtensionHandler(extensionId);
        this.handlers.delete(handle);
        disposable.dispose();
        return undefined;
    }
    async $createAppUri(uri) {
        return this.urlService.create(uri);
    }
    dispose() {
        super.dispose();
        this.handlers.forEach(({ disposable }) => disposable.dispose());
        this.handlers.clear();
    }
};
MainThreadUrls = __decorate([
    extHostNamedCustomer(MainContext.MainThreadUrls),
    __param(1, ITrustedDomainService),
    __param(2, IURLService),
    __param(3, IExtensionUrlHandler)
], MainThreadUrls);
export { MainThreadUrls };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFVybHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFVybHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxXQUFXLEVBQXlDLE1BQU0sK0JBQStCLENBQUM7QUFDbkgsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxXQUFXLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFFbkYsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBbUMsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNqSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUxRixNQUFNLG1CQUFtQjtJQUV4QixZQUNrQixLQUF1QixFQUN2QixNQUFjLEVBQ3RCLFdBQWdDLEVBQ2hDLG9CQUE0QjtRQUhwQixVQUFLLEdBQUwsS0FBSyxDQUFrQjtRQUN2QixXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQ3RCLGdCQUFXLEdBQVgsV0FBVyxDQUFxQjtRQUNoQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQVE7SUFDbEMsQ0FBQztJQUVMLEtBQUssQ0FBQyxTQUFTLENBQUMsR0FBUSxFQUFFLE9BQXlCO1FBQ2xELElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNsRSxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxNQUFNLElBQUksQ0FBQyxLQUFL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