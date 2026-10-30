/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { hashAutomationTelemetryId } from '../../node/agentHostAutomationTelemetry.js';
import { NullTelemetryServiceShape, TelemetryTrustedValue } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession, type IAgent, type IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY } from '../../common/automationConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AuthenticateTargetKind } from '../../common/state/sessionProtocol.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunState } from '../../common/state/protocol/channels-automation-run/state.js';
import type { RunAutomationParams } from '../../common/state/protocol/channels-automation/commands.js';
import { AUTOMATION_CATALOG_URI, buildDefaultChatUri, CustomizationType, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionStatus, type ClientPluginCustomization, type SessionActiveClient } from '../../common/state/sessionState.js';
import { AgentHostAutomationService, type IAgentHostAutomationExecution } from '../../node/agentHostAutomationService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { createInMemoryFileService } from '../../../files/test/common/inMemoryFileService.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { AgentPluginManager } from '../../node/agentPluginManager.js';
import { AUTOMATION_ACTIVE_CLIENT_ID, toAgentHostFileUri } from '../../common/agentPluginManager.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostSystemWakeService } from '../../node/agentHostSystemWakeService.js';
import { SCHEDULED_WORK_WAKE_NETWORK_CAP_MS, SCHEDULED_WORK_WAKE_SETTLE_MS } from '../../common/agentHostWakeNetworkMonitor.js';
import type { IAgentHostMcpAuthenticationRequest } from '../../common/agentHostExtensionProtocol.js';
import { McpAuthRequiredReason, McpServerStatus, SessionOriginKind, type Customization, type McpAuthRequirement } from '../../common/state/protocol/channels-session/state.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { getAgentHostAutomationHistoryState, withAgentHostAutomationHistoryState } from '../../common/meta/agentHostAutomationsMeta.js';

class RecordingAutomationTelemetry extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(name?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: name ?? '', data: data ?? {} });
	}
}

