/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { WatcherChannel } from 'vs/platform/files/node/watcher/unix/watcherIpc';
import { ChokidarWatcherService } from 'vs/platform/files/node/watcher/unix/chokidarWatcherService';

const server = new Server('watcher');
const service = new ChokidarWatcherService();
const channel = new WatcherChannel(service);
server.registerChannel('watcher', channel);