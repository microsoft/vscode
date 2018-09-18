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
import { ITerminalService, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, TERMINAL_PANEL_ID, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, TerminalCursorStyle, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_NOT_VISIBLE, DEFAULT_LINE_HEIGHT, DEFAULT_LETTER_SPACING, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { getTerminalDefaultShellUnixLike, getTerminalDefaultShellWindows } from 'vs/workbench/parts/terminal/node/terminal';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KillTerminalAction, ClearSelectionTerminalAction, CopyTerminalSelectionAction, CreateNewTerminalAction, CreateNewInActiveWorkspaceTerminalAction, FocusActiveTerminalAction, FocusNextTerminalAction, FocusPreviousTerminalAction, SelectDefaultShellWindowsTerminalAction, RunSelectedTextInTerminalAction, RunActiveFileInTerminalAction, ScrollDownTerminalAction, ScrollDownPageTerminalAction, ScrollToBottomTerminalAction, ScrollUpTerminalAction, ScrollUpPageTerminalAction, ScrollToTopTerminalAction, TerminalPasteAction, ToggleTerminalAction, ClearTerminalAction, AllowWorkspaceShellTerminalCommand, DisallowWorkspaceShellTerminalCommand, RenameTerminalAction, SelectAllTerminalAction, FocusTerminalFindWidgetAction, HideTerminalFindWidgetAction, DeleteWordLeftTerminalAction, DeleteWordRightTerminalAction, QuickOpenActionTermContributor, QuickOpenTermAction, TERMINAL_PICKER_PREFIX, MoveToLineStartTerminalAction, MoveToLineEndTerminalAction, SplitTerminalAction, SplitInActiveWorkspaceTerminalAction, FocusPreviousPaneTerminalAction, FocusNextPaneTerminalAction, ResizePaneLeftTerminalAction, ResizePaneRightTerminalAction, ResizePaneUpTerminalAction, ResizePaneDownTerminalAction, ScrollToPreviousCommandAction, ScrollToNextCommandAction, SelectToPreviousCommandAction, SelectToNextCommandAction, SelectToPreviousLineAction, SelectToNextLineAction, ToggleEscapeSequenceLoggingAction, SendSequenceTerminalCommand, ToggleRegexCommand, ToggleWholeWordCommand, ToggleCaseSensitiveCommand } from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ShowAllCommandsAction } from 'vs/workbench/parts/quickopen/browser/commandsHandler';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { TerminalService } from 'vs/workbench/parts/terminal/electron-browser/terminalService';
import { ToggleTabFocusModeAction } from 'vs/editor/contrib/toggleTabFocusMode/toggleTabFocusMode';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { OpenNextRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction, FocusActiveGroupAction, FocusFirstGroupAction, FocusLastGroupAction, OpenFirstEditorInGroup, OpenLastEditorInGroup } from 'vs/workbench/browser/parts/editor/editorActions';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { registerColors } from 'vs/workbench/parts/terminal/common/terminalColorRegistry';
import { NavigateUpAction, NavigateDownAction, NavigateLeftAction, NavigateRightAction } from 'vs/workbench/electron-browser/actions';
import { QUICKOPEN_ACTION_ID, getQuickNavigateHandler, QUICKOPEN_FOCUS_SECONDARY_ACTION_ID } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { TogglePanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { TerminalPanel } from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';
import { TerminalPickerHandler } from 'vs/workbench/parts/terminal/browser/terminalQuickOpen';
import { setupTerminalCommands, TERMINAL_COMMAND_ID } from 'vs/workbench/parts/terminal/common/terminalCommands';
import { setupTerminalMenu } from 'vs/workbench/parts/terminal/common/terminalMenu';

const quickOpenRegistry = (Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen));

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