suite('AgentHostAutomationService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let stateManager: AgentHostStateManager;
	let storageService: AgentHostStorageService;
	let writeFailures: number;
	let writeAttempts: number;
	let writeGate: Promise<void> | undefined;
	let telemetry: RecordingAutomationTelemetry;
	let fileService: FileService;
	let pluginManager: AgentPluginManager;
	let clientConnections: AgentHostClientConnectionService;
	let systemWake: AgentHostSystemWakeService;
	let authenticationRequests: IAgentHostMcpAuthenticationRequest[];
	let authenticationResult: Promise<boolean>;

	setup(() => {
		clientConnections = disposables.add(new AgentHostClientConnectionService());
		systemWake = disposables.add(new AgentHostSystemWakeService(new NullLogService()));
		authenticationRequests = [];
		authenticationResult = Promise.resolve(false);
		disposables.add(clientConnections.registerSource({
			hasSeenClient: () => false,
			isClientConnected: () => false,
			isLocalClient: () => false,
			usesLegacyChatUris: () => false,
			getConnectedClientTransportCounts: () => new Map(),
			requestWorkspaceTrust: async () => false,
			requestMcpAuthentication: request => {
				authenticationRequests.push(request);
				return authenticationResult;
			},
		}));
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		writeFailures = 0;
		writeAttempts = 0;
		writeGate = undefined;
		telemetry = new RecordingAutomationTelemetry();
		fileService = createInMemoryFileService(disposables, Schemas.file);
		disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, disposables.add(new InMemoryFileSystemProvider())));
		pluginManager = new AgentPluginManager(URI.file('/userData'), fileService, new NullLogService());
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async () => {
				writeAttempts++;
				await writeGate;
				if (writeFailures > 0) {
					writeFailures--;
					throw new Error('storage unavailable');
				}
			},
			rename: async () => { },
			rm: async () => { },
		};
		storageService = disposables.add(new AgentHostStorageService(
			URI.file(`/agent-host-automation-service-${generateUuid()}.json`),
			new NullLogService(),
			writer,
		));
	});


	function definition(): AutomationDefinition {
		return {
			title: 'Review changes',
			message: { text: 'Review the current changes.', origin: { kind: MessageKind.Automation } },
			session: { provider: 'mock' },
			enabled: true,
			triggers: [],
		};
	}

	function createAction(resource = 'ahp-automation:/review-changes') {
		return {
			type: ActionType.AutomationCreateRequested,
			resource,
			definition: definition(),
		} as const;
	}

	function createService(execution?: Partial<IAgentHostAutomationExecution>): AgentHostAutomationService {
		const models: IAgentModelInfo[] = [
			{ provider: 'copilotcli', id: 'catalog-model', name: 'Catalog model', supportsVision: false },
			{ provider: 'copilotcli', id: 'private-byok-model', name: 'Private model', supportsVision: false, _meta: createAgentModelByokMeta('private/vendor/model') },
		];
		const agent = upcastPartial<IAgent>({ id: 'copilotcli', models: constObservable(models) });
		const providers = new class extends mock<IAgentHostProviderService>() {
			override resolveProvider(provider?: string): IAgent | undefined {
				return provider === undefined || provider === agent.id ? agent : undefined;
			}
		}();
		const service = new AgentHostAutomationService({
			isSessionTemplateAvailable: execution?.isSessionTemplateAvailable ?? (() => true),
			allocateSession: execution?.allocateSession ?? (async template => ({ session: URI.parse(`mock:/${generateUuid()}`), provider: template.provider ?? 'copilotcli' })),
			createSession: execution?.createSession ?? (async () => { throw new Error('Unexpected session creation'); }),
			getRecoverableSessionProvider: execution?.getRecoverableSessionProvider ?? (async session => stateManager.getSessionSummary(session.toString())?.provider),
			deleteSession: execution?.deleteSession ?? (async () => { }),
			startSession: execution?.startSession ?? (async () => { throw new Error('Unexpected session start'); }),
			cancelSession: execution?.cancelSession ?? (async () => false),
			resumeTurn: execution?.resumeTurn ?? (async () => false),
		}, stateManager, createTestChatOwnershipService(stateManager), storageService, new NullLogService(), telemetry, providers, pluginManager, fileService, upcastPartial<INativeEnvironmentService>({ userHome: URI.file('/home') }), clientConnections, systemWake);
		return disposables.add(service);
	}

	async function enableAndCreate(service: AgentHostAutomationService, resource = 'ahp-automation:/review-changes'): Promise<void> {
		await service.handleCreate(createAction(resource));
	}

	test('silently authenticates run-linked MCP servers once per challenge', async () => {
		const session = URI.parse('mock:/mcp-run');
		const interactiveSession = URI.parse('mock:/interactive');
		for (const resource of [session, interactiveSession]) {
			stateManager.createSession({
				resource: resource.toString(), provider: 'mock', title: '',
				status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
				defaultChat: buildDefaultChatUri(resource.toString()),
			});
		}
		const started = new DeferredPromise<void>();
		const pendingAuthentication = new DeferredPromise<boolean>();
		authenticationResult = pendingAuthentication.p;
		const service = createService({
			createSession: async () => session,
			startSession: async () => { await started.complete(); },
		});
		await enableAndCreate(service);
		await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'mcp-run' });
		await started.p;
		const auth: McpAuthRequirement = {
			resource: { resource: 'https://mcp.example.com', authorization_servers: ['https://auth.example.com'] },
			reason: McpAuthRequiredReason.Required,
			requiredScopes: ['read'],
		};
		const customizations = (challenge: McpAuthRequirement): Customization[] => [
			{ type: CustomizationType.McpServer, id: 'top', uri: 'mcp:/top', name: 'top', state: { kind: McpServerStatus.AuthRequired, ...challenge } },
			{
				type: CustomizationType.Plugin, id: 'plugin', uri: 'file:///plugin', name: 'plugin', children: [
					{ type: CustomizationType.McpServer, id: 'child', uri: 'mcp:/child', name: 'child', state: { kind: McpServerStatus.AuthRequired, ...challenge } },
				]
			},
		];
		const publish = (resource: URI, challenge: McpAuthRequirement) => stateManager.dispatchServerAction(resource.toString(), {
			type: ActionType.SessionCustomizationsChanged, customizations: customizations(challenge),
		});
		publish(interactiveSession, auth);
		publish(session, auth);
		publish(session, auth);
		const inflightRequests = [...authenticationRequests];
		await pendingAuthentication.complete(false);
		await Promise.resolve();
		publish(session, auth);
		const failedRequests = [...authenticationRequests];
		const changedAuth = { ...auth, requiredScopes: ['read', 'write'] };
		publish(session, changedAuth);
		const changedChallenges: McpAuthRequirement[] = [
			{ ...auth, resource: { ...auth.resource, resource: 'https://other.example.com' } },
			{ ...auth, reason: McpAuthRequiredReason.Expired },
			{ ...auth, oauthClient: { clientId: 'registered-client' } },
		];
		for (const challenge of changedChallenges) {
			publish(session, challenge);
			publish(session, challenge);
		}
		publish(session, auth);
		stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [] });
		publish(session, auth);
		stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: false } });
		publish(session, changedAuth);
		stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true } });
		publish(session, auth);
		service.dispose();
		publish(session, changedAuth);
		const requestsFor = (auth: McpAuthRequirement) => ['top', 'child'].map(serverName => ({
			serverName, auth, target: { kind: AuthenticateTargetKind.McpServer, session: session.toString(), customizationId: serverName },
		}));
		assert.deepStrictEqual({ inflightRequests, failedRequests, requests: authenticationRequests }, {
			inflightRequests: requestsFor(auth), failedRequests: requestsFor(auth),
			requests: [auth, changedAuth, ...changedChallenges, auth, auth].flatMap(requestsFor),
		});
	});

	test('captures plugins durably and seeds a disconnected run with the rewritten agent', async () => {
		const ref: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'bundle', uri: 'virtual:/bundle', name: 'Bundle', nonce: 'one' };
		await fileService.writeFile(URI.joinPath(toAgentClientUri(URI.parse(ref.uri), 'author'), '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		const created = new DeferredPromise<{ activeClient: SessionActiveClient | undefined; agent: string | undefined }>();
		const service = createService({
			createSession: async (template, _run, _session, activeClient) => {
				created.complete({ activeClient, agent: template.agent?.uri });
				return AgentSession.uri('mock', 'customized');
			},
			startSession: async () => { },
		});
		const action = createAction();
		action.definition.session = { provider: 'mock', agent: { uri: 'virtual:/bundle/agents/reviewer.md' }, customizations: [ref] };
		await service.handleCreate(action, 'author');
		const entry = stateManager.getAutomationCatalogState()!.entries[0];
		const copy = entry.customizations![0];
		await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: action.resource, requestId: 'offline' });
		const run = await created.p;
		assert.deepStrictEqual({
			copy,
			stored: storageService.get<{ catalog: { automations: typeof entry[] } }>('automations')!.catalog.automations[0].customizations,
			run,
		}, {
			copy: { type: CustomizationType.Plugin, id: 'bundle', uri: copy.uri, name: 'Bundle', children: [], load: { kind: 'loaded' }, icons: undefined, range: undefined, version: undefined },
			stored: [copy],
			run: {
				activeClient: { clientId: AUTOMATION_ACTIVE_CLIENT_ID, displayName: 'Automation', tools: [], customizations: [{ ...ref, uri: toAgentHostFileUri(URI.parse(copy.uri)).toString(), clientId: AUTOMATION_ACTIVE_CLIENT_ID }] },
				agent: URI.joinPath(URI.parse(copy.uri), 'agents/reviewer.md').toString(),
			},
		});
	});

	test('creates and updates local file customizations in place using connection service locality', async () => {
		disposables.add(clientConnections.registerSource({
			hasSeenClient: clientId => clientId === 'local',
			isClientConnected: clientId => clientId === 'local',
			isLocalClient: clientId => clientId === 'local',
			usesLegacyChatUris: () => false,
			getConnectedClientTransportCounts: () => new Map([['local', 1]]),
			requestWorkspaceTrust: async () => true,
			requestMcpAuthentication: async () => false,
		}));
		const ref: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'bundle', uri: URI.file('/local/bundle').toString(), name: 'Bundle', nonce: 'one' };
		await fileService.writeFile(URI.joinPath(URI.parse(ref.uri), '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		const service = createService();
		const action = createAction();
		action.definition.session.customizations = [ref];
		await service.handleCreate(action, 'local');
		const created = stateManager.getAutomationCatalogState()!.entries[0].customizations;
		const updatedRef = { ...ref, nonce: 'two' };
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested, resource: action.resource,
			changes: { session: { ...action.definition.session, customizations: [updatedRef] } },
		}, 'local');
		const updated = stateManager.getAutomationCatalogState()!.entries[0];
		const [runSync] = await pluginManager.syncCustomizations(AUTOMATION_ACTIVE_CLIENT_ID, [{ ...updatedRef, uri: toAgentHostFileUri(URI.parse(updatedRef.uri)).toString(), clientId: AUTOMATION_ACTIVE_CLIENT_ID }]);
		assert.deepStrictEqual({
			createdUris: created?.map(copy => copy.uri),
			updatedUris: updated.customizations?.map(copy => copy.uri),
			refs: updated.definition.session.customizations,
			copiesExist: await fileService.exists(URI.joinPath(pluginManager.hostPluginsPath, 'automations')),
			runPluginDir: runSync.pluginDir?.toString(),
		}, {
			createdUris: [ref.uri], updatedUris: [ref.uri], refs: [updatedRef], copiesExist: false, runPluginDir: ref.uri,
		});
	});

	test('keeps copies on unrelated updates and rejects failed captures atomically', async () => {
		const service = createService();
		const action = createAction();
		const ref: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'bundle', uri: 'virtual:/bundle', name: 'Bundle', nonce: 'one' };
		action.definition.session.customizations = [ref];
		await fileService.writeFile(URI.joinPath(toAgentClientUri(URI.parse(ref.uri), 'author'), '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		await service.handleCreate(action, 'author');
		const original = stateManager.getAutomationCatalogState()!.entries[0].customizations;
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: action.resource, changes: { title: 'Updated' } });
		await assert.rejects(service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: action.resource, changes: { session: { provider: 'mock', customizations: [{ ...ref, uri: 'virtual:/missing' }] } } }, 'author'));
		const updated = stateManager.getAutomationCatalogState()!.entries[0];
		assert.deepStrictEqual({ copies: updated.customizations, session: updated.definition.session, title: updated.definition.title }, {
			copies: original, session: action.definition.session, title: 'Updated',
		});
	});

	test('collects unreferenced copies after mutations but retains copies used by runs', async () => {
		const orphan = URI.joinPath(pluginManager.hostPluginsPath, 'automations', '.staging-orphan');
		await fileService.createFolder(orphan);
		const created = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => {
				created.complete();
				return AgentSession.uri('mock', 'run');
			},
			startSession: async () => { },
		});
		const action = createAction();
		const ref: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'bundle', uri: 'virtual:/bundle', name: 'Bundle', nonce: 'one' };
		action.definition.session.customizations = [ref];
		await fileService.writeFile(URI.joinPath(toAgentClientUri(URI.parse(ref.uri), 'author'), '.plugin/plugin.json'), VSBuffer.fromString('{"name":"bundle"}'));
		await service.handleCreate(action, 'author');
		const usedByRun = stateManager.getAutomationCatalogState()!.entries[0].customizations![0];
		await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: action.resource, requestId: 'run' });
		await created.p;
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: action.resource, changes: { session: { provider: 'mock', customizations: [{ ...ref, nonce: 'two' }] } } }, 'author');
		const unused = stateManager.getAutomationCatalogState()!.entries[0].customizations![0];
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: action.resource, changes: { session: { provider: 'mock' } } });
		assert.deepStrictEqual({
			orphan: await fileService.exists(orphan),
			usedByRun: await fileService.exists(URI.parse(usedByRun.uri)),
			unused: await fileService.exists(URI.parse(unused.uri)),
		}, { orphan: false, usedByRun: true, unused: false });
	});

	function terminalRun(resource: string): Promise<void> {
		const isTerminal = (status: AutomationRunStatus | undefined) => status === AutomationRunStatus.Completed || status === AutomationRunStatus.Cancelled || status === AutomationRunStatus.Failed;
		if (isTerminal(stateManager.getAutomationRunState(resource)?.lifecycle.status)) {
			return Promise.resolve();
		}
		return Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, envelope =>
			envelope.channel === resource && envelope.action.type === ActionType.AutomationRunLifecycleChanged && isTerminal(envelope.action.lifecycle.status)
		)).then(() => undefined);
	}

	test('persists exact allocation before creation and membership before sending', async () => {
		const session = URI.parse('ahp-session:/allocated');
		const observations: object[] = [];
		const started = new DeferredPromise<void>();
		const service = createService({
			allocateSession: async () => ({ session, provider: 'codex' }),
			createSession: async (template, _run, allocated) => {
				observations.push({
					provider: template.provider,
					allocated: allocated.toString(),
					intents: storageService.get<{ sessionCreations: object[] }>('automations')?.sessionCreations,
					origin: service.getLegacySessionOrigin(allocated.toString(), 'codex'),
				});
				assert.strictEqual(service.getLegacySessionOrigin(allocated.toString(), 'copilotcli'), undefined);
				return allocated;
			},
			startSession: async () => {
				const stored = storageService.get<{ runs: AutomationRunState[]; sessionCreations?: object[]; runProviders: Record<string, string> }>('automations')!;
				observations.push({ sessions: stored.runs[0].sessions, intents: stored.sessionCreations, provider: stored.runProviders[stored.runs[0].resource] });
				await started.complete();
			},
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'allocated' });
		await started.p;
		assert.deepStrictEqual(observations, [{
			provider: 'codex',
			allocated: session.toString(),
			intents: [{ run: run.resource, session: session.toString(), provider: 'codex' }],
			origin: { kind: SessionOriginKind.Automation, automation: createAction().resource, run: run.resource },
		}, { sessions: [session.toString()], intents: undefined, provider: 'codex' }]);
	});

	test('retries failed live creation cleanup when the provider returns without replaying a prompt', async () => {
		const session = URI.parse('ahp-session:/incomplete');
		let available = false;
		let sends = 0;
		const cleanupAttempted = new DeferredPromise<void>();
		const deleted: string[] = [];
		const service = createService({
			allocateSession: async () => ({ session, provider: 'codex' }),
			createSession: async () => { throw new Error('creation failed'); },
			getRecoverableSessionProvider: async () => undefined,
			deleteSession: async (resource, provider) => {
				await cleanupAttempted.complete();
				if (!available) {
					throw new Error('provider unavailable');
				}
				deleted.push(`${provider}:${resource}`);
			},
			startSession: async () => { sends++; },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'failed-creation' });
		await cleanupAttempted.p;
		await service.handleConfigurationChanged();
		assert.ok(storageService.get<{ sessionCreations?: object[] }>('automations')?.sessionCreations);
		available = true;
		service.handleAgentsChanged();
		await terminalRun(run.resource);
		assert.deepStrictEqual({
			deleted, sends,
			intents: storageService.get<{ sessionCreations?: object[] }>('automations')?.sessionCreations,
			sessions: stateManager.getAutomationRunState(run.resource)?.sessions,
		}, { deleted: [`codex:${session}`], sends: 0, intents: undefined, sessions: [] });
	});

	test('recovers a durable native session allocation using its recorded provider', async () => {
		const automation = createAction().resource;
		const run: AutomationRunState = {
			resource: 'ahp-automation-run:/interrupted', automation,
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Running, createdAt: new Date(0).toISOString(), startedAt: new Date(0).toISOString() },
			sessions: [],
		};
		storageService.set('automations', {
			catalog: { automations: [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] },
			runs: [run],
			sessionCreations: [{ run: run.resource, session: 'ahp-session:/saved', provider: 'codex' }],
		});
		await storageService.whenIdle();
		const lookups: object[] = [];
		createService({
			getRecoverableSessionProvider: async (session, provider) => { lookups.push({ session: session.toString(), provider }); return 'codex'; },
		});
		await terminalRun(run.resource);
		const stored = storageService.get<{ runs: AutomationRunState[]; runProviders: Record<string, string>; sessionCreations?: object[] }>('automations')!;
		assert.deepStrictEqual({
			lookups, sessions: stored.runs[0].sessions, provider: stored.runProviders[run.resource], intents: stored.sessionCreations,
		}, { lookups: [{ session: 'ahp-session:/saved', provider: 'codex' }], sessions: ['ahp-session:/saved'], provider: 'codex', intents: undefined });
	});

	test('retains inert history and provenance after deleting the definition', async () => {
		const session = URI.parse('ahp-session:/retained');
		const started = new DeferredPromise<void>();
		const service = createService({
			allocateSession: async () => ({ session, provider: 'codex' }),
			createSession: async () => session,
			startSession: async () => { await started.complete(); },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'retained' });
		await started.p;
		service.dispose();
		const restored = createService();
		await terminalRun(run.resource);
		await restored.deleteAutomation(createAction().resource, false);
		const owner = stateManager.getAutomationCatalogState()!.entries[0];
		assert.deepStrictEqual({
			state: getAgentHostAutomationHistoryState(owner), enabled: owner.definition.enabled, operations: owner.operations,
			runs: owner.runs.map(run => run.primarySession),
			origin: restored.getLegacySessionOrigin(session.toString(), 'codex'),
			definition: owner.definition,
			customizations: owner.customizations,
		}, {
			state: 'retained', enabled: false, operations: [AutomationOperation.Remove], runs: [session.toString()],
			origin: { kind: SessionOriginKind.Automation, automation: createAction().resource, run: run.resource },
			definition: {
				title: 'Review changes',
				message: { text: '', origin: { kind: MessageKind.Automation } },
				session: {},
				enabled: false,
				triggers: [],
			},
			customizations: undefined,
		});
		await assert.rejects(restored.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: owner.resource, requestId: 'retained-again' }), /not available/);
	});

	test('deletes all retained members beyond the history page and replay retries only failed rows', async () => {
		const automation = createAction().resource;
		const runs: AutomationRunState[] = Array.from({ length: 51 }, (_, index) => ({
			resource: `ahp-automation-run:/${index}`, automation,
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Completed, createdAt: new Date(index).toISOString(), startedAt: new Date(index).toISOString(), completedAt: new Date(index).toISOString() },
			sessions: [`ahp-session:/${index}`, `ahp-session:/secondary-${index}`],
			primarySession: `ahp-session:/${index}`,
		}));
		storageService.set('automations', {
			catalog: { automations: [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] },
			runs, runProviders: Object.fromEntries(runs.map(run => [run.resource, 'codex'])),
		});
		await storageService.whenIdle();
		let fail = true;
		const deleted: string[] = [];
		const service = createService({
			getRecoverableSessionProvider: async (_session, provider) => provider,
			deleteSession: async (session, provider) => {
				assert.strictEqual(provider, 'codex');
				if (fail && session.toString() === 'ahp-session:/0') {
					throw new Error('offline');
				}
				deleted.push(session.toString());
			},
		});
		await service.handleConfigurationChanged();
		await assert.rejects(service.deleteAutomation(automation, true), /offline/);
		assert.deepStrictEqual({
			deleted: deleted.length,
			remaining: storageService.get<{ historyDeletions: object[] }>('automations')?.historyDeletions,
			owner: {
				state: getAgentHostAutomationHistoryState(stateManager.getAutomationCatalogState()!.entries[0]),
				operations: stateManager.getAutomationCatalogState()!.entries[0].operations,
			},
			history: stateManager.getAutomationCatalogState()!.entries[0].runs.length,
			secondary: service.getLegacySessionOrigin('ahp-session:/secondary-0', 'codex')?.run,
		}, {
			deleted: 101,
			remaining: [{
				automation,
				sessions: [{ session: 'ahp-session:/0', provider: 'codex' }],
				deletedSessions: deleted,
			}],
			owner: { state: 'deleting', operations: [AutomationOperation.Remove] },
			history: 50,
			secondary: runs[0].resource,
		});
		fail = false;
		const allSessions = runs.flatMap(run => run.sessions).map(session => URI.parse(session));
		const acknowledged = await service.deleteAutomation(automation, true, allSessions);
		const missingOwner = await service.deleteAutomation(automation, true, [URI.parse('ahp-session:/unrelated')]);
		assert.deepStrictEqual({
			deleted: deleted.length, entries: stateManager.getAutomationCatalogState()?.entries,
			runs: storageService.get<{ runs: object[] }>('automations')?.runs,
			acknowledged: [...acknowledged].sort(), missingOwner,
		}, {
			deleted: 102,
			entries: [],
			runs: [],
			acknowledged: runs.flatMap(run => run.sessions).sort(),
			missingOwner: [],
		});
	});

	test('receipts completed history deletion until the client acknowledges it', async () => {
		const automation = createAction().resource;
		const session = URI.parse('ahp-session:/receipted');
		const started = new DeferredPromise<void>();
		const creating = createService({
			allocateSession: async () => ({ session, provider: 'codex' }),
			createSession: async () => session,
			startSession: async () => { started.complete(); },
		});
		await enableAndCreate(creating);
		const run = await creating.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation, requestId: 'receipted-run' });
		await started.p;
		creating.dispose();
		const deleting = createService({
			getRecoverableSessionProvider: async (_session, provider) => provider,
			deleteSession: async () => { },
		});
		await terminalRun(run.resource);

		const first = await deleting.deleteAutomation(automation, true, [], 'delete-request');
		deleting.dispose();
		const retrying = createService();
		const retry = await retrying.deleteAutomation(automation, true, [], 'delete-request');
		await retrying.acknowledgeAutomationDeletion('delete-request');
		retrying.dispose();
		const acknowledged = createService();
		const afterAcknowledgement = await acknowledged.deleteAutomation(automation, true, [], 'delete-request');

		assert.deepStrictEqual({ first, retry, afterAcknowledgement }, {
			first: [session.toString()],
			retry: [session.toString()],
			afterAcknowledgement: [],
		});
	});

	test('merges concurrent deletion members and receipts every accepted request', async () => {
		const automation = createAction().resource;
		const run: AutomationRunState = {
			resource: 'ahp-automation-run:/concurrent-delete',
			automation,
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Completed, createdAt: new Date(0).toISOString(), startedAt: new Date(0).toISOString(), completedAt: new Date(0).toISOString() },
			sessions: ['ahp-session:/first'],
			primarySession: 'ahp-session:/first',
		};
		storageService.set('automations', {
			catalog: { automations: [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] },
			runs: [run],
			runProviders: { [run.resource]: 'codex' },
		});
		await storageService.whenIdle();
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		const deleted: string[] = [];
		const service = createService({
			getRecoverableSessionProvider: async (_session, provider) => provider ?? 'codex',
			deleteSession: async session => {
				if (session.toString() === 'ahp-session:/first') {
					firstStarted.complete();
					await releaseFirst.p;
				}
				deleted.push(session.toString());
			},
		});
		await service.handleConfigurationChanged();

		const first = service.deleteAutomation(automation, true, [], 'request-first');
		await firstStarted.p;
		const second = service.deleteAutomation(automation, true, [URI.parse('ahp-session:/second')], 'request-second');
		releaseFirst.complete();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		service.dispose();
		const restarted = createService();
		const firstReceipt = await restarted.deleteAutomation(automation, true, [], 'request-first');
		const secondReceipt = await restarted.deleteAutomation(automation, true, [], 'request-second');

		assert.deepStrictEqual({
			deleted,
			firstResult,
			secondResult,
			firstReceipt,
			secondReceipt,
		}, {
			deleted: ['ahp-session:/first', 'ahp-session:/second'],
			firstResult: ['ahp-session:/first', 'ahp-session:/second'],
			secondResult: ['ahp-session:/first', 'ahp-session:/second'],
			firstReceipt: ['ahp-session:/first', 'ahp-session:/second'],
			secondReceipt: ['ahp-session:/first', 'ahp-session:/second'],
		});
	});

	test('drains members added between an empty snapshot and completion', async () => {
		const automation = createAction().resource;
		const run: AutomationRunState = {
			resource: 'ahp-automation-run:/completion-race',
			automation,
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Completed, createdAt: new Date(0).toISOString(), startedAt: new Date(0).toISOString(), completedAt: new Date(0).toISOString() },
			sessions: ['ahp-session:/first'],
			primarySession: 'ahp-session:/first',
		};
		storageService.set('automations', {
			catalog: { automations: [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] },
			runs: [run],
			runProviders: { [run.resource]: 'codex' },
		});
		await storageService.whenIdle();
		const deleted: string[] = [];
		let injectMember = false;
		const service = createService({
			getRecoverableSessionProvider: async (_session, provider) => provider ?? 'codex',
			deleteSession: async session => {
				deleted.push(session.toString());
				if (session.toString() === 'ahp-session:/first') {
					injectMember = true;
				}
			},
		});
		await service.handleConfigurationChanged();
		const internal = service as unknown as {
			_enqueueMutation<T>(mutation: () => Promise<T>): Promise<T>;
		};
		const originalEnqueue = internal._enqueueMutation.bind(service);
		let second: Promise<readonly string[]> | undefined;
		const injected = new DeferredPromise<void>();
		internal._enqueueMutation = <T>(mutation: () => Promise<T>) => originalEnqueue(async () => {
			const result = await mutation();
			if (injectMember && Array.isArray(result) && result.length === 0) {
				injectMember = false;
				queueMicrotask(() => {
					second = service.deleteAutomation(automation, true, [URI.parse('ahp-session:/second')], 'request-second');
					injected.complete();
				});
			}
			return result;
		});

		const first = service.deleteAutomation(automation, true, [], 'request-first');
		await injected.p;
		const [firstResult, secondResult] = await Promise.all([first, second!]);

		assert.deepStrictEqual({
			deleted,
			firstResult,
			secondResult,
			entries: stateManager.getAutomationCatalogState()?.entries,
		}, {
			deleted: ['ahp-session:/first', 'ahp-session:/second'],
			firstResult: ['ahp-session:/first', 'ahp-session:/second'],
			secondResult: ['ahp-session:/first', 'ahp-session:/second'],
			entries: [],
		});
	});

	test('history deletion does not block unrelated Automation mutations', async () => {
		const automation = createAction().resource;
		const session = URI.parse('ahp-session:/slow-delete');
		const runStarted = new DeferredPromise<void>();
		const deletionStarted = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const creating = createService({
			allocateSession: async () => ({ session, provider: 'copilotcli' }),
			createSession: async () => session,
			startSession: async (createdSession, message) => {
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId: 'slow-delete-turn',
					startedAt: new Date().toISOString(),
					message,
				});
				runStarted.complete();
			},
		});
		await enableAndCreate(creating);
		const run = await creating.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation, requestId: 'delete-with-slow-provider' });
		await runStarted.p;
		creating.dispose();
		const service = createService({
			getRecoverableSessionProvider: async (_session, provider) => provider,
			deleteSession: async () => {
				deletionStarted.complete();
				await release.p;
			},
		});
		await terminalRun(run.resource);

		const deletion = service.deleteAutomation(automation, true);
		await deletionStarted.p;
		const unrelated = service.handleCreate(createAction('ahp-automation:/unrelated'));
		const winner = await raceTimeout(unrelated.then(() => 'created'), 50) ?? 'blocked';
		release.complete();
		await deletion;

		assert.deepStrictEqual({
			winner,
			automations: stateManager.getAutomationCatalogState()?.entries.map(entry => entry.resource),
		}, {
			winner: 'created',
			automations: ['ahp-automation:/unrelated'],
		});
	});

	test('coalesces repeated recovery signals while history deletion is in flight', async () => {
		const automation = createAction().resource;
		const firstAttempt = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		let attempts = 0;
		storageService.set('automations', {
			catalog: { automations: [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] },
			historyDeletions: [{ automation, sessions: [{ session: 'ahp-session:/retained', provider: 'codex' }] }],
		});
		await storageService.whenIdle();
		const service = createService({
			deleteSession: async () => {
				attempts++;
				firstAttempt.complete();
				await release.p;
				throw new Error('provider unavailable');
			},
		});
		await firstAttempt.p;

		service.handleAgentsChanged();
		service.handleAgentsChanged();
		service.handleAgentsChanged();
		release.complete();
		await (service as unknown as { _mutationTail: Promise<void> })._mutationTail;

		assert.strictEqual(attempts, 1);
	});

	test('publishes active history deletion state during automatic recovery', async () => {
		const automation = createAction().resource;
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		const secondStarted = new DeferredPromise<void>();
		const releaseSecond = new DeferredPromise<void>();
		let attempts = 0;
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automation,
					definition: definition(),
					runs: [],
					operations: [],
					createdAt: new Date(0).toISOString(),
					modifiedAt: new Date(0).toISOString(),
					_meta: withAgentHostAutomationHistoryState(undefined, 'deleting'),
				}],
			},
			historyDeletions: [{ automation, sessions: [{ session: 'ahp-session:/retained', provider: 'codex' }] }],
		});
		await storageService.whenIdle();
		const service = createService({
			deleteSession: async () => {
				attempts++;
				if (attempts === 1) {
					firstStarted.complete();
					await releaseFirst.p;
					throw new Error('provider unavailable');
				}
				secondStarted.complete();
				await releaseSecond.p;
			},
		});
		await firstStarted.p;
		const first = (service as unknown as { _historyDeletionPromises: Map<string, Promise<readonly string[]>> })._historyDeletionPromises.get(automation)!;
		releaseFirst.complete();
		await assert.rejects(first, /provider unavailable/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [AutomationOperation.Remove]);

		service.handleAgentsChanged();
		await secondStarted.p;
		const second = (service as unknown as { _historyDeletionPromises: Map<string, Promise<readonly string[]>> })._historyDeletionPromises.get(automation)!;
		assert.deepStrictEqual({
			state: getAgentHostAutomationHistoryState(stateManager.getAutomationCatalogState()!.entries[0]),
			operations: stateManager.getAutomationCatalogState()?.entries[0].operations,
		}, {
			state: 'deleting',
			operations: [],
		});
		releaseSecond.complete();
		await second;
	});

	for (const existingOwner of [false, true]) {
		test(`migrates retained provider identity with ${existingOwner ? 'an existing' : 'a missing'} owner`, async () => {
			const automation = createAction().resource;
			const run: AutomationRunState = {
				resource: 'ahp-automation-run:/legacy', automation,
				origin: { kind: AutomationRunOriginKind.Manual },
				lifecycle: { status: AutomationRunStatus.Completed, createdAt: new Date(0).toISOString(), startedAt: new Date(0).toISOString(), completedAt: new Date(0).toISOString() },
				primarySession: 'opaque:/unavailable', sessions: ['opaque:/unavailable', 'opaque:/retained'],
			};
			storageService.set('automations', {
				catalog: { automations: existingOwner ? [{ resource: automation, definition: definition(), runs: [], operations: [], createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString() }] : [] },
				runs: [run],
			});
			await storageService.whenIdle();
			const service = createService({
				getRecoverableSessionProvider: async session => {
					if (session.toString() === 'opaque:/unavailable') {
						throw new Error('optional lookup unavailable');
					}
					return 'codex';
				},
			});
			await service.handleConfigurationChanged();
			const owner = stateManager.getAutomationCatalogState()!.entries[0];
			assert.deepStrictEqual({
				providers: storageService.get<{ runProviders: Record<string, string> }>('automations')?.runProviders,
				origin: service.getLegacySessionOrigin('opaque:/retained', 'codex'),
				owner: { title: owner.definition.title, enabled: owner.definition.enabled, state: getAgentHostAutomationHistoryState(owner) },
			}, {
				providers: { [run.resource]: 'codex' },
				origin: { kind: SessionOriginKind.Automation, automation, run: run.resource },
				owner: existingOwner ? { title: 'Review changes', enabled: true, state: undefined } : { title: 'Deleted automation (name unavailable)', enabled: false, state: 'retained' },
			});
		});
	}

	test('persists resolved legacy deletion identity before deleting and isolates unsupported rows', async () => {
		const automation = createAction().resource;
		const observations: object[] = [];
		const service = createService({
			getRecoverableSessionProvider: async session => session.toString() === 'opaque:/supported' ? 'codex' : undefined,
			deleteSession: async (session, provider) => {
				observations.push({
					session: session.toString(), provider,
					intent: storageService.get<{ historyDeletions: { sessions: object[] }[] }>('automations')?.historyDeletions[0].sessions,
				});
			},
		});
		await enableAndCreate(service);
		await assert.rejects(service.deleteAutomation(automation, true, [URI.parse('opaque:/unsupported'), URI.parse('opaque:/supported')]), /Cannot resolve the persisted provider/);
		assert.deepStrictEqual({
			observations,
			remaining: storageService.get<{ historyDeletions: object[] }>('automations')?.historyDeletions,
		}, {
			observations: [{
				session: 'opaque:/supported', provider: 'codex',
				intent: [{ session: 'opaque:/unsupported' }, { session: 'opaque:/supported', provider: 'codex' }],
			}],
			remaining: [{ automation, sessions: [{ session: 'opaque:/unsupported' }], deletedSessions: ['opaque:/supported'] }],
		});
	});

	test('logs creation once after persistence, excluding retries and failed writes', async () => {
		const service = createService();
		const action = {
			...createAction(),
			definition: {
				...definition(),
				title: 'Private title',
				session: {
					provider: 'copilotcli',
					model: { id: 'catalog-model' },
					agent: { uri: 'file:///private/custom-agent.md' },
					workingDirectories: ['file:///private/repository'],
					config: { mode: 'plan', autoApprove: 'assisted', isolation: 'worktree', branch: 'private-branch', privateSetting: 'private value' },
				},
			},
		};
		writeFailures = 1;
		await assert.rejects(service.handleCreate(action), /storage unavailable/);
		assert.deepStrictEqual(telemetry.events, []);
		await service.handleCreate(action);
		await service.handleCreate(action);

		assert.deepStrictEqual(telemetry.events, [{
			name: 'automation.created',
			data: {
				automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
				provider: 'copilotcli',
				model: new TelemetryTrustedValue('catalog-model'),
				modelSelectionKind: 'explicit',
				mode: 'plan',
				permissionLevel: 'assisted',
				isolationMode: 'worktree',
				targetKind: 'workspace',
				folderCount: 1,
				hasCustomAgent: true,
				enabled: true,
				scheduleKind: 'manual',
			},
		}]);
	});

	test('records editable updates and deletion once without counting internal metadata or replays', async () => {
		const service = createService();
		const resource = 'ahp-automation:/review-changes';
		await enableAndCreate(service, resource);
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested, resource,
			changes: { _meta: { 'test.internal': true } },
		});
		const disable = { type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: false } } as const;
		await service.handleUpdate(disable);
		await service.handleUpdate(disable);
		const reconfigure = {
			type: ActionType.AutomationUpdateRequested,
			resource,
			changes: { session: { provider: 'copilotcli', model: { id: 'catalog-model' }, config: { mode: 'plan', autoApprove: 'assisted' } } },
		} as const;
		writeFailures = 1;
		await assert.rejects(service.handleUpdate(reconfigure), /storage unavailable/);
		await service.handleUpdate(reconfigure);
		const rename = { type: ActionType.AutomationUpdateRequested, resource, changes: { title: 'Private title' } } as const;
		await service.handleUpdate(rename);
		await service.handleUpdate(rename);
		writeFailures = 1;
		await assert.rejects(service.handleRemove({ type: ActionType.AutomationRemoved, resource }), /storage unavailable/);
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource });
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource });

		assert.deepStrictEqual(telemetry.events.map(event => ({
			name: event.name,
			id: event.data.automationId,
			enabled: event.data.enabled,
			enabledChanged: event.data.enabledChanged,
			sessionConfigurationChanged: event.data.sessionConfigurationChanged,
			scheduleChanged: event.data.scheduleChanged,
			promptChanged: event.data.promptChanged,
			titleChanged: event.data.titleChanged,
		})), [
			{ name: 'automation.created', id: hashAutomationTelemetryId(resource), enabled: true, enabledChanged: undefined, sessionConfigurationChanged: undefined, scheduleChanged: undefined, promptChanged: undefined, titleChanged: undefined },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: true, sessionConfigurationChanged: false, scheduleChanged: false, promptChanged: false, titleChanged: false },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: false, sessionConfigurationChanged: true, scheduleChanged: false, promptChanged: false, titleChanged: false },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: false, sessionConfigurationChanged: false, scheduleChanged: false, promptChanged: false, titleChanged: true },
			{ name: 'automation.deleted', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: undefined, sessionConfigurationChanged: undefined, scheduleChanged: undefined, promptChanged: undefined, titleChanged: undefined },
		]);
	});

	test('preserves distinct complete automation resources across definition and run telemetry', async () => {
		const service = createService();
		const resources = [
			'ahp-automation:/shared',
			'ahp-automation://first/shared',
			'ahp-automation://second/shared',
			'ahp-automation:/shared?first',
			'ahp-automation:/shared?second',
			'ahp-automation:/shared#first',
			'ahp-automation:/shared#second',
		];
		for (const resource of resources) {
			await service.handleCreate(createAction(resource));
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: resource, requestId: resource });
			await terminalRun(run.resource);
			await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: false } });
			await service.handleRemove({ type: ActionType.AutomationRemoved, resource });
		}

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, automationId: event.data.automationId })), resources.flatMap(resource =>
			['automation.created', 'automation.runCreated', 'automation.runCompleted', 'automation.updated', 'automation.deleted'].map(name => ({
				name,
				automationId: hashAutomationTelemetryId(resource),
			}))
		));
	});

	test('redacts unknown models and provider configuration while retaining safe model selections', async () => {
		const service = createService();
		for (const model of [undefined, 'auto', 'private-byok-model', '/private/custom-model']) {
			await service.handleCreate({
				...createAction(`ahp-automation:/${generateUuid()}`),
				definition: {
					...definition(),
					session: {
						model: model ? { id: model } : undefined,
						config: { mode: '/private/custom-mode', autoApprove: 'Private policy text', branch: 'private-branch' },
					},
				},
			});
		}
		assert.deepStrictEqual(telemetry.events.map(event => ({
			provider: event.data.provider,
			model: event.data.model,
			selection: event.data.modelSelectionKind,
			mode: event.data.mode,
			permissionLevel: event.data.permissionLevel,
			isolation: event.data.isolationMode,
		})), [
			{ provider: 'default', model: undefined, selection: 'default', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: new TelemetryTrustedValue('auto'), selection: 'auto', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: 'byokModel', selection: 'explicit', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: 'unknown', selection: 'explicit', mode: 'other', permissionLevel: 'other', isolation: 'none' },
		]);
	});

	test('records a durable run claim before session creation settles and does not replay it', async () => {
		const release = new DeferredPromise<URI>();
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => release.p,
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: { ...definition(), session: { provider: 'copilotcli', config: { mode: 'plan' } } },
		});
		const request: RunAutomationParams = { channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'claim' };
		const run = await service.runAutomation(request);
		await service.runAutomation(request);
		await service.runAutomation({ ...request, requestId: 'overlap' });

		assert.deepStrictEqual(telemetry.events.filter(event => event.name !== 'automation.created').map(event => event.data), [{
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(run.resource),
			trigger: 'manual',
			runCreatedAt: stateManager.getAutomationRunState(run.resource)?.lifecycle.createdAt,
			provider: 'copilotcli',
			agentSessionId: undefined,
			sessionCreated: false,
			model: undefined,
			modelSelectionKind: 'default',
			mode: 'plan',
			permissionLevel: 'providerDefault',
			isolationMode: 'none',
			targetKind: 'quickChat',
			folderCount: 0,
			hasCustomAgent: false,
		}]);
		await release.complete(URI.parse('copilotcli:/claimed-session'));
		await started.p;
		assert.deepStrictEqual(telemetry.events.map(event => event.name), ['automation.created', 'automation.runCreated', 'automation.runStarted']);
	});

	test('joins runs to existing Agent Host session telemetry without changing or duplicating it', async () => {
		const session = URI.parse('copilotcli:/business-session');
		const started = new DeferredPromise<void>();
		const reporter = new AgentHostTelemetryReporter(telemetry);
		const service = createService({
			createSession: async () => session,
			startSession: async (_, message) => {
				reporter.userMessageSent(
					'copilotcli', undefined, createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
					session.toString(), session.toString(), 'first-turn', undefined, 'direct', message, false, false,
				);
				await started.complete();
			},
		});
		await service.handleCreate({ ...createAction(), definition: { ...definition(), session: {} } });
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'business-run' });
		await started.p;

		const starts = telemetry.events.filter(event => event.name === 'automation.runStarted');
		const messages = telemetry.events.filter(event => event.name === 'agentHost.userMessageSent');
		assert.deepStrictEqual({
			events: telemetry.events.map(event => event.name),
			savedProviders: telemetry.events.filter(event => event.name === 'automation.created' || event.name === 'automation.runCreated').map(event => event.data.provider),
			runSession: starts.map(event => ({ provider: event.data.provider, agentSessionId: event.data.agentSessionId })),
			messageSession: messages.map(event => ({ provider: event.data.provider, agentSessionId: event.data.agentSessionId })),
			origins: messages.map(event => event.data.messageOriginKind),
			legacyFields: starts.flatMap(event => Object.keys(event.data).filter(key => key === 'executionAuthority' || key === 'agentsWindowSessionId' || key === 'sessionProvider')),
		}, {
			events: ['automation.created', 'automation.runCreated', 'automation.runStarted', 'agentHost.userMessageSent'],
			savedProviders: ['default', 'default'],
			runSession: [{ provider: 'copilotcli', agentSessionId: 'business-session' }],
			messageSession: [{ provider: 'copilotcli', agentSessionId: 'business-session' }],
			origins: ['automation'],
			legacyFields: [],
		});
	});

	for (const { provider, telemetryProvider, scheme } of [
		['copilotcli', 'copilotcli'], ['copilot', 'copilot'], ['claude', 'claude'], ['codex', 'codex'],
		['copilot-cloud-agent', 'copilot-cloud'], ['openai-codex', 'codex'], ['custom-provider', 'other'],
	].flatMap(([provider, telemetryProvider]) => [provider, 'ahp-session'].map(scheme => ({ provider, telemetryProvider, scheme })))) {
		test(`run telemetry preserves ${provider} after ${scheme} primary session is removed`, async () => {
			const session = AgentSession.uri(scheme, 'removed-session');
			const defaultChat = buildDefaultChatUri(session);
			const started = new DeferredPromise<void>();
			stateManager.createSession({
				resource: session.toString(), provider, title: '',
				status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
				defaultChat: buildDefaultChatUri(session.toString()),
			});
			const service = createService({
				allocateSession: async () => ({ session, provider }),
				createSession: async () => session,
				startSession: async () => {
					stateManager.addChat(session.toString(), defaultChat, creationTimeChatStorageResource(session.toString(), defaultChat, buildDefaultChatUri(session.toString())));
					stateManager.dispatchServerAction(defaultChat, {
						type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(),
						message: { text: 'Review changes', origin: { kind: MessageKind.Automation } },
					});
					await started.complete();
				},
				cancelSession: async () => {
					stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatTurnCancelled, turnId: 'turn', duration: 0 });
					return true;
				},
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'removal-race' });
			await started.p;

			stateManager.removeSession(session.toString());
			assert.strictEqual(stateManager.getSessionSummary(session.toString()), undefined, 'session summary should be gone');

			const completed = terminalRun(run.resource);
			await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
			await completed;

			const completedEvents = telemetry.events.filter(event => event.name === 'automation.runCompleted');
			assert.deepStrictEqual({
				completed: completedEvents.map(event => ({
					provider: event.data.provider,
					agentSessionId: event.data.agentSessionId,
				})),
				storedProviders: storageService.get<{ runProviders?: Record<string, string> }>('automations')?.runProviders,
				runMeta: stateManager.getAutomationRunState(run.resource)?._meta,
				summaryMeta: stateManager.getAutomationCatalogState()?.entries[0].runs[0]._meta,
			}, {
				completed: [{ provider: telemetryProvider, agentSessionId: 'removed-session' }],
				storedProviders: { [run.resource]: provider },
				runMeta: undefined,
				summaryMeta: undefined,
			});
		});
	}

	test('logs pre-session failure once without inventing a run-start or session identifier', async () => {
		const service = createService({ createSession: async () => { throw new Error('/private/startup-error'); } });
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'failed-start' });
		await terminalRun(run.resource);
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'failed-start' });

		assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => ({
			name: event.name,
			...event.data,
			durationMs: Number(event.data.durationMs) >= 0,
		})), [{
			name: 'automation.runCompleted',
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(run.resource),
			trigger: 'manual',
			runCreatedAt: stateManager.getAutomationRunState(run.resource)?.lifecycle.createdAt,
			provider: 'default',
			agentSessionId: undefined,
			sessionCreated: false,
			outcome: 'error',
			durationMs: true,
		}]);
		assert.deepStrictEqual(telemetry.events.map(event => event.name), ['automation.created', 'automation.runCreated', 'automation.runCompleted']);
	});

	test('a future host automation storage version disables the capability without rewriting data', async () => {
		storageService.set('automations', {
			version: 2,
			catalog: { automations: [] },
		});
		await storageService.whenIdle();
		const service = createService();

		await assert.rejects(service.handleCreate(createAction()), /storage is unavailable/);
		assert.deepStrictEqual({
			isAvailable: service.isAvailable,
			capabilities: service.capabilities,
			storedVersion: storageService.get<{ version: number }>('automations')?.version,
		}, {
			isAvailable: false,
			capabilities: undefined,
			storedVersion: 2,
		});
	});

	for (const { name, runProviders } of [
		{ name: 'null', runProviders: null },
		{ name: 'array', runProviders: [] },
		{ name: 'non-string', runProviders: { run: 1 } },
		{ name: 'empty provider', runProviders: { run: '' } },
	]) {
		test(`rejects ${name} run-provider storage without rewriting it`, async () => {
			const stored = { version: 1, catalog: { automations: [] }, runProviders };
			storageService.set('automations', stored);
			await storageService.whenIdle();
			const service = createService();

			assert.deepStrictEqual({
				isAvailable: service.isAvailable,
				capabilities: service.capabilities,
				stored: storageService.get('automations'),
			}, {
				isAvailable: false,
				capabilities: undefined,
				stored,
			});
		});
	}

	test('version 1 automation storage maps automations to protocol entries', async () => {
		const resource = 'ahp-automation:/review-changes';
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource,
					definition: definition(),
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove],
					createdAt: '2026-01-01T00:00:00.000Z',
					modifiedAt: '2026-01-01T00:00:00.000Z',
				}],
			},
		});
		await storageService.whenIdle();
		const service = createService();

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries.map(entry => entry.resource), [resource]);
		assert.deepStrictEqual(await service.listTriggerDefinitions({ channel: ROOT_STATE_URI }), { items: [] });
		const stored = storageService.get<{ version: number; catalog: { entries?: unknown[]; automations?: unknown[] } }>('automations');
		assert.deepStrictEqual({
			version: stored?.version,
			automationCount: stored?.catalog.automations?.length,
			hasEntries: Object.hasOwn(stored?.catalog ?? {}, 'entries'),
		}, {
			version: 1,
			automationCount: 1,
			hasEntries: false,
		});
	});

	test('obsolete migration flags cannot keep a restored host inactive', async () => {
		const resource = 'ahp-automation:/restored';
		const savedDefinition = { ...definition(), _meta: { 'vscode.legacyAutomationImportPending': true } };
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource,
					definition: savedDefinition,
					runs: [],
					operations: [AutomationOperation.Update],
					createdAt: '2026-01-01T00:00:00Z',
					modifiedAt: '2026-01-01T00:00:00Z',
				}],
				_meta: { 'vscode.migrationCompleted': false },
			},
		});
		await storageService.whenIdle();
		const service = createService();
		assert.deepStrictEqual({
			capabilities: service.capabilities,
			triggers: await service.listTriggerDefinitions({ channel: ROOT_STATE_URI }),
			definition: stateManager.getAutomationCatalogState()?.entries[0].definition,
			operations: stateManager.getAutomationCatalogState()?.entries[0].operations,
		}, {
			capabilities: { create: {}, schedules: {}, customizations: {}, runCancellation: {}, runHistoryLimit: 50 },
			triggers: { items: [] },
			definition: savedDefinition,
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
		});
	});

	test('migrates stored Copilot Autopilot configurations into the current Automation shape', async () => {
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [
					{
						resource: 'ahp-automation:/legacy-autopilot',
						definition: {
							...definition(),
							session: {
								provider: 'copilotcli',
								config: { [SessionConfigKey.AutoApprove]: 'autopilot' },
							},
						},
						runs: [],
						operations: [AutomationOperation.Update, AutomationOperation.Remove],
						createdAt: '2026-01-01T00:00:00.000Z',
						modifiedAt: '2026-01-01T00:00:00.000Z',
					},
					{
						resource: 'ahp-automation:/hotfix-window',
						definition: {
							...definition(),
							session: {
								config: {
									[SessionConfigKey.Mode]: 'agent',
									[SessionConfigKey.AutoApprove]: 'assisted',
								},
							},
						},
						runs: [],
						operations: [AutomationOperation.Update, AutomationOperation.Remove],
						createdAt: '2026-01-01T00:00:00.000Z',
						modifiedAt: '2026-01-01T00:00:00.000Z',
					},
				],
			},
		});
		await storageService.whenIdle();

		createService();

		assert.deepStrictEqual(
			stateManager.getAutomationCatalogState()?.entries.map(automation => automation.definition.session.config),
			[
				{ mode: 'autopilot', autoApprove: 'assisted' },
				{ mode: 'autopilot', autoApprove: 'assisted' },
			],
		);
	});

	test('failed catalogue persistence publishes nothing and a retry creates one entry', async () => {
		const service = createService();
		writeFailures = 1;

		await assert.rejects(service.handleCreate(createAction()), /storage unavailable/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState(), {
			entries: [],
		});

		await service.handleCreate(createAction());

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries.map(automation => ({
			resource: automation.resource,
			operations: automation.operations,
		})), [{
			resource: 'ahp-automation:/review-changes',
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
		}]);
	});

	test('feature disablement removes run permission and blocks execution in the host', async () => {
		const service = createService();
		await enableAndCreate(service);
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: false },
		});
		await service.handleConfigurationChanged();

		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'disabled-request',
		}), /Automations are disabled/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
		]);

		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		await service.handleConfigurationChanged();
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
			AutomationOperation.Run,
		]);
	});

	test('manual run is durable, idempotent, linked before send, and completed from chat state', async () => {
		const session = URI.parse('mock:/automation-session');
		const started = new DeferredPromise<{ readonly turnId: string }>();
		let createCalls = 0;
		let startedMessageKind: MessageKind | undefined;
		const service = createService({
			createSession: async () => {
				createCalls++;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async (createdSession, message) => {
				const turnId = 'automation-turn';
				startedMessageKind = message.origin.kind;
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId,
					startedAt: new Date().toISOString(),
					message,
				});
				await started.complete({ turnId });
			},
		});
		await enableAndCreate(service);

		const params = {
			channel: 'ahp-automations://' as const,
			automation: 'ahp-automation:/review-changes',
			requestId: 'manual-request',
		};
		const first = await service.runAutomation(params);
		const second = await service.runAutomation(params);
		const concurrent = await service.runAutomation({ ...params, requestId: 'concurrent-request' });
		const { turnId } = await started.p;

		const running = stateManager.getAutomationRunState(first.resource);
		assert.deepStrictEqual({
			first,
			second,
			concurrent,
			createCalls,
			status: running?.lifecycle.status,
			sessions: running?.sessions,
			primarySession: running?.primarySession,
			catalogRuns: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			startedMessageKind,
		}, {
			first: second,
			second,
			concurrent: second,
			createCalls: 1,
			status: AutomationRunStatus.Running,
			sessions: [session.toString()],
			primarySession: session.toString(),
			catalogRuns: 1,
			startedMessageKind: MessageKind.Automation,
		});

		const completed = new DeferredPromise<void>();
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === first.resource
				&& envelope.action.type === ActionType.AutomationRunLifecycleChanged
				&& envelope.action.lifecycle.status === AutomationRunStatus.Completed) {
				void completed.complete();
			}
		}));
		stateManager.dispatchServerAction(buildDefaultChatUri(session), {
			type: ActionType.ChatTurnComplete,
			turnId,
			duration: 10,
		});
		await completed.p;

		assert.deepStrictEqual({
			run: stateManager.getAutomationRunState(first.resource)?.lifecycle.status,
			summary: stateManager.getAutomationCatalogState()?.entries[0].runs[0].lifecycle.status,
		}, {
			run: AutomationRunStatus.Completed,
			summary: AutomationRunStatus.Completed,
		});
		stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnComplete, turnId, duration: 10 });
		await service.fetchAutomationRuns({ channel: 'ahp-automations://', automation: params.automation });
		assert.deepStrictEqual(telemetry.events.filter(event => event.name !== 'automation.created').map(event => ({
			name: event.name,
			automationId: event.data.automationId,
			runId: event.data.runId,
			agentSessionId: event.data.agentSessionId,
			sessionCreated: event.data.sessionCreated,
			outcome: event.data.outcome,
		})), ['automation.runCreated', 'automation.runStarted', 'automation.runCompleted'].map(name => ({
			name,
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(first.resource),
			agentSessionId: name === 'automation.runCreated' ? undefined : 'automation-session',
			sessionCreated: name !== 'automation.runCreated',
			outcome: name === 'automation.runCompleted' ? 'success' : undefined,
		})));
	});

	for (const hasMessageModel of [false, true]) {
		test(hasMessageModel ? 'preserves an explicit Automation message model' : 'records the Automation model configuration on its first turn', async () => {
			const session = URI.parse('mock:/model-configuration-run');
			const model = { id: 'mock-model', config: { thinkingLevel: 'low', contextSize: 272_000 } };
			const messageModel = hasMessageModel ? { id: 'other-model', config: { thinkingLevel: 'high' } } : undefined;
			const completed = new DeferredPromise<void>();
			let createdModel: AutomationDefinition['session']['model'];
			const readinessModels: AutomationDefinition['session']['model'][] = [];
			disposables.add(stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.AutomationRunLifecycleChanged && envelope.action.lifecycle.status === AutomationRunStatus.Completed) {
					void completed.complete();
				}
			}));
			const service = createService({
				isSessionTemplateAvailable: template => {
					readinessModels.push(template.model);
					return true;
				},
				createSession: async template => {
					createdModel = template.model;
					stateManager.createSession({
						resource: session.toString(),
						provider: 'mock',
						title: '',
						status: SessionStatus.Idle,
						createdAt: new Date().toISOString(),
						modifiedAt: new Date().toISOString(),
						defaultChat: buildDefaultChatUri(session.toString()),
					});
					return session;
				},
				startSession: async (createdSession, message) => {
					const chat = buildDefaultChatUri(createdSession);
					stateManager.dispatchServerAction(chat, {
						type: ActionType.ChatTurnStarted,
						turnId: 'model-configuration-turn',
						startedAt: new Date().toISOString(),
						message,
					});
					stateManager.dispatchServerAction(chat, {
						type: ActionType.ChatTurnComplete,
						turnId: 'model-configuration-turn',
						duration: 0,
					});
				},
			});
			const automation = definition();
			automation.session.model = model;
			if (messageModel) {
				automation.message.model = messageModel;
			}
			await service.handleCreate({ ...createAction(), definition: automation });
			await service.runAutomation({
				channel: 'ahp-automations://',
				automation: 'ahp-automation:/review-changes',
				requestId: 'model-configuration-request',
			});
			await completed.p;

			assert.deepStrictEqual({
				createdModel,
				readinessModelsMatch: readinessModels.length > 0 && readinessModels.every(checkedModel => checkedModel === (messageModel ?? model)),
				recordedModel: stateManager.getChatState(buildDefaultChatUri(session))?.turns[0]?.message.model,
				savedModel: stateManager.getAutomationCatalogState()?.entries[0].definition.session.model,
			}, {
				createdModel: messageModel ?? model,
				readinessModelsMatch: true,
				recordedModel: messageModel ?? model,
				savedModel: model,
			});
		});
	}

	for (const scheduled of [false, true]) {
		test(`uses a message-only model for ${scheduled ? 'scheduled' : 'manual'} execution readiness`, () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const model = { id: 'byok-model', config: { thinkingLevel: 'high' } };
			const started = new DeferredPromise<void>();
			let createdModel: AutomationDefinition['session']['model'];
			let sentModel: AutomationDefinition['message']['model'];
			const service = createService({
				isSessionTemplateAvailable: template => template.model?.id === model.id,
				createSession: async template => {
					createdModel = template.model;
					return URI.parse('mock:/byok-automation');
				},
				startSession: async (_session, message) => {
					sentModel = message.model;
					await started.complete();
				},
			});
			const automation = definition();
			automation.message.model = model;
			if (scheduled) {
				automation.triggers = [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }];
			}
			await service.handleCreate({ ...createAction(), definition: automation });
			if (!scheduled) {
				await service.runAutomation({
					channel: 'ahp-automations://',
					automation: 'ahp-automation:/review-changes',
					requestId: 'message-model-request',
				});
			}
			await started.p;
			assert.deepStrictEqual({
				createdModel,
				sentModel,
				savedSessionModel: stateManager.getAutomationCatalogState()?.entries[0].definition.session.model,
			}, { createdModel: model, sentModel: model, savedSessionModel: undefined });
		}));
	}

	test('logs the saved run configuration despite an edit while the session is being created', async () => {
		const session = URI.parse('copilotcli:/configured-session');
		const started = new DeferredPromise<void>();
		const createStarted = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => {
				await createStarted.complete();
				await release.p;
				return session;
			},
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: { ...definition(), session: { provider: 'copilotcli', model: { id: 'catalog-model' }, config: { mode: 'plan', autoApprove: 'assisted' } } },
		});
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'config-snapshot' });
		await createStarted.p;
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/review-changes',
			changes: { session: { provider: 'codex', config: { mode: 'autopilot', autoApprove: 'autoApprove' } } },
		});
		await release.complete();
		await started.p;

		assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runStarted').map(event => ({
			provider: event.data.provider,
			model: event.data.model,
			modelSelectionKind: event.data.modelSelectionKind,
			mode: event.data.mode,
			permissionLevel: event.data.permissionLevel,
			targetKind: event.data.targetKind,
			folderCount: event.data.folderCount,
			isolationMode: event.data.isolationMode,
			agentSessionId: event.data.agentSessionId,
		})), [{
			provider: 'copilotcli',
			model: new TelemetryTrustedValue('catalog-model'),
			modelSelectionKind: 'explicit',
			mode: 'plan',
			permissionLevel: 'assisted',
			targetKind: 'quickChat',
			folderCount: 0,
			isolationMode: 'none',
			agentSessionId: 'configured-session',
		}]);
	});

	for (const { scheme, hasSnapshot } of [
		{ scheme: 'copilotcli', hasSnapshot: true },
		{ scheme: 'ahp-session', hasSnapshot: true },
		{ scheme: 'copilotcli', hasSnapshot: false },
	]) {
		test(`logs interruption once on restart with the previously linked ${scheme} session (${hasSnapshot ? 'snapshot' : 'legacy storage'})`, async () => {
			const session = AgentSession.uri(scheme, 'interrupted-session');
			const started = new DeferredPromise<void>();
			const service = createService({
				allocateSession: async () => ({ session, provider: 'copilotcli' }),
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'copilotcli', title: '',
						status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
						defaultChat: buildDefaultChatUri(session.toString()),
					});
					return session;
				},
				startSession: async () => { await started.complete(); },
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'restart' });
			await started.p;
			service.dispose();
			if (!hasSnapshot) {
				const { runProviders, ...stored } = storageService.get<{ runProviders?: Record<string, string> }>('automations')!;
				assert.ok(runProviders);
				storageService.set('automations', stored);
				await storageService.whenIdle();
			}
			stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			stateManager.dispatchServerAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
			});
			createService({ getRecoverableSessionProvider: async resource => resource.toString() === session.toString() ? 'copilotcli' : undefined });
			await terminalRun(run.resource);
			createService();
			await storageService.whenIdle();

			assert.deepStrictEqual(telemetry.events.map(event => ({
				name: event.name, outcome: event.data.outcome, session: event.data.agentSessionId, provider: event.data.provider,
			})), [
				{ name: 'automation.created', outcome: undefined, session: undefined, provider: 'other' },
				{ name: 'automation.runCreated', outcome: undefined, session: undefined, provider: 'other' },
				{ name: 'automation.runStarted', outcome: undefined, session: 'interrupted-session', provider: 'copilotcli' },
				{ name: 'automation.runCompleted', outcome: 'interrupted', session: 'interrupted-session', provider: 'copilotcli' },
			]);
		});
	}

	for (const { scheme, outcome } of ['copilotcli', 'ahp-session'].flatMap(scheme =>
		(['success', 'error', 'cancelled'] as const).map(outcome => ({ scheme, outcome })))) {
		test(`records ${scheme} linked-session ${outcome} after session removal without error content`, () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
			const session = AgentSession.uri(scheme, `${outcome}-session`);
			const started = new DeferredPromise<void>();
			const service = createService({
				allocateSession: async () => ({ session, provider: 'copilotcli' }),
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'copilotcli', title: '', status: SessionStatus.Idle,
						createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
						defaultChat: buildDefaultChatUri(session.toString()),
					});
					return session;
				},
				startSession: async (_, message) => {
					stateManager.dispatchServerAction(buildDefaultChatUri(session), {
						type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(), message,
					});
					await started.complete();
				},
				cancelSession: async () => {
					if (outcome === 'success') {
						stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnComplete, turnId: 'turn', duration: 0 });
					} else {
						stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnCancelled, turnId: 'turn', duration: 0 });
					}
					stateManager.removeSession(session.toString());
					return true;
				},
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: outcome });
			await started.p;
			const completed = terminalRun(run.resource);
			if (outcome === 'error') {
				stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatError, turnId: 'turn', duration: 0,
					part: { kind: ResponsePartKind.Error, error: { errorType: 'providerError', message: 'Private error /private/repository' } },
				});
			} else if (outcome === 'cancelled' || outcome === 'success') {
				await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
			}
			stateManager.removeSession(session.toString());
			await completed;

			assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => event.data), [{
				automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
				runId: AgentSession.id(run.resource),
				trigger: 'manual',
				runCreatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
				provider: 'copilotcli',
				agentSessionId: `${outcome}-session`,
				sessionCreated: true,
				outcome,
				durationMs: 0,
			}]);
		}));
	}

	test('failed session-link persistence recovers durable identity without sending or run-start telemetry', async () => {
		let startCalls = 0;
		const service = createService({
			allocateSession: async () => ({ session: URI.parse('ahp-session:/failed-link'), provider: 'copilotcli' }),
			createSession: async () => {
				const session = 'ahp-session:/failed-link';
				stateManager.createSession({
					resource: session, provider: 'copilotcli', title: '', status: SessionStatus.Idle,
					createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session),
				});
				writeFailures = 1;
				return URI.parse(session);
			},
			startSession: async () => { startCalls++; },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({
			channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'failed-link',
		});
		await terminalRun(run.resource);

		assert.deepStrictEqual({
			startCalls,
			providers: storageService.get<{ runProviders?: Record<string, string> }>('automations')?.runProviders,
			started: telemetry.events.filter(event => event.name === 'automation.runStarted'),
			completed: telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => ({
				provider: event.data.provider, sessionCreated: event.data.sessionCreated, outcome: event.data.outcome,
			})),
		}, {
			startCalls: 0,
			providers: { [run.resource]: 'copilotcli' },
			started: [],
			completed: [{ provider: 'copilotcli', sessionCreated: true, outcome: 'error' }],
		});
	});

	test('run persistence failure prevents session side effects', async () => {
		let createCalls = 0;
		const service = createService({
			createSession: async () => {
				createCalls++;
				return URI.parse('mock:/unexpected');
			},
		});
		await enableAndCreate(service);
		writeFailures = 1;

		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'failed-request',
		}), /storage unavailable/);

		assert.deepStrictEqual({
			createCalls,
			runs: stateManager.getAutomationCatalogState()?.entries[0].runs,
		}, {
			createCalls: 0,
			runs: [],
		});
	});

	test('a cancelled pending run never executes when its provider later registers', async () => {
		let available = false;
		let createCalls = 0;
		let startCalls = 0;
		const service = createService({
			isSessionTemplateAvailable: () => available,
			createSession: async () => { createCalls++; return URI.parse('mock:/unexpected'); },
			startSession: async () => { startCalls++; },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-before-provider',
		});
		await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
		available = true;
		service.handleAgentsChanged();
		await timeout(0);
		assert.deepStrictEqual({
			createCalls,
			startCalls,
			status: stateManager.getAutomationRunState(run.resource)?.lifecycle.status,
		}, { createCalls: 0, startCalls: 0, status: AutomationRunStatus.Cancelled });
	});

	test('pending execution waits for provider registration', async () => {
		let available = false;
		let createCalls = 0;
		const started = new DeferredPromise<void>();
		const session = URI.parse('mock:/deferred-session');
		const service = createService({
			isSessionTemplateAvailable: () => available,
			createSession: async () => {
				createCalls++;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await enableAndCreate(service);

		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'deferred-request',
		});
		await Promise.resolve();
		assert.deepStrictEqual({
			createCalls,
			status: stateManager.getAutomationRunState(result.resource)?.lifecycle.status,
		}, {
			createCalls: 0,
			status: AutomationRunStatus.Pending,
		});

		available = true;
		service.handleAgentsChanged();
		await started.p;
		assert.deepStrictEqual({
			createCalls,
			status: stateManager.getAutomationRunState(result.resource)?.lifecycle.status,
		}, {
			createCalls: 1,
			status: AutomationRunStatus.Running,
		});
	});

	test('scheduled occurrences start independently while an earlier run is still active', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
		const started = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		let createCalls = 0;
		let startCalls = 0;
		let cancelCalls = 0;
		const service = createService({
			createSession: async () => {
				const session = URI.parse(`mock:/hourly-${++createCalls}`);
				stateManager.createSession({
					resource: session.toString(), provider: 'mock', title: '', status: SessionStatus.Idle,
					createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async (session, message) => {
				// The turn never finishes, like a turn suspended while the machine sleeps.
				stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatTurnStarted, turnId: 'hung-turn', startedAt: new Date().toISOString(), message,
				});
				await started[startCalls++].complete();
			},
			cancelSession: async () => {
				cancelCalls++;
				return false;
			},
		});
		await service.handleCreate({
			...createAction(),
			definition: {
				...definition(),
				triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
			},
		});
		await started[0].p;
		await started[1].p;
		const manualRun = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'while-overlapping',
		});

		assert.deepStrictEqual({
			runs: stateManager.getAutomationCatalogState()?.entries[0].runs.map(run => ({
				status: run.lifecycle.status,
				scheduledFor: run.origin.kind === AutomationRunOriginKind.Trigger ? run.origin.scheduledFor : undefined,
				primarySession: run.primarySession,
			})),
			manualRunReusesNewest: manualRun.resource === stateManager.getAutomationCatalogState()?.entries[0].runs[0].resource,
			cancelCalls,
			completedRuns: telemetry.events.filter(event => event.name === 'automation.runCompleted').length,
		}, {
			runs: [
				{ status: AutomationRunStatus.Running, scheduledFor: '2026-01-01T02:00:00.000Z', primarySession: 'mock:/hourly-2' },
				{ status: AutomationRunStatus.Running, scheduledFor: '2026-01-01T01:00:00.000Z', primarySession: 'mock:/hourly-1' },
			],
			manualRunReusesNewest: true,
			cancelCalls: 0,
			completedRuns: 0,
		});
	}));

	for (const emitNotification of [true, false]) {
		// A provisional session is never announced to clients, so deleting it emits no `SessionRemoved`.
		test(`deleting the ${emitNotification ? 'published' : 'provisional'} session of an active run cancels the run`, async () => {
			const session = URI.parse('mock:/deleted-session');
			const started = new DeferredPromise<void>();
			let cancelCalls = 0;
			const service = createService({
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '', status: SessionStatus.Idle,
						createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
						defaultChat: buildDefaultChatUri(session.toString()),
					}, { emitNotification });
					return session;
				},
				startSession: async (createdSession, message) => {
					stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
						type: ActionType.ChatTurnStarted, turnId: 'deleted-turn', startedAt: new Date().toISOString(), message,
					});
					await started.complete();
				},
				cancelSession: async () => {
					cancelCalls++;
					return false;
				},
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({
				channel: 'ahp-automations://',
				automation: 'ahp-automation:/review-changes',
				requestId: 'deleted-session',
			});
			await started.p;
			const completed = terminalRun(run.resource);

			stateManager.deleteSession(session.toString());
			await completed;

			assert.deepStrictEqual({
				status: stateManager.getAutomationRunState(run.resource)?.lifecycle.status,
				removeAvailable: stateManager.getAutomationCatalogState()?.entries[0].operations.includes(AutomationOperation.Remove),
				outcomes: telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => event.data.outcome),
				cancelCalls,
			}, {
				status: AutomationRunStatus.Cancelled,
				removeAvailable: true,
				outcomes: ['cancelled'],
				cancelCalls: 0,
			});
		});
	}

	for (const { name, sleep, then, expected } of [
		{
			name: 'fails a run when its turn fails while the machine stays awake',
			sleep: 'none', then: undefined,
			expected: { afterFailure: AutomationRunStatus.Failed, resumedTurns: [], status: AutomationRunStatus.Failed },
		},
		{
			name: 'resumes a turn that fails after a sleep once the machine is fully awake',
			sleep: 'beforeFailure', then: 'complete',
			expected: { afterFailure: AutomationRunStatus.Running, resumedTurns: ['turn'], status: AutomationRunStatus.Completed },
		},
		{
			name: 'fails a run when its turn fails again after resuming on wake',
			sleep: 'throughFailure', then: 'error',
			expected: { afterFailure: AutomationRunStatus.Running, resumedTurns: ['turn'], status: AutomationRunStatus.Failed },
		},
		{
			name: 'cancels a run that is waiting to resume after a wake',
			sleep: 'throughFailure', then: 'cancel',
			expected: { afterFailure: AutomationRunStatus.Running, resumedTurns: [], status: AutomationRunStatus.Cancelled },
		},
		{
			name: 'fails a run when its turn fails again after the user resumes it before the retry after wake',
			sleep: 'throughFailure', then: 'userResume',
			expected: { afterFailure: AutomationRunStatus.Running, resumedTurns: [], status: AutomationRunStatus.Failed },
		},
	] as const) {
		test(name, () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const session = URI.parse('mock:/sleeping-session');
			const chat = buildDefaultChatUri(session);
			const started = new DeferredPromise<void>();
			const resumedTurns: string[] = [];
			const service = createService({
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '', status: SessionStatus.Idle,
						createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
						defaultChat: chat,
					});
					return session;
				},
				startSession: async (_session, message) => {
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(), message });
					await started.complete();
				},
				resumeTurn: async (_session, turnId) => {
					resumedTurns.push(turnId);
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnResume, turnId });
					return true;
				},
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: name });
			await started.p;
			const failTurn = () => stateManager.dispatchServerAction(chat, {
				type: ActionType.ChatError, turnId: 'turn', duration: 0,
				part: { kind: ResponsePartKind.Error, error: { errorType: 'query', message: 'Connection reset' }, resumable: true },
			});

			if (sleep !== 'none') {
				systemWake.setFullyAwake(false);
			}
			if (sleep === 'beforeFailure') {
				systemWake.setFullyAwake(true);
			}
			failTurn();
			await timeout(1_000);
			const afterFailure = stateManager.getAutomationRunState(run.resource)?.lifecycle.status;
			if (then === 'cancel') {
				await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
			} else if (then === 'userResume') {
				// The user clicks Try Again before the host's own retry, and the turn fails again.
				systemWake.setFullyAwake(true);
				stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnResume, turnId: 'turn' });
				failTurn();
			} else if (then) {
				systemWake.setFullyAwake(true);
				await timeout(60_000);
				if (then === 'complete') {
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId: 'turn', duration: 0 });
				} else {
					failTurn();
				}
			}
			// Outlasts any retry after wake, so a run that never ends fails the assertion instead of hanging the test.
			await timeout(60_000);

			assert.deepStrictEqual({
				afterFailure,
				resumedTurns,
				status: stateManager.getAutomationRunState(run.resource)?.lifecycle.status,
			}, expected);
		}));
	}

	for (const { name, failAfterWakeMs, resumedAfterWakeMs } of [
		{
			name: 'resumes a turn that broke during sleep once scheduled work is ready, not at the earlier resume delay',
			failAfterWakeMs: undefined, resumedAfterWakeMs: [SCHEDULED_WORK_WAKE_SETTLE_MS],
		},
		{
			name: 'resumes a turn that broke after scheduled work is ready no sooner than the resume delay after the failure',
			failAfterWakeMs: 20_000, resumedAfterWakeMs: [30_000],
		},
	]) {
		test(name, () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const session = URI.parse('mock:/resume-timing-session');
			const chat = buildDefaultChatUri(session);
			const started = new DeferredPromise<void>();
			let wokeAt = 0;
			const resumed: number[] = [];
			const service = createService({
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '', status: SessionStatus.Idle,
						createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
						defaultChat: chat,
					});
					return session;
				},
				startSession: async (_session, message) => {
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(), message });
					await started.complete();
				},
				resumeTurn: async (_session, turnId) => {
					resumed.push(Date.now() - wokeAt);
					stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnResume, turnId });
					return true;
				},
			});
			await enableAndCreate(service);
			await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: name });
			await started.p;
			const failTurn = () => stateManager.dispatchServerAction(chat, {
				type: ActionType.ChatError, turnId: 'turn', duration: 0,
				part: { kind: ResponsePartKind.Error, error: { errorType: 'query', message: 'Connection reset' }, resumable: true },
			});

			systemWake.setFullyAwake(false);
			if (failAfterWakeMs === undefined) {
				failTurn();
			}
			await timeout(1_000);
			systemWake.setFullyAwake(true);
			wokeAt = Date.now();
			if (failAfterWakeMs !== undefined) {
				await timeout(failAfterWakeMs);
				failTurn();
			}
			await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

			assert.deepStrictEqual(resumed, resumedAfterWakeMs);
		}));
	}

	test('a turn that fails after another turn\'s resume delay passed still waits its own delay', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
		const sessionFor = (automation: string) => URI.from({ scheme: 'mock', path: URI.parse(automation).path });
		const started = new Map(['/first', '/second'].map(path => [path, new DeferredPromise<void>()]));
		let wokeAt = 0;
		const resumed: string[] = [];
		const service = createService({
			createSession: async (_template, run) => {
				const session = sessionFor(run.automation);
				stateManager.createSession({
					resource: session.toString(), provider: 'mock', title: '', status: SessionStatus.Idle,
					createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session),
				});
				return session;
			},
			startSession: async (session, message) => {
				stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(), message });
				await started.get(session.path)?.complete();
			},
			resumeTurn: async (session, turnId) => {
				resumed.push(`${session.path}: ${Date.now() - wokeAt}`);
				stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnResume, turnId });
				return true;
			},
		});
		for (const automation of ['ahp-automation:/first', 'ahp-automation:/second']) {
			await enableAndCreate(service, automation);
			await service.runAutomation({ channel: 'ahp-automations://', automation, requestId: automation });
		}
		await Promise.all([...started.values()].map(start => start.p));
		const failTurn = (path: string) => stateManager.dispatchServerAction(buildDefaultChatUri(URI.from({ scheme: 'mock', path })), {
			type: ActionType.ChatError, turnId: 'turn', duration: 0,
			part: { kind: ResponsePartKind.Error, error: { errorType: 'query', message: 'Connection reset' }, resumable: true },
		});

		systemWake.setFullyAwake(false);
		failTurn('/first');
		await timeout(1_000);
		systemWake.setFullyAwake(true);
		wokeAt = Date.now();
		await timeout(14_000);
		failTurn('/second');
		await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS);

		assert.deepStrictEqual(resumed, ['/first: 15000', '/second: 24000']);
	}));

	test('cancellation wins a session-creation race without sending the prompt', async () => {
		const session = URI.parse('mock:/cancelled-session');
		const createStarted = new DeferredPromise<void>();
		const releaseCreate = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		let startCalls = 0;
		const service = createService({
			createSession: async () => {
				await createStarted.complete();
				await releaseCreate.p;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async () => {
				startCalls++;
			},
			cancelSession: async () => {
				await cancelled.complete();
				return true;
			},
		});
		await enableAndCreate(service);
		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-request',
		});
		await createStarted.p;

		await service.handleCancel(result.resource, { type: ActionType.AutomationRunCancelRequested });
		await releaseCreate.complete();
		await cancelled.p;

		const run = stateManager.getAutomationRunState(result.resource);
		assert.deepStrictEqual({
			startCalls,
			status: run?.lifecycle.status,
			hasStartedAt: run?.lifecycle.status === AutomationRunStatus.Cancelled && run.lifecycle.startedAt !== undefined,
			hasCompletedAt: run?.lifecycle.status === AutomationRunStatus.Cancelled && run.lifecycle.completedAt.length > 0,
			sessions: run?.sessions,
			primarySession: run?.primarySession,
			lifecycleEvents: telemetry.events.filter(event => event.name !== 'automation.created').map(event => ({ name: event.name, outcome: event.data.outcome, sessionCreated: event.data.sessionCreated })),
		}, {
			startCalls: 0,
			status: AutomationRunStatus.Cancelled,
			hasStartedAt: true,
			hasCompletedAt: true,
			sessions: [session.toString()],
			primarySession: session.toString(),
			lifecycleEvents: [
				{ name: 'automation.runCreated', outcome: undefined, sessionCreated: false },
				{ name: 'automation.runCompleted', outcome: 'cancelled', sessionCreated: false },
			],
		});
	});

	test('failed linked-session cancellation leaves the run non-terminal', async () => {
		const session = URI.parse('mock:/uncancelled-session');
		const started = new DeferredPromise<void>();

		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
			cancelSession: async () => {
				throw new Error('cancel failed');
			},
		});
		await enableAndCreate(service);
		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-failure',
		});
		await started.p;

		await assert.rejects(service.handleCancel(result.resource, { type: ActionType.AutomationRunCancelRequested }), /cancel failed/);

		assert.strictEqual(stateManager.getAutomationRunState(result.resource)?.lifecycle.status, AutomationRunStatus.Running);
	});

	test('claims a persisted missed schedule before starting its session', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const automationResource = 'ahp-automation:/scheduled-review';
		const scheduledDefinition: AutomationDefinition = {
			...definition(),
			triggers: [{
				id: 'weekday-review',
				kind: AutomationTriggerKind.Schedule,
				schedule: { expression: '* * * * *', timeZone: 'UTC' },
				misfirePolicy: AutomationMisfirePolicy.RunOnce,
			}],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: scheduledDefinition,
					nextRunAt: scheduledFor,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: { 'vscode.scheduleCursors': { 'weekday-review': scheduledFor } },
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/scheduled-session');
		const started = new DeferredPromise<void>();

		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async (createdSession, message) => {
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId: 'scheduled-turn',
					startedAt: new Date().toISOString(),
					message,
				});
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		const run = automation?.runs[0];
		assert.deepStrictEqual({
			origin: run?.origin,
			status: run?.lifecycle.status,
			primarySession: run?.primarySession,
			nextRunIsFuture: Date.parse(automation?.nextRunAt ?? '') > now.getTime(),
			serviceAvailable: service.isAvailable,
			startTriggers: telemetry.events.filter(event => event.name === 'automation.runStarted').map(event => event.data.trigger),
		}, {
			origin: {
				kind: AutomationRunOriginKind.Trigger,
				triggerId: 'weekday-review',
				scheduledFor,
				catchUp: true,
			},
			status: AutomationRunStatus.Running,
			primarySession: session.toString(),
			nextRunIsFuture: true,
			serviceAvailable: true,
			startTriggers: ['catch_up'],
		});
	});

	for (const initiallyEnabled of [true, false]) {
		test(`preserves catch-up work until authentication is ready with enablement ${initiallyEnabled}`, async () => {
			const timestamp = new Date().toISOString();
			const scheduledFor = new Date(Date.now() - 120_000).toISOString();
			const resource = 'ahp-automation:/awaiting-auth';
			storageService.set('automations', {
				version: 1,
				catalog: {
					automations: [{
						resource,
						definition: {
							...definition(),
							triggers: [{
								id: 'schedule', kind: AutomationTriggerKind.Schedule,
								schedule: { expression: '* * * * *', timeZone: 'UTC' },
								misfirePolicy: AutomationMisfirePolicy.RunOnce,
							}],
						},
						runs: [], nextRunAt: scheduledFor,
						operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
						createdAt: timestamp, modifiedAt: timestamp,
						_meta: { 'vscode.scheduleCursors': { schedule: scheduledFor } },
					}]
				},
				runs: [],
				manualRunRequests: [],
			});
			await storageService.whenIdle();
			stateManager.dispatchServerAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: initiallyEnabled },
			});
			const authenticated = observableValue('authenticated', false);
			const started = new DeferredPromise<void>();
			let createCalls = 0;
			const service = createService({
				isSessionTemplateAvailable: (_template, reader) => authenticated.read(reader),
				createSession: async () => {
					createCalls++;
					const session = URI.parse('mock:/authenticated');
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '',
						status: SessionStatus.Idle, createdAt: timestamp, modifiedAt: timestamp,
						defaultChat: buildDefaultChatUri(session.toString()),
					});
					return session;
				},
				startSession: async () => { await started.complete(); },
			});
			const writesBeforeReadiness = writeAttempts;
			await timeout(0);
			assert.deepStrictEqual({
				createCalls, writes: writeAttempts - writesBeforeReadiness,
				nextRunAt: stateManager.getAutomationCatalogState()?.entries[0].nextRunAt,
				runs: stateManager.getAutomationCatalogState()?.entries[0].runs,
			}, { createCalls: 0, writes: 0, nextRunAt: scheduledFor, runs: [] });
			authenticated.set(true, undefined);
			if (!initiallyEnabled) {
				await timeout(0);
				assert.strictEqual(createCalls, 0);
				stateManager.dispatchServerAction(ROOT_STATE_URI, {
					type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
				});
				await service.handleConfigurationChanged();
			}
			await started.p;
			authenticated.set(false, undefined);
			authenticated.set(true, undefined);
			await timeout(0);
			const automation = stateManager.getAutomationCatalogState()?.entries[0];
			assert.deepStrictEqual({
				createCalls, runCount: automation?.runs.length,
				origin: automation?.runs[0].origin,
				nextRunIsFuture: Date.parse(automation?.nextRunAt ?? '') > Date.now(),
			}, {
				createCalls: 1, runCount: 1,
				origin: { kind: AutomationRunOriginKind.Trigger, triggerId: 'schedule', scheduledFor, catchUp: true },
				nextRunIsFuture: true,
			});
		});
	}

	test('records an on-time scheduled run with schedule provenance', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('copilotcli:/scheduled-session'),
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: {
				...definition(),
				triggers: [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }],
			},
		});
		await started.p;

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, trigger: event.data.trigger, scheduleKind: event.data.scheduleKind })), [
			{ name: 'automation.created', trigger: undefined, scheduleKind: 'scheduled' },
			{ name: 'automation.runCreated', trigger: 'schedule', scheduleKind: undefined },
			{ name: 'automation.runStarted', trigger: 'schedule', scheduleKind: undefined },
		]);
	}));

	test('due schedules wait until the machine is fully awake, then catch up once', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
		systemWake.setFullyAwake(false);
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('copilotcli:/after-wake'),
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: {
				...definition(),
				triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
			},
		});
		await timeout(3 * 60 * 60_000);
		const asleep = stateManager.getAutomationCatalogState()?.entries[0];

		systemWake.setFullyAwake(true);
		await started.p;

		const awake = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			asleep: { runs: asleep?.runs.length, nextRunAt: asleep?.nextRunAt },
			awake: { origins: awake?.runs.map(run => run.origin), nextRunAt: awake?.nextRunAt },
		}, {
			asleep: { runs: 0, nextRunAt: '2026-01-01T01:00:00.000Z' },
			awake: {
				origins: [{ kind: AutomationRunOriginKind.Trigger, triggerId: 'hourly', scheduledFor: '2026-01-01T01:00:00.000Z', catchUp: true }],
				nextRunAt: '2026-01-01T04:00:00.000Z',
			},
		});
	}));

	test('manual runs start while the machine is not fully awake', async () => {
		systemWake.setFullyAwake(false);
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('copilotcli:/manual-while-asleep'),
			startSession: async () => { await started.complete(); },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'manual-while-asleep',
		});
		await started.p;

		assert.strictEqual(stateManager.getAutomationRunState(run.resource)?.lifecycle.status, AutomationRunStatus.Running);
	});

	suite('scheduled work after a wake', () => {
		const wokeAt = Date.UTC(2026, 0, 1, 1, 30);

		/** Creates an hourly Automation while the machine sleeps through its 01:00 occurrence until 01:30. */
		async function sleepThroughHourlySchedule(execution: Partial<IAgentHostAutomationExecution>): Promise<AgentHostAutomationService> {
			systemWake.setFullyAwake(false);
			const service = createService(execution);
			await service.handleCreate({
				...createAction(),
				definition: {
					...definition(),
					triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
				},
			});
			await timeout(wokeAt - Date.now());
			return service;
		}

		function runs() {
			return stateManager.getAutomationCatalogState()?.entries[0].runs.map(run => ({ origin: run.origin.kind, createdAt: run.lifecycle.createdAt })) ?? [];
		}

		function startRecorder(name: string) {
			const started = new DeferredPromise<void>();
			return {
				started,
				execution: {
					createSession: async () => URI.parse(`copilotcli:/${name}`),
					startSession: async () => { await started.complete(); },
				} satisfies Partial<IAgentHostAutomationExecution>,
			};
		}

		test('a due schedule waits for the network to settle after a wake', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('after-settle');
			await sleepThroughHourlySchedule(execution);

			systemWake.setFullyAwake(true);
			await timeout(SCHEDULED_WORK_WAKE_SETTLE_MS - 1);
			const settling = runs();
			await started.p;

			assert.deepStrictEqual({ settling, settled: runs() }, {
				settling: [],
				settled: [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:30:15.000Z' }],
			});
		}));

		test('a due schedule waits while the network is offline after a wake, until it is back', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('after-offline');
			await sleepThroughHourlySchedule(execution);

			systemWake.setFullyAwake(true);
			systemWake.setNetworkOnline(false);
			await timeout(60_000);
			const offline = runs();
			systemWake.setNetworkOnline(true);
			await started.p;

			assert.deepStrictEqual({ offline, online: runs() }, {
				offline: [],
				online: [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:31:00.000Z' }],
			});
		}));

		test('a due schedule starts at the cap after a wake while the network stays offline', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('after-cap');
			await sleepThroughHourlySchedule(execution);

			systemWake.setFullyAwake(true);
			systemWake.setNetworkOnline(false);
			await timeout(SCHEDULED_WORK_WAKE_NETWORK_CAP_MS - 1);
			const offline = runs();
			await started.p;

			assert.deepStrictEqual({ offline, capped: runs() }, {
				offline: [],
				capped: [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:32:00.000Z' }],
			});
		}));

		test('sleeping while the network settles cancels the wait, and the next wake starts a fresh one', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('after-second-wake');
			await sleepThroughHourlySchedule(execution);

			systemWake.setFullyAwake(true);
			await timeout(5_000);
			systemWake.setFullyAwake(false);
			await timeout(5_000);
			systemWake.setFullyAwake(true);
			await started.p;

			assert.deepStrictEqual(runs(), [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:30:25.000Z' }]);
		}));

		test('Run Now starts immediately while scheduled work is held after a wake', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 30), maxTaskCount: 100 }, async () => {
			const starts = [new DeferredPromise<void>(), new DeferredPromise<void>()];
			const [manualStarted, scheduledStarted] = starts;
			const service = await sleepThroughHourlySchedule({
				createSession: async () => URI.parse(`copilotcli:/run-now-${starts.length}`),
				startSession: async () => { await starts.shift()?.complete(); },
			});

			systemWake.setFullyAwake(true);
			systemWake.setNetworkOnline(false);
			await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'run-now-while-held' });
			await manualStarted.p;
			const held = runs();
			systemWake.setNetworkOnline(true);
			await scheduledStarted.p;

			assert.deepStrictEqual({ held, released: runs() }, {
				held: [{ origin: AutomationRunOriginKind.Manual, createdAt: '2026-01-01T01:30:00.000Z' }],
				released: [
					{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:30:15.000Z' },
					{ origin: AutomationRunOriginKind.Manual, createdAt: '2026-01-01T01:30:00.000Z' },
				],
			});
		}));

		test('a deferred Run Now starts when its provider becomes available while scheduled work is held', () => runWithFakedTimers({ useFakeTimers: true, startTime: wokeAt, maxTaskCount: 100 }, async () => {
			const available = observableValue('available', false);
			const { started, execution } = startRecorder('deferred-run-now');
			systemWake.setFullyAwake(false);
			const service = createService({ ...execution, isSessionTemplateAvailable: (_template, reader) => available.read(reader) });
			await enableAndCreate(service);
			systemWake.setFullyAwake(true);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'deferred-run-now' });
			await timeout(0);
			const deferred = stateManager.getAutomationRunState(run.resource)?.lifecycle.status;

			available.set(true, undefined);
			await started.p;

			assert.deepStrictEqual({ deferred, startedAfterWakeMs: Date.now() - wokeAt }, { deferred: AutomationRunStatus.Pending, startedAfterWakeMs: 0 });
		}));

		for (const providerAvailable of [true, false]) {
			test(`Run Now starts the pending scheduled run it reuses while scheduled work is held${providerAvailable ? '' : ', once its provider is available'}`, () => runWithFakedTimers({ useFakeTimers: true, startTime: wokeAt, maxTaskCount: 100 }, async () => {
				const scheduledRun: AutomationRunState = {
					resource: 'ahp-automation-run:/scheduled',
					automation: 'ahp-automation:/review-changes',
					origin: { kind: AutomationRunOriginKind.Trigger, triggerId: 'hourly', scheduledFor: '2026-01-01T01:00:00.000Z' },
					lifecycle: { status: AutomationRunStatus.Pending, createdAt: '2026-01-01T01:00:00.000Z' },
					sessions: [],
				};
				storageService.set('automations', {
					catalog: {
						automations: [{
							resource: scheduledRun.automation,
							definition: {
								...definition(),
								triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
							},
							nextRunAt: '2026-01-01T02:00:00.000Z',
							runs: [],
							operations: [AutomationOperation.Update, AutomationOperation.Run],
							createdAt: '2026-01-01T00:00:00.000Z',
							modifiedAt: '2026-01-01T00:00:00.000Z',
							_meta: { 'vscode.scheduleCursors': { hourly: '2026-01-01T02:00:00.000Z' } },
						}],
					},
					runs: [scheduledRun],
					manualRunRequests: [],
				});
				await storageService.whenIdle();
				const available = observableValue('available', providerAvailable);
				const { started, execution } = startRecorder('reused-scheduled-run');
				systemWake.setFullyAwake(false);
				systemWake.setFullyAwake(true);
				systemWake.setNetworkOnline(false);
				const service = createService({ ...execution, isSessionTemplateAvailable: (_template, reader) => available.read(reader) });
				await timeout(5_000);
				const held = stateManager.getAutomationRunState(scheduledRun.resource)?.lifecycle.status;

				const reused = await service.runAutomation({ channel: 'ahp-automations://', automation: scheduledRun.automation, requestId: 'reuse-scheduled-run' });
				available.set(true, undefined);
				await started.p;

				assert.deepStrictEqual({ held, reused: reused.resource, startedAfterWakeMs: Date.now() - wokeAt }, {
					held: AutomationRunStatus.Pending, reused: scheduledRun.resource, startedAfterWakeMs: 5_000,
				});
			}));
		}

		test('a due schedule whose claim waits behind another change still waits for readiness', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 59), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('queued-claim');
			const service = createService(execution);
			await service.handleCreate({
				...createAction(),
				definition: {
					...definition(),
					triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
				},
			});
			const writes = new DeferredPromise<void>();
			writeGate = writes.p;
			const blockedChange = service.handleCreate(createAction('ahp-automation:/blocking-change'));
			// The schedule comes due while the change still holds the mutation queue, and the machine sleeps before the claim runs.
			await timeout(60_000);
			systemWake.setFullyAwake(false);
			writeGate = undefined;
			await writes.complete();
			await blockedChange;
			await timeout(1_000);
			const asleep = runs();

			systemWake.setFullyAwake(true);
			await started.p;

			assert.deepStrictEqual({ asleep, awake: runs() }, {
				asleep: [],
				awake: [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:00:16.000Z' }],
			});
		}));

		test('a due schedule starts without delay when no wake is reported, even if the network was reported offline', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1, 0, 59), maxTaskCount: 100 }, async () => {
			const { started, execution } = startRecorder('no-wake-reporter');
			systemWake.setNetworkOnline(false);
			const service = createService(execution);
			await service.handleCreate({
				...createAction(),
				definition: {
					...definition(),
					triggers: [{ id: 'hourly', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
				},
			});
			await started.p;

			assert.deepStrictEqual(runs(), [{ origin: AutomationRunOriginKind.Trigger, createdAt: '2026-01-01T01:00:00.000Z' }]);
		}));
	});

	test('coalesces simultaneously-due schedule triggers on one Automation into a single run', async () => {
		const now = new Date();
		const firstScheduledFor = new Date(now.getTime() - 3 * 60_000).toISOString();
		const secondScheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const automationResource = 'ahp-automation:/multi-trigger';
		const multiTriggerDefinition: AutomationDefinition = {
			...definition(),
			triggers: [
				{
					id: 'first-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '* * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
				{
					id: 'second-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '*/2 * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
			],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: multiTriggerDefinition,
					nextRunAt: firstScheduledFor,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: {
						'vscode.scheduleCursors': {
							'first-trigger': firstScheduledFor,
							'second-trigger': secondScheduledFor,
						},
					},
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/multi-trigger-session');
		const started = new DeferredPromise<void>();
		createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		const cursors = automation?._meta?.['vscode.scheduleCursors'] as Record<string, string> | undefined;
		assert.deepStrictEqual({
			runsClaimed: automation?.runs.length,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
			firstCursorAdvanced: cursors ? Date.parse(cursors['first-trigger']) > now.getTime() : false,
			secondCursorAdvanced: cursors ? Date.parse(cursors['second-trigger']) > now.getTime() : false,
		}, {
			runsClaimed: 1,
			claimedTriggerId: 'first-trigger',
			firstCursorAdvanced: true,
			secondCursorAdvanced: true,
		});
	});

	test('Skip-catch-up on the first trigger does not consume the per-tick claim slot', async () => {
		const now = new Date();
		const stale = new Date(now.getTime() - 10 * 60_000).toISOString();
		const dueRecently = new Date(now.getTime() - 30_000).toISOString();
		const automationResource = 'ahp-automation:/skip-first';
		const multiTriggerDefinition: AutomationDefinition = {
			...definition(),
			triggers: [
				{
					id: 'stale-skip-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '* * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.Skip,
				},
				{
					id: 'due-run-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '*/2 * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
			],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: multiTriggerDefinition,
					nextRunAt: stale,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: {
						'vscode.scheduleCursors': {
							'stale-skip-trigger': stale,
							'due-run-trigger': dueRecently,
						},
					},
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/skip-first-session');
		const started = new DeferredPromise<void>();

		createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
					defaultChat: buildDefaultChatUri(session.toString()),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			runsClaimed: automation?.runs.length,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
		}, {
			runsClaimed: 1,
			claimedTriggerId: 'due-run-trigger',
		});
	});

	test('bounds catalogue run history and loads older pages by cursor', async () => {
		const automationResource = 'ahp-automation:/history';
		const runs: AutomationRunState[] = Array.from({ length: 51 }, (_, index) => {
			const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
			return {
				resource: `ahp-automation-run:/run-${index}`,
				automation: automationResource,
				origin: { kind: AutomationRunOriginKind.Manual },
				lifecycle: {
					status: AutomationRunStatus.Completed,
					createdAt: timestamp,
					startedAt: timestamp,
					completedAt: timestamp,
				},
				sessions: [],
			};
		});
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: definition(),
					runs: runs.map(run => ({
						resource: run.resource,
						automation: run.automation,
						origin: run.origin,
						lifecycle: run.lifecycle,
						sessionCount: 0,
					})),
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: '2026-01-01T00:00:00.000Z',
					modifiedAt: '2026-01-01T00:00:00.000Z',
				}],
			},
			runs,
			manualRunRequests: [],
		});
		await storageService.whenIdle();
		const service = createService();

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
		}, {
			count: 50,
			cursor: '50',
		});

		await service.fetchAutomationRuns({
			channel: 'ahp-automations://',
			automation: automationResource,
			cursor: '50',
		});

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
		}, {
			count: 51,
			cursor: undefined,
		});
	});
});
