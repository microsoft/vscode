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
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { extHostCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { raceCancellationError } from '../../../base/common/async.js';
import { IEditSessionIdentityService } from '../../../platform/workspace/common/editSessions.js';
import { ExtHostContext } from '../common/extHost.protocol.js';
class ExtHostEditSessionIdentityCreateParticipant {
    constructor(extHostContext) {
        this.timeout = 20000;
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostWorkspace);
    }
    async participate(workspaceFolder, token) {
        const p = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error(localize('timeout.onWillCreateEditSessionIdentity', "Aborted onWillCreateEditSessionIdentity-event after 10000ms"))), this.timeout);
            this._proxy.$onWillCreateEditSessionIdentity(workspaceFolder.uri, token, this.timeout).then(resolve, reject);
        });
        return raceCancellationError(p, token);
    }
}
let EditSessionIdentityCreateParticipant = class EditSessionIdentityCreateParticipant {
    constructor(extHostContext, instantiationService, _editSessionIdentityService) {
        this._editSessionIdentityService = _editSessionIdentityService;
        this._saveParticipantDisposable = this._editSessionIdentityService.addEditSessionIdentityCreateParticipant(instantiationService.createInstance(ExtHostEditSessionIdentityCreateParticipant, extHostContext));
    }
    dispose() {
        this._saveParticipantDisposable.dispose();
    }
};
EditSessionIdentityCreateParticipant = __decorate([
    extHostCustomer,
    __param(1, IInstantiationService),
    __param(2, IEditSessionIdentityService)
], EditSessionIdentityCreateParticipant);
export { EditSessionIdentityCreateParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEVkaXRTZXNzaW9uSWRlbnRpdHlQYXJ0aWNpcGFudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRWRpdFNlc3Npb25JZGVudGl0eVBhcnRpY2lwYW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBRXhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RFLE9BQU8sRUFBeUMsMkJBQTJCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN4SSxPQUFPLEVBQUUsY0FBYyxFQUF5QixNQUFNLCtCQUErQixDQUFDO0FBR3RGLE1BQU0sMkNBQTJDO0lBS2hELFlBQVksY0FBK0I7UUFGMUIsWUFBTyxHQUFHLEtBQUssQ0FBQztRQUdoQyxJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsZUFBZ0MsRUFBRSxLQUF3QjtRQUMzRSxNQUFNLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUUvQyxVQUFVLENBQ1QsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSw2REFBNkQsQ0FBQyxDQUFDLENBQUMsRUFDM0ksSUFBSSxDQUFDLE9BQU8sQ0FDWixDQUFDO1lBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxnQ0FBZ0MsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUM5RyxDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8scUJBQXFCLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hDLENBQUM7Q0FDRDtBQUdNLElBQU0sb0NBQW9DLEdBQTFDLE1BQU0sb0NBQW9DO0lBSWhELFlBQ0MsY0FBK0IsRUFDUixvQkFBMkMsRUFDcEIsMkJBQXdEO1FBQXhELGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBNkI7UUFFdEcsSUFBSSxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyx1Q0FBdUMsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkNBQTJDLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUM5TSxDQUFDO0lBRUQsT0FBTztRQUNOLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMzQyxDQUFDO0NBQ0QsQ0FBQTtBQWZZLG9DQUFvQztJQURoRCxlQUFlO0lBT2IsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLDJCQUEyQixDQUFBO0dBUGpCLG9DQUFvQyxDQWVoRCJ9