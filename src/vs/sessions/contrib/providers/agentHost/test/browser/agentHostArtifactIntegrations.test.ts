/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, ImmortalReference, IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { deepFreeze } from '../../../../../../base/common/objects.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChatState, ComponentToState, RootState, ROOT_STATE_URI, SessionState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostArtifactIntegrationsConfigKey } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { AgentMergeConfigKey } from '../../../../../../platform/agentHost/common/agentMerge.js';
import { ArtifactChatAction } from '../../../../../../platform/agentHost/common/artifactIntegrationChat.js';
import { SESSION_META_ARTIFACTS_KEY, SessionArtifactType } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { gitHubPullRequestArtifactIntegrationId, gitHubPullRequestArtifactWorkspaceSettingsKey } from '../../../../../../platform/agentHost/common/githubPullRequestArtifact.js';
import { ActionEnvelope, ActionType, INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { ArtifactDetails, ArtifactIntegrationDescriptor, ArtifactIntegrationsSettingId, ArtifactRun, ArtifactSnapshot, IArtifactDetailsModel, IArtifactModel, isArtifactRunSettled } from '../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { ArtifactIntegrationClient, ArtifactIntegrationRequest, ArtifactIntegrationResponse, ArtifactIntegrationServer, IArtifactIntegrationTransport } from '../../../../../../platform/artifactIntegrations/common/artifactIntegrationProtocol.js';
import { ArtifactIntegrationRegistry, IArtifactIntegrationRegistry } from '../../../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactAutomationNotice } from '../../../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { CHAT_SETUP_ACTION_ID } from '../../../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../../workbench/services/extensions/common/extensions.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentHostArtifactIntegrations, createHostFacingArtifactAccess, IArtifactWorkspaceConfigurationContext, mapArtifactModelChats } from '../../browser/agentHostArtifactIntegrations.js';
import { createGitHubPullRequestArtifactWorkspaceConfigurationSynchronizer } from '../../browser/githubPullRequestArtifactWorkspaceConfiguration.js';
import { createClientArtifactRuntime } from '../../../../../services/artifactIntegrations/browser/clientArtifactRuntime.js';

suite('Agent Host artifact chat mapping', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const backend = ['vendor-chat://opaque/one?scope=custom', 'urn:vendor:chat:two'];
		const clients = [URI.parse('client-chat:/session/main'), URI.parse('client-chat:/session/side')];
		const chats = observableValue<readonly { client: URI; backend: string | undefined }[]>('chat mappings', clients.map((client, index) => ({ client, backend: backend[index] })));
		const runs: readonly ArtifactRun[] = [...backend, 'vendor-chat://deleted'].map((chat, index) => ({
			id: `opaque/run#${index}`, bindingId: 'opaque-binding', integrationId: 'test', requestId: `request:${index}`, actionId: 'fix', actionKind: 'prompt',
			actionConsent: 'consent', source: 'manual', state: 'completed', createdAt: index, updatedAt: index, reason: 'Finished', dispatched: true,
			chat, receipt: { kind: 'turn', turnId: `opaque-turn/${index}` },
		}));
		const snapshot = observableValue<ArtifactSnapshot>('snapshot', deepFreeze({
			authority: { id: 'vendor', location: 'host', targetHost: 'remote' }, session: 'vendor-session://opaque',
			artifact: { id: 'artifact', label: 'Artifact', resource: 'https://example.test/artifact', origin: { chat: backend[0] } },
			mainIntegrationId: 'test', runs,
			contributions: [{
				integrationId: 'test', label: 'Test', actions: [], options: [],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: {
					availability: { kind: 'available' }, sections: [], automationAvailability: [],
					stateActions: [{ id: 'fix', enabled: true, chatAvailability: { [backend[0]]: { enabled: true }, [backend[1]]: { enabled: false } } }],
					generalActions: [{ id: 'refresh', enabled: true, chatAvailability: { [backend[1]]: { enabled: true } } }],
				},
			}],
		}));
		const invoked: { integrationId: string; actionId: string; chat: string; requestId: string }[] = [];
		const pages: { before: string | undefined; limit: number | undefined }[] = [];
		const cancelled: string[] = [];
		const reconciled: string[] = [];
		const authenticated: string[] = [];
		const configured: { integrationId: string; revision: number; values: Readonly<Record<string, boolean | string>> }[] = [];
		const details: IArtifactDetailsModel = {
			details: constObservable<ArtifactDetails>({ title: 'Details', availability: { kind: 'available' }, completeness: 'complete', items: [], links: [] }),
			dispose: () => { },
		};
		const source: IArtifactModel = {
			snapshot,
			invoke: async (integrationId, actionId, chat, requestId) => { invoked.push({ integrationId, actionId, chat, requestId }); return runs[1]; },
			getRuns: async (before, limit) => { pages.push({ before, limit }); return { runs, next: 'opaque:next/%2F#cursor' }; },
			cancel: async id => { cancelled.push(id); },
			reconcile: async id => { reconciled.push(id); },
			requestAuthentication: async id => { authenticated.push(id); return { resource: 'https://api.example.test' }; },
			configure: async (integrationId, revision, values) => { configured.push({ integrationId, revision, values }); },
			acquireDetails: async () => details,
		};
		return { model: mapArtifactModelChats(source, chats, isEqual), source, snapshot, chats, runs, backend, clients, invoked, pages, cancelled, reconciled, authenticated, configured, details };
	}

	test('maps opaque advertised chats on every outward surface and preserves execution identity', async () => {
		const f = fixture();
		const mapped = f.model.snapshot.get();
		const result = await f.model.invoke('test', 'fix', f.clients[0].toString(), 'client-request');
		const history = await f.model.getRuns('opaque:before', 25);
		await f.model.cancel(f.runs[0].id);
		await f.model.reconcile(f.runs[1].id);
		await f.model.requestAuthentication('test');
		await f.model.configure('test', 4, { autoFix: false });
		const details = await f.model.acquireDetails('test', 'details');
		assert.deepStrictEqual({
			chatKeys: mapped.contributions.map(contribution => ({
				state: contribution.view.stateActions[0].chatAvailability, general: contribution.view.generalActions[0].chatAvailability,
			})),
			chats: mapped.runs.map(run => run.chat), history: history.runs, result,
			next: history.next, invoked: f.invoked, pages: f.pages, cancelled: f.cancelled, reconciled: f.reconciled,
			authenticated: f.authenticated, configured: f.configured, sameDetails: details === f.details,
			unchangedSource: f.snapshot.get().runs.map(run => run.chat), unchangedOrigin: mapped.artifact.origin?.chat,
		}, {
			chatKeys: [{ state: { [f.clients[0].toString()]: { enabled: true }, [f.clients[1].toString()]: { enabled: false } }, general: { [f.clients[1].toString()]: { enabled: true } } }],
			chats: [f.clients[0].toString(), f.clients[1].toString(), undefined],
			history: f.runs.map((run, index) => ({ ...run, chat: f.clients[index]?.toString() })),
			result: { ...f.runs[1], chat: f.clients[1].toString() }, next: 'opaque:next/%2F#cursor',
			invoked: [{ integrationId: 'test', actionId: 'fix', chat: f.backend[0], requestId: 'client-request' }],
			pages: [{ before: 'opaque:before', limit: 25 }], cancelled: [f.runs[0].id], reconciled: [f.runs[1].id],
			authenticated: ['test'], configured: [{ integrationId: 'test', revision: 4, values: { autoFix: false } }], sameDetails: true,
			unchangedSource: [...f.backend, 'vendor-chat://deleted'], unchangedOrigin: f.backend[0],
		});
	});

	test('refreshes mappings reactively and uses current mappings for late history and invocation results', async () => {
		const f = fixture();
		const history = new DeferredPromise<{ runs: readonly ArtifactRun[] }>();
		const invocation = new DeferredPromise<ArtifactRun>();
		f.source.getRuns = () => history.p;
		f.source.invoke = () => invocation.p;
		const pendingPage = f.model.getRuns();
		const pendingRun = f.model.invoke('test', 'fix', f.clients[0].toString(), 'request');
		const replacement = URI.parse('client-chat:/adopted/chat');
		f.chats.set([{ client: replacement, backend: f.backend[1] }, { client: f.clients[0], backend: undefined }], undefined);
		await history.complete({ runs: f.runs });
		await invocation.complete(f.runs[1]);
		await assert.rejects(() => f.model.invoke('test', 'fix', f.clients[0].toString(), 'missing'), /has not been resolved/);
		await assert.rejects(() => f.model.invoke('test', 'fix', f.clients[1].toString(), 'foreign'), /does not belong/);
		assert.deepStrictEqual({
			snapshot: f.model.snapshot.get().runs.map(run => run.chat),
			page: (await pendingPage).runs.map(run => run.chat), result: (await pendingRun).chat,
			availability: f.model.snapshot.get().contributions[0].view.stateActions[0].chatAvailability,
		}, { snapshot: [undefined, replacement.toString(), undefined], page: [undefined, replacement.toString(), undefined], result: replacement.toString(), availability: { [replacement.toString()]: { enabled: false } } });
	});
});

