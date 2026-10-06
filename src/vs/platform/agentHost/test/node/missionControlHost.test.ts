/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { hostname } from 'os';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ITelemetryService, type ITelemetryData } from '../../../telemetry/common/telemetry.js';
import { AgentHostClientFileSystemProvider } from '../../common/agentHostClientFileSystemProvider.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import { IAgentService } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { MissionControlEnvironment, type IMissionControlEnvironmentHost } from '../../node/missionControl/missionControlEnvironment.js';
import { getMissionControlEnvironmentName, MissionControlHost, type MissionControlOperationClassification } from '../../node/missionControl/missionControlHost.js';
import { MissionControlProtocolServer } from '../../node/missionControl/missionControlProtocolServer.js';
import { ProtocolServerHandler, type IProtocolServerConfig } from '../../node/protocolServerHandler.js';

suite('Mission Control host integration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [quality, nameShort, expected] of [
		['stable', 'Visual Studio Code', 'VS Code'],
		['insider', 'Visual Studio Code - Insiders', 'VS Code Insiders'],
		[undefined, 'Code - OSS', 'VS Code OSS'],
		[undefined, 'Code - OSS Dev', 'VS Code OSS'],
		['exploration', 'Code - Exploration', 'Code - Exploration'],
	] as const) {
		test(`uses a machine-first name with the ${nameShort} application in parentheses`, () => {
			const product = new class extends mock<IProductService>() {
				override readonly quality = quality;
				override readonly nameShort = nameShort;
			}();
			const machineNames = ['Robs-MacBook-Pro.local', 'Robs-MacBook-Pro.LOCAL', 'WORKSTATION-01', 'workstation.example.com', 'local-server', 'machine.local.example.com'];
			assert.deepStrictEqual(machineNames.map(name => getMissionControlEnvironmentName(product, name)), [
				`Robs-MacBook-Pro (${expected})`,
				`Robs-MacBook-Pro (${expected})`,
				`WORKSTATION-01 (${expected})`,
				`workstation.example.com (${expected})`,
				`local-server (${expected})`,
				`machine.local.example.com (${expected})`,
			]);
		});
	}

	test('defaults to the owning machine hostname', () => {
		const product = new class extends mock<IProductService>() {
			override readonly quality = 'insider';
		}();
		assert.strictEqual(getMissionControlEnvironmentName(product), `${hostname().replace(/\.local$/i, '')} (VS Code Insiders)`);
	});

	function createHost(instantiation = store.add(new TestInstantiationService())) {
		const counts = { requests: 0, handlers: 0 };
		const events: { eventName: string; data: ITelemetryData | undefined }[] = [];
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
				counts.requests++;
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
		instantiation.stub(ITelemetryService, new class extends mock<ITelemetryService>() {
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				events.push({ eventName, data });
			}
		}());
		const host = store.add(instantiation.createInstance(MissionControlHost, {
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			clientFileSystemProvider: store.add(instantiation.createInstance(AgentHostClientFileSystemProvider)),
			trackProtocolHandler: handler => {
				counts.handlers++;
				return toDisposable(() => handler.dispose());
			},
		}));
		return { host, counts, events };
	}

	test('constructs in a built product without starting registration before opt-in', async () => {
		const { host, counts } = createHost();
		await host.environment.configure(undefined);
		assert.deepStrictEqual({
			constructed: host.environment instanceof MissionControlEnvironment,
			enabled: host.environment.isEnabled,
			environmentId: host.environment.environmentId,
			...counts,
		}, { constructed: true, enabled: false, environmentId: undefined, requests: 0, handlers: 0 });
	});

	test('does not advertise or forward host-wide diagnostic logs on Mission Control ingress', () => {
		const instantiation = store.add(new TestInstantiationService());
		const creations = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		instantiation.stubInstance(ProtocolServerHandler, new class extends mock<ProtocolServerHandler>() {
			override dispose(): void { }
		}());
		createHost(instantiation);
		const environmentCreation = creations.getCalls().find(call => call.args[0] === MissionControlEnvironment);
		assert.ok(environmentCreation);
		const options = environmentCreation.args[1] as IMissionControlEnvironmentHost;
		const relay = new class extends mock<MissionControlProtocolServer>() { }();
		store.add(options.attach(relay, [], () => []));
		const handlerCreation = creations.getCalls().find(call => call.args[0] === ProtocolServerHandler);
		assert.ok(handlerCreation);
		const config = handlerCreation.args[4] as IProtocolServerConfig;
		assert.deepStrictEqual({
			hostManagement: config.allowExtensionMethods,
			diagnosticLogs: config.otlpLogEmitter,
		}, { hostManagement: false, diagnosticLogs: undefined });
	});

	test('reports bounded host lifecycle metadata without exporting errors or successful heartbeat traffic', () => {
		const instantiation = store.add(new TestInstantiationService());
		const creations = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		const { events } = createHost(instantiation);
		const creation = creations.getCalls().find(call => call.args[0] === MissionControlEnvironment);
		assert.ok(creation);
		const options = creation.args[1] as IMissionControlEnvironmentHost;
		for (const [phase, outcome] of [
			['register', 'started'], ['register', 'succeeded'], ['heartbeat', 'succeeded'], ['checkIn', 'succeeded'],
			['heartbeat', 'failed'], ['relay', 'succeeded'], ['relayDisconnected', 'info'], ['private-phase', 'failed'],
		] as const) {
			options.onDiagnostic?.({
				operationId: 'private-id', phase, outcome, timestamp: 0, durationMs: 42,
				detail: 'private response',
				error: outcome === 'failed' ? { name: 'Error', message: 'private server response (requestId=ABCD:1234:5678:90AB:CDEF)', status: 503, requestId: 'ABCD:1234:5678:90AB:CDEF' } : undefined,
			});
		}
		type ClassifiedSample<T> = { [K in Exclude<keyof T, 'owner' | 'comment'>]: T[K] extends { isMeasurement: true } ? number : string };
		const sample: ClassifiedSample<MissionControlOperationClassification> = {
			operation: 'heartbeat', outcome: 'failed', durationMs: 42, statusCode: 503, hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
		};
		assert.deepStrictEqual(events, [
			{ eventName: 'agentHost.missionControlOperation', data: { ...sample, operation: 'register', outcome: 'succeeded', statusCode: undefined } },
			{ eventName: 'agentHost.missionControlOperation', data: sample },
			{ eventName: 'agentHost.missionControlOperation', data: { ...sample, operation: 'relay', outcome: 'succeeded', statusCode: undefined } },
			{ eventName: 'agentHost.missionControlOperation', data: { ...sample, operation: 'relayDisconnected', outcome: 'info', statusCode: undefined } },
		]);
	});
});
