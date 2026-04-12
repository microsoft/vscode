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
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
import { IPathService, AbstractPathService } from '../common/pathService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
let NativePathService = class NativePathService extends AbstractPathService {
    constructor(remoteAgentService, environmentService, contextService) {
        super(environmentService.userHome, remoteAgentService, environmentService, contextService);
    }
};
NativePathService = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, INativeWorkbenchEnvironmentService),
    __param(2, IWorkspaceContextService)
], NativePathService);
export { NativePathService };
registerSingleton(IPathService, NativePathService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9lbGVjdHJvbi1icm93c2VyL3BhdGhTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RyxPQUFPLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBa0IsU0FBUSxtQkFBbUI7SUFFekQsWUFDc0Isa0JBQXVDLEVBQ3hCLGtCQUFzRCxFQUNoRSxjQUF3QztRQUVsRSxLQUFLLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQzVGLENBQUM7Q0FDRCxDQUFBO0FBVFksaUJBQWlCO0lBRzNCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxrQ0FBa0MsQ0FBQTtJQUNsQyxXQUFBLHdCQUF3QixDQUFBO0dBTGQsaUJBQWlCLENBUzdCOztBQUVELGlCQUFpQixDQUFDLFlBQVksRUFBRSxpQkFBaUIsb0NBQTRCLENBQUMifQ==