const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenTermAction, QuickOpenTermAction.ID, QuickOpenTermAction.LABEL), 'Terminal: Switch Active Terminal', nls.localize('terminal', "Terminal"));
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionTermContributor);

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'terminal',
	order: 100,
	title: nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		'terminal.integrated.shell.linux': {
			markdownDescription: nls.localize('terminal.integrated.shell.linux', "The path of the shell that the terminal uses on Linux. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'string',
			default: getTerminalDefaultShellUnixLike()
		},
		'terminal.integrated.shellArgs.linux': {
			markdownDescription: nls.localize('terminal.integrated.shellArgs.linux', "The command line arguments to use when on the Linux terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
		},
		'terminal.integrated.shell.osx': {
			markdownDescription: nls.localize('terminal.integrated.shell.osx', "The path of the shell that the terminal uses on macOS. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'string',
			default: getTerminalDefaultShellUnixLike()
		},
		'terminal.integrated.shellArgs.osx': {
			markdownDescription: nls.localize('terminal.integrated.shellArgs.osx', "The command line arguments to use when on the macOS terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'array',
			items: {
				type: 'string'
			},
			// Unlike on Linux, ~/.profile is not sourced when logging into a macOS session. This
			// is the reason terminals on macOS typically run login shells by default which set up
			// the environment. See http://unix.stackexchange.com/a/119675/115410
			default: ['-l']
		},
		'terminal.integrated.shell.windows': {
			markdownDescription: nls.localize('terminal.integrated.shell.windows', "The path of the shell that the terminal uses on Windows. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'string',
			default: getTerminalDefaultShellWindows()
		},
		'terminal.integrated.shellArgs.windows': {
			markdownDescription: nls.localize('terminal.integrated.shellArgs.windows', "The command line arguments to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			'anyOf': [
				{
					type: 'array',
					items: {
						type: 'string',
						markdownDescription: nls.localize('terminal.integrated.shellArgs.windows', "The command line arguments to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).")
					},
				},
				{
					type: 'string',
					markdownDescription: nls.localize('terminal.integrated.shellArgs.windows.string', "The command line arguments in [command-line format](https://msdn.microsoft.com/en-au/08dfcab2-eb6e-49a4-80eb-87d4076c98c6) to use when on the Windows terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration).")
				}
			],
			default: []
		},
		'terminal.integrated.macOptionIsMeta': {
			description: nls.localize('terminal.integrated.macOptionIsMeta', "Controls whether to treat the option key as the meta key in the terminal on macOS."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.macOptionClickForcesSelection': {
			description: nls.localize('terminal.integrated.macOptionClickForcesSelection', "Controls whether to force selection when using Option+click on macOS. This will force a regular (line) selection and disallow the use of column selection mode. This enables copying and pasting using the regular terminal selection, for example, when mouse mode is enabled in tmux."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.copyOnSelection': {
			description: nls.localize('terminal.integrated.copyOnSelection', "Controls whether text selected in the terminal will be copied to the clipboard."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.drawBoldTextInBrightColors': {
			description: nls.localize('terminal.integrated.drawBoldTextInBrightColors', "Controls whether bold text in the terminal will always use the \"bright\" ANSI color variant."),
			type: 'boolean',
			default: true
		},
		'terminal.integrated.fontFamily': {
			markdownDescription: nls.localize('terminal.integrated.fontFamily', "Controls the font family of the terminal, this defaults to `#editor.fontFamily#`'s value."),
			type: 'string'
		},
		// TODO: Support font ligatures
		// 'terminal.integrated.fontLigatures': {
		// 	'description': nls.localize('terminal.integrated.fontLigatures', "Controls whether font ligatures are enabled in the terminal."),
		// 	'type': 'boolean',
		// 	'default': false
		// },
		'terminal.integrated.fontSize': {
			description: nls.localize('terminal.integrated.fontSize', "Controls the font size in pixels of the terminal."),
			type: 'number',
			default: EDITOR_FONT_DEFAULTS.fontSize
		},
		'terminal.integrated.letterSpacing': {
			description: nls.localize('terminal.integrated.letterSpacing', "Controls the letter spacing of the terminal, this is an integer value which represents the amount of additional pixels to add between characters."),
			type: 'number',
			default: DEFAULT_LETTER_SPACING
		},
		'terminal.integrated.lineHeight': {
			description: nls.localize('terminal.integrated.lineHeight', "Controls the line height of the terminal, this number is multiplied by the terminal font size to get the actual line-height in pixels."),
			type: 'number',
			default: DEFAULT_LINE_HEIGHT
		},
		'terminal.integrated.fontWeight': {
			type: 'string',
			enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
			description: nls.localize('terminal.integrated.fontWeight', "The font weight to use within the terminal for non-bold text."),
			default: 'normal'
		},
		'terminal.integrated.fontWeightBold': {
			type: 'string',
			enum: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'],
			description: nls.localize('terminal.integrated.fontWeightBold', "The font weight to use within the terminal for bold text."),
			default: 'bold'
		},
		'terminal.integrated.cursorBlinking': {
			description: nls.localize('terminal.integrated.cursorBlinking', "Controls whether the terminal cursor blinks."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.cursorStyle': {
			description: nls.localize('terminal.integrated.cursorStyle', "Controls the style of terminal cursor."),
			enum: [TerminalCursorStyle.BLOCK, TerminalCursorStyle.LINE, TerminalCursorStyle.UNDERLINE],
			default: TerminalCursorStyle.BLOCK
		},
		'terminal.integrated.scrollback': {
			description: nls.localize('terminal.integrated.scrollback', "Controls the maximum amount of lines the terminal keeps in its buffer."),
			type: 'number',
			default: 1000
		},
		'terminal.integrated.setLocaleVariables': {
			markdownDescription: nls.localize('terminal.integrated.setLocaleVariables', "Controls whether locale variables are set at startup of the terminal, this defaults to `true` on macOS, `false` on other platforms."),
			type: 'boolean',
			default: platform.isMacintosh
		},
		'terminal.integrated.rendererType': {
			type: 'string',
			enum: ['auto', 'canvas', 'dom'],
			enumDescriptions: [
				nls.localize('terminal.integrated.rendererType.auto', "Let VS Code guess which renderer to use."),
				nls.localize('terminal.integrated.rendererType.canvas', "Use the standard GPU/canvas-based renderer"),
				nls.localize('terminal.integrated.rendererType.dom', "Use the fallback DOM-based renderer.")
			],
			default: 'auto',
			description: nls.localize('terminal.integrated.rendererType', "Controls how the terminal is rendered.")
		},
		'terminal.integrated.rightClickBehavior': {
			type: 'string',
			enum: ['default', 'copyPaste', 'selectWord'],
			enumDescriptions: [
				nls.localize('terminal.integrated.rightClickBehavior.default', "Show the context menu."),
				nls.localize('terminal.integrated.rightClickBehavior.copyPaste', "Copy when there is a selection, otherwise paste."),
				nls.localize('terminal.integrated.rightClickBehavior.selectWord', "Select the word under the cursor and show the context menu.")
			],
			default: platform.isMacintosh ? 'selectWord' : platform.isWindows ? 'copyPaste' : 'default',
			description: nls.localize('terminal.integrated.rightClickBehavior', "Controls how terminal reacts to right click.")
		},
		'terminal.integrated.cwd': {
			description: nls.localize('terminal.integrated.cwd', "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
			type: 'string',
			default: undefined
		},
		'terminal.integrated.confirmOnExit': {
			description: nls.localize('terminal.integrated.confirmOnExit', "Controls whether to confirm on exit if there are active terminal sessions."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.enableBell': {
			description: nls.localize('terminal.integrated.enableBell', "Controls whether the terminal bell is enabled."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.commandsToSkipShell': {
			description: nls.localize('terminal.integrated.commandsToSkipShell', "A set of command IDs whose keybindings will not be sent to the shell and instead always be handled by Code. This allows the use of keybindings that would normally be consumed by the shell to act the same as when the terminal is not focused, for example ctrl+p to launch Quick Open."),
			type: 'array',
			items: {
				type: 'string'
			},
			default: [
				TERMINAL_COMMAND_ID.CLEAR_SELECTION,
				TERMINAL_COMMAND_ID.CLEAR,
				TERMINAL_COMMAND_ID.COPY_SELECTION,
				TERMINAL_COMMAND_ID.DELETE_WORD_LEFT,
				TERMINAL_COMMAND_ID.DELETE_WORD_RIGHT,
				TERMINAL_COMMAND_ID.FIND_WIDGET_FOCUS,
				TERMINAL_COMMAND_ID.FIND_WIDGET_HIDE,
				TERMINAL_COMMAND_ID.FOCUS_NEXT_PANE,
				TERMINAL_COMMAND_ID.FOCUS_NEXT,
				TERMINAL_COMMAND_ID.FOCUS_PREVIOUS_PANE,
				TERMINAL_COMMAND_ID.FOCUS_PREVIOUS,
				TERMINAL_COMMAND_ID.FOCUS,
				TERMINAL_COMMAND_ID.KILL,
				TERMINAL_COMMAND_ID.MOVE_TO_LINE_END,
				TERMINAL_COMMAND_ID.MOVE_TO_LINE_START,
				TERMINAL_COMMAND_ID.NEW_IN_ACTIVE_WORKSPACE,
				TERMINAL_COMMAND_ID.NEW,
				TERMINAL_COMMAND_ID.PASTE,
				TERMINAL_COMMAND_ID.RESIZE_PANE_DOWN,
				TERMINAL_COMMAND_ID.RESIZE_PANE_LEFT,
				TERMINAL_COMMAND_ID.RESIZE_PANE_RIGHT,
				TERMINAL_COMMAND_ID.RESIZE_PANE_UP,
				TERMINAL_COMMAND_ID.RUN_ACTIVE_FILE,
				TERMINAL_COMMAND_ID.RUN_SELECTED_TEXT,
				TERMINAL_COMMAND_ID.SCROLL_DOWN_LINE,
				TERMINAL_COMMAND_ID.SCROLL_DOWN_PAGE,
				TERMINAL_COMMAND_ID.SCROLL_TO_BOTTOM,
				TERMINAL_COMMAND_ID.SCROLL_TO_NEXT_COMMAND,
				TERMINAL_COMMAND_ID.SCROLL_TO_PREVIOUS_COMMAND,
				TERMINAL_COMMAND_ID.SCROLL_TO_TOP,
				TERMINAL_COMMAND_ID.SCROLL_UP_LINE,
				TERMINAL_COMMAND_ID.SCROLL_UP_PAGE,
				TERMINAL_COMMAND_ID.SELECT_ALL,
				TERMINAL_COMMAND_ID.SELECT_TO_NEXT_COMMAND,
				TERMINAL_COMMAND_ID.SELECT_TO_NEXT_LINE,
				TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_COMMAND,
				TERMINAL_COMMAND_ID.SELECT_TO_PREVIOUS_LINE,
				TERMINAL_COMMAND_ID.SPLIT_IN_ACTIVE_WORKSPACE,
				TERMINAL_COMMAND_ID.SPLIT,
				TERMINAL_COMMAND_ID.TOGGLE,
				ToggleTabFocusModeAction.ID,
				QUICKOPEN_ACTION_ID,
				QUICKOPEN_FOCUS_SECONDARY_ACTION_ID,
				ShowAllCommandsAction.ID,
				'workbench.action.tasks.build',
				'workbench.action.tasks.restartTask',
				'workbench.action.tasks.runTask',
				'workbench.action.tasks.showLog',
				'workbench.action.tasks.showTasks',
				'workbench.action.tasks.terminate',
				'workbench.action.tasks.test',
				'workbench.action.toggleFullScreen',
				'workbench.action.terminal.focusAtIndex1',
				'workbench.action.terminal.focusAtIndex2',
				'workbench.action.terminal.focusAtIndex3',
				'workbench.action.terminal.focusAtIndex4',
				'workbench.action.terminal.focusAtIndex5',
				'workbench.action.terminal.focusAtIndex6',
				'workbench.action.terminal.focusAtIndex7',
				'workbench.action.terminal.focusAtIndex8',
				'workbench.action.terminal.focusAtIndex9',
				'workbench.action.focusSecondEditorGroup',
				'workbench.action.focusThirdEditorGroup',
				'workbench.action.focusFourthEditorGroup',
				'workbench.action.focusFifthEditorGroup',
				'workbench.action.focusSixthEditorGroup',
				'workbench.action.focusSeventhEditorGroup',
				'workbench.action.focusEighthEditorGroup',
				debugActions.StartAction.ID,
				debugActions.StopAction.ID,
				debugActions.RunAction.ID,
				debugActions.RestartAction.ID,
				debugActions.ContinueAction.ID,
				debugActions.PauseAction.ID,
				debugActions.StepIntoAction.ID,
				debugActions.StepOutAction.ID,
				debugActions.StepOverAction.ID,
				OpenNextRecentlyUsedEditorInGroupAction.ID,
				OpenPreviousRecentlyUsedEditorInGroupAction.ID,
				FocusActiveGroupAction.ID,
				FocusFirstGroupAction.ID,
				FocusLastGroupAction.ID,
				OpenFirstEditorInGroup.ID,
				OpenLastEditorInGroup.ID,
				NavigateUpAction.ID,
				NavigateDownAction.ID,
				NavigateRightAction.ID,
				NavigateLeftAction.ID,
				TogglePanelAction.ID,
				'workbench.action.quickOpenView'
			].sort()
		},
		'terminal.integrated.env.osx': {
			markdownDescription: nls.localize('terminal.integrated.env.osx', "Object with environment variables that will be added to the VS Code process to be used by the terminal on macOS. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		'terminal.integrated.env.linux': {
			markdownDescription: nls.localize('terminal.integrated.env.linux', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		'terminal.integrated.env.windows': {
			markdownDescription: nls.localize('terminal.integrated.env.windows', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		'terminal.integrated.showExitAlert': {
			description: nls.localize('terminal.integrated.showExitAlert', "Controls whether to show the alert \"The terminal process terminated with exit code\" when exit code is non-zero."),
			type: 'boolean',
			default: true
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
	TERMINAL_COMMAND_ID.TOGGLE
));

// On mac cmd+` is reserved to cycle between windows, that's why the keybindings use WinCtrl
const category = nls.localize('terminalCategory', "Terminal");
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.LABEL), 'Terminal: Kill the Active Terminal Instance', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, CopyTerminalSelectionAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C }
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FOCUS)), 'Terminal: Copy Selection', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKTICK,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_BACKTICK }
}), 'Terminal: Create New Integrated Terminal', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClearSelectionTerminalAction, ClearSelectionTerminalAction.ID, ClearSelectionTerminalAction.LABEL, {
	primary: KeyCode.Escape,
	linux: { primary: KeyCode.Escape }
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_NOT_VISIBLE)), 'Terminal: Escape selection', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CreateNewInActiveWorkspaceTerminalAction, CreateNewInActiveWorkspaceTerminalAction.ID, CreateNewInActiveWorkspaceTerminalAction.LABEL), 'Terminal: Create New Integrated Terminal (In Active Workspace)', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusActiveTerminalAction, FocusActiveTerminalAction.ID, FocusActiveTerminalAction.LABEL), 'Terminal: Focus Terminal', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextTerminalAction, FocusNextTerminalAction.ID, FocusNextTerminalAction.LABEL), 'Terminal: Focus Next Terminal', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousTerminalAction, FocusPreviousTerminalAction.ID, FocusPreviousTerminalAction.LABEL), 'Terminal: Focus Previous Terminal', category);
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
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
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
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
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
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KeybindingWeight.WorkbenchContrib + 1), 'Terminal: Clear', category);
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
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordLeftTerminalAction, DeleteWordLeftTerminalAction.ID, DeleteWordLeftTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	mac: { primary: KeyMod.Alt | KeyCode.Backspace }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Left', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(DeleteWordRightTerminalAction, DeleteWordRightTerminalAction.ID, DeleteWordRightTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Delete,
	mac: { primary: KeyMod.Alt | KeyCode.Delete }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Right', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(MoveToLineStartTerminalAction, MoveToLineStartTerminalAction.ID, MoveToLineStartTerminalAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Move To Line Start', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(MoveToLineEndTerminalAction, MoveToLineEndTerminalAction.ID, MoveToLineEndTerminalAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Move To Line End', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SplitTerminalAction, SplitTerminalAction.ID, SplitTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH,
	secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_5],
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH,
		secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_5]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Split', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SplitInActiveWorkspaceTerminalAction, SplitInActiveWorkspaceTerminalAction.ID, SplitInActiveWorkspaceTerminalAction.LABEL), 'Terminal: Split Terminal (In Active Workspace)', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousPaneTerminalAction, FocusPreviousPaneTerminalAction.ID, FocusPreviousPaneTerminalAction.LABEL, {
	primary: KeyMod.Alt | KeyCode.LeftArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	mac: {
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
		secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Previous Pane', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextPaneTerminalAction, FocusNextPaneTerminalAction.ID, FocusNextPaneTerminalAction.LABEL, {
	primary: KeyMod.Alt | KeyCode.RightArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	mac: {
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
		secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Next Pane', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ResizePaneLeftTerminalAction, ResizePaneLeftTerminalAction.ID, ResizePaneLeftTerminalAction.LABEL, {
	primary: null,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Left', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ResizePaneRightTerminalAction, ResizePaneRightTerminalAction.ID, ResizePaneRightTerminalAction.LABEL, {
	primary: null,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Right', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ResizePaneUpTerminalAction, ResizePaneUpTerminalAction.ID, ResizePaneUpTerminalAction.LABEL, {
	primary: null,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Up', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ResizePaneDownTerminalAction, ResizePaneDownTerminalAction.ID, ResizePaneDownTerminalAction.LABEL, {
	primary: null,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Down', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollToPreviousCommandAction, ScrollToPreviousCommandAction.ID, ScrollToPreviousCommandAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll To Previous Command', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ScrollToNextCommandAction, ScrollToNextCommandAction.ID, ScrollToNextCommandAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll To Next Command', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectToPreviousCommandAction, SelectToPreviousCommandAction.ID, SelectToPreviousCommandAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select To Previous Command', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectToNextCommandAction, SelectToNextCommandAction.ID, SelectToNextCommandAction.LABEL, {
	primary: null,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select To Next Command', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectToPreviousLineAction, SelectToPreviousLineAction.ID, SelectToPreviousLineAction.LABEL), 'Terminal: Select To Previous Line', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(SelectToNextLineAction, SelectToNextLineAction.ID, SelectToNextLineAction.LABEL), 'Terminal: Select To Next Line', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleEscapeSequenceLoggingAction, ToggleEscapeSequenceLoggingAction.ID, ToggleEscapeSequenceLoggingAction.LABEL), 'Terminal: Toggle Escape Sequence Logging', category);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleRegexCommand, ToggleRegexCommand.ID, ToggleRegexCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_R,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED), 'Terminal: Toggle find by regex');
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleWholeWordCommand, ToggleWholeWordCommand.ID, ToggleWholeWordCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_W,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_W }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED), 'Terminal: Toggle find whole word');
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleCaseSensitiveCommand, ToggleCaseSensitiveCommand.ID, ToggleCaseSensitiveCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_C,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_INPUT_FOCUSED), 'Terminal: Toggle find match case');
const sendSequenceTerminalCommand = new SendSequenceTerminalCommand({
	id: SendSequenceTerminalCommand.ID,
	precondition: null
});
sendSequenceTerminalCommand.register();

setupTerminalCommands();
setupTerminalMenu();

registerColors();
