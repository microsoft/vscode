/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGPUStatusMainService } from '../../../../platform/gpu/common/gpuStatusMain.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';


registerMainProcessRemoteService(IGPUStatusMainService, 'gpuStatus');
