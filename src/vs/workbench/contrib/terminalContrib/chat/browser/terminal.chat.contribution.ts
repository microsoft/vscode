/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalInlineChatAccessibleView } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibleView';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

// #region Terminal Contributions

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

// #endregion

// #region Contributions

AccessibleViewRegistry.register(new TerminalInlineChatAccessibleView());
AccessibleViewRegistry.register(new TerminalChatAccessibilityHelp());

// #endregion

// #region Actions

import 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatActions';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { TerminalChatAccessibilityHelp } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibilityHelp';

// #endregion
