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
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
// @ts-expect-error: interface is implemented via proxy
let NativeWorkspacesService = class NativeWorkspacesService {
    constructor(mainProcessService, nativeHostService) {
        return ProxyChannel.toService(mainProcessService.getChannel('workspaces'), { context: nativeHostService.windowId });
    }
};
NativeWorkspacesService = __decorate([
    __param(0, IMainProcessService),
    __param(1, INativeHostService)
], NativeWorkspacesService);
export { NativeWorkspacesService };
registerSingleton(IWorkspacesService, NativeWorkspacesService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvd29ya3NwYWNlcy9lbGVjdHJvbi1icm93c2VyL3dvcmtzcGFjZXNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFbEYsdURBQXVEO0FBQ2hELElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXVCO0lBSW5DLFlBQ3NCLGtCQUF1QyxFQUN4QyxpQkFBcUM7UUFFekQsT0FBTyxZQUFZLENBQUMsU0FBUyxDQUFxQixrQkFBa0IsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUN6SSxDQUFDO0NBQ0QsQ0FBQTtBQVZZLHVCQUF1QjtJQUtqQyxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsa0JBQWtCLENBQUE7R0FOUix1QkFBdUIsQ0FVbkM7O0FBRUQsaUJBQWlCLENBQUMsa0JBQWtCLEVBQUUsdUJBQXVCLG9DQUE0QixDQUFDIn0=