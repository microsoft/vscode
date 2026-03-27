/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { ISandboxHelperService } from '../common/sandboxHelperService.js';
import { SANDBOX_HELPER_CHANNEL_NAME } from '../common/sandboxHelperIpc.js';

registerMainProcessRemoteService(ISandboxHelperService, SANDBOX_HELPER_CHANNEL_NAME);
