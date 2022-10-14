/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { UniversalWatcher } from 'vs/platform/files/node/watcher/watcher';

const server = new Server('watcher');
const service = new UniversalWatcher();
server.registerChannel('watcher', ProxyChannel.fromService(service));
