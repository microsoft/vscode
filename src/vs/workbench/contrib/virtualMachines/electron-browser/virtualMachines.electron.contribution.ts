/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { IVirtualMachinesService, VirtualMachinesServiceChannelName } from '../../../../platform/virtualMachines/common/virtualMachines.js';

// Proxies IVirtualMachinesService to the Electron main process, which itself
// supervises the dedicated virtual machines daemon utility process.
registerMainProcessRemoteService(IVirtualMachinesService, VirtualMachinesServiceChannelName);