suite('Agent Host host-facing artifact access', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lets the host observe artifacts and run native actions, but not sign in, post notices, or submit prompts', async () => {
		const snapshot = constObservable<ArtifactSnapshot>({
			authority: { id: 'client', targetHost: 'vendor', location: 'client' }, session: 'vendor-session://opaque',
			artifact: { id: 'experiment', label: 'Experiment', resource: 'https://experiments.test/feature' }, runs: [],
			contributions: [{
				integrationId: 'extension.test', label: 'Extension', options: [],
				actions: [{ id: 'start', iconId: 'play', label: 'Start', kind: 'code' }, { id: 'fix', iconId: 'sparkle', label: 'Fix', kind: 'prompt' }],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: { availability: { kind: 'available' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
			}],
		});
		const invoked: string[] = [];
		const configured: string[] = [];
		let released = 0;
		const access = createHostFacingArtifactAccess({
			acquireArtifact: async () => ({
				object: upcastPartial<IArtifactModel>({
					snapshot,
					requestAuthentication: async () => ({ resource: 'https://experiments.test' }),
					invoke: async (_integrationId, actionId, _chat, requestId) => { invoked.push(actionId); return upcastPartial<ArtifactRun>({ id: requestId }); },
					configure: async integrationId => { configured.push(integrationId); },
				}),
				dispose: () => released++,
			}),
			postNotice: async () => { },
		});
		const reference = await access.acquireArtifact('vendor-session://opaque', 'experiment');
		const outcomes = await Promise.allSettled([
			reference.object.requestAuthentication('extension.test'),
			reference.object.invoke('extension.test', 'fix', 'vendor-chat://opaque', 'prompt'),
			reference.object.invoke('extension.test', 'missing', 'vendor-chat://opaque', 'missing'),
			reference.object.invoke('extension.test', 'start', 'vendor-chat://opaque', 'native'),
			reference.object.configure('extension.test', 0, { auto: true }),
		]);
		reference.dispose();

		assert.deepStrictEqual({
			postNotice: access.postNotice,
			outcomes: outcomes.map(outcome => outcome.status === 'fulfilled' ? outcome.value : (outcome.reason as Error).message),
			invoked, configured, released,
			sameSnapshot: reference.object.snapshot === snapshot,
		}, {
			postNotice: undefined,
			outcomes: [
				'Sign in from the Agents window instead.',
				'The agent host can only run native artifact actions.',
				'The agent host can only run native artifact actions.',
				{ id: 'native' },
				undefined,
			],
			invoked: ['start'], configured: ['extension.test'], released: 1,
			sameSnapshot: true,
		});
	});
});

