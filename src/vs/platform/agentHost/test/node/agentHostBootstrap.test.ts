/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseArgs, OPTIONS } from '../../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { IRequestService } from '../../../request/common/request.js';
import { createAgentHostRuntime, registerAgentHostNetworkServices } from '../../node/agentHostBootstrap.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { NullByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';

suite('agentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registers network services without reading VS Code settings', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const services = new ServiceCollection();
		const networkServices = registerAgentHostNetworkServices(services, new NullLogService(), testDisposables);

		assert.deepStrictEqual({
			proxyResolver: services.get(IAgentHostProxyResolver) === networkServices.proxyResolver,
			requestService: services.get(IRequestService) === networkServices.requestService,
		}, {
			proxyResolver: true,
			requestService: true,
		});
	});

	test('constructs the renderer BYOK runtime with strict dependency injection', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const userDataPath = mkdtempSync(join(tmpdir(), 'agent-host-bootstrap-'));
		mkdirSync(join(userDataPath, 'User', 'globalStorage'), { recursive: true });
		testDisposables.add(toDisposable(() => rmSync(userDataPath, { recursive: true, force: true })));
		const productService = { _serviceBrand: undefined, ...product };
		const environmentService = new NativeEnvironmentService(parseArgs(['--user-data-dir', userDataPath, '--force-disable-user-env'], OPTIONS), productService);

		const runtime = await createAgentHostRuntime({
			environmentService,
			productService,
			logService: new NullLogService(),
			loggerService: undefined,
			disposables: testDisposables,
			disableTelemetry: true,
			transientProxyConfiguration: true,
			hostLaunchKind: AgentHostLaunchKind.Unknown,
			providerConfigurations: [],
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});
		testDisposables.add(runtime.agentService);
		testDisposables.add(runtime.instantiationService);

		assert.ok(runtime.agentSdkDownloader);
	});
});
