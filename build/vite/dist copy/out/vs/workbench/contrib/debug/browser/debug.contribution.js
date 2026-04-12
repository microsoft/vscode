/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileAccess } from '../../../../base/common/network.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import * as nls from '../../../../nls.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Extensions as QuickAccessExtensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { FocusedViewContext, IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions } from '../../../common/editor.js';
import { Extensions as ViewExtensions } from '../../../common/views.js';
import { launchSchemaId } from '../../../services/configuration/common/configuration.js';
import { COPY_NOTEBOOK_VARIABLE_VALUE_ID, COPY_NOTEBOOK_VARIABLE_VALUE_LABEL } from '../../notebook/browser/contrib/notebookVariables/notebookVariableCommands.js';
import { BREAKPOINTS_VIEW_ID, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_UX, CONTEXT_EXPRESSION_SELECTED, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_HAS_DEBUGGED, CONTEXT_IN_DEBUG_MODE, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_RESTART_FRAME_SUPPORTED, CONTEXT_SET_EXPRESSION_SUPPORTED, CONTEXT_SET_VARIABLE_SUPPORTED, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_THREADS_SUPPORTED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_VALUE, CONTEXT_WATCH_ITEM_TYPE, DEBUG_PANEL_ID, DISASSEMBLY_VIEW_ID, EDITOR_CONTRIBUTION_ID, IDebugService, INTERNAL_CONSOLE_OPTIONS_SCHEMA, LOADED_SCRIPTS_VIEW_ID, REPL_VIEW_ID, VARIABLES_VIEW_ID, VIEWLET_ID, WATCH_VIEW_ID, getStateLabel } from '../common/debug.js';
import { DebugWatchAccessibilityAnnouncer } from '../common/debugAccessibilityAnnouncer.js';
import { DebugContentProvider } from '../common/debugContentProvider.js';
import { DebugLifecycle } from '../common/debugLifecycle.js';
import { DebugVisualizerService, IDebugVisualizerService } from '../common/debugVisualizers.js';
import { DisassemblyViewInput } from '../common/disassemblyViewInput.js';
import { ReplAccessibilityAnnouncer } from '../common/replAccessibilityAnnouncer.js';
import { BreakpointEditorContribution } from './breakpointEditorContribution.js';
import { BreakpointsView } from './breakpointsView.js';
import { CallStackEditorContribution } from './callStackEditorContribution.js';
import { CallStackView } from './callStackView.js';
import { registerColors } from './debugColors.js';
import { ADD_CONFIGURATION_ID, ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, CALLSTACK_BOTTOM_ID, CALLSTACK_BOTTOM_LABEL, CALLSTACK_DOWN_ID, CALLSTACK_DOWN_LABEL, CALLSTACK_TOP_ID, CALLSTACK_TOP_LABEL, CALLSTACK_UP_ID, CALLSTACK_UP_LABEL, CONTINUE_ID, CONTINUE_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_STACK_TRACE_ID, COPY_VALUE_ID, COPY_VALUE_LABEL, DEBUG_COMMAND_CATEGORY, DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, DEBUG_QUICK_ACCESS_PREFIX, DEBUG_RUN_COMMAND_ID, DEBUG_RUN_LABEL, DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, EDIT_EXPRESSION_COMMAND_ID, JUMP_TO_CURSOR_ID, NEXT_DEBUG_CONSOLE_ID, NEXT_DEBUG_CONSOLE_LABEL, OPEN_LOADED_SCRIPTS_LABEL, PAUSE_ID, PAUSE_LABEL, PREV_DEBUG_CONSOLE_ID, PREV_DEBUG_CONSOLE_LABEL, REMOVE_EXPRESSION_COMMAND_ID, RESTART_FRAME_ID, RESTART_LABEL, RESTART_SESSION_ID, SELECT_AND_START_ID, SELECT_AND_START_LABEL, SELECT_DEBUG_CONSOLE_ID, SELECT_DEBUG_CONSOLE_LABEL, SELECT_DEBUG_SESSION_ID, SELECT_DEBUG_SESSION_LABEL, SET_EXPRESSION_COMMAND_ID, SHOW_LOADED_SCRIPTS_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_INTO_TARGET_ID, STEP_INTO_TARGET_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL, TERMINATE_THREAD_ID, TOGGLE_INLINE_BREAKPOINT_ID, COPY_ADDRESS_ID, COPY_ADDRESS_LABEL, TOGGLE_BREAKPOINT_ID, BREAK_WHEN_VALUE_CHANGES_ID, BREAK_WHEN_VALUE_IS_ACCESSED_ID, BREAK_WHEN_VALUE_IS_READ_ID } from './debugCommands.js';
import { DebugConsoleQuickAccess } from './debugConsoleQuickAccess.js';
import { RunToCursorAction, SelectionToReplAction, SelectionToWatchExpressionsAction } from './debugEditorActions.js';
import { DebugEditorContribution } from './debugEditorContribution.js';
import * as icons from './debugIcons.js';
import { DebugProgressContribution } from './debugProgress.js';
import { StartDebugQuickAccessProvider } from './debugQuickAccess.js';
import { DebugService } from './debugService.js';
import './debugSettingMigration.js';
import { DebugStatusContribution } from './debugStatus.js';
import { DebugTitleContribution } from './debugTitle.js';
import { DebugToolBar } from './debugToolBar.js';
import { DebugViewPaneContainer } from './debugViewlet.js';
import { DisassemblyView, DisassemblyViewContribution } from './disassemblyView.js';
import { LoadedScriptsView } from './loadedScriptsView.js';
import './media/debug.contribution.css';
import './media/debugHover.css';
import { Repl } from './repl.js';
import { ReplAccessibilityHelp } from './replAccessibilityHelp.js';
import { ReplAccessibleView } from './replAccessibleView.js';
import { RunAndDebugAccessibilityHelp } from './runAndDebugAccessibilityHelp.js';
import { StatusBarColorProvider } from './statusbarColorProvider.js';
import { SET_VARIABLE_ID, VIEW_MEMORY_ID, VariablesView } from './variablesView.js';
import { ADD_WATCH_ID, ADD_WATCH_LABEL, REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, REMOVE_WATCH_EXPRESSIONS_LABEL, WatchExpressionsView } from './watchExpressionsView.js';
import { WelcomeView } from './welcomeView.js';
import { DebugChatContextContribution } from './debugChatIntegration.js';
const debugCategory = nls.localize('debugCategory', "Debug");
registerColors();
registerSingleton(IDebugService, DebugService, 1 /* InstantiationType.Delayed */);
registerSingleton(IDebugVisualizerService, DebugVisualizerService, 1 /* InstantiationType.Delayed */);
// Register Debug Workbench Contributions
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugStatusContribution, 4 /* LifecyclePhase.Eventually */);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugProgressContribution, 4 /* LifecyclePhase.Eventually */);
if (isWeb) {
    Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugTitleContribution, 4 /* LifecyclePhase.Eventually */);
}
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugToolBar, 3 /* LifecyclePhase.Restored */);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugContentProvider, 4 /* LifecyclePhase.Eventually */);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(StatusBarColorProvider, 4 /* LifecyclePhase.Eventually */);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisassemblyViewContribution, 4 /* LifecyclePhase.Eventually */);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugLifecycle, 4 /* LifecyclePhase.Eventually */);
registerWorkbenchContribution2(DebugChatContextContribution.ID, DebugChatContextContribution, 3 /* WorkbenchPhase.AfterRestored */);
// Register Quick Access
Registry.as(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
    ctor: StartDebugQuickAccessProvider,
    prefix: DEBUG_QUICK_ACCESS_PREFIX,
    contextKey: 'inLaunchConfigurationsPicker',
    placeholder: nls.localize('startDebugPlaceholder', "Type the name of a launch configuration to run."),
    helpEntries: [{
            description: nls.localize('startDebuggingHelp', "Start Debugging"),
            commandId: SELECT_AND_START_ID,
            commandCenterOrder: 50
        }]
});
// Register quick access for debug console
Registry.as(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
    ctor: DebugConsoleQuickAccess,
    prefix: DEBUG_CONSOLE_QUICK_ACCESS_PREFIX,
    contextKey: 'inDebugConsolePicker',
    placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type the name of a debug console to open."),
    helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Show All Debug Consoles"), commandId: SELECT_DEBUG_CONSOLE_ID }]
});
registerEditorContribution('editor.contrib.callStack', CallStackEditorContribution, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointEditorContribution, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorContribution(EDITOR_CONTRIBUTION_ID, DebugEditorContribution, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
const registerDebugCommandPaletteItem = (id, title, when, precondition) => {
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
        when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, when),
        group: debugCategory,
        command: {
            id,
            title,
            category: DEBUG_COMMAND_CATEGORY,
            precondition
        }
    });
};
registerDebugCommandPaletteItem(RESTART_SESSION_ID, RESTART_LABEL);
registerDebugCommandPaletteItem(TERMINATE_THREAD_ID, nls.localize2('terminateThread', "Terminate Thread"), CONTEXT_IN_DEBUG_MODE, CONTEXT_TERMINATE_THREADS_SUPPORTED);
registerDebugCommandPaletteItem(STEP_OVER_ID, STEP_OVER_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(STEP_INTO_ID, STEP_INTO_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(STEP_INTO_TARGET_ID, STEP_INTO_TARGET_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped')));
registerDebugCommandPaletteItem(STEP_OUT_ID, STEP_OUT_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(PAUSE_ID, PAUSE_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugCommandPaletteItem(DISCONNECT_ID, DISCONNECT_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED));
registerDebugCommandPaletteItem(DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH, ContextKeyExpr.and(CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED)));
registerDebugCommandPaletteItem(STOP_ID, STOP_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED));
registerDebugCommandPaletteItem(CONTINUE_ID, CONTINUE_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(JUMP_TO_CURSOR_ID, nls.localize2('jumpToCursor', "Jump to Cursor"), CONTEXT_JUMP_TO_CURSOR_SUPPORTED);
registerDebugCommandPaletteItem(JUMP_TO_CURSOR_ID, nls.localize2('SetNextStatement', "Set Next Statement"), CONTEXT_JUMP_TO_CURSOR_SUPPORTED);
registerDebugCommandPaletteItem(RunToCursorAction.ID, RunToCursorAction.LABEL, CONTEXT_DEBUGGERS_AVAILABLE);
registerDebugCommandPaletteItem(SelectionToReplAction.ID, SelectionToReplAction.LABEL, CONTEXT_IN_DEBUG_MODE);
registerDebugCommandPaletteItem(SelectionToWatchExpressionsAction.ID, SelectionToWatchExpressionsAction.LABEL);
registerDebugCommandPaletteItem(TOGGLE_INLINE_BREAKPOINT_ID, nls.localize2('inlineBreakpoint', "Inline Breakpoint"));
registerDebugCommandPaletteItem(DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(1 /* State.Initializing */))));
registerDebugCommandPaletteItem(DEBUG_RUN_COMMAND_ID, DEBUG_RUN_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(1 /* State.Initializing */))));
registerDebugCommandPaletteItem(SELECT_AND_START_ID, SELECT_AND_START_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(1 /* State.Initializing */))));
registerDebugCommandPaletteItem(NEXT_DEBUG_CONSOLE_ID, NEXT_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(PREV_DEBUG_CONSOLE_ID, PREV_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(SHOW_LOADED_SCRIPTS_ID, OPEN_LOADED_SCRIPTS_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_LOADED_SCRIPTS_SUPPORTED);
registerDebugCommandPaletteItem(SELECT_DEBUG_CONSOLE_ID, SELECT_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(SELECT_DEBUG_SESSION_ID, SELECT_DEBUG_SESSION_LABEL);
registerDebugCommandPaletteItem(CALLSTACK_TOP_ID, CALLSTACK_TOP_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_BOTTOM_ID, CALLSTACK_BOTTOM_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_UP_ID, CALLSTACK_UP_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_DOWN_ID, CALLSTACK_DOWN_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
// Debug callstack context menu
const registerDebugViewMenuItem = (menuId, id, title, order, when, precondition, group = 'navigation', icon) => {
    MenuRegistry.appendMenuItem(menuId, {
        group,
        when,
        order,
        icon,
        command: {
            id,
            title,
            icon,
            precondition
        }
    });
};
registerDebugViewMenuItem(MenuId.DebugCallStackContext, RESTART_SESSION_ID, RESTART_LABEL, 10, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugCallStackContext, DISCONNECT_ID, DISCONNECT_LABEL, 20, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugCallStackContext, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, 21, ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugCallStackContext, STOP_ID, STOP_LABEL, 30, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugCallStackContext, PAUSE_ID, PAUSE_LABEL, 10, ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated())));
registerDebugViewMenuItem(MenuId.DebugCallStackContext, CONTINUE_ID, CONTINUE_LABEL, 10, ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), CONTEXT_DEBUG_STATE.isEqualTo('stopped')));
registerDebugViewMenuItem(MenuId.DebugCallStackContext, STEP_OVER_ID, STEP_OVER_LABEL, 20, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugViewMenuItem(MenuId.DebugCallStackContext, STEP_INTO_ID, STEP_INTO_LABEL, 30, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugViewMenuItem(MenuId.DebugCallStackContext, STEP_OUT_ID, STEP_OUT_LABEL, 40, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugViewMenuItem(MenuId.DebugCallStackContext, TERMINATE_THREAD_ID, nls.localize('terminateThread', "Terminate Thread"), 10, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), CONTEXT_TERMINATE_THREADS_SUPPORTED, 'termination');
registerDebugViewMenuItem(MenuId.DebugCallStackContext, RESTART_FRAME_ID, nls.localize('restartFrame', "Restart Frame"), 10, ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('stackFrame'), CONTEXT_RESTART_FRAME_SUPPORTED), CONTEXT_STACK_FRAME_SUPPORTS_RESTART);
registerDebugViewMenuItem(MenuId.DebugCallStackContext, COPY_STACK_TRACE_ID, nls.localize('copyStackTrace', "Copy Call Stack"), 20, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('stackFrame'), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, VIEW_MEMORY_ID, nls.localize('viewMemory', "View Binary Data"), 15, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_IN_DEBUG_MODE, 'inline', icons.debugInspectMemory);
registerDebugViewMenuItem(MenuId.DebugVariablesContext, SET_VARIABLE_ID, nls.localize('setValue', "Set Value"), 10, ContextKeyExpr.or(CONTEXT_SET_VARIABLE_SUPPORTED, ContextKeyExpr.and(CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_SET_EXPRESSION_SUPPORTED)), CONTEXT_VARIABLE_IS_READONLY.toNegated(), '3_modification');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, COPY_VALUE_ID, COPY_VALUE_LABEL, 10, undefined, undefined, '5_cutcopypaste');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, 20, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, undefined, '5_cutcopypaste');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, 100, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, BREAK_WHEN_VALUE_IS_READ_ID, nls.localize('breakWhenValueIsRead', "Break on Value Read"), 200, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, BREAK_WHEN_VALUE_CHANGES_ID, nls.localize('breakWhenValueChanges', "Break on Value Change"), 210, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugVariablesContext, BREAK_WHEN_VALUE_IS_ACCESSED_ID, nls.localize('breakWhenValueIsAccessed', "Break on Value Access"), 220, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugHoverContext, VIEW_MEMORY_ID, nls.localize('viewMemory', "View Binary Data"), 15, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_IN_DEBUG_MODE, 'inline', icons.debugInspectMemory);
registerDebugViewMenuItem(MenuId.DebugHoverContext, COPY_VALUE_ID, COPY_VALUE_LABEL, 10, undefined, undefined, '5_cutcopypaste');
registerDebugViewMenuItem(MenuId.DebugHoverContext, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, 20, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, undefined, '5_cutcopypaste');
registerDebugViewMenuItem(MenuId.DebugHoverContext, ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, 100, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugHoverContext, BREAK_WHEN_VALUE_IS_READ_ID, nls.localize('breakWhenValueIsRead', "Break on Value Read"), 200, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugHoverContext, BREAK_WHEN_VALUE_CHANGES_ID, nls.localize('breakWhenValueChanges', "Break on Value Change"), 210, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugHoverContext, BREAK_WHEN_VALUE_IS_ACCESSED_ID, nls.localize('breakWhenValueIsAccessed', "Break on Value Access"), 220, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugWatchContext, ADD_WATCH_ID, ADD_WATCH_LABEL, 10, undefined, undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugWatchContext, EDIT_EXPRESSION_COMMAND_ID, nls.localize('editWatchExpression', "Edit Expression"), 20, CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression'), undefined, '3_modification');
registerDebugViewMenuItem(MenuId.DebugWatchContext, SET_EXPRESSION_COMMAND_ID, nls.localize('setValue', "Set Value"), 30, ContextKeyExpr.or(ContextKeyExpr.and(CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression'), CONTEXT_SET_EXPRESSION_SUPPORTED), ContextKeyExpr.and(CONTEXT_WATCH_ITEM_TYPE.isEqualTo('variable'), CONTEXT_SET_VARIABLE_SUPPORTED)), CONTEXT_VARIABLE_IS_READONLY.toNegated(), '3_modification');
registerDebugViewMenuItem(MenuId.DebugWatchContext, COPY_VALUE_ID, nls.localize('copyValue', "Copy Value"), 40, ContextKeyExpr.or(CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression'), CONTEXT_WATCH_ITEM_TYPE.isEqualTo('variable')), CONTEXT_IN_DEBUG_MODE, '3_modification');
registerDebugViewMenuItem(MenuId.DebugWatchContext, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, 50, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_IN_DEBUG_MODE, '3_modification');
registerDebugViewMenuItem(MenuId.DebugWatchContext, VIEW_MEMORY_ID, nls.localize('viewMemory', "View Binary Data"), 10, CONTEXT_CAN_VIEW_MEMORY, undefined, 'inline', icons.debugInspectMemory);
registerDebugViewMenuItem(MenuId.DebugWatchContext, REMOVE_EXPRESSION_COMMAND_ID, nls.localize('removeWatchExpression', "Remove Expression"), 20, CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression'), undefined, 'inline', icons.watchExpressionRemove);
registerDebugViewMenuItem(MenuId.DebugWatchContext, REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, REMOVE_WATCH_EXPRESSIONS_LABEL, 20, undefined, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugWatchContext, BREAK_WHEN_VALUE_IS_READ_ID, nls.localize('breakWhenValueIsRead', "Break on Value Read"), 200, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugWatchContext, BREAK_WHEN_VALUE_CHANGES_ID, nls.localize('breakWhenValueChanges', "Break on Value Change"), 210, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.DebugWatchContext, BREAK_WHEN_VALUE_IS_ACCESSED_ID, nls.localize('breakWhenValueIsAccessed', "Break on Value Access"), 220, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, undefined, 'z_commands');
registerDebugViewMenuItem(MenuId.NotebookVariablesContext, COPY_NOTEBOOK_VARIABLE_VALUE_ID, COPY_NOTEBOOK_VARIABLE_VALUE_LABEL, 20, CONTEXT_VARIABLE_VALUE);
KeybindingsRegistry.registerKeybindingRule({
    id: COPY_VALUE_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: ContextKeyExpr.and(CONTEXT_EXPRESSION_SELECTED.negate(), ContextKeyExpr.or(FocusedViewContext.isEqualTo(WATCH_VIEW_ID), FocusedViewContext.isEqualTo(VARIABLES_VIEW_ID))),
    primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */
});
// Touch Bar
if (isMacintosh) {
    const registerTouchBarEntry = (id, title, order, when, iconUri) => {
        MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
            command: {
                id,
                title,
                icon: { dark: iconUri }
            },
            when: ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, when),
            group: '9_debug',
            order
        });
    };
    registerTouchBarEntry(DEBUG_RUN_COMMAND_ID, DEBUG_RUN_LABEL, 0, CONTEXT_IN_DEBUG_MODE.toNegated(), FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/continue-tb.png'));
    registerTouchBarEntry(DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, 1, CONTEXT_IN_DEBUG_MODE.toNegated(), FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/run-with-debugging-tb.png'));
    registerTouchBarEntry(CONTINUE_ID, CONTINUE_LABEL, 0, CONTEXT_DEBUG_STATE.isEqualTo('stopped'), FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/continue-tb.png'));
    registerTouchBarEntry(PAUSE_ID, PAUSE_LABEL, 1, ContextKeyExpr.and(CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated())), FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/pause-tb.png'));
    registerTouchBarEntry(STEP_OVER_ID, STEP_OVER_LABEL, 2, CONTEXT_IN_DEBUG_MODE, FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/stepover-tb.png'));
    registerTouchBarEntry(STEP_INTO_ID, STEP_INTO_LABEL, 3, CONTEXT_IN_DEBUG_MODE, FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/stepinto-tb.png'));
    registerTouchBarEntry(STEP_OUT_ID, STEP_OUT_LABEL, 4, CONTEXT_IN_DEBUG_MODE, FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/stepout-tb.png'));
    registerTouchBarEntry(RESTART_SESSION_ID, RESTART_LABEL, 5, CONTEXT_IN_DEBUG_MODE, FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/restart-tb.png'));
    registerTouchBarEntry(STOP_ID, STOP_LABEL, 6, CONTEXT_IN_DEBUG_MODE, FileAccess.asFileUri('vs/workbench/contrib/debug/browser/media/stop-tb.png'));
}
// Editor Title Menu's "Run/Debug" dropdown item
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { submenu: MenuId.EditorTitleRun, isSplitButton: { togglePrimaryAction: true }, title: nls.localize2('run', "Run or Debug..."), icon: icons.debugRun, group: 'navigation', order: -1 });
// Debug menu
MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
    submenu: MenuId.MenubarDebugMenu,
    title: {
        ...nls.localize2('runMenu', "Run"),
        mnemonicTitle: nls.localize({ key: 'mRun', comment: ['&& denotes a mnemonic'] }, "&&Run")
    },
    order: 6,
    when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '1_debug',
    command: {
        id: DEBUG_START_COMMAND_ID,
        title: nls.localize({ key: 'miStartDebugging', comment: ['&& denotes a mnemonic'] }, "&&Start Debugging")
    },
    order: 1,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '1_debug',
    command: {
        id: DEBUG_RUN_COMMAND_ID,
        title: nls.localize({ key: 'miRun', comment: ['&& denotes a mnemonic'] }, "Run &&Without Debugging")
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '1_debug',
    command: {
        id: STOP_ID,
        title: nls.localize({ key: 'miStopDebugging', comment: ['&& denotes a mnemonic'] }, "&&Stop Debugging"),
        precondition: CONTEXT_IN_DEBUG_MODE
    },
    order: 3,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '1_debug',
    command: {
        id: RESTART_SESSION_ID,
        title: nls.localize({ key: 'miRestart Debugging', comment: ['&& denotes a mnemonic'] }, "&&Restart Debugging"),
        precondition: CONTEXT_IN_DEBUG_MODE
    },
    order: 4,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
// Configuration
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '2_configuration',
    command: {
        id: ADD_CONFIGURATION_ID,
        title: nls.localize({ key: 'miAddConfiguration', comment: ['&& denotes a mnemonic'] }, "A&&dd Configuration...")
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
// Step Commands
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '3_step',
    command: {
        id: STEP_OVER_ID,
        title: nls.localize({ key: 'miStepOver', comment: ['&& denotes a mnemonic'] }, "Step &&Over"),
        precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
    },
    order: 1,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '3_step',
    command: {
        id: STEP_INTO_ID,
        title: nls.localize({ key: 'miStepInto', comment: ['&& denotes a mnemonic'] }, "Step &&Into"),
        precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '3_step',
    command: {
        id: STEP_OUT_ID,
        title: nls.localize({ key: 'miStepOut', comment: ['&& denotes a mnemonic'] }, "Step O&&ut"),
        precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
    },
    order: 3,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '3_step',
    command: {
        id: CONTINUE_ID,
        title: nls.localize({ key: 'miContinue', comment: ['&& denotes a mnemonic'] }, "&&Continue"),
        precondition: CONTEXT_DEBUG_STATE.isEqualTo('stopped')
    },
    order: 4,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
// New Breakpoints
MenuRegistry.appendMenuItem(MenuId.MenubarNewBreakpointMenu, {
    group: '1_breakpoints',
    command: {
        id: TOGGLE_INLINE_BREAKPOINT_ID,
        title: nls.localize({ key: 'miInlineBreakpoint', comment: ['&& denotes a mnemonic'] }, "Inline Breakp&&oint")
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: '4_new_breakpoint',
    title: nls.localize({ key: 'miNewBreakpoint', comment: ['&& denotes a mnemonic'] }, "&&New Breakpoint"),
    submenu: MenuId.MenubarNewBreakpointMenu,
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
// Disassembly
MenuRegistry.appendMenuItem(MenuId.DebugDisassemblyContext, {
    group: '1_edit',
    command: {
        id: COPY_ADDRESS_ID,
        title: COPY_ADDRESS_LABEL,
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
MenuRegistry.appendMenuItem(MenuId.DebugDisassemblyContext, {
    group: '3_breakpoints',
    command: {
        id: TOGGLE_BREAKPOINT_ID,
        title: nls.localize({ key: 'miToggleBreakpoint', comment: ['&& denotes a mnemonic'] }, "Toggle Breakpoint"),
    },
    order: 2,
    when: CONTEXT_DEBUGGERS_AVAILABLE
});
// Breakpoint actions are registered from breakpointsView.ts
// Install Debuggers
MenuRegistry.appendMenuItem(MenuId.MenubarDebugMenu, {
    group: 'z_install',
    command: {
        id: 'debug.installAdditionalDebuggers',
        title: nls.localize({ key: 'miInstallAdditionalDebuggers', comment: ['&& denotes a mnemonic'] }, "&&Install Additional Debuggers...")
    },
    order: 1
});
// register repl panel
const VIEW_CONTAINER = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: DEBUG_PANEL_ID,
    title: nls.localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, "Debug Console"),
    icon: icons.debugConsoleViewIcon,
    ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DEBUG_PANEL_ID, { mergeViewWithContainerWhenSingleView: true }]),
    storageId: DEBUG_PANEL_ID,
    hideIfEmpty: true,
    order: 2,
}, 1 /* ViewContainerLocation.Panel */, { doNotRegisterOpenCommand: true });
Registry.as(ViewExtensions.ViewsRegistry).registerViews([{
        id: REPL_VIEW_ID,
        name: nls.localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, "Debug Console"),
        containerIcon: icons.debugConsoleViewIcon,
        canToggleVisibility: true,
        canMoveView: true,
        when: CONTEXT_DEBUGGERS_AVAILABLE,
        ctorDescriptor: new SyncDescriptor(Repl),
        openCommandActionDescriptor: {
            id: 'workbench.debug.action.toggleRepl',
            mnemonicTitle: nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console"),
            keybindings: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 55 /* KeyCode.KeyY */ },
            order: 2
        }
    }], VIEW_CONTAINER);
const viewContainer = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer({
    id: VIEWLET_ID,
    title: nls.localize2('run and debug', "Run and Debug"),
    openCommandActionDescriptor: {
        id: VIEWLET_ID,
        mnemonicTitle: nls.localize({ key: 'miViewRun', comment: ['&& denotes a mnemonic'] }, "&&Run"),
        keybindings: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 34 /* KeyCode.KeyD */ },
        order: 3
    },
    ctorDescriptor: new SyncDescriptor(DebugViewPaneContainer),
    icon: icons.runViewIcon,
    alwaysUseContainerInfo: true,
    order: 3,
}, 0 /* ViewContainerLocation.Sidebar */);
// Register default debug views
const viewsRegistry = Registry.as(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([{ id: VARIABLES_VIEW_ID, name: nls.localize2('variables', "Variables"), containerIcon: icons.variablesViewIcon, ctorDescriptor: new SyncDescriptor(VariablesView), order: 10, weight: 40, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusVariablesView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: WATCH_VIEW_ID, name: nls.localize2('watch', "Watch"), containerIcon: icons.watchViewIcon, ctorDescriptor: new SyncDescriptor(WatchExpressionsView), order: 20, weight: 10, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusWatchView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: CALLSTACK_VIEW_ID, name: nls.localize2('callStack', "Call Stack"), containerIcon: icons.callStackViewIcon, ctorDescriptor: new SyncDescriptor(CallStackView), order: 30, weight: 30, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusCallStackView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: BREAKPOINTS_VIEW_ID, name: nls.localize2('breakpoints', "Breakpoints"), containerIcon: icons.breakpointsViewIcon, ctorDescriptor: new SyncDescriptor(BreakpointsView), order: 40, weight: 20, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusBreakpointsView' }, when: ContextKeyExpr.or(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_DEBUG_UX.isEqualTo('default'), CONTEXT_HAS_DEBUGGED) }], viewContainer);
viewsRegistry.registerViews([{ id: WelcomeView.ID, name: WelcomeView.LABEL, containerIcon: icons.runViewIcon, ctorDescriptor: new SyncDescriptor(WelcomeView), order: 1, weight: 40, canToggleVisibility: true, when: CONTEXT_DEBUG_UX.isEqualTo('simple') }], viewContainer);
viewsRegistry.registerViews([{ id: LOADED_SCRIPTS_VIEW_ID, name: nls.localize2('loadedScripts', "Loaded Scripts"), containerIcon: icons.loadedScriptsViewIcon, ctorDescriptor: new SyncDescriptor(LoadedScriptsView), order: 35, weight: 5, canToggleVisibility: true, canMoveView: true, collapsed: true, when: ContextKeyExpr.and(CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_DEBUG_UX.isEqualTo('default')) }], viewContainer);
// Register disassembly view
Registry.as(EditorExtensions.EditorPane).registerEditorPane(EditorPaneDescriptor.create(DisassemblyView, DISASSEMBLY_VIEW_ID, nls.localize('disassembly', "Disassembly")), [new SyncDescriptor(DisassemblyViewInput)]);
// Register configuration
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
    id: 'debug',
    order: 20,
    title: nls.localize('debugConfigurationTitle', "Debug"),
    type: 'object',
    properties: {
        'debug.showVariableTypes': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'showVariableTypes' }, "Show variable type in variable pane during debug session"),
            default: false
        },
        'debug.allowBreakpointsEverywhere': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'allowBreakpointsEverywhere' }, "Allow setting breakpoints in any file."),
            default: false
        },
        'debug.gutterMiddleClickAction': {
            type: 'string',
            enum: ['logpoint', 'conditionalBreakpoint', 'triggeredBreakpoint', 'none'],
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'gutterMiddleClickAction' }, 'Controls the action to perform when clicking the editor gutter with the middle mouse button.'),
            enumDescriptions: [
                nls.localize('debug.gutterMiddleClickAction.logpoint', "Add Logpoint."),
                nls.localize('debug.gutterMiddleClickAction.conditionalBreakpoint', "Add Conditional Breakpoint."),
                nls.localize('debug.gutterMiddleClickAction.triggeredBreakpoint', "Add Triggered Breakpoint."),
                nls.localize('debug.gutterMiddleClickAction.none', "Don't perform any action."),
            ],
            default: 'logpoint',
        },
        'debug.openExplorerOnEnd': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'openExplorerOnEnd' }, "Automatically open the explorer view at the end of a debug session."),
            default: false
        },
        'debug.closeReadonlyTabsOnEnd': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'closeReadonlyTabsOnEnd' }, "At the end of a debug session, all the read-only tabs associated with that session will be closed"),
            default: false
        },
        'debug.inlineValues': {
            type: 'string',
            'enum': ['on', 'off', 'auto'],
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'inlineValues' }, "Show variable values inline in editor while debugging."),
            'enumDescriptions': [
                nls.localize('inlineValues.on', "Always show variable values inline in editor while debugging."),
                nls.localize('inlineValues.off', "Never show variable values inline in editor while debugging."),
                nls.localize('inlineValues.focusNoScroll', "Show variable values inline in editor while debugging when the language supports inline value locations."),
            ],
            default: 'auto'
        },
        'debug.toolBarLocation': {
            enum: ['floating', 'docked', 'commandCenter', 'hidden'],
            markdownDescription: nls.localize({ comment: ['This is the description for a setting'], key: 'toolBarLocation' }, "Controls the location of the debug toolbar. Either `floating` in all views, `docked` in the debug view, `commandCenter` (requires {0}), or `hidden`.", '`#window.commandCenter#`'),
            default: 'floating',
            markdownEnumDescriptions: [
                nls.localize('debugToolBar.floating', "Show debug toolbar in all views."),
                nls.localize('debugToolBar.docked', "Show debug toolbar only in debug views."),
                nls.localize('debugToolBar.commandCenter', "`(Experimental)` Show debug toolbar in the command center."),
                nls.localize('debugToolBar.hidden', "Do not show debug toolbar."),
            ]
        },
        'debug.showInStatusBar': {
            enum: ['never', 'always', 'onFirstSessionStart'],
            enumDescriptions: [nls.localize('never', "Never show debug item in status bar"), nls.localize('always', "Always show debug item in status bar"), nls.localize('onFirstSessionStart', "Show debug item in status bar only after debug was started for the first time")],
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'showInStatusBar' }, "Controls when the debug status bar item should be visible."),
            default: 'onFirstSessionStart'
        },
        'debug.internalConsoleOptions': INTERNAL_CONSOLE_OPTIONS_SCHEMA,
        'debug.console.closeOnEnd': {
            type: 'boolean',
            description: nls.localize('debug.console.closeOnEnd', "Controls if the Debug Console should be automatically closed when the debug session ends."),
            default: false
        },
        'debug.terminal.clearBeforeReusing': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'debug.terminal.clearBeforeReusing' }, "Before starting a new debug session in an integrated or external terminal, clear the terminal."),
            default: false
        },
        'debug.openDebug': {
            enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart', 'openOnDebugBreak'],
            default: 'openOnDebugBreak',
            description: nls.localize('openDebug', "Controls when the debug view should open.")
        },
        'debug.showSubSessionsInToolBar': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'showSubSessionsInToolBar' }, "Controls whether the debug sub-sessions are shown in the debug tool bar. When this setting is false the stop command on a sub-session will also stop the parent session."),
            default: false
        },
        'debug.console.fontSize': {
            type: 'number',
            description: nls.localize('debug.console.fontSize', "Controls the font size in pixels in the Debug Console."),
            default: isMacintosh ? 12 : 14,
        },
        'debug.console.fontFamily': {
            type: 'string',
            description: nls.localize('debug.console.fontFamily', "Controls the font family in the Debug Console."),
            default: 'default'
        },
        'debug.console.lineHeight': {
            type: 'number',
            description: nls.localize('debug.console.lineHeight', "Controls the line height in pixels in the Debug Console. Use 0 to compute the line height from the font size."),
            default: 0
        },
        'debug.console.wordWrap': {
            type: 'boolean',
            description: nls.localize('debug.console.wordWrap', "Controls if the lines should wrap in the Debug Console."),
            default: true
        },
        'debug.console.historySuggestions': {
            type: 'boolean',
            description: nls.localize('debug.console.historySuggestions', "Controls if the Debug Console should suggest previously typed input."),
            default: true
        },
        'debug.console.collapseIdenticalLines': {
            type: 'boolean',
            description: nls.localize('debug.console.collapseIdenticalLines', "Controls if the Debug Console should collapse identical lines and show a number of occurrences with a badge."),
            default: true
        },
        'debug.console.acceptSuggestionOnEnter': {
            enum: ['off', 'on'],
            description: nls.localize('debug.console.acceptSuggestionOnEnter', "Controls whether suggestions should be accepted on Enter in the Debug Console. Enter is also used to evaluate whatever is typed in the Debug Console."),
            default: 'off'
        },
        'debug.console.maximumLines': {
            type: 'number',
            description: nls.localize('debug.console.maximumLines', "Controls the maximum number of lines in the Debug Console."),
            default: 10000
        },
        'launch': {
            type: 'object',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'launch' }, "Global debug launch configuration. Should be used as an alternative to 'launch.json' that is shared across workspaces."),
            default: { configurations: [], compounds: [] },
            $ref: launchSchemaId,
            disallowConfigurationDefault: true
        },
        'debug.focusWindowOnBreak': {
            type: 'boolean',
            description: nls.localize('debug.focusWindowOnBreak', "Controls whether the workbench window should be focused when the debugger breaks."),
            default: true
        },
        'debug.focusEditorOnBreak': {
            type: 'boolean',
            description: nls.localize('debug.focusEditorOnBreak', "Controls whether the editor should be focused when the debugger breaks."),
            default: true
        },
        'debug.onTaskErrors': {
            enum: ['debugAnyway', 'showErrors', 'prompt', 'abort'],
            enumDescriptions: [nls.localize('debugAnyway', "Ignore task errors and start debugging."), nls.localize('showErrors', "Show the Problems view and do not start debugging."), nls.localize('prompt', "Prompt user."), nls.localize('cancel', "Cancel debugging.")],
            description: nls.localize('debug.onTaskErrors', "Controls what to do when errors are encountered after running a preLaunchTask."),
            default: 'prompt'
        },
        'debug.showBreakpointsInOverviewRuler': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'showBreakpointsInOverviewRuler' }, "Controls whether breakpoints should be shown in the overview ruler."),
            default: false
        },
        'debug.breakpointsView.presentation': {
            type: 'string',
            description: nls.localize('debug.breakpointsView.presentation', "Controls whether breakpoints are displayed in a tree view grouped by file, or as a flat list."),
            enum: ['tree', 'list'],
            default: 'list'
        },
        'debug.showInlineBreakpointCandidates': {
            type: 'boolean',
            description: nls.localize({ comment: ['This is the description for a setting'], key: 'showInlineBreakpointCandidates' }, "Controls whether inline breakpoints candidate decorations should be shown in the editor while debugging."),
            default: true
        },
        'debug.saveBeforeStart': {
            description: nls.localize('debug.saveBeforeStart', "Controls what editors to save before starting a debug session."),
            enum: ['allEditorsInActiveGroup', 'nonUntitledEditorsInActiveGroup', 'none'],
            enumDescriptions: [
                nls.localize('debug.saveBeforeStart.allEditorsInActiveGroup', "Save all editors in the active group before starting a debug session."),
                nls.localize('debug.saveBeforeStart.nonUntitledEditorsInActiveGroup', "Save all editors in the active group except untitled ones before starting a debug session."),
                nls.localize('debug.saveBeforeStart.none', "Don't save any editors before starting a debug session."),
            ],
            default: 'allEditorsInActiveGroup',
            scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
        },
        'debug.confirmOnExit': {
            description: nls.localize('debug.confirmOnExit', "Controls whether to confirm when the window closes if there are active debug sessions."),
            type: 'string',
            enum: ['never', 'always'],
            enumDescriptions: [
                nls.localize('debug.confirmOnExit.never', "Never confirm."),
                nls.localize('debug.confirmOnExit.always', "Always confirm if there are debug sessions."),
            ],
            default: 'never'
        },
        'debug.disassemblyView.showSourceCode': {
            type: 'boolean',
            default: true,
            description: nls.localize('debug.disassemblyView.showSourceCode', "Show Source Code in Disassembly View.")
        },
        'debug.autoExpandLazyVariables': {
            type: 'string',
            enum: ['auto', 'on', 'off'],
            default: 'auto',
            enumDescriptions: [
                nls.localize('debug.autoExpandLazyVariables.auto', "When in screen reader optimized mode, automatically expand lazy variables."),
                nls.localize('debug.autoExpandLazyVariables.on', "Always automatically expand lazy variables."),
                nls.localize('debug.autoExpandLazyVariables.off', "Never automatically expand lazy variables.")
            ],
            description: nls.localize('debug.autoExpandLazyVariables', "Controls whether variables that are lazily resolved, such as getters, are automatically resolved and expanded by the debugger.")
        },
        'debug.enableStatusBarColor': {
            type: 'boolean',
            description: nls.localize('debug.enableStatusBarColor', "Color of the status bar when the debugger is active."),
            default: true
        },
        'debug.hideLauncherWhileDebugging': {
            type: 'boolean',
            markdownDescription: nls.localize({ comment: ['This is the description for a setting'], key: 'debug.hideLauncherWhileDebugging' }, "Hide 'Start Debugging' control in title bar of 'Run and Debug' view while debugging is active. Only relevant when {0} is not `docked`.", '`#debug.toolBarLocation#`'),
            default: false
        },
        'debug.hideSlowPreLaunchWarning': {
            type: 'boolean',
            markdownDescription: nls.localize('debug.hideSlowPreLaunchWarning', "Hide the warning shown when a `preLaunchTask` has been running for a while."),
            default: false
        }
    }
});
AccessibleViewRegistry.register(new ReplAccessibleView());
AccessibleViewRegistry.register(new ReplAccessibilityHelp());
AccessibleViewRegistry.register(new RunAndDebugAccessibilityHelp());
registerWorkbenchContribution2(ReplAccessibilityAnnouncer.ID, ReplAccessibilityAnnouncer, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(DebugWatchAccessibilityAnnouncer.ID, DebugWatchAccessibilityAnnouncer, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWcuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Zy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFekUsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzdILE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sc0VBQXNFLENBQUM7QUFFOUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUE4QyxNQUFNLG9FQUFvRSxDQUFDO0FBQ3ZLLE9BQU8sRUFBRSxjQUFjLEVBQXdCLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQW9CLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUF3QixVQUFVLElBQUkscUJBQXFCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG9CQUFvQixFQUF1QixNQUFNLDRCQUE0QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1E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