suite('Agent Host artifact workspace settings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createInstantiation(lifetime: Pick<DisposableStore, 'add'>, enabled = true) {
		const instantiation = workbenchInstantiationService(undefined, lifetime);
		const configuration = new TestConfigurationService({ [ArtifactIntegrationsSettingId]: enabled });
		lifetime.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		return { instantiation, configuration };
	}

	async function setEnabled(configuration: TestConfigurationService, enabled: boolean): Promise<void> {
		await configuration.setUserConfiguration(ArtifactIntegrationsSettingId, enabled);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: setting => setting === ArtifactIntegrationsSettingId,
		}));
	}

	const emptyClientHost = (snapshot: IObservable<ArtifactSnapshot>) => () => ({
		client: {
			acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({
				snapshot: derived(reader => ({ ...snapshot.read(reader), authority: { id: 'client', targetHost: 'self', location: 'client' as const }, contributions: [], runs: [] })),
			})),
		},
		dispose: () => { },
	});


	for (const supported of [true, false]) {
		test(`client resource actions work with host integration capability ${supported} and pause on authority, connection, or AI changes`, async () => {
			const lifetime = store.add(new DisposableStore());
			try {
				const { instantiation } = createInstantiation(lifetime);
				const registry = lifetime.add(new ArtifactIntegrationRegistry());
				instantiation.stub(IArtifactIntegrationRegistry, registry);
				instantiation.stub(IRemoteAgentHostConnectionCustomizationService, new RemoteAgentHostConnectionCustomizationService());
				const permitted = observableValue('permitted', true);
				const sentimentChanged = lifetime.add(new Emitter<void>());
				instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
					get sentiment() { return { hidden: !permitted.get() }; }, onDidChangeSentiment: sentimentChanged.event,
				}));
				let effects = 0;
				const phases: string[] = [];
				instantiation.stub(IExtensionService, upcastPartial<IExtensionService>({
					activateByEvent: async event => {
						phases.push(event);
						lifetime.add(registry.register({
							id: 'extension.test', label: 'Extension', automationOptions: [],
							match: resource => ({ resource, key: resource.toString(), credentialScope: 'test-account' }),
							createResource: async () => new DisposableStore(),
							createBinding: () => ({
								view: constObservable({
									availability: { kind: 'available' as const }, sections: [],
									stateActions: [{ id: 'start', enabled: true }], generalActions: [], automationAvailability: [],
								}),
								actions: [{
									id: 'start', label: 'Start', iconId: 'play', kind: 'code' as const, executionScope: 'resource' as const,
									prepare: async () => ({ kind: 'ready' as const, value: { run: async () => { effects++; return { kind: 'completed' as const, summary: 'Started' }; } } }),
								}],
								acquireDetails: () => { throw new Error('No details in this test'); },
								activateAutomation: () => Disposable.None,
								dispose: () => { },
							}),
						}, 'extension-runtime'));
					},
				}));
				const session = 'vendor-session://opaque/path?namespace=custom';
				const subscriptions: string[] = [];
				const connected = observableValue('connected', true);
				const initial = upcastPartial<InitializeResult>({ _meta: supported ? { 'vscode.artifactIntegrations': 1 } : {} });
				const initializeResult = observableValue('initializeResult', initial);
				const hostSnapshot = constObservable<ArtifactSnapshot>({
					authority: { id: 'host', targetHost: 'vendor', location: 'host' }, session,
					artifact: { id: 'experiment', label: 'Experiment', resource: 'https://experiments.test/feature' },
					contributions: [], runs: [],
				});
				const server = lifetime.add(new ArtifactIntegrationServer({
					acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot: hostSnapshot })),
				}));
				const state = upcastPartial<SessionState>({
					_meta: { [SESSION_META_ARTIFACTS_KEY]: [{ id: 'experiment', type: SessionArtifactType.Website, label: 'Experiment', isArtifact: true, link: 'https://experiments.test/feature' }] },
				});
				const connection = new class extends mock<IAgentConnection>() {
					override readonly onDidNotification = Event.None;
					override readonly initializeResult = initializeResult;
					override readonly connectionAvailable = connected;
					override readonly onDidAction = Event.None;
					override readonly artifactIntegrationTransport = { onDidUpdate: server.onDidUpdate, request: (request: Parameters<ArtifactIntegrationServer['request']>[0]) => server.request(request) };
					override getSubscription<T extends StateComponents>(component: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
						assert.strictEqual(component, StateComponents.Session);
						phases.push('subscribe');
						subscriptions.push(resource.toString(true));
						return new ImmortalReference(new class extends mock<IAgentSubscription<ComponentToState[T]>>() {
							override readonly onDidChange = Event.None;
							override readonly value = state as ComponentToState[T];
							override readonly verifiedValue = state as ComponentToState[T];
						}());
					}
				}();
				let persisted: string | undefined;
				const integrations = lifetime.add(instantiation.createInstance(AgentHostArtifactIntegrations, 'vendor', undefined, (_scope, createRuntime) => ({
					client: lifetime.add(createRuntime('client', {
						read: async () => persisted, write: async value => { persisted = value; },
					}, () => !lifetime.isDisposed)),
					dispose: () => { },
				}), undefined));
				integrations.setConnection(connection);
				const model = lifetime.add(await integrations.acquireArtifact(session, 'experiment')).object;
				await waitForState(model.snapshot, snapshot => snapshot.contributions.some(contribution => contribution.integrationId === 'extension.test'));
				await model.invoke('extension.test', 'start', 'vendor-chat://opaque', 'start-once');
				await waitForState(model.snapshot, snapshot => snapshot.runs.some(run => isArtifactRunSettled(run) || run.state === 'blocked'));
				initializeResult.set(upcastPartial<InitializeResult>({ _meta: supported ? {} : { 'vscode.artifactIntegrations': 1 } }), undefined);
				const authorityChanged = model.snapshot.get().contributions[0].view.stateActions[0].enabled;
				initializeResult.set(initial, undefined);
				connected.set(false, undefined);
				const disconnected = model.snapshot.get().contributions[0].view.stateActions[0].enabled;
				connected.set(true, undefined);
				permitted.set(false, undefined);
				sentimentChanged.fire();
				assert.deepStrictEqual({
					effects, phases, subscriptions, authorityChanged, disconnected,
					disabledAI: model.snapshot.get().contributions[0].view.stateActions[0].enabled,
					runs: model.snapshot.get().runs.map(run => run.state),
				}, {
					effects: 1, phases: ['onChatArtifactIntegration', 'subscribe'], subscriptions: [session],
					authorityChanged: false, disconnected: false, disabledAI: false, runs: ['completed'],
				});
			} finally {
				lifetime.dispose();
				await timeout(0);
			}
		});
	}

	test('offers its own integrations to a capable host and serves the host\'s requests for them', async () => {
		const lifetime = store.add(new DisposableStore());
		try {
			const { instantiation, configuration } = createInstantiation(lifetime, false);
			const registry = lifetime.add(new ArtifactIntegrationRegistry());
			instantiation.stub(IArtifactIntegrationRegistry, registry);
			instantiation.stub(IRemoteAgentHostConnectionCustomizationService, new RemoteAgentHostConnectionCustomizationService());
			instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
			const activations: string[] = [];
			instantiation.stub(IExtensionService, upcastPartial<IExtensionService>({
				activateByEvent: async event => {
					activations.push(event);
					if (!registry.integrations.get().length) {
						lifetime.add(registry.register({
							id: 'extension.test', label: 'Extension', description: 'Experiment links', automationOptions: [],
							match: resource => ({ resource, key: resource.toString(), credentialScope: 'test-account' }),
							createResource: async () => new DisposableStore(),
							createBinding: () => ({
								view: constObservable({ availability: { kind: 'available' as const }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] }),
								actions: [],
								acquireDetails: () => { throw new Error('No details in this test'); },
								activateAutomation: () => Disposable.None,
								dispose: () => { },
							}),
						}, 'extension-runtime'));
					}
				},
			}));
			const session = 'vendor-session://opaque';
			const state = upcastPartial<SessionState>({
				_meta: { [SESSION_META_ARTIFACTS_KEY]: [{ id: 'experiment', type: SessionArtifactType.Website, label: 'Experiment', isArtifact: true, link: 'https://experiments.test/feature' }] },
			});
			const hostServer = lifetime.add(new ArtifactIntegrationServer({ acquireArtifact: async () => { throw new Error('Unused'); } }));
			const served: { readonly server: IArtifactIntegrationTransport; readonly integrations: IObservable<readonly ArtifactIntegrationDescriptor[]> }[] = [];
			let withdrawn = 0;
			const connection = new class extends mock<IAgentConnection>() {
				override readonly onDidNotification = Event.None;
				override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.artifactIntegrations': 1 } }));
				override readonly connectionAvailable = constObservable(true);
				override readonly onDidAction = Event.None;
				override readonly artifactIntegrationTransport = { onDidUpdate: hostServer.onDidUpdate, request: (request: ArtifactIntegrationRequest) => hostServer.request(request) };
				override serveArtifactIntegrations(createServer: () => IArtifactIntegrationTransport & IDisposable, integrations: IObservable<readonly ArtifactIntegrationDescriptor[]>) {
					served.push({ server: lifetime.add(createServer()), integrations });
					return { dispose: () => withdrawn++ };
				}
				override getSubscription<T extends StateComponents>(_component: T, _resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
					return new ImmortalReference(new class extends mock<IAgentSubscription<ComponentToState[T]>>() {
						override readonly onDidChange = Event.None;
						override readonly value = state as ComponentToState[T];
						override readonly verifiedValue = state as ComponentToState[T];
					}());
				}
			}();
			const integrations = lifetime.add(instantiation.createInstance(AgentHostArtifactIntegrations, 'vendor', undefined, (_scope, createRuntime) => ({
				client: lifetime.add(createRuntime('client', { read: async () => undefined, write: async () => { } }, () => !lifetime.isDisposed)),
				dispose: () => { },
			}), undefined));
			integrations.setConnection(connection);
			const whileDisabled = { offered: served.length, activations: activations.length };
			await setEnabled(configuration, true);
			const catalogBeforeAnyArtifact = served[0].integrations.get();
			const host = lifetime.add(new ArtifactIntegrationClient(served[0].server, new NullLogService()));
			const reference = await host.acquireArtifact(session, 'experiment');
			const snapshot = await waitForState(reference.object.snapshot, value => value.contributions.length > 0);
			reference.dispose();
			await served[0].server.request({ kind: 'acquire', subscription: 'direct', session, artifactId: 'experiment' });
			const refused = await Promise.allSettled([
				served[0].server.request({ kind: 'authenticate', subscription: 'direct', integrationId: 'extension.test' }),
				served[0].server.request({ kind: 'notice', subscription: 'direct', notice: { kind: 'enabled', content: 'Enabled automatically.' } }),
			]);
			await served[0].server.request({ kind: 'release', subscription: 'direct' });
			await setEnabled(configuration, false);
			await assert.rejects(integrations.acquireArtifact(session, 'experiment'), /unavailable/);
			await setEnabled(configuration, true);
			const withdrawnBeforeDisposal = withdrawn;
			integrations.dispose();

			assert.deepStrictEqual({
				whileDisabled, offered: served.length, activations: [...new Set(activations)],
				catalogBeforeAnyArtifact,
				contributions: snapshot.contributions.map(contribution => contribution.integrationId),
				refused: refused.map(result => result.status === 'rejected' ? (result.reason as Error).message : result.status),
				withdrawn: [withdrawnBeforeDisposal, withdrawn],
			}, {
				whileDisabled: { offered: 0, activations: 0 }, offered: 2, activations: ['onChatArtifactIntegration'],
				catalogBeforeAnyArtifact: [{ id: 'extension.test', label: 'Extension', description: 'Experiment links', automationOptions: [] }],
				contributions: ['extension.test'],
				refused: ['Sign in from the Agents window instead.', 'This artifact coordinator does not support client automation notices'],
				withdrawn: [1, 2],
			});
		} finally {
			lifetime.dispose();
			await timeout(0);
		}
	});

	for (const phase of ['startup', 'acquisition', 'pending'] as const) {
		test(`local ${phase} does not block host integrations and late leases are released`, async () => {
			const lifetime = store.add(new DisposableStore());
			try {
				const { instantiation } = createInstantiation(lifetime);
				instantiation.stub(IArtifactIntegrationRegistry, lifetime.add(new ArtifactIntegrationRegistry()));
				instantiation.stub(IRemoteAgentHostConnectionCustomizationService, new RemoteAgentHostConnectionCustomizationService());
				instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
				let errors = 0;
				instantiation.stub(ILogService, lifetime.add(new class extends NullLogService {
					override error(): void { errors++; }
				}()));
				const snapshot = constObservable<ArtifactSnapshot>({
					authority: { id: 'host', targetHost: 'vendor', location: 'host' }, session: 'vendor-session://opaque',
					artifact: { id: 'item', label: 'Item', resource: 'https://example.test/item' }, runs: [],
					contributions: [{
						integrationId: 'vendor.integration', label: 'Vendor', actions: [], options: [],
						configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
						view: { availability: { kind: 'available' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
					}],
				});
				const server = lifetime.add(new ArtifactIntegrationServer({
					acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot })),
				}));
				const connection = new class extends mock<IAgentConnection>() {
					override readonly onDidNotification = Event.None;
					override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.artifactIntegrations': 1 } }));
					override readonly connectionAvailable = constObservable(true);
					override readonly artifactIntegrationTransport = { onDidUpdate: server.onDidUpdate, request: (request: Parameters<ArtifactIntegrationServer['request']>[0]) => server.request(request) };
				}();
				const pending = new DeferredPromise<IReference<IArtifactModel>>();
				const integrations = lifetime.add(instantiation.createInstance(AgentHostArtifactIntegrations, 'vendor', undefined, () => {
					if (phase === 'startup') {
						throw new Error('Local startup failed');
					}
					return {
						client: {
							acquireArtifact: async () => {
								if (phase === 'acquisition') {
									throw new Error('Local acquisition failed');
								}
								return pending.p;
							},
						},
						dispose: () => { },
					};
				}, undefined));
				integrations.setConnection(connection);
				const reference = lifetime.add(await integrations.acquireArtifact('vendor-session://opaque', 'item'));
				const ids = reference.object.snapshot.get().contributions.map(contribution => contribution.integrationId);
				reference.dispose();
				let released = 0;
				if (phase === 'pending') {
					await pending.complete({ object: upcastPartial<IArtifactModel>({ snapshot }), dispose: () => released++ });
				}
				await timeout(0);
				assert.deepStrictEqual({ ids, errors, released }, {
					ids: ['vendor.integration'], errors: phase === 'pending' ? 0 : 1, released: phase === 'pending' ? 1 : 0,
				});
			} finally {
				lifetime.dispose();
				await timeout(0);
			}
		});
	}

	test('mirrors only workspace overrides into artifact-scoped session configuration and resends after reconnect', async () => {
		const { instantiation } = createInstantiation(store);
		let inspected: IConfigurationValue<readonly string[]> = { userValue: ['Global *'], workspaceValue: ['Workspace *'], workspaceFolderValue: ['Folder *'] };
		const configuration = new class extends TestConfigurationService {
			override inspect<T>(): IConfigurationValue<T> { return inspected as IConfigurationValue<T>; }
		}({ [ArtifactIntegrationsSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IArtifactIntegrationRegistry, store.add(new ArtifactIntegrationRegistry()));
		instantiation.stub(IRemoteAgentHostConnectionCustomizationService, new RemoteAgentHostConnectionCustomizationService());
		instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
		const snapshot = constObservable<ArtifactSnapshot>({
			authority: { id: 'host', targetHost: 'self', location: 'host' }, session: 'session',
			artifact: { id: 'pr', label: 'PR', resource: 'https://github.com/octo/repo/pull/42' }, runs: [],
			contributions: [{
				integrationId: gitHubPullRequestArtifactIntegrationId, label: 'GitHub', actions: [], options: [],
				configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
				view: { availability: { kind: 'available' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
			}],
		});
		const server = store.add(new ArtifactIntegrationServer({
			acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot })),
		}));
		const connected = observableValue('connected', true);
		const actions = store.add(new Emitter<ActionEnvelope>());
		const patches: { channel: string; config: Record<string, unknown> }[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly onDidNotification = Event.None;
			override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.artifactIntegrations': 1 } }));
			override readonly connectionAvailable = connected;
			override readonly onDidAction = actions.event;
			override readonly artifactIntegrationTransport = { onDidUpdate: server.onDidUpdate, request: (request: Parameters<ArtifactIntegrationServer['request']>[0]) => server.request(request) };
			override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
				if (action.type === ActionType.SessionConfigChanged) {
					patches.push({ channel, config: action.config });
				} else {
					assert.fail(`Unexpected action: ${action.type}`);
				}
			}
		}();
		const integrations = store.add(instantiation.createInstance(
			AgentHostArtifactIntegrations,
			'test-host',
			undefined,
			emptyClientHost(snapshot),
			createGitHubPullRequestArtifactWorkspaceConfigurationSynchronizer(configuration),
		));
		integrations.setConnection(connection);
		const workspace = observableValue<IArtifactWorkspaceConfigurationContext | undefined>('workspace', {
			chat: 'chat', workingDirectory: 'file:///repo', resource: URI.file('/repo'),
		});
		const reference = store.add(await integrations.acquireArtifact('session', 'pr', workspace));
		connected.set(false, undefined);
		connected.set(true, undefined);
		actions.fire({ channel: 'another-session', serverSeq: 1, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		actions.fire({ channel: 'session', serverSeq: 2, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		inspected = { userValue: ['Global *'] };
		workspace.set({ ...workspace.get()!, resource: URI.file('/another-workspace') }, undefined);
		reference.dispose();
		workspace.set(undefined, undefined);
		actions.fire({ channel: 'session', serverSeq: 3, origin: undefined, action: { type: ActionType.SessionConfigChanged, config: {}, replace: true } });
		const key = gitHubPullRequestArtifactWorkspaceSettingsKey('pr');
		assert.deepStrictEqual(patches, [
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: { chat: 'chat', workingDirectory: 'file:///repo', ignoredChecks: ['Folder *'] } } },
			{ channel: 'session', config: { [key]: null } },
		]);
	});

	for (const remoteAddress of [undefined, 'custom-host:opaque-address']) {
		test(`artifact sign-in uses the advertised resource and ${remoteAddress ? 'remote credential transform' : 'local authentication flow'}`, async () => {
			const { instantiation } = createInstantiation(store);
			instantiation.stub(IArtifactIntegrationRegistry, store.add(new ArtifactIntegrationRegistry()));
			instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ sentiment: { hidden: false }, onDidChangeSentiment: Event.None }));
			const customizations = new RemoteAgentHostConnectionCustomizationService();
			instantiation.stub(IRemoteAgentHostConnectionCustomizationService, customizations);
			const metadata = { resource: 'https://host.example.test/protected/repository', authorizationServers: ['https://login.example.test/oauth'], scopes: ['read'] };
			const transformed: string[] = [];
			if (remoteAddress) {
				store.add(customizations.register(address => address === remoteAddress, () => ({
					authenticate: async request => {
						transformed.push(request.resource);
						return { ...request, token: 'sealed-token' };
					},
				})));
			}
			const commands: string[] = [];
			let signedIn = false;
			instantiation.stub(ICommandService, new class extends mock<ICommandService>() {
				override async executeCommand<T>(id: string): Promise<T | undefined> {
					commands.push(id);
					signedIn = true;
					return { success: true } as T;
				}
			}());
			instantiation.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
				override async getOrActivateProviderIdForServer(): Promise<string> { return 'test-auth'; }
				override async getSessions() {
					return signedIn ? [{ id: 'session', account: { id: 'account', label: 'Account' }, scopes: ['read'], accessToken: 'plain-token' }] : [];
				}
			}());
			const snapshot = constObservable<ArtifactSnapshot>({
				authority: { id: 'host-opaque', targetHost: 'target-opaque', location: 'host' }, session: 'vendor-session://opaque',
				artifact: { id: 'item', label: 'Item', resource: 'https://example.test/items/42' }, runs: [],
				contributions: [{
					integrationId: 'vendor.integration', label: 'Vendor', authentication: { enabled: true },
					actions: [], options: [], configuration: { revision: 0, values: {}, generations: {}, disablements: {} },
					view: { availability: { kind: 'authenticationRequired', reason: 'Sign in' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
				}],
			});
			const server = store.add(new ArtifactIntegrationServer({
				acquireArtifact: async () => new ImmortalReference(upcastPartial<IArtifactModel>({ snapshot, requestAuthentication: async () => metadata })),
			}));
			const forwarded: { resource: string; token: string; scopes?: readonly string[] }[] = [];
			const connection = new class extends mock<IAgentConnection>() {
				override readonly onDidNotification = Event.None;
				override readonly initializeResult = constObservable(upcastPartial<InitializeResult>({ _meta: { 'vscode.artifactIntegrations': 1 } }));
				override readonly connectionAvailable = constObservable(true);
				override readonly artifactIntegrationTransport = { onDidUpdate: server.onDidUpdate, request: (request: Parameters<ArtifactIntegrationServer['request']>[0]) => server.request(request) };
				override async authenticate(request: Parameters<IAgentConnection['authenticate']>[0]) {
					forwarded.push(request);
					return { authenticated: true };
				}
			}();
			const integrations = store.add(instantiation.createInstance(AgentHostArtifactIntegrations, 'opaque-provider', remoteAddress, emptyClientHost(snapshot), undefined));
			integrations.setConnection(connection);
			const reference = store.add(await integrations.acquireArtifact('vendor-session://opaque', 'item'));
			await reference.object.requestAuthentication('vendor.integration');
			assert.deepStrictEqual({ commands, transformed, forwarded }, {
				commands: [CHAT_SETUP_ACTION_ID],
				transformed: remoteAddress ? [metadata.resource] : [],
				forwarded: [{
					resource: metadata.resource, scopes: ['read'], token: remoteAddress ? 'sealed-token' : 'plain-token',
					_meta: { 'vscode.authentication.account': { accountId: 'account', providerId: 'test-auth' } },
				}],
			});
		});
	}
});

