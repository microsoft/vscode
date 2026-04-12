/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../../workbench/common/views.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesViewPane, ChangesViewPaneContainer } from './changesView.js';
import { ChangesTitleBarContribution } from './changesTitleBarWidget.js';
import './changesViewActions.js';
import './checksActions.js';
const changesViewIcon = registerIcon('changes-view-icon', Codicon.gitCompare, localize2('changesViewIcon', 'View icon for the Changes view.').value);
const viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
const changesViewContainer = viewContainersRegistry.registerViewContainer({
    id: CHANGES_VIEW_CONTAINER_ID,
    title: localize2('changes', 'Changes'),
    ctorDescriptor: new SyncDescriptor(ChangesViewPaneContainer),
    icon: changesViewIcon,
    order: 10,
    hideIfEmpty: true,
    windowVisibility: 2 /* WindowVisibility.Sessions */
}, 2 /* ViewContainerLocation.AuxiliaryBar */, { doNotRegisterOpenCommand: true, isDefault: true });
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
viewsRegistry.registerViews([{
        id: CHANGES_VIEW_ID,
        name: localize2('changes', 'Changes'),
        containerIcon: changesViewIcon,
        ctorDescriptor: new SyncDescriptor(ChangesViewPane),
        canToggleVisibility: true,
        canMoveView: true,
        weight: 100,
        order: 1,
        windowVisibility: 2 /* WindowVisibility.Sessions */
    }], changesViewContainer);
registerWorkbenchContribution2(ChangesTitleBarContribution.ID, ChangesTitleBarContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbmdlc1ZpZXcuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hhbmdlc1ZpZXcuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDL0MsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQy9HLE9BQU8sRUFBa0UsVUFBVSxJQUFJLHVCQUF1QixFQUFvQixNQUFNLHVDQUF1QyxDQUFDO0FBQ2hMLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxlQUFlLEVBQUUsZUFBZSxFQUFFLHdCQUF3QixFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDekgsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDekUsT0FBTyx5QkFBeUIsQ0FBQztBQUNqQyxPQUFPLG9CQUFvQixDQUFDO0FBRTVCLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRXJKLE1BQU0sc0JBQXNCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBMEIsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztBQUVwSCxNQUFNLG9CQUFvQixHQUFHLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDO0lBQ3pFLEVBQUUsRUFBRSx5QkFBeUI7SUFDN0IsS0FBSyxFQUFFLFNBQVMsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDO0lBQ3RDLGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyx3QkFBd0IsQ0FBQztJQUM1RCxJQUFJLEVBQUUsZUFBZTtJQUNyQixLQUFLLEVBQUUsRUFBRTtJQUNULFdBQVcsRUFBRSxJQUFJO0lBQ2pCLGdCQUFnQixtQ0FBMkI7Q0FDM0MsOENBQXNDLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBRTVGLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQWlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBRXpGLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUM1QixFQUFFLEVBQUUsZUFBZTtRQUNuQixJQUFJLEVBQUUsU0FBUyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUM7UUFDckMsYUFBYSxFQUFFLGVBQWU7UUFDOUIsY0FBYyxFQUFFLElBQUksY0FBYyxDQUFDLGVBQWUsQ0FBQztRQUNuRCxtQkFBbUIsRUFBRSxJQUFJO1FBQ3pCLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLE1BQU0sRUFBRSxHQUFHO1FBQ1gsS0FBSyxFQUFFLENBQUM7UUFDUixnQkFBZ0IsbUNBQTJCO0tBQzNDLENBQUMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0FBRTFCLDhCQUE4QixDQUFDLDJCQUEyQixDQUFDLEVBQUUsRUFBRSwyQkFBMkIsdUNBQStCLENBQUMifQ==