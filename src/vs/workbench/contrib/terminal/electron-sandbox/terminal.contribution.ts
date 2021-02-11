/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { TerminalIpcChannels } from 'vs/platform/terminal/common/terminal';
import { ILocalPtyService } from 'vs/platform/terminal/electron-sandbox/terminal';

registerSharedProcessRemoteService(ILocalPtyService, TerminalIpcChannels.LocalPty, { supportsDelayedInstantiation: true });
