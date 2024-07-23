/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGPUStatusMainService } from 'vs/platform/gpu/common/gpuStatusMain';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

registerMainProcessRemoteService(IGPUStatusMainService, 'gpuStatus');
