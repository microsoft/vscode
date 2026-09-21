/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { withAgentHostResources } from '../../../../../platform/agentHost/common/meta/agentHostResources.js';
import { readRemoteSessionOrigin, toRemoteSessionMessageMetadata, withRemoteSessionsCapability } from '../../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { PolicyState, RootState } from '../../../../../platform/agentHost/common/state/protocol/channels-root/state.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { buildChatUri, ChatSummary, ComponentToState, readSessionSpawnDepth, SessionState, StateComponents, withSessionSpawnDepth } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { getRegisteredLanguageModels, getVisibleLanguageModelsForTarget, resolveModelIdentifierFromCatalog } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IChat, ISession, ISessionGitRepository, ISessionType, ISessionWorkspace, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService, NewSessionRequestOptions } from '../../../../services/sessions/common/sessionsManagement.js';
import { RemoteSessionService } from '../../browser/remoteSessionService.js';
import { parseCreateRemoteSessionOptions, RemoteSessionToolsEnabledSettingId } from '../../common/remoteSessions.js';
import { IRemoteSessionChatService } from '../../browser/remoteSessionChatService.js';

class RemoteConnection extends mock<IAgentConnection>() {
	override clientId = 'target-client';
}

class RemoteProvider extends mock<IAgentHostSessionsProvider>() {
	override readonly remoteAddress: string;
	override readonly id: string;
	override readonly label: string;
	override readonly connectionStatus = observableValue<RemoteAgentHostConnectionStatus>(this, { kind: 'connected' });
	override readonly supportsQuickChats = true;
	override readonly hostGroup: IAgentHostSessionsProvider['hostGroup'] = undefined;
	override sessionTypes: ISessionType[];
	root: RootState;
	rootAvailable = true;
	connection = new RemoteConnection();

	constructor(name: string, load = 0, platform: 'windows' | 'linux' | 'macos' = 'linux', agentProvider = 'copilot') {
		super();
		this.remoteAddress = `ws://${name}:8080`;
		this.id = `agenthost-${agentHostAuthority(this.remoteAddress)}`;
		this.label = name;
		this.sessionTypes = [{
			id: agentProvider,
			label: 'Copilot',
			icon: Codicon.copilot,
			chatSessionType: remoteAgentHostSessionTypeId(agentHostAuthority(this.remoteAddress), agentProvider),
			authRequirement: SessionTypeAuthRequirement.None,
			supportsWorktreeConfiguration: true,
		}];
		this.root = {
			activeSessions: load,
			agents: [{
				provider: agentProvider,
				displayName: 'Copilot',
				description: '',
				models: [{ provider: agentProvider, id: 'test-model', name: 'Test Model' }],
			}],
			_meta: withRemoteSessionsCapability(withAgentHostResources(undefined, { platform, architecture: 'x64', cpuCount: 8, memoryBytes: 32 * 1024 ** 3 })),
		};
	}

	override getRootState(): RootState | undefined { return this.rootAvailable ? this.root : undefined; }
	override getSessions(): ISession[] { return []; }
	override getSessionTypes(): ISessionType[] { return this.sessionTypes; }
	override mapAgentHostResource(resource: URI): URI { return toAgentHostUri(resource, agentHostAuthority(this.remoteAddress)); }
}

function makeSession(resource: URI, workspace?: ISessionWorkspace, modelId?: string): ISession {
	const chat = upcastPartial<IChat>({
		resource,
		modelId: constObservable(modelId),
	});
	return upcastPartial<ISession>({
		resource,
		mainChat: constObservable(chat),
		modelId: constObservable(modelId),
		workspace: constObservable(workspace),
	});
}

