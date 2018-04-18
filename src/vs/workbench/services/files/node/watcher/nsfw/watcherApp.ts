/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { WatcherChannel } from 'vs/workbench/services/files/node/watcher/nsfw/watcherIpc';
import { NsfwWatcherService } from 'vs/workbench/services/files/node/watcher/nsfw/nsfwWatcherService';

const server = new Server();
const service = new NsfwWatcherService();
const channel = new WatcherChannel(service);
server.registerChannel('watcher', channel);