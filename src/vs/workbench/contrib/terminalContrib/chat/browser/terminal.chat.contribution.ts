/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalInlineChatAccessibleViewContribution } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibleView';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';
import { TerminalChatAccessibilityHelpContribution } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatAccessibilityHelp';

// #region Terminal Contributions

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

// #endregion

// #region Contributions

registerWorkbenchContribution2(TerminalInlineChatAccessibleViewContribution.ID, TerminalInlineChatAccessibleViewContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(TerminalChatAccessibilityHelpContribution.ID, TerminalChatAccessibilityHelpContribution, WorkbenchPhase.Eventually);

// #endregion

// #region Actions

import 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatActions';

// #endregion
