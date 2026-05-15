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
import { IChatService } from '../../../common/chatService/chatService.js';
import { AgentHostUntitledProvisionalSessionService, IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';

// ---- Mocks -----------------------------------------------------------------

interface IDispatchedAction {
	readonly type: string;
	readonly session: string;
	readonly config: Record<string, unknown>;
}

class MockAgentHostService extends mock<IAgentHostService>() {
	declare readonly _serviceBrand: undefined;

	readonly createCalls: IAgentCreateSessionConfig[] = [];
	readonly disposed: URI[] = [];
	readonly dispatched: IDispatchedAction[] = [];
	readonly resolveCalls: IAgentResolveSessionConfigParams[] = [];

	/**
	 * Each entry is consumed in order by the next `resolveSessionConfig` call.
	 * Callers may push deferred promises (for race tests) or resolved values.
	 */
	resolveQueue: (Promise<ResolveSessionConfigResult> | ResolveSessionConfigResult)[] = [];

	override async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this.createCalls.push(config!);
		return config!.session!;
	}

	override async disposeSession(session: URI): Promise<void> {
		this.disposed.push(session);
	}

	override dispatch(action: Parameters<IAgentHostService['dispatch']>[0]): void {
		this.dispatched.push(action as IDispatchedAction);
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

function expectedBackendUri(id: string): URI {
	return URI.from({ scheme: 'copilot', path: `/untitled-${id}` });
}

// ---- Tests -----------------------------------------------------------------

suite('AgentHostUntitledProvisionalSessionService', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let agentHost: MockAgentHostService;
	let provisional: IAgentHostUntitledProvisionalSessionService;
	let cleanup: DisposableStore;

	setup(async () => {
		agentHost = new MockAgentHostService();
		const insta = ds.add(new TestInstantiationService());
		insta.stub(IAgentHostService, agentHost);
		insta.stub(ILogService, new NullLogService());
		insta.stub(IChatService, new MockChatService());
		insta.stub(IConfigurationService, new TestConfigurationService());
		insta.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false } as Partial<IWorkbenchEnvironmentService>);
		provisional = ds.add(insta.createInstance(AgentHostUntitledProvisionalSessionService));
		cleanup = ds.add(new DisposableStore());
	});

	test('getOrCreate creates one backend provisional and returns the same URI on repeat calls', async () => {
		agentHost.resolveQueue = [];
		const ui = untitledChatUri('a');
		const a = await provisional.getOrCreate(ui, 'copilot', undefined);
		const b = await provisional.getOrCreate(ui, 'copilot', undefined);
		assert.strictEqual(a?.toString(), expectedBackendUri('a').toString());
		assert.strictEqual(b?.toString(), a.toString());
		assert.strictEqual(agentHost.createCalls.length, 1);
	});

	test('applyConfigChange dispatches SessionConfigChanged synchronously after mutating entry.config', async () => {
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
		assert.strictEqual(agentHost.dispatched[0].session, expectedBackendUri('b').toString());

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

	test('tryRebind sees latest entry.config from a synchronously-completed applyConfigChange', async () => {
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

		// Now perform a rebind. The new backend session must be created with the
		// up-to-date config the user just set — proving entry.config was mutated
		// synchronously, not deferred behind the (still-blocked) re-resolve.
		const newUi = URI.from({ scheme: 'agent-host-copilot', path: '/real-g' });
		await provisional.tryRebind(ui, newUi, 'copilot', undefined);

		const reboundCreate = agentHost.createCalls.find(c => c.session?.path === '/real-g');
		assert.ok(reboundCreate, 'rebind triggered a createSession');
		assert.strictEqual(reboundCreate!.config?.['isolation'], 'worktree');

		blocked.complete({ schema: makeSchema(false), values: { isolation: 'worktree' } });
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
});
