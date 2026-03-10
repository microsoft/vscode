/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { AgentHostIpcChannels } from '../common/agentService.js';
import { AgentService } from './agentService.js';
// import { CopilotAgent } from './copilot/copilotAgent.js'; // Temporarily disabled
import { LocalAgent } from '../../agent2/node/localAgent.js';
import { CopilotApiService, ICopilotApiService } from '../../agent2/node/copilotToken.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { parseArgs, OPTIONS } from '../../environment/node/argv.js';
import { getLogLevel, ILogService } from '../../log/common/log.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import product from '../../product/common/product.js';
import { IProductService } from '../../product/common/productService.js';
import { InstantiationService } from '../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { localize } from '../../../nls.js';

// Entry point for the agent host utility process.
// Sets up IPC, logging, and registers agent providers (Copilot).

startAgentHost();

function startAgentHost(): void {
	// Setup RPC - supports both Electron utility process and Node child process
	let server: ChildProcessServer<string> | UtilityProcessServer;
	if (isUtilityProcess(process)) {
		server = new UtilityProcessServer();
	} else {
		server = new ChildProcessServer(AgentHostIpcChannels.AgentHost);
	}

	const disposables = new DisposableStore();

	// Services
	const services = new ServiceCollection();

	const productService: IProductService = { _serviceBrand: undefined, ...product };
	services.set(IProductService, productService);

	const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
	services.set(INativeEnvironmentService, environmentService);

	const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
	server.registerChannel(AgentHostIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
	const logger = loggerService.createLogger('agenthost', { name: localize('agentHost', "Agent Host") });
	const logService = new LogService(logger);
	services.set(ILogService, logService);

	services.set(ICopilotApiService, new SyncDescriptor(CopilotApiService));

	const instantiationService = new InstantiationService(services);

	logService.info('Agent Host process started successfully');

	// Create the real service implementation that lives in this process
	let agentService: AgentService;
	try {
		agentService = new AgentService(logService);
		// agentService.registerProvider(new CopilotAgent(logService)); // Temporarily disabled -- conflicts with locally installed Copilot CLI
		agentService.registerProvider(instantiationService.createInstance(LocalAgent));
	} catch (err) {
		logService.error('Failed to create AgentService', err);
		throw err;
	}
	const agentChannel = ProxyChannel.fromService(agentService, disposables);
	server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);

	process.once('exit', () => {
		agentService.dispose();
		logService.dispose();
		disposables.dispose();
	});
}
