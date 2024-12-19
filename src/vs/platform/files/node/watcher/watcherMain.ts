/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os'; // Add this import for platform detection
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../../base/parts/sandbox/node/electronTypes.js';
import { UniversalWatcher } from './watcher.js';

// Determine the process type and initialize the appropriate IPC server
let server: ChildProcessServer<string> | UtilityProcessServer;
if (isUtilityProcess(process)) {
	server = new UtilityProcessServer();
} else {
	server = new ChildProcessServer('watcher');
}

// macOS-specific optimization detection
const isMac = os.platform() === 'darwin';

if (isMac) {
	console.log('Initializing watcher with macOS-specific optimizations.');
}

// Create the UniversalWatcher service
const service = new UniversalWatcher({
	platformSpecific: isMac ? {
		usePolling: false,
		throttleInterval: 200
	} : undefined
});

// Register the watcher service with the IPC server
server.registerChannel('watcher', ProxyChannel.fromService(service, new DisposableStore()));
