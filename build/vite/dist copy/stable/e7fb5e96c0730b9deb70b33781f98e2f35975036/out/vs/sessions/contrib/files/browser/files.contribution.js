/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { Extensions as ViewContainerExtensions } from '../../../../workbench/common/views.js';
import { WorkspaceFolderCountContext } from '../../../../workbench/common/contextkeys.js';
import { ExplorerView } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
const SESSIONS_FILES_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.filesContainer';
const SESSIONS_FILES_VIEW_ID = 'sessions.files.explorer';
const filesViewIcon = registerIcon('sessions-files-view-icon', Codicon.files, localize2('sessionsFilesViewIcon', 'View icon of the files view in the sessions window.').value);
class RegisterFilesViewContribution {
    static { this.ID = 'sessions.registerFilesView'; }
    constructor() {
        const viewContainerRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
        const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
        // Register a new Files view container in the auxiliary bar for the sessions window
        const filesViewContainer = viewContainerRegistry.registerViewContainer({
            id: SESSIONS_FILES_CONTAINER_ID,
            title: localize2('files', "Files"),
            icon: filesViewIcon,
            order: 11,
            ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_FILES_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
            storageId: SESSIONS_FILES_CONTAINER_ID,
            hideIfEmpty: true,
            windowVisibility: 2 /* WindowVisibility.Sessions */,
        }, 2 /* ViewContainerLocation.AuxiliaryBar */, { doNotRegisterOpenCommand: true });
        // Re-register the explorer view inside the new Files container
        viewsRegistry.registerViews([{
                id: SESSIONS_FILES_VIEW_ID,
                name: localize2('files', "Files"),
                containerIcon: filesViewIcon,
                ctorDescriptor: new SyncDescriptor(ExplorerView),
                canToggleVisibility: true,
                canMoveView: false,
                when: WorkspaceFolderCountContext.notEqualsTo('0'),
                windowVisibility: 2 /* WindowVisibility.Sessions */,
            }], filesViewContainer);
    }
}
registerWorkbenchContribution2(RegisterFilesViewContribution.ID, RegisterFilesViewContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'sessions.files.action.collapseExplorerFolders',
            title: localize2('collapseExplorerFolders', "Collapse Folders in Explorer"),
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.ViewTitle,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', SESSIONS_FILES_VIEW_ID),
            },
        });
    }
    run(accessor) {
        const viewsService = accessor.get(IViewsService);
        const view = viewsService.getViewWithId(SESSIONS_FILES_VIEW_ID);
        if (view !== null) {
            view.collapseAll();
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9maWxlcy9icm93c2VyL2ZpbGVzLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQTBCLDhCQUE4QixFQUFrQixNQUFNLCtDQUErQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBa0UsVUFBVSxJQUFJLHVCQUF1QixFQUFvQixNQUFNLHVDQUF1QyxDQUFDO0FBQ2hMLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUNqRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFFNUYsTUFBTSwyQkFBMkIsR0FBRyxnREFBZ0QsQ0FBQztBQUNyRixNQUFNLHNCQUFzQixHQUFHLHlCQUF5QixDQUFDO0FBRXpELE1BQU0sYUFBYSxHQUFHLFlBQVksQ0FBQywwQkFBMEIsRUFBRSxPQUFPLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxxREFBcUQsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRS9LLE1BQU0sNkJBQTZCO2FBRWxCLE9BQUUsR0FBRyw0QkFBNEIsQ0FBQztJQUVsRDtRQUNDLE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBMEIsdUJBQXVCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNuSCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFpQix1QkFBdUIsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV6RixtRkFBbUY7UUFDbkYsTUFBTSxrQkFBa0IsR0FBRyxxQkFBcUIsQ0FBQyxxQkFBcUIsQ0FBQztZQUN0RSxFQUFFLEVBQUUsMkJBQTJCO1lBQy9CLEtBQUssRUFBRSxTQUFTLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztZQUNsQyxJQUFJLEVBQUUsYUFBYTtZQUNuQixLQUFLLEVBQUUsRUFBRTtZQUNULGNBQWMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLDJCQUEyQixFQUFFLEVBQUUsb0NBQW9DLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNwSSxTQUFTLEVBQUUsMkJBQTJCO1lBQ3RDLFdBQVcsRUFBRSxJQUFJO1lBQ2pCLGdCQUFnQixtQ0FBMkI7U0FDM0MsOENBQXNDLEVBQUUsd0JBQXdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUUzRSwrREFBK0Q7UUFDL0QsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsc0JBQXNCO2dCQUMxQixJQUFJLEVBQUUsU0FBUyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7Z0JBQ2pDLGFBQWEsRUFBRSxhQUFhO2dCQUM1QixjQUFjLEVBQUUsSUFBSSxjQUFjLENBQUMsWUFBWSxDQUFDO2dCQUNoRCxtQkFBbUIsRUFBRSxJQUFJO2dCQUN6QixXQUFXLEVBQUUsS0FBSztnQkFDbEIsSUFBSSxFQUFFLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUM7Z0JBQ2xELGdCQUFnQixtQ0FBMkI7YUFDM0MsQ0FBQyxFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFDekIsQ0FBQzs7QUFHRiw4QkFBOEIsQ0FBQyw2QkFBNkIsQ0FBQyxFQUFFLEVBQUUsNkJBQTZCLHVDQUErQixDQUFDO0FBRTlILGVBQWUsQ0FBQyxLQUFNLFNBQVEsT0FBTztJQUNwQztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwrQ0FBK0M7WUFDbkQsS0FBSyxFQUFFLFNBQVMsQ0FBQyx5QkFBeUIsRUFBRSw4QkFBOEIsQ0FBQztZQUMzRSxJQUFJLEVBQUUsT0FBTyxDQUFDLFdBQVc7WUFDekIsSUFBSSxFQUFFO2dCQUNMLEVBQUUsRUFBRSxNQUFNLENBQUMsU0FBUztnQkFDcEIsS0FBSyxFQUFFLFlBQVk7Z0JBQ25CLElBQUksRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQzthQUMzRDtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRCxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsYUFBYSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDaEUsSUFBSSxJQUFJLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDbEIsSUFBcUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztDQUNELENBQUMsQ0FBQyJ9