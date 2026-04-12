/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { PROFILES_CATEGORY } from '../../../services/userDataProfile/common/userDataProfile.js';
class CreateTransientProfileAction extends Action2 {
    static { this.ID = 'workbench.profiles.actions.createTemporaryProfile'; }
    static { this.TITLE = localize2('create temporary profile', "New Window with Temporary Profile"); }
    constructor() {
        super({
            id: CreateTransientProfileAction.ID,
            title: CreateTransientProfileAction.TITLE,
            category: PROFILES_CATEGORY,
            f1: true,
        });
    }
    async run(accessor) {
        accessor.get(IHostService).openWindow({ forceTempProfile: true });
    }
}
registerAction2(CreateTransientProfileAction);
// Developer Actions
registerAction2(class CleanupProfilesAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.profiles.actions.cleanupProfiles',
            title: localize2('cleanup profile', "Cleanup Profiles"),
            category: Categories.Developer,
            f1: true,
        });
    }
    async run(accessor) {
        return accessor.get(IUserDataProfilesService).cleanUp();
    }
});
registerAction2(class ResetWorkspacesAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.profiles.actions.resetWorkspaces',
            title: localize2('reset workspaces', "Reset Workspace Profiles Associations"),
            category: Categories.Developer,
            f1: true,
        });
    }
    async run(accessor) {
        const userDataProfilesService = accessor.get(IUserDataProfilesService);
        return userDataProfilesService.resetWorkspaces();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhUHJvZmlsZS9icm93c2VyL3VzZXJEYXRhUHJvZmlsZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUVoRyxNQUFNLDRCQUE2QixTQUFRLE9BQU87YUFDakMsT0FBRSxHQUFHLG1EQUFtRCxDQUFDO2FBQ3pELFVBQUssR0FBRyxTQUFTLENBQUMsMEJBQTBCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQztJQUNuRztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw0QkFBNEIsQ0FBQyxFQUFFO1lBQ25DLEtBQUssRUFBRSw0QkFBNEIsQ0FBQyxLQUFLO1lBQ3pDLFFBQVEsRUFBRSxpQkFBaUI7WUFDM0IsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDbkUsQ0FBQzs7QUFHRixlQUFlLENBQUMsNEJBQTRCLENBQUMsQ0FBQztBQUU5QyxvQkFBb0I7QUFFcEIsZUFBZSxDQUFDLE1BQU0scUJBQXNCLFNBQVEsT0FBTztJQUMxRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw0Q0FBNEM7WUFDaEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxrQkFBa0IsQ0FBQztZQUN2RCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN6RCxDQUFDO0NBQ0QsQ0FBQyxDQUFDO0FBRUgsZUFBZSxDQUFDLE1BQU0scUJBQXNCLFNBQVEsT0FBTztJQUMxRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw0Q0FBNEM7WUFDaEQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSx1Q0FBdUMsQ0FBQztZQUM3RSxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLHVCQUF1QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN2RSxPQUFPLHVCQUF1QixDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ2xELENBQUM7Q0FDRCxDQUFDLENBQUMifQ==