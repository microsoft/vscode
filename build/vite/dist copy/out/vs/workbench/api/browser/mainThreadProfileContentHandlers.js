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
import { revive } from '../../../base/common/marshalling.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IUserDataProfileImportExportService } from '../../services/userDataProfile/common/userDataProfile.js';
let MainThreadProfileContentHandlers = class MainThreadProfileContentHandlers extends Disposable {
    constructor(context, userDataProfileImportExportService) {
        super();
        this.userDataProfileImportExportService = userDataProfileImportExportService;
        this.registeredHandlers = this._register(new DisposableMap());
        this.proxy = context.getProxy(ExtHostContext.ExtHostProfileContentHandlers);
    }
    async $registerProfileContentHandler(id, name, description, extensionId) {
        this.registeredHandlers.set(id, this.userDataProfileImportExportService.registerProfileContentHandler(id, {
            name,
            description,
            extensionId,
            saveProfile: async (name, content, token) => {
                const result = await this.proxy.$saveProfile(id, name, content, token);
                return result ? revive(result) : null;
            },
            readProfile: async (uri, token) => {
                return this.proxy.$readProfile(id, uri, token);
            },
        }));
    }
    async $unregisterProfileContentHandler(id) {
        this.registeredHandlers.deleteAndDispose(id);
    }
};
MainThreadProfileContentHandlers = __decorate([
    extHostNamedCustomer(MainContext.MainThreadProfileContentHandlers),
    __param(1, IUserDataProfileImportExportService)
], MainThreadProfileContentHandlers);
export { MainThreadProfileContentHandlers };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFByb2ZpbGVDb250ZW50SGFuZGxlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFByb2ZpbGVDb250ZW50SGFuZGxlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQWUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMzRixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFN0QsT0FBTyxFQUFFLGNBQWMsRUFBc0MsV0FBVyxFQUF5QyxNQUFNLCtCQUErQixDQUFDO0FBQ3ZKLE9BQU8sRUFBRSxvQkFBb0IsRUFBbUIsTUFBTSxzREFBc0QsQ0FBQztBQUM3RyxPQUFPLEVBQXNCLG1DQUFtQyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFHNUgsSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBaUMsU0FBUSxVQUFVO0lBTS9ELFlBQ0MsT0FBd0IsRUFDYSxrQ0FBd0Y7UUFFN0gsS0FBSyxFQUFFLENBQUM7UUFGOEMsdUNBQWtDLEdBQWxDLGtDQUFrQyxDQUFxQztRQUo3Ryx1QkFBa0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksYUFBYSxFQUF1QixDQUFDLENBQUM7UUFPOUYsSUFBSSxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFRCxLQUFLLENBQUMsOEJBQThCLENBQUMsRUFBVSxFQUFFLElBQVksRUFBRSxXQUErQixFQUFFLFdBQW1CO1FBQ2xILElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyw2QkFBNkIsQ0FBQyxFQUFFLEVBQUU7WUFDekcsSUFBSTtZQUNKLFdBQVc7WUFDWCxXQUFXO1lBQ1gsV0FBVyxFQUFFLEtBQUssRUFBRSxJQUFZLEVBQUUsT0FBZSxFQUFFLEtBQXdCLEVBQUUsRUFBRTtnQkFDOUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFDdkUsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBcUIsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUMzRCxDQUFDO1lBQ0QsV0FBVyxFQUFFLEtBQUssRUFBRSxHQUFRLEVBQUUsS0FBd0IsRUFBRSxFQUFFO2dCQUN6RCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDaEQsQ0FBQztTQUNELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFVO1FBQ2hELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0NBRUQsQ0FBQTtBQWpDWSxnQ0FBZ0M7SUFENUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLGdDQUFnQyxDQUFDO0lBU2hFLFdBQUEsbUNBQW1DLENBQUE7R0FSekIsZ0NBQWdDLENBaUM1QyJ9