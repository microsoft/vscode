/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSCODE_EPHEMERAL_SESSION_META_KEY } from '../../../../../../platform/agentHost/common/meta/agentEphemeralSessionMeta.js';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, type IReference } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { constObservable, derived, observableValue } from '../../../../../../base/common/observable.js';
import { ExtUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAgentCreateSessionConfig, IAgentHostService, IAgentResolveSessionConfigParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { AhpErrorCodes } from '../../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { CustomizationType, type ClientPluginCustomization, type ConfigSchema, type SessionActiveClient } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { MessageKind, StateComponents, TurnState, type AgentInfo, type ComponentToState, type RootState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { areCustomizationScopeRootsEqual, IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { getLocalAgentHostSessionProvider } from '../../../browser/agentSessions/agentHost/agentHostSessionUri.js';

// ---- Mocks -----------------------------------------------------------------

interface IDispatchedAction {
	readonly channel: string;
	readonly type: string;
	readonly config?: Record<string, unknown>;
	readonly activeClient?: SessionActiveClient;
}

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;
	override readonly clientId = 'test-client';
	override readonly initializeResult = observableValue<InitializeResult | undefined>(this, {
		protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.agentHost': true },
	});

	readonly createCalls: IAgentCreateSessionConfig[] = [];
	readonly disposed: URI[] = [];
	readonly dispatched: IDispatchedAction[] = [];
	readonly resolveCalls: IAgentResolveSessionConfigParams[] = [];
	readonly disposeAttempts: URI[] = [];
	createGate: DeferredPromise<void> | undefined;
	confirmationGate: DeferredPromise<void> | undefined;
	confirmationError: Error | undefined;
	rejectionReason: string | undefined;
	private readonly _liveSessions = new Set<string>();
	private readonly _heldSubscriptions = new Set<object>();
	returnedSession: URI | undefined;
	failNextCreate = false;
	failNextDispose = false;
	enforceStandardTombstones = false;
	private readonly _tombstones = new Set<string>();
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;

	private readonly _onRootStateChange = new Emitter<RootState>();

	/** Agents advertised by the (stubbed) root state; drives capability gating. */
	rootStateAgents: AgentInfo[] = [];
	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value(): RootState { return { agents: self.rootStateAgents } as unknown as RootState; },
			verifiedValue: undefined,
			onDidChange: self._onRootStateChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		} as unknown as IAgentSubscription<RootState>;
	})();

	/** Simulates the host re-advertising after a `multiRootEnabled` change. */
	fireRootStateChange(): void {
		this._onRootStateChange.fire({ agents: this.rootStateAgents } as unknown as RootState);
	}

	/**
	 * Each entry is consumed in order by the next `resolveSessionConfig` call.
	 * Callers may push deferred promises (for race tests) or resolved values.
	 */
	resolveQueue: (Promise<ResolveSessionConfigResult> | ResolveSessionConfigResult)[] = [];

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		assert.ok(config?.session);
		this.createCalls.push(config);
		if (this.enforceStandardTombstones && this._tombstones.has(config.session.toString())) {
			throw new Error(`Session storage identity is already in use: ${config.session.toString()}`);
		}
		if (this.failNextCreate) {
			this.failNextCreate = false;
			throw new Error('create failed');
		}
		const gate = this.createGate;
		this.createGate = undefined;
		if (gate) {
			await gate.p;
		}
		const session = this.returnedSession ?? config.session;
		this._liveSessions.add(session.toString());
		return session;
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposeAttempts.push(session);
		if (this.failNextDispose) {
			this.failNextDispose = false;
			throw new Error('dispose failed');
		}
		this.disposed.push(session);
		this._liveSessions.delete(session.toString());
		if (this.enforceStandardTombstones && session.scheme === 'ahp-session') {
			const creation = [...this.createCalls].reverse().find(call => call.session?.toString() === session.toString());
			if (creation?._meta?.[VSCODE_EPHEMERAL_SESSION_META_KEY] !== true) {
				this._tombstones.add(session.toString());
			}
		}
	}

	fireAgentHostStart(): void {
		this._liveSessions.clear();
		this._onAgentHostStart.fire();
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
		this._onRootStateChange.dispose();
	}

	override dispatch(channel: Parameters<IAgentHostService['dispatch']>[0], action: Parameters<IAgentHostService['dispatch']>[1]): void {
		this.dispatched.push({ channel, ...action } as IDispatchedAction);
	}

	override getSubscription<T extends StateComponents>(_kind: T, _resource: URI, _owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		const subscription = new class extends mock<IAgentSubscription<ComponentToState[T]>>() { };
		this._heldSubscriptions.add(subscription);
		return { object: subscription, dispose: () => this._heldSubscriptions.delete(subscription) };
	}

	override async dispatchConfirmed<T>(channel: string, subscription: IAgentSubscription<T>, action: Parameters<IAgentHostService['dispatch']>[1], token: CancellationToken): Promise<ActionEnvelope> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		assert.ok(this._heldSubscriptions.has(subscription));
		this.dispatch(channel, action);
		const gate = this.confirmationGate;
		this.confirmationGate = undefined;
		if (gate) {
			await raceCancellationError(gate.p, token);
		}
		assert.ok(this._heldSubscriptions.has(subscription));
		if (this.confirmationError) {
			throw this.confirmationError;
		}
		return {
			channel, action, serverSeq: 1, origin: { clientId: this.clientId, clientSeq: 1 },
			rejectionReason: this.rejectionReason ?? (this._liveSessions.has(channel) ? undefined : 'Session not found'),
		};
	}

	override async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
		this.resolveCalls.push(params);
		const next = this.resolveQueue.shift();
		if (!next) {
			throw new Error(`No queued resolveSessionConfig response (call #${this.resolveCalls.length})`);
		}
		return next;
	}
}

class MockChatService extends mock<IChatService>() {
	declare readonly _serviceBrand: undefined;
	override readonly onDidDisposeSession = Event.None;
}

// ---- Helpers ---------------------------------------------------------------

function makeSchema(branchReadOnly: boolean): ConfigSchema {
	return {
		type: 'object',
		properties: {
			isolation: {
				type: 'string',
				title: 'Isolation',
				enum: ['folder', 'worktree'],
				default: 'folder',
			},
			branch: {
				type: 'string',
				title: 'Branch',
				enum: ['main'],
				default: 'main',
				readOnly: branchReadOnly,
			},
		},
	};
}

function untitledChatUri(id: string): URI {
	return URI.from({ scheme: 'agent-host-copilot', path: `/untitled-${id}` });
}

function workspaceFolder(uri: URI, index: number): IWorkspaceFolder {
	return { uri, index, name: uri.path, toResource: relativePath => URI.joinPath(uri, relativePath) };
}

// ---- Tests -----------------------------------------------------------------

