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
import { Disposable } from '../../../base/common/lifecycle.js';
import { IMeteredConnectionService } from '../../../platform/meteredConnection/common/meteredConnection.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
let MainThreadMeteredConnection = class MainThreadMeteredConnection extends Disposable {
    constructor(extHostContext, meteredConnectionService) {
        super();
        this.meteredConnectionService = meteredConnectionService;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostMeteredConnection);
        // Send initial value
        this._proxy.$initializeIsConnectionMetered(this.meteredConnectionService.isConnectionMetered);
        // Listen for changes and forward to extension host
        this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
            this._proxy.$onDidChangeIsConnectionMetered(isMetered);
        }));
    }
};
MainThreadMeteredConnection = __decorate([
    extHostNamedCustomer(MainContext.MainThreadMeteredConnection),
    __param(1, IMeteredConnectionService)
], MainThreadMeteredConnection);
export { MainThreadMeteredConnection };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE1ldGVyZWRDb25uZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRNZXRlcmVkQ29ubmVjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDNUcsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQWlDLFdBQVcsRUFBb0MsTUFBTSwrQkFBK0IsQ0FBQztBQUd0SSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFJMUQsWUFDQyxjQUErQixFQUNhLHdCQUFtRDtRQUUvRixLQUFLLEVBQUUsQ0FBQztRQUZvQyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTJCO1FBSS9GLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUUvRSxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUU5RixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsOEJBQThCLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDdkYsSUFBSSxDQUFDLE1BQU0sQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNELENBQUE7QUFwQlksMkJBQTJCO0lBRHZDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQztJQU8zRCxXQUFBLHlCQUF5QixDQUFBO0dBTmYsMkJBQTJCLENBb0J2QyJ9