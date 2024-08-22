/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions';
import { TerminalInlineChatAccessibleView } from './terminalChatAccessibleView';
import { TerminalChatController } from './terminalChatController';

// #region Terminal Contributions

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

// #endregion

// #region Contributions

AccessibleViewRegistry.register(new TerminalInlineChatAccessibleView());
AccessibleViewRegistry.register(new TerminalChatAccessibilityHelp());

registerWorkbenchContribution2(TerminalChatEnabler.Id, TerminalChatEnabler, WorkbenchPhase.AfterRestored);

// #endregion

// #region Actions

import './terminalChatActions';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry';
import { TerminalChatAccessibilityHelp } from './terminalChatAccessibilityHelp';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions';
import { TerminalChatEnabler } from './terminalChatEnabler';

// #endregion
