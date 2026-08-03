/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
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
import type { ConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { AgentInfo, RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostUntitledProvisionalSessionService, IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';

// ---- Mocks -----------------------------------------------------------------

interface IDispatchedAction {
	readonly channel: string;
	readonly type: string;
	readonly config: Record<string, unknown>;
}

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	readonly createCalls: IAgentCreateSessionConfig[] = [];
	readonly disposed: URI[] = [];
	readonly dispatched: IDispatchedAction[] = [];
	readonly resolveCalls: IAgentResolveSessionConfigParams[] = [];
	createGate: DeferredPromise<void> | undefined;
	failNextCreate = false;

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
		this.disposed.push(session);
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

// ---- Tests -----------------------------------------------------------------

suite('AgentHostUntitledProvisionalSessionService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let agentHost: MockAgentHostService;
	let provisional: IAgentHostUntitledProvisionalSessionService;
	let folderService: IAgentHostNewSessionFolderService;
	let cleanup: DisposableStore;
	let workspaceTrusted: boolean;
	let untrustedFolders: Set<string>;
	let workspaceFolders: URI[];

	setup(async () => {
		agentHost = new MockAgentHostService();
		workspaceTrusted = true;
		untrustedFolders = new Set<string>();
		workspaceFolders = [];
		const insta = ds.add(new TestInstantiationService());
		insta.stub(IAgentHostService, agentHost);
		insta.stub(ILogService, new NullLogService());
		insta.stub(IChatService, new MockChatService());
		insta.stub(IConfigurationService, new TestConfigurationService());
		insta.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false } as Partial<IWorkbenchEnvironmentService>);
		insta.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspace(): IWorkspace {
				return { folders: workspaceFolders.map(uri => ({ uri } as IWorkspaceFolder)) } as IWorkspace;
			}
		});
		insta.stub(IWorkspaceTrustManagementService, new class extends mock<IWorkspaceTrustManagementService>() {
			override isWorkspaceTrusted(): boolean { return workspaceTrusted; }
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: !untrustedFolders.has(uri.toString()) }; }
		});
		folderService = ds.add(insta.createInstance(AgentHostNewSessionFolderService));
		insta.stub(IAgentHostNewSessionFolderService, folderService);
		insta.stub(IAgentHostImportConversationStore, new AgentHostImportConversationStore());
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
		assert.strictEqual(agentHost.dispatched.length, 1, 'dispatched before re-resolve await');
		assert.strictEqual(agentHost.dispatched[0].type, ActionType.SessionConfigChanged);
		assert.deepStrictEqual(agentHost.dispatched[0].config, { isolation: 'worktree' });
		assert.strictEqual(agentHost.dispatched[0].channel, agentHost.createCalls[0].session?.toString());

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
		const rebind = provisional.tryRebind(ui, newUi, 'copilot', undefined);
		assert.strictEqual(agentHost.createCalls.some(c => c.session?.path === '/real-g'), false);
		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
		await rebind;

		const reboundCreate = agentHost.createCalls.find(c => c.session?.path === '/real-g');
		assert.ok(reboundCreate, 'rebind triggered a createSession');
		assert.strictEqual(reboundCreate.config?.['isolation'], 'worktree');
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

		const rebind = provisional.tryRebind(ui, realUi, 'copilot', undefined);
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

		const rebind = provisional.tryRebind(ui, realUi, 'copilot', undefined);
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

	test('untrusted folder change hides the previous generation and reuses it on rollback', async () => {
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
			disposed: [],
			createCount: 1,
		});

		agentHost.resolveQueue = [{ schema: makeSchema(false), values: { isolation: 'folder' } }];
		folderService.setFolder(ui, folderA);
		await flush();
		assert.deepStrictEqual({
			current: provisional.get(ui)?.toString(),
			createCount: agentHost.createCalls.length,
			disposed: agentHost.disposed.map(uri => uri.toString()),
		}, {
			current: original.toString(),
			createCount: 1,
			disposed: [],
		});
	});

	test('failed folder replacement retains the previous generation until retry succeeds', async () => {
		const folderA = URI.file('/repoA');
		const folderB = URI.file('/repoB');
		const ui = untitledChatUri('failed-change');
		await provisional.getOrCreate(ui, 'copilot', folderA);
		const original = provisional.get(ui);
		assert.ok(original);
		agentHost.failNextCreate = true;

		folderService.setFolder(ui, folderB);
		await flush();

		assert.deepStrictEqual({
			current: provisional.get(ui),
			disposed: agentHost.disposed.map(uri => uri.toString()),
			createCount: agentHost.createCalls.length,
		}, {
			current: undefined,
			disposed: [],
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
			disposed: [original.toString()],
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
