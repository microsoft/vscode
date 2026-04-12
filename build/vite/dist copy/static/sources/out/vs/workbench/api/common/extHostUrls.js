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
var ExtHostUrls_1;
import { MainContext } from './extHost.protocol.js';
import { URI } from '../../../base/common/uri.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { ExtensionIdentifierSet } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
let ExtHostUrls = class ExtHostUrls {
    static { ExtHostUrls_1 = this; }
    static { this.HandlePool = 0; }
    constructor(extHostRpc) {
        this.handles = new ExtensionIdentifierSet();
        this.handlers = new Map();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadUrls);
    }
    registerUriHandler(extension, handler) {
        const extensionId = extension.identifier;
        if (this.handles.has(extensionId)) {
            throw new Error(`Protocol handler already registered for extension ${extensionId}`);
        }
        const handle = ExtHostUrls_1.HandlePool++;
        this.handles.add(extensionId);
        this.handlers.set(handle, handler);
        this._proxy.$registerUriHandler(handle, extensionId, extension.displayName || extension.name);
        return toDisposable(() => {
            this.handles.delete(extensionId);
            this.handlers.delete(handle);
            this._proxy.$unregisterUriHandler(handle);
        });
    }
    $handleExternalUri(handle, uri) {
        const handler = this.handlers.get(handle);
        if (!handler) {
            return Promise.resolve(undefined);
        }
        try {
            handler.handleUri(URI.revive(uri));
        }
        catch (err) {
            onUnexpectedError(err);
        }
        return Promise.resolve(undefined);
    }
    async createAppUri(uri) {
        return URI.revive(await this._proxy.$createAppUri(uri));
    }
};
ExtHostUrls = ExtHostUrls_1 = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostUrls);
export { ExtHostUrls };
export const IExtHostUrlsService = createDecorator('IExtHostUrlsService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFVybHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0VXJscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFdBQVcsRUFBeUMsTUFBTSx1QkFBdUIsQ0FBQztBQUMzRixPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsc0JBQXNCLEVBQXlCLE1BQU0sbURBQW1ELENBQUM7QUFDbEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRXJELElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVc7O2FBSVIsZUFBVSxHQUFHLENBQUMsQUFBSixDQUFLO0lBTTlCLFlBQ3FCLFVBQThCO1FBSjNDLFlBQU8sR0FBRyxJQUFJLHNCQUFzQixFQUFFLENBQUM7UUFDdkMsYUFBUSxHQUFHLElBQUksR0FBRyxFQUE2QixDQUFDO1FBS3ZELElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVELGtCQUFrQixDQUFDLFNBQWdDLEVBQUUsT0FBMEI7UUFDOUUsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQztRQUN6QyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDbkMsTUFBTSxJQUFJLEtBQUssQ0FBQyxxREFBcUQsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNyRixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsYUFBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzlCLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFOUYsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMscUJBQXFCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDM0MsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsa0JBQWtCLENBQUMsTUFBYyxFQUFFLEdBQWtCO1FBQ3BELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsSUFBSSxDQUFDO1lBQ0osT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEMsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN4QixDQUFDO1FBRUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFDLEdBQVE7UUFDMUIsT0FBTyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN6RCxDQUFDOztBQW5EVyxXQUFXO0lBV3JCLFdBQUEsa0JBQWtCLENBQUE7R0FYUixXQUFXLENBb0R2Qjs7QUFHRCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLHFCQUFxQixDQUFDLENBQUMifQ==