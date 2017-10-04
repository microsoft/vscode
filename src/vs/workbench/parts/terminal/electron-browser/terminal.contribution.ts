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
import * as terminalCommands from 'vs/workbench/parts/terminal/electron-browser/terminalCommands';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ITerminalService, TERMINAL_PANEL_ID, TERMINAL_DEFAULT_RIGHT_CLICK_COPY_PASTE, TerminalCursorStyle } from 'vs/workbench/parts/terminal/common/terminal';
import { TERMINAL_DEFAULT_SHELL_LINUX, TERMINAL_DEFAULT_SHELL_OSX, TERMINAL_DEFAULT_SHELL_WINDOWS } from 'vs/workbench/parts/terminal/electron-browser/terminal';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KillTerminalAction, CopyTerminalSelectionAction, CreateNewTerminalAction, FocusActiveTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction, FocusTerminalAtIndexAction, RunSelectedTextInTerminalAction, RunActiveFileInTerminalAction, ScrollDownTerminalAction, ScrollDownPageTerminalAction, ScrollToBottomTerminalAction, ScrollUpTerminalAction, ScrollUpPageTerminalAction, ScrollToTopTerminalAction, TerminalPasteAction, ToggleTerminalAction, ClearTerminalAction, SelectAllTerminalAction, FocusTerminalFindWidgetAction, HideTerminalFindWidgetAction, ShowNextFindTermTerminalFindWidgetAction, ShowPreviousFindTermTerminalFindWidgetAction, DeleteWordLeftTerminalAction, DeleteWordRightTerminalAction, QuickOpenActionTermContributor, QuickOpenTermAction, TERMINAL_PICKER_PREFIX } from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ShowAllCommandsAction } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { TerminalService } from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { OpenNextRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction, FocusActiveGroupAction, FocusFirstGroupAction, FocusSecondGroupAction, FocusThirdGroupAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { registerColors } from './terminalColorRegistry';
import { NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction } from 'vs/workbench/electron-browser/actions';
import { QUICKOPEN_ACTION_ID, getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { TogglePanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { TerminalPanel } from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';
import { TerminalPickerHandler } from 'vs/workbench/parts/terminal/browser/terminalQuickOpen';

const quickOpenRegistry = (<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen));

const inTerminalsPicker = 'inTerminalPicker';

quickOpenRegistry.registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		TerminalPickerHandler,
		TerminalPickerHandler.ID,
		TERMINAL_PICKER_PREFIX,
		inTerminalsPicker,
		nls.localize('quickOpen.terminal', "Show All Opened Terminals")
	)
);

const quickOpenNavigateNextInTerminalPickerId = 'workbench.action.quickOpenNavigateNextInTerminalPicker';
CommandsRegistry.registerCommand(
	{ id: quickOpenNavigateNextInTerminalPickerId, handler: getQuickNavigateHandler(quickOpenNavigateNextInTerminalPickerId, true) });

const quickOpenNavigatePreviousInTerminalPickerId = 'workbench.action.quickOpenNavigatePreviousInTerminalPicker';
CommandsRegistry.registerCommand(
	{ id: quickOpenNavigatePreviousInTerminalPickerId, handler: getQuickNavigateHandler(quickOpenNavigatePreviousInTerminalPickerId, false) });


const registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenTermAction, QuickOpenTermAction.ID, QuickOpenTermAction.LABEL), 'Terminal: Switch Active Terminal', nls.localize('terminal', "Terminal"));
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
		// TODO: Support font ligatures
		// 'terminal.integrated.fontLigatures': {
		// 	'description': nls.localize('terminal.integrated.fontLigatures', "Controls whether font ligatures are enabled in the terminal."),
		// 	'type': 'boolean',
		// 	'default': false
		// },
		'terminal.integrated.fontSize': {
			'description': nls.localize('terminal.integrated.fontSize', "Controls the font size in pixels of the terminal."),
			'type': 'number',
			'default': EDITOR_FONT_DEFAULTS.fontSize
		},
		'terminal.integrated.lineHeight': {
			'description': nls.localize('terminal.integrated.lineHeight', "Controls the line height of the terminal, this number is multipled by the terminal font size to get the actual line-height in pixels."),
			'type': 'number',
			'default': 1
		},
		// 'terminal.integrated.enableBold': {
		// 	'type': 'boolean',
		// 	'description': nls.localize('terminal.integrated.enableBold', "Whether to enable bold text within the terminal, this requires support from the terminal shell."),
		// 	'default': true
		// },
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
				ShowPreviousFindTermTerminalFindWidgetAction.ID,
				ShowNextFindTermTerminalFindWidgetAction.ID,
				NavigateUpAction.ID,
				NavigateDownAction.ID,
				NavigateRightAction.ID,
				NavigateLeftAction.ID,
				DeleteWordLeftTerminalAction.ID,
				DeleteWordRightTerminalAction.ID,
				TogglePanelAction.ID,
				'workbench.action.quickOpenView'
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
	TerminalPanel,
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal',
	40,
	ToggleTerminalAction.ID
));

terminalCommands.setup();

registerColors();

