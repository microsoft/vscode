/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scrollbar';
import 'vs/css!./media/terminal';
import 'vs/css!./media/xterm';
import 'vs/css!./media/widgets';
import * as debugActions from 'vs/workbench/parts/debug/browser/debugActions';
import * as nls from 'vs/nls';
import * as panel from 'vs/workbench/browser/panel';
import * as platform from 'vs/base/common/platform';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, TERMINAL_PANEL_ID, TERMINAL_DEFAULT_RIGHT_CLICK_COPY_PASTE, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, TerminalCursorStyle } from 'vs/workbench/parts/terminal/common/terminal';
import { TERMINAL_DEFAULT_SHELL_LINUX, TERMINAL_DEFAULT_SHELL_OSX, TERMINAL_DEFAULT_SHELL_WINDOWS } from 'vs/workbench/parts/terminal/electron-browser/terminal';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KillTerminalAction, CopyTerminalSelectionAction, CreateNewTerminalAction, FocusActiveTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction, FocusTerminalAtIndexAction, SelectDefaultShellWindowsTerminalAction, RunSelectedTextInTerminalAction, RunActiveFileInTerminalAction, ScrollDownTerminalAction, ScrollDownPageTerminalAction, ScrollToBottomTerminalAction, ScrollUpTerminalAction, ScrollUpPageTerminalAction, ScrollToTopTerminalAction, TerminalPasteAction, ToggleTerminalAction, ClearTerminalAction, AllowWorkspaceShellTerminalCommand, DisallowWorkspaceShellTerminalCommand, RenameTerminalAction, SelectAllTerminalAction, FocusTerminalFindWidgetAction, HideTerminalFindWidgetAction, DeleteWordLeftTerminalAction, DeleteWordRightTerminalAction, QuickOpenActionTermContributor, QuickOpenTermAction, TERMINAL_PICKER_PREFIX } from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ShowAllCommandsAction } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { TerminalService } from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { OpenNextRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction, FocusActiveGroupAction, FocusFirstGroupAction, FocusSecondGroupAction, FocusThirdGroupAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { registerColors } from './terminalColorRegistry';
import { NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction } from "vs/workbench/electron-browser/actions";
import { QUICKOPEN_ACTION_ID, getQuickNavigateHandler } from "vs/workbench/browser/parts/quickopen/quickopen";
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

const quickOpenRegistry = (<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen));

const inTerminalsPicker = 'inTerminalPicker';

quickOpenRegistry.registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/parts/terminal/browser/terminalQuickOpen',
		'TerminalPickerHandler',
		TERMINAL_PICKER_PREFIX,
		inTerminalsPicker,
		nls.localize('quickOpen.terminal', "Show All Opened Terminals")
	)
);

const quickOpenNavigateNextInTerminalPickerId = 'workbench.action.quickOpenNavigateNextInTerminalPicker';
CommandsRegistry.registerCommand(
	quickOpenNavigateNextInTerminalPickerId, { handler: getQuickNavigateHandler(quickOpenNavigateNextInTerminalPickerId, true) });

const quickOpenNavigatePreviousInTerminalPickerId = 'workbench.action.quickOpenNavigatePreviousInTerminalPicker';
CommandsRegistry.registerCommand(
	quickOpenNavigatePreviousInTerminalPickerId, { handler: getQuickNavigateHandler(quickOpenNavigatePreviousInTerminalPickerId, false) });


const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenTermAction, QuickOpenTermAction.ID, QuickOpenTermAction.LABEL), 'Quick Open Terminal');
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionTermContributor);

