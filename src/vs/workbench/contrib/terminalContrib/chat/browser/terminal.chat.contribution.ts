/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInlineChatAccessibleView } from './terminalChatAccessibleView.js';
import { TerminalChatController } from './terminalChatController.js';

// #region Terminal Contributions

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

// #endregion

// #region Contributions

AccessibleViewRegistry.register(new TerminalInlineChatAccessibleView());
AccessibleViewRegistry.register(new TerminalChatAccessibilityHelp());

registerWorkbenchContribution2(TerminalChatEnabler.Id, TerminalChatEnabler, WorkbenchPhase.AfterRestored);

// #endregion

// #region Actions

import './terminalChatActions.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { TerminalChatAccessibilityHelp } from './terminalChatAccessibilityHelp.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { TerminalChatEnabler } from './terminalChatEnabler.js';

// #endregion