suite('AgentHostUntitledProvisionalSessionService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps case-distinct roots separate on case-sensitive remote filesystems', () => {
		const extUri = new ExtUri(() => false);
		assert.strictEqual(areCustomizationScopeRootsEqual(
			[URI.parse('vscode-remote://ssh-remote+linux/work/Repo')],
			[URI.parse('vscode-remote://ssh-remote+linux/work/repo')],
			extUri,
		), false);
	});

	let agentHost: MockAgentHostService;
	let sessionResolutions: ResourceMap<IAgentHostSessionResolution | undefined>;
	let onDidChangeSessionResolution: Emitter<void>;
	let onDidDisposeChatSession: Emitter<{ sessionResources: readonly URI[]; reason: 'disposed' }>;
	let warnings: string[];
	let importStore: AgentHostImportConversationStore;
	let provisional: AgentHostUntitledProvisionalSessionService;
	let folderService: IAgentHostNewSessionFolderService;
	let cleanup: DisposableStore;
	let workspaceTrusted: boolean;
	let untrustedFolders: Set<string>;
	let workspaceFolders: URI[];
	let workspaceConfiguration: URI | null;
	let workspaceName: string | undefined;
	let workbenchState: WorkbenchState;
	let isSessionsWindow: boolean;
	let customizations: ReturnType<typeof observableValue<readonly ClientPluginCustomization[]>>;
	let onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	let acquiredScopeRoots: string[][];

	setup(async () => {
		agentHost = ds.add(new MockAgentHostService());
		sessionResolutions = new ResourceMap();
		onDidChangeSessionResolution = ds.add(new Emitter<void>());
		onDidDisposeChatSession = ds.add(new Emitter<{ sessionResources: readonly URI[]; reason: 'disposed' }>());
		warnings = [];
		workspaceTrusted = true;
		untrustedFolders = new Set<string>();
		workspaceFolders = [];
		workspaceConfiguration = null;
		workspaceName = undefined;
		workbenchState = WorkbenchState.EMPTY;
		isSessionsWindow = false;
		acquiredScopeRoots = [];
		onDidChangeWorkspaceFolders = ds.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const insta = ds.add(new TestInstantiationService());
		insta.stub(IAgentHostService, agentHost);
		insta.stub(IAgentHostConnectionsService, {
			onDidChangeSessionResolution: onDidChangeSessionResolution.event,
			resolveSessionResource: sessionResource => {
				if (sessionResolutions.has(sessionResource)) {
					return sessionResolutions.get(sessionResource);
				}
				const provider = getLocalAgentHostSessionProvider(sessionResource);
				const backendSession = provider ? sessionResource.with({ scheme: provider, fragment: '' }) : undefined;
				return backendSession ? { connection: agentHost, connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession } : undefined;
			},
		});
		insta.stub(ILogService, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		insta.stub(IChatService, new class extends MockChatService {
			override readonly onDidDisposeSession = onDidDisposeChatSession.event;
		}());
		insta.stub(IConfigurationService, new TestConfigurationService());
		insta.stub(IWorkbenchEnvironmentService, { get isSessionsWindow() { return isSessionsWindow; } } as Partial<IWorkbenchEnvironmentService>);
		insta.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = onDidChangeWorkspaceFolders.event;
			override getWorkspace(): IWorkspace {
				return {
					id: 'workspace',
					folders: workspaceFolders.map(uri => ({ uri } as IWorkspaceFolder)),
					configuration: workspaceConfiguration,
					name: workspaceName,
				};
			}
			override getWorkbenchState(): WorkbenchState { return workbenchState; }
		});
		insta.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
			override isWorkspaceTrusted(): boolean { return workspaceTrusted; }
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: !untrustedFolders.has(uri.toString()) }; }
		});
		insta.stub(IUriIdentityService, { extUri: new ExtUri(() => false) } as Partial<IUriIdentityService> as IUriIdentityService);
		folderService = ds.add(insta.createInstance(AgentHostNewSessionFolderService));
		insta.stub(IAgentHostNewSessionFolderService, folderService);
		importStore = new AgentHostImportConversationStore();
		insta.stub(IAgentHostImportConversationStore, importStore);
		customizations = observableValue<readonly ClientPluginCustomization[]>('customizations', []);
		insta.stub(IAgentHostActiveClientService, {
			areScopeRootsEqual: (first, second) => areCustomizationScopeRootsEqual(first, second, new ExtUri(() => false)),
			acquireScope: (_sessionType: string, roots: readonly URI[]) => {
				acquiredScopeRoots.push(roots.map(root => root.toString()));
				return {
					customizations,
					customAgents: constObservable([]),
					tools: constObservable([]),
					isResolved: constObservable(true),
					whenResolved: () => Promise.resolve(),
					getSyncedUri: () => undefined,
					activeClient: clientId => derived(reader => ({ clientId, tools: [], customizations: [...customizations.read(reader)] })),
					dispose: () => { },
				};
			},
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService);
		provisional = ds.add(insta.createInstance(AgentHostUntitledProvisionalSessionService));
		cleanup = ds.add(new DisposableStore());
	});

	function seedImportedConversation(resource: URI): void {
		importStore.set(resource, {
			turns: [{
				id: 'imported-turn',
				message: { text: 'Imported message', origin: { kind: MessageKind.User } },
				responseParts: [],
				usage: undefined,
				state: TurnState.Complete,
			}],
		});
	}

	test('getOrCreate creates one backend provisional and returns the same URI on repeat calls', async () => {
		agentHost.resolveQueue = [];
		const ui = untitledChatUri('a');
		const [a, b] = await Promise.all([
			provisional.getOrCreate(ui, 'copilot', undefined),
			provisional.getOrCreate(ui, 'copilot', undefined),
		]);
		assert.deepStrictEqual({
			provider: a?.scheme,
			isOpaque: a?.path !== ui.path,
			reused: b?.toString() === a?.toString(),
			createCount: agentHost.createCalls.length,
			config: agentHost.createCalls[0].config,
		}, {
			provider: 'copilot',
			isOpaque: true,
			reused: true,
			createCount: 1,
			config: { isolation: 'folder' },
		});
	});

	test('graduation reuses a matching backend without creating or disposing a session', async () => {
		const ui = untitledChatUri('reuse-backend');
		const real = ui.with({ path: '/real-reuse-backend' });
		const directory = URI.file('/workspace');
		const backend = await provisional.getOrCreate(ui, 'copilot', directory);
		assert.ok(backend);

		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		const boundResource = real.with({ path: backend.path });
		await provisional.disposeSession(ui);
		const repeated = await provisional.tryRebind(ui, boundResource, 'copilot');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			repeated: repeated?.toString(),
			oldMapping: provisional.get(ui),
			newMapping: provisional.get(boundResource)?.toString(),
			directories: provisional.getProvisionalWorkingDirectories(boundResource)?.map(uri => uri.toString()),
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: backend.toString(),
			repeated: backend.toString(),
			oldMapping: undefined,
			newMapping: backend.toString(),
			directories: [directory.toString()],
			createCount: 1,
			disposed: [],
		});
	});

	test('graduation reuses the backend already recreated for a changed folder', async () => {
		const ui = untitledChatUri('reuse-changed-folder');
		const real = ui.with({ path: '/real-reuse-changed-folder' });
		const initialFolder = URI.file('/initial-folder');
		const latestFolder = URI.file('/latest-folder');
		folderService.setFolder(ui, initialFolder);
		const initialBackend = await provisional.getOrCreate(ui, 'copilot', initialFolder);
		assert.ok(initialBackend);
		agentHost.resolveQueue = [{ schema: makeSchema(true), values: { isolation: 'folder' } }];
		folderService.setFolder(ui, latestFolder);
		const replacement = await provisional.waitForPending(ui);
		assert.ok(replacement);

		const rebound = await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			replacement: replacement.toString(),
			createCount: agentHost.createCalls.length,
			directories: provisional.getProvisionalWorkingDirectories(real.with({ path: rebound?.path }))?.map(uri => uri.toString()),
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: replacement.toString(),
			replacement: replacement.toString(),
			createCount: 2,
			directories: [latestFolder.toString()],
			disposed: [initialBackend.toString()],
		});
	});

	test('graduated backend disposal belongs only to the real UI resource', async () => {
		const ui = untitledChatUri('retained-backend-disposal');
		const real = ui.with({ path: '/real-retained-backend-disposal' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		await provisional.tryRebind(ui, real, 'copilot');
		const boundResource = real.with({ path: backend.path });

		await provisional.disposeSession(ui);
		const afterOldDisposal = [...agentHost.disposed];
		await provisional.disposeSession(boundResource);

		assert.deepStrictEqual({
			afterOldDisposal,
			disposed: agentHost.disposed.map(uri => uri.toString()),
			mapping: provisional.get(boundResource),
		}, {
			afterOldDisposal: [],
			disposed: [backend.toString()],
			mapping: undefined,
		});
	});

	test('graduation replaces a backend from a restarted host while preserving chip selections', async () => {
		const ui = untitledChatUri('host-restarted');
		const real = ui.with({ path: '/real-host-restarted' });
		const directory = URI.file('/workspace/selected');
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree', branch: 'feature/selected' } }];
		const backend = await provisional.applyConfigChange(ui, 'copilot', directory, { isolation: 'worktree', branch: 'feature/selected' });
		assert.ok(backend);
		agentHost.fireAgentHostStart();

		const rebound = await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			createCount: agentHost.createCalls.length,
			config: agentHost.createCalls.at(-1)?.config,
			directories: agentHost.createCalls.at(-1)?.workingDirectories?.map(uri => uri.toString()),
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: URI.from({ scheme: 'copilot', path: real.path }).toString(),
			createCount: 2,
			config: { isolation: 'worktree', branch: 'feature/selected' },
			directories: [directory.toString()],
			disposed: [backend.toString()],
		});
	});

	test('graduation waits for acceptance without publishing or replacing the draft', async () => {
		const ui = untitledChatUri('confirmation');
		const real = ui.with({ path: '/real-confirmation' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.confirmationGate = gate;
		const rebinding = provisional.tryRebind(ui, real, 'copilot');
		await timeout(0);
		assert.deepStrictEqual({ mapping: provisional.get(real), creates: agentHost.createCalls.length, disposed: agentHost.disposed }, {
			mapping: undefined, creates: 1, disposed: [],
		});
		gate.complete();
		const rebound = await rebinding;
		assert.deepStrictEqual({ rebound: rebound?.toString(), creates: agentHost.createCalls.length, disposed: agentHost.disposed }, {
			rebound: backend.toString(), creates: 1, disposed: [],
		});
	});

	test('graduation propagates unconfirmed transport failures without replacing the backend', async () => {
		const ui = untitledChatUri('confirmation-failed');
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		const error = new Error('Transport lost before acknowledgement');
		agentHost.confirmationError = error;
		await assert.rejects(provisional.tryRebind(ui, ui.with({ path: '/real-confirmation-failed' }), 'copilot'), error);
		assert.deepStrictEqual({ backend: provisional.get(ui)?.toString(), creates: agentHost.createCalls.length, disposed: agentHost.disposed }, {
			backend: backend?.toString(), creates: 1, disposed: [],
		});
	});

	test('graduation cancellation releases confirmation and preserves the draft for a retry', async () => {
		const ui = untitledChatUri('confirmation-cancelled');
		const real = ui.with({ path: '/real-confirmation-cancelled' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.confirmationGate = gate;
		const cancellation = cleanup.add(new CancellationTokenSource());
		const failure = assert.rejects(provisional.tryRebind(ui, real, 'copilot', cancellation.token), error => error instanceof CancellationError);
		await timeout(0);
		cancellation.cancel();
		await failure;
		assert.deepStrictEqual({ backend: provisional.get(ui)?.toString(), creates: agentHost.createCalls.length, disposed: agentHost.disposed }, {
			backend: backend?.toString(), creates: 1, disposed: [],
		});
		assert.strictEqual((await provisional.tryRebind(ui, real, 'copilot'))?.toString(), backend?.toString());
	});

	test('graduation reconfirms a chip change made while awaiting acceptance without replacing the draft', async () => {
		const ui = untitledChatUri('confirmation-config-race');
		const real = ui.with({ path: '/real-confirmation-config-race' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.confirmationGate = gate;
		const reboundPromise = provisional.tryRebind(ui, real, 'copilot');
		await timeout(0);
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];
		const configChange = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		gate.complete();
		const [rebound] = await Promise.all([reboundPromise, configChange]);
		assert.deepStrictEqual({
			rebound: rebound?.toString(), creates: agentHost.createCalls.length, disposed: agentHost.disposed,
			configs: agentHost.dispatched.filter(action => action.type === ActionType.SessionConfigChanged).map(action => action.config),
		}, {
			rebound: backend?.toString(), creates: 1, disposed: [], configs: [{ isolation: 'folder' }, { isolation: 'worktree' }],
		});
	});

	test('graduation does not retire a reused backend twice when the draft is disposed during confirmation', async () => {
		const ui = untitledChatUri('confirmation-disposed');
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.confirmationGate = gate;
		const reboundPromise = provisional.tryRebind(ui, ui.with({ path: '/real-confirmation-disposed' }), 'copilot');
		await timeout(0);
		const disposal = provisional.disposeSession(ui);
		gate.complete();
		await disposal;
		const rebound = await reboundPromise;
		assert.deepStrictEqual({ rebound, creates: agentHost.createCalls.length, disposed: agentHost.disposed.map(uri => uri.toString()) }, {
			rebound: undefined, creates: 1, disposed: [backend?.toString()],
		});
	});

	test('graduation replaces a backend whose held subscription reports not found', async () => {
		const ui = untitledChatUri('subscription-not-found');
		await provisional.getOrCreate(ui, 'copilot', undefined);
		agentHost.confirmationError = new ProtocolError(AhpErrorCodes.NotFound, 'Session not found');
		const real = ui.with({ path: '/real-subscription-not-found' });
		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		assert.deepStrictEqual({ rebound: rebound?.toString(), creates: agentHost.createCalls.length }, {
			rebound: URI.from({ scheme: 'copilot', path: real.path }).toString(), creates: 2,
		});
	});

	test('graduation retains the exact backend URI advertised by a conforming host', async () => {
		agentHost.returnedSession = URI.parse('ahp-session://other-host/opaque-session?identity=preserved');
		const ui = untitledChatUri('opaque-backend');
		const real = ui.with({ path: '/real-opaque-backend' });
		await provisional.getOrCreate(ui, 'copilot', undefined);

		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		const boundResource = real.with({ path: agentHost.returnedSession.path });

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			mapping: provisional.get(boundResource)?.toString(),
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: agentHost.returnedSession.toString(),
			mapping: agentHost.returnedSession.toString(),
			createCount: 1,
			disposed: [],
		});
	});

	test('graduation recreates the backend when creation metadata changes', async () => {
		const ui = untitledChatUri('creation-metadata');
		const real = ui.with({ path: '/real-creation-metadata' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		const metadata = { [VSCODE_EPHEMERAL_SESSION_META_KEY]: true };
		provisional.setSessionCreationMetadata(real, metadata);

		const rebound = await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			createCount: agentHost.createCalls.length,
			metadata: agentHost.createCalls.at(-1)?._meta,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: URI.from({ scheme: 'copilot', path: real.path }).toString(),
			createCount: 2,
			metadata,
			disposed: [backend.toString()],
		});
	});

	test('graduation keeps active-client customizations synchronized on the retained backend', async () => {
		const ui = untitledChatUri('retained-customizations');
		const real = ui.with({ path: '/real-retained-customizations' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		const plugin: ClientPluginCustomization = { type: CustomizationType.Plugin, id: 'plugin:retained', uri: 'file:///plugins/retained', name: 'Retained' };

		customizations.set([plugin], undefined);

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			createCount: agentHost.createCalls.length,
			lastActiveClient: agentHost.dispatched.filter(action => action.type === ActionType.SessionActiveClientSet).at(-1),
		}, {
			rebound: backend.toString(),
			createCount: 1,
			lastActiveClient: {
				channel: backend.toString(),
				type: ActionType.SessionActiveClientSet,
				activeClient: { clientId: agentHost.clientId, tools: [], customizations: [plugin] },
			},
		});
	});

	test('config changes after graduation reach the retained backend without recreating it', async () => {
		const ui = untitledChatUri('retained-config');
		const real = ui.with({ path: '/real-retained-config' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		await provisional.tryRebind(ui, real, 'copilot');
		const boundResource = real.with({ path: backend.path });
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];

		const configured = await provisional.applyConfigChange(boundResource, 'copilot', undefined, { isolation: 'worktree' });

		assert.deepStrictEqual({
			configured: configured?.toString(),
			createCount: agentHost.createCalls.length,
			lastConfigChange: agentHost.dispatched.filter(action => action.type === ActionType.SessionConfigChanged).at(-1),
		}, {
			configured: backend.toString(),
			createCount: 1,
			lastConfigChange: { channel: backend.toString(), type: ActionType.SessionConfigChanged, config: { isolation: 'worktree' } },
		});
	});

	test('graduation recreates the backend when the provider changes', async () => {
		const ui = untitledChatUri('changed-provider');
		const real = URI.parse('agent-host-claude:/real-changed-provider');
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);

		const rebound = await provisional.tryRebind(ui, real, 'claude');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			provider: agentHost.createCalls.at(-1)?.provider,
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: 'claude:/real-changed-provider',
			provider: 'claude',
			createCount: 2,
			disposed: [backend.toString()],
		});
	});

	test('graduation imports history into a replacement instead of the empty provisional backend', async () => {
		const ui = untitledChatUri('imported-backend');
		const real = ui.with({ path: '/real-imported-backend' });
		const backend = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.ok(backend);
		seedImportedConversation(real);

		const rebound = await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			createCount: agentHost.createCalls.length,
			importedTurns: agentHost.createCalls.at(-1)?.importConversation?.turns.map(turn => turn.id),
			disposed: agentHost.disposed.map(uri => uri.toString()),
			remainingImport: importStore.take(real),
		}, {
			rebound: URI.from({ scheme: 'copilot', path: real.path }).toString(),
			createCount: 2,
			importedTurns: ['imported-turn'],
			disposed: [backend.toString()],
			remainingImport: undefined,
		});
	});

	for (const standardUris of [false, true]) {
		test(`released imported history survives navigation and service shutdown (standard URIs=${standardUris})`, async () => {
			agentHost.initializeResult.set({
				protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.agentHost': true, 'vscode.ahpSessionUris': standardUris },
			}, undefined);
			const draft = URI.parse('agent-host-copilotcli:/untitled-migrate');
			const destination = draft.with({ path: '/migrated-history' });
			const provisionalBackend = await provisional.getOrCreate(draft, 'copilotcli', undefined);
			assert.ok(provisionalBackend);
			seedImportedConversation(destination);
			const importedBackend = await provisional.tryRebind(draft, destination, 'copilotcli');
			assert.ok(importedBackend);
			const importedResource = destination.with({ path: importedBackend.path });

			provisional.releaseSession(importedResource);
			onDidDisposeChatSession.fire({ sessionResources: [draft, importedResource], reason: 'disposed' });
			await provisional.disposeSession(importedResource);
			const abandonedDraft = URI.parse('agent-host-copilotcli:/untitled-abandoned');
			const abandonedBackend = await provisional.getOrCreate(abandonedDraft, 'copilotcli', undefined);
			assert.ok(abandonedBackend);
			provisional.dispose();

			assert.deepStrictEqual({
				mapping: provisional.get(importedResource),
				importedTurns: agentHost.createCalls[1].importConversation?.turns.map(turn => turn.id),
				disposed: agentHost.disposed.map(uri => uri.toString()),
			}, {
				mapping: undefined,
				importedTurns: ['imported-turn'],
				disposed: [provisionalBackend.toString(), abandonedBackend.toString()],
			});
		});
	}

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		for (const supported of [false, true]) {
			test(`${provider} provisional drafts negotiate addressing and retain their frontend resource (${supported})`, async () => {
				agentHost.initializeResult.set({
					protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.agentHost': true, 'vscode.ahpSessionUris': supported },
				}, undefined);
				const draft = URI.parse(`agent-host-${provider}:/untitled-interop`);
				const committed = URI.parse(`agent-host-${provider}:/final-interop`);
				const initial = await provisional.getOrCreate(draft, provider, undefined);
				assert.ok(initial);
				const rebound = await provisional.tryRebind(draft, committed, provider);
				assert.deepStrictEqual({
					initialScheme: initial?.scheme,
					rebound: rebound?.toString(),
					resolved: provisional.get(committed.with({ path: initial.path }))?.toString(),
					createCount: agentHost.createCalls.length,
				}, {
					initialScheme: supported ? 'ahp-session' : provider,
					rebound: initial.toString(),
					resolved: initial.toString(),
					createCount: 1,
				});
			});
		}
	}

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		test(`${provider} a pre-initialize draft retains its identity through graduation`, async () => {
			agentHost.initializeResult.set(undefined, undefined);
			const draft = URI.parse(`agent-host-${provider}:/untitled-before-initialize`);
			const committed = URI.parse(`agent-host-${provider}:/after-initialize`);
			const initial = await provisional.getOrCreate(draft, provider, undefined);
			agentHost.initializeResult.set({
				protocolVersion: '0.9.0', serverSeq: 0, snapshots: [], _meta: { 'vscode.agentHost': true, 'vscode.ahpSessionUris': true },
			}, undefined);
			const retained = await provisional.getOrCreate(draft, provider, undefined);
			const rebound = await provisional.tryRebind(draft, committed, provider);
			assert.deepStrictEqual({
				initialScheme: initial?.scheme,
				retained: retained?.toString(),
				rebound: rebound?.toString(),
				frontend: committed.toString(),
			}, {
				initialScheme: provider,
				retained: initial?.toString(),
				rebound: initial?.toString(),
				frontend: `agent-host-${provider}:/after-initialize`,
			});
		});
	}

	test('publishes active-client customizations before the first prompt and keeps them updated', async () => {
		const first: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: 'plugin:first',
			uri: 'file:///plugins/first',
			name: 'First',
		};
		const second: ClientPluginCustomization = {
			type: CustomizationType.Plugin,
			id: 'plugin:second',
			uri: 'file:///plugins/second',
			name: 'Second',
		};
		customizations.set([first], undefined);

		await provisional.getOrCreate(untitledChatUri('customizations'), 'copilot', undefined);
		customizations.set([first, second], undefined);

		assert.deepStrictEqual(agentHost.dispatched
			.filter(action => action.type === ActionType.SessionActiveClientSet)
			.map(action => action.activeClient), [{
				clientId: 'test-client',
				tools: [],
				customizations: [first],
			}, {
				clientId: 'test-client',
				tools: [],
				customizations: [first, second],
			}]);
	});

	test('getOrCreate includes Editor multi-root workspace metadata', async () => {
		workspaceFolders = [URI.file('/workspace/one')];
		workspaceConfiguration = URI.parse('vscode-remote://ssh-remote+host/work/demo.code-workspace');
		workspaceName = 'Demo Workspace';
		workbenchState = WorkbenchState.WORKSPACE;

		await provisional.getOrCreate(untitledChatUri('multi-root'), 'copilot', workspaceFolders[0]);

		assert.deepStrictEqual(agentHost.createCalls[0]._meta, {
			multiRoot: {
				workspaceFile: workspaceConfiguration.toString(),
			},
		});
	});

	test('reselects the primary and recreates the provisional when the primary folder is removed', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		const added = URI.file('/workspace/three');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('multi-root-primary-removed');

		await provisional.getOrCreate(ui, 'copilot', primary);
		// Removing the primary of a not-yet-started draft reselects the first
		// remaining folder (as a freshly created chat would) and recreates there.
		workspaceFolders = [secondary, added];
		onDidChangeWorkspaceFolders.fire({
			added: [workspaceFolder(added, 1)],
			removed: [workspaceFolder(primary, 0)],
			changed: [],
		});
		await provisional.waitForPending(ui);
		// Removing the freshly-selected primary reselects again.
		workspaceFolders = [added];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(secondary, 0)],
			changed: [],
		});
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString(), secondary.toString()],
				[secondary.toString(), added.toString()],
				[added.toString()],
			],
		);
	});

	test('removing a secondary folder keeps the primary and recreates with the remaining secondaries', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		const third = URI.file('/workspace/three');
		workspaceFolders = [primary, secondary, third];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('secondary-removed');

		await provisional.getOrCreate(ui, 'copilot', primary);
		const createsBeforeRemoval = agentHost.createCalls.length;
		workspaceFolders = [primary, third];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(secondary, 1)],
			changed: [],
		});
		await provisional.waitForPending(ui);

		assert.deepStrictEqual({
			createsBeforeRemoval,
			workingDirectories: agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
		}, {
			createsBeforeRemoval: 1,
			workingDirectories: [
				[primary.toString(), secondary.toString(), third.toString()],
				[primary.toString(), third.toString()],
			],
		});
	});

	test('reselects the primary for a single-working-directory provider draft when the primary is removed', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		// Provider does NOT advertise multipleWorkingDirectories, so the draft is
		// not a workspace-root-set draft (usesWorkspaceRootSet === false).
		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		const ui = untitledChatUri('single-wd-primary-removed');

		await provisional.getOrCreate(ui, 'copilot', primary);
		workspaceFolders = [secondary];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(primary, 0)],
			changed: [],
		});
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[[primary.toString()], [secondary.toString()]],
		);
	});

	test('recreates without a working directory when the last workspace folder is removed', async () => {
		const only = URI.file('/workspace/one');
		workspaceFolders = [only];
		workbenchState = WorkbenchState.FOLDER;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('last-folder-removed');

		await provisional.getOrCreate(ui, 'copilot', only);
		workspaceFolders = [];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(only, 0)],
			changed: [],
		});
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString()) ?? null),
			[[only.toString()], null],
		);
	});

	test('reselects only the draft whose primary was removed', async () => {
		const a = URI.file('/workspace/a');
		const b = URI.file('/workspace/b');
		const c = URI.file('/workspace/c');
		workspaceFolders = [a, b, c];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const uiA = untitledChatUri('draft-a');
		const uiC = untitledChatUri('draft-c');

		await provisional.getOrCreate(uiA, 'copilot', a);
		await provisional.getOrCreate(uiC, 'copilot', c);
		const createsBeforeRemoval = agentHost.createCalls.length;

		// Remove folder a: draft A must reselect a new primary; draft C keeps c.
		workspaceFolders = [b, c];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(a, 0)],
			changed: [],
		});
		await provisional.waitForPending(uiA);
		await provisional.waitForPending(uiC);

		const afterRemoval = agentHost.createCalls.slice(createsBeforeRemoval).map(call => call.workingDirectories?.map(directory => directory.toString()) ?? []);
		const draftAPrimary = afterRemoval.find(directories => directories[0] === b.toString())?.[0];
		const draftCEntry = afterRemoval.find(directories => directories[0] === c.toString());

		assert.deepStrictEqual({
			draftAReselectedTo: draftAPrimary,
			draftCPrimary: draftCEntry?.[0],
			draftCDroppedRemovedFolder: !(draftCEntry?.includes(a.toString()) ?? false),
		}, {
			draftAReselectedTo: b.toString(),
			draftCPrimary: c.toString(),
			draftCDroppedRemovedFolder: true,
		});
	});

	test('reordering workspace folders does not recreate the provisional', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('reorder-noop');

		await provisional.getOrCreate(ui, 'copilot', primary);
		const createsBeforeReorder = agentHost.createCalls.length;
		workspaceFolders = [secondary, primary];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [],
			changed: [workspaceFolder(secondary, 0), workspaceFolder(primary, 1)],
		});
		await provisional.waitForPending(ui);

		assert.strictEqual(agentHost.createCalls.length, createsBeforeReorder);
	});

	test('does not reselect or dispose a started session when its primary folder is removed', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('started-primary-removed');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-started-primary-removed' });

		await provisional.getOrCreate(ui, 'copilot', primary);
		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		assert.ok(rebound);
		const boundResource = real.with({ path: rebound.path });
		const realBackend = provisional.get(boundResource);
		assert.ok(realBackend);
		const createsAfterRebind = agentHost.createCalls.length;

		// Removing the started session's primary must not touch it: its working
		// directory is the agent's fixed process root once the session started.
		workspaceFolders = [secondary];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(primary, 0)],
			changed: [],
		});
		await provisional.waitForPending(boundResource);

		assert.deepStrictEqual({
			createsAfterRemoval: agentHost.createCalls.length - createsAfterRebind,
			liveBackendDisposed: agentHost.disposed.some(uri => uri.toString() === realBackend.toString()),
			currentBackend: provisional.get(boundResource)?.toString(),
		}, {
			createsAfterRemoval: 0,
			liveBackendDisposed: false,
			currentBackend: realBackend.toString(),
		});
	});

	test('recreates an untitled draft with the workspace root set when multi-root is enabled at runtime', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		// Multi-root capability is off at creation, so the draft is single-root.
		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		const ui = untitledChatUri('multi-root-enabled-at-runtime');

		await provisional.getOrCreate(ui, 'copilot', primary);
		// The hidden `multiRootEnabled` setting is toggled on: the host
		// re-advertises `multipleWorkingDirectories`, so `rootState` changes
		// without a window reload.
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		agentHost.fireRootStateChange();
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString()],
				[primary.toString(), secondary.toString()],
			],
		);
	});

	test('does not recreate a started session when multi-root is enabled at runtime', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		// Capability off at creation, so the started session is rooted single-root.
		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		const ui = untitledChatUri('started-multi-root-enabled-at-runtime');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-started-multi-root-enabled' });

		await provisional.getOrCreate(ui, 'copilot', primary);
		const rebound = await provisional.tryRebind(ui, real, 'copilot');
		assert.ok(rebound);
		const boundResource = real.with({ path: rebound.path });
		const realBackend = provisional.get(boundResource);
		assert.ok(realBackend);
		const createsAfterRebind = agentHost.createCalls.length;

		// Enabling multi-root must not re-root a started session: its working
		// directories are the agent's fixed process root once the session started.
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		agentHost.fireRootStateChange();
		await provisional.waitForPending(boundResource);

		assert.deepStrictEqual({
			createsAfterEnable: agentHost.createCalls.length - createsAfterRebind,
			liveBackendDisposed: agentHost.disposed.some(uri => uri.toString() === realBackend.toString()),
			currentBackend: provisional.get(boundResource)?.toString(),
		}, {
			createsAfterEnable: 0,
			liveBackendDisposed: false,
			currentBackend: realBackend.toString(),
		});
	});

	test('recreates an untitled draft with the workspace root set when the agent host starts after the draft', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		// The host has not started yet, so multi-root is not advertised.
		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		const ui = untitledChatUri('multi-root-after-host-start');

		await provisional.getOrCreate(ui, 'copilot', primary);
		// The host starts and re-advertises `multipleWorkingDirectories`. The
		// listener re-binds on `onAgentHostStart` and reconciles, so the draft
		// picks up the capability even though `rootState.onDidChange` never fired
		// (the pre-start root state is a noop whose event never fires).
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		agentHost.fireAgentHostStart();
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString()],
				[primary.toString(), secondary.toString()],
			],
		);
	});

	test('recreates an untitled draft with a single root when multi-root is disabled at runtime', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('multi-root-disabled-at-runtime');

		await provisional.getOrCreate(ui, 'copilot', primary);
		// Disabling the setting drops the advertised capability; the draft must
		// collapse back to just its primary.
		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		agentHost.fireRootStateChange();
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString(), secondary.toString()],
				[primary.toString()],
			],
		);
	});

	test('tryRebind reselects when the primary is removed during imported session creation', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('rebind-primary-removed');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-rebind-primary-removed' });
		seedImportedConversation(real);

		await provisional.getOrCreate(ui, 'copilot', primary);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;

		const rebind = provisional.tryRebind(ui, real, 'copilot');
		await timeout(0);
		// The primary is removed while the final session creation is in flight; the
		// reselection updates the draft so the rebind retries at the remaining folder.
		workspaceFolders = [secondary];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(primary, 0)],
			changed: [],
		});
		gate.complete();
		await rebind;

		const finalCreate = agentHost.createCalls.filter(call => call.session?.path === '/real-rebind-primary-removed').at(-1);
		assert.deepStrictEqual(finalCreate?.workingDirectories?.map(directory => directory.toString()), [secondary.toString()]);
	});

	test('tryRebind does not root the imported session at the removed folder when the last folder is removed during creation', async () => {
		const only = URI.file('/workspace/one');
		workspaceFolders = [only];
		workbenchState = WorkbenchState.FOLDER;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('rebind-last-folder-removed');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-rebind-last-folder-removed' });
		seedImportedConversation(real);

		await provisional.getOrCreate(ui, 'copilot', only);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;

		const rebind = provisional.tryRebind(ui, real, 'copilot');
		await timeout(0);
		// The last workspace folder is removed while final creation is in flight.
		// The draft's primary is cleared to `undefined`, and the rebind derives its
		// working directory from the draft's own primary — so neither the backend
		// nor the active-client scope may reference the removed folder.
		workspaceFolders = [];
		onDidChangeWorkspaceFolders.fire({
			added: [],
			removed: [workspaceFolder(only, 0)],
			changed: [],
		});
		gate.complete();
		await rebind;
		await provisional.waitForPending(real);

		const finalCreate = agentHost.createCalls.filter(call => call.session?.path === '/real-rebind-last-folder-removed').at(-1);
		assert.deepStrictEqual({
			backendWorkingDirectories: finalCreate?.workingDirectories?.map(directory => directory.toString()) ?? null,
			lastScopeRoots: acquiredScopeRoots.at(-1),
			anyScopeKeepsRemovedFolder: acquiredScopeRoots.slice(1).some(roots => roots.includes(only.toString())),
		}, {
			backendWorkingDirectories: null,
			lastScopeRoots: [],
			anyScopeKeepsRemovedFolder: false,
		});
	});


	test('a single-folder draft adopts secondary roots when the workspace becomes multi-root', async () => {
		const primary = URI.file('/workspace/one');
		const added = URI.file('/workspace/two');
		workspaceFolders = [primary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('single-to-multi-root');

		await provisional.getOrCreate(ui, 'copilot', primary);
		workspaceFolders = [primary, added];
		onDidChangeWorkspaceFolders.fire({
			added: [workspaceFolder(added, 1)],
			removed: [],
			changed: [],
		});
		await provisional.waitForPending(ui);

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString()],
				[primary.toString(), added.toString()],
			],
		);
	});

	test('tryRebind recomputes the latest multi-root folder set without relying on a workspace event', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		const added = URI.file('/workspace/three');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('multi-root-rebind');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-multi-root-rebind' });

		await provisional.getOrCreate(ui, 'copilot', primary);
		workspaceFolders = [secondary, added];
		await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual(
			agentHost.createCalls.at(-1)?.workingDirectories?.map(directory => directory.toString()),
			[primary.toString(), secondary.toString(), added.toString()],
		);
	});

	test('tryRebind promotes a single-folder draft when a second folder appears without a workspace event', async () => {
		const primary = URI.file('/workspace/one');
		const added = URI.file('/workspace/two');
		workspaceFolders = [primary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('single-to-multi-root-rebind');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-single-to-multi-root-rebind' });

		await provisional.getOrCreate(ui, 'copilot', primary);
		workspaceFolders = [primary, added];
		await provisional.tryRebind(ui, real, 'copilot');

		assert.deepStrictEqual(
			agentHost.createCalls.map(call => call.workingDirectories?.map(directory => directory.toString())),
			[
				[primary.toString()],
				[primary.toString(), added.toString()],
			],
		);
	});

	test('getOrCreate omits multi-root metadata without a workspace configuration', async () => {
		workspaceFolders = [URI.file('/workspace/one'), URI.file('/workspace/two')];
		workbenchState = WorkbenchState.WORKSPACE;

		await provisional.getOrCreate(untitledChatUri('multi-root-no-config'), 'copilot', workspaceFolders[0]);

		assert.strictEqual(agentHost.createCalls[0]._meta, undefined);
	});

	test('getOrCreate omits multi-root metadata in the Agents window', async () => {
		workspaceFolders = [URI.file('/workspace/one'), URI.file('/workspace/two')];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		isSessionsWindow = true;

		await provisional.getOrCreate(untitledChatUri('agents-window'), 'copilot', workspaceFolders[0]);

		assert.strictEqual(agentHost.createCalls[0]._meta, undefined);
	});

	test('getOrCreate does not spawn a backend provisional in an untrusted workspace', async () => {
		workspaceTrusted = false;
		const ui = untitledChatUri('untrusted');
		const result = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.strictEqual(result, undefined);
		assert.strictEqual(agentHost.createCalls.length, 0);
		assert.strictEqual(provisional.get(ui), undefined);
	});

	test('getOrCreate does not spawn a backend provisional in an untrusted working directory folder', async () => {
		// Workspace is trusted, but the target working directory is a
		// standalone untrusted folder (e.g. a per-session folder outside the
		// open workspace).
		const workingDirectory = URI.from({ scheme: 'file', path: '/untrusted-folder' });
		untrustedFolders.add(workingDirectory.toString());
		const ui = untitledChatUri('untrusted-folder');
		const result = await provisional.getOrCreate(ui, 'copilot', workingDirectory);
		assert.strictEqual(result, undefined);
		assert.strictEqual(agentHost.createCalls.length, 0);
		assert.strictEqual(provisional.get(ui), undefined);
	});

	test('getOrCreate spawns a backend provisional in a trusted working directory folder', async () => {
		const workingDirectory = URI.from({ scheme: 'file', path: '/trusted-folder' });
		const ui = untitledChatUri('trusted-folder');
		const result = await provisional.getOrCreate(ui, 'copilot', workingDirectory);
		assert.deepStrictEqual({
			provider: result?.scheme,
			isOpaque: result?.path !== ui.path,
			createCount: agentHost.createCalls.length,
		}, {
			provider: 'copilot',
			isOpaque: true,
			createCount: 1,
		});
	});

	test('applyConfigChange dispatches SessionConfigChanged before schema re-resolution completes', async () => {
		const ui = untitledChatUri('b');
		// Resolve never returns — proves mutate+dispatch happen before the
		// re-resolve await.
		const blocked = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => blocked.cancel() });
		agentHost.resolveQueue = [blocked.p];

		const promise = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		// Yield enough microtasks for getOrCreate's sequencer + createSession
		// to settle and applyConfigChange's synchronous prelude (mutate +
		// dispatch) to run. The re-resolve await blocks indefinitely.
		for (let i = 0; i < 20; i++) {
			await Promise.resolve();
		}
		await timeout(0);

		// Dispatch should have happened before the promise resolves (re-resolve
		// is still blocked).
		const configChanged = agentHost.dispatched.filter(action => action.type === ActionType.SessionConfigChanged);
		assert.strictEqual(configChanged.length, 1, 'dispatched before re-resolve await');
		assert.deepStrictEqual(configChanged[0].config, { isolation: 'worktree' });
		assert.strictEqual(configChanged[0].channel, agentHost.createCalls[0].session?.toString());

		// Unblock so the queued re-resolve completes and the outer promise settles.
		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		await promise;
	});

	test('getResolvedConfig reflects the re-resolved schema/values after applyConfigChange', async () => {
		const ui = untitledChatUri('c');
		const resolved: ResolveSessionConfigResult = {
			schema: makeSchema(false),
			values: { isolation: 'worktree', branch: 'main' },
		};
		agentHost.resolveQueue = [resolved];

		assert.strictEqual(provisional.getResolvedConfig(ui), undefined);
		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });

		const overlay = provisional.getResolvedConfig(ui);
		assert.deepStrictEqual(overlay?.schema, resolved.schema);
		assert.deepStrictEqual(overlay?.values, resolved.values);
		assert.strictEqual(agentHost.resolveCalls.length, 1);
		assert.deepStrictEqual(agentHost.resolveCalls[0].config, { isolation: 'worktree' });
	});

	test('refreshResolvedConfig stores a schema overlay for running sessions', async () => {
		const ui = URI.from({ scheme: 'agent-host-copilot', path: '/real-j' });
		const resolved: ResolveSessionConfigResult = {
			schema: makeSchema(true),
			values: { isolation: 'folder', branch: 'main' },
		};
		agentHost.resolveQueue = [resolved];

		let changeFires = 0;
		cleanup.add(provisional.onDidChange(uri => { if (uri.toString() === ui.toString()) { changeFires++; } }));

		await provisional.refreshResolvedConfig(ui, 'copilot', undefined, { isolation: 'folder' });

		assert.deepStrictEqual({
			overlay: provisional.getResolvedConfig(ui),
			changeFires,
			resolveConfig: agentHost.resolveCalls[0].config,
		}, {
			overlay: resolved,
			changeFires: 1,
			resolveConfig: { isolation: 'folder' },
		});
	});

	test('refreshResolvedConfig ignores stale running-session responses', async () => {
		const ui = URI.from({ scheme: 'agent-host-copilot', path: '/real-k' });
		const first = new DeferredPromise<ResolveSessionConfigResult>();
		const second = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => { first.cancel(); second.cancel(); } });
		agentHost.resolveQueue = [first.p, second.p];

		const a = provisional.refreshResolvedConfig(ui, 'copilot', undefined, { isolation: 'worktree' });
		const b = provisional.refreshResolvedConfig(ui, 'copilot', undefined, { isolation: 'folder' });

		first.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		second.complete({ schema: makeSchema(true), values: { isolation: 'folder' } });

		await a;
		await b;

		assert.deepStrictEqual(provisional.getResolvedConfig(ui), { schema: makeSchema(true), values: { isolation: 'folder' } });
	});

	test('refreshResolvedConfig routes matching backend session IDs to their owning hosts', async () => {
		const firstHost = ds.add(new MockAgentHostService());
		const secondHost = ds.add(new MockAgentHostService());
		const firstSession = URI.parse('remote-host-one-test-agent:/same-session');
		const secondSession = URI.parse('remote-host-two-test-agent:/same-session');
		const backendSession = URI.parse('ahp-session:/same-session');
		const workingDirectory = URI.file('/workspace');
		const firstConfig: ResolveSessionConfigResult = { schema: makeSchema(false), values: { isolation: 'worktree' } };
		const secondConfig: ResolveSessionConfigResult = { schema: makeSchema(true), values: { isolation: 'folder' } };
		sessionResolutions.set(firstSession, { connection: firstHost, connectionAuthority: 'host-one', backendSession });
		sessionResolutions.set(secondSession, { connection: secondHost, connectionAuthority: 'host-two', backendSession });
		firstHost.resolveQueue = [firstConfig];
		secondHost.resolveQueue = [secondConfig];

		await Promise.all([
			provisional.refreshResolvedConfig(firstSession, 'test-agent', workingDirectory, firstConfig.values),
			provisional.refreshResolvedConfig(secondSession, 'test-agent', workingDirectory, secondConfig.values),
		]);

		assert.deepStrictEqual({
			localCalls: agentHost.resolveCalls,
			firstCalls: firstHost.resolveCalls,
			secondCalls: secondHost.resolveCalls,
			firstOverlay: provisional.getResolvedConfig(firstSession),
			secondOverlay: provisional.getResolvedConfig(secondSession),
		}, {
			localCalls: [],
			firstCalls: [{ provider: 'test-agent', workingDirectory, config: firstConfig.values }],
			secondCalls: [{ provider: 'test-agent', workingDirectory, config: secondConfig.values }],
			firstOverlay: firstConfig,
			secondOverlay: secondConfig,
		});
	});

	test('refreshResolvedConfig reports a disconnected host instead of falling back to the local host', async () => {
		const session = URI.parse('remote-host-test-agent:/disconnected');

		await provisional.refreshResolvedConfig(session, 'test-agent', undefined, {});

		assert.deepStrictEqual({
			localCalls: agentHost.resolveCalls,
			overlay: provisional.getResolvedConfig(session),
			warnings,
		}, {
			localCalls: [],
			overlay: undefined,
			warnings: ['[AgentHostProvisional] schema re-resolve failed: No connected agent host is available for session configuration'],
		});
	});

	test('refreshResolvedConfig discards an in-flight result across disconnect and reconnect', async () => {
		const remoteHost = ds.add(new MockAgentHostService());
		const session = URI.parse('remote-host-test-agent:/reconnected');
		const resolution = { connection: remoteHost, connectionAuthority: 'host', backendSession: URI.parse('ahp-session:/reconnected') };
		sessionResolutions.set(session, resolution);
		const stale = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => stale.cancel() });
		remoteHost.resolveQueue = [stale.p];
		const pending = provisional.refreshResolvedConfig(session, 'test-agent', undefined, {});

		sessionResolutions.set(session, undefined);
		onDidChangeSessionResolution.fire();
		sessionResolutions.set(session, resolution);
		onDidChangeSessionResolution.fire();
		stale.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		await pending;

		assert.strictEqual(provisional.getResolvedConfig(session), undefined);
	});

	for (const change of ['connection', 'backend session'] as const) {
		test(`refreshResolvedConfig invalidates its overlay when the ${change} changes`, async () => {
			const remoteHost = ds.add(new MockAgentHostService());
			const session = URI.parse('remote-host-test-agent:/running');
			const resolution = { connection: remoteHost, connectionAuthority: 'host', backendSession: URI.parse('ahp-session:/running') };
			const config: ResolveSessionConfigResult = { schema: makeSchema(false), values: { isolation: 'worktree' } };
			sessionResolutions.set(session, resolution);
			remoteHost.resolveQueue = [config];
			let changes = 0;
			cleanup.add(provisional.onDidChange(() => changes++));
			await provisional.refreshResolvedConfig(session, 'test-agent', undefined, {});

			onDidChangeSessionResolution.fire();
			const unchanged = provisional.getResolvedConfig(session);
			sessionResolutions.set(session, {
				...resolution,
				connection: change === 'connection' ? ds.add(new MockAgentHostService()) : remoteHost,
				backendSession: change === 'backend session' ? URI.parse('ahp-session:/replacement') : resolution.backendSession,
			});
			onDidChangeSessionResolution.fire();

			assert.deepStrictEqual({ unchanged, invalidated: provisional.getResolvedConfig(session), changes }, {
				unchanged: config, invalidated: undefined, changes: 2,
			});
		});
	}

	test('optimistic merge: overlay.values reflects partial before re-resolve completes', async () => {
		const ui = untitledChatUri('d');
		// First applyConfigChange: seed an overlay.
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree', branch: 'main' } }];
		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		assert.strictEqual(provisional.getResolvedConfig(ui)?.values?.['isolation'], 'worktree');

		// Second applyConfigChange: block the re-resolve and assert that the
		// overlay's `values` reflects the new partial *before* the re-resolve
		// returns. This is what keeps the picker from rendering a stale value
		// during the round-trip.
		const blocked = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => blocked.cancel() });
		agentHost.resolveQueue = [blocked.p];

		const promise = provisional.applyConfigChange(ui, 'copilot', undefined, { branch: 'feature/x' });
		for (let i = 0; i < 20; i++) {
			await Promise.resolve();
		}
		await timeout(0);

		const mid = provisional.getResolvedConfig(ui);
		assert.strictEqual(mid?.values?.['branch'], 'feature/x', 'overlay value updated optimistically');
		assert.strictEqual(mid?.values?.['isolation'], 'worktree', 'previous overlay values preserved');

		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree', branch: 'feature/x' } });
		await promise;
	});

	test('racing applyConfigChange calls: the second one wins (sequencer order)', async () => {
		const ui = untitledChatUri('e');
		const first = new DeferredPromise<ResolveSessionConfigResult>();
		const second = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => { first.cancel(); second.cancel(); } });
		agentHost.resolveQueue = [first.p, second.p];

		// Fire both before either resolve completes.
		const a = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		const b = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'folder' });

		// Complete the SECOND one first to simulate out-of-order RPC returns.
		second.complete({ schema: makeSchema(true), values: { isolation: 'folder', branch: 'main' } });
		// The sequencer ensures the second call runs after the first; resolve
		// the first so it can settle and let the second take effect last.
		first.complete({ schema: makeSchema(false), values: { isolation: 'worktree', branch: 'main' } });

		await a;
		await b;

		const overlay = provisional.getResolvedConfig(ui);
		// The `folder` resolve was issued second and should be the final overlay.
		assert.strictEqual(overlay?.values?.['isolation'], 'folder');
		assert.strictEqual(overlay?.schema.properties['branch'].readOnly, true);
	});

	test('equals check skips onDidChange when re-resolved config is identical', async () => {
		const ui = untitledChatUri('f');
		const result: ResolveSessionConfigResult = {
			schema: makeSchema(false),
			values: { isolation: 'worktree', branch: 'main' },
		};
		// Queue two identical results for two applyConfigChange calls.
		agentHost.resolveQueue = [result, { schema: makeSchema(false), values: { isolation: 'worktree', branch: 'main' } }];

		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });

		let changeFires = 0;
		cleanup.add(provisional.onDidChange(uri => { if (uri.toString() === ui.toString()) { changeFires++; } }));

		// Second call with the same partial should produce the same resolved
		// schema/values; the equals check should suppress the onDidChange fire.
		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });

		// One micro-fire is acceptable but the resolved-side fire should not.
		assert.strictEqual(changeFires, 0, 'no onDidChange fire when overlay is unchanged');
	});

	test('tryRebind waits for pending config reconciliation', async () => {
		workspaceFolders = [URI.file('/workspace/one'), URI.file('/workspace/two')];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workspaceName = 'Demo Workspace';
		workbenchState = WorkbenchState.WORKSPACE;
		const ui = untitledChatUri('g');
		// Block the re-resolve so it does NOT run before tryRebind's read.
		const blocked = new DeferredPromise<ResolveSessionConfigResult>();
		cleanup.add({ dispose: () => blocked.cancel() });
		agentHost.resolveQueue = [blocked.p];

		// Fire-and-forget applyConfigChange — we deliberately do NOT await it.
		void provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });

		// Yield enough microtasks for getOrCreate + the synchronous prelude to run.
		await Promise.resolve();
		await Promise.resolve();
		await timeout(0);

		// Rebind must wait behind the config operation rather than graduating
		// with a partially reconciled draft.
		const newUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-g' });
		const rebind = provisional.tryRebind(ui, newUi, 'copilot');
		assert.strictEqual(agentHost.createCalls.some(c => c.session?.path === '/real-g'), false);
		const initialBackend = provisional.get(ui);
		assert.ok(initialBackend);
		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		const rebound = await rebind;

		assert.deepStrictEqual({
			rebound: rebound?.toString(),
			createCount: agentHost.createCalls.length,
			config: agentHost.dispatched.filter(action => action.type === ActionType.SessionConfigChanged).at(-1)?.config,
			_meta: agentHost.createCalls[0]._meta,
		}, {
			rebound: initialBackend.toString(),
			createCount: 1,
			config: { isolation: 'worktree' },
			_meta: {
				multiRoot: {
					workspaceFile: workspaceConfiguration.toString(),
				},
			},
		});
	});

	test('tryRebind retries when config changes during imported session creation', async () => {
		const ui = untitledChatUri('rebind-config-race');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-config-race' });
		seedImportedConversation(realUi);
		await provisional.getOrCreate(ui, 'copilot', undefined);
		const oldBackend = provisional.get(ui);
		assert.ok(oldBackend);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;

		const rebind = provisional.tryRebind(ui, realUi, 'copilot');
		await timeout(0);
		const configChange = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		gate.complete();
		const [rebound] = await Promise.all([rebind, configChange]);

		const finalCreates = agentHost.createCalls.filter(call => call.session?.path === '/real-config-race');
		assert.deepStrictEqual({
			finalCreateCount: finalCreates.length,
			firstCandidateDisposed: agentHost.disposed.filter(uri => uri.path === '/real-config-race').length,
			oldBackendDisposed: agentHost.disposed.some(uri => uri.toString() === oldBackend.toString()),
			rebound: rebound?.toString(),
			current: provisional.get(realUi)?.toString(),
			finalConfig: finalCreates.at(-1)?.config,
		}, {
			finalCreateCount: 2,
			firstCandidateDisposed: 1,
			oldBackendDisposed: true,
			rebound: URI.from({ scheme: 'copilot', path: '/real-config-race' }).toString(),
			current: URI.from({ scheme: 'copilot', path: '/real-config-race' }).toString(),
			finalConfig: { isolation: 'worktree' },
		});
	});

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		test(`standard ${provider} imported rebind retries with a fresh identity after retiring a stale candidate`, async () => {
			agentHost.initializeResult.set({
				protocolVersion: '0.9.0', serverSeq: 0, snapshots: [],
				_meta: { 'vscode.agentHost': true, 'vscode.ahpSessionUris': true },
			}, undefined);
			agentHost.enforceStandardTombstones = true;
			const ui = URI.from({ scheme: `agent-host-${provider}`, path: '/untitled-standard-race' });
			const realUi = ui.with({ path: '/standard-race' });
			seedImportedConversation(realUi);
			await provisional.getOrCreate(ui, provider, undefined);
			const creationCount = agentHost.createCalls.length;
			const gate = new DeferredPromise<void>();
			cleanup.add({ dispose: () => gate.cancel() });
			agentHost.createGate = gate;

			const rebind = provisional.tryRebind(ui, realUi, provider);
			await timeout(0);
			const configChange = provisional.applyConfigChange(ui, provider, undefined, { isolation: 'worktree' });
			await gate.complete();
			const [rebound] = await Promise.all([rebind, configChange]);
			assert.ok(rebound);
			const boundResource = realUi.with({ path: rebound.path });
			const finalCreates = agentHost.createCalls.slice(creationCount);

			assert.deepStrictEqual({
				count: finalCreates.length,
				distinct: new Set(finalCreates.map(call => call.session?.toString())).size,
				firstRetired: agentHost.disposed.some(session => session.toString() === finalCreates[0].session?.toString()),
				scheme: rebound.scheme,
				mapping: provisional.get(boundResource)?.toString(),
				unpublishedCandidate: provisional.get(realUi),
				config: finalCreates.at(-1)?.config,
			}, {
				count: 2,
				distinct: 2,
				firstRetired: true,
				scheme: 'ahp-session',
				mapping: rebound.toString(),
				unpublishedCandidate: undefined,
				config: { isolation: 'worktree' },
			});
		});
	}

	for (const provider of ['copilotcli', 'codex', 'claude']) {
		test(`standard ${provider} imported rebind keeps the latest folder after retiring a stale candidate`, async () => {
			agentHost.initializeResult.set({
				protocolVersion: '0.9.0', serverSeq: 0, snapshots: [],
				_meta: { 'vscode.agentHost': true, 'vscode.ahpSessionUris': true },
			}, undefined);
			agentHost.enforceStandardTombstones = true;
			const ui = URI.from({ scheme: `agent-host-${provider}`, path: '/untitled-folder-race' });
			const real = ui.with({ path: '/folder-race' });
			seedImportedConversation(real);
			const initial = URI.file('/initial-folder');
			const latest = URI.file('/latest-folder');
			folderService.setFolder(ui, initial);
			await provisional.getOrCreate(ui, provider, initial);
			const creationCount = agentHost.createCalls.length;
			const gate = new DeferredPromise<void>();
			cleanup.add({ dispose: () => gate.cancel() });
			agentHost.createGate = gate;

			const rebinding = provisional.tryRebind(ui, real, provider);
			await timeout(0);
			folderService.setFolder(ui, latest);
			await gate.complete();
			const rebound = await rebinding;
			assert.ok(rebound);
			await provisional.waitForPending(ui);
			const attempts = agentHost.createCalls.slice(creationCount);
			assert.deepStrictEqual({
				distinct: new Set(attempts.map(call => call.session?.toString())).size,
				finalDirectories: attempts.at(-1)?.workingDirectories?.map(directory => directory.toString()),
				mapping: provisional.get(real.with({ path: rebound.path }))?.toString(),
			}, { distinct: 2, finalDirectories: [latest.toString()], mapping: rebound.toString() });
		});
	}

	test('tryRebind disposes its imported candidate when the old entry is retired during creation', async () => {
		const ui = untitledChatUri('rebind-dispose-race');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-dispose-race' });
		seedImportedConversation(realUi);
		await provisional.getOrCreate(ui, 'copilot', undefined);
		const oldBackend = provisional.get(ui);
		assert.ok(oldBackend);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;

		const rebind = provisional.tryRebind(ui, realUi, 'copilot');
		await timeout(0);
		const disposal = provisional.disposeSession(ui);
		gate.complete();
		const [rebound] = await Promise.all([rebind, disposal]);

		assert.deepStrictEqual({
			rebound,
			oldMapping: provisional.get(ui),
			newMapping: provisional.get(realUi),
			disposed: agentHost.disposed.map(uri => uri.toString()).sort(),
		}, {
			rebound: undefined,
			oldMapping: undefined,
			newMapping: undefined,
			disposed: [
				oldBackend.toString(),
				URI.from({ scheme: 'copilot', path: '/real-dispose-race' }).toString(),
			].sort(),
		});
	});

	test('tryRebind restores an imported conversation when final creation fails', async () => {
		const ui = untitledChatUri('rebind-import-failure');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-import-failure' });
		await provisional.getOrCreate(ui, 'copilot', undefined);
		const turn: Turn = { id: 'turn', message: { text: 'hello', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
		const imported = { turns: [turn], model: { id: 'test-model' } };
		importStore.set(realUi, imported);
		agentHost.failNextCreate = true;

		const rebound = await provisional.tryRebind(ui, realUi, 'copilot');

		assert.deepStrictEqual({
			rebound,
			imported: importStore.take(realUi),
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			rebound: undefined,
			imported,
			disposed: [URI.from({ scheme: 'copilot', path: '/real-import-failure' }).toString()],
		});
	});

	test('tryRebind blocks deterministic URI reuse until failed disposal is retried', async () => {
		const ui = untitledChatUri('rebind-dispose-failure');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-dispose-failure' });
		seedImportedConversation(realUi);
		await provisional.getOrCreate(ui, 'copilot', undefined);
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;
		const rebind = provisional.tryRebind(ui, realUi, 'copilot');
		const pendingRead = provisional.waitForPending(ui);
		await timeout(0);
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];
		const configChange = provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		agentHost.failNextDispose = true;
		gate.complete();

		await assert.rejects(rebind, /Cannot safely retry rebound session/);
		assert.strictEqual(await pendingRead, undefined);
		await configChange;
		const reboundUri = URI.from({ scheme: 'copilot', path: '/real-dispose-failure' });
		assert.deepStrictEqual({
			attempts: agentHost.disposeAttempts.filter(uri => uri.toString() === reboundUri.toString()).length,
			disposed: agentHost.disposed.filter(uri => uri.toString() === reboundUri.toString()).length,
		}, {
			attempts: 1,
			disposed: 0,
		});

		agentHost.fireAgentHostStart();
		await timeout(0);
		assert.strictEqual(agentHost.disposed.filter(uri => uri.toString() === reboundUri.toString()).length, 1);
	});

	test('disposeSession drops the entry and its overlay', async () => {
		const ui = untitledChatUri('h');
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];
		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		assert.ok(provisional.getResolvedConfig(ui));

		await provisional.disposeSession(ui);
		assert.strictEqual(provisional.get(ui), undefined);
		assert.strictEqual(provisional.getResolvedConfig(ui), undefined);
		assert.strictEqual(agentHost.disposed.length, 1);
	});

	test('failed re-resolve preserves the previous overlay', async () => {
		const ui = untitledChatUri('i');
		agentHost.resolveQueue = [
			{ schema: makeSchema(false), values: { isolation: 'worktree' } },
			Promise.reject(new Error('boom')),
		];
		await provisional.applyConfigChange(ui, 'copilot', undefined, { isolation: 'worktree' });
		const before = provisional.getResolvedConfig(ui);
		assert.ok(before);

		// A failed re-resolve should not throw out of applyConfigChange and
		// must leave the previous overlay schema in place.
		await provisional.applyConfigChange(ui, 'copilot', undefined, { branch: 'feature/x' });

		const after = provisional.getResolvedConfig(ui);
		assert.deepStrictEqual(after?.schema, before.schema, 'schema unchanged after failed re-resolve');
		// Optimistic merge still applied for values.
		assert.strictEqual(after?.values?.['branch'], 'feature/x');
	});

	// Yield enough microtasks + a macrotask for the fire-and-forget folder-change
	// recreation (dispose -> create -> re-resolve) to settle against the mock.
	async function flush(): Promise<void> {
		for (let i = 0; i < 50; i++) {
			await Promise.resolve();
		}
		await timeout(0);
	}

	test('folder change recreates the provisional at the new cwd preserving config', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const ui = untitledChatUri('cwd1');
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];
		await provisional.applyConfigChange(ui, 'copilot', folderA, { isolation: 'worktree' });
		assert.strictEqual(agentHost.createCalls.length, 1);
		const original = agentHost.createCalls[0].session;
		assert.ok(original);

		// Re-resolve response for the recreation at the new cwd.
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];
		folderService.setFolder(ui, folderB);
		await flush();

		const recreate = agentHost.createCalls[agentHost.createCalls.length - 1];
		assert.deepStrictEqual({
			createCount: agentHost.createCalls.length,
			disposedOld: agentHost.disposed.some(d => d.toString() === original.toString()),
			recreatedWithFreshUri: recreate.session?.toString() !== original.toString(),
			currentSession: provisional.get(ui)?.toString(),
			recreatedCwd: recreate.workingDirectories?.[0]?.toString(),
			recreatedConfig: recreate.config?.['isolation'],
		}, {
			createCount: 2,
			disposedOld: true,
			recreatedWithFreshUri: true,
			currentSession: recreate.session?.toString(),
			recreatedCwd: folderB.toString(),
			recreatedConfig: 'worktree',
		});
	});

	test('folder change listeners can wait for the queued replacement', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const ui = untitledChatUri('cwd-listener');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'folder' } }];
		let pendingReplacement: Promise<URI | undefined> | undefined;
		cleanup.add(provisional.onDidChange(resource => {
			if (!pendingReplacement && resource.toString() === ui.toString()) {
				pendingReplacement = provisional.waitForPending(ui);
			}
		}));

		folderService.setFolder(ui, folderB);
		assert.ok(pendingReplacement);
		const replacement = await pendingReplacement;

		assert.deepStrictEqual({
			replacement: replacement?.toString(),
			current: provisional.get(ui)?.toString(),
			cwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString(),
		}, {
			replacement: agentHost.createCalls.at(-1)?.session?.toString(),
			current: agentHost.createCalls.at(-1)?.session?.toString(),
			cwd: folderB.toString(),
		});
	});

	test('folder change to the same folder is a no-op', async () => {
		const folderA = URI.file('/repoA');
		const ui = untitledChatUri('cwd2');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		assert.strictEqual(agentHost.createCalls.length, 1);

		folderService.setFolder(ui, folderA);
		await flush();

		assert.strictEqual(agentHost.createCalls.length, 1, 'no recreate for unchanged folder');
		assert.strictEqual(agentHost.disposed.length, 0);
	});

	test('rapid folder changes converge on the latest folder', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const folderC = URI.file('/repoC');
		const ui = untitledChatUri('rapid');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		const original = provisional.get(ui);
		assert.ok(original);
		agentHost.resolveQueue = [
			{ schema: makeSchema(false), values: { isolation: 'folder' } },
			{ schema: makeSchema(false), values: { isolation: 'folder' } },
		];

		folderService.setFolder(ui, folderB);
		folderService.setFolder(ui, folderC);
		await flush();

		assert.deepStrictEqual({
			createCount: agentHost.createCalls.length,
			current: provisional.get(ui)?.toString(),
			latestCwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString(),
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			createCount: 2,
			current: agentHost.createCalls.at(-1)?.session?.toString(),
			latestCwd: folderC.toString(),
			disposed: [original.toString()],
		});
	});

	test('untrusted folder change retires the hidden generation and recreates on rollback', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const ui = untitledChatUri('trust-change');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		const original = provisional.get(ui);
		assert.ok(original);
		untrustedFolders.add(folderB.toString());

		folderService.setFolder(ui, folderB);
		await flush();

		assert.deepStrictEqual({
			current: provisional.get(ui),
			disposed: agentHost.disposed.map(uri => uri.toString()),
			createCount: agentHost.createCalls.length,
		}, {
			current: undefined,
			disposed: [original.toString()],
			createCount: 1,
		});

		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'folder' } }];
		folderService.setFolder(ui, folderA);
		await flush();
		assert.deepStrictEqual({
			current: provisional.get(ui)?.toString(),
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
			recreated: provisional.get(ui)?.toString() !== original.toString(),
		}, {
			current: agentHost.createCalls.at(-1)?.session?.toString(),
			createCount: 2,
			disposed: [original.toString()],
			recreated: true,
		});
	});

	test('failed folder replacement cleans up its candidate and recreates on retry', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const ui = untitledChatUri('failed-change');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		const original = provisional.get(ui);
		assert.ok(original);
		agentHost.failNextCreate = true;

		folderService.setFolder(ui, folderB);
		await flush();
		const failedCandidate = agentHost.createCalls[1].session;
		assert.ok(failedCandidate);

		assert.deepStrictEqual({
			current: provisional.get(ui),
			disposed: agentHost.disposed.map(uri => uri.toString()),
			createCount: agentHost.createCalls.length,
		}, {
			current: undefined,
			disposed: [failedCandidate.toString(), original.toString()],
			createCount: 2,
		});

		const retried = await provisional.getOrCreate(ui, 'copilot', folderB);
		assert.deepStrictEqual({
			retried: retried?.toString(),
			latestCwd: agentHost.createCalls.at(-1)?.workingDirectories?.[0]?.toString(),
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			retried: agentHost.createCalls.at(-1)?.session?.toString(),
			latestCwd: folderB.toString(),
			disposed: [failedCandidate.toString(), original.toString()],
		});
	});

	test('config changed during creation retires the stale candidate', async () => {
		const folder = URI.file('/repo');
		const ui = untitledChatUri('config-race');
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;
		const initialCreate = provisional.getOrCreate(ui, 'copilot', folder);
		await timeout(0);
		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'worktree' } }];

		const configChange = provisional.applyConfigChange(ui, 'copilot', folder, { isolation: 'worktree' });
		gate.complete();
		await Promise.all([initialCreate, configChange]);

		const stale = agentHost.createCalls[0].session;
		const current = agentHost.createCalls.at(-1)?.session;
		assert.deepStrictEqual({
			createCount: agentHost.createCalls.length,
			staleDisposed: agentHost.disposed.map(uri => uri.toString()),
			current: provisional.get(ui)?.toString(),
			currentConfig: agentHost.createCalls.at(-1)?.config,
			dispatchChannel: agentHost.dispatched.at(-1)?.channel,
		}, {
			createCount: 2,
			staleDisposed: stale ? [stale.toString()] : [],
			current: current?.toString(),
			currentConfig: { isolation: 'worktree' },
			dispatchChannel: current?.toString(),
		});
	});

	test('dispose queued behind creation cannot publish or deadlock', async () => {
		const ui = untitledChatUri('dispose-race');
		const gate = new DeferredPromise<void>();
		cleanup.add({ dispose: () => gate.cancel() });
		agentHost.createGate = gate;
		const creation = provisional.getOrCreate(ui, 'copilot', URI.file('/repo'));
		await timeout(0);

		const disposal = provisional.disposeSession(ui);
		gate.complete();
		await Promise.all([creation, disposal]);
		const createdSession = agentHost.createCalls[0].session;
		assert.ok(createdSession);

		assert.deepStrictEqual({
			current: provisional.get(ui),
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			current: undefined,
			createCount: 1,
			disposed: [createdSession.toString()],
		});
	});

	test('folder change with no provisional entry is a no-op', async () => {
		const ui = untitledChatUri('cwd3');
		folderService.setFolder(ui, URI.file('/repoB'));
		await flush();

		assert.strictEqual(agentHost.createCalls.length, 0);
		assert.strictEqual(provisional.get(ui), undefined);
	});

	test('derives the ordered working-directory set from the picked primary', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const folderC = URI.file('/repoC');
		workspaceFolders = [folderA, folderB, folderC];
		// The provider advertises multi-root support, so the client sends the set.
		agentHost.rootStateAgents = [agentInfo('copilot', true)];

		const multiRoot = untitledChatUri('multi');
		await provisional.getOrCreate(multiRoot, 'copilot', folderB);

		// A single-folder workspace keeps just the primary (byte-identical to the
		// previous single-directory behaviour).
		workspaceFolders = [folderA];
		const singleRoot = untitledChatUri('single');
		await provisional.getOrCreate(singleRoot, 'copilot', folderA);

		assert.deepStrictEqual({
			multiRoot: agentHost.createCalls[0].workingDirectories?.map(d => d.toString()),
			singleRoot: agentHost.createCalls[1].workingDirectories?.map(d => d.toString()),
		}, {
			multiRoot: [folderB.toString(), folderA.toString(), folderC.toString()],
			singleRoot: [folderA.toString()],
		});
	});

	test('retains working directories after rebinding a provisional session', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		workspaceFolders = [folderA, folderB];
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const untitled = untitledChatUri('rebind-roots');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-rebind-roots' });

		await provisional.getOrCreate(untitled, 'copilot', folderA);
		const rebound = await provisional.tryRebind(untitled, real, 'copilot');
		assert.ok(rebound);

		assert.deepStrictEqual({
			untitled: provisional.getProvisionalWorkingDirectories(untitled),
			real: provisional.getProvisionalWorkingDirectories(real.with({ path: rebound.path }))?.map(directory => directory.toString()),
		}, {
			untitled: undefined,
			real: [folderA.toString(), folderB.toString()],
		});
	});

	test('sends only the primary when the provider does not advertise multiple working directories', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const folderC = URI.file('/repoC');
		workspaceFolders = [folderA, folderB, folderC];

		// The same provider gets the full ordered set while it advertises the
		// capability, and only the primary once it does not — the client mirrors
		// the node-side guard instead of relying on it alone.
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const multi = untitledChatUri('cap-multi');
		await provisional.getOrCreate(multi, 'copilot', folderB);

		agentHost.rootStateAgents = [agentInfo('copilot', false)];
		const single = untitledChatUri('cap-single');
		await provisional.getOrCreate(single, 'copilot', folderB);

		assert.deepStrictEqual({
			advertising: agentHost.createCalls[0].workingDirectories?.map(d => d.toString()),
			nonAdvertising: agentHost.createCalls[1].workingDirectories?.map(d => d.toString()),
		}, {
			advertising: [folderB.toString(), folderA.toString(), folderC.toString()],
			nonAdvertising: [folderB.toString()],
		});
	});
});

/** Minimal {@link AgentInfo} for capability-gating tests. */
function agentInfo(provider: string, multipleWorkingDirectories: boolean): AgentInfo {
	return {
		provider,
		displayName: provider,
		description: '',
		models: [],
		capabilities: multipleWorkingDirectories ? { multipleWorkingDirectories: { immutablePrimary: true } } : {},
	} as AgentInfo;
}
