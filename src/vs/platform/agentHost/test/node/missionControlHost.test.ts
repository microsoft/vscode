/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { hostname } from 'os';
import { Emitter, Event } from '../../../../base/common/event.js';
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
import { IAgent, IAgentChatSessionEvent } from '../../common/agent.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ActionType, type ActionEnvelope } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus } from '../../common/state/sessionState.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { IAgentHostProxyResolver } from '../../node/agentHostProxyResolver.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { MissionControlEnvironment, type IMissionControlEnvironmentHost } from '../../node/missionControl/missionControlEnvironment.js';
import { getMissionControlEnvironmentName, MissionControlHost, type MissionControlOperationClassification } from '../../node/missionControl/missionControlHost.js';
import { MissionControlProtocolServer } from '../../node/missionControl/missionControlProtocolServer.js';
import { MissionControlProjects } from '../../node/missionControl/missionControlProjects.js';
import { MissionControlSdkEventSource } from '../../node/missionControl/missionControlSdkEventSource.js';
import { MissionControlSessionMirror, type MissionControlMirrorEvent } from '../../node/missionControl/missionControlSessionMirror.js';
import { URI } from '../../../../base/common/uri.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { ProtocolServerHandler, type IProtocolServerConfig } from '../../node/protocolServerHandler.js';
import { AhpJsonlLogger, AhpJsonlLogRetention } from '../../common/ahpJsonlLogger.js';
import { IFileService } from '../../../files/common/files.js';
import { MISSION_CONTROL_AHP_LOG_ID } from '../../common/missionControlEnvironment.js';

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

	function createHost(instantiation = store.add(new TestInstantiationService()), stateManager?: AgentHostStateManager, providers?: IAgentHostProviderService) {
		const counts = { requests: 0, handlers: 0 };
		const events: { eventName: string; data: ITelemetryData | undefined }[] = [];
		instantiation.stub(INativeEnvironmentService, new class extends mock<INativeEnvironmentService>() {
			override readonly isBuilt = true;
			override readonly userDataPath = '/unused-mission-control-test-profile';
			override readonly logsHome = URI.file('/mission-control-test-logs');
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
		instantiation.stub(IAgentHostStateManager, stateManager ?? new class extends mock<AgentHostStateManager>() { }());
		instantiation.stub(ISessionDataService, new class extends mock<ISessionDataService>() { }());
		instantiation.stub(IAgentHostProviderService, providers ?? new class extends mock<IAgentHostProviderService>() { }());
		instantiation.stubInstance(MissionControlProjects, new class extends mock<MissionControlProjects>() {
			override get roots() { return []; }
			override dispose(): void { }
		}());
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(IFileService, new class extends mock<IFileService>() { }());
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

	function createMirror() {
		const instantiation = store.add(new TestInstantiationService());
		const state = store.add(new AgentHostStateManager(store.add(new NullLogService())));
		const creations = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		const providers = new class extends mock<IAgentHostProviderService>() {
			override readonly onDidRegisterProvider = Event.None;
			override getProviders() { return []; }
			override getProviderForSession() { return undefined; }
		}();
		const { host } = createHost(instantiation, state, providers);
		const enabled = sinon.stub(host.environment, 'isEnabled').get(() => true);
		store.add(toDisposable(() => enabled.restore()));
		const creation = creations.getCalls().find(call => call.args[0] === MissionControlEnvironment);
		assert.ok(creation);
		const options = creation.args[1] as IMissionControlEnvironmentHost;
		const { mirror, source } = options.createMirror!('env');
		store.add(mirror);
		store.add(source);
		const events: MissionControlMirrorEvent[] = [];
		store.add(mirror.attach(event => { events.push(event); }));
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		store.add(toDisposable(() => clock.restore()));
		return { state, mirror, events, clock };
	}

	for (const session of ['ahp-session:/draft', 'copilotcli:/draft']) {
		const summary = { resource: session, provider: 'copilotcli', title: '', status: SessionStatus.Idle, createdAt: '2026-10-07T18:00:00Z', modifiedAt: '2026-10-07T18:00:00Z' };

		test(`does not mirror an abandoned provisional draft (${session})`, () => {
			const f = createMirror();
			f.state.createSession(summary, { emitNotification: false });
			f.state.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { model: 'test-model' } });
			f.state.dispatchServerAction(session, { type: ActionType.SessionTitleChanged, title: 'Draft title' });
			f.state.dispatchServerAction(session, { type: ActionType.SessionIsReadChanged, isRead: true });
			f.state.deleteSession(session);
			f.clock.runAll();
			assert.deepStrictEqual({ events: f.events, sessions: f.mirror.statistics.sessions }, { events: [], sessions: 0 });
		});

		test(`mirrors the first user message and subsequent actions after a provisional draft becomes active (${session})`, () => {
			const f = createMirror();
			f.state.createSession(summary, { emitNotification: false });
			f.state.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { model: 'test-model' } });
			const envelopes: ActionEnvelope[] = [];
			store.add(f.state.onDidEmitEnvelope(envelope => {
				if (envelope.channel !== ROOT_STATE_URI) {
					envelopes.push(envelope);
				}
			}));
			f.state.dispatchServerAction(buildDefaultChatUri(session), {
				type: ActionType.ChatTurnStarted, turnId: 'first-turn', startedAt: summary.createdAt,
				message: { text: 'First user message', origin: { kind: MessageKind.User } },
			});
			f.state.dispatchServerAction(session, { type: ActionType.SessionReady });
			f.state.dispatchServerAction(session, { type: ActionType.SessionTitleChanged, title: 'Real conversation' });
			f.clock.runAll();
			assert.deepStrictEqual({
				envelopes: f.events.flatMap(event => event.event === 'sessionEvents' && event.data.ns === 'ahp' && event.data.payload.kind === 'message' ? [event.data.payload.data] : []),
				lifecycle: f.events.flatMap(event => event.event === 'sessionLifecycle' ? [event.data.kind] : []),
				failure: f.mirror.getSessionStatus(session).failure,
			}, { envelopes: JSON.parse(JSON.stringify(envelopes)), lifecycle: ['started'], failure: undefined });
		});
	}

	test('continues mirroring restored sessions even when their history is empty', () => {
		const f = createMirror();
		const session = 'ahp-session:/restored';
		f.state.restoreSession({ resource: session, provider: 'copilotcli', title: 'Restored', status: SessionStatus.Idle, createdAt: '2026-10-07T18:00:00Z', modifiedAt: '2026-10-07T18:00:00Z' }, []);
		f.state.dispatchServerAction(session, { type: ActionType.SessionTitleChanged, title: 'Renamed' });
		f.clock.runAll();
		assert.deepStrictEqual(f.events.flatMap(event => event.event === 'sessionEvents' && event.data.ns === 'ahp' && event.data.payload.kind === 'message' ? [event.data.payload.data] : []),
			[{ channel: session, action: { type: ActionType.SessionTitleChanged, title: 'Renamed' }, serverSeq: f.state.serverSeq }]);
	});

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
			modelProviders: config.advertisedModelProviders,
			sessionConfig: config.copilotSessionConfig,
		}, { hostManagement: false, diagnosticLogs: undefined, modelProviders: ['copilotcli'], sessionConfig: true });
	});

	test('creates lane-owned Mission Control JSONL loggers in the host log directory', () => {
		const instantiation = store.add(new TestInstantiationService());
		const creations = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		instantiation.stubInstance(AhpJsonlLogger, new class extends mock<AhpJsonlLogger>() {
			override dispose(): void { }
		}());
		createHost(instantiation);
		const environmentCreation = creations.getCalls().find(call => call.args[0] === MissionControlEnvironment)!;
		const options = environmentCreation.args[1] as IMissionControlEnvironmentHost;
		store.add(options.createAhpLogger!('mobile-client', 42));
		store.add(options.createAhpLogger!('mobile-client', 43));
		const loggerCreations = creations.getCalls().filter(call => call.args[0] === AhpJsonlLogger);
		const loggerOptions = loggerCreations[0].args[1] as ConstructorParameters<typeof AhpJsonlLogger>[0];
		const nextLoggerOptions = loggerCreations[1].args[1] as ConstructorParameters<typeof AhpJsonlLogger>[0];
		const retentionCreation = creations.getCalls().find(call => call.args[0] === AhpJsonlLogRetention)!;
		assert.deepStrictEqual({
			...loggerOptions,
			retention: loggerOptions.retention instanceof AhpJsonlLogRetention,
			sharedRetention: loggerOptions.retention === nextLoggerOptions.retention,
		}, {
			logsHome: URI.file('/mission-control-test-logs'),
			logId: MISSION_CONTROL_AHP_LOG_ID,
			connectionId: 'mobile-client-42',
			transport: 'mission-control',
			retention: true,
			sharedRetention: true,
		});
		assert.deepStrictEqual(retentionCreation.args[1], {
			logsHome: URI.file('/mission-control-test-logs'), logId: MISSION_CONTROL_AHP_LOG_ID,
			maxFiles: 10, maxSizeBytes: 750 * 1024 * 1024,
		});
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

	test('routes Copilot compatibility requests by advertised session ownership and publishes plan refresh hints', async () => {
		const instantiation = store.add(new TestInstantiationService());
		const creations = sinon.spy(instantiation, 'createInstance');
		store.add(toDisposable(() => creations.restore()));
		const state = store.add(new AgentHostStateManager(new NullLogService()));
		const session = URI.parse('ahp-session:/opaque-native-conversation');
		const now = new Date().toISOString();
		state.createSession({ resource: session.toString(), provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle, createdAt: now, modifiedAt: now });
		const defaultChat = state.getSessionSummary(session.toString())?.defaultChat;
		assert.ok(defaultChat);
		const chat = URI.parse(defaultChat);
		state.dispatchServerAction(session.toString(), { type: ActionType.SessionMetaChanged, _meta: { existing: 'keep' } });
		const events = store.add(new Emitter<IAgentChatSessionEvent>());
		const calls: { session: string; enabled?: boolean }[] = [];
		const plan = { plan: { exists: false, content: null, path: null }, todos: [], dependencies: [] };
		const provider = new class extends mock<IAgent>() {
			override readonly onDidChatSessionEvent = events.event;
			override async getSessionPlan(resource: URI) { calls.push({ session: resource.toString() }); return plan; }
			override async setSessionApproveAll(resource: URI, enabled: boolean) { calls.push({ session: resource.toString(), enabled }); }
		}();
		const providers = new class extends mock<IAgentHostProviderService>() {
			override readonly onDidRegisterProvider = Event.None;
			override getProviders() { return [provider]; }
			override getProviderForSession() { return provider; }
		}();
		instantiation.stubInstance(ProtocolServerHandler, new class extends mock<ProtocolServerHandler>() { override dispose(): void { } }());
		instantiation.stubInstance(MissionControlSdkEventSource, new class extends mock<MissionControlSdkEventSource>() {
			override observeSession(): void { }
			override dispose(): void { }
		}());
		instantiation.stubInstance(MissionControlSessionMirror, new class extends mock<MissionControlSessionMirror>() {
			override registerSession(): void { }
			override setLifecycle(): void { }
			override enqueue(): boolean { return true; }
			override dispose(): void { }
		}());
		const { host } = createHost(instantiation, state, providers);
		const enabled = sinon.stub(host.environment, 'isEnabled').get(() => true);
		store.add(toDisposable(() => enabled.restore()));
		const environment = creations.getCalls().find(call => call.args[0] === MissionControlEnvironment)!.args[1] as IMissionControlEnvironmentHost;
		store.add(environment.attach(new class extends mock<MissionControlProtocolServer>() { override readonly rootMeta = {}; }(), [], () => []));
		const config = creations.getCalls().find(call => call.args[0] === ProtocolServerHandler)!.args[4] as IProtocolServerConfig;
		const result = await config.copilotSessionRequest!('extensions/getPlan', { channel: session.toString() });
		await config.copilotSessionRequest!('extensions/setSessionApproveAll', { channel: session.toString(), enabled: true });
		await assert.rejects(config.copilotSessionRequest!('extensions/setSessionApproveAll', { channel: session.toString(), enabled: 'true' })!, ProtocolError);
		await assert.rejects(config.copilotSessionRequest!('extensions/getPlan', { channel: 'ahp-session:/missing' })!, ProtocolError);
		const mirror = environment.createMirror!('environment');
		store.add(mirror.source);
		store.add(mirror.mirror);
		for (const [type, id, data] of [
			['session.plan_changed', 'plan-1', { operation: 'update' }],
			['session.todos_changed', 'todos-1', {}],
		] as const) {
			events.fire({ chat, id, type, data, timestamp: now, persisted: true });
		}
		assert.deepStrictEqual({
			result, calls,
			meta: state.getSessionState(session.toString())?._meta,
			projects: config.copilotProjects !== undefined,
		}, {
			result: plan,
			calls: [{ session: session.toString() }, { session: session.toString(), enabled: true }],
			meta: { existing: 'keep', 'copilot.planHint': { operation: 'update', eventId: 'plan-1' }, 'copilot.todosHint': { eventId: 'todos-1' } },
			projects: true,
		});
	});
});
