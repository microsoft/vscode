/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { NsfwWatcherService } from 'vs/platform/files/node/watcher/nsfw/nsfwWatcherService';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';

const server = new Server('watcher');
const service = new NsfwWatcherService();
server.registerChannel('watcher', ProxyChannel.fromService(service));
