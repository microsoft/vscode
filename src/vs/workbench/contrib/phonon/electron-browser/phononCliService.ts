/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { IPhononCliService } from '../../../../platform/phonon/common/phononCliService.js';

registerMainProcessRemoteService(IPhononCliService, 'phononCli');
