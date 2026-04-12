/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { IV8InspectProfilingService } from '../common/profiling.js';

registerSharedProcessRemoteService(IV8InspectProfilingService, 'v8InspectProfiling');
