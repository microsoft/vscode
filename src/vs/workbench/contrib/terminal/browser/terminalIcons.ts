/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

export const terminalViewIcon = registerIcon('terminal-view-icon', Codicon.terminal, localize('terminalViewIcon', 'View icon of the terminal view.'));

export const renameTerminalIcon = registerIcon('terminal-rename', Codicon.gear, localize('renameTerminalIcon', 'Icon for rename in the terminal quick menu.'));
export const killTerminalIcon = registerIcon('terminal-kill', Codicon.trash, localize('killTerminalIcon', 'Icon for killing a terminal instance.'));
export const newTerminalIcon = registerIcon('terminal-new', Codicon.add, localize('newTerminalIcon', 'Icon for creating a new terminal instance.'));

export const configureTerminalProfileIcon = registerIcon('terminal-configure-profile', Codicon.gear, localize('configureTerminalProfileIcon', 'Icon for creating a new terminal profile.'));

export const terminalDecorationMark = registerIcon('terminal-decoration-mark', Codicon.circleSmallFilled, localize('terminalDecorationMark', 'Icon for a terminal decoration mark.'));
export const terminalDecorationIncomplete = registerIcon('terminal-decoration-incomplete', Codicon.circle, localize('terminalDecorationIncomplete', 'Icon for a terminal decoration of a command that was incomplete.'));
export const terminalDecorationError = registerIcon('terminal-decoration-error', Codicon.errorSmall, localize('terminalDecorationError', 'Icon for a terminal decoration of a command that errored.'));
export const terminalDecorationSuccess = registerIcon('terminal-decoration-success', Codicon.circleFilled, localize('terminalDecorationSuccess', 'Icon for a terminal decoration of a command that was successful.'));

export const commandHistoryRemoveIcon = registerIcon('terminal-command-history-remove', Codicon.close, localize('terminalCommandHistoryRemove', 'Icon for removing a terminal command from command history.'));
export const commandHistoryOutputIcon = registerIcon('terminal-command-history-output', Codicon.output, localize('terminalCommandHistoryOutput', 'Icon for viewing output of a terminal command.'));
export const commandHistoryFuzzySearchIcon = registerIcon('terminal-command-history-fuzzy-search', Codicon.searchFuzzy, localize('terminalCommandHistoryFuzzySearch', 'Icon for toggling fuzzy search of command history.'));
