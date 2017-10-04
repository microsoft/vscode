/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import { KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE } from 'vs/workbench/parts/terminal/common/terminal';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KillTerminalAction, CopyTerminalSelectionAction, CreateNewTerminalAction, FocusActiveTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction, FocusTerminalAtIndexAction, SelectDefaultShellWindowsTerminalAction, RunSelectedTextInTerminalAction, RunActiveFileInTerminalAction, ScrollDownTerminalAction, ScrollDownPageTerminalAction, ScrollToBottomTerminalAction, ScrollUpTerminalAction, ScrollUpPageTerminalAction, ScrollToTopTerminalAction, TerminalPasteAction, ToggleTerminalAction, ClearTerminalAction, AllowWorkspaceShellTerminalCommand, DisallowWorkspaceShellTerminalCommand, RenameTerminalAction, SelectAllTerminalAction, FocusTerminalFindWidgetAction, HideTerminalFindWidgetAction, ShowNextFindTermTerminalFindWidgetAction, ShowPreviousFindTermTerminalFindWidgetAction, DeleteWordLeftTerminalAction, DeleteWordRightTerminalAction } from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

export function setup(): void {
	registerCommands();
}

function registerCommands(): void {
	// On mac cmd+` is reserved to cycle between windows, that's why the keybindings use WinCtrl
	const category = nls.localize('terminalCategory', "Terminal");
	let actionRegistry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.LABEL), 'Terminal: Kill the Active Terminal Instance', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, CopyTerminalSelectionAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C }
	}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FOCUS)), 'Terminal: Copy Selection', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKTICK,
		mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_BACKTICK }
	}), 'Terminal: Create New Integrated Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusActiveTerminalAction, FocusActiveTerminalAction.ID, FocusActiveTerminalAction.LABEL), 'Terminal: Focus Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextTerminalAction, FocusNextTerminalAction.ID, FocusNextTerminalAction.LABEL), 'Terminal: Focus Next Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousTerminalAction, FocusPreviousTerminalAction.ID, FocusPreviousTerminalAction.LABEL), 'Terminal: Focus Previous Terminal', category);
	for (let i = 1; i < 10; i++) {
		actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusTerminalAtIndexAction, FocusTerminalAtIndexAction.getId(i), FocusTerminalAtIndexAction.getLabel(i)), 'Terminal: Focus Terminal ' + i, category);
	}
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TerminalPasteAction, TerminalPasteAction.ID, TerminalPasteAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V },
		// Don't apply to Mac since cmd+v works
		mac: { primary: null }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Paste into Active Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectAllTerminalAction, SelectAllTerminalAction.ID, SelectAllTerminalAction.LABEL, {
		// Don't use ctrl+a by default as that would override the common go to start
		// of prompt shell binding
		primary: null,
		// Technically this doesn't need to be here as it will fall back to this
		// behavior anyway when handed to xterm.js, having this handled by VS Code
		// makes it easier for users to see how it works though.
		mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_A }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select All', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(RunSelectedTextInTerminalAction, RunSelectedTextInTerminalAction.ID, RunSelectedTextInTerminalAction.LABEL), 'Terminal: Run Selected Text In Active Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(RunActiveFileInTerminalAction, RunActiveFileInTerminalAction.ID, RunActiveFileInTerminalAction.LABEL), 'Terminal: Run Active File In Active Terminal', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK,
		mac: { primary: KeyMod.WinCtrl | KeyCode.US_BACKTICK }
	}), 'View: Toggle Integrated Terminal', nls.localize('viewCategory', "View"));
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollDownTerminalAction, ScrollDownTerminalAction.ID, ScrollDownTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Down (Line)', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollDownPageTerminalAction, ScrollDownPageTerminalAction.ID, ScrollDownPageTerminalAction.LABEL, {
		primary: KeyMod.Shift | KeyCode.PageDown,
		mac: { primary: KeyCode.PageDown }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Down (Page)', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollToBottomTerminalAction, ScrollToBottomTerminalAction.ID, ScrollToBottomTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.End,
		linux: { primary: KeyMod.Shift | KeyCode.End }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll to Bottom', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollUpTerminalAction, ScrollUpTerminalAction.ID, ScrollUpTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Up (Line)', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollUpPageTerminalAction, ScrollUpPageTerminalAction.ID, ScrollUpPageTerminalAction.LABEL, {
		primary: KeyMod.Shift | KeyCode.PageUp,
		mac: { primary: KeyCode.PageUp }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Up (Page)', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollToTopTerminalAction, ScrollToTopTerminalAction.ID, ScrollToTopTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.Home,
		linux: { primary: KeyMod.Shift | KeyCode.Home }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll to Top', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClearTerminalAction, ClearTerminalAction.ID, ClearTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_K,
		linux: { primary: null }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KeybindingsRegistry.WEIGHT.workbenchContrib(1)), 'Terminal: Clear', category);
	if (platform.isWindows) {
		actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectDefaultShellWindowsTerminalAction, SelectDefaultShellWindowsTerminalAction.ID, SelectDefaultShellWindowsTerminalAction.LABEL), 'Terminal: Select Default Shell', category);
	}
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(AllowWorkspaceShellTerminalCommand, AllowWorkspaceShellTerminalCommand.ID, AllowWorkspaceShellTerminalCommand.LABEL), 'Terminal: Allow Workspace Shell Configuration', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DisallowWorkspaceShellTerminalCommand, DisallowWorkspaceShellTerminalCommand.ID, DisallowWorkspaceShellTerminalCommand.LABEL), 'Terminal: Disallow Workspace Shell Configuration', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(RenameTerminalAction, RenameTerminalAction.ID, RenameTerminalAction.LABEL), 'Terminal: Rename', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusTerminalFindWidgetAction, FocusTerminalFindWidgetAction.ID, FocusTerminalFindWidgetAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Find Widget', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(HideTerminalFindWidgetAction, HideTerminalFindWidgetAction.ID, HideTerminalFindWidgetAction.LABEL, {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE)), 'Terminal: Hide Find Widget', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowNextFindTermTerminalFindWidgetAction, ShowNextFindTermTerminalFindWidgetAction.ID, ShowNextFindTermTerminalFindWidgetAction.LABEL, {
		primary: KeyMod.Alt | KeyCode.DownArrow
	}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE)), 'Terminal: Show Next Find Term', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowPreviousFindTermTerminalFindWidgetAction, ShowPreviousFindTermTerminalFindWidgetAction.ID, ShowPreviousFindTermTerminalFindWidgetAction.LABEL, {
		primary: KeyMod.Alt | KeyCode.UpArrow
	}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE)), 'Terminal: Show Previous Find Term', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordLeftTerminalAction, DeleteWordLeftTerminalAction.ID, DeleteWordLeftTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.Backspace,
		mac: { primary: KeyMod.Alt | KeyCode.Backspace }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Left', category);
	actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordRightTerminalAction, DeleteWordRightTerminalAction.ID, DeleteWordRightTerminalAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.Delete,
		mac: { primary: KeyMod.Alt | KeyCode.Delete }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Right', category);
}