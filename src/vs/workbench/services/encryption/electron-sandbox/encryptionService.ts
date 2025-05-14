/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';
import { IEncryptionService } from '../../../../platform/encryption/common/encryptionService.js';

registerMainProcessRemoteService(IEncryptionService, 'encryption');
