/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { FileAccess } from 'vs/base/common/network';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import 'vs/css!./media/debug.contribution';
import 'vs/css!./media/debugHover';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ICommandActionTitle, Icon } from 'vs/platform/action/common/action';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, ConfigurationScope, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IWorkbenchContributionsRegistry, registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { EditorExtensions } from 'vs/workbench/common/editor';
import { IViewContainersRegistry, IViewsRegistry, ViewContainer, ViewContainerLocation, Extensions as ViewExtensions } from 'vs/workbench/common/views';
import { BreakpointEditorContribution } from 'vs/workbench/contrib/debug/browser/breakpointEditorContribution';
import { BreakpointsView } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { CallStackEditorContribution } from 'vs/workbench/contrib/debug/browser/callStackEditorContribution';
import { CallStackView } from 'vs/workbench/contrib/debug/browser/callStackView';
import { ReplAccessibleView } from 'vs/workbench/contrib/debug/browser/replAccessibleView';
import { registerColors } from 'vs/workbench/contrib/debug/browser/debugColors';
import { ADD_CONFIGURATION_ID, ADD_TO_WATCH_ID, ADD_TO_WATCH_LABEL, CALLSTACK_BOTTOM_ID, CALLSTACK_BOTTOM_LABEL, CALLSTACK_DOWN_ID, CALLSTACK_DOWN_LABEL, CALLSTACK_TOP_ID, CALLSTACK_TOP_LABEL, CALLSTACK_UP_ID, CALLSTACK_UP_LABEL, CONTINUE_ID, CONTINUE_LABEL, COPY_EVALUATE_PATH_ID, COPY_EVALUATE_PATH_LABEL, COPY_STACK_TRACE_ID, COPY_VALUE_ID, COPY_VALUE_LABEL, DEBUG_COMMAND_CATEGORY, DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, DEBUG_QUICK_ACCESS_PREFIX, DEBUG_RUN_COMMAND_ID, DEBUG_RUN_LABEL, DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, EDIT_EXPRESSION_COMMAND_ID, FOCUS_REPL_ID, JUMP_TO_CURSOR_ID, NEXT_DEBUG_CONSOLE_ID, NEXT_DEBUG_CONSOLE_LABEL, OPEN_LOADED_SCRIPTS_LABEL, PAUSE_ID, PAUSE_LABEL, PREV_DEBUG_CONSOLE_ID, PREV_DEBUG_CONSOLE_LABEL, REMOVE_EXPRESSION_COMMAND_ID, RESTART_FRAME_ID, RESTART_LABEL, RESTART_SESSION_ID, SELECT_AND_START_ID, SELECT_AND_START_LABEL, SELECT_DEBUG_CONSOLE_ID, SELECT_DEBUG_CONSOLE_LABEL, SELECT_DEBUG_SESSION_ID, SELECT_DEBUG_SESSION_LABEL, SET_EXPRESSION_COMMAND_ID, SHOW_LOADED_SCRIPTS_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_INTO_TARGET_ID, STEP_INTO_TARGET_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL, TERMINATE_THREAD_ID, TOGGLE_INLINE_BREAKPOINT_ID } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { DebugConsoleQuickAccess } from 'vs/workbench/contrib/debug/browser/debugConsoleQuickAccess';
import { RunToCursorAction, SelectionToReplAction, SelectionToWatchExpressionsAction } from 'vs/workbench/contrib/debug/browser/debugEditorActions';
import { DebugEditorContribution } from 'vs/workbench/contrib/debug/browser/debugEditorContribution';
import * as icons from 'vs/workbench/contrib/debug/browser/debugIcons';
import { DebugProgressContribution } from 'vs/workbench/contrib/debug/browser/debugProgress';
import { StartDebugQuickAccessProvider } from 'vs/workbench/contrib/debug/browser/debugQuickAccess';
import { DebugService } from 'vs/workbench/contrib/debug/browser/debugService';
import { DebugStatusContribution } from 'vs/workbench/contrib/debug/browser/debugStatus';
import { DebugTitleContribution } from 'vs/workbench/contrib/debug/browser/debugTitle';
import { DebugToolBar } from 'vs/workbench/contrib/debug/browser/debugToolBar';
import { DebugViewPaneContainer } from 'vs/workbench/contrib/debug/browser/debugViewlet';
import { DisassemblyView, DisassemblyViewContribution } from 'vs/workbench/contrib/debug/browser/disassemblyView';
import { LoadedScriptsView } from 'vs/workbench/contrib/debug/browser/loadedScriptsView';
import { Repl } from 'vs/workbench/contrib/debug/browser/repl';
import { StatusBarColorProvider } from 'vs/workbench/contrib/debug/browser/statusbarColorProvider';
import { BREAK_WHEN_VALUE_CHANGES_ID, BREAK_WHEN_VALUE_IS_ACCESSED_ID, BREAK_WHEN_VALUE_IS_READ_ID, SET_VARIABLE_ID, VIEW_MEMORY_ID, VariablesView } from 'vs/workbench/contrib/debug/browser/variablesView';
import { ADD_WATCH_ID, ADD_WATCH_LABEL, REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, REMOVE_WATCH_EXPRESSIONS_LABEL, WatchExpressionsView } from 'vs/workbench/contrib/debug/browser/watchExpressionsView';
import { WelcomeView } from 'vs/workbench/contrib/debug/browser/welcomeView';
import { BREAKPOINTS_VIEW_ID, BREAKPOINT_EDITOR_CONTRIBUTION_ID, CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_BREAK_WHEN_VALUE_CHANGES_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_ACCESSED_SUPPORTED, CONTEXT_BREAK_WHEN_VALUE_IS_READ_SUPPORTED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CAN_VIEW_MEMORY, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_UX, CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_HAS_DEBUGGED, CONTEXT_IN_DEBUG_MODE, CONTEXT_JUMP_TO_CURSOR_SUPPORTED, CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_RESTART_FRAME_SUPPORTED, CONTEXT_SET_EXPRESSION_SUPPORTED, CONTEXT_SET_VARIABLE_SUPPORTED, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED, CONTEXT_VARIABLE_EVALUATE_NAME_PRESENT, CONTEXT_VARIABLE_IS_READONLY, CONTEXT_VARIABLE_VALUE, CONTEXT_WATCH_ITEM_TYPE, DEBUG_PANEL_ID, DISASSEMBLY_VIEW_ID, EDITOR_CONTRIBUTION_ID, IDebugService, INTERNAL_CONSOLE_OPTIONS_SCHEMA, LOADED_SCRIPTS_VIEW_ID, REPL_VIEW_ID, State, VARIABLES_VIEW_ID, VIEWLET_ID, WATCH_VIEW_ID, getStateLabel } from 'vs/workbench/contrib/debug/common/debug';
import { DebugContentProvider } from 'vs/workbench/contrib/debug/common/debugContentProvider';
import { DebugLifecycle } from 'vs/workbench/contrib/debug/common/debugLifecycle';
import { DebugVisualizerService, IDebugVisualizerService } from 'vs/workbench/contrib/debug/common/debugVisualizers';
import { DisassemblyViewInput } from 'vs/workbench/contrib/debug/common/disassemblyViewInput';
import { COPY_NOTEBOOK_VARIABLE_VALUE_ID, COPY_NOTEBOOK_VARIABLE_VALUE_LABEL } from 'vs/workbench/contrib/notebook/browser/contrib/notebookVariables/notebookVariableCommands';
import { launchSchemaId } from 'vs/workbench/services/configuration/common/configuration';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import './debugSettingMigration';
import { ReplAccessibilityHelp } from 'vs/workbench/contrib/debug/browser/replAccessibilityHelp';
import { ReplAccessibilityAnnouncer } from 'vs/workbench/contrib/debug/common/replAccessibilityAnnouncer';
import { RunAndDebugAccessibilityHelp } from 'vs/workbench/contrib/debug/browser/runAndDebugAccessibilityHelp';
import { DebugWatchAccessibilityAnnouncer } from 'vs/workbench/contrib/debug/common/debugAccessibilityAnnouncer';

