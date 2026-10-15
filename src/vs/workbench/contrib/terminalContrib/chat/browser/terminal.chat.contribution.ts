/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #region Terminal Contributions


// #endregion

// #region Contributions



// #endregion

// #region Actions

import './terminalChatActions.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITerminalChatService } from '../../../terminal/browser/terminal.js';
import { TerminalChatService } from './terminalChatService.js';
import { ITerminalChatSessionResolver, TerminalChatSessionResolver } from './terminalChatSessionResolver.js';

// #region Services

// AI removed: the terminal inline chat controller, its accessibility views and
// enabler are no longer registered. The services remain because the terminal
// tabs view and agent-host terminal service inject them.

registerSingleton(ITerminalChatService, TerminalChatService, InstantiationType.Delayed);
registerSingleton(ITerminalChatSessionResolver, TerminalChatSessionResolver, InstantiationType.Delayed);

// #endregion

// #endregion
