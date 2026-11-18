/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerUserActivitySource } from '../../../services/userActivity/common/userActivityCapture.js';
import { ChatUserActivitySource } from './chatUserActivitySource.js';
import { TerminalUserActivitySource } from './terminalUserActivitySource.js';

// Proposed API `userActivity`: the sources of activity in chat and terminals. They are created
// only while capture runs.
registerUserActivitySource(ChatUserActivitySource);
registerUserActivitySource(TerminalUserActivitySource);
