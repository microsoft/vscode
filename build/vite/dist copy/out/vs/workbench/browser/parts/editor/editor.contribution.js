/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize, localize2 } from '../../../../nls.js';
import { EditorPaneDescriptor } from '../../editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { TextCompareEditorActiveContext, ActiveEditorPinnedContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorAvailableEditorIdsContext, EditorPartMultipleEditorGroupsContext, ActiveEditorDirtyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, EditorTabsVisibleContext, ActiveEditorLastInGroupContext, EditorPartMaximizedEditorGroupContext, MultipleEditorGroupsContext, InEditorZenModeContext, IsAuxiliaryWindowContext, ActiveCompareEditorCanSwapContext, MultipleEditorsSelectedInGroupContext, SplitEditorsVertically, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { SideBySideEditorInput, SideBySideEditorInputSerializer } from '../../../common/editor/sideBySideEditorInput.js';
import { TextResourceEditor } from './textResourceEditor.js';
import { SideBySideEditor } from './sideBySideEditor.js';
import { DiffEditorInput, DiffEditorInputSerializer } from '../../../common/editor/diffEditorInput.js';
import { UntitledTextEditorInput } from '../../../services/untitled/common/untitledTextEditorInput.js';
import { TextResourceEditorInput } from '../../../common/editor/textResourceEditorInput.js';
import { TextDiffEditor } from './textDiffEditor.js';
import { BinaryResourceDiffEditor } from './binaryDiffEditor.js';
import { ChangeEncodingAction, ChangeEOLAction, ChangeLanguageAction, EditorStatusContribution } from './editorStatus.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, JoinTwoGroupsAction, RevertAndCloseEditorAction, NavigateBetweenGroupsAction, FocusActiveGroupAction, FocusFirstGroupAction, ResetGroupSizesAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup, CloseLeftEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, NavigatePreviousAction, ReopenClosedEditorAction, QuickAccessPreviousRecentlyUsedEditorInGroupAction, QuickAccessPreviousEditorFromHistoryAction, ShowAllEditorsByAppearanceAction, ClearEditorHistoryAction, MoveEditorRightInGroupAction, OpenNextEditorInGroup, OpenPreviousEditorInGroup, OpenNextRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction, MoveEditorToPreviousGroupAction, MoveEditorToNextGroupAction, MoveEditorToFirstGroupAction, MoveEditorLeftInGroupAction, MoveEditorToStartAction, MoveEditorToEndAction, ClearRecentFilesAction, OpenLastEditorInGroup, ShowEditorsInActiveGroupByMostRecentlyUsedAction, MoveEditorToLastGroupAction, OpenFirstEditorInGroup, MoveGroupUpAction, MoveGroupDownAction, FocusLastGroupAction, SplitEditorLeftAction, SplitEditorRightAction, SplitEditorUpAction, SplitEditorDownAction, MoveEditorToLeftGroupAction, MoveEditorToRightGroupAction, MoveEditorToAboveGroupAction, MoveEditorToBelowGroupAction, CloseAllEditorGroupsAction, JoinAllGroupsAction, FocusLeftGroup, FocusAboveGroup, FocusRightGroup, FocusBelowGroup, EditorLayoutSingleAction, EditorLayoutTwoColumnsAction, EditorLayoutThreeColumnsAction, EditorLayoutTwoByTwoGridAction, EditorLayoutTwoRowsAction, EditorLayoutThreeRowsAction, EditorLayoutTwoColumnsBottomAction, EditorLayoutTwoRowsRightAction, NewEditorGroupLeftAction, NewEditorGroupRightAction, NewEditorGroupAboveAction, NewEditorGroupBelowAction, SplitEditorOrthogonalAction, CloseEditorInAllGroupsAction, NavigateToLastEditLocationAction, ToggleGroupSizesAction, ShowAllEditorsByMostRecentlyUsedAction, QuickAccessPreviousRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction, QuickAccessLeastRecentlyUsedEditorAction, QuickAccessLeastRecentlyUsedEditorInGroupAction, ReOpenInTextEditorAction, DuplicateGroupDownAction, DuplicateGroupLeftAction, DuplicateGroupRightAction, DuplicateGroupUpAction, ToggleEditorTypeAction, SplitEditorToAboveGroupAction, SplitEditorToBelowGroupAction, SplitEditorToFirstGroupAction, SplitEditorToLastGroupAction, SplitEditorToLeftGroupAction, SplitEditorToNextGroupAction, SplitEditorToPreviousGroupAction, SplitEditorToRightGroupAction, NavigateForwardInEditsAction, NavigateBackwardsInEditsAction, NavigateForwardInNavigationsAction, NavigateBackwardsInNavigationsAction, NavigatePreviousInNavigationsAction, NavigatePreviousInEditsAction, NavigateToLastNavigationLocationAction, MaximizeGroupHideSidebarAction, MoveEditorToNewWindowAction, CopyEditorToNewindowAction, RestoreEditorsToMainWindowAction, ToggleMaximizeEditorGroupAction, MinimizeOtherGroupsHideSidebarAction, CopyEditorGroupToNewWindowAction, MoveEditorGroupToNewWindowAction, NewEmptyEditorWindowAction, ClearEditorHistoryWithoutConfirmAction } from './editorActions.js';
import { CLOSE_EDITORS_AND_GROUP_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_EDITOR_GROUP_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_PINNED_EDITOR_COMMAND_ID, CLOSE_SAVED_EDITORS_COMMAND_ID, KEEP_EDITOR_COMMAND_ID, PIN_EDITOR_COMMAND_ID, SHOW_EDITORS_IN_GROUP, SPLIT_EDITOR_DOWN, SPLIT_EDITOR_LEFT, SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, TOGGLE_KEEP_EDITORS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, setup as registerEditorCommands, REOPEN_WITH_COMMAND_ID, TOGGLE_LOCK_GROUP_COMMAND_ID, UNLOCK_GROUP_COMMAND_ID, SPLIT_EDITOR_IN_GROUP, JOIN_EDITOR_IN_GROUP, FOCUS_FIRST_SIDE_EDITOR, FOCUS_SECOND_SIDE_EDITOR, TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT, LOCK_GROUP_COMMAND_ID, SPLIT_EDITOR, TOGGLE_MAXIMIZE_EDITOR_GROUP, MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, MOVE_EDITOR_INTO_RIGHT_GROUP, MOVE_EDITOR_INTO_LEFT_GROUP, MOVE_EDITOR_INTO_ABOVE_GROUP, MOVE_EDITOR_INTO_BELOW_GROUP } from './editorCommands.js';
import { GOTO_NEXT_CHANGE, GOTO_PREVIOUS_CHANGE, TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE, TOGGLE_DIFF_SIDE_BY_SIDE, DIFF_SWAP_SIDES } from './diffEditorCommands.js';
import { inQuickPickContext, getQuickNavigateHandler } from '../../quickaccess.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorAutoSave } from './editorAutoSave.js';
import { Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess, AllEditorsByMostRecentlyUsedQuickAccess } from './editorQuickAccess.js';
import { FileAccess } from '../../../../base/common/network.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { UntitledTextEditorInputSerializer, UntitledTextEditorWorkingCopyEditorHandler } from '../../../services/untitled/common/untitledTextEditorHandler.js';
import { DynamicEditorConfigurations } from './editorConfiguration.js';
import { ConfigureEditorAction, ConfigureEditorTabsAction, EditorActionsDefaultAction, EditorActionsTitleBarAction, HideEditorActionsAction, HideEditorTabsAction, ShowMultipleEditorTabsAction, ShowSingleEditorTabAction, ZenHideEditorTabsAction, ZenShowMultipleEditorTabsAction, ZenShowSingleEditorTabAction } from '../../actions/layoutActions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { getFontSnippets } from '../../../../base/browser/fonts.js';
import { registerEditorFontConfigurations } from '../../../../editor/common/config/editorConfigurationSchema.js';
//#region Editor Registrations
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TextResourceEditor, TextResourceEditor.ID, localize('textEditor', "Text Editor")), [
    new SyncDescriptor(UntitledTextEditorInput),
    new SyncDescriptor(TextResourceEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(TextDiffEditor, TextDiffEditor.ID, localize('textDiffEditor', "Text Diff Editor")), [
    new SyncDescriptor(DiffEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(BinaryResourceDiffEditor, BinaryResourceDiffEditor.ID, localize('binaryDiffEditor', "Binary Diff Editor")), [
    new SyncDescriptor(DiffEditorInput)
]);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(SideBySideEditor, SideBySideEditor.ID, localize('sideBySideEditor', "Side by Side Editor")), [
    new SyncDescriptor(SideBySideEditorInput)
]);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UntitledTextEditorInput.ID, UntitledTextEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SideBySideEditorInput.ID, SideBySideEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(DiffEditorInput.ID, DiffEditorInputSerializer);
//#endregion
//#region Workbench Contributions
registerWorkbenchContribution2(EditorAutoSave.ID, EditorAutoSave, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(EditorStatusContribution.ID, EditorStatusContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(UntitledTextEditorWorkingCopyEditorHandler.ID, UntitledTextEditorWorkingCopyEditorHandler, 2 /* WorkbenchPhase.BlockRestore */);
registerWorkbenchContribution2(DynamicEditorConfigurations.ID, DynamicEditorConfigurations, 2 /* WorkbenchPhase.BlockRestore */);
//#endregion
//#region Quick Access
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
const editorPickerContextKey = 'inEditorsPicker';
const editorPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(editorPickerContextKey));
quickAccessRegistry.registerQuickAccessProvider({
    ctor: ActiveGroupEditorsByMostRecentlyUsedQuickAccess,
    prefix: ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX,
    contextKey: editorPickerContextKey,
    placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
    helpEntries: [{ description: localize('activeGroupEditorsByMostRecentlyUsedQuickAccess', "Show Editors in Active Group by Most Recently Used"), commandId: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
    ctor: AllEditorsByAppearanceQuickAccess,
    prefix: AllEditorsByAppearanceQuickAccess.PREFIX,
    contextKey: editorPickerContextKey,
    placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
    helpEntries: [{ description: localize('allEditorsByAppearanceQuickAccess', "Show All Opened Editors By Appearance"), commandId: ShowAllEditorsByAppearanceAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
    ctor: AllEditorsByMostRecentlyUsedQuickAccess,
    prefix: AllEditorsByMostRecentlyUsedQuickAccess.PREFIX,
    contextKey: editorPickerContextKey,
    placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
    helpEntries: [{ description: localize('allEditorsByMostRecentlyUsedQuickAccess', "Show All Opened Editors By Most Recently Used"), commandId: ShowAllEditorsByMostRecentlyUsedAction.ID }]
});
//#endregion
//#region Actions & Commands
registerAction2(ChangeLanguageAction);
registerAction2(ChangeEOLAction);
registerAction2(ChangeEncodingAction);
registerAction2(NavigateForwardAction);
registerAction2(NavigateBackwardsAction);
registerAction2(OpenNextEditor);
registerAction2(OpenPreviousEditor);
registerAction2(OpenNextEditorInGroup);
registerAction2(OpenPreviousEditorInGroup);
registerAction2(OpenFirstEditorInGroup);
registerAction2(OpenLastEditorInGroup);
registerAction2(OpenNextRecentlyUsedEditorAction);
registerAction2(OpenPreviousRecentlyUsedEditorAction);
registerAction2(OpenNextRecentlyUsedEditorInGroupAction);
registerAction2(OpenPreviousRecentlyUsedEditorInGroupAction);
registerAction2(ReopenClosedEditorAction);
registerAction2(ClearRecentFilesAction);
registerAction2(ShowAllEditorsByAppearanceAction);
registerAction2(ShowAllEditorsByMostRecentlyUsedAction);
registerAction2(ShowEditorsInActiveGroupByMostRecentlyUsedAction);
registerAction2(CloseAllEditorsAction);
registerAction2(CloseAllEditorGroupsAction);
registerAction2(CloseLeftEditorsInGroupAction);
registerAction2(CloseEditorsInOtherGroupsAction);
registerAction2(CloseEditorInAllGroupsAction);
registerAction2(RevertAndCloseEditorAction);
registerAction2(SplitEditorAction);
registerAction2(SplitEditorOrthogonalAction);
registerAction2(SplitEditorLeftAction);
registerAction2(SplitEditorRightAction);
registerAction2(SplitEditorUpAction);
registerAction2(SplitEditorDownAction);
registerAction2(JoinTwoGroupsAction);
registerAction2(JoinAllGroupsAction);
registerAction2(NavigateBetweenGroupsAction);
registerAction2(ResetGroupSizesAction);
registerAction2(ToggleGroupSizesAction);
registerAction2(MaximizeGroupHideSidebarAction);
registerAction2(ToggleMaximizeEditorGroupAction);
registerAction2(MinimizeOtherGroupsAction);
registerAction2(MinimizeOtherGroupsHideSidebarAction);
registerAction2(MoveEditorLeftInGroupAction);
registerAction2(MoveEditorRightInGroupAction);
registerAction2(MoveEditorToStartAction);
registerAction2(MoveEditorToEndAction);
registerAction2(MoveGroupLeftAction);
registerAction2(MoveGroupRightAction);
registerAction2(MoveGroupUpAction);
registerAction2(MoveGroupDownAction);
registerAction2(DuplicateGroupLeftAction);
registerAction2(DuplicateGroupRightAction);
registerAction2(DuplicateGroupUpAction);
registerAction2(DuplicateGroupDownAction);
registerAction2(MoveEditorToPreviousGroupAction);
registerAction2(MoveEditorToNextGroupAction);
registerAction2(MoveEditorToFirstGroupAction);
registerAction2(MoveEditorToLastGroupAction);
registerAction2(MoveEditorToLeftGroupAction);
registerAction2(MoveEditorToRightGroupAction);
registerAction2(MoveEditorToAboveGroupAction);
registerAction2(MoveEditorToBelowGroupAction);
registerAction2(SplitEditorToPreviousGroupAction);
registerAction2(SplitEditorToNextGroupAction);
registerAction2(SplitEditorToFirstGroupAction);
registerAction2(SplitEditorToLastGroupAction);
registerAction2(SplitEditorToLeftGroupAction);
registerAction2(SplitEditorToRightGroupAction);
registerAction2(SplitEditorToAboveGroupAction);
registerAction2(SplitEditorToBelowGroupAction);
registerAction2(FocusActiveGroupAction);
registerAction2(FocusFirstGroupAction);
registerAction2(FocusLastGroupAction);
registerAction2(FocusPreviousGroup);
registerAction2(FocusNextGroup);
registerAction2(FocusLeftGroup);
registerAction2(FocusRightGroup);
registerAction2(FocusAboveGroup);
registerAction2(FocusBelowGroup);
registerAction2(NewEditorGroupLeftAction);
registerAction2(NewEditorGroupRightAction);
registerAction2(NewEditorGroupAboveAction);
registerAction2(NewEditorGroupBelowAction);
registerAction2(NavigatePreviousAction);
registerAction2(NavigateForwardInEditsAction);
registerAction2(NavigateBackwardsInEditsAction);
registerAction2(NavigatePreviousInEditsAction);
registerAction2(NavigateToLastEditLocationAction);
registerAction2(NavigateForwardInNavigationsAction);
registerAction2(NavigateBackwardsInNavigationsAction);
registerAction2(NavigatePreviousInNavigationsAction);
registerAction2(NavigateToLastNavigationLocationAction);
registerAction2(ClearEditorHistoryAction);
registerAction2(ClearEditorHistoryWithoutConfirmAction);
registerAction2(EditorLayoutSingleAction);
registerAction2(EditorLayoutTwoColumnsAction);
registerAction2(EditorLayoutThreeColumnsAction);
registerAction2(EditorLayoutTwoRowsAction);
registerAction2(EditorLayoutThreeRowsAction);
registerAction2(EditorLayoutTwoByTwoGridAction);
registerAction2(EditorLayoutTwoRowsRightAction);
registerAction2(EditorLayoutTwoColumnsBottomAction);
registerAction2(ToggleEditorTypeAction);
registerAction2(ReOpenInTextEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessPreviousEditorFromHistoryAction);
registerAction2(MoveEditorToNewWindowAction);
registerAction2(CopyEditorToNewindowAction);
registerAction2(MoveEditorGroupToNewWindowAction);
registerAction2(CopyEditorGroupToNewWindowAction);
registerAction2(RestoreEditorsToMainWindowAction);
registerAction2(NewEmptyEditorWindowAction);
const quickAccessNavigateNextInEditorPickerId = 'workbench.action.quickOpenNavigateNextInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigateNextInEditorPickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigateNextInEditorPickerId, true),
    when: editorPickerContext,
    primary: 2048 /* KeyMod.CtrlCmd */ | 2 /* KeyCode.Tab */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 2 /* KeyCode.Tab */ }
});
const quickAccessNavigatePreviousInEditorPickerId = 'workbench.action.quickOpenNavigatePreviousInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: quickAccessNavigatePreviousInEditorPickerId,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
    handler: getQuickNavigateHandler(quickAccessNavigatePreviousInEditorPickerId, false),
    when: editorPickerContext,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */,
    mac: { primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */ }
});
registerEditorCommands();
//#endregion
//#region Menus
// macOS: Touchbar
if (isMacintosh) {
    MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
        command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, icon: { dark: FileAccess.asFileUri('vs/workbench/browser/parts/editor/media/back-tb.png') } },
        group: 'navigation',
        order: 0
    });
    MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
        command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, icon: { dark: FileAccess.asFileUri('vs/workbench/browser/parts/editor/media/forward-tb.png') } },
        group: 'navigation',
        order: 1
    });
}
// Empty Editor Group Toolbar
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: LOCK_GROUP_COMMAND_ID, title: localize('lockGroupAction', "Lock Group"), icon: Codicon.unlock }, group: 'navigation', order: 10, when: ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()) });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: UNLOCK_GROUP_COMMAND_ID, title: localize('unlockGroupAction', "Unlock Group"), icon: Codicon.lock, toggled: ContextKeyExpr.true() }, group: 'navigation', order: 10, when: ActiveEditorGroupLockedContext });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize('closeGroupAction', "Close Group"), icon: Codicon.close }, group: 'navigation', order: 20, when: ContextKeyExpr.or(IsAuxiliaryWindowContext, EditorPartMultipleEditorGroupsContext) });
// Empty Editor Group Context Menu
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_UP, title: localize('splitUp', "Split Up") }, group: '2_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize('splitDown', "Split Down") }, group: '2_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize('splitLeft', "Split Left") }, group: '2_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize('splitRight', "Split Right") }, group: '2_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, title: localize('newWindow', "New Window") }, group: '3_window', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize('toggleLockGroup', "Lock Group"), toggled: ActiveEditorGroupLockedContext }, group: '4_lock', order: 10, when: IsAuxiliaryWindowContext.toNegated() /* already a primary action for aux windows */ });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize('close', "Close") }, group: '5_close', order: 10, when: MultipleEditorGroupsContext });
// Editor Tab Container Context Menu
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_UP, title: localize('splitUp', "Split Up") }, group: '2_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize('splitDown', "Split Down") }, group: '2_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize('splitLeft', "Split Left") }, group: '2_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize('splitRight', "Split Right") }, group: '2_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize('moveEditorGroupToNewWindow', "Move into New Window") }, group: '3_window', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize('copyEditorGroupToNewWindow', "Copy into New Window") }, group: '3_window', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsSubmenu, title: localize('tabBar', "Tab Bar"), group: '4_config', order: 10, when: InEditorZenModeContext.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowMultipleEditorTabsAction.ID, title: localize('multipleTabs', "Multiple Tabs"), toggled: ContextKeyExpr.equals('config.workbench.editor.showTabs', 'multiple') }, group: '1_config', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowSingleEditorTabAction.ID, title: localize('singleTab', "Single Tab"), toggled: ContextKeyExpr.equals('config.workbench.editor.showTabs', 'single') }, group: '1_config', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: HideEditorTabsAction.ID, title: localize('hideTabs', "Hidden"), toggled: ContextKeyExpr.equals('config.workbench.editor.showTabs', 'none') }, group: '1_config', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsZenModeSubmenu, title: localize('tabBar', "Tab Bar"), group: '4_config', order: 10, when: InEditorZenModeContext });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowMultipleEditorTabsAction.ID, title: localize('multipleTabs', "Multiple Tabs"), toggled: ContextKeyExpr.equals('config.zenMode.showTabs', 'multiple') }, group: '1_config', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowSingleEditorTabAction.ID, title: localize('singleTab', "Single Tab"), toggled: ContextKeyExpr.equals('config.zenMode.showTabs', 'single') }, group: '1_config', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenHideEditorTabsAction.ID, title: localize('hideTabs', "Hidden"), toggled: ContextKeyExpr.equals('config.zenMode.showTabs', 'none') }, group: '1_config', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorActionsPositionSubmenu, title: localize('editorActionsPosition', "Editor Actions Position"), group: '4_config', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsDefaultAction.ID, title: localize('tabBar', "Tab Bar"), toggled: ContextKeyExpr.equals('config.workbench.editor.editorActionsLocation', 'default') }, group: '1_config', order: 10, when: ContextKeyExpr.equals('config.workbench.editor.showTabs', 'none').negate() });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsTitleBarAction.ID, title: localize('titleBar', "Title Bar"), toggled: ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.editor.editorActionsLocation', 'titleBar'), ContextKeyExpr.and(ContextKeyExpr.equals('config.workbench.editor.showTabs', 'none'), ContextKeyExpr.equals('config.workbench.editor.editorActionsLocation', 'default'))) }, group: '1_config', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: HideEditorActionsAction.ID, title: localize('hidden', "Hidden"), toggled: ContextKeyExpr.equals('config.workbench.editor.editorActionsLocation', 'hidden') }, group: '1_config', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: ConfigureEditorTabsAction.ID, title: localize('configureTabs', "Configure Tabs") }, group: '9_configure', order: 10 });
// Editor Title Context Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize('close', "Close") }, group: '1_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeOthers', "Close Others"), precondition: EditorGroupEditorsCountContext.notEqualsTo('1') }, group: '1_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize('closeRight', "Close to the Right"), precondition: ContextKeyExpr.and(ActiveEditorLastInGroupContext.toNegated(), MultipleEditorsSelectedInGroupContext.negate()) }, group: '1_close', order: 30, when: EditorTabsVisibleContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize('closeAllSaved', "Close Saved") }, group: '1_close', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeAll', "Close All") }, group: '1_close', order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize('reopenWith', "Reopen Editor With...") }, group: '1_open', order: 10, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize('keepOpen', "Keep Open"), precondition: ActiveEditorPinnedContext.toNegated() }, group: '3_preview', order: 10, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize('pin', "Pin") }, group: '3_preview', order: 20, when: ActiveEditorStickyContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize('unpin', "Unpin") }, group: '3_preview', order: 20, when: ActiveEditorStickyContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize('splitRight', "Split Right") }, group: '5_split', order: 10, when: SplitEditorsVertically.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize('splitDown', "Split Down") }, group: '5_split', order: 10, when: SplitEditorsVertically });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorSplitMoveSubmenu, title: localize('splitAndMoveEditor', "Split & Move"), group: '5_split', order: 15 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize('moveToNewWindow', "Move into New Window") }, group: '7_new_window', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize('copyToNewWindow', "Copy into New Window") }, group: '7_new_window', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorTitleContextShare, title: localize('share', "Share"), group: '11_share', order: -1, when: MultipleEditorsSelectedInGroupContext.negate() });
// Editor Title Context Menu: Split & Move Editor Submenu
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_UP, title: localize('splitUp', "Split Up") }, group: '1_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_DOWN, title: localize('splitDown', "Split Down") }, group: '1_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_LEFT, title: localize('splitLeft', "Split Left") }, group: '1_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_RIGHT, title: localize('splitRight', "Split Right") }, group: '1_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_ABOVE_GROUP, title: localize('moveAbove', "Move Above") }, group: '2_move', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_BELOW_GROUP, title: localize('moveBelow', "Move Below") }, group: '2_move', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_LEFT_GROUP, title: localize('moveLeft', "Move Left") }, group: '2_move', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_RIGHT_GROUP, title: localize('moveRight', "Move Right") }, group: '2_move', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_IN_GROUP, title: localize('splitInGroup', "Split in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: '3_split_in_group', order: 10, when: ActiveEditorCanSplitInGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: JOIN_EDITOR_IN_GROUP, title: localize('joinInGroup', "Join in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: '3_split_in_group', order: 10, when: SideBySideEditorActiveContext });
// Editor Title Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_DIFF_SIDE_BY_SIDE, title: localize('inlineView', "Inline View"), toggled: ContextKeyExpr.equals('config.diffEditor.renderSideBySide', false) }, group: '1_diff', order: 10, when: ContextKeyExpr.has('isInDiffEditor') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: SHOW_EDITORS_IN_GROUP, title: localize('showOpenedEditors', "Show Opened Editors") }, group: '3_open', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeAll', "Close All") }, group: '5_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize('closeAllSaved', "Close Saved") }, group: '5_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_KEEP_EDITORS_COMMAND_ID, title: localize('togglePreviewMode', "Enable Preview Editors"), toggled: ContextKeyExpr.has('config.workbench.editor.enablePreview') }, group: '7_settings', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize('maximizeGroup', "Maximize Group") }, group: '8_group_operations', order: 5, when: ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext) });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize('unmaximizeGroup', "Unmaximize Group") }, group: '8_group_operations', order: 5, when: EditorPartMaximizedEditorGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize('lockGroup', "Lock Group"), toggled: ActiveEditorGroupLockedContext }, group: '8_group_operations', order: 10, when: IsAuxiliaryWindowContext.toNegated() /* already a primary action for aux windows */ });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: ConfigureEditorAction.ID, title: localize('configureEditors', "Configure Editors") }, group: '9_configure', order: 10 });
function appendEditorToolItem(primary, when, order, alternative, precondition, enableInCompactMode, enableInModalMode) {
    const item = {
        command: {
            id: primary.id,
            title: primary.title,
            icon: primary.icon,
            toggled: primary.toggled,
            precondition
        },
        group: 'navigation',
        when,
        order
    };
    if (alternative) {
        item.alt = {
            id: alternative.id,
            title: alternative.title,
            icon: alternative.icon
        };
    }
    MenuRegistry.appendMenuItem(MenuId.EditorTitle, item);
    if (enableInCompactMode) {
        MenuRegistry.appendMenuItem(MenuId.CompactWindowEditorTitle, item);
    }
    if (enableInModalMode) {
        MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, item);
    }
}
const SPLIT_ORDER = 100000; // towards the end
const CLOSE_ORDER = 1000000; // towards the far end
// Editor Title Menu: Split Editor
appendEditorToolItem({
    id: SPLIT_EDITOR,
    title: localize('splitEditorRight', "Split Editor Right"),
    icon: Codicon.splitHorizontal
}, SplitEditorsVertically.negate(), SPLIT_ORDER, {
    id: SPLIT_EDITOR_DOWN,
    title: localize('splitEditorDown', "Split Editor Down"),
    icon: Codicon.splitVertical
});
appendEditorToolItem({
    id: SPLIT_EDITOR,
    title: localize('splitEditorDown', "Split Editor Down"),
    icon: Codicon.splitVertical
}, SplitEditorsVertically, SPLIT_ORDER, {
    id: SPLIT_EDITOR_RIGHT,
    title: localize('splitEditorRight', "Split Editor Right"),
    icon: Codicon.splitHorizontal
});
// Side by side: layout
appendEditorToolItem({
    id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
    title: localize('toggleSplitEditorInGroupLayout', "Toggle Layout"),
    icon: Codicon.editorLayout
}, SideBySideEditorActiveContext, SPLIT_ORDER - 1);
// Editor Title Menu: Close (tabs disabled, normal editor)
appendEditorToolItem({
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize('close', "Close"),
    icon: Codicon.close
}, ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext.toNegated()), CLOSE_ORDER, {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize('closeAll', "Close All"),
    icon: Codicon.closeAll
});
// Editor Title Menu: Close (tabs disabled, dirty editor)
appendEditorToolItem({
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize('close', "Close"),
    icon: Codicon.closeDirty
}, ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext.toNegated()), CLOSE_ORDER, {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize('closeAll', "Close All"),
    icon: Codicon.closeAll
});
// Editor Title Menu: Close (tabs disabled, sticky editor)
appendEditorToolItem({
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize('unpin', "Unpin"),
    icon: Codicon.pinned
}, ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext), CLOSE_ORDER, {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize('close', "Close"),
    icon: Codicon.close
});
// Editor Title Menu: Close (tabs disabled, dirty & sticky editor)
appendEditorToolItem({
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize('unpin', "Unpin"),
    icon: Codicon.pinnedDirty
}, ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext), CLOSE_ORDER, {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize('close', "Close"),
    icon: Codicon.close
});
// Lock Group: only on auxiliary window and when group is unlocked
appendEditorToolItem({
    id: LOCK_GROUP_COMMAND_ID,
    title: localize('lockEditorGroup', "Lock Group"),
    icon: Codicon.unlock
}, ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()), CLOSE_ORDER - 1);
// Unlock Group: only when group is locked
appendEditorToolItem({
    id: UNLOCK_GROUP_COMMAND_ID,
    title: localize('unlockEditorGroup', "Unlock Group"),
    icon: Codicon.lock,
    toggled: ContextKeyExpr.true()
}, ActiveEditorGroupLockedContext, CLOSE_ORDER - 1);
// Diff Editor Title Menu: Previous Change
const previousChangeIcon = registerIcon('diff-editor-previous-change', Codicon.arrowUp, localize('previousChangeIcon', 'Icon for the previous change action in the diff editor.'));
appendEditorToolItem({
    id: GOTO_PREVIOUS_CHANGE,
    title: localize('navigate.prev.label', "Previous Change"),
    icon: previousChangeIcon
}, TextCompareEditorActiveContext, 10, undefined, EditorContextKeys.hasChanges, true, true);
// Diff Editor Title Menu: Next Change
const nextChangeIcon = registerIcon('diff-editor-next-change', Codicon.arrowDown, localize('nextChangeIcon', 'Icon for the next change action in the diff editor.'));
appendEditorToolItem({
    id: GOTO_NEXT_CHANGE,
    title: localize('navigate.next.label', "Next Change"),
    icon: nextChangeIcon
}, TextCompareEditorActiveContext, 11, undefined, EditorContextKeys.hasChanges, true, true);
// Diff Editor Title Menu: Swap Sides
appendEditorToolItem({
    id: DIFF_SWAP_SIDES,
    title: localize('swapDiffSides', "Swap Left and Right Side"),
    icon: Codicon.arrowSwap
}, ContextKeyExpr.and(TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext), 15, undefined, undefined);
const toggleWhitespace = registerIcon('diff-editor-toggle-whitespace', Codicon.whitespace, localize('toggleWhitespace', 'Icon for the toggle whitespace action in the diff editor.'));
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
    command: {
        id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
        title: localize('ignoreTrimWhitespace.label', "Show Leading/Trailing Whitespace Differences"),
        icon: toggleWhitespace,
        precondition: TextCompareEditorActiveContext,
        toggled: ContextKeyExpr.equals('config.diffEditor.ignoreTrimWhitespace', false),
    },
    group: 'navigation',
    when: TextCompareEditorActiveContext,
    order: 20,
});
// Editor Commands for Command Palette
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize2('keepEditor', 'Keep Editor'), category: Categories.View }, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize2('pinEditor', 'Pin Editor'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize2('unpinEditor', 'Unpin Editor'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize2('closeEditor', 'Close Editor'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_PINNED_EDITOR_COMMAND_ID, title: localize2('closePinnedEditor', 'Close Pinned Editor'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize2('closeEditorsInGroup', 'Close All Editors in Group'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize2('closeSavedEditors', 'Close Saved Editors in Group'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize2('closeOtherEditors', 'Close Other Editors in Group'), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize2('closeRightEditors', 'Close Editors to the Right in Group'), category: Categories.View }, when: ActiveEditorLastInGroupContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_AND_GROUP_COMMAND_ID, title: localize2('closeEditorGroup', 'Close Editor Group'), category: Categories.View }, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize2('reopenWith', "Reopen Editor With..."), category: Categories.View }, when: ActiveEditorAvailableEditorIdsContext });
// File menu
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
    group: '1_editor',
    command: {
        id: ReopenClosedEditorAction.ID,
        title: localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"),
        precondition: ContextKeyExpr.has('canReopenClosedEditor')
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
    group: 'z_clear',
    command: {
        id: ClearRecentFilesAction.ID,
        title: localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened...")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
    title: localize('miShare', "Share"),
    submenu: MenuId.MenubarShare,
    group: '45_share',
    order: 1,
    when: IsSessionsWindowContext.negate()
});
// Layout menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
    group: '2_appearance',
    title: localize({ key: 'miEditorLayout', comment: ['&& denotes a mnemonic'] }, "Editor &&Layout"),
    submenu: MenuId.MenubarLayoutMenu,
    order: 2,
    when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '1_split',
    command: {
        id: SPLIT_EDITOR_UP,
        title: {
            ...localize2('miSplitEditorUpWithoutMnemonic', "Split Up"),
            mnemonicTitle: localize({ key: 'miSplitEditorUp', comment: ['&& denotes a mnemonic'] }, "Split &&Up"),
        }
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '1_split',
    command: {
        id: SPLIT_EDITOR_DOWN,
        title: {
            ...localize2('miSplitEditorDownWithoutMnemonic', "Split Down"),
            mnemonicTitle: localize({ key: 'miSplitEditorDown', comment: ['&& denotes a mnemonic'] }, "Split &&Down"),
        }
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '1_split',
    command: {
        id: SPLIT_EDITOR_LEFT,
        title: {
            ...localize2('miSplitEditorLeftWithoutMnemonic', "Split Left"),
            mnemonicTitle: localize({ key: 'miSplitEditorLeft', comment: ['&& denotes a mnemonic'] }, "Split &&Left"),
        }
    },
    order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '1_split',
    command: {
        id: SPLIT_EDITOR_RIGHT,
        title: {
            ...localize2('miSplitEditorRightWithoutMnemonic', "Split Right"),
            mnemonicTitle: localize({ key: 'miSplitEditorRight', comment: ['&& denotes a mnemonic'] }, "Split &&Right"),
        }
    },
    order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '2_split_in_group',
    command: {
        id: SPLIT_EDITOR_IN_GROUP,
        title: {
            ...localize2('miSplitEditorInGroupWithoutMnemonic', "Split in Group"),
            mnemonicTitle: localize({ key: 'miSplitEditorInGroup', comment: ['&& denotes a mnemonic'] }, "Split in &&Group"),
        }
    },
    when: ActiveEditorCanSplitInGroupContext,
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '2_split_in_group',
    command: {
        id: JOIN_EDITOR_IN_GROUP,
        title: {
            ...localize2('miJoinEditorInGroupWithoutMnemonic', "Join in Group"),
            mnemonicTitle: localize({ key: 'miJoinEditorInGroup', comment: ['&& denotes a mnemonic'] }, "Join in &&Group"),
        }
    },
    when: SideBySideEditorActiveContext,
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '3_new_window',
    command: {
        id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
        title: {
            ...localize2('moveEditorToNewWindow', "Move Editor into New Window"),
            mnemonicTitle: localize({ key: 'miMoveEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Move Editor into New Window"),
        }
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '3_new_window',
    command: {
        id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
        title: {
            ...localize2('copyEditorToNewWindow', "Copy Editor into New Window"),
            mnemonicTitle: localize({ key: 'miCopyEditorToNewWindow', comment: ['&& denotes a mnemonic'] }, "&&Copy Editor into New Window"),
        }
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutSingleAction.ID,
        title: {
            ...localize2('miSingleColumnEditorLayoutWithoutMnemonic', "Single"),
            mnemonicTitle: localize({ key: 'miSingleColumnEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Single"),
        }
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutTwoColumnsAction.ID,
        title: {
            ...localize2('miTwoColumnsEditorLayoutWithoutMnemonic', "Two Columns"),
            mnemonicTitle: localize({ key: 'miTwoColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Two Columns"),
        }
    },
    order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutThreeColumnsAction.ID,
        title: {
            ...localize2('miThreeColumnsEditorLayoutWithoutMnemonic', "Three Columns"),
            mnemonicTitle: localize({ key: 'miThreeColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&hree Columns"),
        }
    },
    order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutTwoRowsAction.ID,
        title: {
            ...localize2('miTwoRowsEditorLayoutWithoutMnemonic', "Two Rows"),
            mnemonicTitle: localize({ key: 'miTwoRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&wo Rows"),
        }
    },
    order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutThreeRowsAction.ID,
        title: {
            ...localize2('miThreeRowsEditorLayoutWithoutMnemonic', "Three Rows"),
            mnemonicTitle: localize({ key: 'miThreeRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "Three &&Rows"),
        }
    },
    order: 6
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutTwoByTwoGridAction.ID,
        title: {
            ...localize2('miTwoByTwoGridEditorLayoutWithoutMnemonic', "Grid (2x2)"),
            mnemonicTitle: localize({ key: 'miTwoByTwoGridEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Grid (2x2)"),
        }
    },
    order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutTwoRowsRightAction.ID,
        title: {
            ...localize2('miTwoRowsRightEditorLayoutWithoutMnemonic', "Two Rows Right"),
            mnemonicTitle: localize({ key: 'miTwoRowsRightEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two R&&ows Right"),
        }
    },
    order: 8
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
    group: '4_layouts',
    command: {
        id: EditorLayoutTwoColumnsBottomAction.ID,
        title: {
            ...localize2('miTwoColumnsBottomEditorLayoutWithoutMnemonic', "Two Columns Bottom"),
            mnemonicTitle: localize({ key: 'miTwoColumnsBottomEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two &&Columns Bottom"),
        }
    },
    order: 9
});
// Main Menu Bar Contributions:
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
    group: '1_history_nav',
    command: {
        id: 'workbench.action.navigateToLastEditLocation',
        title: localize({ key: 'miLastEditLocation', comment: ['&& denotes a mnemonic'] }, "&&Last Edit Location"),
        precondition: ContextKeyExpr.has('canNavigateToLastEditLocation')
    },
    order: 3
});
// Switch Editor
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '1_sideBySide',
    command: {
        id: FOCUS_FIRST_SIDE_EDITOR,
        title: localize({ key: 'miFirstSideEditor', comment: ['&& denotes a mnemonic'] }, "&&First Side in Editor")
    },
    when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '1_sideBySide',
    command: {
        id: FOCUS_SECOND_SIDE_EDITOR,
        title: localize({ key: 'miSecondSideEditor', comment: ['&& denotes a mnemonic'] }, "&&Second Side in Editor")
    },
    when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '2_any',
    command: {
        id: 'workbench.action.nextEditor',
        title: localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '2_any',
    command: {
        id: 'workbench.action.previousEditor',
        title: localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '3_any_used',
    command: {
        id: 'workbench.action.openNextRecentlyUsedEditor',
        title: localize({ key: 'miNextRecentlyUsedEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '3_any_used',
    command: {
        id: 'workbench.action.openPreviousRecentlyUsedEditor',
        title: localize({ key: 'miPreviousRecentlyUsedEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '4_group',
    command: {
        id: 'workbench.action.nextEditorInGroup',
        title: localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Editor in Group")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '4_group',
    command: {
        id: 'workbench.action.previousEditorInGroup',
        title: localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor in Group")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '5_group_used',
    command: {
        id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
        title: localize({ key: 'miNextUsedEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
    group: '5_group_used',
    command: {
        id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
        title: localize({ key: 'miPreviousUsedEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
    group: '2_editor_nav',
    title: localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor"),
    submenu: MenuId.MenubarSwitchEditorMenu,
    order: 1
});
// Switch Group
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '1_focus_index',
    command: {
        id: 'workbench.action.focusFirstEditorGroup',
        title: localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "Group &&1")
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '1_focus_index',
    command: {
        id: 'workbench.action.focusSecondEditorGroup',
        title: localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "Group &&2")
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '1_focus_index',
    command: {
        id: 'workbench.action.focusThirdEditorGroup',
        title: localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "Group &&3"),
        precondition: MultipleEditorGroupsContext
    },
    order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '1_focus_index',
    command: {
        id: 'workbench.action.focusFourthEditorGroup',
        title: localize({ key: 'miFocusFourthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&4"),
        precondition: MultipleEditorGroupsContext
    },
    order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '1_focus_index',
    command: {
        id: 'workbench.action.focusFifthEditorGroup',
        title: localize({ key: 'miFocusFifthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&5"),
        precondition: MultipleEditorGroupsContext
    },
    order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '2_next_prev',
    command: {
        id: 'workbench.action.focusNextGroup',
        title: localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group"),
        precondition: MultipleEditorGroupsContext
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '2_next_prev',
    command: {
        id: 'workbench.action.focusPreviousGroup',
        title: localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group"),
        precondition: MultipleEditorGroupsContext
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '3_directional',
    command: {
        id: 'workbench.action.focusLeftGroup',
        title: localize({ key: 'miFocusLeftGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Left"),
        precondition: MultipleEditorGroupsContext
    },
    order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '3_directional',
    command: {
        id: 'workbench.action.focusRightGroup',
        title: localize({ key: 'miFocusRightGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Right"),
        precondition: MultipleEditorGroupsContext
    },
    order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '3_directional',
    command: {
        id: 'workbench.action.focusAboveGroup',
        title: localize({ key: 'miFocusAboveGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Above"),
        precondition: MultipleEditorGroupsContext
    },
    order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
    group: '3_directional',
    command: {
        id: 'workbench.action.focusBelowGroup',
        title: localize({ key: 'miFocusBelowGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Below"),
        precondition: MultipleEditorGroupsContext
    },
    order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
    group: '2_editor_nav',
    title: localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group"),
    submenu: MenuId.MenubarSwitchGroupMenu,
    order: 2
});
//#endregion
registerEditorFontConfigurations(getFontSnippets);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBdUIsb0JBQW9CLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUM1RSxPQUFPLEVBQTBCLGdCQUFnQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDckYsT0FBTyxFQUNOLDhCQUE4QixFQUFFLHlCQUF5QixFQUFFLDhCQUE4QixFQUFFLHlCQUF5QixFQUFFLHFDQUFxQyxFQUMzSixxQ0FBcUMsRUFBRSx3QkFBd0IsRUFBRSw4QkFBOEIsRUFBRSxrQ0FBa0MsRUFBRSw2QkFBNkIsRUFDbEssd0JBQXdCLEVBQUUsOEJBQThCLEVBQUUscUNBQXFDLEVBQUUsMkJBQTJCLEVBQUUsc0JBQXNCLEVBQ3BKLHdCQUF3QixFQUFFLGlDQUFpQyxFQUFFLHFDQUFxQyxFQUFFLHNCQUFzQixFQUMxSCx1QkFBdUIsRUFDdkIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLHlCQUF5QixFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdkcsT0FBTyxFQUFFLHVCQUF1QixF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