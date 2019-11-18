/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import 'vs/css!./media/scrollbar';
import 'vs/css!./media/terminal';
import 'vs/css!./media/widgets';
import 'vs/css!./media/xterm';
import * as nls from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionBarExtensions, IActionBarRegistry, Scope } from 'vs/workbench/browser/actions';
import * as panel from 'vs/workbench/browser/panel';
import { getQuickNavigateHandler } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { Extensions as QuickOpenExtensions, IQuickOpenRegistry, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { ClearSelectionTerminalAction, ClearTerminalAction, CopyTerminalSelectionAction, CreateNewInActiveWorkspaceTerminalAction, CreateNewTerminalAction, DeleteToLineStartTerminalAction, DeleteWordLeftTerminalAction, DeleteWordRightTerminalAction, FindNext, FindPrevious, FocusActiveTerminalAction, FocusNextPaneTerminalAction, FocusNextTerminalAction, FocusPreviousPaneTerminalAction, FocusPreviousTerminalAction, FocusTerminalFindWidgetAction, HideTerminalFindWidgetAction, KillTerminalAction, MoveToLineEndTerminalAction, MoveToLineStartTerminalAction, QuickOpenActionTermContributor, QuickOpenTermAction, RenameTerminalAction, ResizePaneDownTerminalAction, ResizePaneLeftTerminalAction, ResizePaneRightTerminalAction, ResizePaneUpTerminalAction, RunActiveFileInTerminalAction, RunSelectedTextInTerminalAction, ScrollDownPageTerminalAction, ScrollDownTerminalAction, ScrollToBottomTerminalAction, ScrollToNextCommandAction, ScrollToPreviousCommandAction, ScrollToTopTerminalAction, ScrollUpPageTerminalAction, ScrollUpTerminalAction, SelectAllTerminalAction, SelectDefaultShellWindowsTerminalAction, SelectToNextCommandAction, SelectToNextLineAction, SelectToPreviousCommandAction, SelectToPreviousLineAction, SendSequenceTerminalCommand, SplitInActiveWorkspaceTerminalAction, SplitTerminalAction, TerminalPasteAction, TERMINAL_PICKER_PREFIX, ToggleCaseSensitiveCommand, ToggleEscapeSequenceLoggingAction, ToggleRegexCommand, ToggleTerminalAction, ToggleWholeWordCommand, NavigationModeFocusPreviousTerminalAction, NavigationModeFocusNextTerminalAction, NavigationModeExitTerminalAction, ManageWorkspaceShellPermissionsTerminalCommand, CreateNewWithCwdTerminalCommand } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalPanel } from 'vs/workbench/contrib/terminal/browser/terminalPanel';
import { TerminalPickerHandler } from 'vs/workbench/contrib/terminal/browser/terminalQuickOpen';
import { KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_NOT_VISIBLE, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, TERMINAL_PANEL_ID, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, TerminalCursorStyle, TERMINAL_ACTION_CATEGORY, KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS, TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { registerColors } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { setupTerminalCommands } from 'vs/workbench/contrib/terminal/browser/terminalCommands';
import { setupTerminalMenu } from 'vs/workbench/contrib/terminal/common/terminalMenu';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
import { TerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalShellConfig';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BrowserFeatures } from 'vs/base/browser/canIUse';

registerSingleton(ITerminalService, TerminalService, true);

if (platform.isWeb) {
	registerShellConfiguration();
}

const quickOpenRegistry = (Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen));

const inTerminalsPicker = 'inTerminalPicker';

quickOpenRegistry.registerQuickOpenHandler(
	QuickOpenHandlerDescriptor.create(
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


const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'terminal',
	order: 100,
	title: nls.localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		'terminal.integrated.automationShell.linux': {
			markdownDescription: nls.localize('terminal.integrated.automationShell.linux', "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.linux`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		'terminal.integrated.automationShell.osx': {
			markdownDescription: nls.localize('terminal.integrated.automationShell.osx', "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.osx`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		'terminal.integrated.automationShell.windows': {
			markdownDescription: nls.localize('terminal.integrated.automationShell.windows', "A path that when set will override {0} and ignore {1} values for automation-related terminal usage like tasks and debug.", '`terminal.integrated.shell.windows`', '`shellArgs`'),
			type: ['string', 'null'],
			default: null
		},
		'terminal.integrated.shellArgs.linux': {
			markdownDescription: nls.localize('terminal.integrated.shellArgs.linux', "The command line arguments to use when on the Linux terminal. [Read more about configuring the shell](https://code.visualstudio.com/docs/editor/integrated-terminal#_configuration)."),
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
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
		'terminal.integrated.detectLocale': {
			markdownDescription: nls.localize('terminal.integrated.detectLocale', "Controls whether to detect and set the `$LANG` environment variable to a UTF-8 compliant option since VS Code's terminal only supports UTF-8 encoded data coming from the shell."),
			type: 'string',
			enum: ['auto', 'off', 'on'],
			enumDescriptions: [
				nls.localize('terminal.integrated.detectLocale.auto', "Set the `$LANG` environment variable if the existing variable does not exist or it does not end in `'.UTF-8'`."),
				nls.localize('terminal.integrated.detectLocale.off', "Do not set the `$LANG` environment variable."),
				nls.localize('terminal.integrated.detectLocale.on', "Always set the `$LANG` environment variable.")
			],
			default: 'auto'
		},
		'terminal.integrated.rendererType': {
			type: 'string',
			enum: ['auto', 'canvas', 'dom', 'experimentalWebgl'],
			enumDescriptions: [
				nls.localize('terminal.integrated.rendererType.auto', "Let VS Code guess which renderer to use."),
				nls.localize('terminal.integrated.rendererType.canvas', "Use the standard GPU/canvas-based renderer."),
				nls.localize('terminal.integrated.rendererType.dom', "Use the fallback DOM-based renderer."),
				nls.localize('terminal.integrated.rendererType.experimentalWebgl', "Use the experimental webgl-based renderer. Note that this has some [known issues](https://github.com/xtermjs/xterm.js/issues?q=is%3Aopen+is%3Aissue+label%3Aarea%2Faddon%2Fwebgl) and this will only be enabled for new terminals (not hot swappable like the other renderers).")
			],
			default: 'auto',
			description: nls.localize('terminal.integrated.rendererType', "Controls how the terminal is rendered.")
		},
		'terminal.integrated.rightClickBehavior': {
			type: 'string',
			enum: ['default', 'copyPaste', 'paste', 'selectWord'],
			enumDescriptions: [
				nls.localize('terminal.integrated.rightClickBehavior.default', "Show the context menu."),
				nls.localize('terminal.integrated.rightClickBehavior.copyPaste', "Copy when there is a selection, otherwise paste."),
				nls.localize('terminal.integrated.rightClickBehavior.paste', "Paste on right click."),
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
			description: nls.localize('terminal.integrated.commandsToSkipShell', "A set of command IDs whose keybindings will not be sent to the shell and instead always be handled by Code. This allows the use of keybindings that would normally be consumed by the shell to act the same as when the terminal is not focused, for example ctrl+p to launch Quick Open.\nDefault Skipped Commands:\n\n{0}", DEFAULT_COMMANDS_TO_SKIP_SHELL.sort().map(command => `- ${command}`).join('\n')),
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
		},
		'terminal.integrated.allowChords': {
			markdownDescription: nls.localize('terminal.integrated.allowChords', "Whether or not to allow chord keybindings in the terminal. Note that when this is true and the keystroke results in a chord it will bypass `terminal.integrated.commandsToSkipShell`, setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code)."),
			type: 'boolean',
			default: true
		},
		'terminal.integrated.inheritEnv': {
			markdownDescription: nls.localize('terminal.integrated.inheritEnv', "Whether new shells should inherit their environment from VS Code. This is not supported on Windows."),
			type: 'boolean',
			default: true
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
		},
		'terminal.integrated.splitCwd': {
			description: nls.localize('terminal.integrated.splitCwd', "Controls the working directory a split terminal starts with."),
			type: 'string',
			enum: ['workspaceRoot', 'initial', 'inherited'],
			enumDescriptions: [
				nls.localize('terminal.integrated.splitCwd.workspaceRoot', "A new split terminal will use the workspace root as the working directory. In a multi-root workspace a choice for which root folder to use is offered."),
				nls.localize('terminal.integrated.splitCwd.initial', "A new split terminal will use the working directory that the parent terminal started with."),
				nls.localize('terminal.integrated.splitCwd.inherited', "On macOS and Linux, a new split terminal will use the working directory of the parent terminal. On Windows, this behaves the same as initial."),
			],
			default: 'inherited'
		},
		'terminal.integrated.windowsEnableConpty': {
			description: nls.localize('terminal.integrated.windowsEnableConpty', "Whether to use ConPTY for Windows terminal process communication (requires Windows 10 build number 18309+). Winpty will be used if this is false."),
			type: 'boolean',
			default: true
		},
		'terminal.integrated.experimentalRefreshOnResume': {
			description: nls.localize('terminal.integrated.experimentalRefreshOnResume', "An experimental setting that will refresh the terminal renderer when the system is resumed."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.experimentalUseTitleEvent': {
			description: nls.localize('terminal.integrated.experimentalUseTitleEvent', "An experimental setting that will use the terminal title event for the dropdown title. This setting will only apply to new terminals."),
			type: 'boolean',
			default: false
		},
		'terminal.integrated.enableFileLinks': {
			description: nls.localize('terminal.integrated.enableFileLinks', "Whether to enable file links in the terminal. Links can be slow when working on a network drive in particular because each file link is verified against the file system."),
			type: 'boolean',
			default: true
		}
	}
});

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.create(QuickOpenTermAction, QuickOpenTermAction.ID, QuickOpenTermAction.LABEL), 'Terminal: Switch Active Terminal', nls.localize('terminal', "Terminal"));
const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionTermContributor);

(<panel.PanelRegistry>Registry.as(panel.Extensions.Panels)).registerPanel(panel.PanelDescriptor.create(
	TerminalPanel,
	TERMINAL_PANEL_ID,
	nls.localize('terminal', "Terminal"),
	'terminal',
	40,
	TERMINAL_COMMAND_ID.TOGGLE
));
Registry.as<panel.PanelRegistry>(panel.Extensions.Panels).setDefaultPanelId(TERMINAL_PANEL_ID);

// On mac cmd+` is reserved to cycle between windows, that's why the keybindings use WinCtrl
const category = TERMINAL_ACTION_CATEGORY;
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(KillTerminalAction, KillTerminalAction.ID, KillTerminalAction.LABEL), 'Terminal: Kill the Active Terminal Instance', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(CreateNewTerminalAction, CreateNewTerminalAction.ID, CreateNewTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKTICK,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_BACKTICK }
}), 'Terminal: Create New Integrated Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ClearSelectionTerminalAction, ClearSelectionTerminalAction.ID, ClearSelectionTerminalAction.LABEL, {
	primary: KeyCode.Escape,
	linux: { primary: KeyCode.Escape }
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_NOT_VISIBLE)), 'Terminal: Clear Selection', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(CreateNewInActiveWorkspaceTerminalAction, CreateNewInActiveWorkspaceTerminalAction.ID, CreateNewInActiveWorkspaceTerminalAction.LABEL), 'Terminal: Create New Integrated Terminal (In Active Workspace)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusActiveTerminalAction, FocusActiveTerminalAction.ID, FocusActiveTerminalAction.LABEL), 'Terminal: Focus Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusNextTerminalAction, FocusNextTerminalAction.ID, FocusNextTerminalAction.LABEL), 'Terminal: Focus Next Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusPreviousTerminalAction, FocusPreviousTerminalAction.ID, FocusPreviousTerminalAction.LABEL), 'Terminal: Focus Previous Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectAllTerminalAction, SelectAllTerminalAction.ID, SelectAllTerminalAction.LABEL, {
	// Don't use ctrl+a by default as that would override the common go to start
	// of prompt shell binding
	primary: 0,
	// Technically this doesn't need to be here as it will fall back to this
	// behavior anyway when handed to xterm.js, having this handled by VS Code
	// makes it easier for users to see how it works though.
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_A }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select All', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(RunSelectedTextInTerminalAction, RunSelectedTextInTerminalAction.ID, RunSelectedTextInTerminalAction.LABEL), 'Terminal: Run Selected Text In Active Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(RunActiveFileInTerminalAction, RunActiveFileInTerminalAction.ID, RunActiveFileInTerminalAction.LABEL), 'Terminal: Run Active File In Active Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleTerminalAction, ToggleTerminalAction.ID, ToggleTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.US_BACKTICK,
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_BACKTICK }
}), 'View: Toggle Integrated Terminal', nls.localize('viewCategory', "View"));
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollDownTerminalAction, ScrollDownTerminalAction.ID, ScrollDownTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Down (Line)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollDownPageTerminalAction, ScrollDownPageTerminalAction.ID, ScrollDownPageTerminalAction.LABEL, {
	primary: KeyMod.Shift | KeyCode.PageDown,
	mac: { primary: KeyCode.PageDown }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Down (Page)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollToBottomTerminalAction, ScrollToBottomTerminalAction.ID, ScrollToBottomTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.End,
	linux: { primary: KeyMod.Shift | KeyCode.End }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll to Bottom', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollUpTerminalAction, ScrollUpTerminalAction.ID, ScrollUpTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow },
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Up (Line)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollUpPageTerminalAction, ScrollUpPageTerminalAction.ID, ScrollUpPageTerminalAction.LABEL, {
	primary: KeyMod.Shift | KeyCode.PageUp,
	mac: { primary: KeyCode.PageUp }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll Up (Page)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollToTopTerminalAction, ScrollToTopTerminalAction.ID, ScrollToTopTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Home,
	linux: { primary: KeyMod.Shift | KeyCode.Home }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Scroll to Top', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ClearTerminalAction, ClearTerminalAction.ID, ClearTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_K }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS, KeybindingWeight.WorkbenchContrib + 1), 'Terminal: Clear', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectDefaultShellWindowsTerminalAction, SelectDefaultShellWindowsTerminalAction.ID, SelectDefaultShellWindowsTerminalAction.LABEL), 'Terminal: Select Default Shell', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ManageWorkspaceShellPermissionsTerminalCommand, ManageWorkspaceShellPermissionsTerminalCommand.ID, ManageWorkspaceShellPermissionsTerminalCommand.LABEL), 'Terminal: Manage Workspace Shell Permissions', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(RenameTerminalAction, RenameTerminalAction.ID, RenameTerminalAction.LABEL), 'Terminal: Rename', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusTerminalFindWidgetAction, FocusTerminalFindWidgetAction.ID, FocusTerminalFindWidgetAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Find Widget', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusTerminalFindWidgetAction, FocusTerminalFindWidgetAction.ID, FocusTerminalFindWidgetAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Focus Find Widget', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(HideTerminalFindWidgetAction, HideTerminalFindWidgetAction.ID, HideTerminalFindWidgetAction.LABEL, {
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape]
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_VISIBLE)), 'Terminal: Hide Find Widget', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(DeleteWordLeftTerminalAction, DeleteWordLeftTerminalAction.ID, DeleteWordLeftTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Backspace,
	mac: { primary: KeyMod.Alt | KeyCode.Backspace }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Left', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(DeleteWordRightTerminalAction, DeleteWordRightTerminalAction.ID, DeleteWordRightTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Delete,
	mac: { primary: KeyMod.Alt | KeyCode.Delete }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete Word Right', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(DeleteToLineStartTerminalAction, DeleteToLineStartTerminalAction.ID, DeleteToLineStartTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.Backspace }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Delete To Line Start', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(MoveToLineStartTerminalAction, MoveToLineStartTerminalAction.ID, MoveToLineStartTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.LeftArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Move To Line Start', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(MoveToLineEndTerminalAction, MoveToLineEndTerminalAction.ID, MoveToLineEndTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.RightArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Move To Line End', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SplitTerminalAction, SplitTerminalAction.ID, SplitTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_5,
	mac: {
		primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH,
		secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_5]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Split Terminal', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SplitInActiveWorkspaceTerminalAction, SplitInActiveWorkspaceTerminalAction.ID, SplitInActiveWorkspaceTerminalAction.LABEL), 'Terminal: Split Terminal (In Active Workspace)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusPreviousPaneTerminalAction, FocusPreviousPaneTerminalAction.ID, FocusPreviousPaneTerminalAction.LABEL, {
	primary: KeyMod.Alt | KeyCode.LeftArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	mac: {
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.LeftArrow,
		secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.UpArrow]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Previous Pane', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FocusNextPaneTerminalAction, FocusNextPaneTerminalAction.ID, FocusNextPaneTerminalAction.LABEL, {
	primary: KeyMod.Alt | KeyCode.RightArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	mac: {
		primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.RightArrow,
		secondary: [KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.DownArrow]
	}
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Focus Next Pane', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ResizePaneLeftTerminalAction, ResizePaneLeftTerminalAction.ID, ResizePaneLeftTerminalAction.LABEL, {
	primary: 0,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Left', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ResizePaneRightTerminalAction, ResizePaneRightTerminalAction.ID, ResizePaneRightTerminalAction.LABEL, {
	primary: 0,
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow },
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Right', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ResizePaneUpTerminalAction, ResizePaneUpTerminalAction.ID, ResizePaneUpTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.UpArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Up', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ResizePaneDownTerminalAction, ResizePaneDownTerminalAction.ID, ResizePaneDownTerminalAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Resize Pane Down', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollToPreviousCommandAction, ScrollToPreviousCommandAction.ID, ScrollToPreviousCommandAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate())), 'Terminal: Scroll To Previous Command', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ScrollToNextCommandAction, ScrollToNextCommandAction.ID, ScrollToNextCommandAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate())), 'Terminal: Scroll To Next Command', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectToPreviousCommandAction, SelectToPreviousCommandAction.ID, SelectToPreviousCommandAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select To Previous Command', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectToNextCommandAction, SelectToNextCommandAction.ID, SelectToNextCommandAction.LABEL, {
	primary: 0,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Select To Next Command', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(NavigationModeExitTerminalAction, NavigationModeExitTerminalAction.ID, NavigationModeExitTerminalAction.LABEL, {
	primary: KeyCode.Escape
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED)), 'Terminal: Exit Navigation Mode', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(NavigationModeFocusPreviousTerminalAction, NavigationModeFocusPreviousTerminalAction.ID, NavigationModeFocusPreviousTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED)), 'Terminal: Focus Previous Line (Navigation Mode)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(NavigationModeFocusPreviousTerminalAction, NavigationModeFocusPreviousTerminalAction.ID, NavigationModeFocusPreviousTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED)), 'Terminal: Focus Previous Line (Navigation Mode)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(NavigationModeFocusNextTerminalAction, NavigationModeFocusNextTerminalAction.ID, NavigationModeFocusNextTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED)), 'Terminal: Focus Next Line (Navigation Mode)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(NavigationModeFocusNextTerminalAction, NavigationModeFocusNextTerminalAction.ID, NavigationModeFocusNextTerminalAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow
}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_A11Y_TREE_FOCUS, CONTEXT_ACCESSIBILITY_MODE_ENABLED)), 'Terminal: Focus Next Line (Navigation Mode)', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectToPreviousLineAction, SelectToPreviousLineAction.ID, SelectToPreviousLineAction.LABEL), 'Terminal: Select To Previous Line', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(SelectToNextLineAction, SelectToNextLineAction.ID, SelectToNextLineAction.LABEL), 'Terminal: Select To Next Line', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleEscapeSequenceLoggingAction, ToggleEscapeSequenceLoggingAction.ID, ToggleEscapeSequenceLoggingAction.LABEL), 'Terminal: Toggle Escape Sequence Logging', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleRegexCommand, ToggleRegexCommand.ID, ToggleRegexCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_R,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Toggle find using regex', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleRegexCommand, ToggleRegexCommand.ID, ToggleRegexCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_R,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Toggle find using regex', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleWholeWordCommand, ToggleWholeWordCommand.ID, ToggleWholeWordCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_W,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_W }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Toggle find using whole word', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleWholeWordCommand, ToggleWholeWordCommand.ID, ToggleWholeWordCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_W,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_W }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Toggle find using whole word', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleCaseSensitiveCommand, ToggleCaseSensitiveCommand.ID, ToggleCaseSensitiveCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_C,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Toggle find using case sensitive', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(ToggleCaseSensitiveCommand, ToggleCaseSensitiveCommand.ID, ToggleCaseSensitiveCommand.LABEL, {
	primary: KeyMod.Alt | KeyCode.KEY_C,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Toggle find using case sensitive', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FindNext, FindNext.ID, FindNext.LABEL, {
	primary: KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Find next', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FindNext, FindNext.ID, FindNext.LABEL, {
	primary: KeyCode.F3,
	secondary: [KeyMod.Shift | KeyCode.Enter],
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3, KeyMod.Shift | KeyCode.Enter] }
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Find next', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FindPrevious, FindPrevious.ID, FindPrevious.LABEL, {
	primary: KeyMod.Shift | KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] },
}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Find previous', category);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(FindPrevious, FindPrevious.ID, FindPrevious.LABEL, {
	primary: KeyMod.Shift | KeyCode.F3,
	secondary: [KeyCode.Enter],
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3, KeyCode.Enter] },
}, KEYBINDING_CONTEXT_TERMINAL_FIND_WIDGET_FOCUSED), 'Terminal: Find previous', category);

