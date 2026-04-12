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
import { localize, localize2 } from '../../../../nls.js';
import { IStatusbarService } from '../../../services/statusbar/browser/statusbar.js';
import { Action } from '../../../../base/common/actions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { StatusBarFocused } from '../../../common/contextkeys.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
export class ToggleStatusbarEntryVisibilityAction extends Action {
    constructor(id, label, model) {
        super(id, label, undefined, true);
        this.model = model;
        this.checked = !model.isHidden(id);
    }
    async run() {
        if (this.model.isHidden(this.id)) {
            this.model.show(this.id);
        }
        else {
            this.model.hide(this.id);
        }
    }
}
export class HideStatusbarEntryAction extends Action {
    constructor(id, name, model) {
        super(id, localize('hide', "Hide '{0}'", name), undefined, true);
        this.model = model;
    }
    async run() {
        this.model.hide(this.id);
    }
}
let ManageExtensionAction = class ManageExtensionAction extends Action {
    constructor(extensionId, commandService) {
        super('statusbar.manage.extension', localize('manageExtension', "Manage Extension"));
        this.extensionId = extensionId;
        this.commandService = commandService;
    }
    run() {
        return this.commandService.executeCommand('_extensions.manage', this.extensionId);
    }
};
ManageExtensionAction = __decorate([
    __param(1, ICommandService)
], ManageExtensionAction);
export { ManageExtensionAction };
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.statusBar.focusPrevious',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 15 /* KeyCode.LeftArrow */,
    secondary: [16 /* KeyCode.UpArrow */],
    when: StatusBarFocused,
    handler: (accessor) => {
        const statusBarService = accessor.get(IStatusbarService);
        statusBarService.focusPreviousEntry();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.statusBar.focusNext',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 17 /* KeyCode.RightArrow */,
    secondary: [18 /* KeyCode.DownArrow */],
    when: StatusBarFocused,
    handler: (accessor) => {
        const statusBarService = accessor.get(IStatusbarService);
        statusBarService.focusNextEntry();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.statusBar.focusFirst',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 14 /* KeyCode.Home */,
    when: StatusBarFocused,
    handler: (accessor) => {
        const statusBarService = accessor.get(IStatusbarService);
        statusBarService.focus(false);
        statusBarService.focusNextEntry();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.statusBar.focusLast',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 13 /* KeyCode.End */,
    when: StatusBarFocused,
    handler: (accessor) => {
        const statusBarService = accessor.get(IStatusbarService);
        statusBarService.focus(false);
        statusBarService.focusPreviousEntry();
    }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: 'workbench.statusBar.clearFocus',
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    primary: 9 /* KeyCode.Escape */,
    when: StatusBarFocused,
    handler: (accessor) => {
        const statusBarService = accessor.get(IStatusbarService);
        const editorService = accessor.get(IEditorService);
        if (statusBarService.isEntryFocused()) {
            statusBarService.focus(false);
        }
        else if (editorService.activeEditorPane) {
            editorService.activeEditorPane.focus();
        }
    }
});
class FocusStatusBarAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.focusStatusBar',
            title: localize2('focusStatusBar', 'Focus Status Bar'),
            category: Categories.View,
            f1: true
        });
    }
    async run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        layoutService.focusPart("workbench.parts.statusbar" /* Parts.STATUSBAR_PART */, getActiveWindow());
    }
}
registerAction2(FocusStatusBarAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhdHVzYmFyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3N0YXR1c2Jhci9zdGF0dXNiYXJBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDckYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBUyx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxtQkFBbUIsRUFBb0IsTUFBTSwrREFBK0QsQ0FBQztBQUV0SCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFbEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVuRixNQUFNLE9BQU8sb0NBQXFDLFNBQVEsTUFBTTtJQUUvRCxZQUFZLEVBQVUsRUFBRSxLQUFhLEVBQVUsS0FBeUI7UUFDdkUsS0FBSyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRFksVUFBSyxHQUFMLEtBQUssQ0FBb0I7UUFHdkUsSUFBSSxDQUFDLE9BQU8sR0FBRyxD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