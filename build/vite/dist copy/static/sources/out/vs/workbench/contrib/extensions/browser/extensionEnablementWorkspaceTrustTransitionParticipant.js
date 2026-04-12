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
import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
let ExtensionEnablementWorkspaceTrustTransitionParticipant = class ExtensionEnablementWorkspaceTrustTransitionParticipant extends Disposable {
    constructor(extensionService, hostService, environmentService, extensionEnablementService, workspaceTrustEnablementService, workspaceTrustManagementService) {
        super();
        if (workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
            // The extension enablement participant will be registered only after the
            // workspace trust state has been initialized. There is no need to execute
            // the participant as part of the initialization process, as the workspace
            // trust state is initialized before starting the extension host.
            workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
                const workspaceTrustTransitionParticipant = new class {
                    async participate(trusted) {
                        if (trusted) {
                            // Untrusted -> Trusted
                            await extensionEnablementService.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
                        }
                        else {
                            // Trusted -> Untrusted
                            if (environmentService.remoteAuthority) {
                                hostService.reload();
                            }
                            else {
                                const stopped = await extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Changing workspace trust"));
                                await extensionEnablementService.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
                                if (stopped) {
                                    extensionService.startExtensionHosts();
                                }
                            }
                        }
                    }
                };
                // Execute BEFORE the workspace trust transition completes
                this._register(workspaceTrustManagementService.addWorkspaceTrustTransitionParticipant(workspaceTrustTransitionParticipant));
            });
        }
    }
};
ExtensionEnablementWorkspaceTrustTransitionParticipant = __decorate([
    __param(0, IExtensionService),
    __param(1, IHostService),
    __param(2, IWorkbenchEnvironmentService),
    __param(3, IWorkbenchExtensionEnablementService),
    __param(4, IWorkspaceTrustEnablementService),
    __param(5, IWorkspaceTrustManagementService)
], ExtensionEnablementWorkspaceTrustTransitionParticipant);
export { ExtensionEnablementWorkspaceTrustTransitionParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRW5hYmxlbWVudFdvcmtzcGFjZVRydXN0VHJhbnNpdGlvblBhcnRpY2lwYW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbkVuYWJsZW1lbnRXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxnQ0FBZ0MsRUFBd0MsTUFBTSx5REFBeUQsQ0FBQztBQUVuTCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUMzSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFL0QsSUFBTSxzREFBc0QsR0FBNUQsTUFBTSxzREFBdUQsU0FBUSxVQUFVO0lBQ3JGLFlBQ29CLGdCQUFtQyxFQUN4QyxXQUF5QixFQUNULGtCQUFnRCxFQUN4QywwQkFBZ0UsRUFDcEUsK0JBQWlFLEVBQ2pFLCtCQUFpRTtRQUVuRyxLQUFLLEVBQUUsQ0FBQztRQUVSLElBQUksK0JBQStCLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQy9ELHlFQUF5RTtZQUN6RSwwRUFBMEU7WUFDMUUsMEVBQTBFO1lBQzFFLGlFQUFpRTtZQUNqRSwrQkFBK0IsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNuRSxNQUFNLG1DQUFtQyxHQUFHLElBQUk7b0JBQy9DLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBZ0I7d0JBQ2pDLElBQUksT0FBTyxFQUFFLENBQUM7NEJBQ2IsdUJBQXVCOzRCQUN2QixNQUFNLDBCQUEwQixDQUFDLG9EQUFvRCxFQUFFLENBQUM7d0JBQ3pGLENBQUM7NkJBQU0sQ0FBQzs0QkFDUCx1QkFBdUI7NEJBQ3ZCLElBQUksa0JBQWtCLENBQUMsZUFBZSxFQUFFLENBQUM7Z0NBQ3hDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQzs0QkFDdEIsQ0FBQztpQ0FBTSxDQUFDO2dDQUNQLE1BQU0sT0FBTyxHQUFHLE1BQU0sZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLDBCQUEwQixDQUFDLENBQUMsQ0FBQztnQ0FDL0gsTUFBTSwwQkFBMEIsQ0FBQyxvREFBb0QsRUFBRSxDQUFDO2dDQUN4RixJQUFJLE9BQU8sRUFBRSxDQUFDO29DQUNiLGdCQUFnQixDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0NBQ3hDLENBQUM7NEJBQ0YsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7aUJBQ0QsQ0FBQztnQkFFRiwwREFBMEQ7Z0JBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsK0JBQStCLENBQUMsc0NBQXNDLENBQUMsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO1lBQzdILENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBMUNZLHNEQUFzRDtJQUVoRSxXQUFBLGlCQUFpQixDQUFBO0lBQ2pCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSw0QkFBNEIsQ0FBQTtJQUM1QixXQUFBLG9DQUFvQyxDQUFBO0lBQ3BDLFdBQUEsZ0NBQWdDLENBQUE7SUFDaEMsV0FBQSxnQ0FBZ0MsQ0FBQTtHQVB0QixzREFBc0QsQ0EwQ2xFIn0=