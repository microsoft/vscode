/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ViewContainerExtensions } from '../../../../workbench/common/views.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SessionsManagementService, ISessionsManagementService } from './sessionsManagementService.js';
import { SessionsTitleBarContribution } from './sessionsTitleBarWidget.js';
import { SessionsView, SessionsViewId } from './views/sessionsView.js';
import './views/sessionsViewActions.js';
import './sessionsActions.js';
const agentSessionsViewIcon = registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, localize('agentSessionsViewIcon', 'Icon for Agent Sessions View'));
const AGENT_SESSIONS_VIEW_TITLE = localize2('agentSessions.view.label', "Sessions");
const SessionsContainerId = 'agentic.workbench.view.sessionsContainer';
const agentSessionsViewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
    id: SessionsContainerId,
    title: AGENT_SESSIONS_VIEW_TITLE,
    icon: agentSessionsViewIcon,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SessionsContainerId, { mergeViewWithContainerWhenSingleView: true, }]),
    storageId: SessionsContainerId,
    hideIfEmpty: true,
    order: 6,
    windowVisibility: 2 /* WindowVisibility.Sessions */
}, 0 /* ViewContainerLocation.Sidebar */, { isDefault: true });
const sessionsViewPaneDescriptor = {
    id: SessionsViewId,
    containerIcon: agentSessionsViewIcon,
    containerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
    singleViewPaneContainerTitle: AGENT_SESSIONS_VIEW_TITLE.value,
    name: AGENT_SESSIONS_VIEW_TITLE,
    canToggleVisibility: true,
    canMoveView: false,
    ctorDescriptor: new SyncDescriptor(SessionsView),
    windowVisibility: 2 /* WindowVisibility.Sessions */
};
Registry.as(ViewContainerExtensions.ViewsRegistry).registerViews([sessionsViewPaneDescriptor], agentSessionsViewContainer);
registerSingleton(ISessionsManagementService, SessionsManagementService, 1 /* InstantiationType.Delayed */);
registerWorkbenchContribution2(SessionsTitleBarContribution.ID, SessionsTitleBarContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBbUMsVUFBVSxJQUFJLHVCQUF1QixFQUFtRixNQUFNLHVDQUF1QyxDQUFDO0FBQ2hOLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsOEJBQThCLEVBQWtCLE1BQU0sK0NBQStDLENBQUM7QUFDL0csT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNFLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdkUsT0FBTyxnQ0FBZ0MsQ0FBQztBQUN4QyxPQUFPLHNCQUFzQixDQUFDO0FBRTlCLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsOEJBQThCLENBQUMsQ0FBQyxDQUFDO0FBQ3RLLE1BQU0seUJBQXlCLEdBQUcsU0FBUyxDQUFDLDBCQUEwQixFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQ3BGLE1BQU0sbUJBQW1CLEdBQUcsMENBQTBDLENBQUM7QUFFdkUsTUFBTSwwQkFBMEIsR0FBa0IsUUFBUSxDQUFDLEVBQUUsQ0FBMEIsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztJQUM1SixFQUFFLEVBQUUsbUJBQW1CO0lBQ3ZCLEtBQUssRUFBRSx5QkFBeUI7SUFDaEMsSUFBSSxFQUFFLHFCQUFxQjtJQUMzQixjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLG9DQUFvQyxFQUFFLElBQUksR0FBRyxDQUFDLENBQUM7SUFDN0gsU0FBUyxFQUFFLG1CQUFtQjtJQUM5QixXQUFXLEVBQUUsSUFBSTtJQUNqQixLQUFLLEVBQUUsQ0FBQztJQUNSLGdCQUFnQixtQ0FBMkI7Q0FDM0MseUNBQWlDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFFdkQsTUFBTSwwQkFBMEIsR0FBb0I7SUFDbkQsRUFBRSxFQUFFLGNBQWM7SUFDbEIsYUFBYSxFQUFFLHFCQUFxQjtJQUNwQyxjQUFjLEVBQUUseUJBQXlCLENBQUMsS0FBSztJQUMvQyw0QkFBNEIsRUFBRSx5QkFBeUIsQ0FBQyxLQUFLO0lBQzdELElBQUksRUFBRSx5QkFBeUI7SUFDL0IsbUJBQW1CLEVBQUUsSUFBSTtJQUN6QixXQUFXLEVBQUUsS0FBSztJQUNsQixjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsWUFBWSxDQUFDO0lBQ2hELGdCQUFnQixtQ0FBMkI7Q0FDM0MsQ0FBQztBQUVGLFFBQVEsQ0FBQyxFQUFFLENBQWlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLDBCQUEwQixDQUFDLEVBQUUsMEJBQTBCLENBQUMsQ0FBQztBQUUzSSxpQkFBaUIsQ0FBQywwQkFBMEIsRUFBRSx5QkFBeUIsb0NBQTRCLENBQUM7QUFFcEcsOEJBQThCLENBQUMsNEJBQTRCLENBQUMsRUFBRSxFQUFFLDRCQUE0Qix1Q0FBK0IsQ0FBQyJ9