suite('RemoteSessionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(hosts: RemoteProvider[]) {
		const source = makeSession(URI.parse('agent-host-copilot:/source'));
		const sourceChat = upcastPartial<IChat>({ resource: source.resource.with({ fragment: 'origin-chat' }) });
		const calls: { workspace?: URI; request: NewSessionRequestOptions; options?: ICreateNewSessionOptions }[] = [];
		const backgroundEvents: string[] = [];
		const sourceMetadata = upcastPartial<IAgentSessionMetadata>({ session: URI.parse('copilot:/source') });
		const state = {
			beforeCommit: async () => { },
			beforeStat: async () => { },
			beforeAcquire: async () => { },
			transformSession: (session: ISession) => session,
			sourceMetadata,
			trusted: true,
			isDirectory: true,
			inspectionError: undefined as Error | undefined,
			sourceConnected: true,
			sourceClientId: 'test-client',
		};
		const models = new Map<string, ILanguageModelChatMetadata>(hosts.flatMap(host => host.root.agents.flatMap(agent => {
			const vendor = remoteAgentHostSessionTypeId(agentHostAuthority(host.remoteAddress), agent.provider);
			return agent.models.map(model => [
				`${vendor}:${model.id}`,
				upcastPartial<ILanguageModelChatMetadata>({ id: model.id, vendor, targetChatSessionType: vendor }),
			] as const);
		})));
		const hiddenModels = new Set<string>();
		const languageModels = new class extends mock<ILanguageModelsService>() {
			override getLanguageModelIds() { return [...models.keys()]; }
			override lookupLanguageModel(identifier: string) { return models.get(identifier); }
			override isModelHidden(identifier: string) { return hiddenModels.has(identifier); }
		}();
		const autoModelSessionTypes = new Set<string>();
		const management = new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession | undefined {
				return isEqual(resource, source.resource) ? source : undefined;
			}
			override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
				return isEqual(resource, sourceChat.resource) ? { session: source, chat: sourceChat } : undefined;
			}
			override async createAndSendNewChatRequest(workspace: URI, request: NewSessionRequestOptions, options?: ICreateNewSessionOptions): Promise<ISession> {
				return this.record(request, options, workspace);
			}
			override async createAndSendQuickChatRequest(request: ISendRequestOptions, options?: ICreateNewSessionOptions): Promise<ISession> {
				return this.record(request, options);
			}
			private async record(request: NewSessionRequestOptions, options?: ICreateNewSessionOptions, workspace?: URI): Promise<ISession> {
				calls.push({ request, options, workspace });
				const number = calls.length;
				const host = hosts.find(host => host.id === options?.providerId)!;
				const sessionType = host.sessionTypes.find(type => type.id === options?.sessionTypeId)!;
				const created = state.transformSession(makeSession(
					URI.from({ scheme: sessionType.chatSessionType!, path: `/created-${number}` }),
					workspace ? upcastPartial<ISessionWorkspace>({
						uri: workspace,
						folders: [{ root: workspace, workingDirectory: workspace, name: 'repo', description: undefined }],
					}) : undefined,
					options?.modelId,
				));
				await options?.onSessionCreated?.(created);
				if (options?.modelId) {
					const vendor = created.resource.scheme;
					const models = getVisibleLanguageModelsForTarget(getRegisteredLanguageModels(languageModels), vendor, languageModels);
					const resolution = resolveModelIdentifierFromCatalog(models, options.modelId, {
						hasLiveModels: candidate => candidate === vendor,
						hasResolved: candidate => candidate === vendor,
					});
					if (resolution.kind !== 'available') {
						throw new Error(`Requested model resolution is ${resolution.kind}: ${options.modelId}`);
					}
				}
				await state.beforeCommit();
				return created;
			}
		}();
		const connection = new class extends mock<IAgentConnection>() {
			override get clientId() { return state.sourceClientId; }
			override readonly rootState = upcastPartial<IAgentSubscription<RootState>>({ value: { agents: [] } });
			private readonly subscriptions: { [K in StateComponents]?: () => IAgentSubscription<ComponentToState[K]> } = {
				[StateComponents.Session]: () => upcastPartial<IAgentSubscription<SessionState>>({
					value: upcastPartial<SessionState>({
						_meta: state.sourceMetadata._meta,
						chats: [upcastPartial<ChatSummary>({ resource: buildChatUri(sourceMetadata.session, 'origin-chat') })],
					}),
				}),
			};
			override getSubscription<T extends StateComponents>(kind: T): IReference<IAgentSubscription<ComponentToState[T]>> {
				const get = this.subscriptions[kind];
				assert.ok(get);
				return { object: get(), dispose: () => { } };
			}
		}();
		const connections = new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeConnections = Event.None;
			override getConnectionByAddress(address: string) {
				const host = hosts.find(host => host.remoteAddress === address);
				return host?.connectionStatus.get().kind === 'connected' ? host.connection : undefined;
			}
			override resolveSessionResource(resource: URI) {
				return state.sourceConnected && isEqual(resource, source.resource)
					? { connection, connectionAuthority: 'local', backendSession: sourceMetadata.session }
					: undefined;
			}
		}();
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [RemoteSessionToolsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const files = new class extends mock<IFileService>() {
			override async stat(resource: URI): Promise<IFileStatWithMetadata> {
				await state.beforeStat();
				if (state.inspectionError) {
					throw state.inspectionError;
				}
				return upcastPartial<IFileStatWithMetadata>({ resource, isDirectory: state.isDirectory });
			}
		}();
		const trust = new class extends mock<IWorkspaceTrustManagementService>() {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: state.trusted }; }
		}();
		const service = new RemoteSessionService(
			new class extends mock<ISessionsProvidersService>() { override getProviders() { return hosts; } }(),
			management, connections, configuration, files, trust, new NullLogService(),
			new class extends mock<IRemoteSessionChatService>() {
				override async acquire(resource: URI) {
					await state.beforeAcquire();
					backgroundEvents.push(`acquire:${resource.toString()}`);
					return {
						dispose: () => backgroundEvents.push('dispose'),
						releaseWhenIdle: () => backgroundEvents.push('releaseWhenIdle'),
					};
				}
			}(),
			languageModels,
			new class extends mock<IChatSessionsService>() {
				override supportsAutoModelForSessionType(type: string) { return autoModelSessionTypes.has(type); }
			}(),
		);
		const create = (input: object = {}, id = 'request') => service.createSession(parseCreateRemoteSessionOptions({ prompt: 'Run tests', ...input }), sourceChat.resource, id, CancellationToken.None);
		return { service, create, calls, source, sourceChat, state, configuration, backgroundEvents, models, hiddenModels, autoModelSessionTypes };
	}

	test('lists resources, models, host identity and workload without connecting hosts', () => {
		const host = new RemoteProvider('linux', 2);
		const { service } = setup([host]);
		assert.deepStrictEqual(service.listHosts(), [{
			id: host.id,
			label: 'linux',
			status: 'connected',
			supportsRemoteSessions: true,
			resources: { platform: 'linux', architecture: 'x64', cpuCount: 8, memoryBytes: 32 * 1024 ** 3 },
			runningSessions: 2,
			pendingCreations: 0,
			agents: [{ provider: 'copilot', models: [{ id: 'test-model', name: 'Test Model' }] }],
			workspaces: [],
		}]);
	});

	test('selects the least busy matching host and starts a workspace-less session', async () => {
		const hosts = [new RemoteProvider('busy', 3), new RemoteProvider('idle', 0, 'windows'), new RemoteProvider('matched', 1)];
		const { create, calls, source, sourceChat } = setup(hosts);
		const result = await create({ requirements: { platform: 'linux', minCpuCount: 8, minMemoryGiB: 32 } });
		assert.deepStrictEqual({
			host: result.host.id,
			status: result.status,
			workspace: result.workspace,
			model: result.model,
			placement: result.placement,
			origin: readRemoteSessionOrigin({ _meta: calls[0].options?.metadata }),
			depth: readSessionSpawnDepth(calls[0].options?.metadata),
			requestedWorkspace: calls[0].workspace,
			modelOverride: calls[0].options?.modelId,
			background: hasKey(calls[0].request, { query: true }) && calls[0].request.background,
			request: calls[0].request,
		}, {
			host: hosts[2].id,
			status: 'started',
			workspace: null,
			model: { provider: 'copilot', id: null },
			placement: { runningSessions: 1, pendingCreations: 0 },
			origin: { session: source.resource.toString(), chat: sourceChat.resource.toString(), depth: 1 },
			depth: 1,
			requestedWorkspace: undefined,
			modelOverride: undefined,
			background: true,
			request: {
				query: 'Run tests',
				title: undefined,
				background: true,
				metadata: toRemoteSessionMessageMetadata({ session: source.resource.toString(), chat: sourceChat.resource.toString() }),
			},
		});
	});

	test('ten concurrent requests reserve different hosts before any session starts', async () => {
		const hosts = Array.from({ length: 10 }, (_, i) => new RemoteProvider(`host-${i}`));
		const { create, calls, state, service } = setup(hosts);
		const allStarted = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		state.beforeCommit = async () => {
			if (calls.length === hosts.length) {
				await allStarted.complete();
			}
			await release.p;
		};
		const operations = hosts.map((_, index) => create({}, `request-${index}`));
		await allStarted.p;
		try {
			assert.deepStrictEqual({
				hosts: new Set(calls.map(call => call.options?.providerId)).size,
				pending: service.listHosts().map(host => host.pendingCreations),
			}, { hosts: 10, pending: Array(10).fill(1) });
		} finally {
			await release.complete();
			await Promise.all(operations);
		}
		assert.deepStrictEqual(service.listHosts().map(host => host.pendingCreations), Array(10).fill(0));
	});

	test('the same invocation creates only one session and rejects changed retry arguments', async () => {
		const { create, calls } = setup([new RemoteProvider('host')]);
		const [first, second] = await Promise.all([create(), create()]);
		assert.deepStrictEqual({ count: calls.length, sameResult: first === second }, { count: 1, sameResult: true });
		assert.throws(() => create({ prompt: 'Different' }), /different arguments/);
	});

	test('pins an explicit host and passes its exact model without inheriting source configuration', async () => {
		const hosts = [new RemoteProvider('idle', 0), new RemoteProvider('pinned', 3)];
		const { create, calls } = setup(hosts);
		await create({ hostId: hosts[1].id, model: { provider: 'copilot', id: 'test-model' } });
		assert.deepStrictEqual({
			hostId: calls[0].options?.providerId,
			modelId: calls[0].options?.modelId,
			permissionLevel: calls[0].options?.permissionLevel,
			sessionTemplate: calls[0].options?.sessionTemplate,
		}, { hostId: hosts[1].id, modelId: `${hosts[1].sessionTypes[0].chatSessionType}:test-model`, permissionLevel: undefined, sessionTemplate: undefined });
	});

	for (const id of ['claude-haiku-4.5', 'openrouter/aion-labs/aion-3.0']) {
		test(`resolves an advertised native model ID through the target catalog: ${id}`, async () => {
			const host = new RemoteProvider('host');
			host.root.agents[0].models[0] = { provider: 'copilot', id, name: id };
			const { service, create, calls } = setup([host]);
			const advertised = service.listHosts()[0].agents[0];
			const result = await create({ model: { provider: advertised.provider, id: advertised.models[0].id } });
			assert.deepStrictEqual({
				requestedModel: calls[0].options?.modelId,
				reportedModel: result.model,
			}, {
				requestedModel: `${host.sessionTypes[0].chatSessionType}:${id}`,
				reportedModel: { provider: 'copilot', id },
			});
		});
	}

	test('rejects unavailable or policy-disabled models instead of substituting', async () => {
		const host = new RemoteProvider('host');
		host.root.agents[0].models[0].policyState = PolicyState.Disabled;
		const { service, create, calls } = setup([host]);
		await assert.rejects(create({ model: { provider: 'copilot', id: 'test-model' } }), /Model copilot\/test-model is not available/);
		assert.deepStrictEqual({ advertised: service.listHosts()[0].agents[0].models, calls }, { advertised: [], calls: [] });
	});

	for (const byok of [false, true]) {
		test(`discovery and explicit creation honor Manage Models visibility: BYOK=${byok}`, async () => {
			const host = new RemoteProvider('host');
			const id = byok ? 'openrouter/aion-labs/aion-3.0' : 'test-model';
			host.root.agents[0].models[0] = { provider: 'copilot', id, name: 'Test Model' };
			const { service, create, calls, models, hiddenModels } = setup([host]);
			const identifier = `${host.sessionTypes[0].chatSessionType}:${id}`;
			const manageModelsIdentifier = byok ? 'openrouter/OpenRouter/aion-labs/aion-3.0' : identifier;
			if (byok) {
				models.set(identifier, { ...models.get(identifier)!, byokModelIdentifier: manageModelsIdentifier });
			}
			hiddenModels.add(manageModelsIdentifier);
			await assert.rejects(create({ model: { provider: 'copilot', id } }), /is not available/);
			assert.deepStrictEqual({ advertised: service.listHosts()[0].agents[0].models, calls }, { advertised: [], calls: [] });

			hiddenModels.clear();
			const advertised = service.listHosts()[0].agents[0];
			const result = await create({ model: { provider: advertised.provider, id: advertised.models[0].id } }, 'visible');
			assert.deepStrictEqual({
				advertised: advertised.models,
				requestedModel: calls[0].options?.modelId,
				reportedModel: result.model,
			}, {
				advertised: [{ id, name: 'Test Model' }],
				requestedModel: identifier,
				reportedModel: { provider: 'copilot', id },
			});
		});
	}

	test('hiding a host-specific model does not hide the same native model on another host', async () => {
		const hidden = new RemoteProvider('hidden');
		const visible = new RemoteProvider('visible', 1);
		const { service, create, calls, hiddenModels } = setup([hidden, visible]);
		hiddenModels.add(`${hidden.sessionTypes[0].chatSessionType}:test-model`);
		const result = await create({ model: { provider: 'copilot', id: 'test-model' } });
		await assert.rejects(create({ hostId: hidden.id, model: { provider: 'copilot', id: 'test-model' } }, 'pinned'), /is not available/);
		assert.deepStrictEqual({
			advertised: service.listHosts().map(host => host.agents[0].models),
			selectedHost: result.host.id,
			requestedHosts: calls.map(call => call.options?.providerId),
		}, {
			advertised: [[], [{ id: 'test-model', name: 'Test Model' }]],
			selectedHost: visible.id,
			requestedHosts: [visible.id],
		});
	});

	test('unregistered models are not advertised but declared Auto keeps default workspace-less creation available', async () => {
		const host = new RemoteProvider('host', 0, 'linux', 'copilotcli');
		const { service, create, calls, models, autoModelSessionTypes } = setup([host]);
		autoModelSessionTypes.add(host.sessionTypes[0].chatSessionType!);
		models.clear();
		await assert.rejects(create({ model: { provider: 'copilotcli', id: 'test-model' } }), /is not available/);
		const result = await create({}, 'default');
		assert.deepStrictEqual({
			advertised: service.listHosts()[0].agents[0].models,
			model: result.model,
			workspace: result.workspace,
			requestedModels: calls.map(call => call.options?.modelId),
		}, { advertised: [], model: { provider: 'copilotcli', id: null }, workspace: null, requestedModels: [undefined] });
	});

	for (const provider of ['claude', 'codex']) {
		test(`default placement skips model-less ${provider} hosts without ignoring an explicit host pin`, async () => {
			const unavailable = new RemoteProvider('unavailable', 0, 'linux', provider);
			unavailable.root.agents[0].models = [];
			const available = new RemoteProvider('available', 2);
			const { create, calls } = setup([unavailable, available]);
			const result = await create();
			await assert.rejects(create({ hostId: unavailable.id }, 'pinned'), /available model or Auto fallback/);
			assert.deepStrictEqual({
				host: result.host.id,
				requestedHosts: calls.map(call => call.options?.providerId),
				modelOverrides: calls.map(call => call.options?.modelId),
			}, { host: available.id, requestedHosts: [available.id], modelOverrides: [undefined] });
		});
	}

	for (const availability of ['empty', 'hidden', 'policy-disabled']) {
		test(`default placement skips an agent with ${availability} models on the same host`, async () => {
			const host = new RemoteProvider('host', 0, 'linux', 'claude');
			const runnable = new RemoteProvider('host', 0, 'linux', 'codex');
			if (availability === 'empty') {
				host.root.agents[0].models = [];
			} else if (availability === 'policy-disabled') {
				host.root.agents[0].models[0].policyState = PolicyState.Disabled;
			}
			host.root.agents.push(...runnable.root.agents);
			host.sessionTypes.push(...runnable.sessionTypes);
			const { create, calls, hiddenModels } = setup([host]);
			if (availability === 'hidden') {
				hiddenModels.add(`${host.sessionTypes[0].chatSessionType}:test-model`);
			}
			const result = await create();
			assert.deepStrictEqual({
				host: result.host.id,
				sessionType: calls[0].options?.sessionTypeId,
				resourceScheme: URI.parse(result.session).scheme,
				modelOverride: calls[0].options?.modelId,
				model: result.model,
			}, {
				host: host.id,
				sessionType: 'codex',
				resourceScheme: runnable.sessionTypes[0].chatSessionType,
				modelOverride: undefined,
				model: { provider: 'codex', id: null },
			});
		});
	}

	test('default placement can choose a later agent with only a declared Auto fallback', async () => {
		const host = new RemoteProvider('host', 0, 'linux', 'claude');
		const auto = new RemoteProvider('host', 0, 'linux', 'copilotcli');
		host.root.agents[0].models = [];
		auto.root.agents[0].models = [];
		host.root.agents.push(...auto.root.agents);
		host.sessionTypes.push(...auto.sessionTypes);
		const { create, calls, autoModelSessionTypes } = setup([host]);
		autoModelSessionTypes.add(auto.sessionTypes[0].chatSessionType!);
		const result = await create();
		assert.deepStrictEqual({
			sessionType: calls[0].options?.sessionTypeId,
			modelOverride: calls[0].options?.modelId,
			model: result.model,
		}, { sessionType: 'copilotcli', modelOverride: undefined, model: { provider: 'copilotcli', id: null } });
	});

	test('an older host without origin support is never selected', async () => {
		const host = new RemoteProvider('older-host');
		host.root._meta = undefined;
		const { create, calls } = setup([host]);
		await assert.rejects(create(), /Update the agent host/);
		assert.deepStrictEqual(calls, []);
	});

	test('session-dedicated hosts remain ineligible for delegation even when they support quick chats', async () => {
		const dedicated = new class extends RemoteProvider {
			override readonly hostGroup = { id: 'dedicated', label: 'Dedicated', connectable: false };
		}('dedicated');
		const available = new RemoteProvider('available', 2);
		const { create, calls } = setup([dedicated, available]);
		const result = await create();
		await assert.rejects(create({ hostId: dedicated.id }, 'dedicated'), /dedicated to an existing session/);
		assert.deepStrictEqual({
			supportsQuickChats: dedicated.supportsQuickChats,
			selectedHost: result.host.id,
			requestedHosts: calls.map(call => call.options?.providerId),
		}, { supportsQuickChats: true, selectedHost: available.id, requestedHosts: [available.id] });
	});

	for (const status of [RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.disconnected]) {
		test(`${status.kind} host reports unknown capabilities even with stale root state`, async () => {
			const host = new RemoteProvider('host');
			host.connectionStatus.set(status, undefined);
			const { service, create, calls } = setup([host]);
			const [listed] = service.listHosts();
			assert.deepStrictEqual({
				status: listed.status, support: listed.supportsRemoteSessions, resources: listed.resources,
				runningSessions: listed.runningSessions, agents: listed.agents,
			}, { status: status.kind, support: null, resources: undefined, runningSessions: undefined, agents: [] });
			await assert.rejects(create(), error => error instanceof Error
				&& error.message.includes(`Host is ${status.kind}.`)
				&& !error.message.includes('Update the agent host')
				&& !error.message.includes('workspace-less'));
			assert.deepStrictEqual(calls, []);
		});
	}

	test('a connected host without root state reports discovery pending', async () => {
		const host = new RemoteProvider('host');
		host.rootAvailable = false;
		const { service, create, calls } = setup([host]);
		assert.strictEqual(service.listHosts()[0].supportsRemoteSessions, null);
		await assert.rejects(create(), error => error instanceof Error
			&& error.message.includes('capabilities have not been received')
			&& !error.message.includes('Update the agent host')
			&& !error.message.includes('workspace-less'));
		assert.deepStrictEqual(calls, []);
	});

	test('a ready host remains selectable while another host is reconnecting', async () => {
		const unavailable = new RemoteProvider('unavailable');
		unavailable.connectionStatus.set(RemoteAgentHostConnectionStatus.reconnecting, undefined);
		const ready = new RemoteProvider('ready', 2);
		const { create } = setup([unavailable, ready]);
		assert.strictEqual((await create()).host.id, ready.id);
	});

	test('remote workspace URIs pin the matching host and configure a fresh branch', async () => {
		const hosts = [new RemoteProvider('idle', 0), new RemoteProvider('workspace-host', 4)];
		const uri = hosts[1].mapAgentHostResource(URI.parse('file:///repo'));
		const { create, calls } = setup(hosts);
		await create({ workspace: { uri: uri.toString(), branch: 'main' } });
		assert.deepStrictEqual({
			workspace: calls[0].workspace,
			provider: calls[0].options?.providerId,
			isolation: calls[0].options?.isolationMode,
			branch: calls[0].options?.branch,
			newBranch: calls[0].options?.worktreeCreateNewBranch,
		}, { workspace: uri, provider: hosts[1].id, isolation: 'worktree', branch: 'main', newBranch: true });
	});

	test('explicit folder isolation never configures a branch switch', async () => {
		const { create, calls } = setup([new RemoteProvider('host')]);
		await create({ workspace: { uri: 'file:///repo', isolation: 'folder' } });
		assert.deepStrictEqual({
			isolation: calls[0].options?.isolationMode,
			branch: calls[0].options?.branch,
			newBranch: calls[0].options?.worktreeCreateNewBranch,
		}, { isolation: 'workspace', branch: undefined, newBranch: false });
	});

	test('workspace trust and inspection failures prevent unattended creation', async () => {
		const { create, calls, state } = setup([new RemoteProvider('host')]);
		state.trusted = false;
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }, 'untrusted'), /not trusted/);
		state.trusted = true;
		state.inspectionError = new Error('Directory missing');
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }, 'missing'), /Directory missing/);
		assert.deepStrictEqual(calls, []);
	});

	for (const replaced of [false, true]) {
		for (const change of ['capability', 'cpu', 'memory'] as const) {
			test(`revalidates target ${change} after workspace inspection: replacement=${replaced}`, async () => {
				const host = new RemoteProvider('host');
				const { create, calls, state, service } = setup([host]);
				state.beforeStat = async () => {
					if (replaced) {
						host.connection = new RemoteConnection();
					}
					host.root._meta = change === 'capability' ? undefined : withAgentHostResources(host.root._meta, {
						platform: 'linux', architecture: 'x64',
						cpuCount: change === 'cpu' ? 2 : 8,
						memoryBytes: (change === 'memory' ? 4 : 32) * 1024 ** 3,
					});
				};
				const rejection = {
					capability: /Update the agent host/,
					cpu: /Required 8 logical CPUs/,
					memory: /Required 32 GiB of memory/,
				}[change];
				await assert.rejects(create({
					workspace: { uri: 'file:///repo' },
					requirements: { minCpuCount: 8, minMemoryGiB: 32 },
				}), replaced ? /connection changed/ : rejection);
				assert.deepStrictEqual({ calls, pending: service.listHosts()[0].pendingCreations }, { calls: [], pending: 0 });
			});
		}
	}

	test('does not reuse a default agent choice after a same-address target reconnect', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state } = setup([host, new RemoteProvider('other', 1)]);
		const inspecting = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		state.beforeStat = async () => { await inspecting.complete(); await release.p; };
		const request = create({ hostId: host.id, workspace: { uri: 'file:///repo' } });
		await inspecting.p;
		const replacement = new RemoteProvider('host', 0, 'linux', 'claude');
		host.connection = replacement.connection;
		host.root = replacement.root;
		host.sessionTypes = replacement.sessionTypes;
		await release.complete();
		await assert.rejects(request, /connection changed/);
		assert.deepStrictEqual(calls, []);
	});

	test('rejects target client identity changes on a reused connection', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state } = setup([host]);
		state.beforeStat = async () => { host.connection.clientId = 'replacement-client'; };
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }), /connection changed/);
		assert.deepStrictEqual(calls, []);
	});

	test('refreshes the default agent choice when the same target connection updates its agents', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state, models } = setup([host]);
		state.beforeStat = async () => {
			const updated = new RemoteProvider('host', 0, 'linux', 'claude');
			host.root = updated.root;
			host.sessionTypes = updated.sessionTypes;
			const vendor = updated.sessionTypes[0].chatSessionType!;
			models.set(`${vendor}:test-model`, upcastPartial<ILanguageModelChatMetadata>({ id: 'test-model', vendor, targetChatSessionType: vendor }));
		};
		const result = await create({ workspace: { uri: 'file:///repo' } });
		assert.deepStrictEqual({
			sessionType: calls[0].options?.sessionTypeId,
			modelOverride: calls[0].options?.modelId,
			model: result.model,
		}, { sessionType: 'claude', modelOverride: undefined, model: { provider: 'claude', id: null } });
	});

	test('rejects a requested model hidden during workspace inspection', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state, hiddenModels } = setup([host]);
		state.beforeStat = async () => { hiddenModels.add(`${host.sessionTypes[0].chatSessionType}:test-model`); };
		await assert.rejects(create({
			model: { provider: 'copilot', id: 'test-model' },
			workspace: { uri: 'file:///repo' },
		}), /Model copilot\/test-model is not available/);
		assert.deepStrictEqual(calls, []);
	});

	for (const auto of [false, true]) {
		test(`revalidates default model availability after workspace inspection: Auto=${auto}`, async () => {
			const host = new RemoteProvider('host', 0, 'linux', auto ? 'copilotcli' : 'claude');
			if (auto) {
				host.root.agents[0].models = [];
			}
			const { create, calls, state, hiddenModels, autoModelSessionTypes } = setup([host]);
			if (auto) {
				autoModelSessionTypes.add(host.sessionTypes[0].chatSessionType!);
			}
			state.beforeStat = async () => {
				hiddenModels.add(`${host.sessionTypes[0].chatSessionType}:test-model`);
				autoModelSessionTypes.clear();
			};
			await assert.rejects(create({ workspace: { uri: 'file:///repo' } }), /available model or Auto fallback/);
			assert.deepStrictEqual(calls, []);
		});
	}

	test('revalidates workspace isolation support after inspection', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state } = setup([host]);
		state.beforeStat = async () => {
			host.sessionTypes = host.sessionTypes.map(type => ({ ...type, supportsWorktreeConfiguration: false }));
		};
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }), /No agent supports/);
		assert.deepStrictEqual(calls, []);
	});

	test('unsupported isolation is rejected rather than silently editing a folder', async () => {
		const host = new RemoteProvider('host');
		host.sessionTypes = host.sessionTypes.map(type => ({ ...type, supportsWorktreeConfiguration: false }));
		const { create, calls } = setup([host]);
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }), /No agent supports/);
		assert.deepStrictEqual(calls, []);
	});

	for (const agentProvider of ['claude', 'codex']) {
		test(`folder placement skips ${agentProvider} when isolation cannot be configured`, async () => {
			const unsupported = new RemoteProvider('unsupported', 0, 'linux', agentProvider);
			unsupported.sessionTypes = unsupported.sessionTypes.map(type => ({ ...type, supportsWorktreeConfiguration: false }));
			const supported = new RemoteProvider('supported', 3);
			const { create, calls } = setup([unsupported, supported]);
			const workspace = { uri: 'file:///repo', isolation: 'folder' };
			const result = await create({ workspace });
			await assert.rejects(create({ workspace, model: { provider: agentProvider, id: 'test-model' } }, 'explicit'), /No agent supports/);
			const quick = await create({ model: { provider: agentProvider, id: 'test-model' } }, 'quick');
			assert.deepStrictEqual({
				selected: result.host.id, quick: quick.host.id,
				requestedHosts: calls.map(call => call.options?.providerId),
			}, {
				selected: supported.id, quick: unsupported.id,
				requestedHosts: [supported.id, unsupported.id],
			});
		});
	}

	for (const pending of [true, false]) {
		test(`reports resolved workspace branches only after worktree creation: pending=${pending}`, async () => {
			const { create, state } = setup([new RemoteProvider('host')]);
			state.transformSession = session => {
				const workspace = session.workspace.get()!;
				return {
					...session,
					worktreePending: constObservable(pending),
					workspace: constObservable({
						...workspace,
						folders: workspace.folders.map(folder => ({
							...folder,
							gitRepository: upcastPartial<ISessionGitRepository>({ branchName: 'current-branch', baseBranchName: 'current-base' }),
						})),
					}),
				};
			};
			const result = await create({ workspace: { uri: 'file:///repo', branch: 'requested-base' } });
			assert.deepStrictEqual({
				uri: result.workspace?.uri, branch: result.workspace?.branch,
				baseBranch: result.workspace?.baseBranch, pending: result.workspace?.worktreePending,
			}, {
				uri: pending ? null : result.workspace?.requestedUri,
				branch: pending ? undefined : 'current-branch',
				baseBranch: pending ? undefined : 'current-base',
				pending,
			});
		});
	}

	test('creation failures release reservations without failing over or retrying the prompt', async () => {
		const { create, calls, state, service, backgroundEvents } = setup([new RemoteProvider('a'), new RemoteProvider('b')]);
		state.beforeCommit = async () => { throw new Error('Connection lost during creation'); };
		await assert.rejects(create(), /Connection lost/);
		await assert.rejects(create(), /Connection lost/);
		assert.deepStrictEqual({ calls: calls.length, pending: service.listHosts().map(host => host.pendingCreations) }, { calls: 1, pending: [0, 0] });
		assert.strictEqual(backgroundEvents.at(-1), 'dispose');
	});

	test('retains initial remote chats before dispatch and releases them only after background work finishes', async () => {
		const { create, state, backgroundEvents } = setup([new RemoteProvider('host')]);
		state.beforeCommit = async () => {
			assert.deepStrictEqual(backgroundEvents.map(event => event.split(':')[0]), ['acquire']);
		};
		await create();
		assert.deepStrictEqual(backgroundEvents.map(event => event.split(':')[0]), ['acquire', 'releaseWhenIdle']);
	});

	test('source-host unavailability and inherited recursion limits do not start work', async () => {
		const { create, calls, state } = setup([new RemoteProvider('host')]);
		state.sourceConnected = false;
		await assert.rejects(create({}, 'offline'), /not registered and connected/);
		state.sourceConnected = true;
		state.sourceMetadata = { ...state.sourceMetadata, _meta: withSessionSpawnDepth(undefined, 3) };
		await assert.rejects(create({}, 'depth'), /recursion limit/);
		assert.deepStrictEqual(calls, []);
	});

	for (const replaced of [false, true]) {
		test(`revalidates the source after asynchronous candidate discovery: replacement=${replaced}`, async () => {
			const { create, calls, state } = setup([new RemoteProvider('host')]);
			const inspecting = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			state.beforeStat = async () => { await inspecting.complete(); await release.p; };
			const request = create({ workspace: { uri: 'file:///repo' } });
			await inspecting.p;
			if (replaced) {
				state.sourceClientId = 'replacement-client';
			} else {
				state.sourceConnected = false;
			}
			await release.complete();
			await assert.rejects(request, /not registered and connected|connection changed/);
			assert.deepStrictEqual(calls, []);
		});
	}

	test('revalidates the source after preparing the child, before sending its prompt', async () => {
		const { create, state, backgroundEvents } = setup([new RemoteProvider('host')]);
		let committed = false;
		state.beforeAcquire = async () => { state.sourceConnected = false; };
		state.beforeCommit = async () => { committed = true; };
		await assert.rejects(create(), /not registered and connected/);
		assert.deepStrictEqual({ committed, released: backgroundEvents.at(-1) }, { committed: false, released: 'dispose' });
	});

	test('rejects a target reconnect after preparing the child without dispatching or failing over', async () => {
		const host = new RemoteProvider('host');
		const { create, calls, state, backgroundEvents } = setup([host, new RemoteProvider('other', 1)]);
		let committed = false;
		state.beforeAcquire = async () => { host.connection = new RemoteConnection(); };
		state.beforeCommit = async () => { committed = true; };
		await assert.rejects(create(), /connection changed/);
		assert.deepStrictEqual({
			requestedHosts: calls.map(call => call.options?.providerId),
			committed,
			released: backgroundEvents.at(-1),
		}, { requestedHosts: [host.id], committed: false, released: 'dispose' });
	});

	for (const enabled of [undefined, false]) {
		test(`remote tools require opt-in for discovery and creation: ${enabled}`, async () => {
			const { service, create, configuration, calls } = setup([new RemoteProvider('host')]);
			await configuration.setUserConfiguration(RemoteSessionToolsEnabledSettingId, enabled);
			assert.throws(() => service.listHosts(), /disabled/);
			assert.throws(() => create(), /disabled/);
			assert.deepStrictEqual(calls, []);
		});
	}

	test('disabling remote tools during workspace inspection prevents creation', async () => {
		const { create, configuration, calls, state } = setup([new RemoteProvider('host')]);
		state.beforeStat = async () => { await configuration.setUserConfiguration(RemoteSessionToolsEnabledSettingId, false); };
		await assert.rejects(create({ workspace: { uri: 'file:///repo' } }), /disabled/);
		assert.deepStrictEqual(calls, []);
	});

	test('disabling remote tools during child preparation prevents the first prompt and releases its reference', async () => {
		const { create, configuration, state, backgroundEvents } = setup([new RemoteProvider('host')]);
		let committed = false;
		state.beforeAcquire = async () => { await configuration.setUserConfiguration(RemoteSessionToolsEnabledSettingId, false); };
		state.beforeCommit = async () => { committed = true; };
		await assert.rejects(create(), /disabled/);
		assert.deepStrictEqual({
			committed,
			backgroundEvents: backgroundEvents.map(event => event.split(':')[0]),
		}, { committed: false, backgroundEvents: ['acquire', 'dispose'] });
	});

	test('disabled remote hosts and AI features prevent invocation even with remote tools enabled', async () => {
		const { create, configuration, calls } = setup([new RemoteProvider('host')]);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		assert.throws(() => create({}, 'disabled-hosts'), /disabled/);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		assert.throws(() => create({}, 'disabled-ai'), /disabled/);
		assert.deepStrictEqual(calls, []);
	});

	test('cancellation before dispatch starts no session', async () => {
		const { service, sourceChat, calls } = setup([new RemoteProvider('host')]);
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(service.createSession(parseCreateRemoteSessionOptions({ prompt: 'Test' }), sourceChat.resource, 'cancelled', cancellation.token), /Canceled/);
		assert.deepStrictEqual(calls, []);
	});
});
