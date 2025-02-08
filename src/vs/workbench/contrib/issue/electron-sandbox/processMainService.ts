/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { IProcessMainService } from '../../../../platform/process/common/process.js';

registerMainProcessRemoteService(IProcessMainService, 'process');

