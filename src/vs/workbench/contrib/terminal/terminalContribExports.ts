/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalAccessibilityCommandId } from '../terminalContrib/accessibility/common/terminal.accessibility.js';
import { TerminalDeveloperCommandId } from '../terminalContrib/developer/common/terminal.developer.js';
import { TerminalStickyScrollSettingId } from '../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';
import { TerminalSuggestSettingId } from '../terminalContrib/suggest/common/terminalSuggestConfiguration.js';

export { TerminalChatController } from '../terminalContrib/chat/browser/terminalChatController.js';
export { TerminalChatContextKeys } from '../terminalContrib/chat/browser/terminalChat.js';

// HACK: Export some commands from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export const enum TerminalContribCommandId {
	A11yFocusAccessibleBuffer = TerminalAccessibilityCommandId.FocusAccessibleBuffer,
	DeveloperRestartPtyHost = TerminalDeveloperCommandId.RestartPtyHost,
}

// HACK: Export some settings from `terminalContrib/` that are depended upon elsewhere. These are
// soft layer breakers between `terminal/` and `terminalContrib/` but there are difficulties in
// removing the dependency. These are explicitly defined here to avoid an eslint line override.
export const enum TerminalContribSettingId {
	SuggestEnabled = TerminalSuggestSettingId.Enabled,
	StickyScrollEnabled = TerminalStickyScrollSettingId.Enabled,
}
