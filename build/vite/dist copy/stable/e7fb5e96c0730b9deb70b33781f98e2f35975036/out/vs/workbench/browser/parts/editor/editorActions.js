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
import { Action } from '../../../../base/common/actions.js';
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CLOSE_EDITOR_COMMAND_ID, MOVE_ACTIVE_EDITOR_COMMAND_ID, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, SPLIT_EDITOR_DOWN, splitEditor, LAYOUT_EDITOR_GROUPS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, COPY_ACTIVE_EDITOR_COMMAND_ID, SPLIT_EDITOR, TOGGLE_MAXIMIZE_EDITOR_GROUP, MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, MOVE_EDITOR_INTO_RIGHT_GROUP, MOVE_EDITOR_INTO_LEFT_GROUP, MOVE_EDITOR_INTO_ABOVE_GROUP, MOVE_EDITOR_INTO_BELOW_GROUP } from './editorCommands.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ItemActivation, IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { AllEditorsByMostRecentlyUsedQuickAccess, ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess } from './editorQuickAccess.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { isLinux, isNative, isWindows } from '../../../../base/common/platform.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ActiveEditorAvailableEditorIdsContext, ActiveEditorContext, ActiveEditorGroupEmptyContext, AuxiliaryBarVisibleContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, InAutomationContext, IsAuxiliaryWindowFocusedContext, MultipleEditorGroupsContext, SideBarVisibleContext } from '../../../common/contextkeys.js';
import { getActiveDocument } from '../../../../base/browser/dom.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { resolveCommandsContext } from './editorCommandsContext.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { prepareMoveCopyEditors } from './editor.js';
class ExecuteCommandAction extends Action2 {
    constructor(desc, commandId, commandArgs) {
        super(desc);
        this.commandId = commandId;
        this.commandArgs = commandArgs;
    }
    run(accessor) {
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(this.commandId, this.commandArgs);
    }
}
class AbstractSplitEditorAction extends Action2 {
    getDirection(configurationService) {
        return preferredSideBySideGroupDirection(configurationService);
    }
    async run(accessor, ...args) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        const editorService = accessor.get(IEditorService);
        const listService = accessor.get(IListService);
        const direction = this.getDirection(configurationService);
        const commandContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
        splitEditor(editorGroupsService, direction, commandContext);
    }
}
export class SplitEditorAction extends AbstractSplitEditorAction {
    static { this.ID = SPLIT_EDITOR; }
    constructor() {
        super({
            id: SplitEditorAction.ID,
            title: localize2('splitEditor', 'Split Editor'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */
            },
            category: Categories.View
        });
    }
}
export class SplitEditorOrthogonalAction extends AbstractSplitEditorAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorOrthogonal',
            title: localize2('splitEditorOrthogonal', 'Split Editor Orthogonal'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */)
            },
            category: Categories.View
        });
    }
    getDirection(configurationService) {
        const direction = preferredSideBySideGroupDirection(configurationService);
        return direction === 3 /* GroupDirection.RIGHT */ ? 1 /* GroupDirection.DOWN */ : 3 /* GroupDirection.RIGHT */;
    }
}
export class SplitEditorLeftAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: SPLIT_EDITOR_LEFT,
            title: localize2('splitEditorGroupLeft', 'Split Editor Left'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */)
            },
            category: Categories.View
        }, SPLIT_EDITOR_LEFT);
    }
}
export class SplitEditorRightAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: SPLIT_EDITOR_RIGHT,
            title: localize2('splitEditorGroupRight', 'Split Editor Right'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */)
            },
            category: Categories.View
        }, SPLIT_EDITOR_RIGHT);
    }
}
export class SplitEditorUpAction extends ExecuteCommandAction {
    static { this.LABEL = localize('splitEditorGroupUp', "Split Editor Up"); }
    constructor() {
        super({
            id: SPLIT_EDITOR_UP,
            title: localize2('splitEditorGroupUp', "Split Editor Up"),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */)
            },
            category: Categories.View
        }, SPLIT_EDITOR_UP);
    }
}
export class SplitEditorDownAction extends ExecuteCommandAction {
    static { this.LABEL = localize('splitEditorGroupDown', "Split Editor Down"); }
    constructor() {
        super({
            id: SPLIT_EDITOR_DOWN,
            title: localize2('splitEditorGroupDown', "Split Editor Down"),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */)
            },
            category: Categories.View
        }, SPLIT_EDITOR_DOWN);
    }
}
export class JoinTwoGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.joinTwoGroups',
            title: localize2('joinTwoGroups', 'Join Editor Group with Next Group'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor, context) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        let sourceGroup;
        if (context && typeof context.groupId === 'number') {
            sourceGroup = editorGroupService.getGroup(context.groupId);
        }
        else {
            sourceGroup = editorGroupService.activeGroup;
        }
        if (sourceGroup) {
            const targetGroupDirections = [3 /* GroupDirection.RIGHT */, 1 /* GroupDirection.DOWN */, 2 /* GroupDirection.LEFT */, 0 /* GroupDirection.UP */];
            for (const targetGroupDirection of targetGroupDirections) {
                const targetGroup = editorGroupService.findGroup({ direction: targetGroupDirection }, sourceGroup);
                if (targetGroup && sourceGroup !== targetGroup) {
                    editorGroupService.mergeGroup(sourceGroup, targetGroup);
                    break;
                }
            }
        }
    }
}
export class JoinAllGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.joinAllGroups',
            title: localize2('joinAllGroups', 'Join All Editor Groups'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.mergeAllGroups(editorGroupService.activeGroup);
    }
}
export class NavigateBetweenGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateEditorGroups',
            title: localize2('navigateEditorGroups', 'Navigate Between Editor Groups'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const nextGroup = editorGroupService.findGroup({ location: 2 /* GroupLocation.NEXT */ }, editorGroupService.activeGroup, true);
        nextGroup?.focus();
    }
}
export class FocusActiveGroupAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.focusActiveEditorGroup',
            title: localize2('focusActiveEditorGroup', 'Focus Active Editor Group'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.activeGroup.focus();
    }
}
class AbstractFocusGroupAction extends Action2 {
    constructor(desc, scope) {
        super(desc);
        this.scope = scope;
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const group = editorGroupService.findGroup(this.scope, editorGroupService.activeGroup, true);
        group?.focus();
    }
}
export class FocusFirstGroupAction extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusFirstEditorGroup',
            title: localize2('focusFirstEditorGroup', 'Focus First Editor Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */
            },
            category: Categories.View
        }, { location: 0 /* GroupLocation.FIRST */ });
    }
}
export class FocusLastGroupAction extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusLastEditorGroup',
            title: localize2('focusLastEditorGroup', 'Focus Last Editor Group'),
            f1: true,
            category: Categories.View
        }, { location: 1 /* GroupLocation.LAST */ });
    }
}
export class FocusNextGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusNextGroup',
            title: localize2('focusNextGroup', 'Focus Next Editor Group'),
            f1: true,
            category: Categories.View
        }, { location: 2 /* GroupLocation.NEXT */ });
    }
}
export class FocusPreviousGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusPreviousGroup',
            title: localize2('focusPreviousGroup', 'Focus Previous Editor Group'),
            f1: true,
            category: Categories.View
        }, { location: 3 /* GroupLocation.PREVIOUS */ });
    }
}
export class FocusLeftGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusLeftGroup',
            title: localize2('focusLeftGroup', 'Focus Left Editor Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 15 /* KeyCode.LeftArrow */)
            },
            category: Categories.View
        }, { direction: 2 /* GroupDirection.LEFT */ });
    }
}
export class FocusRightGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusRightGroup',
            title: localize2('focusRightGroup', 'Focus Right Editor Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */)
            },
            category: Categories.View
        }, { direction: 3 /* GroupDirection.RIGHT */ });
    }
}
export class FocusAboveGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusAboveGroup',
            title: localize2('focusAboveGroup', 'Focus Editor Group Above'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */)
            },
            category: Categories.View
        }, { direction: 0 /* GroupDirection.UP */ });
    }
}
export class FocusBelowGroup extends AbstractFocusGroupAction {
    constructor() {
        super({
            id: 'workbench.action.focusBelowGroup',
            title: localize2('focusBelowGroup', 'Focus Editor Group Below'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */)
            },
            category: Categories.View
        }, { direction: 1 /* GroupDirection.DOWN */ });
    }
}
let CloseEditorAction = class CloseEditorAction extends Action {
    static { this.ID = 'workbench.action.closeActiveEditor'; }
    static { this.LABEL = localize('closeEditor', "Close Editor"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(Codicon.close));
        this.commandService = commandService;
    }
    run(context) {
        return this.commandService.executeCommand(CLOSE_EDITOR_COMMAND_ID, undefined, context);
    }
};
CloseEditorAction = __decorate([
    __param(2, ICommandService)
], CloseEditorAction);
export { CloseEditorAction };
let UnpinEditorAction = class UnpinEditorAction extends Action {
    static { this.ID = 'workbench.action.unpinActiveEditor'; }
    static { this.LABEL = localize('unpinEditor', "Unpin Editor"); }
    constructor(id, label, commandService) {
        super(id, label, ThemeIcon.asClassName(Codicon.pinned));
        this.commandService = commandService;
    }
    run(context) {
        return this.commandService.executeCommand(UNPIN_EDITOR_COMMAND_ID, undefined, context);
    }
};
UnpinEditorAction = __decorate([
    __param(2, ICommandService)
], UnpinEditorAction);
export { UnpinEditorAction };
let CloseEditorTabAction = class CloseEditorTabAction extends Action {
    static { this.ID = 'workbench.action.closeActiveEditor'; }
    static { this.LABEL = localize('closeOneEditor', "Close"); }
    constructor(id, label, editorGroupService) {
        super(id, label, ThemeIcon.asClassName(Codicon.close));
        this.editorGroupService = editorGroupService;
    }
    async run(context) {
        const group = context ? this.editorGroupService.getGroup(context.groupId) : this.editorGroupService.activeGroup;
        if (!group) {
            // group mentioned in context does not exist
            return;
        }
        const targetEditor = context?.editorIndex !== undefined ? group.getEditorByIndex(context.editorIndex) : group.activeEditor;
        if (!targetEditor) {
            // No editor open or editor at index does not exist
            return;
        }
        const editors = [];
        if (group.isSelected(targetEditor)) {
            editors.push(...group.selectedEditors);
        }
        else {
            editors.push(targetEditor);
        }
        // Close specific editors in group
        for (const editor of editors) {
            await group.closeEditor(editor, { preserveFocus: context?.preserveFocus });
        }
    }
};
CloseEditorTabAction = __decorate([
    __param(2, IEditorGroupsService)
], CloseEditorTabAction);
export { CloseEditorTabAction };
export class RevertAndCloseEditorAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.revertAndCloseActiveEditor',
            title: localize2('revertAndCloseActiveEditor', 'Revert and Close Editor'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const logService = accessor.get(ILogService);
        const activeEditorPane = editorService.activeEditorPane;
        if (activeEditorPane) {
            const editor = activeEditorPane.input;
            const group = activeEditorPane.group;
            // first try a normal revert where the contents of the editor are restored
            try {
                await editorService.revert({ editor, groupId: group.id });
            }
            catch (error) {
                logService.error(error);
                // if that fails, since we are about to close the editor, we accept that
                // the editor cannot be reverted and instead do a soft revert that just
                // enables us to close the editor. With this, a user can always close a
                // dirty editor even when reverting fails.
                await editorService.revert({ editor, groupId: group.id }, { soft: true });
            }
            await group.closeEditor(editor);
        }
    }
}
export class CloseLeftEditorsInGroupAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.closeEditorsToTheLeft',
            title: localize2('closeEditorsToTheLeft', 'Close Editors to the Left in Group'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor, context) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const { group, editor } = this.getTarget(editorGroupService, context);
        if (group && editor) {
            await group.closeEditors({ direction: 0 /* CloseDirection.LEFT */, except: editor, excludeSticky: true });
        }
    }
    getTarget(editorGroupService, context) {
        if (context) {
            return { editor: context.editor, group: editorGroupService.getGroup(context.groupId) };
        }
        // Fallback to active group
        return { group: editorGroupService.activeGroup, editor: editorGroupService.activeGroup.activeEditor };
    }
}
class AbstractCloseAllAction extends Action2 {
    groupsToClose(editorGroupService) {
        const groupsToClose = [];
        // Close editors in reverse order of their grid appearance so that the editor
        // group that is the first (top-left) remains. This helps to keep view state
        // for editors around that have been opened in this visually first group.
        const groups = editorGroupService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */);
        for (let i = groups.length - 1; i >= 0; i--) {
            groupsToClose.push(groups[i]);
        }
        return groupsToClose;
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const logService = accessor.get(ILogService);
        const progressService = accessor.get(IProgressService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const filesConfigurationService = accessor.get(IFilesConfigurationService);
        const fileDialogService = accessor.get(IFileDialogService);
        // Depending on the editor and auto save configuration,
        // split editors into buckets for handling confirmation
        const dirtyEditorsWithDefaultConfirm = new Set();
        const dirtyAutoSaveOnFocusChangeEditors = new Set();
        const dirtyAutoSaveOnWindowChangeEditors = new Set();
        const editorsWithCustomConfirm = new Map();
        for (const { editor, groupId } of editorService.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: this.excludeSticky })) {
            let confirmClose = false;
            let handlerDidError = false;
            if (editor.closeHandler) {
                try {
                    confirmClose = editor.closeHandler.showConfirm(); // custom handling of confirmation on close
                }
                catch (error) {
                    logService.error(error);
                    handlerDidError = true;
                }
            }
            if (!editor.closeHandler || handlerDidError) {
                confirmClose = editor.isDirty() && !editor.isSaving(); // default confirm only when dirty and not saving
            }
            if (!confirmClose) {
                continue;
            }
            // Editor has custom confirm implementation
            if (typeof editor.closeHandler?.confirm === 'function') {
                let customEditorsToConfirm = editorsWithCustomConfirm.get(editor.typeId);
                if (!customEditorsToConfirm) {
                    customEditorsToConfirm = new Set();
                    editorsWithCustomConfirm.set(editor.typeId, customEditorsToConfirm);
                }
                customEditorsToConfirm.add({ editor, groupId });
            }
            // Editor will be saved on focus change when a
            // dialog appears, so just track that separate
            else if (!editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) && filesConfigurationService.getAutoSaveMode(editor).mode === 3 /* AutoSaveMode.ON_FOCUS_CHANGE */) {
                dirtyAutoSaveOnFocusChangeEditors.add({ editor, groupId });
            }
            // Windows, Linux: editor will be saved on window change
            // when a native dialog appears, so just track that separate
            // (see https://github.com/microsoft/vscode/issues/134250)
            else if ((isNative && (isWindows || isLinux)) && !editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) && filesConfigurationService.getAutoSaveMode(editor).mode === 4 /* AutoSaveMode.ON_WINDOW_CHANGE */) {
                dirtyAutoSaveOnWindowChangeEditors.add({ editor, groupId });
            }
            // Editor will show in generic file based dialog
            else {
                dirtyEditorsWithDefaultConfirm.add({ editor, groupId });
            }
        }
        // 1.) Show default file based dialog
        if (dirtyEditorsWithDefaultConfirm.size > 0) {
            const editors = Array.from(dirtyEditorsWithDefaultConfirm.values());
            await this.revealEditorsToConfirm(editors, editorGroupService); // help user make a decision by revealing editors
            const confirmation = await fileDialogService.showSaveConfirm(editors.map(({ editor }) => {
                if (editor instanceof SideBySideEditorInput) {
                    return editor.primary.getName(); // prefer shorter names by using primary's name in this case
                }
                return editor.getName();
            }));
            switch (confirmation) {
                case 2 /* ConfirmResult.CANCEL */:
                    return;
                case 1 /* ConfirmResult.DONT_SAVE */:
                    await this.revertEditors(editorService, logService, progressService, editors);
                    break;
                case 0 /* ConfirmResult.SAVE */:
                    await editorService.save(editors, { reason: 1 /* SaveReason.EXPLICIT */ });
                    break;
            }
        }
        // 2.) Show custom confirm based dialog
        for (const [, editorIdentifiers] of editorsWithCustomConfirm) {
            const editors = Array.from(editorIdentifiers.values());
            await this.revealEditorsToConfirm(editors, editorGroupService); // help user make a decision by revealing editors
            const confirmation = await editors.at(0)?.editor.closeHandler?.confirm?.(editors);
            if (typeof confirmation === 'number') {
                switch (confirmation) {
                    case 2 /* ConfirmResult.CANCEL */:
                        return;
                    case 1 /* ConfirmResult.DONT_SAVE */:
                        await this.revertEditors(editorService, logService, progressService, editors);
                        break;
                    case 0 /* ConfirmResult.SAVE */:
                        await editorService.save(editors, { reason: 1 /* SaveReason.EXPLICIT */ });
                        break;
                }
            }
        }
        // 3.) Save autosaveable editors (focus change)
        if (dirtyAutoSaveOnFocusChangeEditors.size > 0) {
            const editors = Array.from(dirtyAutoSaveOnFocusChangeEditors.values());
            await editorService.save(editors, { reason: 3 /* SaveReason.FOCUS_CHANGE */ });
        }
        // 4.) Save autosaveable editors (window change)
        if (dirtyAutoSaveOnWindowChangeEditors.size > 0) {
            const editors = Array.from(dirtyAutoSaveOnWindowChangeEditors.values());
            await editorService.save(editors, { reason: 4 /* SaveReason.WINDOW_CHANGE */ });
        }
        // 5.) Finally close all editors: even if an editor failed to
        // save or revert and still reports dirty, the editor part makes
        // sure to bring up another confirm dialog for those editors
        // specifically.
        return this.doCloseAll(editorGroupService);
    }
    revertEditors(editorService, logService, progressService, editors) {
        return progressService.withProgress({
            location: 10 /* ProgressLocation.Window */, // use window progress to not be too annoying about this operation
            delay: 800, // delay so that it only appears when operation takes a long time
            title: localize('reverting', "Reverting Editors..."),
        }, () => this.doRevertEditors(editorService, logService, editors));
    }
    async doRevertEditors(editorService, logService, editors) {
        try {
            // We first attempt to revert all editors with `soft: false`, to ensure that
            // working copies revert to their state on disk. Even though we close editors,
            // it is possible that other parties hold a reference to the working copy
            // and expect it to be in a certain state after the editor is closed without
            // saving.
            await editorService.revert(editors);
        }
        catch (error) {
            logService.error(error);
            // if that fails, since we are about to close the editor, we accept that
            // the editor cannot be reverted and instead do a soft revert that just
            // enables us to close the editor. With this, a user can always close a
            // dirty editor even when reverting fails.
            await editorService.revert(editors, { soft: true });
        }
    }
    async revealEditorsToConfirm(editors, editorGroupService) {
        try {
            const handledGroups = new Set();
            for (const { editor, groupId } of editors) {
                if (handledGroups.has(groupId)) {
                    continue;
                }
                handledGroups.add(groupId);
                const group = editorGroupService.getGroup(groupId);
                await group?.openEditor(editor);
            }
        }
        catch (error) {
            // ignore any error as the revealing is just convinience
        }
    }
    async doCloseAll(editorGroupService) {
        await Promise.all(this.groupsToClose(editorGroupService).map(group => group.closeAllEditors({ excludeSticky: this.excludeSticky })));
    }
}
export class CloseAllEditorsAction extends AbstractCloseAllAction {
    static { this.ID = 'workbench.action.closeAllEditors'; }
    static { this.LABEL = localize2('closeAllEditors', 'Close All Editors'); }
    constructor() {
        super({
            id: CloseAllEditorsAction.ID,
            title: CloseAllEditorsAction.LABEL,
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */)
            },
            icon: Codicon.closeAll,
            category: Categories.View
        });
    }
    get excludeSticky() {
        return true; // exclude sticky from this mass-closing operation
    }
}
export class CloseAllEditorGroupsAction extends AbstractCloseAllAction {
    constructor() {
        super({
            id: 'workbench.action.closeAllGroups',
            title: localize2('closeAllGroups', 'Close All Editor Groups'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 53 /* KeyCode.KeyW */)
            },
            category: Categories.View
        });
    }
    get excludeSticky() {
        return false; // the intent to close groups means, even sticky are included
    }
    async doCloseAll(editorGroupService) {
        await super.doCloseAll(editorGroupService);
        for (const groupToClose of this.groupsToClose(editorGroupService)) {
            editorGroupService.removeGroup(groupToClose);
        }
    }
}
export class CloseEditorsInOtherGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.closeEditorsInOtherGroups',
            title: localize2('closeEditorsInOtherGroups', 'Close Editors in Other Groups'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor, context) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const groupToSkip = context ? editorGroupService.getGroup(context.groupId) : editorGroupService.activeGroup;
        await Promise.all(editorGroupService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */).map(async (group) => {
            if (groupToSkip && group.id === groupToSkip.id) {
                return;
            }
            return group.closeAllEditors({ excludeSticky: true });
        }));
    }
}
export class CloseEditorInAllGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.closeEditorInAllGroups',
            title: localize2('closeEditorInAllGroups', 'Close Editor in All Groups'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const activeEditor = editorService.activeEditor;
        if (activeEditor) {
            await Promise.all(editorGroupService.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */).map(group => group.closeEditor(activeEditor)));
        }
    }
}
class AbstractMoveCopyGroupAction extends Action2 {
    constructor(desc, direction, isMove) {
        super(desc);
        this.direction = direction;
        this.isMove = isMove;
    }
    async run(accessor, context) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        let sourceGroup;
        if (context && typeof context.groupId === 'number') {
            sourceGroup = editorGroupService.getGroup(context.groupId);
        }
        else {
            sourceGroup = editorGroupService.activeGroup;
        }
        if (sourceGroup) {
            let resultGroup = undefined;
            if (this.isMove) {
                const targetGroup = this.findTargetGroup(editorGroupService, sourceGroup);
                if (targetGroup) {
                    resultGroup = editorGroupService.moveGroup(sourceGroup, targetGroup, this.direction);
                }
            }
            else {
                resultGroup = editorGroupService.copyGroup(sourceGroup, sourceGroup, this.direction);
            }
            if (resultGroup) {
                editorGroupService.activateGroup(resultGroup);
            }
        }
    }
    findTargetGroup(editorGroupService, sourceGroup) {
        const targetNeighbours = [this.direction];
        // Allow the target group to be in alternative locations to support more
        // scenarios of moving the group to the taret location.
        // Helps for https://github.com/microsoft/vscode/issues/50741
        switch (this.direction) {
            case 2 /* GroupDirection.LEFT */:
            case 3 /* GroupDirection.RIGHT */:
                targetNeighbours.push(0 /* GroupDirection.UP */, 1 /* GroupDirection.DOWN */);
                break;
            case 0 /* GroupDirection.UP */:
            case 1 /* GroupDirection.DOWN */:
                targetNeighbours.push(2 /* GroupDirection.LEFT */, 3 /* GroupDirection.RIGHT */);
                break;
        }
        for (const targetNeighbour of targetNeighbours) {
            const targetNeighbourGroup = editorGroupService.findGroup({ direction: targetNeighbour }, sourceGroup);
            if (targetNeighbourGroup) {
                return targetNeighbourGroup;
            }
        }
        return undefined;
    }
}
class AbstractMoveGroupAction extends AbstractMoveCopyGroupAction {
    constructor(desc, direction) {
        super(desc, direction, true);
    }
}
export class MoveGroupLeftAction extends AbstractMoveGroupAction {
    constructor() {
        super({
            id: 'workbench.action.moveActiveEditorGroupLeft',
            title: localize2('moveActiveGroupLeft', 'Move Editor Group Left'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 15 /* KeyCode.LeftArrow */)
            },
            category: Categories.View
        }, 2 /* GroupDirection.LEFT */);
    }
}
export class MoveGroupRightAction extends AbstractMoveGroupAction {
    constructor() {
        super({
            id: 'workbench.action.moveActiveEditorGroupRight',
            title: localize2('moveActiveGroupRight', 'Move Editor Group Right'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 17 /* KeyCode.RightArrow */)
            },
            category: Categories.View
        }, 3 /* GroupDirection.RIGHT */);
    }
}
export class MoveGroupUpAction extends AbstractMoveGroupAction {
    constructor() {
        super({
            id: 'workbench.action.moveActiveEditorGroupUp',
            title: localize2('moveActiveGroupUp', 'Move Editor Group Up'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 16 /* KeyCode.UpArrow */)
            },
            category: Categories.View
        }, 0 /* GroupDirection.UP */);
    }
}
export class MoveGroupDownAction extends AbstractMoveGroupAction {
    constructor() {
        super({
            id: 'workbench.action.moveActiveEditorGroupDown',
            title: localize2('moveActiveGroupDown', 'Move Editor Group Down'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 18 /* KeyCode.DownArrow */)
            },
            category: Categories.View
        }, 1 /* GroupDirection.DOWN */);
    }
}
class AbstractDuplicateGroupAction extends AbstractMoveCopyGroupAction {
    constructor(desc, direction) {
        super(desc, direction, false);
    }
}
export class DuplicateGroupLeftAction extends AbstractDuplicateGroupAction {
    constructor() {
        super({
            id: 'workbench.action.duplicateActiveEditorGroupLeft',
            title: localize2('duplicateActiveGroupLeft', 'Duplicate Editor Group Left'),
            f1: true,
            category: Categories.View
        }, 2 /* GroupDirection.LEFT */);
    }
}
export class DuplicateGroupRightAction extends AbstractDuplicateGroupAction {
    constructor() {
        super({
            id: 'workbench.action.duplicateActiveEditorGroupRight',
            title: localize2('duplicateActiveGroupRight', 'Duplicate Editor Group Right'),
            f1: true,
            category: Categories.View
        }, 3 /* GroupDirection.RIGHT */);
    }
}
export class DuplicateGroupUpAction extends AbstractDuplicateGroupAction {
    constructor() {
        super({
            id: 'workbench.action.duplicateActiveEditorGroupUp',
            title: localize2('duplicateActiveGroupUp', 'Duplicate Editor Group Up'),
            f1: true,
            category: Categories.View
        }, 0 /* GroupDirection.UP */);
    }
}
export class DuplicateGroupDownAction extends AbstractDuplicateGroupAction {
    constructor() {
        super({
            id: 'workbench.action.duplicateActiveEditorGroupDown',
            title: localize2('duplicateActiveGroupDown', 'Duplicate Editor Group Down'),
            f1: true,
            category: Categories.View
        }, 1 /* GroupDirection.DOWN */);
    }
}
export class MinimizeOtherGroupsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.minimizeOtherEditors',
            title: localize2('minimizeOtherEditorGroups', 'Expand Editor Group'),
            f1: true,
            category: Categories.View,
            precondition: MultipleEditorGroupsContext
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.arrangeGroups(1 /* GroupsArrangement.EXPAND */);
    }
}
export class MinimizeOtherGroupsHideSidebarAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.minimizeOtherEditorsHideSidebar',
            title: localize2('minimizeOtherEditorGroupsHideSidebar', 'Expand Editor Group and Hide Side Bars'),
            f1: true,
            category: Categories.View,
            precondition: ContextKeyExpr.or(MultipleEditorGroupsContext, SideBarVisibleContext, AuxiliaryBarVisibleContext)
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const layoutService = accessor.get(IWorkbenchLayoutService);
        layoutService.setPartHidden(true, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
        layoutService.setPartHidden(true, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        editorGroupService.arrangeGroups(1 /* GroupsArrangement.EXPAND */);
    }
}
export class ResetGroupSizesAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.evenEditorWidths',
            title: localize2('evenEditorGroups', 'Reset Editor Group Sizes'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.arrangeGroups(2 /* GroupsArrangement.EVEN */);
    }
}
export class ToggleGroupSizesAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleEditorWidths',
            title: localize2('toggleEditorWidths', 'Toggle Editor Group Sizes'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.toggleExpandGroup();
    }
}
export class MaximizeGroupHideSidebarAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.maximizeEditorHideSidebar',
            title: localize2('maximizeEditorHideSidebar', 'Maximize Editor Group and Hide Side Bars'),
            f1: true,
            category: Categories.View,
            precondition: ContextKeyExpr.or(ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext), SideBarVisibleContext, AuxiliaryBarVisibleContext)
        });
    }
    async run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        if (editorService.activeEditor) {
            layoutService.setPartHidden(true, "workbench.parts.sidebar" /* Parts.SIDEBAR_PART */);
            layoutService.setPartHidden(true, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
            editorGroupService.arrangeGroups(0 /* GroupsArrangement.MAXIMIZE */);
        }
    }
}
export class ToggleMaximizeEditorGroupAction extends Action2 {
    constructor() {
        super({
            id: TOGGLE_MAXIMIZE_EDITOR_GROUP,
            title: localize2('toggleMaximizeEditorGroup', 'Toggle Maximize Editor Group'),
            f1: true,
            category: Categories.View,
            precondition: ContextKeyExpr.or(EditorPartMultipleEditorGroupsContext, EditorPartMaximizedEditorGroupContext),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 43 /* KeyCode.KeyM */),
            },
            menu: [{
                    id: MenuId.EditorTitle,
                    order: -10000, // towards the front
                    group: 'navigation',
                    when: EditorPartMaximizedEditorGroupContext
                },
                {
                    id: MenuId.EmptyEditorGroup,
                    order: -10000, // towards the front
                    group: 'navigation',
                    when: EditorPartMaximizedEditorGroupContext
                }],
            icon: Codicon.screenFull,
            toggled: {
                condition: EditorPartMaximizedEditorGroupContext,
                title: localize('unmaximizeGroup', "Unmaximize Group")
            },
        });
    }
    async run(accessor, ...args) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        const listService = accessor.get(IListService);
        const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
        if (resolvedContext.groupedEditors.length) {
            editorGroupsService.toggleMaximizeGroup(resolvedContext.groupedEditors[0].group);
        }
    }
}
class AbstractNavigateEditorAction extends Action2 {
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const result = this.navigate(editorGroupService);
        if (!result) {
            return;
        }
        const { groupId, editor } = result;
        if (!editor) {
            return;
        }
        const group = editorGroupService.getGroup(groupId);
        if (group) {
            await group.openEditor(editor);
        }
    }
}
export class OpenNextEditor extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.nextEditor',
            title: localize2('openNextEditor', 'Open Next Editor'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 12 /* KeyCode.PageDown */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */]
                }
            },
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        // Navigate in active group if possible
        const activeGroup = editorGroupService.activeGroup;
        const activeGroupEditors = activeGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
        if (activeEditorIndex + 1 < activeGroupEditors.length) {
            return { editor: activeGroupEditors[activeEditorIndex + 1], groupId: activeGroup.id };
        }
        // Otherwise try in next group that has editors
        const handledGroups = new Set();
        let currentGroup = editorGroupService.activeGroup;
        while (currentGroup && !handledGroups.has(currentGroup.id)) {
            currentGroup = editorGroupService.findGroup({ location: 2 /* GroupLocation.NEXT */ }, currentGroup, true);
            if (currentGroup) {
                handledGroups.add(currentGroup.id);
                const groupEditors = currentGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
                if (groupEditors.length > 0) {
                    return { editor: groupEditors[0], groupId: currentGroup.id };
                }
            }
        }
        return undefined;
    }
}
export class OpenPreviousEditor extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.previousEditor',
            title: localize2('openPreviousEditor', 'Open Previous Editor'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 11 /* KeyCode.PageUp */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 92 /* KeyCode.BracketLeft */]
                }
            },
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        // Navigate in active group if possible
        const activeGroup = editorGroupService.activeGroup;
        const activeGroupEditors = activeGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        const activeEditorIndex = activeGroup.activeEditor ? activeGroupEditors.indexOf(activeGroup.activeEditor) : -1;
        if (activeEditorIndex > 0) {
            return { editor: activeGroupEditors[activeEditorIndex - 1], groupId: activeGroup.id };
        }
        // Otherwise try in previous group that has editors
        const handledGroups = new Set();
        let currentGroup = editorGroupService.activeGroup;
        while (currentGroup && !handledGroups.has(currentGroup.id)) {
            currentGroup = editorGroupService.findGroup({ location: 3 /* GroupLocation.PREVIOUS */ }, currentGroup, true);
            if (currentGroup) {
                handledGroups.add(currentGroup.id);
                const groupEditors = currentGroup.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
                if (groupEditors.length > 0) {
                    return { editor: groupEditors[groupEditors.length - 1], groupId: currentGroup.id };
                }
            }
        }
        return undefined;
    }
}
export class OpenNextEditorInGroup extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.nextEditorInGroup',
            title: localize2('nextEditorInGroup', 'Open Next Editor in Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 12 /* KeyCode.PageDown */),
                mac: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */)
                }
            },
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        const group = editorGroupService.activeGroup;
        const editors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;
        return { editor: index + 1 < editors.length ? editors[index + 1] : editors[0], groupId: group.id };
    }
}
export class OpenPreviousEditorInGroup extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.previousEditorInGroup',
            title: localize2('openPreviousEditorInGroup', 'Open Previous Editor in Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 11 /* KeyCode.PageUp */),
                mac: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */)
                }
            },
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        const group = editorGroupService.activeGroup;
        const editors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        const index = group.activeEditor ? editors.indexOf(group.activeEditor) : -1;
        return { editor: index > 0 ? editors[index - 1] : editors[editors.length - 1], groupId: group.id };
    }
}
export class OpenFirstEditorInGroup extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.firstEditorInGroup',
            title: localize2('firstEditorInGroup', 'Open First Editor in Group'),
            f1: true,
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        const group = editorGroupService.activeGroup;
        const editors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        return { editor: editors[0], groupId: group.id };
    }
}
export class OpenLastEditorInGroup extends AbstractNavigateEditorAction {
    constructor() {
        super({
            id: 'workbench.action.lastEditorInGroup',
            title: localize2('lastEditorInGroup', 'Open Last Editor in Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 512 /* KeyMod.Alt */ | 21 /* KeyCode.Digit0 */,
                secondary: [2048 /* KeyMod.CtrlCmd */ | 30 /* KeyCode.Digit9 */],
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 21 /* KeyCode.Digit0 */,
                    secondary: [2048 /* KeyMod.CtrlCmd */ | 30 /* KeyCode.Digit9 */]
                }
            },
            category: Categories.View
        });
    }
    navigate(editorGroupService) {
        const group = editorGroupService.activeGroup;
        const editors = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
        return { editor: editors[editors.length - 1], groupId: group.id };
    }
}
export class NavigateForwardAction extends Action2 {
    static { this.ID = 'workbench.action.navigateForward'; }
    static { this.LABEL = localize('navigateForward', "Go Forward"); }
    constructor() {
        super({
            id: NavigateForwardAction.ID,
            title: {
                ...localize2('navigateForward', "Go Forward"),
                mnemonicTitle: localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward")
            },
            f1: true,
            icon: Codicon.arrowRight,
            precondition: ContextKeyExpr.has('canNavigateForward'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                win: { primary: 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */, secondary: [123 /* KeyCode.BrowserForward */] },
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 88 /* KeyCode.Minus */, secondary: [123 /* KeyCode.BrowserForward */] },
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 88 /* KeyCode.Minus */, secondary: [123 /* KeyCode.BrowserForward */] }
            },
            menu: [
                { id: MenuId.MenubarGoMenu, group: '1_history_nav', order: 2 },
                { id: MenuId.CommandCenter, order: 2, when: ContextKeyExpr.has('config.workbench.navigationControl.enabled') }
            ]
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goForward(0 /* GoFilter.NONE */);
    }
}
export class NavigateBackwardsAction extends Action2 {
    static { this.ID = 'workbench.action.navigateBack'; }
    static { this.LABEL = localize('navigateBack', "Go Back"); }
    constructor() {
        super({
            id: NavigateBackwardsAction.ID,
            title: {
                ...localize2('navigateBack', "Go Back"),
                mnemonicTitle: localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back")
            },
            f1: true,
            precondition: ContextKeyExpr.has('canNavigateBack'),
            icon: Codicon.arrowLeft,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                win: { primary: 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */, secondary: [122 /* KeyCode.BrowserBack */] },
                mac: { primary: 256 /* KeyMod.WinCtrl */ | 88 /* KeyCode.Minus */, secondary: [122 /* KeyCode.BrowserBack */] },
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 88 /* KeyCode.Minus */, secondary: [122 /* KeyCode.BrowserBack */] }
            },
            menu: [
                { id: MenuId.MenubarGoMenu, group: '1_history_nav', order: 1 },
                { id: MenuId.CommandCenter, order: 1, when: ContextKeyExpr.has('config.workbench.navigationControl.enabled') }
            ]
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goBack(0 /* GoFilter.NONE */);
    }
}
export class NavigatePreviousAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateLast',
            title: localize2('navigatePrevious', 'Go Previous'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goPrevious(0 /* GoFilter.NONE */);
    }
}
export class NavigateForwardInEditsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateForwardInEditLocations',
            title: localize2('navigateForwardInEdits', 'Go Forward in Edit Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goForward(1 /* GoFilter.EDITS */);
    }
}
export class NavigateBackwardsInEditsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateBackInEditLocations',
            title: localize2('navigateBackInEdits', 'Go Back in Edit Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goBack(1 /* GoFilter.EDITS */);
    }
}
export class NavigatePreviousInEditsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigatePreviousInEditLocations',
            title: localize2('navigatePreviousInEdits', 'Go Previous in Edit Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goPrevious(1 /* GoFilter.EDITS */);
    }
}
export class NavigateToLastEditLocationAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateToLastEditLocation',
            title: localize2('navigateToLastEditLocation', 'Go to Last Edit Location'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 47 /* KeyCode.KeyQ */)
            }
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goLast(1 /* GoFilter.EDITS */);
    }
}
export class NavigateForwardInNavigationsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateForwardInNavigationLocations',
            title: localize2('navigateForwardInNavigations', 'Go Forward in Navigation Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goForward(2 /* GoFilter.NAVIGATION */);
    }
}
export class NavigateBackwardsInNavigationsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateBackInNavigationLocations',
            title: localize2('navigateBackInNavigations', 'Go Back in Navigation Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goBack(2 /* GoFilter.NAVIGATION */);
    }
}
export class NavigatePreviousInNavigationsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigatePreviousInNavigationLocations',
            title: localize2('navigatePreviousInNavigationLocations', 'Go Previous in Navigation Locations'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goPrevious(2 /* GoFilter.NAVIGATION */);
    }
}
export class NavigateToLastNavigationLocationAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.navigateToLastNavigationLocation',
            title: localize2('navigateToLastNavigationLocation', 'Go to Last Navigation Location'),
            f1: true
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.goLast(2 /* GoFilter.NAVIGATION */);
    }
}
export class ReopenClosedEditorAction extends Action2 {
    static { this.ID = 'workbench.action.reopenClosedEditor'; }
    constructor() {
        super({
            id: ReopenClosedEditorAction.ID,
            title: localize2('reopenClosedEditor', 'Reopen Closed Editor'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 50 /* KeyCode.KeyT */
            },
            category: Categories.View
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        await historyService.reopenLastClosedEditor();
    }
}
export class ClearRecentFilesAction extends Action2 {
    static { this.ID = 'workbench.action.clearRecentFiles'; }
    constructor() {
        super({
            id: ClearRecentFilesAction.ID,
            title: localize2('clearRecentFiles', 'Clear Recently Opened...'),
            f1: true,
            category: Categories.File
        });
    }
    async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const workspacesService = accessor.get(IWorkspacesService);
        const historyService = accessor.get(IHistoryService);
        // Ask for confirmation
        const { confirmed } = await dialogService.confirm({
            type: 'warning',
            message: localize('confirmClearRecentsMessage', "Do you want to clear all recently opened files and workspaces?"),
            detail: localize('confirmClearDetail', "This action is irreversible!"),
            primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
        });
        if (!confirmed) {
            return;
        }
        // Clear global recently opened
        workspacesService.clearRecentlyOpened();
        // Clear workspace specific recently opened
        historyService.clearRecentlyOpened();
    }
}
export class ShowEditorsInActiveGroupByMostRecentlyUsedAction extends Action2 {
    static { this.ID = 'workbench.action.showEditorsInActiveGroup'; }
    constructor() {
        super({
            id: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID,
            title: localize2('showEditorsInActiveGroup', 'Show Editors in Active Group By Most Recently Used'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
    }
}
export class ShowAllEditorsByAppearanceAction extends Action2 {
    static { this.ID = 'workbench.action.showAllEditors'; }
    constructor() {
        super({
            id: ShowAllEditorsByAppearanceAction.ID,
            title: localize2('showAllEditors', 'Show All Editors By Appearance'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 46 /* KeyCode.KeyP */),
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 2 /* KeyCode.Tab */
                }
            },
            category: Categories.File
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.quickAccess.show(AllEditorsByAppearanceQuickAccess.PREFIX);
    }
}
export class ShowAllEditorsByMostRecentlyUsedAction extends Action2 {
    static { this.ID = 'workbench.action.showAllEditorsByMostRecentlyUsed'; }
    constructor() {
        super({
            id: ShowAllEditorsByMostRecentlyUsedAction.ID,
            title: localize2('showAllEditorsByMostRecentlyUsed', 'Show All Editors By Most Recently Used'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const quickInputService = accessor.get(IQuickInputService);
        quickInputService.quickAccess.show(AllEditorsByMostRecentlyUsedQuickAccess.PREFIX);
    }
}
class AbstractQuickAccessEditorAction extends Action2 {
    constructor(desc, prefix, itemActivation) {
        super(desc);
        this.prefix = prefix;
        this.itemActivation = itemActivation;
    }
    async run(accessor) {
        const keybindingService = accessor.get(IKeybindingService);
        const quickInputService = accessor.get(IQuickInputService);
        const keybindings = keybindingService.lookupKeybindings(this.desc.id);
        quickInputService.quickAccess.show(this.prefix, {
            quickNavigateConfiguration: { keybindings },
            itemActivation: this.itemActivation
        });
    }
}
export class QuickAccessPreviousRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {
    constructor() {
        super({
            id: 'workbench.action.quickOpenPreviousRecentlyUsedEditor',
            title: localize2('quickOpenPreviousRecentlyUsedEditor', 'Quick Open Previous Recently Used Editor'),
            f1: true,
            category: Categories.View
        }, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
    }
}
export class QuickAccessLeastRecentlyUsedEditorAction extends AbstractQuickAccessEditorAction {
    constructor() {
        super({
            id: 'workbench.action.quickOpenLeastRecentlyUsedEditor',
            title: localize2('quickOpenLeastRecentlyUsedEditor', 'Quick Open Least Recently Used Editor'),
            f1: true,
            category: Categories.View
        }, AllEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
    }
}
export class QuickAccessPreviousRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {
    constructor() {
        super({
            id: 'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
            title: localize2('quickOpenPreviousRecentlyUsedEditorInGroup', 'Quick Open Previous Recently Used Editor in Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 2 /* KeyCode.Tab */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 2 /* KeyCode.Tab */
                }
            },
            precondition: ActiveEditorGroupEmptyContext.toNegated(),
            category: Categories.View
        }, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, undefined);
    }
}
export class QuickAccessLeastRecentlyUsedEditorInGroupAction extends AbstractQuickAccessEditorAction {
    constructor() {
        super({
            id: 'workbench.action.quickOpenLeastRecentlyUsedEditorInGroup',
            title: localize2('quickOpenLeastRecentlyUsedEditorInGroup', 'Quick Open Least Recently Used Editor in Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */
                }
            },
            precondition: ActiveEditorGroupEmptyContext.toNegated(),
            category: Categories.View
        }, ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX, ItemActivation.LAST);
    }
}
export class QuickAccessPreviousEditorFromHistoryAction extends Action2 {
    static { this.ID = 'workbench.action.openPreviousEditorFromHistory'; }
    constructor() {
        super({
            id: QuickAccessPreviousEditorFromHistoryAction.ID,
            title: localize2('navigateEditorHistoryByInput', 'Quick Open Previous Editor from History'),
            f1: true
        });
    }
    async run(accessor) {
        const keybindingService = accessor.get(IKeybindingService);
        const quickInputService = accessor.get(IQuickInputService);
        const editorGroupService = accessor.get(IEditorGroupsService);
        const keybindings = keybindingService.lookupKeybindings(QuickAccessPreviousEditorFromHistoryAction.ID);
        // Enforce to activate the first item in quick access if
        // the currently active editor group has n editor opened
        let itemActivation = undefined;
        if (editorGroupService.activeGroup.count === 0) {
            itemActivation = ItemActivation.FIRST;
        }
        quickInputService.quickAccess.show('', { quickNavigateConfiguration: { keybindings }, itemActivation });
    }
}
export class OpenNextRecentlyUsedEditorAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openNextRecentlyUsedEditor',
            title: localize2('openNextRecentlyUsedEditor', 'Open Next Recently Used Editor'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        historyService.openNextRecentlyUsedEditor();
    }
}
export class OpenPreviousRecentlyUsedEditorAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openPreviousRecentlyUsedEditor',
            title: localize2('openPreviousRecentlyUsedEditor', 'Open Previous Recently Used Editor'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        historyService.openPreviouslyUsedEditor();
    }
}
export class OpenNextRecentlyUsedEditorInGroupAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
            title: localize2('openNextRecentlyUsedEditorInGroup', 'Open Next Recently Used Editor In Group'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        historyService.openNextRecentlyUsedEditor(editorGroupsService.activeGroup.id);
    }
}
export class OpenPreviousRecentlyUsedEditorInGroupAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
            title: localize2('openPreviousRecentlyUsedEditorInGroup', 'Open Previous Recently Used Editor In Group'),
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        historyService.openPreviouslyUsedEditor(editorGroupsService.activeGroup.id);
    }
}
export class ClearEditorHistoryWithoutConfirmAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.clearEditorHistoryWithoutConfirm',
            title: localize2('clearEditorHistoryWithoutConfirm', 'Clear Editor History without Confirmation'),
            f1: true,
            precondition: InAutomationContext
        });
    }
    async run(accessor) {
        const historyService = accessor.get(IHistoryService);
        // Clear editor history
        historyService.clear();
    }
}
export class ClearEditorHistoryAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.clearEditorHistory',
            title: localize2('clearEditorHistory', 'Clear Editor History'),
            f1: true
        });
    }
    async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const historyService = accessor.get(IHistoryService);
        // Ask for confirmation
        const { confirmed } = await dialogService.confirm({
            type: 'warning',
            message: localize('confirmClearEditorHistoryMessage', "Do you want to clear the history of recently opened editors?"),
            detail: localize('confirmClearDetail', "This action is irreversible!"),
            primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
        });
        if (!confirmed) {
            return;
        }
        // Clear editor history
        historyService.clear();
    }
}
export class MoveEditorLeftInGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorLeftInGroup',
            title: localize2('moveEditorLeft', 'Move Editor Left'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 11 /* KeyCode.PageUp */,
                mac: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 15 /* KeyCode.LeftArrow */)
                }
            },
            f1: true,
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'left' });
    }
}
export class MoveEditorRightInGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorRightInGroup',
            title: localize2('moveEditorRight', 'Move Editor Right'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 12 /* KeyCode.PageDown */,
                mac: {
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 17 /* KeyCode.RightArrow */)
                }
            },
            f1: true,
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'right' });
    }
}
export class MoveEditorToStartAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToStart',
            title: localize2('moveEditorToStart', 'Move Editor to Start'),
            f1: true,
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'first' });
    }
}
export class MoveEditorToEndAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToEnd',
            title: localize2('moveEditorToEnd', 'Move Editor to End'),
            f1: true,
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'last' });
    }
}
export class MoveEditorToPreviousGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToPreviousGroup',
            title: localize2('moveEditorToPreviousGroup', 'Move Editor into Previous Group'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 15 /* KeyCode.LeftArrow */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 15 /* KeyCode.LeftArrow */
                }
            },
            f1: true,
            category: Categories.View,
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' });
    }
}
export class MoveEditorToNextGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToNextGroup',
            title: localize2('moveEditorToNextGroup', 'Move Editor into Next Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 17 /* KeyCode.RightArrow */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 17 /* KeyCode.RightArrow */
                }
            },
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' });
    }
}
export class MoveEditorToAboveGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: MOVE_EDITOR_INTO_ABOVE_GROUP,
            title: localize2('moveEditorToAboveGroup', 'Move Editor into Group Above'),
            f1: true,
            category: Categories.View
        }, MOVE_EDITOR_INTO_ABOVE_GROUP);
    }
}
export class MoveEditorToBelowGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: MOVE_EDITOR_INTO_BELOW_GROUP,
            title: localize2('moveEditorToBelowGroup', 'Move Editor into Group Below'),
            f1: true,
            category: Categories.View
        }, MOVE_EDITOR_INTO_BELOW_GROUP);
    }
}
export class MoveEditorToLeftGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: MOVE_EDITOR_INTO_LEFT_GROUP,
            title: localize2('moveEditorToLeftGroup', 'Move Editor into Left Group'),
            f1: true,
            category: Categories.View
        }, MOVE_EDITOR_INTO_LEFT_GROUP);
    }
}
export class MoveEditorToRightGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: MOVE_EDITOR_INTO_RIGHT_GROUP,
            title: localize2('moveEditorToRightGroup', 'Move Editor into Right Group'),
            f1: true,
            category: Categories.View
        }, MOVE_EDITOR_INTO_RIGHT_GROUP);
    }
}
export class MoveEditorToFirstGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToFirstGroup',
            title: localize2('moveEditorToFirstGroup', 'Move Editor into First Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 22 /* KeyCode.Digit1 */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 22 /* KeyCode.Digit1 */
                }
            },
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' });
    }
}
export class MoveEditorToLastGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.moveEditorToLastGroup',
            title: localize2('moveEditorToLastGroup', 'Move Editor into Last Group'),
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 30 /* KeyCode.Digit9 */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 30 /* KeyCode.Digit9 */
                }
            },
            category: Categories.View
        }, MOVE_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' });
    }
}
export class SplitEditorToPreviousGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToPreviousGroup',
            title: localize2('splitEditorToPreviousGroup', 'Split Editor into Previous Group'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'previous', by: 'group' });
    }
}
export class SplitEditorToNextGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToNextGroup',
            title: localize2('splitEditorToNextGroup', 'Split Editor into Next Group'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'next', by: 'group' });
    }
}
export class SplitEditorToAboveGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToAboveGroup',
            title: localize2('splitEditorToAboveGroup', 'Split Editor into Group Above'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'up', by: 'group' });
    }
}
export class SplitEditorToBelowGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToBelowGroup',
            title: localize2('splitEditorToBelowGroup', 'Split Editor into Group Below'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'down', by: 'group' });
    }
}
export class SplitEditorToLeftGroupAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.splitEditorToLeftGroup'; }
    static { this.LABEL = localize('splitEditorToLeftGroup', "Split Editor into Left Group"); }
    constructor() {
        super({
            id: 'workbench.action.splitEditorToLeftGroup',
            title: localize2('splitEditorToLeftGroup', "Split Editor into Left Group"),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'left', by: 'group' });
    }
}
export class SplitEditorToRightGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToRightGroup',
            title: localize2('splitEditorToRightGroup', 'Split Editor into Right Group'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'right', by: 'group' });
    }
}
export class SplitEditorToFirstGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToFirstGroup',
            title: localize2('splitEditorToFirstGroup', 'Split Editor into First Group'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'first', by: 'group' });
    }
}
export class SplitEditorToLastGroupAction extends ExecuteCommandAction {
    constructor() {
        super({
            id: 'workbench.action.splitEditorToLastGroup',
            title: localize2('splitEditorToLastGroup', 'Split Editor into Last Group'),
            f1: true,
            category: Categories.View
        }, COPY_ACTIVE_EDITOR_COMMAND_ID, { to: 'last', by: 'group' });
    }
}
export class EditorLayoutSingleAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutSingle'; }
    constructor() {
        super({
            id: EditorLayoutSingleAction.ID,
            title: localize2('editorLayoutSingle', 'Single Column Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}], orientation: 0 /* GroupOrientation.HORIZONTAL */ });
    }
}
export class EditorLayoutTwoColumnsAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutTwoColumns'; }
    constructor() {
        super({
            id: EditorLayoutTwoColumnsAction.ID,
            title: localize2('editorLayoutTwoColumns', 'Two Columns Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: 0 /* GroupOrientation.HORIZONTAL */ });
    }
}
export class EditorLayoutThreeColumnsAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutThreeColumns'; }
    constructor() {
        super({
            id: EditorLayoutThreeColumnsAction.ID,
            title: localize2('editorLayoutThreeColumns', 'Three Columns Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: 0 /* GroupOrientation.HORIZONTAL */ });
    }
}
export class EditorLayoutTwoRowsAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutTwoRows'; }
    constructor() {
        super({
            id: EditorLayoutTwoRowsAction.ID,
            title: localize2('editorLayoutTwoRows', 'Two Rows Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}], orientation: 1 /* GroupOrientation.VERTICAL */ });
    }
}
export class EditorLayoutThreeRowsAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutThreeRows'; }
    constructor() {
        super({
            id: EditorLayoutThreeRowsAction.ID,
            title: localize2('editorLayoutThreeRows', 'Three Rows Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, {}, {}], orientation: 1 /* GroupOrientation.VERTICAL */ });
    }
}
export class EditorLayoutTwoByTwoGridAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutTwoByTwoGrid'; }
    constructor() {
        super({
            id: EditorLayoutTwoByTwoGridAction.ID,
            title: localize2('editorLayoutTwoByTwoGrid', 'Grid Editor Layout (2x2)'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }], orientation: 0 /* GroupOrientation.HORIZONTAL */ });
    }
}
export class EditorLayoutTwoColumnsBottomAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutTwoColumnsBottom'; }
    constructor() {
        super({
            id: EditorLayoutTwoColumnsBottomAction.ID,
            title: localize2('editorLayoutTwoColumnsBottom', 'Two Columns Bottom Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: 1 /* GroupOrientation.VERTICAL */ });
    }
}
export class EditorLayoutTwoRowsRightAction extends ExecuteCommandAction {
    static { this.ID = 'workbench.action.editorLayoutTwoRowsRight'; }
    constructor() {
        super({
            id: EditorLayoutTwoRowsRightAction.ID,
            title: localize2('editorLayoutTwoRowsRight', 'Two Rows Right Editor Layout'),
            f1: true,
            category: Categories.View
        }, LAYOUT_EDITOR_GROUPS_COMMAND_ID, { groups: [{}, { groups: [{}, {}] }], orientation: 0 /* GroupOrientation.HORIZONTAL */ });
    }
}
class AbstractCreateEditorGroupAction extends Action2 {
    constructor(desc, direction) {
        super(desc);
        this.direction = direction;
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const layoutService = accessor.get(IWorkbenchLayoutService);
        // We are about to create a new empty editor group. We make an opiniated
        // decision here whether to focus that new editor group or not based
        // on what is currently focused. If focus is outside the editor area not
        // in the <body>, we do not focus, with the rationale that a user might
        // have focus on a tree/list with the intention to pick an element to
        // open in the new group from that tree/list.
        //
        // If focus is inside the editor area, we want to prevent the situation
        // of an editor having keyboard focus in an inactive editor group
        // (see https://github.com/microsoft/vscode/issues/189256)
        const activeDocument = getActiveDocument();
        const focusNewGroup = layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */) || activeDocument.activeElement === activeDocument.body;
        const group = editorGroupService.addGroup(editorGroupService.activeGroup, this.direction);
        editorGroupService.activateGroup(group);
        if (focusNewGroup) {
            group.focus();
        }
    }
}
export class NewEditorGroupLeftAction extends AbstractCreateEditorGroupAction {
    constructor() {
        super({
            id: 'workbench.action.newGroupLeft',
            title: localize2('newGroupLeft', 'New Editor Group to the Left'),
            f1: true,
            category: Categories.View
        }, 2 /* GroupDirection.LEFT */);
    }
}
export class NewEditorGroupRightAction extends AbstractCreateEditorGroupAction {
    constructor() {
        super({
            id: 'workbench.action.newGroupRight',
            title: localize2('newGroupRight', 'New Editor Group to the Right'),
            f1: true,
            category: Categories.View
        }, 3 /* GroupDirection.RIGHT */);
    }
}
export class NewEditorGroupAboveAction extends AbstractCreateEditorGroupAction {
    constructor() {
        super({
            id: 'workbench.action.newGroupAbove',
            title: localize2('newGroupAbove', 'New Editor Group Above'),
            f1: true,
            category: Categories.View
        }, 0 /* GroupDirection.UP */);
    }
}
export class NewEditorGroupBelowAction extends AbstractCreateEditorGroupAction {
    constructor() {
        super({
            id: 'workbench.action.newGroupBelow',
            title: localize2('newGroupBelow', 'New Editor Group Below'),
            f1: true,
            category: Categories.View
        }, 1 /* GroupDirection.DOWN */);
    }
}
export class ToggleEditorTypeAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleEditorType',
            title: localize2('toggleEditorType', 'Toggle Editor Type'),
            f1: true,
            category: Categories.View,
            precondition: ActiveEditorAvailableEditorIdsContext
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editorResolverService = accessor.get(IEditorResolverService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!activeEditorPane) {
            return;
        }
        const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
        if (!activeEditorResource) {
            return;
        }
        const editorIds = editorResolverService.getEditors(activeEditorResource).map(editor => editor.id).filter(id => id !== activeEditorPane.input.editorId);
        if (editorIds.length === 0) {
            return;
        }
        // Replace the current editor with the next avaiable editor type
        await editorService.replaceEditors([
            {
                editor: activeEditorPane.input,
                replacement: {
                    resource: activeEditorResource,
                    options: {
                        override: editorIds[0]
                    }
                }
            }
        ], activeEditorPane.group);
    }
}
export class ReOpenInTextEditorAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.reopenTextEditor',
            title: localize2('reopenTextEditor', 'Reopen Editor with Text Editor'),
            f1: true,
            category: Categories.View,
            precondition: ActiveEditorAvailableEditorIdsContext
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (!activeEditorPane) {
            return;
        }
        const activeEditorResource = EditorResourceAccessor.getCanonicalUri(activeEditorPane.input);
        if (!activeEditorResource) {
            return;
        }
        // Replace the current editor with the text editor
        await editorService.replaceEditors([
            {
                editor: activeEditorPane.input,
                replacement: {
                    resource: activeEditorResource,
                    options: {
                        override: DEFAULT_EDITOR_ASSOCIATION.id
                    }
                }
            }
        ], activeEditorPane.group);
    }
}
class BaseMoveCopyEditorToNewWindowAction extends Action2 {
    constructor(id, title, keybinding, move) {
        super({
            id,
            title,
            category: Categories.View,
            precondition: ActiveEditorContext,
            keybinding,
            f1: true
        });
        this.move = move;
    }
    async run(accessor, ...args) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        const listService = accessor.get(IListService);
        const resolvedContext = resolveCommandsContext(args, editorService, editorGroupsService, listService);
        if (!resolvedContext.groupedEditors.length) {
            return;
        }
        const auxiliaryEditorPart = await editorGroupsService.createAuxiliaryEditorPart();
        const { group, editors } = resolvedContext.groupedEditors[0]; // only single group supported for move/copy for now
        const editorsWithOptions = prepareMoveCopyEditors(group, editors, resolvedContext.preserveFocus);
        if (this.move) {
            group.moveEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
        }
        else {
            group.copyEditors(editorsWithOptions, auxiliaryEditorPart.activeGroup);
        }
        auxiliaryEditorPart.activeGroup.focus();
    }
}
export class MoveEditorToNewWindowAction extends BaseMoveCopyEditorToNewWindowAction {
    constructor() {
        super(MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, {
            ...localize2('moveEditorToNewWindow', "Move Editor into New Window"),
            mnemonicTitle: localize({ key: 'miMoveEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Move Editor into New Window"),
        }, undefined, true);
    }
}
export class CopyEditorToNewindowAction extends BaseMoveCopyEditorToNewWindowAction {
    constructor() {
        super(COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, {
            ...localize2('copyEditorToNewWindow', "Copy Editor into New Window"),
            mnemonicTitle: localize({ key: 'miCopyEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Copy Editor into New Window"),
        }, { primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 45 /* KeyCode.KeyO */), weight: 200 /* KeybindingWeight.WorkbenchContrib */ }, false);
    }
}
class BaseMoveCopyEditorGroupToNewWindowAction extends Action2 {
    constructor(id, title, move) {
        super({
            id,
            title,
            category: Categories.View,
            f1: true
        });
        this.move = move;
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const activeGroup = editorGroupService.activeGroup;
        const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
        editorGroupService.mergeGroup(activeGroup, auxiliaryEditorPart.activeGroup, {
            mode: this.move ? 1 /* MergeGroupMode.MOVE_EDITORS */ : 0 /* MergeGroupMode.COPY_EDITORS */
        });
        auxiliaryEditorPart.activeGroup.focus();
    }
}
export class MoveEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {
    constructor() {
        super(MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, {
            ...localize2('moveEditorGroupToNewWindow', "Move Editor Group into New Window"),
            mnemonicTitle: localize({ key: 'miMoveEditorGroupToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Move Editor Group into New Window"),
        }, true);
    }
}
export class CopyEditorGroupToNewWindowAction extends BaseMoveCopyEditorGroupToNewWindowAction {
    constructor() {
        super(COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, {
            ...localize2('copyEditorGroupToNewWindow', "Copy Editor Group into New Window"),
            mnemonicTitle: localize({ key: 'miCopyEditorGroupToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Copy Editor Group into New Window"),
        }, false);
    }
}
export class RestoreEditorsToMainWindowAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.restoreEditorsToMainWindow',
            title: {
                ...localize2('restoreEditorsToMainWindow', "Restore Editors into Main Window"),
                mnemonicTitle: localize({ key: 'miRestoreEditorsToMainWindow', comment: ['&& denotes a mnemonic'] }, "&&Restore Editors into Main Window"),
            },
            f1: true,
            precondition: IsAuxiliaryWindowFocusedContext,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        editorGroupService.mergeAllGroups(editorGroupService.mainPart.activeGroup);
    }
}
export class NewEmptyEditorWindowAction extends Action2 {
    constructor() {
        super({
            id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
            title: {
                ...localize2('newEmptyEditorWindow', "New Empty Editor Window"),
                mnemonicTitle: localize({ key: 'miNewEmptyEditorWindow', comment: ['&& denotes a mnemonic'] }, "&&New Empty Editor Window"),
            },
            f1: true,
            category: Categories.View
        });
    }
    async run(accessor) {
        const editorGroupService = accessor.get(IEditorGroupsService);
        const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
        auxiliaryEditorPart.activeGroup.focus();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBZ0gsMEJBQTBCLEVBQW1CLHNCQUFzQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFOU4sT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDeEYsT0FBTyxFQUFFLHVCQUF1QixFQUFTLE1BQU0sbURBQW1ELENBQUM7QUFDbkcsT0FBTyxFQUFZLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsNkJBQTZCLEVBQW9DLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxXQUFXLEVBQUUsK0JBQStCLEVBQUUsdUJBQXVCLEVBQUUsNkJBQTZCLEVBQUUsWUFBWSxFQUFFLDRCQUE0QixFQUFFLHNDQUFzQyxFQUFFLHNDQUFzQyxFQUFFLDRDQUE0QyxFQUFFLDRDQUE0QyxFQUFFLGtDQUFrQyxFQUFFLDRCQUE0QixFQUFFLDJCQUEyQixFQUFFLDRCQUE0QixFQUFFLDRCQUE0QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDbnFCLE9BQU8sRUFBRSxvQkFBb0IsRUFBa0UsaUNBQWlDLEVB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