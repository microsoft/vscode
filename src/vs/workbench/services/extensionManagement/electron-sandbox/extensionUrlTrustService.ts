/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

registerMainProcessRemoteService(IExtensionUrlTrustService, 'extensionUrlTrust');
