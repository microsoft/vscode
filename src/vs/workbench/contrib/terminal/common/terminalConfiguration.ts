/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { localize } from '../../../../nls.js';
import { DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, DEFAULT_COMMANDS_TO_SKIP_SHELL, SUGGESTIONS_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, MAXIMUM_FONT_WEIGHT } from './terminal.js';
import { TerminalLocationString, TerminalSettingId } from '../../../../platform/terminal/common/terminal.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { terminalColorSchema, terminalIconSchema } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { Extensions as WorkbenchExtensions, IConfigurationMigrationRegistry, ConfigurationKeyValuePairs } from '../../../common/configuration.js';

// Import configuration schemes from terminalContrib - this is an exception to the eslint rule since
// they need to be declared at part of the rest of the terminal configuration
import { terminalAccessibilityConfiguration } from '../../terminalContrib/accessibility/common/terminalAccessibilityConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalCommandGuideConfiguration } from '../../terminalContrib/commandGuide/common/terminalCommandGuideConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalInitialHintConfiguration } from '../../terminalContrib/chat/common/terminalInitialHintConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalStickyScrollConfiguration } from '../../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalSuggestConfiguration } from '../../terminalContrib/suggest/common/terminalSuggestConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalTypeAheadConfiguration } from '../../terminalContrib/typeAhead/common/terminalTypeAheadConfiguration.js'; // eslint-disable-line local/code-import-patterns
import { terminalZoomConfiguration } from '../../terminalContrib/zoom/common/terminal.zoom.js'; // eslint-disable-line local/code-import-patterns

const terminalDescriptors = '\n- ' + [
	'`\${cwd}`: ' + localize("cwd", "the terminal's current working directory"),
	'`\${cwdFolder}`: ' + localize('cwdFolder', "the terminal's current working directory, displayed for multi-root workspaces or in a single root workspace when the value differs from the initial working directory. On Windows, this will only be displayed when shell integration is enabled."),
	'`\${workspaceFolder}`: ' + localize('workspaceFolder', "the workspace in which the terminal was launched"),
	'`\${workspaceFolderName}`: ' + localize('workspaceFolderName', "the `name` of the workspace in which the terminal was launched"),
	'`\${local}`: ' + localize('local', "indicates a local terminal in a remote workspace"),
	'`\${process}`: ' + localize('process', "the name of the terminal process"),
	'`\${separator}`: ' + localize('separator', "a conditional separator {0} that only shows when surrounded by variables with values or static text.", '(` - `)'),
	'`\${sequence}`: ' + localize('sequence', "the name provided to the terminal by the process"),
	'`\${task}`: ' + localize('task', "indicates this terminal is associated with a task"),
].join('\n- '); // intentionally concatenated to not produce a string that is too long for translations

let terminalTitle = localize('terminalTitle', "Controls the terminal title. Variables are substituted based on the context:");
terminalTitle += terminalDescriptors;

let terminalDescription = localize('terminalDescription', "Controls the terminal description, which appears to the right of the title. Variables are substituted based on the context:");
terminalDescription += terminalDescriptors;

export const defaultTerminalFontSize = isMacintosh ? 12 : 14;

