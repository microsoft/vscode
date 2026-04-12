/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import product from '../../../../platform/product/common/product.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { terminalColorSchema, terminalIconSchema } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { Extensions as WorkbenchExtensions } from '../../../common/configuration.js';
import { terminalContribConfiguration } from '../terminalContribExports.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MAXIMUM_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, SUGGESTIONS_FONT_WEIGHT } from './terminal.js';
const terminalDescriptors = '\n- ' + [
    '`\${cwd}`: ' + localize("cwd", "the terminal's current working directory."),
    '`\${cwdFolder}`: ' + localize('cwdFolder', "the terminal's current working directory, displayed for multi-root workspaces or in a single root workspace when the value differs from the initial working directory. On Windows, this will only be displayed when shell integration is enabled."),
    '`\${workspaceFolder}`: ' + localize('workspaceFolder', "the workspace in which the terminal was launched."),
    '`\${workspaceFolderName}`: ' + localize('workspaceFolderName', "the `name` of the workspace in which the terminal was launched."),
    '`\${local}`: ' + localize('local', "indicates a local terminal in a remote workspace."),
    '`\${process}`: ' + localize('process', "the name of the terminal process."),
    '`\${progress}`: ' + localize('progress', "the progress state as reported by the `OSC 9;4` sequence."),
    '`\${separator}`: ' + localize('separator', "a conditional separator {0} that only shows when it's surrounded by variables with values or static text.", '(` - `)'),
    '`\${sequence}`: ' + localize('sequence', "the name provided to the terminal by the process."),
    '`\${task}`: ' + localize('task', "indicates this terminal is associated with a task."),
    '`\${shellType}`: ' + localize('shellType', "the detected shell type."),
    '`\${shellCommand}`: ' + localize('shellCommand', "the command being executed according to shell integration. This also requires high confidence in the detected command line, which may not work in some prompt frameworks."),
    '`\${shellPromptInput}`: ' + localize('shellPromptInput', "the shell's full prompt input according to shell integration."),
].join('\n- '); // intentionally concatenated to not produce a string that is too long for translations
let terminalTitle = localize('terminalTitle', "Controls the terminal title. Variables are substituted based on the context:");
terminalTitle += terminalDescriptors;
let terminalDescription = localize('terminalDescription', "Controls the terminal description, which appears to the right of the title. Variables are substituted based on the context:");
terminalDescription += terminalDescriptors;
export const defaultTerminalFontSize = isMacintosh ? 12 : 14;
const terminalConfiguration = {
    ["terminal.integrated.sendKeybindingsToShell" /* TerminalSettingId.SendKeybindingsToShell */]: {
        markdownDescription: localize('terminal.integrated.sendKeybindingsToShell', "Dispatches most keybindings to the terminal instead of the workbench, overriding {0}, which can be used alternatively for fine tuning.", '`#terminal.integrated.commandsToSkipShell#`'),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.tabs.defaultColor" /* TerminalSettingId.TabsDefaultColor */]: {
        description: localize('terminal.integrated.tabs.defaultColor', "A theme color ID to associate with terminal icons by default."),
        ...terminalColorSchema,
        scope: 5 /* ConfigurationScope.RESOURCE */
    },
    ["terminal.integrated.tabs.defaultIcon" /* TerminalSettingId.TabsDefaultIcon */]: {
        description: localize('terminal.integrated.tabs.defaultIcon', "A codicon ID to associate with terminal icons by default."),
        ...terminalIconSchema,
        default: Codicon.terminal.id,
        scope: 5 /* ConfigurationScope.RESOURCE */
    },
    ["terminal.integrated.tabs.enabled" /* TerminalSettingId.TabsEnabled */]: {
        description: localize('terminal.integrated.tabs.enabled', 'Controls whether terminal tabs display as a list to the side of the terminal. When this is disabled a dropdown will display instead.'),
        type: 'boolean',
        default: true,
    },
    ["terminal.integrated.tabs.enableAnimation" /* TerminalSettingId.TabsEnableAnimation */]: {
        description: localize('terminal.integrated.tabs.enableAnimation', 'Controls whether terminal tab statuses support animation (eg. in progress tasks).'),
        type: 'boolean',
        default: true,
    },
    ["terminal.integrated.tabs.hideCondition" /* TerminalSettingId.TabsHideCondition */]: {
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
    ["terminal.integrated.tabs.showActiveTerminal" /* TerminalSettingId.TabsShowActiveTerminal */]: {
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
    ["terminal.integrated.tabs.showActions" /* TerminalSettingId.TabsShowActions */]: {
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
    ["terminal.integrated.tabs.location" /* TerminalSettingId.TabsLocation */]: {
        type: 'string',
        enum: ['left', 'right'],
        enumDescriptions: [
            localize('terminal.integrated.tabs.location.left', "Show the terminal tabs view to the left of the terminal"),
            localize('terminal.integrated.tabs.location.right', "Show the terminal tabs view to the right of the terminal")
        ],
        default: 'right',
        description: localize('terminal.integrated.tabs.location', "Controls the location of the terminal tabs, either to the left or right of the actual terminal(s).")
    },
    ["terminal.integrated.defaultLocation" /* TerminalSettingId.DefaultLocation */]: {
        type: 'string',
        enum: ["editor" /* TerminalLocationConfigValue.Editor */, "view" /* TerminalLocationConfigValue.TerminalView */],
        enumDescriptions: [
            localize('terminal.integrated.defaultLocation.editor', "Create terminals in the editor"),
            localize('terminal.integrated.defaultLocation.view', "Create terminals in the terminal view")
        ],
        default: 'view',
        description: localize('terminal.integrated.defaultLocation', "Controls where newly created terminals will appear.")
    },
    ["terminal.integrated.tabs.focusMode" /* TerminalSettingId.TabsFocusMode */]: {
        type: 'string',
        enum: ['singleClick', 'doubleClick'],
        enumDescriptions: [
            localize('terminal.integrated.tabs.focusMode.singleClick', "Focus the terminal when clicking a terminal tab"),
            localize('terminal.integrated.tabs.focusMode.doubleClick', "Focus the terminal when double-clicking a terminal tab")
        ],
        default: 'doubleClick',
        description: localize('terminal.integrated.tabs.focusMode', "Controls whether focusing the terminal of a tab happens on double or single click.")
    },
    ["terminal.integrated.macOptionIsMeta" /* TerminalSettingId.MacOptionIsMeta */]: {
        description: localize('terminal.integrated.macOptionIsMeta', "Controls whether to treat the option key as the meta key in the terminal on macOS."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.macOptionClickForcesSelection" /* TerminalSettingId.MacOptionClickForcesSelection */]: {
        description: localize('terminal.integrated.macOptionClickForcesSelection', "Controls whether to force selection when using Option+click on macOS. This will force a regular (line) selection and disallow the use of column selection mode. This enables copying and pasting using the regular terminal selection, for example, when mouse mode is enabled in tmux."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.altClickMovesCursor" /* TerminalSettingId.AltClickMovesCursor */]: {
        markdownDescription: localize('terminal.integrated.altClickMovesCursor', "If enabled, alt/option + click will reposition the prompt cursor to underneath the mouse when {0} is set to {1} (the default value). This may not work reliably depending on your shell.", '`#editor.multiCursorModifier#`', '`\'alt\'`'),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.copyOnSelection" /* TerminalSettingId.CopyOnSelection */]: {
        description: localize('terminal.integrated.copyOnSelection', "Controls whether text selected in the terminal will be copied to the clipboard."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */]: {
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
    ["terminal.integrated.drawBoldTextInBrightColors" /* TerminalSettingId.DrawBoldTextInBrightColors */]: {
        description: localize('terminal.integrated.drawBoldTextInBrightColors', "Controls whether bold text in the terminal will always use the \"bright\" ANSI color variant."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */]: {
        markdownDescription: localize('terminal.integrated.fontFamily', "Controls the font family of the terminal. Defaults to {0}'s value.", '`#editor.fontFamily#`'),
        type: 'string',
    },
    ["terminal.integrated.fontLigatures.enabled" /* TerminalSettingId.FontLigaturesEnabled */]: {
        markdownDescription: localize('terminal.integrated.fontLigatures.enabled', "Controls whether font ligatures are enabled in the terminal. Ligatures will only work if the configured {0} supports them.", `\`#${"terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */}#\``),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.fontLigatures.featureSettings" /* TerminalSettingId.FontLigaturesFeatureSettings */]: {
        markdownDescription: localize('terminal.integrated.fontLigatures.featureSettings', "Controls what font feature settings are used when ligatures are enabled, in the format of the `font-feature-settings` CSS property. Some examples which may be valid depending on the font:") + '\n\n- ' + [
            `\`"calt" off, "ss03"\``,
            `\`"liga" on\``,
            `\`"calt" off, "dlig" on\``
        ].join('\n- '),
        type: 'string',
        default: '"calt" on'
    },
    ["terminal.integrated.fontLigatures.fallbackLigatures" /* TerminalSettingId.FontLigaturesFallbackLigatures */]: {
        markdownDescription: localize('terminal.integrated.fontLigatures.fallbackLigatures', "When {0} is enabled and the particular {1} cannot be parsed, this is the set of character sequences that will always be drawn together. This allows the use of a fixed set of ligatures even when the font isn't supported.", `\`#${"terminal.integrated.gpuAcceleration" /* TerminalSettingId.GpuAcceleration */}#\``, `\`#${"terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */}#\``),
        type: 'array',
        items: [{ type: 'string' }],
        default: [
            '<--', '<---', '<<-', '<-', '->', '->>', '-->', '--->',
            '<==', '<===', '<<=', '<=', '=>', '=>>', '==>', '===>', '>=', '>>=',
            '<->', '<-->', '<--->', '<---->', '<=>', '<==>', '<===>', '<====>', '::', ':::',
            '<~~', '</', '</>', '/>', '~~>', '==', '!=', '/=', '~=', '<>', '===', '!==', '!===',
            '<:', ':=', '*=', '*+', '<*', '<*>', '*>', '<|', '<|>', '|>', '+*', '=*', '=:', ':>',
            '/*', '*/', '+++', '<!--', '<!---'
        ]
    },
    ["terminal.integrated.fontSize" /* TerminalSettingId.FontSize */]: {
        description: localize('terminal.integrated.fontSize', "Controls the font size in pixels of the terminal."),
        type: 'number',
        default: defaultTerminalFontSize,
        minimum: 6,
        maximum: 100
    },
    ["terminal.integrated.letterSpacing" /* TerminalSettingId.LetterSpacing */]: {
        description: localize('terminal.integrated.letterSpacing', "Controls the letter spacing of the terminal. This is an integer value which represents the number of additional pixels to add between characters."),
        type: 'number',
        default: DEFAULT_LETTER_SPACING
    },
    ["terminal.integrated.lineHeight" /* TerminalSettingId.LineHeight */]: {
        description: localize('terminal.integrated.lineHeight', "Controls the line height of the terminal. This number is multiplied by the terminal font size to get the actual line-height in pixels."),
        type: 'number',
        default: DEFAULT_LINE_HEIGHT
    },
    ["terminal.integrated.minimumContrastRatio" /* TerminalSettingId.MinimumContrastRatio */]: {
        markdownDescription: localize('terminal.integrated.minimumContrastRatio', "When set, the foreground color of each cell will change to try meet the contrast ratio specified. Note that this will not apply to `powerline` characters per #146406. Example values:\n\n- 1: Do nothing and use the standard theme colors.\n- 4.5: [WCAG AA compliance (minimum)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html) (default).\n- 7: [WCAG AAA compliance (enhanced)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast7.html).\n- 21: White on black or black on white."),
        type: 'number',
        default: 4.5,
        tags: ['accessibility']
    },
    ["terminal.integrated.tabStopWidth" /* TerminalSettingId.TabStopWidth */]: {
        markdownDescription: localize('terminal.integrated.tabStopWidth', "The number of cells in a tab stop."),
        type: 'number',
        minimum: 1,
        default: 8
    },
    ["terminal.integrated.fastScrollSensitivity" /* TerminalSettingId.FastScrollSensitivity */]: {
        markdownDescription: localize('terminal.integrated.fastScrollSensitivity', "Scrolling speed multiplier when pressing `Alt`."),
        type: 'number',
        default: 5
    },
    ["terminal.integrated.mouseWheelScrollSensitivity" /* TerminalSettingId.MouseWheelScrollSensitivity */]: {
        markdownDescription: localize('terminal.integrated.mouseWheelScrollSensitivity', "A multiplier to be used on the `deltaY` of mouse wheel scroll events."),
        type: 'number',
        default: 1
    },
    ["terminal.integrated.bellDuration" /* TerminalSettingId.BellDuration */]: {
        markdownDescription: localize('terminal.integrated.bellDuration', "The number of milliseconds to show the bell within a terminal tab when triggered."),
        type: 'number',
        default: 1000
    },
    ["terminal.integrated.fontWeight" /* TerminalSettingId.FontWeight */]: {
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
    ["terminal.integrated.fontWeightBold" /* TerminalSettingId.FontWeightBold */]: {
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
    ["terminal.integrated.cursorBlinking" /* TerminalSettingId.CursorBlinking */]: {
        description: localize('terminal.integrated.cursorBlinking', "Controls whether the terminal cursor blinks."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.textBlinking" /* TerminalSettingId.TextBlinking */]: {
        description: localize('terminal.integrated.textBlinking', "Controls whether text blinking is enabled in the terminal."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.cursorStyle" /* TerminalSettingId.CursorStyle */]: {
        description: localize('terminal.integrated.cursorStyle', "Controls the style of terminal cursor when the terminal is focused."),
        enum: ['block', 'line', 'underline'],
        default: 'block'
    },
    ["terminal.integrated.cursorStyleInactive" /* TerminalSettingId.CursorStyleInactive */]: {
        description: localize('terminal.integrated.cursorStyleInactive', "Controls the style of terminal cursor when the terminal is not focused."),
        enum: ['outline', 'block', 'line', 'underline', 'none'],
        default: 'outline'
    },
    ["terminal.integrated.cursorWidth" /* TerminalSettingId.CursorWidth */]: {
        markdownDescription: localize('terminal.integrated.cursorWidth', "Controls the width of the cursor when {0} is set to {1}.", '`#terminal.integrated.cursorStyle#`', '`line`'),
        type: 'number',
        default: 1
    },
    ["terminal.integrated.scrollback" /* TerminalSettingId.Scrollback */]: {
        description: localize('terminal.integrated.scrollback', "Controls the maximum number of lines the terminal keeps in its buffer. We pre-allocate memory based on this value in order to ensure a smooth experience. As such, as the value increases, so will the amount of memory."),
        type: 'number',
        default: 1000
    },
    ["terminal.integrated.detectLocale" /* TerminalSettingId.DetectLocale */]: {
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
    ["terminal.integrated.gpuAcceleration" /* TerminalSettingId.GpuAcceleration */]: {
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
    ["terminal.integrated.tabs.separator" /* TerminalSettingId.TerminalTitleSeparator */]: {
        'type': 'string',
        'default': ' - ',
        'markdownDescription': localize("terminal.integrated.tabs.separator", "Separator used by {0} and {1}.", `\`#${"terminal.integrated.tabs.title" /* TerminalSettingId.TerminalTitle */}#\``, `\`#${"terminal.integrated.tabs.description" /* TerminalSettingId.TerminalDescription */}#\``)
    },
    ["terminal.integrated.tabs.title" /* TerminalSettingId.TerminalTitle */]: {
        'type': 'string',
        'default': '${process}',
        'markdownDescription': terminalTitle
    },
    ["terminal.integrated.tabs.description" /* TerminalSettingId.TerminalDescription */]: {
        'type': 'string',
        'default': '${task}${separator}${local}${separator}${cwdFolder}',
        'markdownDescription': terminalDescription
    },
    ["terminal.integrated.rightClickBehavior" /* TerminalSettingId.RightClickBehavior */]: {
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
    ["terminal.integrated.middleClickBehavior" /* TerminalSettingId.MiddleClickBehavior */]: {
        type: 'string',
        enum: ['default', 'paste'],
        enumDescriptions: [
            localize('terminal.integrated.middleClickBehavior.default', "The platform default to focus the terminal. On Linux this will also paste the selection."),
            localize('terminal.integrated.middleClickBehavior.paste', "Paste on middle click."),
        ],
        default: 'default',
        description: localize('terminal.integrated.middleClickBehavior', "Controls how terminal reacts to middle click.")
    },
    ["terminal.integrated.cwd" /* TerminalSettingId.Cwd */]: {
        restricted: true,
        description: localize('terminal.integrated.cwd', "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
        type: 'string',
        default: undefined,
        scope: 5 /* ConfigurationScope.RESOURCE */
    },
    ["terminal.integrated.confirmOnExit" /* TerminalSettingId.ConfirmOnExit */]: {
        description: localize('terminal.integrated.confirmOnExit', "Controls whether to confirm when the window closes if there are active terminal sessions. Background terminals like those launched by some extensions will not trigger the confirmation."),
        type: 'string',
        enum: ['never', 'always', 'hasChildProcesses'],
        enumDescriptions: [
            localize('terminal.integrated.confirmOnExit.never', "Never confirm."),
            localize('terminal.integrated.confirmOnExit.always', "Always confirm if there are terminals."),
            localize('terminal.integrated.confirmOnExit.hasChildProcesses', "Confirm if there are any terminals that have child processes."),
        ],
        default: 'never'
    },
    ["terminal.integrated.confirmOnKill" /* TerminalSettingId.ConfirmOnKill */]: {
        description: localize('terminal.integrated.confirmOnKill', "Controls whether to confirm killing terminals when they have child processes. When set to editor, terminals in the editor area will be marked as changed when they have child processes. Note that child process detection may not work well for shells like Git Bash which don't run their processes as child processes of the shell. Background terminals like those launched by some extensions will not trigger the confirmation."),
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
    ["terminal.integrated.enableBell" /* TerminalSettingId.EnableBell */]: {
        markdownDeprecationMessage: localize('terminal.integrated.enableBell', "This is now deprecated. Instead use the `terminal.integrated.enableVisualBell` and `accessibility.signals.terminalBell` settings."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.enableVisualBell" /* TerminalSettingId.EnableVisualBell */]: {
        description: localize('terminal.integrated.enableVisualBell', "Controls whether the visual terminal bell is enabled. This shows up next to the terminal's name."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.commandsToSkipShell" /* TerminalSettingId.CommandsToSkipShell */]: {
        markdownDescription: localize('terminal.integrated.commandsToSkipShell', "A set of command IDs whose keybindings will not be sent to the shell but instead always be handled by VS Code. This allows keybindings that would normally be consumed by the shell to act instead the same as when the terminal is not focused, for example `Ctrl+P` to launch Quick Open.\n\n&nbsp;\n\nMany commands are skipped by default. To override a default and pass that command's keybinding to the shell instead, add the command prefixed with the `-` character. For example add `-workbench.action.quickOpen` to allow `Ctrl+P` to reach the shell.\n\n&nbsp;\n\nThe following list of default skipped commands is truncated when viewed in Settings Editor. To see the full list, {1} and search for the first command from the list below.\n\n&nbsp;\n\nDefault Skipped Commands:\n\n{0}", DEFAULT_COMMANDS_TO_SKIP_SHELL.sort().map(command => `- ${command}`).join('\n'), `[${localize('openDefaultSettingsJson', "open the default settings JSON")}](command:workbench.action.openRawDefaultSettings '${localize('openDefaultSettingsJson.capitalized', "Open Default Settings (JSON)")}')`),
        type: 'array',
        items: {
            type: 'string'
        },
        default: []
    },
    ["terminal.integrated.allowChords" /* TerminalSettingId.AllowChords */]: {
        markdownDescription: localize('terminal.integrated.allowChords', "Whether or not to allow chord keybindings in the terminal. Note that when this is true and the keystroke results in a chord it will bypass {0}, setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code).", '`#terminal.integrated.commandsToSkipShell#`'),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.allowMnemonics" /* TerminalSettingId.AllowMnemonics */]: {
        markdownDescription: localize('terminal.integrated.allowMnemonics', "Whether to allow menubar mnemonics (for example Alt+F) to trigger the open of the menubar. Note that this will cause all alt keystrokes to skip the shell when true. This does nothing on macOS."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.env.osx" /* TerminalSettingId.EnvMacOs */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.env.osx', "Object with environment variables that will be added to the VS Code process to be used by the terminal on macOS. Set to `null` to delete the environment variable."),
        type: 'object',
        additionalProperties: {
            type: ['string', 'null']
        },
        default: {}
    },
    ["terminal.integrated.env.linux" /* TerminalSettingId.EnvLinux */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.env.linux', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux. Set to `null` to delete the environment variable."),
        type: 'object',
        additionalProperties: {
            type: ['string', 'null']
        },
        default: {}
    },
    ["terminal.integrated.env.windows" /* TerminalSettingId.EnvWindows */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.env.windows', "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows. Set to `null` to delete the environment variable."),
        type: 'object',
        additionalProperties: {
            type: ['string', 'null']
        },
        default: {}
    },
    ["terminal.integrated.environmentChangesRelaunch" /* TerminalSettingId.EnvironmentChangesRelaunch */]: {
        markdownDescription: localize('terminal.integrated.environmentChangesRelaunch', "Whether to relaunch terminals automatically if extensions want to contribute to their environment and have not been interacted with yet."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.showExitAlert" /* TerminalSettingId.ShowExitAlert */]: {
        description: localize('terminal.integrated.showExitAlert', "Controls whether to show the alert \"The terminal process terminated with exit code\" when exit code is non-zero."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.windowsUseConptyDll" /* TerminalSettingId.WindowsUseConptyDll */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.windowsUseConptyDll', "Whether to use the experimental conpty.dll (v1.25.260303002) shipped with VS Code, instead of the one bundled with Windows."),
        type: 'boolean',
        tags: ['preview'],
        default: false,
        experiment: {
            mode: 'auto'
        },
    },
    ["terminal.integrated.splitCwd" /* TerminalSettingId.SplitCwd */]: {
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
    ["terminal.integrated.wordSeparators" /* TerminalSettingId.WordSeparators */]: {
        markdownDescription: localize('terminal.integrated.wordSeparators', "A string containing all characters to be considered word separators when double-clicking to select word and in the fallback 'word' link detection. Since this is used for link detection, including characters such as `:` that are used when detecting links will cause the line and column part of links like `file:10:5` to be ignored."),
        type: 'string',
        // allow-any-unicode-next-line
        default: ' ()[]{}\',"`─‘’“”|'
    },
    ["terminal.integrated.enableFileLinks" /* TerminalSettingId.EnableFileLinks */]: {
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
    ["terminal.integrated.allowedLinkSchemes" /* TerminalSettingId.AllowedLinkSchemes */]: {
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
    ["terminal.integrated.unicodeVersion" /* TerminalSettingId.UnicodeVersion */]: {
        type: 'string',
        enum: ['6', '11'],
        enumDescriptions: [
            localize('terminal.integrated.unicodeVersion.six', "Version 6 of Unicode. This is an older version which should work better on older systems."),
            localize('terminal.integrated.unicodeVersion.eleven', "Version 11 of Unicode. This version provides better support on modern systems that use modern versions of Unicode.")
        ],
        default: '11',
        description: localize('terminal.integrated.unicodeVersion', "Controls what version of Unicode to use when evaluating the width of characters in the terminal. If you experience emoji or other wide characters not taking up the right amount of space or backspace either deleting too much or too little then you may want to try tweaking this setting.")
    },
    ["terminal.integrated.enablePersistentSessions" /* TerminalSettingId.EnablePersistentSessions */]: {
        description: localize('terminal.integrated.enablePersistentSessions', "Persist terminal sessions/history for the workspace across window reloads."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.persistentSessionReviveProcess" /* TerminalSettingId.PersistentSessionReviveProcess */]: {
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
    ["terminal.integrated.hideOnStartup" /* TerminalSettingId.HideOnStartup */]: {
        description: localize('terminal.integrated.hideOnStartup', "Whether to hide the terminal view on startup, avoiding creating a terminal when there are no persistent sessions."),
        type: 'string',
        enum: ['never', 'whenEmpty', 'always'],
        markdownEnumDescriptions: [
            localize('hideOnStartup.never', "Never hide the terminal view on startup."),
            localize('hideOnStartup.whenEmpty', "Only hide the terminal when there are no persistent sessions restored."),
            localize('hideOnStartup.always', "Always hide the terminal, even when there are persistent sessions restored.")
        ],
        default: 'never',
    },
    ["terminal.integrated.hideOnLastClosed" /* TerminalSettingId.HideOnLastClosed */]: {
        description: localize('terminal.integrated.hideOnLastClosed', "Whether to hide the terminal view when the last terminal is closed. This will only happen when the terminal is the only visible view in the view container."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.customGlyphs" /* TerminalSettingId.CustomGlyphs */]: {
        markdownDescription: localize('terminal.integrated.customGlyphs', "Whether to draw custom glyphs instead of using the font for the following unicode ranges:\n\n{0}\n\nThis will typically result in better rendering with continuous lines, even when line height and letter spacing is used. This feature only works when {1} is enabled.", [
            '- Box Drawing (U+2500-U+257F)',
            '- Block Elements (U+2580-U+259F)',
            '- Braille Patterns (U+2800-U+28FF)',
            '- Powerline Symbols (U+E0A0-U+E0D4, Private Use Area)',
            '- Progress Indicators (U+EE00-U+EE0B, Private Use Area)',
            '- Git Branch Symbols (U+F5D0-U+F60D, Private Use Area)',
            '- Symbols for Legacy Computing (U+1FB00-U+1FBFF)'
        ].join('\n'), `\`#${"terminal.integrated.gpuAcceleration" /* TerminalSettingId.GpuAcceleration */}#\``),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.rescaleOverlappingGlyphs" /* TerminalSettingId.RescaleOverlappingGlyphs */]: {
        markdownDescription: localize('terminal.integrated.rescaleOverlappingGlyphs', "Whether to rescale glyphs horizontally that are a single cell wide but have glyphs that would overlap following cell(s). This typically happens for ambiguous width characters (eg. the roman numeral characters U+2160+) which aren't featured in monospace fonts. Emoji glyphs are never rescaled."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.enableKittyKeyboardProtocol" /* TerminalSettingId.EnableKittyKeyboardProtocol */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.enableKittyKeyboardProtocol', "Whether to enable the kitty keyboard protocol, which allows a program in the terminal to request more detailed keyboard input reporting. This can, for example, enable `Shift+Enter` to be handled by the program."),
        type: 'boolean',
        default: true,
        tags: ['advanced']
    },
    ["terminal.integrated.enableWin32InputMode" /* TerminalSettingId.EnableWin32InputMode */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.enableWin32InputMode', "Whether to enable the win32 input mode, which provides enhanced keyboard input support on Windows."),
        type: 'boolean',
        default: false,
        tags: ['experimental', 'advanced'],
        experiment: {
            mode: 'auto'
        }
    },
    ["terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.shellIntegration.enabled', "Determines whether or not shell integration is auto-injected to support features like enhanced command tracking and current working directory detection. \n\nShell integration works by injecting the shell with a startup script. The script gives VS Code insight into what is happening within the terminal.\n\nSupported shells:\n\n- Linux/macOS: bash, fish, pwsh, zsh\n - Windows: pwsh, git bash\n\nThis setting applies only when terminals are created, so you will need to restart your terminals for it to take effect.\n\n Note that the script injection may not work if you have custom arguments defined in the terminal profile, have enabled {1}, have a [complex bash `PROMPT_COMMAND`](https://code.visualstudio.com/docs/editor/integrated-terminal#_complex-bash-promptcommand), or other unsupported setup. To disable decorations, see {0}", '`#terminal.integrated.shellIntegration.decorationsEnabled#`', '`#editor.accessibilitySupport#`'),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */]: {
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
    ["terminal.integrated.shellIntegration.timeout" /* TerminalSettingId.ShellIntegrationTimeout */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.shellIntegration.timeout', "Configures the duration in milliseconds to wait for shell integration after launch before declaring it's not there. The default value {0} uses a variable wait time based on whether shell integration injection is enabled and whether it's a remote window. Values between 1 and 499 are clamped to 500ms. Consider setting this to a large value if your shell starts very slowly.", '`-1`'),
        type: 'integer',
        minimum: -1,
        maximum: 60000,
        default: -1
    },
    ["terminal.integrated.shellIntegration.quickFixEnabled" /* TerminalSettingId.ShellIntegrationQuickFixEnabled */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.shellIntegration.quickFixEnabled', "When shell integration is enabled, enables quick fixes for terminal commands that appear as a lightbulb or sparkle icon to the left of the prompt."),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.shellIntegration.environmentReporting" /* TerminalSettingId.ShellIntegrationEnvironmentReporting */]: {
        markdownDescription: localize('terminal.integrated.shellIntegration.environmentReporting', "Controls whether to report the shell environment, enabling its use in features such as {0}. This may cause a slowdown when printing your shell's prompt.", `\`#${"terminal.integrated.suggest.enabled" /* TerminalContribSettingId.SuggestEnabled */}#\``),
        type: 'boolean',
        default: product.quality !== 'stable'
    },
    ["terminal.integrated.smoothScrolling" /* TerminalSettingId.SmoothScrolling */]: {
        markdownDescription: localize('terminal.integrated.smoothScrolling', "Controls whether the terminal will scroll using an animation."),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.ignoreBracketedPasteMode" /* TerminalSettingId.IgnoreBracketedPasteMode */]: {
        markdownDescription: localize('terminal.integrated.ignoreBracketedPasteMode', "Controls whether the terminal will ignore bracketed paste mode even if the terminal was put into the mode, omitting the {0} and {1} sequences when pasting. This is useful when the shell is not respecting the mode which can happen in sub-shells for example.", '`\\x1b[200~`', '`\\x1b[201~`'),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.enableImages" /* TerminalSettingId.EnableImages */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.enableImages', "Enables image support in the terminal, this will only work when {0} is enabled. Sixel and iTerm's inline image protocol are supported on Linux and macOS. The kitty graphics protocol is supported on all platforms. On Windows, all image protocols will only work for versions of ConPTY >= v2 which is shipped with Windows itself, see also {1}. Images will currently not be restored between window reloads/reconnects. When enabled, transparency mode is also turned on in the terminal.", `\`#${"terminal.integrated.gpuAcceleration" /* TerminalSettingId.GpuAcceleration */}#\``, `\`#${"terminal.integrated.windowsUseConptyDll" /* TerminalSettingId.WindowsUseConptyDll */}#\``),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.focusAfterRun" /* TerminalSettingId.FocusAfterRun */]: {
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
    ["terminal.integrated.allowInUntrustedWorkspace" /* TerminalSettingId.AllowInUntrustedWorkspace */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.allowInUntrustedWorkspace', "Controls whether terminals can be created in an untrusted workspace.\n\n**This feature bypasses a security protection that prevents terminals from launching in untrusted workspaces. The reason this is a security risk is because shells are often set up to potentially execute code automatically based on the contents of the current working directory. This should be safe to use provided your shell is set up in such a way that code execution in the folder never happens.**"),
        type: 'boolean',
        default: false
    },
    ["terminal.integrated.developer.ptyHost.latency" /* TerminalSettingId.DeveloperPtyHostLatency */]: {
        description: localize('terminal.integrated.developer.ptyHost.latency', "Simulated latency in milliseconds applied to all calls made to the pty host. This is useful for testing terminal behavior under high latency conditions."),
        type: 'number',
        minimum: 0,
        default: 0,
        tags: ['advanced']
    },
    ["terminal.integrated.developer.ptyHost.startupDelay" /* TerminalSettingId.DeveloperPtyHostStartupDelay */]: {
        description: localize('terminal.integrated.developer.ptyHost.startupDelay', "Simulated startup delay in milliseconds for the pty host process. This is useful for testing terminal initialization under slow startup conditions."),
        type: 'number',
        minimum: 0,
        default: 0,
        tags: ['advanced']
    },
    ["terminal.integrated.developer.devMode" /* TerminalSettingId.DevMode */]: {
        description: localize('terminal.integrated.developer.devMode', "Enable developer mode for the terminal. This shows additional debug information and visualizations for shell integration sequences."),
        type: 'boolean',
        default: false,
        tags: ['advanced']
    },
    ...terminalContribConfiguration,
};
export async function registerTerminalConfiguration(getFontSnippets) {
    const configurationRegistry = Registry.as(Extensions.Configuration);
    configurationRegistry.registerConfiguration({
        id: 'terminal',
        order: 100,
        title: localize('terminalIntegratedConfigurationTitle', "Integrated Terminal"),
        type: 'object',
        properties: terminalConfiguration,
    });
    terminalConfiguration["terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */].defaultSnippets = await getFontSnippets();
}
Registry.as(WorkbenchExtensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: "chat.agent.sandbox" /* TerminalContribSettingId.DeprecatedAgentSandboxEnabled */,
        migrateFn: (value, valueAccessor) => {
            const configurationKeyValuePairs = [];
            if (value !== undefined && valueAccessor("chat.agent.sandbox.enabled" /* TerminalContribSettingId.AgentSandboxEnabled */) === undefined) {
                configurationKeyValuePairs.push(["chat.agent.sandbox.enabled" /* TerminalContribSettingId.AgentSandboxEnabled */, { value: value ? 'on' : 'off' }]);
            }
            configurationKeyValuePairs.push(["chat.agent.sandbox" /* TerminalContribSettingId.DeprecatedAgentSandboxEnabled */, { value: undefined }]);
            return configurationKeyValuePairs;
        }
    }, {
        key: "chat.agent.sandboxNetwork.allowedDomains" /* TerminalContribSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */,
        migrateFn: (value, valueAccessor) => {
            const configurationKeyValuePairs = [];
            if (value !== undefined && valueAccessor("chat.agent.sandbox.allowedNetworkDomains" /* TerminalContribSettingId.AgentSandboxNetworkAllowedDomains */) === undefined) {
                configurationKeyValuePairs.push(["chat.agent.sandbox.allowedNetworkDomains" /* TerminalContribSettingId.AgentSandboxNetworkAllowedDomains */, { value }]);
            }
            configurationKeyValuePairs.push(["chat.agent.sandboxNetwork.allowedDomains" /* TerminalContribSettingId.DeprecatedAgentSandboxNetworkAllowedDomains */, { value: undefined }]);
            return configurationKeyValuePairs;
        }
    }, {
        key: "chat.agent.sandboxNetwork.deniedDomains" /* TerminalContribSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */,
        migrateFn: (value, valueAccessor) => {
            const configurationKeyValuePairs = [];
            if (value !== undefined && valueAccessor("chat.agent.sandbox.deniedNetworkDomains" /* TerminalContribSettingId.AgentSandboxNetworkDeniedDomains */) === undefined) {
                configurationKeyValuePairs.push(["chat.agent.sandbox.deniedNetworkDomains" /* TerminalContribSettingId.AgentSandboxNetworkDeniedDomains */, { value }]);
            }
            configurationKeyValuePairs.push(["chat.agent.sandboxNetwork.deniedDomains" /* TerminalContribSettingId.DeprecatedAgentSandboxNetworkDeniedDomains */, { value: undefined }]);
            return configurationKeyValuePairs;
        }
    }, {
        key: "chat.agent.sandboxFileSystem.linux" /* TerminalContribSettingId.DeprecatedAgentSandboxLinuxFileSystem */,
        migrateFn: (value, valueAccessor) => {
            const configurationKeyValuePairs = [];
            if (value !== undefined && valueAccessor("chat.agent.sandbox.fileSystem.linux" /* TerminalContribSettingId.AgentSandboxLinuxFileSystem */) === undefined) {
                configurationKeyValuePairs.push(["chat.agent.sandbox.fileSystem.linux" /* TerminalContribSettingId.AgentSandboxLinuxFileSystem */, { value }]);
            }
            configurationKeyValuePairs.push(["chat.agent.sandboxFileSystem.linux" /* TerminalContribSettingId.DeprecatedAgentSandboxLinuxFileSystem */, { value: undefined }]);
            return configurationKeyValuePairs;
        }
    }, {
        key: "chat.agent.sandboxFileSystem.mac" /* TerminalContribSettingId.DeprecatedAgentSandboxMacFileSystem */,
        migrateFn: (value, valueAccessor) => {
            const configurationKeyValuePairs = [];
            if (value !== undefined && valueAccessor("chat.agent.sandbox.fileSystem.mac" /* TerminalContribSettingId.AgentSandboxMacFileSystem */) === undefined) {
                configurationKeyValuePairs.push(["chat.agent.sandbox.fileSystem.mac" /* TerminalContribSettingId.AgentSandboxMacFileSystem */, { value }]);
            }
            configurationKeyValuePairs.push(["chat.agent.sandboxFileSystem.mac" /* TerminalContribSettingId.DeprecatedAgentSandboxMacFileSystem */, { value: undefined }]);
            return configurationKeyValuePairs;
        }
    }, {
        key: "terminal.integrated.enableBell" /* TerminalSettingId.EnableBell */,
        migrateFn: (enableBell, accessor) => {
            const configurationKeyValuePairs = [];
            let announcement = accessor('accessibility.signals.terminalBell')?.announcement ?? accessor('accessibility.alert.terminalBell');
            if (announcement !== undefined && !isString(announcement)) {
                announcement = announcement ? 'auto' : 'off';
            }
            configurationKeyValuePairs.push(['accessibility.signals.terminalBell', { value: { sound: enableBell ? 'on' : 'off', announcement } }]);
            configurationKeyValuePairs.push(["terminal.integrated.enableBell" /* TerminalSettingId.EnableBell */, { value: undefined }]);
            configurationKeyValuePairs.push(["terminal.integrated.enableVisualBell" /* TerminalSettingId.EnableVisualBell */, { value: enableBell }]);
            return configurationKeyValuePairs;
        }
    }]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDb25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBc0IsVUFBVSxFQUE2RCxNQUFNLG9FQUFvRSxDQUFDO0FBQy9LLE9BQU8sT0FBTyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU1RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNoSSxPQUFPLEVBQStELFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xKLE9BQU8sRUFBRSw0QkFBNEIsRUFBNEIsTUFBTSw4QkFBOEIsQ0FBQztBQUN0RyxPQUFPLEVBQUUsOEJBQThCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFL0ssTUFBTSxtQkFBbUIsR0FBRyxNQUFNLEdBQUc7SUFDcEMsYUFBYSxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsMkNBQTJDLENBQUM7SUFDNUUsbUJBQW1CLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxt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