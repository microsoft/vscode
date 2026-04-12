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
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IAiSettingsSearchService } from '../../services/aiSettingsSearch/common/aiSettingsSearch.js';
import { ExtHostContext, MainContext, } from '../common/extHost.protocol.js';
let MainThreadAiSettingsSearch = class MainThreadAiSettingsSearch extends Disposable {
    constructor(context, _settingsSearchService) {
        super();
        this._settingsSearchService = _settingsSearchService;
        this._registrations = this._register(new DisposableMap());
        this._proxy = context.getProxy(ExtHostContext.ExtHostAiSettingsSearch);
    }
    $registerAiSettingsSearchProvider(handle) {
        const provider = {
            searchSettings: (query, option, token) => {
                return this._proxy.$startSearch(handle, query, option, token);
            }
        };
        this._registrations.set(handle, this._settingsSearchService.registerSettingsSearchProvider(provider));
    }
    $unregisterAiSettingsSearchProvider(handle) {
        this._registrations.deleteAndDispose(handle);
    }
    $handleSearchResult(handle, result) {
        if (!this._registrations.has(handle)) {
            throw new Error(`No AI settings search provider found`);
        }
        this._settingsSearchService.handleSearchResult(result);
    }
};
MainThreadAiSettingsSearch = __decorate([
    extHostNamedCustomer(MainContext.MainThreadAiSettingsSearch),
    __param(1, IAiSettingsSearchService)
], MainThreadAiSettingsSearch);
export { MainThreadAiSettingsSearch };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEFpU2V0dGluZ3NTZWFyY2guanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEFpU2V0dGluZ3NTZWFyY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsb0JBQW9CLEVBQW1CLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFxRCx3QkFBd0IsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ3pKLE9BQU8sRUFBRSxjQUFjLEVBQWdDLFdBQVcsR0FBb0MsTUFBTSwrQkFBK0IsQ0FBQztBQUdySSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLFVBQVU7SUFJekQsWUFDQyxPQUF3QixFQUNFLHNCQUFpRTtRQUUzRixLQUFLLEVBQUUsQ0FBQztRQUZtQywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQTBCO1FBSjNFLG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBVSxDQUFDLENBQUM7UUFPN0UsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFRCxpQ0FBaUMsQ0FBQyxNQUFjO1FBQy9DLE1BQU0sUUFBUSxHQUE4QjtZQUMzQyxjQUFjLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUN4QyxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQy9ELENBQUM7U0FDRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyw4QkFBOEIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3ZHLENBQUM7SUFFRCxtQ0FBbUMsQ0FBQyxNQUFjO1FBQ2pELElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELG1CQUFtQixDQUFDLE1BQWMsRUFBRSxNQUE4QjtRQUNqRSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDekQsQ0FBQztRQUVELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN4RCxDQUFDO0NBQ0QsQ0FBQTtBQWhDWSwwQkFBMEI7SUFEdEMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLDBCQUEwQixDQUFDO0lBTzFELFdBQUEsd0JBQXdCLENBQUE7R0FOZCwwQkFBMEIsQ0FnQ3RDIn0=