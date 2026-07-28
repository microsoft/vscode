/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUpdateService } from '../../../../platform/update/common/update.js';
import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { UpdateChannelClient } from '../../../../platform/update/common/updateIpc.js';

registerMainProcessRemoteService(IUpdateService, 'update', { channelClientCtor: UpdateChannelClient });
