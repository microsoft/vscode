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
import { mock } from '../../../../base/test/common/mock.js';
import { parseArgs, OPTIONS } from '../../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { LogLevel, NullLogService } from '../../../log/common/log.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { GitHubService } from '../../../github/common/githubService.js';
import product from '../../../product/common/product.js';
import { createAgentHostRuntime } from '../../node/agentHostBootstrap.js';
import { NullByokLmBridgeRegistry } from '../../node/byokLmBridgeRegistry.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { IAgentSdkDownloader } from '../../node/agentSdkDownloader.js';
import { StrictServiceCollection } from '../../../instantiation/common/strictServiceCollection.js';
import { createAgentServiceFoundation } from '../../node/agentServiceFoundation.js';
import { AgentHostProxyConfigKey, AgentHostTelemetryLevelConfigKey } from '../../common/agentHostSchema.js';
import { IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { IAgentHostReviewService } from '../../common/agentHostReviewService.js';
import { IAgentHostStartupPerformance } from '../../node/agentHostStartupPerformance.js';
import { IAgentHostDatabase } from '../../node/agentHostDatabase.js';

suite('agentHostBootstrap', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('constructs the renderer BYOK runtime', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const userDataPath = mkdtempSync(join(tmpdir(), 'agent-host-bootstrap-'));
		mkdirSync(join(userDataPath, 'User', 'globalStorage'), { recursive: true });
		disposables.add(toDisposable(() => rmSync(userDataPath, { recursive: true, force: true })));
		const productService = { _serviceBrand: undefined, ...product };
		const environmentService = new NativeEnvironmentService(parseArgs(['--user-data-dir', userDataPath, '--force-disable-user-env'], OPTIONS), productService);
		const timings: ITelemetryData[] = [];
		const logService = new class extends NullLogService {
			override getLevel(): LogLevel { return LogLevel.Trace; }
			override trace(message: string, data?: ITelemetryData): void {
				if (message === '[AgentHostStartupPerformance]' && data) {
					timings.push(data);
				}
			}
		};

		const runtime = await createAgentHostRuntime({
			environmentService,
			productService,
			logService,
			loggerService: undefined,
			disableTelemetry: true,
			transientProxyConfiguration: true,
			hostLaunchKind: AgentHostLaunchKind.Unknown,
			providerConfigurations: [],
			byok: { kind: 'renderer', bridgeRegistry: new NullByokLmBridgeRegistry() },
		});
		testDisposables.add(runtime);
		const database = runtime.instantiationService.invokeFunction(accessor => accessor.get(IAgentHostDatabase));
		try {
			runtime.agentService.markStartupComplete('error');
			await runtime.agentService.listSessions();
			await runtime.agentService.whenDeferredWorkSettled();

			// Whole-graph dependency completeness is checked statically in
			// agentHostServices.test.ts without forcing every descriptor to construct.
			const startupPerformance = runtime.instantiationService.invokeFunction(accessor => accessor.get(IAgentHostStartupPerformance));
			assert.deepStrictEqual({
				services: runtime.instantiationService.invokeFunction(accessor => [
					accessor.get(IAgentSdkDownloader) !== undefined,
					accessor.get(IAgentHostCheckpointService) !== undefined,
					accessor.get(IAgentHostReviewService) !== undefined,
				]),
				markers: timings.map(timing => [timing.name, timing.since, timing.outcome]),
				correlated: timings.every(timing => timing.agentHostSessionId === startupPerformance.agentHostSessionId),
				validTimings: timings.every(timing => typeof timing.timestampMs === 'number' && timing.timestampMs >= 0
					&& (timing.since === undefined ? timing.durationMs === undefined : typeof timing.durationMs === 'number' && timing.durationMs >= 0)),
			}, {
				services: [true, true, true],
				markers: [
					['processStart', undefined, undefined],
					['bootstrapStart', undefined, undefined],
					['configuration', 'bootstrapStart', undefined],
					['telemetry', 'configuration', undefined],
					['services', 'telemetry', undefined],
					['bootstrap', 'processStart', undefined],
					['hostReady', 'processStart', 'error'],
					['sessionListStart', undefined, undefined],
					['sessionList', 'sessionListStart', 'success'],
					['firstSessionList', 'processStart', undefined],
					['startupSettled', 'processStart', undefined],
				],
				correlated: true,
				validTimings: true,
			});
		} finally {
			runtime.dispose();
			await database.close();
		}
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

	test('supplies product and component identification for Node GitHub egress', () => {
		const foundation = createAgentServiceFoundation({
			services: new StrictServiceCollection(),
			owned: disposables.add(new DisposableStore()),
			logService: new NullLogService(),
			productService: { _serviceBrand: undefined, ...product, applicationName: 'code-insiders', version: '1.141.0' },
			transientProxyConfiguration: false,
		});
		assert.deepStrictEqual(foundation.gitHubServiceOptions.clientMetadata, {
			application: 'vscode-insiders/1.141.0',
			source: 'vscode-insiders-agent-host/1.141.0',
			egress: 'node',
		});
	});

	test('drops pending GitHub telemetry when root configuration disables collection', async () => {
		const foundation = createAgentServiceFoundation({
			services: new StrictServiceCollection(),
			owned: disposables.add(new DisposableStore()),
			logService: new NullLogService(),
			productService: { _serviceBrand: undefined, ...product },
			transientProxyConfiguration: false,
		});
		const events: string[] = [];
		const service = disposables.add(new GitHubService(foundation.gitHubServiceOptions, new NullLogService(), new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(name: string): void { events.push(name); }
		}()));
		const controller = new AbortController();
		const reason = new Error('cancelled');
		controller.abort(reason);
		await assert.rejects(service.transport.rest({ host: 'api.github.com', accountId: '1' }, 'token', {
			method: 'GET', url: 'https://api.github.com/user',
		}, controller.signal), error => error === reason);
		foundation.configurationService.updateRootConfig({ [AgentHostTelemetryLevelConfigKey]: 'off' });
		foundation.configurationService.updateRootConfig({ [AgentHostTelemetryLevelConfigKey]: 'all' });
		service.dispose();
		assert.deepStrictEqual(events, []);
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
