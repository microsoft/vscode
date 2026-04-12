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
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IAiRelatedInformationService } from '../../services/aiRelatedInformation/common/aiRelatedInformation.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadAiRelatedInformation = class MainThreadAiRelatedInformation extends Disposable {
    constructor(context, _aiRelatedInformationService) {
        super();
        this._aiRelatedInformationService = _aiRelatedInformationService;
        this._registrations = this._register(new DisposableMap());
        this._proxy = context.getProxy(ExtHostContext.ExtHostAiRelatedInformation);
    }
    $getAiRelatedInformation(query, types) {
        // TODO: use a real cancellation token
        return this._aiRelatedInformationService.getRelatedInformation(query, types, CancellationToken.None);
    }
    $registerAiRelatedInformationProvider(handle, type) {
        const provider = {
            provideAiRelatedInformation: (query, token) => {
                return this._proxy.$provideAiRelatedInformation(handle, query, token);
            },
        };
        this._registrations.set(handle, this._aiRelatedInformationService.registerAiRelatedInformationProvider(type, provider));
    }
    $unregisterAiRelatedInformationProvider(handle) {
        this._registrations.deleteAndDispose(handle);
    }
};
MainThreadAiRelatedInformation = __decorate([
    extHostNamedCustomer(MainContext.MainThreadAiRelatedInformation),
    __param(1, IAiRelatedInformationService)
], MainThreadAiRelatedInformation);
export { MainThreadAiRelatedInformation };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEFpUmVsYXRlZEluZm9ybWF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRBaVJlbGF0ZWRJbmZvcm1hdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBb0MsY0FBYyxFQUFFLFdBQVcsRUFBdUMsTUFBTSwrQkFBK0IsQ0FBQztBQUVuSixPQUFPLEVBQWlDLDRCQUE0QixFQUE0QixNQUFNLG9FQUFvRSxDQUFDO0FBQzNLLE9BQU8sRUFBbUIsb0JBQW9CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUd0RyxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7SUFJN0QsWUFDQyxPQUF3QixFQUNNLDRCQUEyRTtRQUV6RyxLQUFLLEVBQUUsQ0FBQztRQUZ1QyxpQ0FBNEIsR0FBNUIsNEJBQTRCLENBQThCO1FBSnpGLG1CQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGFBQWEsRUFBVSxDQUFDLENBQUM7UUFPN0UsSUFBSSxDQUFDLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxLQUFhLEVBQUUsS0FBK0I7UUFDdEUsc0NBQXNDO1FBQ3RDLE9BQU8sSUFBSSxDQUFDLDRCQUE0QixDQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEcsQ0FBQztJQUVELHFDQUFxQyxDQUFDLE1BQWMsRUFBRSxJQUE0QjtRQUNqRixNQUFNLFFBQVEsR0FBa0M7WUFDL0MsMkJBQTJCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7Z0JBQzdDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3ZFLENBQUM7U0FDRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxvQ0FBb0MsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUN6SCxDQUFDO0lBRUQsdUNBQXVDLENBQUMsTUFBYztRQUNyRCxJQUFJLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlDLENBQUM7Q0FDRCxDQUFBO0FBN0JZLDhCQUE4QjtJQUQxQyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUM7SUFPOUQsV0FBQSw0QkFBNEIsQ0FBQTtHQU5sQiw4QkFBOEIsQ0E2QjFDIn0=