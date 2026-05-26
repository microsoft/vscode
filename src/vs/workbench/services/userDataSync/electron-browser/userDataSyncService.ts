/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserDataSyncResourceProviderService, IUserDataSyncService, IUserDataSyncStoreManagementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { UserDataSyncServiceChannelClient } from '../../../../platform/userDataSync/common/userDataSyncServiceIpc.js';
import { IUserDataSyncMachinesService } from '../../../../platform/userDataSync/common/userDataSyncMachines.js';
import { UserDataSyncAccountServiceChannelClient, UserDataSyncStoreManagementServiceChannelClient } from '../../../../platform/userDataSync/common/userDataSyncIpc.js';
import { IUserDataSyncAccountService } from '../../../../platform/userDataSync/common/userDataSyncAccount.js';

registerSharedProcessRemoteService(IUserDataSyncService, 'userDataSync', { channelClientCtor: UserDataSyncServiceChannelClient });
registerSharedProcessRemoteService(IUserDataSyncResourceProviderService, 'IUserDataSyncResourceProviderService');
registerSharedProcessRemoteService(IUserDataSyncMachinesService, 'userDataSyncMachines');
registerSharedProcessRemoteService(IUserDataSyncAccountService, 'userDataSyncAccount', { channelClientCtor: UserDataSyncAccountServiceChannelClient });
registerSharedProcessRemoteService(IUserDataSyncStoreManagementService, 'userDataSyncStoreManagement', { channelClientCtor: UserDataSyncStoreManagementServiceChannelClient });