// Commands might be affected by Web restrictons
if (BrowserFeatures.clipboard.writeText) {
	actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(CopyTerminalSelectionAction, CopyTerminalSelectionAction.ID, CopyTerminalSelectionAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
		win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_C, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C] },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C }
	}, ContextKeyExpr.and(KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, KEYBINDING_CONTEXT_TERMINAL_FOCUS)), 'Terminal: Copy Selection', category);
}
if (BrowserFeatures.clipboard.readText) {
	actionRegistry.registerWorkbenchAction(SyncActionDescriptor.create(TerminalPasteAction, TerminalPasteAction.ID, TerminalPasteAction.LABEL, {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
		win: { primary: KeyMod.CtrlCmd | KeyCode.KEY_V, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V] },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_V }
	}, KEYBINDING_CONTEXT_TERMINAL_FOCUS), 'Terminal: Paste into Active Terminal', category);
}
(new SendSequenceTerminalCommand({
	id: SendSequenceTerminalCommand.ID,
	precondition: undefined,
	description: {
		description: SendSequenceTerminalCommand.LABEL,
		args: [{
			name: 'args',
			schema: {
				type: 'object',
				required: ['text'],
				properties: {
					text: { type: 'string' }
				},
			}
		}]
	}
})).register();
(new CreateNewWithCwdTerminalCommand({
	id: CreateNewWithCwdTerminalCommand.ID,
	precondition: undefined,
	description: {
		description: CreateNewWithCwdTerminalCommand.LABEL,
		args: [{
			name: 'args',
			schema: {
				type: 'object',
				required: ['cwd'],
				properties: {
					cwd: {
						description: CreateNewWithCwdTerminalCommand.CWD_ARG_LABEL,
						type: 'string'
					}
				},
			}
		}]
	}
})).register();

setupTerminalCommands();
setupTerminalMenu();

registerColors();
