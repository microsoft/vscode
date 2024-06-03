/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Server as ChildProcessServer } from 'vs/base/parts/ipc/node/ipc.cp';
import { Server as UtilityProcessServer } from 'vs/base/parts/ipc/node/ipc.mp';
import { isUtilityProcess } from 'vs/base/parts/sandbox/node/electronTypes';
import { UniversalWatcher } from 'vs/platform/files/node/watcher/watcher';

let server: ChildProcessServer<string> | UtilityProcessServer;
if (isUtilityProcess(process)) {
	server = new UtilityProcessServer();
} else {
	server = new ChildProcessServer('watcher');
}

const service = new UniversalWatcher();
server.registerChannel('watcher', ProxyChannel.fromService(service, new DisposableStore()));
