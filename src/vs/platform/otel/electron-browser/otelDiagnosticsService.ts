/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSharedProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { IOTelDiagnosticsService, OTEL_DIAGNOSTICS_CHANNEL_NAME } from '../common/otelDiagnosticsService.js';

registerSharedProcessRemoteService(IOTelDiagnosticsService, OTEL_DIAGNOSTICS_CHANNEL_NAME);
