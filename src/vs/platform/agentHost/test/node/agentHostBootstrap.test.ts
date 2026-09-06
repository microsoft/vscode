/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseArgs, OPTIONS } from '../../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { createAgentHostRuntime } from '../../node/agentHostBootstrap.js';
import { NullByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { StrictServiceCollection } from '../../../instantiation/common/strictServiceCollection.js';
import { createAgentServiceFoundation } from '../../node/agentServiceFoundation.js';
import { AgentHostProxyConfigKey } from '../../common/agentHostSchema.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../../common/agentHostReviewService.js';

suite('agentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('constructs the renderer BYOK runtime', async () => {
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
			disableTelemetry: true,
			transientProxyConfiguration: true,
			hostLaunchKind: AgentHostLaunchKind.Unknown,
			providerConfigurations: [],
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});
		testDisposables.add(runtime);

		// Whole-graph dependency completeness is checked statically in
		// agentHostServices.test.ts without forcing every descriptor to construct.
		assert.ok(runtime.instantiationService.invokeFunction(accessor => accessor.get(IAgentSdkDownloader)));
		assert.deepStrictEqual(runtime.instantiationService.invokeFunction(accessor => [
			accessor.get(IAgentHostCheckpointService) !== undefined,
			accessor.get(IAgentHostReviewService) !== undefined,
		]), [true, true]);
	});

	test('loads standalone proxy configuration before resolver construction', () => {
		const testDisposables = disposables.add(new DisposableStore());
		const directory = mkdtempSync(join(tmpdir(), 'agent-host-foundation-'));
		testDisposables.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		writeFileSync(resource.fsPath, JSON.stringify({ [AgentHostProxyConfigKey.Proxy]: 'http://proxy.example:8080' }));
		const productService = { _serviceBrand: undefined, ...product };

		const foundation = createAgentServiceFoundation({
			services: new StrictServiceCollection(),
			owned: testDisposables,
			logService: new NullLogService(),
			productService,
			rootConfigResource: resource,
			transientProxyConfiguration: false,
		});

		assert.strictEqual(foundation.proxyResolver.getConfigurationValue(AgentHostProxyConfigKey.Proxy), 'http://proxy.example:8080');
	});

	test('clears local proxy configuration before resolver construction and persistence', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const directory = mkdtempSync(join(tmpdir(), 'agent-host-foundation-'));
		testDisposables.add(toDisposable(() => rmSync(directory, { recursive: true, force: true })));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		writeFileSync(resource.fsPath, JSON.stringify({ [AgentHostProxyConfigKey.Proxy]: 'http://stale-proxy.example:8080' }));
		const productService = { _serviceBrand: undefined, ...product };

		const foundation = createAgentServiceFoundation({
			services: new StrictServiceCollection(),
			owned: testDisposables,
			logService: new NullLogService(),
			productService,
			rootConfigResource: resource,
			transientProxyConfiguration: true,
		});
		foundation.configurationService.persistRootConfig();
		await foundation.configurationService.whenIdle();
		const persisted = JSON.parse(readFileSync(resource.fsPath, 'utf8')) as Record<string, unknown>;

		assert.deepStrictEqual({
			resolver: foundation.proxyResolver.getConfigurationValue(AgentHostProxyConfigKey.Proxy),
			persisted: persisted[AgentHostProxyConfigKey.Proxy],
		}, {
			resolver: undefined,
			persisted: undefined,
		});
	});
});
