/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUpdateService } from 'vs/platform/update/common/update';
import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { UpdateChannelClient } from 'vs/platform/update/common/updateIpc';

registerMainProcessRemoteService(IUpdateService, 'update', { channelClientCtor: UpdateChannelClient });
