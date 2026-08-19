/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
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
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { CustomizationType, type ClientPluginCustomization, type ConfigSchema, type SessionActiveClient } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { MessageKind, TurnState, type AgentInfo, type RootState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostUntitledProvisionalSessionService, IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { areCustomizationScopeRootsEqual, IAgentHostActiveClientService } from '../../../browser/agentSessions/agentHost/agentHostActiveClientService.js';

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

	readonly createCalls: IAgentCreateSessionConfig[] = [];
	readonly disposed: URI[] = [];
	readonly dispatched: IDispatchedAction[] = [];
	readonly resolveCalls: IAgentResolveSessionConfigParams[] = [];
	readonly disposeAttempts: URI[] = [];
	createGate: DeferredPromise<void> | undefined;
	failNextCreate = false;
	failNextDispose = false;
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;

	/** Agents advertised by the (stubbed) root state; drives capability gating. */
	rootStateAgents: AgentInfo[] = [];
	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value(): RootState { return { agents: self.rootStateAgents } as unknown as RootState; },
			verifiedValue: undefined,
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		} as unknown as IAgentSubscription<RootState>;
	})();

	/**
	 * Each entry is consumed in order by the next `resolveSessionConfig` call.
	 * Callers may push deferred promises (for race tests) or resolved values.
	 */
	resolveQueue: (Promise<ResolveSessionConfigResult> | ResolveSessionConfigResult)[] = [];

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		assert.ok(config?.session);
		this.createCalls.push(config);
		if (this.failNextCreate) {
			this.failNextCreate = false;
			throw new Error('create failed');
		}
		const gate = this.createGate;
		this.createGate = undefined;
		if (gate) {
			await gate.p;
		}
		return config.session;
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposeAttempts.push(session);
		if (this.failNextDispose) {
			this.failNextDispose = false;
			throw new Error('dispose failed');
		}
		this.disposed.push(session);
	}

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
	}

	override dispatch(channel: Parameters<IAgentHostService['dispatch']>[0], action: Parameters<IAgentHostService['dispatch']>[1]): void {
		this.dispatched.push({ channel, ...action } as IDispatchedAction);
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
	let importStore: AgentHostImportConversationStore;
	let provisional: IAgentHostUntitledProvisionalSessionService;
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
		insta.stub(ILogService, new NullLogService());
		insta.stub(IChatService, new MockChatService());
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
					activeClient: clientId => derived(reader => ({ clientId, tools: [], customizations: [...customizations.read(reader)] })),
					dispose: () => { },
				};
			},
		} as Partial<IAgentHostActiveClientService> as IAgentHostActiveClientService);
		provisional = ds.add(insta.createInstance(AgentHostUntitledProvisionalSessionService));
		cleanup = ds.add(new DisposableStore());
	});

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
		await provisional.tryRebind(ui, real, 'copilot');
		const realBackend = provisional.get(real);
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
		await provisional.waitForPending(real);

		assert.deepStrictEqual({
			createsAfterRemoval: agentHost.createCalls.length - createsAfterRebind,
			liveBackendDisposed: agentHost.disposed.some(uri => uri.toString() === realBackend.toString()),
			currentBackend: provisional.get(real)?.toString(),
		}, {
			createsAfterRemoval: 0,
			liveBackendDisposed: false,
			currentBackend: realBackend.toString(),
		});
	});

	test('tryRebind reselects when the primary is removed during final creation', async () => {
		const primary = URI.file('/workspace/one');
		const secondary = URI.file('/workspace/two');
		workspaceFolders = [primary, secondary];
		workspaceConfiguration = URI.file('/workspace/demo.code-workspace');
		workbenchState = WorkbenchState.WORKSPACE;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('rebind-primary-removed');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-rebind-primary-removed' });

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

	test('tryRebind does not root the started session at the removed folder when the last folder is removed during final creation', async () => {
		const only = URI.file('/workspace/one');
		workspaceFolders = [only];
		workbenchState = WorkbenchState.FOLDER;
		agentHost.rootStateAgents = [agentInfo('copilot', true)];
		const ui = untitledChatUri('rebind-last-folder-removed');
		const real = URI.from({ scheme: 'agent-host-copilot', path: '/real-rebind-last-folder-removed' });

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
		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		await rebind;

		const reboundCreate = agentHost.createCalls.find(c => c.session?.path === '/real-g');
		assert.ok(reboundCreate, 'rebind triggered a createSession');
		assert.deepStrictEqual({
			isolation: reboundCreate.config?.['isolation'],
			_meta: reboundCreate._meta,
		}, {
			isolation: 'worktree',
			_meta: {
				multiRoot: {
					workspaceFile: workspaceConfiguration.toString(),
				},
			},
		});
	});

	test('tryRebind retries when config changes during final session creation', async () => {
		const ui = untitledChatUri('rebind-config-race');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-config-race' });
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

	test('tryRebind disposes its candidate when the old entry is retired during creation', async () => {
		const ui = untitledChatUri('rebind-dispose-race');
		const realUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-dispose-race' });
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