const terminalConfiguration: IConfigurationNode = {
	id: 'terminal',
	order: 100,
	title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
	type: 'object',
	properties: {
		[TerminalSettingId.SendKeybindingsToShell]: {
			markdownDescription: localize('terminal.integrated.sendKeybindingsToShell', "Dispatches most keybindings to the terminal instead of the workbench, overriding {0}, which can be used alternatively for fine tuning.", '`#terminal.integrated.commandsToSkipShell#`'),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.TabsDefaultColor]: {
			description: localize('terminal.integrated.tabs.defaultColor', "A theme color ID to associate with terminal icons by default."),
			...terminalColorSchema,
			scope: ConfigurationScope.RESOURCE
		},
		[TerminalSettingId.TabsDefaultIcon]: {
			description: localize('terminal.integrated.tabs.defaultIcon', "A codicon ID to associate with terminal icons by default."),
			...terminalIconSchema,
			default: Codicon.terminal.id,
			scope: ConfigurationScope.RESOURCE
		},
		[TerminalSettingId.TabsEnabled]: {
			description: localize('terminal.integrated.tabs.enabled', 'Controls whether terminal tabs display as a list to the side of the terminal. When this is disabled a dropdown will display instead.'),
			type: 'boolean',
			default: true,
		},
		[TerminalSettingId.TabsEnableAnimation]: {
			description: localize('terminal.integrated.tabs.enableAnimation', 'Controls whether terminal tab statuses support animation (eg. in progress tasks).'),
			type: 'boolean',
			default: true,
		},
		[TerminalSettingId.TabsHideCondition]: {
			description: localize('terminal.integrated.tabs.hideCondition', 'Controls whether the terminal tabs view will hide under certain conditions.'),
			type: 'string',
			enum: ['never', 'singleTerminal', 'singleGroup'],
			enumDescriptions: [
				localize('terminal.integrated.tabs.hideCondition.never', "Never hide the terminal tabs view"),
				localize('terminal.integrated.tabs.hideCondition.singleTerminal', "Hide the terminal tabs view when there is only a single terminal opened"),
				localize('terminal.integrated.tabs.hideCondition.singleGroup', "Hide the terminal tabs view when there is only a single terminal group opened"),
			],
			default: 'singleTerminal',
		},
		[TerminalSettingId.TabsShowActiveTerminal]: {
			description: localize('terminal.integrated.tabs.showActiveTerminal', 'Shows the active terminal information in the view. This is particularly useful when the title within the tabs aren\'t visible.'),
			type: 'string',
			enum: ['always', 'singleTerminal', 'singleTerminalOrNarrow', 'never'],
			enumDescriptions: [
				localize('terminal.integrated.tabs.showActiveTerminal.always', "Always show the active terminal"),
				localize('terminal.integrated.tabs.showActiveTerminal.singleTerminal', "Show the active terminal when it is the only terminal opened"),
				localize('terminal.integrated.tabs.showActiveTerminal.singleTerminalOrNarrow', "Show the active terminal when it is the only terminal opened or when the tabs view is in its narrow textless state"),
				localize('terminal.integrated.tabs.showActiveTerminal.never', "Never show the active terminal"),
			],
			default: 'singleTerminalOrNarrow',
		},
		[TerminalSettingId.TabsShowActions]: {
			description: localize('terminal.integrated.tabs.showActions', 'Controls whether terminal split and kill buttons are displays next to the new terminal button.'),
			type: 'string',
			enum: ['always', 'singleTerminal', 'singleTerminalOrNarrow', 'never'],
			enumDescriptions: [
				localize('terminal.integrated.tabs.showActions.always', "Always show the actions"),
				localize('terminal.integrated.tabs.showActions.singleTerminal', "Show the actions when it is the only terminal opened"),
				localize('terminal.integrated.tabs.showActions.singleTerminalOrNarrow', "Show the actions when it is the only terminal opened or when the tabs view is in its narrow textless state"),
				localize('terminal.integrated.tabs.showActions.never', "Never show the actions"),
			],
			default: 'singleTerminalOrNarrow',
		},
		[TerminalSettingId.TabsLocation]: {
			type: 'string',
			enum: ['left', 'right'],
			enumDescriptions: [
				localize('terminal.integrated.tabs.location.left', "Show the terminal tabs view to the left of the terminal"),
				localize('terminal.integrated.tabs.location.right', "Show the terminal tabs view to the right of the terminal")
			],
			default: 'right',
			description: localize('terminal.integrated.tabs.location', "Controls the location of the terminal tabs, either to the left or right of the actual terminal(s).")
		},
		[TerminalSettingId.DefaultLocation]: {
			type: 'string',
			enum: [TerminalLocationString.Editor, TerminalLocationString.TerminalView],
			enumDescriptions: [
				localize('terminal.integrated.defaultLocation.editor', "Create terminals in the editor"),
				localize('terminal.integrated.defaultLocation.view', "Create terminals in the terminal view")
			],
			default: 'view',
			description: localize('terminal.integrated.defaultLocation', "Controls where newly created terminals will appear.")
		},
		[TerminalSettingId.TabsFocusMode]: {
			type: 'string',
			enum: ['singleClick', 'doubleClick'],
			enumDescriptions: [
				localize('terminal.integrated.tabs.focusMode.singleClick', "Focus the terminal when clicking a terminal tab"),
				localize('terminal.integrated.tabs.focusMode.doubleClick', "Focus the terminal when double-clicking a terminal tab")
			],
			default: 'doubleClick',
			description: localize('terminal.integrated.tabs.focusMode', "Controls whether focusing the terminal of a tab happens on double or single click.")
		},
		[TerminalSettingId.MacOptionIsMeta]: {
			description: localize('terminal.integrated.macOptionIsMeta', "Controls whether to treat the option key as the meta key in the terminal on macOS."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.MacOptionClickForcesSelection]: {
			description: localize('terminal.integrated.macOptionClickForcesSelection', "Controls whether to force selection when using Option+click on macOS. This will force a regular (line) selection and disallow the use of column selection mode. This enables copying and pasting using the regular terminal selection, for example, when mouse mode is enabled in tmux."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.AltClickMovesCursor]: {
			markdownDescription: localize('terminal.integrated.altClickMovesCursor', "If enabled, alt/option + click will reposition the prompt cursor to underneath the mouse when {0} is set to {1} (the default value). This may not work reliably depending on your shell.", '`#editor.multiCursorModifier#`', '`\'alt\'`'),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.CopyOnSelection]: {
			description: localize('terminal.integrated.copyOnSelection', "Controls whether text selected in the terminal will be copied to the clipboard."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.EnableMultiLinePasteWarning]: {
			markdownDescription: localize('terminal.integrated.enableMultiLinePasteWarning', "Controls whether to show a warning dialog when pasting multiple lines into the terminal."),
			type: 'string',
			enum: ['auto', 'always', 'never'],
			markdownEnumDescriptions: [
				localize('terminal.integrated.enableMultiLinePasteWarning.auto', "Enable the warning but do not show it when:\n\n- Bracketed paste mode is enabled (the shell supports multi-line paste natively)\n- The paste is handled by the shell's readline (in the case of pwsh)"),
				localize('terminal.integrated.enableMultiLinePasteWarning.always', "Always show the warning if the text contains a new line."),
				localize('terminal.integrated.enableMultiLinePasteWarning.never', "Never show the warning.")
			],
			default: 'auto'
		},
		[TerminalSettingId.DrawBoldTextInBrightColors]: {
			description: localize('terminal.integrated.drawBoldTextInBrightColors', "Controls whether bold text in the terminal will always use the \"bright\" ANSI color variant."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.FontFamily]: {
			markdownDescription: localize('terminal.integrated.fontFamily', "Controls the font family of the terminal. Defaults to {0}'s value.", '`#editor.fontFamily#`'),
			type: 'string'
		},
		// TODO: Support font ligatures
		// 'terminal.integrated.fontLigatures': {
		// 	'description': localize('terminal.integrated.fontLigatures', "Controls whether font ligatures are enabled in the terminal."),
		// 	'type': 'boolean',
		// 	'default': false
		// },
		[TerminalSettingId.FontSize]: {
			description: localize('terminal.integrated.fontSize', "Controls the font size in pixels of the terminal."),
			type: 'number',
			default: defaultTerminalFontSize,
			minimum: 6,
			maximum: 100
		},
		[TerminalSettingId.LetterSpacing]: {
			description: localize('terminal.integrated.letterSpacing', "Controls the letter spacing of the terminal. This is an integer value which represents the number of additional pixels to add between characters."),
			type: 'number',
			default: DEFAULT_LETTER_SPACING
		},
		[TerminalSettingId.LineHeight]: {
			description: localize('terminal.integrated.lineHeight', "Controls the line height of the terminal. This number is multiplied by the terminal font size to get the actual line-height in pixels."),
			type: 'number',
			default: DEFAULT_LINE_HEIGHT
		},
		[TerminalSettingId.MinimumContrastRatio]: {
			markdownDescription: localize('terminal.integrated.minimumContrastRatio', "When set, the foreground color of each cell will change to try meet the contrast ratio specified. Note that this will not apply to `powerline` characters per #146406. Example values:\n\n- 1: Do nothing and use the standard theme colors.\n- 4.5: [WCAG AA compliance (minimum)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html) (default).\n- 7: [WCAG AAA compliance (enhanced)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast7.html).\n- 21: White on black or black on white."),
			type: 'number',
			default: 4.5,
			tags: ['accessibility']
		},
		[TerminalSettingId.TabStopWidth]: {
			markdownDescription: localize('terminal.integrated.tabStopWidth', "The number of cells in a tab stop."),
			type: 'number',
			minimum: 1,
			default: 8
		},
		[TerminalSettingId.FastScrollSensitivity]: {
			markdownDescription: localize('terminal.integrated.fastScrollSensitivity', "Scrolling speed multiplier when pressing `Alt`."),
			type: 'number',
			default: 5
		},
		[TerminalSettingId.MouseWheelScrollSensitivity]: {
			markdownDescription: localize('terminal.integrated.mouseWheelScrollSensitivity', "A multiplier to be used on the `deltaY` of mouse wheel scroll events."),
			type: 'number',
			default: 1
		},
		[TerminalSettingId.BellDuration]: {
			markdownDescription: localize('terminal.integrated.bellDuration', "The number of milliseconds to show the bell within a terminal tab when triggered."),
			type: 'number',
			default: 1000
		},
		[TerminalSettingId.FontWeight]: {
			'anyOf': [
				{
					type: 'number',
					minimum: MINIMUM_FONT_WEIGHT,
					maximum: MAXIMUM_FONT_WEIGHT,
					errorMessage: localize('terminal.integrated.fontWeightError', "Only \"normal\" and \"bold\" keywords or numbers between 1 and 1000 are allowed.")
				},
				{
					type: 'string',
					pattern: '^(normal|bold|1000|[1-9][0-9]{0,2})$'
				},
				{
					enum: SUGGESTIONS_FONT_WEIGHT,
				}
			],
			description: localize('terminal.integrated.fontWeight', "The font weight to use within the terminal for non-bold text. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000."),
			default: 'normal'
		},
		[TerminalSettingId.FontWeightBold]: {
			'anyOf': [
				{
					type: 'number',
					minimum: MINIMUM_FONT_WEIGHT,
					maximum: MAXIMUM_FONT_WEIGHT,
					errorMessage: localize('terminal.integrated.fontWeightError', "Only \"normal\" and \"bold\" keywords or numbers between 1 and 1000 are allowed.")
				},
				{
					type: 'string',
					pattern: '^(normal|bold|1000|[1-9][0-9]{0,2})$'
				},
				{
					enum: SUGGESTIONS_FONT_WEIGHT,
				}
			],
			description: localize('terminal.integrated.fontWeightBold', "The font weight to use within the terminal for bold text. Accepts \"normal\" and \"bold\" keywords or numbers between 1 and 1000."),
			default: 'bold'
		},
		[TerminalSettingId.CursorBlinking]: {
			description: localize('terminal.integrated.cursorBlinking', "Controls whether the terminal cursor blinks."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.CursorStyle]: {
			description: localize('terminal.integrated.cursorStyle', "Controls the style of terminal cursor when the terminal is focused."),
			enum: ['block', 'line', 'underline'],
			default: 'block'
		},
		[TerminalSettingId.CursorStyleInactive]: {
			description: localize('terminal.integrated.cursorStyleInactive', "Controls the style of terminal cursor when the terminal is not focused."),
			enum: ['outline', 'block', 'line', 'underline', 'none'],
			default: 'outline'
		},
		[TerminalSettingId.CursorWidth]: {
			markdownDescription: localize('terminal.integrated.cursorWidth', "Controls the width of the cursor when {0} is set to {1}.", '`#terminal.integrated.cursorStyle#`', '`line`'),
			type: 'number',
			default: 1
		},
		[TerminalSettingId.Scrollback]: {
			description: localize('terminal.integrated.scrollback', "Controls the maximum number of lines the terminal keeps in its buffer. We pre-allocate memory based on this value in order to ensure a smooth experience. As such, as the value increases, so will the amount of memory."),
			type: 'number',
			default: 1000
		},
		[TerminalSettingId.DetectLocale]: {
			markdownDescription: localize('terminal.integrated.detectLocale', "Controls whether to detect and set the `$LANG` environment variable to a UTF-8 compliant option since VS Code's terminal only supports UTF-8 encoded data coming from the shell."),
			type: 'string',
			enum: ['auto', 'off', 'on'],
			markdownEnumDescriptions: [
				localize('terminal.integrated.detectLocale.auto', "Set the `$LANG` environment variable if the existing variable does not exist or it does not end in `'.UTF-8'`."),
				localize('terminal.integrated.detectLocale.off', "Do not set the `$LANG` environment variable."),
				localize('terminal.integrated.detectLocale.on', "Always set the `$LANG` environment variable.")
			],
			default: 'auto'
		},
		[TerminalSettingId.GpuAcceleration]: {
			type: 'string',
			enum: ['auto', 'on', 'off'],
			markdownEnumDescriptions: [
				localize('terminal.integrated.gpuAcceleration.auto', "Let VS Code detect which renderer will give the best experience."),
				localize('terminal.integrated.gpuAcceleration.on', "Enable GPU acceleration within the terminal."),
				localize('terminal.integrated.gpuAcceleration.off', "Disable GPU acceleration within the terminal. The terminal will render much slower when GPU acceleration is off but it should reliably work on all systems."),
			],
			default: 'auto',
			description: localize('terminal.integrated.gpuAcceleration', "Controls whether the terminal will leverage the GPU to do its rendering.")
		},
		[TerminalSettingId.TerminalTitleSeparator]: {
			'type': 'string',
			'default': ' - ',
			'markdownDescription': localize("terminal.integrated.tabs.separator", "Separator used by {0} and {1}.", `\`#${TerminalSettingId.TerminalTitle}#\``, `\`#${TerminalSettingId.TerminalDescription}#\``)
		},
		[TerminalSettingId.TerminalTitle]: {
			'type': 'string',
			'default': '${process}',
			'markdownDescription': terminalTitle
		},
		[TerminalSettingId.TerminalDescription]: {
			'type': 'string',
			'default': '${task}${separator}${local}${separator}${cwdFolder}',
			'markdownDescription': terminalDescription
		},
		[TerminalSettingId.RightClickBehavior]: {
			type: 'string',
			enum: ['default', 'copyPaste', 'paste', 'selectWord', 'nothing'],
			enumDescriptions: [
				localize('terminal.integrated.rightClickBehavior.default', "Show the context menu."),
				localize('terminal.integrated.rightClickBehavior.copyPaste', "Copy when there is a selection, otherwise paste."),
				localize('terminal.integrated.rightClickBehavior.paste', "Paste on right click."),
				localize('terminal.integrated.rightClickBehavior.selectWord', "Select the word under the cursor and show the context menu."),
				localize('terminal.integrated.rightClickBehavior.nothing', "Do nothing and pass event to terminal.")
			],
			default: isMacintosh ? 'selectWord' : isWindows ? 'copyPaste' : 'default',
			description: localize('terminal.integrated.rightClickBehavior', "Controls how terminal reacts to right click.")
		},
		[TerminalSettingId.MiddleClickBehavior]: {
			type: 'string',
			enum: ['default', 'paste'],
			enumDescriptions: [
				localize('terminal.integrated.middleClickBehavior.default', "The platform default to focus the terminal. On Linux this will also paste the selection."),
				localize('terminal.integrated.middleClickBehavior.paste', "Paste on middle click."),
			],
			default: 'default',
			description: localize('terminal.integrated.middleClickBehavior', "Controls how terminal reacts to middle click.")
		},
		[TerminalSettingId.Cwd]: {
			restricted: true,
			description: localize('terminal.integrated.cwd', "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
			type: 'string',
			default: undefined,
			scope: ConfigurationScope.RESOURCE
		},
		[TerminalSettingId.ConfirmOnExit]: {
			description: localize('terminal.integrated.confirmOnExit', "Controls whether to confirm when the window closes if there are active terminal sessions."),
			type: 'string',
			enum: ['never', 'always', 'hasChildProcesses'],
			enumDescriptions: [
				localize('terminal.integrated.confirmOnExit.never', "Never confirm."),
				localize('terminal.integrated.confirmOnExit.always', "Always confirm if there are terminals."),
				localize('terminal.integrated.confirmOnExit.hasChildProcesses', "Confirm if there are any terminals that have child processes."),
			],
			default: 'never'
		},
		[TerminalSettingId.ConfirmOnKill]: {
			description: localize('terminal.integrated.confirmOnKill', "Controls whether to confirm killing terminals when they have child processes. When set to editor, terminals in the editor area will be marked as changed when they have child processes. Note that child process detection may not work well for shells like Git Bash which don't run their processes as child processes of the shell."),
			type: 'string',
			enum: ['never', 'editor', 'panel', 'always'],
			enumDescriptions: [
				localize('terminal.integrated.confirmOnKill.never', "Never confirm."),
				localize('terminal.integrated.confirmOnKill.editor', "Confirm if the terminal is in the editor."),
				localize('terminal.integrated.confirmOnKill.panel', "Confirm if the terminal is in the panel."),
				localize('terminal.integrated.confirmOnKill.always', "Confirm if the terminal is either in the editor or panel."),
			],
			default: 'editor'
		},
		[TerminalSettingId.EnableBell]: {
			markdownDeprecationMessage: localize('terminal.integrated.enableBell', "This is now deprecated. Instead use the `terminal.integrated.enableVisualBell` and `accessibility.signals.terminalBell` settings."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.EnableVisualBell]: {
			description: localize('terminal.integrated.enableVisualBell', "Controls whether the visual terminal bell is enabled. This shows up next to the terminal's name."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.CommandsToSkipShell]: {
			markdownDescription: localize(
				'terminal.integrated.commandsToSkipShell',
				"A set of command IDs whose keybindings will not be sent to the shell but instead always be handled by VS Code. This allows keybindings that would normally be consumed by the shell to act instead the same as when the terminal is not focused, for example `Ctrl+P` to launch Quick Open.\n\n&nbsp;\n\nMany commands are skipped by default. To override a default and pass that command's keybinding to the shell instead, add the command prefixed with the `-` character. For example add `-workbench.action.quickOpen` to allow `Ctrl+P` to reach the shell.\n\n&nbsp;\n\nThe following list of default skipped commands is truncated when viewed in Settings Editor. To see the full list, {1} and search for the first command from the list below.\n\n&nbsp;\n\nDefault Skipped Commands:\n\n{0}",
				DEFAULT_COMMANDS_TO_SKIP_SHELL.sort().map(command => `- ${command}`).join('\n'),
				`[${localize('openDefaultSettingsJson', "open the default settings JSON")}](command:workbench.action.openRawDefaultSettings '${localize('openDefaultSettingsJson.capitalized', "Open Default Settings (JSON)")}')`,

			),
			type: 'array',
			items: {
				type: 'string'
			},
			default: []
		},
		[TerminalSettingId.AllowChords]: {
			markdownDescription: localize('terminal.integrated.allowChords', "Whether or not to allow chord keybindings in the terminal. Note that when this is true and the keystroke results in a chord it will bypass {0}, setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code).", '`#terminal.integrated.commandsToSkipShell#`'),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.AllowMnemonics]: {
			markdownDescription: localize('terminal.integrated.allowMnemonics', "Whether to allow menubar mnemonics (for example Alt+F) to trigger the open of the menubar. Note that this will cause all alt keystrokes to skip the shell when true. This does nothing on macOS."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.EnvMacOs]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.env.osx', "Object with environment variables that will be added to the VS Code process to be used by the terminal on macOS. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		[TerminalSettingId.EnvLinux]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.env.linux', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		[TerminalSettingId.EnvWindows]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.env.windows', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows. Set to `null` to delete the environment variable."),
			type: 'object',
			additionalProperties: {
				type: ['string', 'null']
			},
			default: {}
		},
		[TerminalSettingId.EnvironmentChangesIndicator]: {
			markdownDescription: localize('terminal.integrated.environmentChangesIndicator', "Whether to display the environment changes indicator on each terminal which explains whether extensions have made, or want to make changes to the terminal's environment."),
			type: 'string',
			enum: ['off', 'on', 'warnonly'],
			enumDescriptions: [
				localize('terminal.integrated.environmentChangesIndicator.off', "Disable the indicator."),
				localize('terminal.integrated.environmentChangesIndicator.on', "Enable the indicator."),
				localize('terminal.integrated.environmentChangesIndicator.warnonly', "Only show the warning indicator when a terminal's environment is 'stale', not the information indicator that shows a terminal has had its environment modified by an extension."),
			],
			default: 'warnonly'
		},
		[TerminalSettingId.EnvironmentChangesRelaunch]: {
			markdownDescription: localize('terminal.integrated.environmentChangesRelaunch', "Whether to relaunch terminals automatically if extensions want to contribute to their environment and have not been interacted with yet."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.ShowExitAlert]: {
			description: localize('terminal.integrated.showExitAlert', "Controls whether to show the alert \"The terminal process terminated with exit code\" when exit code is non-zero."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.ExperimentalWindowsUseConptyDll]: {
			markdownDescription: localize('terminal.integrated.experimentalWindowsUseConptyDll', "Whether to use the experimental conpty.dll shipped with VS Code, instead of the one bundled with Windows."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.SplitCwd]: {
			description: localize('terminal.integrated.splitCwd', "Controls the working directory a split terminal starts with."),
			type: 'string',
			enum: ['workspaceRoot', 'initial', 'inherited'],
			enumDescriptions: [
				localize('terminal.integrated.splitCwd.workspaceRoot', "A new split terminal will use the workspace root as the working directory. In a multi-root workspace a choice for which root folder to use is offered."),
				localize('terminal.integrated.splitCwd.initial', "A new split terminal will use the working directory that the parent terminal started with."),
				localize('terminal.integrated.splitCwd.inherited', "On macOS and Linux, a new split terminal will use the working directory of the parent terminal. On Windows, this behaves the same as initial."),
			],
			default: 'inherited'
		},
		[TerminalSettingId.WindowsEnableConpty]: {
			description: localize('terminal.integrated.windowsEnableConpty', "Whether to use ConPTY for Windows terminal process communication (requires Windows 10 build number 18309+). Winpty will be used if this is false."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.WordSeparators]: {
			markdownDescription: localize('terminal.integrated.wordSeparators', "A string containing all characters to be considered word separators when double-clicking to select word and in the fallback 'word' link detection. Since this is used for link detection, including characters such as `:` that are used when detecting links will cause the line and column part of links like `file:10:5` to be ignored."),
			type: 'string',
			// allow-any-unicode-next-line
			default: ' ()[]{}\',"`─‘’“”|'
		},
		[TerminalSettingId.EnableFileLinks]: {
			description: localize('terminal.integrated.enableFileLinks', "Whether to enable file links in terminals. Links can be slow when working on a network drive in particular because each file link is verified against the file system. Changing this will take effect only in new terminals."),
			type: 'string',
			enum: ['off', 'on', 'notRemote'],
			enumDescriptions: [
				localize('enableFileLinks.off', "Always off."),
				localize('enableFileLinks.on', "Always on."),
				localize('enableFileLinks.notRemote', "Enable only when not in a remote workspace.")
			],
			default: 'on'
		},
		[TerminalSettingId.AllowedLinkSchemes]: {
			description: localize('terminal.integrated.allowedLinkSchemes', "An array of strings containing the URI schemes that the terminal is allowed to open links for. By default, only a small subset of possible schemes are allowed for security reasons."),
			type: 'array',
			items: {
				type: 'string'
			},
			default: [
				'file',
				'http',
				'https',
				'mailto',
				'vscode',
				'vscode-insiders',
			]
		},
		[TerminalSettingId.UnicodeVersion]: {
			type: 'string',
			enum: ['6', '11'],
			enumDescriptions: [
				localize('terminal.integrated.unicodeVersion.six', "Version 6 of Unicode. This is an older version which should work better on older systems."),
				localize('terminal.integrated.unicodeVersion.eleven', "Version 11 of Unicode. This version provides better support on modern systems that use modern versions of Unicode.")
			],
			default: '11',
			description: localize('terminal.integrated.unicodeVersion', "Controls what version of Unicode to use when evaluating the width of characters in the terminal. If you experience emoji or other wide characters not taking up the right amount of space or backspace either deleting too much or too little then you may want to try tweaking this setting.")
		},
		[TerminalSettingId.EnablePersistentSessions]: {
			description: localize('terminal.integrated.enablePersistentSessions', "Persist terminal sessions/history for the workspace across window reloads."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.PersistentSessionReviveProcess]: {
			markdownDescription: localize('terminal.integrated.persistentSessionReviveProcess', "When the terminal process must be shut down (for example on window or application close), this determines when the previous terminal session contents/history should be restored and processes be recreated when the workspace is next opened.\n\nCaveats:\n\n- Restoring of the process current working directory depends on whether it is supported by the shell.\n- Time to persist the session during shutdown is limited, so it may be aborted when using high-latency remote connections."),
			type: 'string',
			enum: ['onExit', 'onExitAndWindowClose', 'never'],
			markdownEnumDescriptions: [
				localize('terminal.integrated.persistentSessionReviveProcess.onExit', "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu)."),
				localize('terminal.integrated.persistentSessionReviveProcess.onExitAndWindowClose', "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), or when the window is closed."),
				localize('terminal.integrated.persistentSessionReviveProcess.never', "Never restore the terminal buffers or recreate the process.")
			],
			default: 'onExit'
		},
		[TerminalSettingId.HideOnStartup]: {
			description: localize('terminal.integrated.hideOnStartup', "Whether to hide the terminal view on startup, avoiding creating a terminal when there are no persistent sessions."),
			type: 'string',
			enum: ['never', 'whenEmpty', 'always'],
			markdownEnumDescriptions: [
				localize('hideOnStartup.never', "Never hide the terminal view on startup."),
				localize('hideOnStartup.whenEmpty', "Only hide the terminal when there are no persistent sessions restored."),
				localize('hideOnStartup.always', "Always hide the terminal, even when there are persistent sessions restored.")
			],
			default: 'never'
		},
		[TerminalSettingId.CustomGlyphs]: {
			markdownDescription: localize('terminal.integrated.customGlyphs', "Whether to draw custom glyphs for block element and box drawing characters instead of using the font, which typically yields better rendering with continuous lines. Note that this doesn't work when {0} is disabled.", `\`#${TerminalSettingId.GpuAcceleration}#\``),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.RescaleOverlappingGlyphs]: {
			markdownDescription: localize('terminal.integrated.rescaleOverlappingGlyphs', "Whether to rescale glyphs horizontally that are a single cell wide but have glyphs that would overlap following cell(s). This typically happens for ambiguous width characters (eg. the roman numeral characters U+2160+) which aren't featured in monospace fonts. Emoji glyphs are never rescaled."),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.AutoReplies]: {
			markdownDescription: localize('terminal.integrated.autoReplies', "A set of messages that, when encountered in the terminal, will be automatically responded to. Provided the message is specific enough, this can help automate away common responses.\n\nRemarks:\n\n- Use {0} to automatically respond to the terminate batch job prompt on Windows.\n- The message includes escape sequences so the reply might not happen with styled text.\n- Each reply can only happen once every second.\n- Use {1} in the reply to mean the enter key.\n- To unset a default key, set the value to null.\n- Restart VS Code if new don't apply.", '`"Terminate batch job (Y/N)": "Y\\r"`', '`"\\r"`'),
			type: 'object',
			additionalProperties: {
				oneOf: [{
					type: 'string',
					description: localize('terminal.integrated.autoReplies.reply', "The reply to send to the process.")
				},
				{ type: 'null' }]
			},
			default: {}
		},
		[TerminalSettingId.ShellIntegrationEnabled]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellIntegration.enabled', "Determines whether or not shell integration is auto-injected to support features like enhanced command tracking and current working directory detection. \n\nShell integration works by injecting the shell with a startup script. The script gives VS Code insight into what is happening within the terminal.\n\nSupported shells:\n\n- Linux/macOS: bash, fish, pwsh, zsh\n - Windows: pwsh, git bash\n\nThis setting applies only when terminals are created, so you will need to restart your terminals for it to take effect.\n\n Note that the script injection may not work if you have custom arguments defined in the terminal profile, have enabled {1}, have a [complex bash `PROMPT_COMMAND`](https://code.visualstudio.com/docs/editor/integrated-terminal#_complex-bash-promptcommand), or other unsupported setup. To disable decorations, see {0}", '`#terminal.integrated.shellIntegrations.decorationsEnabled#`', '`#editor.accessibilitySupport#`'),
			type: 'boolean',
			default: true
		},
		[TerminalSettingId.ShellIntegrationDecorationsEnabled]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellIntegration.decorationsEnabled', "When shell integration is enabled, adds a decoration for each command."),
			type: 'string',
			enum: ['both', 'gutter', 'overviewRuler', 'never'],
			enumDescriptions: [
				localize('terminal.integrated.shellIntegration.decorationsEnabled.both', "Show decorations in the gutter (left) and overview ruler (right)"),
				localize('terminal.integrated.shellIntegration.decorationsEnabled.gutter', "Show gutter decorations to the left of the terminal"),
				localize('terminal.integrated.shellIntegration.decorationsEnabled.overviewRuler', "Show overview ruler decorations to the right of the terminal"),
				localize('terminal.integrated.shellIntegration.decorationsEnabled.never', "Do not show decorations"),
			],
			default: 'both'
		},
		[TerminalSettingId.ShellIntegrationCommandHistory]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.shellIntegration.history', "Controls the number of recently used commands to keep in the terminal command history. Set to 0 to disable terminal command history."),
			type: 'number',
			default: 100
		},
		[TerminalSettingId.SmoothScrolling]: {
			markdownDescription: localize('terminal.integrated.smoothScrolling', "Controls whether the terminal will scroll using an animation."),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.IgnoreBracketedPasteMode]: {
			markdownDescription: localize('terminal.integrated.ignoreBracketedPasteMode', "Controls whether the terminal will ignore bracketed paste mode even if the terminal was put into the mode, omitting the {0} and {1} sequences when pasting. This is useful when the shell is not respecting the mode which can happen in sub-shells for example.", '`\\x1b[200~`', '`\\x1b[201~`'),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.EnableImages]: {
			restricted: true,
			markdownDescription: localize('terminal.integrated.enableImages', "Enables image support in the terminal, this will only work when {0} is enabled. Both sixel and iTerm's inline image protocol are supported on Linux and macOS, Windows support will light up automatically when ConPTY passes through the sequences. Images will currently not be restored between window reloads/reconnects.", `\`#${TerminalSettingId.GpuAcceleration}#\``),
			type: 'boolean',
			default: false
		},
		[TerminalSettingId.FocusAfterRun]: {
			markdownDescription: localize('terminal.integrated.focusAfterRun', "Controls whether the terminal, accessible buffer, or neither will be focused after `Terminal: Run Selected Text In Active Terminal` has been run."),
			enum: ['terminal', 'accessible-buffer', 'none'],
			default: 'none',
			tags: ['accessibility'],
			markdownEnumDescriptions: [
				localize('terminal.integrated.focusAfterRun.terminal', "Always focus the terminal."),
				localize('terminal.integrated.focusAfterRun.accessible-buffer', "Always focus the accessible buffer."),
				localize('terminal.integrated.focusAfterRun.none', "Do nothing."),
			]
		},
		...terminalAccessibilityConfiguration,
		...terminalCommandGuideConfiguration,
		...terminalInitialHintConfiguration,
		...terminalStickyScrollConfiguration,
		...terminalSuggestConfiguration,
		...terminalTypeAheadConfiguration,
		...terminalZoomConfiguration,
	}
};

export function registerTerminalConfiguration() {
	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	configurationRegistry.registerConfiguration(terminalConfiguration);
}

Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration)
	.registerConfigurationMigrations([{
		key: TerminalSettingId.EnableBell,
		migrateFn: (enableBell, accessor) => {
			const configurationKeyValuePairs: ConfigurationKeyValuePairs = [];
			let announcement = accessor('accessibility.signals.terminalBell')?.announcement ?? accessor('accessibility.alert.terminalBell');
			if (announcement !== undefined && typeof announcement !== 'string') {
				announcement = announcement ? 'auto' : 'off';
			}
			configurationKeyValuePairs.push(['accessibility.signals.terminalBell', { value: { sound: enableBell ? 'on' : 'off', announcement } }]);
			configurationKeyValuePairs.push([TerminalSettingId.EnableBell, { value: undefined }]);
			configurationKeyValuePairs.push([TerminalSettingId.EnableVisualBell, { value: enableBell }]);
			return configurationKeyValuePairs;
		}
	}]);
