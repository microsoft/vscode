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
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IAiEmbeddingVectorService } from '../../services/aiEmbeddingVector/common/aiEmbeddingVectorService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadAiEmbeddingVector = class MainThreadAiEmbeddingVector extends Disposable {
    constructor(context, _AiEmbeddingVectorService) {
        super();
        this._AiEmbeddingVectorService = _AiEmbeddingVectorService;
        this._registrations = this._register(new DisposableMap());
        this._proxy = context.getProxy(ExtHostContext.ExtHostAiEmbeddingVector);
    }
    $registerAiEmbeddingVectorProvider(model, handle) {
        const provider = {
            provideAiEmbeddingVector: (strings, token) => {
                return this._proxy.$provideAiEmbeddingVector(handle, strings, token);
            },
        };
        this._registrations.set(handle, this._AiEmbeddingVectorService.registerAiEmbeddingVectorProvider(model, provider));
    }
    $unregisterAiEmbeddingVectorProvider(handle) {
        this._registrations.deleteAndDispose(handle);
    }
};
MainThreadAiEmbeddingVector = __decorate([
    extHostNamedCustomer(MainContext.MainThreadAiEmbeddingVector),
    __param(1, IAiEmbeddingVectorService)
], MainThreadAiEmbeddingVector);
export { MainThreadAiEmbeddingVector };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEFpRW1iZWRkaW5nVmVjdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRBaUVtYmVkZGluZ1ZlY3Rvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBaUMsY0FBYyxFQUFFLFdBQVcsRUFBb0MsTUFBTSwrQkFBK0IsQ0FBQztBQUM3SSxPQUFPLEVBQThCLHlCQUF5QixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUksT0FBTyxFQUFtQixvQkFBb0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3RHLElBQU0sMkJBQTJCLEdBQWpDLE1BQU0sMkJBQTRCLFNBQVEsVUFBVTtJQUkxRCxZQUNDLE9BQXdCLEVBQ0cseUJBQXFFO1FBRWhHLEtBQUssRUFBRSxDQUFDO1FBRm9DLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBMkI7UUFKaEYsbUJBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUFVLENBQUMsQ0FBQztRQU83RSxJQUFJLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELGtDQUFrQyxDQUFDLEtBQWEsRUFBRSxNQUFjO1FBQy9ELE1BQU0sUUFBUSxHQUErQjtZQUM1Qyx3QkFBd0IsRUFBRSxDQUFDLE9BQWlCLEVBQUUsS0FBd0IsRUFBRSxFQUFFO2dCQUN6RSxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMseUJBQXlCLENBQzNDLE1BQU0sRUFDTixPQUFPLEVBQ1AsS0FBSyxDQUNMLENBQUM7WUFDSCxDQUFDO1NBQ0QsQ0FBQztRQUNGLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMseUJBQXlCLENBQUMsaUNBQWlDLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDcEgsQ0FBQztJQUVELG9DQUFvQyxDQUFDLE1BQWM7UUFDbEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM5QyxDQUFDO0NBQ0QsQ0FBQTtBQTVCWSwyQkFBMkI7SUFEdkMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLDJCQUEyQixDQUFDO0lBTzNELFdBQUEseUJBQXlCLENBQUE7R0FOZiwyQkFBMkIsQ0E0QnZDIn0=