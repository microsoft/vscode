/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize2 } from '../../../nls.js';
import { IEditorGroupsService } from '../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../services/layout/browser/layoutService.js';
import { Action2, registerAction2 } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { IPaneCompositePartService } from '../../services/panecomposite/browser/panecomposite.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import { isAuxiliaryWindow } from '../../../base/browser/window.js';
class BaseNavigationAction extends Action2 {
    constructor(options, direction) {
        super(options);
        this.direction = direction;
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const isEditorFocus = layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */);
        const isPanelFocus = layoutService.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */);
        const isSidebarFocus = layoutService.hasFocus("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        const isAuxiliaryBarFocus = layoutService.hasFocus("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        let neighborPart;
        if (isEditorFocus) {
            const didNavigate = this.navigateAcrossEditorGroup(this.toGroupDirection(this.direction), editorGroupService);
            if (didNavigate) {
                return;
            }
            neighborPart = layoutService.getVisibleNeighborPart("workbench.parts.editor" /* Parts.EDITOR_PART */, this.direction);
        }
        if (isPanelFocus) {
            neighborPart = layoutService.getVisibleNeighborPart("workbench.parts.panel" /* Parts.PANEL_PART */, this.direction);
        }
        if (isSidebarFocus) {
            neighborPart = layoutService.getVisibleNeighborPart("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */, this.direction);
        }
        if (isAuxiliaryBarFocus) {
            neighborPart = neighborPart = layoutService.getVisibleNeighborPart("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */, this.direction);
        }
        if (neighborPart === "workbench.parts.editor" /* Parts.EDITOR_PART */) {
            if (!this.navigateBackToEditorGroup(this.toGroupDirection(this.direction), editorGroupService)) {
                this.navigateToEditorGroup(this.direction === 3 /* Direction.Right */ ? 0 /* GroupLocation.FIRST */ : 1 /* GroupLocation.LAST */, editorGroupService);
            }
        }
        else if (neighborPart === "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */) {
            this.navigateToSidebar(layoutService, paneCompositeService);
        }
        else if (neighborPart === "workbench.parts.panel" /* Parts.PANEL_PART */) {
            this.navigateToPanel(layoutService, paneCompositeService);
        }
        else if (neighborPart === "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) {
            this.navigateToAuxiliaryBar(layoutService, paneCompositeService);
        }
    }
    async navigateToPanel(layoutService, paneCompositeService) {
        if (!layoutService.isVisible("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            return false;
        }
        const activePanel = paneCompositeService.getActivePaneComposite(1 /* ViewContainerLocation.Panel */);
        if (!activePanel) {
            return false;
        }
        const activePanelId = activePanel.getId();
        const res = await paneCompositeService.openPaneComposite(activePanelId, 1 /* ViewContainerLocation.Panel */, true);
        if (!res) {
            return false;
        }
        return res;
    }
    async navigateToSidebar(layoutService, paneCompositeService) {
        if (!layoutService.isVisible("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            return false;
        }
        const activeViewlet = paneCompositeService.getActivePaneComposite(0 /* ViewContainerLocation.Sidebar */);
        if (!activeViewlet) {
            return false;
        }
        const activeViewletId = activeViewlet.getId();
        const viewlet = await paneCompositeService.openPaneComposite(activeViewletId, 0 /* ViewContainerLocation.Sidebar */, true);
        return !!viewlet;
    }
    async navigateToAuxiliaryBar(layoutService, paneCompositeService) {
        if (!layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            return false;
        }
        const activePanel = paneCompositeService.getActivePaneComposite(2 /* ViewContainerLocation.AuxiliaryBar */);
        if (!activePanel) {
            return false;
        }
        const activePanelId = activePanel.getId();
        const res = await paneCompositeService.openPaneComposite(activePanelId, 2 /* ViewContainerLocation.AuxiliaryBar */, true);
        if (!res) {
            return false;
        }
        return res;
    }
    navigateAcrossEditorGroup(direction, editorGroupService) {
        return this.doNavigateToEditorGroup({ direction }, editorGroupService);
    }
    navigateToEditorGroup(location, editorGroupService) {
        return this.doNavigateToEditorGroup({ location }, editorGroupService);
    }
    navigateBackToEditorGroup(direction, editorGroupService) {
        if (!editorGroupService.activeGroup) {
            return false;
        }
        const oppositeDirection = this.toOppositeDirection(direction);
        // Check to see if there is a group in between the last
        // active group and the direction of movement
        const groupInBetween = editorGroupService.findGroup({ direction: oppositeDirection }, editorGroupService.activeGroup);
        if (!groupInBetween) {
            // No group in between means we can return
            // focus to the last active editor group
            editorGroupService.activeGroup.focus();
            return true;
        }
        return false;
    }
    toGroupDirection(direction) {
        switch (direction) {
            case 1 /* Direction.Down */: return 1 /* GroupDirection.DOWN */;
            case 2 /* Direction.Left */: return 2 /* GroupDirection.LEFT */;
            case 3 /* Direction.Right */: return 3 /* GroupDirection.RIGHT */;
            case 0 /* Direction.Up */: return 0 /* GroupDirection.UP */;
        }
    }
    toOppositeDirection(direction) {
        switch (direction) {
            case 0 /* GroupDirection.UP */: return 1 /* GroupDirection.DOWN */;
            case 3 /* GroupDirection.RIGHT */: return 2 /* GroupDirection.LEFT */;
            case 2 /* GroupDirection.LEFT */: return 3 /* GroupDirection.RIGHT */;
            case 1 /* GroupDirection.DOWN */: return 0 /* GroupDirection.UP */;
        }
    }
    doNavigateToEditorGroup(scope, editorGroupService) {
        const targetGroup = editorGroupService.findGroup(scope, editorGroupService.activeGroup);
        if (targetGroup) {
            targetGroup.focus();
            return true;
        }
        return false;
    }
}
registerAction2(class extends BaseNavigationAction {
    constructor() {
        super({
            id: 'workbench.action.navigateLeft',
            title: localize2('navigateLeft', 'Navigate to the View on the Left'),
            category: Categories.View,
            f1: true
        }, 2 /* Direction.Left */);
    }
});
registerAction2(class extends BaseNavigationAction {
    constructor() {
        super({
            id: 'workbench.action.navigateRight',
            title: localize2('navigateRight', 'Navigate to the View on the Right'),
            category: Categories.View,
            f1: true
        }, 3 /* Direction.Right */);
    }
});
registerAction2(class extends BaseNavigationAction {
    constructor() {
        super({
            id: 'workbench.action.navigateUp',
            title: localize2('navigateUp', 'Navigate to the View Above'),
            category: Categories.View,
            f1: true
        }, 0 /* Direction.Up */);
    }
});
registerAction2(class extends BaseNavigationAction {
    constructor() {
        super({
            id: 'workbench.action.navigateDown',
            title: localize2('navigateDown', 'Navigate to the View Below'),
            category: Categories.View,
            f1: true
        }, 1 /* Direction.Down */);
    }
});
class BaseFocusAction extends Action2 {
    constructor(options, focusNext) {
        super(options);
        this.focusNext = focusNext;
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const editorService = accessor.get(IEditorService);
        this.focusNextOrPreviousPart(layoutService, editorService, this.focusNext);
    }
    findVisibleNeighbour(layoutService, part, next) {
        const activeWindow = getActiveWindow();
        const windowIsAuxiliary = isAuxiliaryWindow(activeWindow);
        let neighbour;
        if (windowIsAuxiliary) {
            switch (part) {
                case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                    neighbour = "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */;
                    break;
                default:
                    neighbour = "workbench.parts.editor" /* Parts.EDITOR_PART */;
            }
        }
        else {
            switch (part) {
                case "workbench.parts.editor" /* Parts.EDITOR_PART */:
                    neighbour = next ? "workbench.parts.panel" /* Parts.PANEL_PART */ : "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
                    break;
                case "workbench.parts.panel" /* Parts.PANEL_PART */:
                    neighbour = next ? "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */ : "workbench.parts.editor" /* Parts.EDITOR_PART */;
                    break;
                case "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */:
                    neighbour = next ? "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */ : "workbench.parts.panel" /* Parts.PANEL_PART */;
                    break;
                case "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */:
                    neighbour = next ? "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */ : "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
                    break;
                case "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */:
                    neighbour = next ? "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */ : "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */;
                    break;
                case "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */:
                    neighbour = next ? "workbench.parts.editor" /* Parts.EDITOR_PART */ : "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */;
                    break;
                default:
                    neighbour = "workbench.parts.editor" /* Parts.EDITOR_PART */;
            }
        }
        if (layoutService.isVisible(neighbour, activeWindow) || neighbour === "workbench.parts.editor" /* Parts.EDITOR_PART */) {
            return neighbour;
        }
        return this.findVisibleNeighbour(layoutService, neighbour, next);
    }
    focusNextOrPreviousPart(layoutService, editorService, next) {
        let currentlyFocusedPart;
        if (editorService.activeEditorPane?.hasFocus() || layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */)) {
            currentlyFocusedPart = "workbench.parts.editor" /* Parts.EDITOR_PART */;
        }
        else if (layoutService.hasFocus("workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */)) {
            currentlyFocusedPart = "workbench.parts.activitybar" /* Parts.ACTIVITYBAR_PART */;
        }
        else if (layoutService.hasFocus("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */)) {
            currentlyFocusedPart = "workbench.parts.statusbar" /* Parts.STATUSBAR_PART */;
        }
        else if (layoutService.hasFocus("workbench.parts.sidebar" /* Parts.SIDEBAR_PART */)) {
            currentlyFocusedPart = "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */;
        }
        else if (layoutService.hasFocus("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */)) {
            currentlyFocusedPart = "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */;
        }
        else if (layoutService.hasFocus("workbench.parts.panel" /* Parts.PANEL_PART */)) {
            currentlyFocusedPart = "workbench.parts.panel" /* Parts.PANEL_PART */;
        }
        layoutService.focusPart(currentlyFocusedPart ? this.findVisibleNeighbour(layoutService, currentlyFocusedPart, next) : "workbench.parts.editor" /* Parts.EDITOR_PART */, getActiveWindow());
    }
}
registerAction2(class extends BaseFocusAction {
    constructor() {
        super({
            id: 'workbench.action.focusNextPart',
            title: localize2('focusNextPart', 'Focus Next Part'),
            category: Categories.View,
            f1: true,
            keybinding: {
                primary: 64 /* KeyCode.F6 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        }, true);
    }
});
registerAction2(class extends BaseFocusAction {
    constructor() {
        super({
            id: 'workbench.action.focusPreviousPart',
            title: localize2('focusPreviousPart', 'Focus Previous Part'),
            category: Categories.View,
            f1: true,
            keybinding: {
                primary: 1024 /* KeyMod.Shift */ | 64 /* KeyCode.F6 */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        }, false);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF2aWdhdGlvbkFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9hY3Rpb25zL25hdmlnYXRpb25BY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsb0JBQW9CLEVBQWtELE1BQU0scURBQXFELENBQUM7QUFDM0ksT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sZ0RBQWdELENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBbUIsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDeEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBR3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUcvRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUlsRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFcEUsTUFBZSxvQkFBcUIsU0FBUSxPQUFPO0lBRWxELFlBQ0MsT0FBd0IsRUFDZCxTQUFvQjtRQUU5QixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFGTCxjQUFTLEdBQVQsU0FBUyxDQUFXO0lBRy9CLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzVELE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQzlELE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFD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