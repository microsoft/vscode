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
import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../../workbench/common/views.js';
import { OutputViewPane } from '../../../../workbench/contrib/output/browser/outputView.js';
import { OUTPUT_VIEW_ID } from '../../../../workbench/services/output/common/output.js';
const SESSIONS_LOGS_CONTAINER_ID = 'workbench.sessions.panel.logsContainer';
const logsViewIcon = registerIcon('sessions-logs-view-icon', Codicon.output, localize('sessionsLogsViewIcon', 'View icon of the logs view in the sessions window.'));
let RegisterLogsViewContainerContribution = class RegisterLogsViewContainerContribution {
    static { this.ID = 'sessions.registerLogsViewContainer'; }
    constructor(contextKeyService) {
        const viewContainerRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
        const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
        // Deregister the output view and its container from the original registration
        const outputViewContainer = viewContainerRegistry.get(OUTPUT_VIEW_ID);
        if (outputViewContainer) {
            const view = viewsRegistry.getView(OUTPUT_VIEW_ID);
            if (view) {
                viewsRegistry.deregisterViews([view], outputViewContainer);
            }
            viewContainerRegistry.deregisterViewContainer(outputViewContainer);
        }
        // Register a new logs view container in the Panel for the sessions window
        const logsViewContainer = viewContainerRegistry.registerViewContainer({
            id: SESSIONS_LOGS_CONTAINER_ID,
            title: localize2('logs', "Logs"),
            icon: logsViewIcon,
            order: 2,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_LOGS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            storageId: SESSIONS_LOGS_CONTAINER_ID,
            hideIfEmpty: true,
            windowVisibility: 2 /* WindowVisibility.Sessions */,
        }, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
        // Re-register the output view inside the new logs container with a `when` context
        viewsRegistry.registerViews([{
                id: OUTPUT_VIEW_ID,
                name: localize2('logs', "Logs"),
                containerIcon: logsViewIcon,
                ctorDescriptor: new SyncDescriptor(OutputViewPane),
                canToggleVisibility: true,
                canMoveView: false,
                windowVisibility: 2 /* WindowVisibility.Sessions */,
            }], logsViewContainer);
    }
};
RegisterLogsViewContainerContribution = __decorate([
    __param(0, IContextKeyService)
], RegisterLogsViewContainerContribution);
registerWorkbenchContribution2(RegisterLogsViewContainerContribution.ID, RegisterLogsViewContainerContribution, 1 /* WorkbenchPhase.BlockStartup */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9ncy5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2xvZ3MvYnJvd3Nlci9sb2dzLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBa0UsVUFBVSxJQUFJLHVCQUF1QixFQUFvQixNQUFNLHVDQUF1QyxDQUFDO0FBQ2hMLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFeEYsTUFBTSwwQkFBMEIsR0FBRyx3Q0FBd0MsQ0FBQztBQUU1RSxNQUFNLFlBQVksR0FBRyxZQUFZLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsb0RBQW9ELENBQUMsQ0FBQyxDQUFDO0FBRXJLLElBQU0scUNBQXFDLEdBQTNDLE1BQU0scUNBQXFDO2FBRTFCLE9BQUUsR0FBRyxvQ0FBb0MsQUFBdkMsQ0FBd0M7SUFFMUQsWUFDcUIsaUJBQXFDO1FBRXpELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBMEIsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNuSCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV6Riw4RUFBOEU7UUFDOUUsTUFBTSxtQkFBbUIsR0FBRyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDdEUsSUFBSSxtQkFBbUIsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sSUFBSSxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDbkQsSUFBSSxJQUFJLEVBQUUsQ0FBQztnQkFDVixhQUFhLENBQUMsZUFBZSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUM1RCxDQUFDO1lBQ0QscUJBQXFCLENBQUMsdUJBQXVCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNwRSxDQUFDO1FBRUQsMEVBQTBFO1FBQzFFLE1BQU0saUJBQWlCLEdBQUcscUJBQXFCLENBQUMscUJBQXFCLENBQUM7WUFDckUsRUFBRSxFQUFFLDBCQUEwQjtZQUM5QixLQUFLLEVBQUUsU0FBUyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7WUFDaEMsSUFBSSxFQUFFLFlBQVk7WUFDbEIsS0FBSyxFQUFFLENBQUM7WUFDUixjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsaUJBQWlCLEVBQUUsQ0FBQywwQkFBMEIsRUFBRSxFQUFFLG9DQUFvQyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbkksU0FBUyxFQUFFLDBCQUEwQjtZQUNyQyxXQUFXLEVBQUUsSUFBSTtZQUNqQixnQkFBZ0IsbUNBQTJCO1NBQzNDLHVDQUErQixFQUFFLHdCQUF3QixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFcEUsa0ZBQWtGO1FBQ2xGLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLGNBQWM7Z0JBQ2xCLElBQUksRUFBRSxTQUFTLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQztnQkFDL0IsYUFBYSxFQUFFLFlBQVk7Z0JBQzNCLGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxjQUFjLENBQUM7Z0JBQ2xELG1CQUFtQixFQUFFLElBQUk7Z0JBQ3pCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixnQkFBZ0IsbUNBQTJCO2FBQzNDLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQ3hCLENBQUM7O0FBMUNJLHFDQUFxQztJQUt4QyxXQUFBLGtCQUFrQixDQUFBO0dBTGYscUNBQXFDLENBMkMxQztBQUVELDhCQUE4QixDQUFDLHFDQUFxQyxDQUFDLEVBQUUsRUFBRSxxQ0FBcUMsc0NBQThCLENBQUMifQ==