/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiagnosticsMainService } from 'vs/platform/diagnostics/common/diagnosticsMain';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

registerMainProcessRemoteService(IDiagnosticsMainService, 'diagnostics-main');
