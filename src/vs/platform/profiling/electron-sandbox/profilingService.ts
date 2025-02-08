/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-sandbox/services.js';
import { IV8InspectProfilingService } from '../common/profiling.js';

registerSharedProcessRemoteService(IV8InspectProfilingService, 'v8InspectProfiling');
