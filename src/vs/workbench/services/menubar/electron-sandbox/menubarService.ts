/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenubarService } from '../../../../platform/menubar/electron-sandbox/menubar.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services.js';

registerMainProcessRemoteService(IMenubarService, 'menubar');
