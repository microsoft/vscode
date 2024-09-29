/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalAccessibilityCommandId } from '../terminalContrib/accessibility/common/terminal.accessibility.js';
import { TerminalDeveloperCommandId } from '../terminalContrib/developer/common/terminal.developer.js';
import { TerminalStickyScrollSettingId } from '../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';
import { TerminalSuggestSettingId } from '../terminalContrib/suggest/common/terminalSuggestConfiguration.js';

// HACK: Export chat parts as it's only partially encapsulated within the contrib
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

// Import configuration schemes from terminalContrib - this is an exception to the eslint rule since
// they need to be declared at part of the rest of the terminal configuration
export { terminalAccessibilityConfiguration } from '../terminalContrib/accessibility/common/terminalAccessibilityConfiguration.js';
export { terminalCommandGuideConfiguration } from '../terminalContrib/commandGuide/common/terminalCommandGuideConfiguration.js';
export { terminalInitialHintConfiguration } from '../terminalContrib/chat/common/terminalInitialHintConfiguration.js';
export { terminalStickyScrollConfiguration } from '../terminalContrib/stickyScroll/common/terminalStickyScrollConfiguration.js';
export { terminalSuggestConfiguration } from '../terminalContrib/suggest/common/terminalSuggestConfiguration.js';
export { terminalTypeAheadConfiguration } from '../terminalContrib/typeAhead/common/terminalTypeAheadConfiguration.js';
export { terminalZoomConfiguration } from '../terminalContrib/zoom/common/terminal.zoom.js';
export { terminalAutoRepliesConfiguration } from '../terminalContrib/autoReplies/common/terminalAutoRepliesConfiguration.js';

// Import commands to skip shell from terminalContrib - this is an exception to the eslint rule
// since they need to be included in the terminal module
export { defaultTerminalAccessibilityCommandsToSkipShell } from '../terminalContrib/accessibility/common/terminal.accessibility.js';
export { defaultTerminalFindCommandToSkipShell } from '../terminalContrib/find/common/terminal.find.js';
export { defaultTerminalSuggestCommandsToSkipShell } from '../terminalContrib/suggest/common/terminal.suggest.js';
