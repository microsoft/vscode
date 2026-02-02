/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncResourceProviderService, IUserDataSyncService } from 'vs/platform/userDataSync/common/userDataSync';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { UserDataSyncChannelClient } from 'vs/platform/userDataSync/common/userDataSyncServiceIpc';

registerSharedProcessRemoteService(IUserDataSyncService, 'userDataSync', { channelClientCtor: UserDataSyncChannelClient });
registerSharedProcessRemoteService(IUserDataSyncResourceProviderService, 'IUserDataSyncResourceProviderService');
