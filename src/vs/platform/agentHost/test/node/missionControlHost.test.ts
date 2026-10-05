/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { AgentHostClientFileSystemProvider } from '../../common/agentHostClientFileSystemProvider.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { IAgentService } from '../../common/agentService.js';
import { OtlpLogEmitter } from '../../common/otlp/otlpLogEmitter.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { MissionControlEnvironment } from '../../node/missionControl/missionControlEnvironment.js';
import { getMissionControlEnvironmentName, MissionControlHost } from '../../node/missionControl/missionControlHost.js';

suite('Mission Control host integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [quality, nameShort, expected] of [
		['stable', 'Visual Studio Code', 'VS Code'],
		['insider', 'Visual Studio Code - Insiders', 'VS Code Insiders'],
		[undefined, 'Code - OSS', 'VS Code OSS'],
		['exploration', 'Code - Exploration', 'Code - Exploration'],
	] as const) {
		test(`uses the product display name for ${quality ?? 'OSS'}`, () => {
			const product = new class extends mock<IProductService>() {
				override readonly quality = quality;
				override readonly nameShort = nameShort;
			}();
			assert.strictEqual(getMissionControlEnvironmentName(product), expected);
		});
	}

	test('constructs in a built product without starting registration before opt-in', async () => {
		let requests = 0;
		let handlers = 0;
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(INativeEnvironmentService, new class extends mock<INativeEnvironmentService>() {
			override readonly isBuilt = true;
			override readonly userDataPath = '/unused-mission-control-test-profile';
		}());
		instantiation.stub(IProductService, new class extends mock<IProductService>() {
			override readonly quality = 'stable';
			override readonly nameShort = 'Visual Studio Code';
		}());
		instantiation.stub(IAgentHostProxyResolver, new class extends mock<IAgentHostProxyResolver>() {
			override async fetch(): Promise<never> {
				requests++;
				throw new Error('Registration must not start before opt-in');
			}
		}());
		instantiation.stub(IAgentHostGitHubEndpointService, new class extends mock<IAgentHostGitHubEndpointService>() {
			override readonly onDidChange = Event.None;
			override getApiBaseUri(): string { return 'https://api.github.com'; }
		}());
		instantiation.stub(IAgentService, new class extends mock<IAgentService>() { }());
		instantiation.stub(IAgentHostStateManager, new class extends mock<AgentHostStateManager>() { }());
		instantiation.stub(ISessionDataService, new class extends mock<ISessionDataService>() { }());
		instantiation.stub(IAgentHostProviderService, new class extends mock<IAgentHostProviderService>() { }());
		instantiation.stub(ILogService, new NullLogService());
		const host = store.add(instantiation.createInstance(MissionControlHost, {
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			clientFileSystemProvider: store.add(instantiation.createInstance(AgentHostClientFileSystemProvider)),
			otlpLogEmitter: store.add(new OtlpLogEmitter()),
			trackProtocolHandler: () => {
				handlers++;
				throw new Error('Relay ingress must not start before opt-in');
			},
		}));
		await host.environment.configure(undefined);
		assert.deepStrictEqual({
			constructed: host.environment instanceof MissionControlEnvironment,
			enabled: host.environment.isEnabled,
			environmentId: host.environment.environmentId,
			requests,
			handlers,
		}, { constructed: true, enabled: false, environmentId: undefined, requests: 0, handlers: 0 });
	});
});
