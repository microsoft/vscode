/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { ParcelWatcherService } from 'vs/platform/files/node/watcher/parcel/parcelWatcherService';

const server = new Server('watcher');
const service = new ParcelWatcherService();
server.registerChannel('watcher', ProxyChannel.fromService(service));
