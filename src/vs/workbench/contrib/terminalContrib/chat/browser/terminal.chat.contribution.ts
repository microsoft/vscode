/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

import 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatActions';
