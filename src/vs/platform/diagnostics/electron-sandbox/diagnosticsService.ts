/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiagnosticsService } from '../common/diagnostics';
import { registerSharedProcessRemoteService } from '../../ipc/electron-sandbox/services';

registerSharedProcessRemoteService(IDiagnosticsService, 'diagnostics');
