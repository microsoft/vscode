/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { IV8InspectProfilingService } from 'vs/platform/profiling/common/profiling';

registerSharedProcessRemoteService(IV8InspectProfilingService, 'v8InspectProfiling');
