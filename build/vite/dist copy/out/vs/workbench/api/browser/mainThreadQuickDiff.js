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
import { DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IQuickDiffService } from '../../contrib/scm/common/quickDiff.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadQuickDiff = class MainThreadQuickDiff {
    constructor(extHostContext, quickDiffService) {
        this.quickDiffService = quickDiffService;
        this.providerDisposables = new DisposableMap();
        this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickDiff);
    }
    async $registerQuickDiffProvider(handle, selector, id, label, rootUri) {
        const provider = {
            id,
            label,
            rootUri: URI.revive(rootUri),
            selector,
            kind: 'contributed',
            getOriginalResource: async (uri) => {
                return URI.revive(await this.proxy.$provideOriginalResource(handle, uri, CancellationToken.None));
            }
        };
        const disposable = this.quickDiffService.addQuickDiffProvider(provider);
        this.providerDisposables.set(handle, disposable);
    }
    async $unregisterQuickDiffProvider(handle) {
        if (this.providerDisposables.has(handle)) {
            this.providerDisposables.deleteAndDispose(handle);
        }
    }
    dispose() {
        this.providerDisposables.dispose();
    }
};
MainThreadQuickDiff = __decorate([
    extHostNamedCustomer(MainContext.MainThreadQuickDiff),
    __param(1, IQuickDiffService)
], MainThreadQuickDiff);
export { MainThreadQuickDiff };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFF1aWNrRGlmZi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkUXVpY2tEaWZmLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxhQUFhLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQTZDLFdBQVcsRUFBNEIsTUFBTSwrQkFBK0IsQ0FBQztBQUNqSixPQUFPLEVBQUUsaUJBQWlCLEVBQXFCLE1BQU0sdUNBQXVDLENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBR3RHLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW1CO0lBSy9CLFlBQ0MsY0FBK0IsRUFDWixnQkFBb0Q7UUFBbkMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUpoRSx3QkFBbUIsR0FBRyxJQUFJLGFBQWEsRUFBdUIsQ0FBQztRQU10RSxJQUFJLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxNQUFjLEVBQUUsUUFBOEIsRUFBRSxFQUFVLEVBQUUsS0FBYSxFQUFFLE9BQWtDO1FBQzdJLE1BQU0sUUFBUSxHQUFzQjtZQUNuQyxFQUFFO1lBQ0YsS0FBSztZQUNMLE9BQU8sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQztZQUM1QixRQUFRO1lBQ1IsSUFBSSxFQUFFLGFBQWE7WUFDbkIsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLEdBQVEsRUFBRSxFQUFFO2dCQUN2QyxPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNuRyxDQUFDO1NBQ0QsQ0FBQztRQUNGLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN4RSxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRUQsS0FBSyxDQUFDLDRCQUE0QixDQUFDLE1BQWM7UUFDaEQsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDMUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0NBQ0QsQ0FBQTtBQXBDWSxtQkFBbUI7SUFEL0Isb0JBQW9CLENBQUMsV0FBVyxDQUFDLG1CQUFtQixDQUFDO0lBUW5ELFdBQUEsaUJBQWlCLENBQUE7R0FQUCxtQkFBbUIsQ0FvQy9CIn0=