let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'terminal',
	'order': 100,
	'title': nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	'type': 'object',
	'properties': {
		'terminal.integrated.shell.linux': {
			'description': nls.localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_LINUX
		},
		'terminal.integrated.shellArgs.linux': {
			'description': nls.localize('terminal.integrated.shellArgs.linux', "The command line arguments to use when on the Linux terminal."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': []
		},
		'terminal.integrated.shell.osx': {
			'description': nls.localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on OS X."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_OSX
		},
		'terminal.integrated.shellArgs.osx': {
			'description': nls.localize('terminal.integrated.shellArgs.osx', "The command line arguments to use when on the OS X terminal."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			// Unlike on Linux, ~/.profile is not sourced when logging into a macOS session. This
			// is the reason terminals on macOS typically run login shells by default which set up
			// the environment. See http://unix.stackexchange.com/a/119675/115410
			'default': ['-l']
		},
		'terminal.integrated.shell.windows': {
			'description': nls.localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows. When using shells shipped with Windows (cmd, PowerShell or Bash on Ubuntu)."),
			'type': 'string',
			'default': TERMINAL_DEFAULT_SHELL_WINDOWS
		},
		'terminal.integrated.shellArgs.windows': {
			'description': nls.localize('terminal.integrated.shellArgs.windows', "The command line arguments to use when on the Windows terminal."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': []
		},
		'terminal.integrated.rightClickCopyPaste': {
			'description': nls.localize('terminal.integrated.rightClickCopyPaste', "When set, this will prevent the context menu from appearing when right clicking within the terminal, instead it will copy when there is a selection and paste when there is no selection."),
			'type': 'boolean',
			'default': TERMINAL_DEFAULT_RIGHT_CLICK_COPY_PASTE
		},
		'terminal.integrated.fontFamily': {
			'description': nls.localize('terminal.integrated.fontFamily', "Controls the font family of the terminal, this defaults to editor.fontFamily's value."),
			'type': 'string'
		},
		'terminal.integrated.fontLigatures': {
			'description': nls.localize('terminal.integrated.fontLigatures', "Controls whether font ligatures are enabled in the terminal."),
			'type': 'boolean',
			'default': false
		},
		'terminal.integrated.fontSize': {
			'description': nls.localize('terminal.integrated.fontSize', "Controls the font size in pixels of the terminal."),
			'type': 'number',
			'default': EDITOR_FONT_DEFAULTS.fontSize
		},
		'terminal.integrated.lineHeight': {
			'description': nls.localize('terminal.integrated.lineHeight', "Controls the line height of the terminal, this number is multipled by the terminal font size to get the actual line-height in pixels."),
			'type': 'number',
			'default': 1.2
		},
		'terminal.integrated.enableBold': {
			'type': 'boolean',
			'description': nls.localize('terminal.integrated.enableBold', "Whether to enable bold text within the terminal, this requires support from the terminal shell."),
			'default': true
		},
		'terminal.integrated.cursorBlinking': {
			'description': nls.localize('terminal.integrated.cursorBlinking', "Controls whether the terminal cursor blinks."),
			'type': 'boolean',
			'default': false
		},
		'terminal.integrated.cursorStyle': {
			'description': nls.localize('terminal.integrated.cursorStyle', "Controls the style of terminal cursor."),
			'enum': [TerminalCursorStyle.BLOCK, TerminalCursorStyle.LINE, TerminalCursorStyle.UNDERLINE],
			'default': TerminalCursorStyle.BLOCK
		},
		'terminal.integrated.scrollback': {
			'description': nls.localize('terminal.integrated.scrollback', "Controls the maximum amount of lines the terminal keeps in its buffer."),
			'type': 'number',
			'default': 1000
		},
		'terminal.integrated.setLocaleVariables': {
			'description': nls.localize('terminal.integrated.setLocaleVariables', "Controls whether locale variables are set at startup of the terminal, this defaults to true on OS X, false on other platforms."),
			'type': 'boolean',
			'default': platform.isMacintosh
		},
		'terminal.integrated.cwd': {
			'description': nls.localize('terminal.integrated.cwd', "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
			'type': 'string',
			'default': undefined
		},
		'terminal.integrated.confirmOnExit': {
			'description': nls.localize('terminal.integrated.confirmOnExit', "Whether to confirm on exit if there are active terminal sessions."),
			'type': 'boolean',
			'default': false
		},
		'terminal.integrated.commandsToSkipShell': {
			'description': nls.localize('terminal.integrated.commandsToSkipShell', "A set of command IDs whose keybindings will not be sent to the shell and instead always be handled by Code. This allows the use of keybindings that would normally be consumed by the shell to act the same as when the terminal is not focused, for example ctrl+p to launch Quick Open."),
			'type': 'array',
			'items': {
				'type': 'string'
			},
			'default': [
				ToggleTabFocusModeAction.ID,
				FocusActiveGroupAction.ID,
				QUICKOPEN_ACTION_ID,
				ShowAllCommandsAction.ID,
				CreateNewTerminalAction.ID,
				CopyTerminalSelectionAction.ID,
				KillTerminalAction.ID,
				FocusActiveTerminalAction.ID,
				FocusPreviousTerminalAction.ID,
				FocusNextTerminalAction.ID,
				FocusTerminalAtIndexAction.getId(1),
				FocusTerminalAtIndexAction.getId(2),
				FocusTerminalAtIndexAction.getId(3),
				FocusTerminalAtIndexAction.getId(4),
				FocusTerminalAtIndexAction.getId(5),
				FocusTerminalAtIndexAction.getId(6),
				FocusTerminalAtIndexAction.getId(7),
				FocusTerminalAtIndexAction.getId(8),
				FocusTerminalAtIndexAction.getId(9),
				TerminalPasteAction.ID,
				RunSelectedTextInTerminalAction.ID,
				RunActiveFileInTerminalAction.ID,
				ToggleTerminalAction.ID,
				ScrollDownTerminalAction.ID,
				ScrollDownPageTerminalAction.ID,
				ScrollToBottomTerminalAction.ID,
				ScrollUpTerminalAction.ID,
				ScrollUpPageTerminalAction.ID,
				ScrollToTopTerminalAction.ID,
				ClearTerminalAction.ID,
				debugActions.StartAction.ID,
				debugActions.StopAction.ID,
				debugActions.RunAction.ID,
				debugActions.RestartAction.ID,
				debugActions.ContinueAction.ID,
				debugActions.PauseAction.ID,
				OpenNextRecentlyUsedEditorInGroupAction.ID,
				OpenPreviousRecentlyUsedEditorInGroupAction.ID,
				FocusFirstGroupAction.ID,
				FocusSecondGroupAction.ID,
				FocusThirdGroupAction.ID,
				SelectAllTerminalAction.ID,
				FocusTerminalFindWidgetAction.ID,
				HideTerminalFindWidgetAction.ID,
				NavigateUpAction.ID,
				NavigateDownAction.ID,
				NavigateRightAction.ID,
				NavigateLeftAction.ID,
				DeleteWordLeftTerminalAction.ID,
				DeleteWordRightTerminalAction.ID
			].sort()
		},
		'terminal.integrated.env.osx': {
			'description': nls.localize('terminal.integrated.env.osx', "Object with environment variables that will be added to the VS Code process to be used by the terminal on OS X"),
			'type': 'object',
			'default': {}
		},
		'terminal.integrated.env.linux': {
			'description': nls.localize('terminal.integrated.env.linux', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux"),
			'type': 'object',
			'default': {}
		},
		'terminal.integrated.env.windows': {
			'description': nls.localize('terminal.integrated.env.windows', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows"),
			'type': 'object',
			'default': {}
		}
	}
});

registerSingleton(ITerminalService, TerminalService);

(<panel.PanelRegistry>Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/terminal/electron-browser/terminalPanel',
	'TerminalPanel',
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal',
	40,
	ToggleTerminalAction.ID
));

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
	secondary: [KeyCode.Shift | KeyCode.Escape]
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE)), 'Terminal: Focus Find Widget', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordLeftTerminalAction, DeleteWordLeftTerminalAction.ID, DeleteWordLeftTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	mac: { primary: KeyMod.Alt | KeyCode.Backspace }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Before Cursor', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordRightTerminalAction, DeleteWordRightTerminalAction.ID, DeleteWordRightTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Delete,
	mac: { primary: KeyMod.Alt | KeyCode.Delete }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word After Cursor', category);
registerColors();

