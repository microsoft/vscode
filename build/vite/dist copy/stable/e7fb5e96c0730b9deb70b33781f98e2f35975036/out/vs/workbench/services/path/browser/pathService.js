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
import { IPathService, AbstractPathService } from '../common/pathService.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { dirname } from '../../../../base/common/resources.js';
let BrowserPathService = class BrowserPathService extends AbstractPathService {
    constructor(remoteAgentService, environmentService, contextService) {
        super(guessLocalUserHome(environmentService, contextService), remoteAgentService, environmentService, contextService);
    }
};
BrowserPathService = __decorate([
    __param(0, IRemoteAgentService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IWorkspaceContextService)
], BrowserPathService);
export { BrowserPathService };
function guessLocalUserHome(environmentService, contextService) {
    // In web we do not really have the concept of a "local" user home
    // but we still require it in many places as a fallback. As such,
    // we have to come up with a synthetic location derived from the
    // environment.
    const workspace = contextService.getWorkspace();
    const firstFolder = workspace.folders.at(0);
    if (firstFolder) {
        return firstFolder.uri;
    }
    if (workspace.configuration) {
        return dirname(workspace.configuration);
    }
    // This is not ideal because with a user home location of `/`, all paths
    // will potentially appear with `~/...`, but at this point we really do
    // not have any other good alternative.
    return URI.from({
        scheme: AbstractPathService.findDefaultUriScheme(environmentService, contextService),
        authority: environmentService.remoteAuthority,
        path: '/'
    });
}
registerSingleton(IPathService, BrowserPathService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGF0aFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvcGF0aC9icm93c2VyL3BhdGhTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNoRixPQUFPLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV4RCxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLG1CQUFtQjtJQUUxRCxZQUNzQixrQkFBdUMsRUFDOUIsa0JBQWdELEVBQ3BELGNBQXdDO1FBRWxFLEtBQUssQ0FDSixrQkFBa0IsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLENBQUMsRUFDdEQsa0JBQWtCLEVBQ2xCLGtCQUFrQixFQUNsQixjQUFjLENBQ2QsQ0FBQztJQUNILENBQUM7Q0FDRCxDQUFBO0FBZFksa0JBQWtCO0lBRzVCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSw0QkFBNEIsQ0FBQTtJQUM1QixXQUFBLHdCQUF3QixDQUFBO0dBTGQsa0JBQWtCLENBYzlCOztBQUVELFNBQVMsa0JBQWtCLENBQUMsa0JBQWdELEVBQUUsY0FBd0M7SUFFckgsa0VBQWtFO0lBQ2xFLGlFQUFpRTtJQUNqRSxnRUFBZ0U7SUFDaEUsZUFBZTtJQUVmLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxZQUFZLEVBQUUsQ0FBQztJQUVoRCxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM1QyxJQUFJLFdBQVcsRUFBRSxDQUFDO1FBQ2pCLE9BQU8sV0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN4QixDQUFDO0lBRUQsSUFBSSxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDN0IsT0FBTyxPQUFPLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ3pDLENBQUM7SUFFRCx3RUFBd0U7SUFDeEUsdUVBQXVFO0lBQ3ZFLHVDQUF1QztJQUV2QyxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDZixNQUFNLEVBQUUsbUJBQW1CLENBQUMsb0JBQW9CLENBQUMsa0JBQWtCLEVBQUUsY0FBYyxDQUFDO1FBQ3BGLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxlQUFlO1FBQzdDLElBQUksRUFBRSxHQUFHO0tBQ1QsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELGlCQUFpQixDQUFDLFlBQVksRUFBRSxrQkFBa0Isb0NBQTRCLENBQUMifQ==