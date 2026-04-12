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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { dispose } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IShareService } from '../../contrib/share/common/share.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadShare = class MainThreadShare {
    constructor(extHostContext, shareService) {
        this.shareService = shareService;
        this.providers = new Map();
        this.providerDisposables = new Map();
        this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostShare);
    }
    $registerShareProvider(handle, selector, id, label, priority) {
        const provider = {
            id,
            label,
            selector,
            priority,
            provideShare: async (item) => {
                const result = await this.proxy.$provideShare(handle, item, CancellationToken.None);
                return typeof result === 'string' ? result : URI.revive(result);
            }
        };
        this.providers.set(handle, provider);
        const disposable = this.shareService.registerShareProvider(provider);
        this.providerDisposables.set(handle, disposable);
    }
    $unregisterShareProvider(handle) {
        this.providers.delete(handle);
        this.providerDisposables.delete(handle);
    }
    dispose() {
        this.providers.clear();
        dispose(this.providerDisposables.values());
        this.providerDisposables.clear();
    }
};
MainThreadShare = __decorate([
    extHostNamedCustomer(MainContext.MainThreadShare),
    __param(1, IShareService)
], MainThreadShare);
export { MainThreadShare };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFNoYXJlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRTaGFyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQWUsT0FBTyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxjQUFjLEVBQXlDLFdBQVcsRUFBd0IsTUFBTSwrQkFBK0IsQ0FBQztBQUN6SSxPQUFPLEVBQWtCLGFBQWEsRUFBa0IsTUFBTSxxQ0FBcUMsQ0FBQztBQUNwRyxPQUFPLEVBQW1CLG9CQUFvQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFHdEcsSUFBTSxlQUFlLEdBQXJCLE1BQU0sZUFBZTtJQU0zQixZQUNDLGNBQStCLEVBQ2hCLFlBQTRDO1FBQTNCLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBTHBELGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBMEIsQ0FBQztRQUM5Qyx3QkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztRQU01RCxJQUFJLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxNQUFjLEVBQUUsUUFBOEIsRUFBRSxFQUFVLEVBQUUsS0FBYSxFQUFFLFFBQWdCO1FBQ2pILE1BQU0sUUFBUSxHQUFtQjtZQUNoQyxFQUFFO1lBQ0YsS0FBSztZQUNMLFFBQVE7WUFDUixRQUFRO1lBQ1IsWUFBWSxFQUFFLEtBQUssRUFBRSxJQUFvQixFQUFFLEVBQUU7Z0JBQzVDLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDcEYsT0FBTyxPQUFPLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqRSxDQUFDO1NBQ0QsQ0FBQztRQUNGLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNyQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxNQUFjO1FBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzlCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDbEMsQ0FBQztDQUNELENBQUE7QUF2Q1ksZUFBZTtJQUQzQixvQkFBb0IsQ0FBQyxXQUFXLENBQUMsZUFBZSxDQUFDO0lBUy9DLFdBQUEsYUFBYSxDQUFBO0dBUkgsZUFBZSxDQXVDM0IifQ==