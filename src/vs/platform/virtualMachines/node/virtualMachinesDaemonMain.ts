/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { OPTIONS, parseArgs } from '../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { getLogLevel } from '../../log/common/log.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { IVirtualMachinesSettings, VirtualMachinesServiceChannelName } from '../common/virtualMachines.js';
import { VirtualMachineManager } from './virtualMachineManager.js';

const VirtualMachinesLoggerChannelName = 'virtualMachinesLogger';

startVirtualMachinesDaemon();

async function startVirtualMachinesDaemon() {
	// Setup RPC
	let server: ChildProcessServer<string> | UtilityProcessServer;
	if (isUtilityProcess(process)) {
		server = new UtilityProcessServer();
	} else {
		server = new ChildProcessServer(VirtualMachinesServiceChannelName);
	}

	const disposables = new DisposableStore();

	// Services
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	server.registerChannel(VirtualMachinesLoggerChannelName, new LoggerChannel(loggerService, () => DefaultURITransformer));
	const logger = loggerService.createLogger('virtualmachines', { name: 'Virtual Machines Daemon' });
	const logService = new LogService(logger);

	// The initial settings snapshot and data root are provided by the main
	// process through the environment; updates flow through the channel.
	const settings: IVirtualMachinesSettings = parseJsonEnv('GITCORTEX_VM_SETTINGS', {
		acceleration: 'auto',
		networkMode: 'user',
		agentControl: false,
		resources: {},
	});
	const defaultDataRoot = process.env.GITCORTEX_VM_DATA_ROOT || environmentService.userDataPath;

	const manager = new VirtualMachineManager(settings, defaultDataRoot, undefined, message => logService.trace(message));
	server.registerChannel(VirtualMachinesServiceChannelName, ProxyChannel.fromService(manager, disposables));

	// Clean up: disposing the manager stops every running virtual machine.
	process.once('exit', () => {
		logService.trace('Virtual machines daemon exiting');
		manager.dispose();
		logService.dispose();
	});
}

function parseJsonEnv<T>(name: string, fallback: T): T {
	const raw = process.env[name];
	if (!raw) {
		return fallback;
	}
	try {
		return { ...fallback, ...JSON.parse(raw) };
	} catch {
		return fallback;
	}
}
