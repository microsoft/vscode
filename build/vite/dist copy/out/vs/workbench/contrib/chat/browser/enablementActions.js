/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Action } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { isContributionDisabled } from '../common/enablement.js';
/**
 * Creates the four standard enablement actions (Enable, Enable Workspace,
 * Disable, Disable Workspace) for a contribution identified by a string key.
 */
export function createEnablementActions(key, enablementModel, idPrefix) {
    return [
        new Action(`${idPrefix}.enable`, localize('enable', "Enable"), undefined, true, () => { enablementModel.setEnabled(key, 2 /* ContributionEnablementState.EnabledProfile */); return Promise.resolve(); }),
        new Action(`${idPrefix}.enableForWorkspace`, localize('enableForWorkspace', "Enable (Workspace)"), undefined, true, () => { enablementModel.setEnabled(key, 3 /* ContributionEnablementState.EnabledWorkspace */); return Promise.resolve(); }),
        new Action(`${idPrefix}.disable`, localize('disable', "Disable"), undefined, true, () => { enablementModel.setEnabled(key, 0 /* ContributionEnablementState.DisabledProfile */); return Promise.resolve(); }),
        new Action(`${idPrefix}.disableForWorkspace`, localize('disableForWorkspace', "Disable (Workspace)"), undefined, true, () => { enablementModel.setEnabled(key, 1 /* ContributionEnablementState.DisabledWorkspace */); return Promise.resolve(); }),
    ];
}
/**
 * Builds the standard enablement context-menu action group for a
 * contribution. Returns either the enable or disable actions depending
 * on the current state, with workspace variants included only when a
 * workspace is open.
 */
export function buildEnablementContextMenuGroup(enablementState, key, enablementModel, workspaceContextService, idPrefix) {
    const hasWorkspace = workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    const [enable, enableWorkspace, disable, disableWorkspace] = createEnablementActions(key, enablementModel, idPrefix);
    const actions = [];
    if (isContributionDisabled(enablementState)) {
        actions.push(enable);
        if (hasWorkspace) {
            actions.push(enableWorkspace);
        }
    }
    else {
        actions.push(disable);
        if (hasWorkspace) {
            actions.push(disableWorkspace);
        }
    }
    return actions;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5hYmxlbWVudEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvZW5hYmxlbWVudEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQWlELHNCQUFzQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFaEg7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUN0QyxHQUFXLEVBQ1gsZUFBaUMsRUFDakMsUUFBZ0I7SUFFaEIsT0FBTztRQUNOLElBQUksTUFBTSxDQUFDLEdBQUcsUUFBUSxTQUFTLEVBQUUsUUFBUSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUM3RSxHQUFHLEVBQUUsR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDLEdBQUcscURBQTZDLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsSCxJQUFJLE1BQU0sQ0FBQyxHQUFHLFFBQVEscUJBQXFCLEVBQUUsUUFBUSxDQUFDLG9CQUFvQixFQUFFLG9CQUFvQixDQUFDLEVBQUUsU0FBUyxFQUFFLElBQUksRUFDakgsR0FBRyxFQUFFLEdBQUcsZUFBZSxDQUFDLFVBQVUsQ0FBQyxHQUFHLHVEQUErQyxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEgsSUFBSSxNQUFNLENBQUMsR0FBRyxRQUFRLFVBQVUsRUFBRSxRQUFRLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQ2hGLEdBQUcsRUFBRSxHQUFHLGVBQWUsQ0FBQyxVQUFVLENBQUMsR0FBRyxzREFBOEMsQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ25ILElBQUksTUFBTSxDQUFDLEdBQUcsUUFBUSxzQkFBc0IsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUNwSCxHQUFHLEVBQUUsR0FBRyxlQUFlLENBQUMsVUFBVSxDQUFDLEdBQUcsd0RBQWdELENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNySCxDQUFDO0FBQ0gsQ0FBQztBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLCtCQUErQixDQUM5QyxlQUE0QyxFQUM1QyxHQUFXLEVBQ1gsZUFBaUMsRUFDakMsdUJBQWlELEVBQ2pELFFBQWdCO0lBRWhCLE1BQU0sWUFBWSxHQUFHLHVCQUF1QixDQUFDLGlCQUFpQixFQUFFLGlDQUF5QixDQUFDO0lBQzFGLE1BQU0sQ0FBQyxNQUFNLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLHVCQUF1QixDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDckgsTUFBTSxPQUFPLEdBQWMsRUFBRSxDQUFDO0lBQzlCLElBQUksc0JBQXNCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztRQUM3QyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JCLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMvQixDQUFDO0lBQ0YsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RCLElBQUksWUFBWSxFQUFFLENBQUM7WUFDbEIsT0FBTyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQyJ9