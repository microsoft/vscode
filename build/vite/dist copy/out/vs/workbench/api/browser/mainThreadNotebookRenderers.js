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
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { INotebookRendererMessagingService } from '../../contrib/notebook/common/notebookRendererMessagingService.js';
let MainThreadNotebookRenderers = class MainThreadNotebookRenderers extends Disposable {
    constructor(extHostContext, messaging) {
        super();
        this.messaging = messaging;
        this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookRenderers);
        this._register(messaging.onShouldPostMessage(e => {
            this.proxy.$postRendererMessage(e.editorId, e.rendererId, e.message);
        }));
    }
    $postMessage(editorId, rendererId, message) {
        return this.messaging.receiveMessage(editorId, rendererId, message);
    }
};
MainThreadNotebookRenderers = __decorate([
    extHostNamedCustomer(MainContext.MainThreadNotebookRenderers),
    __param(1, INotebookRendererMessagingService)
], MainThreadNotebookRenderers);
export { MainThreadNotebookRenderers };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE5vdGVib29rUmVuZGVyZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWROb3RlYm9va1JlbmRlcmVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBaUMsV0FBVyxFQUFvQyxNQUFNLCtCQUErQixDQUFDO0FBQzdJLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUcvRyxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFHMUQsWUFDQyxjQUErQixFQUNxQixTQUE0QztRQUVoRyxLQUFLLEVBQUUsQ0FBQztRQUY0QyxjQUFTLEdBQVQsU0FBUyxDQUFtQztRQUdoRyxJQUFJLENBQUMsS0FBSyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDOUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsWUFBWSxDQUFDLFFBQTRCLEVBQUUsVUFBa0IsRUFBRSxPQUFnQjtRQUM5RSxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDckUsQ0FBQztDQUNELENBQUE7QUFqQlksMkJBQTJCO0lBRHZDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQztJQU0zRCxXQUFBLGlDQUFpQyxDQUFBO0dBTHZCLDJCQUEyQixDQWlCdkMifQ==