suite('Agent Host client artifact notices', () => {
	let store: DisposableStore;
	teardown(async () => {
		store.dispose();
		await timeout(0);
	});
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	setup(() => {
		store = disposables.add(new DisposableStore());
	});
	const session = 'vendor-session://namespace/session?workspace=opaque';
	const artifact = { id: 'experiment', label: 'Experiment', resource: 'https://experiments.test/example', origin: { chat: 'vendor-chat://conversation/opaque?fork=child' } };

	function fixture(metadata: NonNullable<InitializeResult['_meta']> = { 'vscode.artifactIntegrations': 1, 'vscode.artifactIntegrationNotices': 1 }) {
		const registry = store.add(new ArtifactIntegrationRegistry());
		const connected = observableValue('connected', true);
		const permitted = observableValue('permitted', true);
		const enabled = observableValue('enabled', true);
		const initializeResult = observableValue('initializeResult', upcastPartial<InitializeResult>({ _meta: metadata }));
		const requests: ArtifactIntegrationRequest[] = [];
		const notices: ArtifactAutomationNotice[] = [];
		const sessionResources: string[] = [];
		const dispatched: { readonly chat: string; readonly action: ArtifactChatAction }[] = [];
		const stateChanged = store.add(new Emitter<void>());
		const errors: string[] = [];
		let owner = true;
		let released = 0;
		let afterAcquire: (() => void) | undefined;
		let acknowledgement: ArtifactIntegrationResponse | undefined;
		let failure: Error | undefined;
		const snapshot = constObservable<ArtifactSnapshot>({
			session, artifact, authority: { id: 'vendor-host', targetHost: 'vendor', location: 'host' }, contributions: [], runs: [],
		});
		const server = store.add(new ArtifactIntegrationServer({
			acquireArtifact: async (resource, id) => {
				assert.deepStrictEqual([resource, id], [session, artifact.id]);
				return { object: upcastPartial<IArtifactModel>({ snapshot }), dispose: () => released++ };
			},
		}, async notice => { notices.push(notice); }));
		let state = upcastPartial<SessionState>({
			defaultChat: artifact.origin.chat,
			chats: [upcastPartial<SessionState['chats'][number]>({ resource: artifact.origin.chat })],
			_meta: { [SESSION_META_ARTIFACTS_KEY]: [{ id: artifact.id, type: SessionArtifactType.Website, isArtifact: true, label: artifact.label, link: artifact.resource, origin: artifact.origin }] },
		});
		const chatState = upcastPartial<ChatState>({ resource: artifact.origin.chat, turns: [] });
		let root = upcastPartial<RootState>({ config: { schema: { type: 'object', properties: {} }, values: {} } });
		const rootChanged = store.add(new Emitter<RootState>());
		const notifications = store.add(new Emitter<INotification>());
		const connection = new class extends mock<IAgentConnection>() {
			override readonly rootState = new class extends mock<IAgentSubscription<RootState>>() {
				override readonly onDidChange = rootChanged.event;
				override get value() { return root; }
				override get verifiedValue() { return root; }
			}();
			override readonly initializeResult = initializeResult;
			override readonly connectionAvailable = connected;
			override readonly onDidAction = Event.None;
			override readonly onDidNotification = notifications.event;
			override async dispatchBackgroundChatAction(chat: string, action: ArtifactChatAction) {
				dispatched.push({ chat, action });
			}
			override readonly artifactIntegrationTransport = {
				onDidUpdate: server.onDidUpdate,
				available: connected,
				request: async (request: ArtifactIntegrationRequest): Promise<ArtifactIntegrationResponse> => {
					requests.push(request);
					if (request.kind === 'notice') {
						if (failure) {
							throw failure;
						}
						if (acknowledgement) {
							return acknowledgement;
						}
					}
					const response = await server.request(request);
					if (request.kind === 'acquire') {
						afterAcquire?.();
					}
					return response;
				},
			};
			override getSubscription<T extends StateComponents>(component: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				if (component === StateComponents.Session) {
					sessionResources.push(resource.toString(true));
				} else {
					assert.deepStrictEqual([component, resource.toString(true)], [StateComponents.Chat, artifact.origin.chat]);
				}
				return new ImmortalReference(new class extends mock<IAgentSubscription<ComponentToState[T]>>() {
					override readonly onDidChange = Event.map(stateChanged.event, () => this.value);
					override get value() { return (component === StateComponents.Session ? state : chatState) as ComponentToState[T]; }
					override get verifiedValue() { return this.value; }
				}());
			}
		}();
		const log = store.add(new class extends NullLogService {
			override error(message: string | Error): void { errors.push(String(message)); }
		}());
		let persisted: string | undefined;
		const service = store.add(createClientArtifactRuntime('client', 'vendor', {
			read: async () => persisted, write: async value => { persisted = value; },
		}, () => owner, connection, permitted, enabled, registry, log));
		const notice: ArtifactAutomationNotice = { kind: 'enabled', session, artifact, content: 'Automatically analyze this experiment.', iconId: 'beaker' };
		return {
			service, registry, connected, permitted, enabled, initializeResult, requests, notices, notice, sessionResources, errors, dispatched,
			moveChat: () => { state = { ...state, chats: [] }; stateChanged.fire(); },
			setHostMode: (agentMerge: boolean, integrations: boolean) => {
				root = {
					...root, config: {
						schema: { type: 'object', properties: {} }, values: {
							[AgentMergeConfigKey.Enabled]: agentMerge, [AgentHostArtifactIntegrationsConfigKey]: integrations,
						}
					}
				};
				rootChanged.fire(root);
			},
			get released() { return released; },
			setOwner: (value: boolean) => { owner = value; },
			afterAcquire: (callback: () => void) => { afterAcquire = callback; },
			setAcknowledgement: (value: ArtifactIntegrationResponse) => { acknowledgement = value; },
			setFailure: (value: Error) => { failure = value; },
			removeSession: (removed: string) => notifications.fire({ type: NotificationType.SessionRemoved, channel: ROOT_STATE_URI, session: removed }),
		};
	}

	test('prompt delivery follows advertised opaque chat membership and stops when the chat moves', async () => {
		const f = fixture();
		const observation = store.add(f.service.runtime.chat.observeChat(session, artifact.origin.chat));
		await waitForState(observation.state, state => state.available);
		const request = { session, chat: artifact.origin.chat, requestId: 'opaque-prompt', prompt: { text: 'Analyze the experiment' } };
		const accepted = await f.service.runtime.chat.submit(request, CancellationToken.None, () => true);
		assert.ok(accepted.kind === 'accepted');
		store.add(accepted.handle);
		f.moveChat();
		await waitForState(observation.state, state => !state.available);
		const refused = await f.service.runtime.chat.submit({ ...request, requestId: 'moved-prompt' }, CancellationToken.None, () => true);
		assert.deepStrictEqual({
			dispatched: f.dispatched.map(({ chat, action }) => ({ chat, type: action.type })),
			refused: refused.kind,
			available: observation.state.get().available,
		}, {
			dispatched: [{ chat: artifact.origin.chat, type: ActionType.ChatPendingMessageSet }],
			refused: 'notSent',
			available: false,
		});
	});

	function registerStartIntegration(registry: IArtifactIntegrationRegistry, onStart: () => void): IDisposable {
		return registry.register({
			id: 'extension', label: 'Extension',
			automationOptions: [{ id: 'auto', kind: 'boolean', defaultValue: false, label: 'Automatic', description: 'Run automatically', actionIds: ['start'], maxAttempts: 1 }],
			match: resource => ({ resource, key: resource.toString(), credentialScope: 'test' }),
			createResource: async () => new DisposableStore(),
			createBinding: () => ({
				view: constObservable({
					availability: { kind: 'available' as const }, sections: [], stateActions: [{ id: 'start', enabled: true }], generalActions: [],
					automationAvailability: [{ id: 'auto', available: true }],
				}),
				actions: [{
					id: 'start', label: 'Start', iconId: 'play', kind: 'code' as const, executionScope: 'resource' as const,
					prepare: async () => ({ kind: 'ready' as const, value: { run: async () => { onStart(); return { kind: 'completed' as const, summary: 'Started' }; } } }),
				}],
				acquireDetails: () => { throw new Error('No details in this test'); }, activateAutomation: () => Disposable.None, dispose() { },
			}),
		}, 'extension-runtime');
	}

	test('waits for host Agent Merge suppression without losing the initial artifact lease', async () => {
		const f = fixture();
		let effects = 0;
		store.add(registerStartIntegration(f.registry, () => effects++));
		f.setHostMode(true, false);
		const model = store.add(await f.service.acquireArtifact(session, artifact.id)).object;
		const waiting = model.snapshot.get().contributions[0].view.availability.kind;
		await assert.rejects(model.invoke('extension', 'start', artifact.origin.chat, 'while-waiting'), /unavailable/);
		f.setHostMode(true, true);
		await waitForState(model.snapshot, snapshot => snapshot.contributions[0].view.availability.kind === 'available');
		const run = await model.invoke('extension', 'start', artifact.origin.chat, 'after-switch');
		await waitForState(model.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && candidate.state === 'completed'));
		f.setHostMode(false, false);
		assert.deepStrictEqual({ waiting, effects, available: model.snapshot.get().contributions[0].view.availability.kind }, {
			waiting: 'unavailable', effects: 1, available: 'available',
		});
	});

	for (const metadata of [{}, { 'vscode.artifactIntegrations': 1 }, { 'vscode.artifactIntegrations': 1, 'vscode.artifactIntegrationNotices': 2 }]) {
		test(`missing or unsupported notice capability pauses automation, not resource actions: ${JSON.stringify(metadata)}`, async () => {
			const f = fixture(metadata);
			let effects = 0;
			store.add(registerStartIntegration(f.registry, () => effects++));
			const model = store.add(await f.service.acquireArtifact(session, artifact.id)).object;
			await assert.rejects(model.configure('extension', 0, { auto: true }));
			const run = await model.invoke('extension', 'start', artifact.origin.chat, 'manual-start');
			await waitForState(model.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
			assert.deepStrictEqual({
				effects, unavailable: !!f.service.runtime.automationUnavailableReason?.get(),
				automatic: model.snapshot.get().contributions[0].view.automationAvailability[0].available,
				requests: f.requests,
			}, { effects: 1, unavailable: true, automatic: false, requests: [] });
		});
	}

	test('a session the host deletes loses its client bindings and history', async () => {
		const f = fixture();
		store.add(registerStartIntegration(f.registry, () => { }));
		const deleted = 'vendor-session://namespace/deleted';
		for (const target of [session, deleted]) {
			const model = store.add(await f.service.acquireArtifact(target, artifact.id)).object;
			const run = await model.invoke('extension', 'start', artifact.origin.chat, `manual-${target}`);
			await waitForState(model.snapshot, snapshot => snapshot.runs.some(candidate => candidate.id === run.id && isArtifactRunSettled(candidate)));
		}
		f.removeSession(deleted);
		const state = await waitForState(f.service.ledger.state, state => state.bindings.length === 1);
		assert.deepStrictEqual({
			bindings: state.bindings.map(binding => binding.session),
			runs: state.runs.map(run => run.requestId),
		}, { bindings: [session], runs: [`manual-${session}`] });
	});

	test('capable hosts acquire, post, and release using authoritative opaque session and chat identifiers', async () => {
		const f = fixture();
		await f.service.postNotice({ ...f.notice, artifact: { ...artifact, origin: { chat: 'untrusted-chat' } } });
		assert.deepStrictEqual({
			requests: f.requests.map(request => ({ ...request, subscription: 'subscription' })),
			notices: f.notices, released: f.released, sessionResources: f.sessionResources,
			unavailable: f.service.runtime.automationUnavailableReason?.get(),
		}, {
			requests: [
				{ kind: 'acquire', subscription: 'subscription', session, artifactId: artifact.id },
				{ kind: 'notice', subscription: 'subscription', notice: { kind: 'enabled', content: f.notice.content, iconId: 'beaker' } },
				{ kind: 'release', subscription: 'subscription' },
			],
			notices: [f.notice], released: 1, sessionResources: [session], unavailable: undefined,
		});
	});

	for (const phase of ['before', 'after acquire'] as const) {
		for (const reason of ['disconnect', 'owner', 'capability', 'AI disablement'] as const) {
			test(`${reason} ${phase} prevents notice delivery without leaking the subscription`, async () => {
				const f = fixture();
				const revoke = () => {
					switch (reason) {
						case 'disconnect': f.connected.set(false, undefined); break;
						case 'owner': f.setOwner(false); break;
						case 'capability': f.initializeResult.set(upcastPartial<InitializeResult>({ _meta: {} }), undefined); break;
						case 'AI disablement': f.permitted.set(false, undefined); break;
					}
				};
				if (phase === 'before') {
					revoke();
				} else {
					f.afterAcquire(revoke);
				}
				await assert.rejects(f.service.postNotice(f.notice));
				assert.deepStrictEqual({ requests: f.requests.map(request => request.kind), notices: f.notices, released: f.released }, {
					requests: phase === 'before' ? [] : ['acquire', 'release'], notices: [], released: phase === 'before' ? 0 : 1,
				});
			});
		}
	}

	for (const failed of [true, false]) {
		test(`${failed ? 'failed delivery' : 'invalid acknowledgement'} is not reported as a successful notice`, async () => {
			const f = fixture();
			if (failed) {
				f.setFailure(new Error('Synthetic transport failure'));
			} else {
				f.setAcknowledgement({ kind: 'history', runs: [] });
			}
			await assert.rejects(f.service.postNotice(f.notice));
			assert.deepStrictEqual({ requests: f.requests.map(request => request.kind), notices: f.notices, released: f.released },
				{ requests: ['acquire', 'notice', 'release'], notices: [], released: 1 });
		});
	}
});
