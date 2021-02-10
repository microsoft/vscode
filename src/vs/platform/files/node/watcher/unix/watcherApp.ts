/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { ChokidarWatcherService } from 'vs/platform/files/node/watcher/unix/chokidarWatcherService';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';

const server = new Server('watcher');
const service = new ChokidarWatcherService();
server.registerChannel('watcher', ProxyChannel.fromService(service));