const debugCategory = nls.localize('debugCategory', "Debug");
registerColors();
registerSingleton(IDebugService, DebugService, InstantiationType.Delayed);
registerSingleton(IDebugVisualizerService, DebugVisualizerService, InstantiationType.Delayed);

// Register Debug Workbench Contributions
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugStatusContribution, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugProgressContribution, LifecyclePhase.Eventually);
if (isWeb) {
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugTitleContribution, LifecyclePhase.Eventually);
}
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugToolBar, LifecyclePhase.Restored);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugContentProvider, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(StatusBarColorProvider, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DisassemblyViewContribution, LifecyclePhase.Eventually);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DebugLifecycle, LifecyclePhase.Eventually);

// Register Quick Access
Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
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
Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess).registerQuickAccessProvider({
	ctor: DebugConsoleQuickAccess,
	prefix: DEBUG_CONSOLE_QUICK_ACCESS_PREFIX,
	contextKey: 'inDebugConsolePicker',
	placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type the name of a debug console to open."),
	helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Show All Debug Consoles"), commandId: SELECT_DEBUG_CONSOLE_ID }]
});

registerEditorContribution('editor.contrib.callStack', CallStackEditorContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID, BreakpointEditorContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorContribution(EDITOR_CONTRIBUTION_ID, DebugEditorContribution, EditorContributionInstantiation.BeforeFirstInteraction);

const registerDebugCommandPaletteItem = (id: string, title: ICommandActionTitle, when?: ContextKeyExpression, precondition?: ContextKeyExpression) => {
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
registerDebugCommandPaletteItem(TERMINATE_THREAD_ID, nls.localize2('terminateThread', "Terminate Thread"), CONTEXT_IN_DEBUG_MODE);
registerDebugCommandPaletteItem(STEP_OVER_ID, STEP_OVER_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(STEP_INTO_ID, STEP_INTO_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(STEP_INTO_TARGET_ID, STEP_INTO_TARGET_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.and(CONTEXT_STEP_INTO_TARGETS_SUPPORTED, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped')));
registerDebugCommandPaletteItem(STEP_OUT_ID, STEP_OUT_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(PAUSE_ID, PAUSE_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.and(CONTEXT_DEBUG_STATE.isEqualTo('running'), CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated()));
registerDebugCommandPaletteItem(DISCONNECT_ID, DISCONNECT_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED));
registerDebugCommandPaletteItem(DISCONNECT_AND_SUSPEND_ID, DISCONNECT_AND_SUSPEND_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH, ContextKeyExpr.and(CONTEXT_SUSPEND_DEBUGGEE_SUPPORTED, CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED)));
registerDebugCommandPaletteItem(STOP_ID, STOP_LABEL, CONTEXT_IN_DEBUG_MODE, ContextKeyExpr.or(CONTEXT_FOCUSED_SESSION_IS_ATTACH.toNegated(), CONTEXT_TERMINATE_DEBUGGEE_SUPPORTED));
registerDebugCommandPaletteItem(CONTINUE_ID, CONTINUE_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(FOCUS_REPL_ID, nls.localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusConsole' }, "Focus on Debug Console View"));
registerDebugCommandPaletteItem(JUMP_TO_CURSOR_ID, nls.localize2('jumpToCursor', "Jump to Cursor"), CONTEXT_JUMP_TO_CURSOR_SUPPORTED);
registerDebugCommandPaletteItem(JUMP_TO_CURSOR_ID, nls.localize2('SetNextStatement', "Set Next Statement"), CONTEXT_JUMP_TO_CURSOR_SUPPORTED);
registerDebugCommandPaletteItem(RunToCursorAction.ID, RunToCursorAction.LABEL, CONTEXT_DEBUGGERS_AVAILABLE);
registerDebugCommandPaletteItem(SelectionToReplAction.ID, SelectionToReplAction.LABEL, CONTEXT_IN_DEBUG_MODE);
registerDebugCommandPaletteItem(SelectionToWatchExpressionsAction.ID, SelectionToWatchExpressionsAction.LABEL);
registerDebugCommandPaletteItem(TOGGLE_INLINE_BREAKPOINT_ID, nls.localize2('inlineBreakpoint', "Inline Breakpoint"));
registerDebugCommandPaletteItem(DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))));
registerDebugCommandPaletteItem(DEBUG_RUN_COMMAND_ID, DEBUG_RUN_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))));
registerDebugCommandPaletteItem(SELECT_AND_START_ID, SELECT_AND_START_LABEL, ContextKeyExpr.and(CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing))));
registerDebugCommandPaletteItem(NEXT_DEBUG_CONSOLE_ID, NEXT_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(PREV_DEBUG_CONSOLE_ID, PREV_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(SHOW_LOADED_SCRIPTS_ID, OPEN_LOADED_SCRIPTS_LABEL, CONTEXT_IN_DEBUG_MODE);
registerDebugCommandPaletteItem(SELECT_DEBUG_CONSOLE_ID, SELECT_DEBUG_CONSOLE_LABEL);
registerDebugCommandPaletteItem(SELECT_DEBUG_SESSION_ID, SELECT_DEBUG_SESSION_LABEL);
registerDebugCommandPaletteItem(CALLSTACK_TOP_ID, CALLSTACK_TOP_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_BOTTOM_ID, CALLSTACK_BOTTOM_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_UP_ID, CALLSTACK_UP_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));
registerDebugCommandPaletteItem(CALLSTACK_DOWN_ID, CALLSTACK_DOWN_LABEL, CONTEXT_IN_DEBUG_MODE, CONTEXT_DEBUG_STATE.isEqualTo('stopped'));

// Debug callstack context menu
const registerDebugViewMenuItem = (menuId: MenuId, id: string, title: string | ICommandActionTitle, order: number, when?: ContextKeyExpression, precondition?: ContextKeyExpression, group = 'navigation', icon?: Icon) => {
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
registerDebugViewMenuItem(MenuId.DebugCallStackContext, TERMINATE_THREAD_ID, nls.localize('terminateThread', "Terminate Thread"), 10, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), undefined, 'termination');
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
registerDebugViewMenuItem(MenuId.DebugWatchContext, VIEW_MEMORY_ID, nls.localize('viewMemory', "View Binary Data"), 10, CONTEXT_CAN_VIEW_MEMORY, undefined, 'inline', icons.debugInspectMemory);
registerDebugViewMenuItem(MenuId.DebugWatchContext, REMOVE_EXPRESSION_COMMAND_ID, nls.localize('removeWatchExpression', "Remove Expression"), 20, CONTEXT_WATCH_ITEM_TYPE.isEqualTo('expression'), undefined, 'inline', icons.watchExpressionRemove);
registerDebugViewMenuItem(MenuId.DebugWatchContext, REMOVE_WATCH_EXPRESSIONS_COMMAND_ID, REMOVE_WATCH_EXPRESSIONS_LABEL, 20, undefined, undefined, 'z_commands');

registerDebugViewMenuItem(MenuId.NotebookVariablesContext, COPY_NOTEBOOK_VARIABLE_VALUE_ID, COPY_NOTEBOOK_VARIABLE_VALUE_LABEL, 20, CONTEXT_VARIABLE_VALUE);

// Touch Bar
if (isMacintosh) {

	const registerTouchBarEntry = (id: string, title: string | ICommandActionTitle, order: number, when: ContextKeyExpression | undefined, iconUri: URI) => {
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

MenuRegistry.appendMenuItem(MenuId.EditorTitle, { submenu: MenuId.EditorTitleRun, rememberDefaultAction: true, title: nls.localize2('run', "Run or Debug..."), icon: icons.debugRun, group: 'navigation', order: -1 });

// Debug menu

MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuId.MenubarDebugMenu,
	title: {
		...nls.localize2('runMenu', "Run"),
		mnemonicTitle: nls.localize({ key: 'mRun', comment: ['&& denotes a mnemonic'] }, "&&Run")
	},
	order: 6
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

const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DEBUG_PANEL_ID,
	title: nls.localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, "Debug Console"),
	icon: icons.debugConsoleViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DEBUG_PANEL_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DEBUG_PANEL_ID,
	hideIfEmpty: true,
	order: 2,
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true });

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: REPL_VIEW_ID,
	name: nls.localize2({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugPanel' }, "Debug Console"),
	containerIcon: icons.debugConsoleViewIcon,
	canToggleVisibility: false,
	canMoveView: true,
	when: CONTEXT_DEBUGGERS_AVAILABLE,
	ctorDescriptor: new SyncDescriptor(Repl),
	openCommandActionDescriptor: {
		id: 'workbench.debug.action.toggleRepl',
		mnemonicTitle: nls.localize({ key: 'miToggleDebugConsole', comment: ['&& denotes a mnemonic'] }, "De&&bug Console"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyY },
		order: 2
	}
}], VIEW_CONTAINER);


const viewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: VIEWLET_ID,
	title: nls.localize2('run and debug', "Run and Debug"),
	openCommandActionDescriptor: {
		id: VIEWLET_ID,
		mnemonicTitle: nls.localize({ key: 'miViewRun', comment: ['&& denotes a mnemonic'] }, "&&Run"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyD },
		order: 3
	},
	ctorDescriptor: new SyncDescriptor(DebugViewPaneContainer),
	icon: icons.runViewIcon,
	alwaysUseContainerInfo: true,
	order: 3,
}, ViewContainerLocation.Sidebar);

// Register default debug views
const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([{ id: VARIABLES_VIEW_ID, name: nls.localize2('variables', "Variables"), containerIcon: icons.variablesViewIcon, ctorDescriptor: new SyncDescriptor(VariablesView), order: 10, weight: 40, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusVariablesView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: WATCH_VIEW_ID, name: nls.localize2('watch', "Watch"), containerIcon: icons.watchViewIcon, ctorDescriptor: new SyncDescriptor(WatchExpressionsView), order: 20, weight: 10, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusWatchView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: CALLSTACK_VIEW_ID, name: nls.localize2('callStack', "Call Stack"), containerIcon: icons.callStackViewIcon, ctorDescriptor: new SyncDescriptor(CallStackView), order: 30, weight: 30, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusCallStackView' }, when: CONTEXT_DEBUG_UX.isEqualTo('default') }], viewContainer);
viewsRegistry.registerViews([{ id: BREAKPOINTS_VIEW_ID, name: nls.localize2('breakpoints', "Breakpoints"), containerIcon: icons.breakpointsViewIcon, ctorDescriptor: new SyncDescriptor(BreakpointsView), order: 40, weight: 20, canToggleVisibility: true, canMoveView: true, focusCommand: { id: 'workbench.debug.action.focusBreakpointsView' }, when: ContextKeyExpr.or(CONTEXT_BREAKPOINTS_EXIST, CONTEXT_DEBUG_UX.isEqualTo('default'), CONTEXT_HAS_DEBUGGED) }], viewContainer);
viewsRegistry.registerViews([{ id: WelcomeView.ID, name: WelcomeView.LABEL, containerIcon: icons.runViewIcon, ctorDescriptor: new SyncDescriptor(WelcomeView), order: 1, weight: 40, canToggleVisibility: true, when: CONTEXT_DEBUG_UX.isEqualTo('simple') }], viewContainer);
viewsRegistry.registerViews([{ id: LOADED_SCRIPTS_VIEW_ID, name: nls.localize2('loadedScripts', "Loaded Scripts"), containerIcon: icons.loadedScriptsViewIcon, ctorDescriptor: new SyncDescriptor(LoadedScriptsView), order: 35, weight: 5, canToggleVisibility: true, canMoveView: true, collapsed: true, when: ContextKeyExpr.and(CONTEXT_LOADED_SCRIPTS_SUPPORTED, CONTEXT_DEBUG_UX.isEqualTo('default')) }], viewContainer);

// Register disassembly view

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(DisassemblyView, DISASSEMBLY_VIEW_ID, nls.localize('disassembly', "Disassembly")),
	[new SyncDescriptor(DisassemblyViewInput)]
);

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
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
			enumDescriptions: [nls.localize('never', "Never show debug in Status bar"), nls.localize('always', "Always show debug in Status bar"), nls.localize('onFirstSessionStart', "Show debug in Status bar only after debug was started for the first time")],
			description: nls.localize({ comment: ['This is the description for a setting'], key: 'showInStatusBar' }, "Controls when the debug Status bar should be visible."),
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
			scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
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
			description: nls.localize('debug.enableStatusBarColor', "Color of the Status bar when debugger is active."),
			default: true
		},
		'debug.hideLauncherWhileDebugging': {
			type: 'boolean',
			markdownDescription: nls.localize({ comment: ['This is the description for a setting'], key: 'debug.hideLauncherWhileDebugging' }, "Hide 'Start Debugging' control in title bar of 'Run and Debug' view while debugging is active. Only relevant when {0} is not `docked`.", '`#debug.toolBarLocation#`'),
			default: false
		}
	}
});

AccessibleViewRegistry.register(new ReplAccessibleView());
AccessibleViewRegistry.register(new ReplAccessibilityHelp());
AccessibleViewRegistry.register(new RunAndDebugAccessibilityHelp());
registerWorkbenchContribution2(ReplAccessibilityAnnouncer.ID, ReplAccessibilityAnnouncer, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DebugWatchAccessibilityAnnouncer.ID, DebugWatchAccessibilityAnnouncer, WorkbenchPhase.AfterRestored);
