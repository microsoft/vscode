/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/terminalSymbolIcons.css';
import { SYMBOL_ICON_ENUMERATOR_FOREGROUND, SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND, SYMBOL_ICON_METHOD_FOREGROUND, SYMBOL_ICON_VARIABLE_FOREGROUND, SYMBOL_ICON_FILE_FOREGROUND, SYMBOL_ICON_FOLDER_FOREGROUND } from '../../../../../editor/contrib/symbolIcons/browser/symbolIcons.js';
import { registerColor } from '../../../../../platform/theme/common/colorUtils.js';
import { localize } from '../../../../../nls.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../../base/common/codicons.js';

export const TERMINAL_SYMBOL_ICON_FLAG_FOREGROUND = registerColor('terminalSymbolIcon.flagForeground', SYMBOL_ICON_ENUMERATOR_FOREGROUND, localize('terminalSymbolIcon.flagForeground', 'The foreground color for an flag icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_ALIAS_FOREGROUND = registerColor('terminalSymbolIcon.aliasForeground', SYMBOL_ICON_METHOD_FOREGROUND, localize('terminalSymbolIcon.aliasForeground', 'The foreground color for an alias icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_OPTION_VALUE_FOREGROUND = registerColor('terminalSymbolIcon.optionValueForeground', SYMBOL_ICON_ENUMERATOR_MEMBER_FOREGROUND, localize('terminalSymbolIcon.enumMemberForeground', 'The foreground color for an enum member icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_METHOD_FOREGROUND = registerColor('terminalSymbolIcon.methodForeground', SYMBOL_ICON_METHOD_FOREGROUND, localize('terminalSymbolIcon.methodForeground', 'The foreground color for a method icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_ARGUMENT_FOREGROUND = registerColor('terminalSymbolIcon.argumentForeground', SYMBOL_ICON_VARIABLE_FOREGROUND, localize('terminalSymbolIcon.argumentForeground', 'The foreground color for an argument icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_OPTION_FOREGROUND = registerColor('terminalSymbolIcon.optionForeground', SYMBOL_ICON_ENUMERATOR_FOREGROUND, localize('terminalSymbolIcon.optionForeground', 'The foreground color for an option icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_INLINE_SUGGESTION_FOREGROUND = registerColor('terminalSymbolIcon.inlineSuggestionForeground', null, localize('terminalSymbolIcon.inlineSuggestionForeground', 'The foreground color for an inline suggestion icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_FILE_FOREGROUND = registerColor('terminalSymbolIcon.fileForeground', SYMBOL_ICON_FILE_FOREGROUND, localize('terminalSymbolIcon.fileForeground', 'The foreground color for a file icon. These icons will appear in the terminal suggest widget.'));
export const TERMINAL_SYMBOL_ICON_FOLDER_FOREGROUND = registerColor('terminalSymbolIcon.folderForeground', SYMBOL_ICON_FOLDER_FOREGROUND, localize('terminalSymbolIcon.folderForeground', 'The foreground color for a folder icon. These icons will appear in the terminal suggest widget.'));

export const terminalSymbolFlagIcon = registerIcon('terminal-symbol-flag', Codicon.flag, localize('terminalSymbolFlagIcon', 'Icon for flags in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FLAG_FOREGROUND);
export const terminalSymbolAliasIcon = registerIcon('terminal-symbol-alias', Codicon.symbolMethod, localize('terminalSymbolAliasIcon', 'Icon for aliases in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_ALIAS_FOREGROUND);
export const terminalSymbolEnumMember = registerIcon('terminal-symbol-option-value', Codicon.symbolEnumMember, localize('terminalSymbolOptionValue', 'Icon for enum members in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_OPTION_VALUE_FOREGROUND);
export const terminalSymbolMethodIcon = registerIcon('terminal-symbol-method', Codicon.symbolMethod, localize('terminalSymbolMethodIcon', 'Icon for methods in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_METHOD_FOREGROUND);
export const terminalSymbolArgumentIcon = registerIcon('terminal-symbol-argument', Codicon.symbolVariable, localize('terminalSymbolArgumentIcon', 'Icon for arguments in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_ARGUMENT_FOREGROUND);
export const terminalSymbolOptionIcon = registerIcon('terminal-symbol-option', Codicon.symbolEnum, localize('terminalSymbolOptionIcon', 'Icon for options in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_OPTION_FOREGROUND);
export const terminalSymbolInlineSuggestionIcon = registerIcon('terminal-symbol-inline-suggestion', Codicon.star, localize('terminalSymbolInlineSuggestionIcon', 'Icon for inline suggestions in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_INLINE_SUGGESTION_FOREGROUND);
export const terminalSymbolFileIcon = registerIcon('terminal-symbol-file', Codicon.symbolFile, localize('terminalSymbolFileIcon', 'Icon for files in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FILE_FOREGROUND);
export const terminalSymbolFolderIcon = registerIcon('terminal-symbol-folder', Codicon.symbolFolder, localize('terminalSymbolFolderIcon', 'Icon for folders in the terminal suggest widget.'), TERMINAL_SYMBOL_ICON_FOLDER_FOREGROUND);
