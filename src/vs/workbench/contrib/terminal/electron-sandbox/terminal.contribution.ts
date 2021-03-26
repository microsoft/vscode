/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILocalTerminalService, TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';
import { LocalTerminalService } from 'vs/workbench/contrib/terminal/electron-sandbox/localTerminalService';

registerSharedProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty, { supportsDelayedInstantiation: true });

registerSingleton(ILocalTerminalService, LocalTerminalService, true);
