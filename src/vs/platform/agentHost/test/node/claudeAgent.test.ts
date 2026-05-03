/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isUUID } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { FileService } from '../../../files/common/fileService.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ClaudeAgent } from '../../node/claude/claudeAgent.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService, IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import { ClaudeAgentSession } from '../../node/claude/claudeAgentSession.js';
import { IClaudeProxyHandle, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createNullSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

// #region Test fakes

interface IStartCall {
	readonly token: string;
}

class FakeClaudeProxyService implements IClaudeProxyService {
	declare readonly _serviceBrand: undefined;

	readonly startCalls: IStartCall[] = [];
	disposeCount = 0;

	async start(token: string): Promise<IClaudeProxyHandle> {
		this.startCalls.push({ token });
		return {
			baseUrl: 'http://127.0.0.1:0',
			nonce: `nonce-for-${token}`,
			dispose: () => { this.disposeCount++; },
		};
	}

	dispose(): void { /* no-op for tests */ }
}

class FakeCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	models: (token: string, options?: ICopilotApiServiceRequestOptions) => Promise<CCAModel[]> =
		async () => [];

	messages(): never { throw new Error('not used in ClaudeAgent tests'); }
	countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used in ClaudeAgent tests'); }
}

class FakeClaudeAgentSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Mutable list returned by {@link listSessions}. Tests assign it
	 * before invoking the agent under test. Defaults to empty so suites
	 * that don't care about session enumeration aren't forced to set it.
	 */
	sessionList: readonly SDKSessionInfo[] = [];
	listSessionsCallCount = 0;

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		this.listSessionsCallCount++;
		return this.sessionList;
	}
}

/**
 * Wraps a delegate {@link ISessionDataService} and records call counts so
 * tests can assert that lifecycle methods (e.g. non-fork `createSession`)
 * don't touch the database. The delegate's behavior is preserved verbatim.
 */
class RecordingSessionDataService implements ISessionDataService {
	declare readonly _serviceBrand: undefined;

	openDatabaseCallCount = 0;
	tryOpenDatabaseCallCount = 0;

	constructor(private readonly _delegate: ISessionDataService) { }

	getSessionDataDir(session: URI) { return this._delegate.getSessionDataDir(session); }
	getSessionDataDirById(sessionId: string) { return this._delegate.getSessionDataDirById(sessionId); }
	openDatabase(session: URI) {
		this.openDatabaseCallCount++;
		return this._delegate.openDatabase(session);
	}
	tryOpenDatabase(session: URI) {
		this.tryOpenDatabaseCallCount++;
		return this._delegate.tryOpenDatabase(session);
	}
	deleteSessionData(session: URI) { return this._delegate.deleteSessionData(session); }
	cleanupOrphanedData(knownSessionIds: Set<string>) { return this._delegate.cleanupOrphanedData(knownSessionIds); }
	whenIdle() { return this._delegate.whenIdle(); }
}

// #endregion

// #region Fixture models

/** Build a {@link CCAModel} with sensible defaults; override per test. */
function makeModel(overrides: Partial<CCAModel> & { readonly id: string; readonly name: string; readonly vendor: string }): CCAModel {
	return {
		billing: { is_premium: false, multiplier: 1, restricted_to: [] },
		capabilities: {
			family: 'test',
			limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
			object: 'model_capabilities',
			supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false },
			tokenizer: 'o200k_base',
			type: 'chat',
		},
		is_chat_default: false,
		is_chat_fallback: false,
		model_picker_category: 'Anthropic',
		model_picker_enabled: true,
		object: 'model',
		policy: { state: 'enabled', terms: '' },
		preview: false,
		supported_endpoints: ['/v1/messages'],
		version: '1',
		...overrides,
	};
}

const CLAUDE_OPUS = makeModel({ id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic' });
const CLAUDE_SONNET = makeModel({ id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic' });
const NON_ANTHROPIC = makeModel({ id: 'gpt-5', name: 'GPT-5', vendor: 'OpenAI' });
const ANTHROPIC_NO_MESSAGES_ENDPOINT = makeModel({ id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5', vendor: 'Anthropic', supported_endpoints: ['/chat/completions'] });
const ANTHROPIC_PICKER_DISABLED = makeModel({ id: 'claude-opus-4.5', name: 'Claude Opus 4.5', vendor: 'Anthropic', model_picker_enabled: false });
const ANTHROPIC_NO_TOOL_CALLS = makeModel({
	id: 'claude-sonnet-3.5', name: 'Claude Sonnet 3.5', vendor: 'Anthropic',
	capabilities: {
		family: 'test',
		limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
		object: 'model_capabilities',
		supports: { parallel_tool_calls: false, streaming: true, tool_calls: false, vision: false },
		tokenizer: 'o200k_base',
		type: 'chat',
	},
});
const SYNTHETIC_AUTO = makeModel({ id: 'auto', name: 'Auto', vendor: 'copilot' });

const ALL_MODELS: readonly CCAModel[] = [
	CLAUDE_OPUS, CLAUDE_SONNET, NON_ANTHROPIC,
	ANTHROPIC_NO_MESSAGES_ENDPOINT, ANTHROPIC_PICKER_DISABLED,
	ANTHROPIC_NO_TOOL_CALLS, SYNTHETIC_AUTO,
];

// #endregion

// #region Test harness

interface ITestContext {
	readonly agent: ClaudeAgent;
	readonly proxy: FakeClaudeProxyService;
	readonly api: FakeCopilotApiService;
	readonly sdk: FakeClaudeAgentSdkService;
	readonly sessionData: RecordingSessionDataService;
}

function createTestContext(disposables: Pick<DisposableStore, 'add'>): ITestContext {
	const proxy = new FakeClaudeProxyService();
	const api = new FakeCopilotApiService();
	api.models = async () => [...ALL_MODELS];
	const sdk = new FakeClaudeAgentSdkService();
	const sessionData = new RecordingSessionDataService(createNullSessionDataService());

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[ICopilotApiService, api],
		[IClaudeProxyService, proxy],
		[ISessionDataService, sessionData],
		[IClaudeAgentSdkService, sdk],
	);
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
	return { agent, proxy, api, sdk, sessionData };
}

/** Drains the microtask queue so awaited refresh writes settle. */
function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

// #endregion

suite('ClaudeAgent', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('getDescriptor advertises the Claude provider', () => {
		const { agent } = createTestContext(disposables);
		const desc = agent.getDescriptor();
		assert.deepStrictEqual(
			{ provider: desc.provider, displayName: desc.displayName, hasDescription: desc.description.length > 0 },
			{ provider: 'claude', displayName: 'Claude', hasDescription: true },
		);
	});

	test('getProtectedResources returns the GitHub resource', () => {
		const { agent } = createTestContext(disposables);
		assert.deepStrictEqual(agent.getProtectedResources(), [{
			resource: 'https://api.github.com',
			resource_name: 'GitHub Copilot',
			authorization_servers: ['https://github.com/login/oauth'],
			scopes_supported: ['read:user', 'user:email'],
			required: true,
		}]);
	});

	test('models observable is empty before authenticate', () => {
		const { agent } = createTestContext(disposables);
		assert.deepStrictEqual(agent.models.get(), []);
	});

	test('authenticate populates models filtered to Claude family', async () => {
		const { agent, proxy } = createTestContext(disposables);

		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			accepted,
			startCalls: proxy.startCalls.map(c => c.token),
			models: agent.models.get(),
		}, {
			accepted: true,
			startCalls: ['tok'],
			models: [
				{ provider: 'claude', id: 'claude-opus-4.6', name: 'Claude Opus 4.6', maxContextWindow: 200_000, supportsVision: false },
				{ provider: 'claude', id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', maxContextWindow: 200_000, supportsVision: false },
			],
		});
	});

	test('authenticate rejects non-GitHub resources without disturbing state', async () => {
		const { agent, proxy } = createTestContext(disposables);

		const rejected = await agent.authenticate('https://other.example.com', 'tok');
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			rejected,
			accepted,
			startCalls: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, {
			rejected: false,
			accepted: true,
			startCalls: ['tok'],
			disposeCount: 0,
		});
	});

	test('authenticate with the same token does not restart the proxy', async () => {
		const { agent, proxy } = createTestContext(disposables);

		await agent.authenticate('https://api.github.com', 'tok');
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			startCalls: proxy.startCalls.length,
			disposeCount: proxy.disposeCount,
		}, { startCalls: 1, disposeCount: 0 });
	});

	test('authenticate with a different token restarts the proxy and disposes the old handle', async () => {
		const { agent, proxy } = createTestContext(disposables);

		await agent.authenticate('https://api.github.com', 'tokA');
		await agent.authenticate('https://api.github.com', 'tokB');
		await tick();

		assert.deepStrictEqual({
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
		}, {
			startTokens: ['tokA', 'tokB'],
			disposeCount: 1,
		});
	});

	test('authenticate retries proxy startup after a transient failure', async () => {
		// Regression: a previous implementation set `_githubToken = token`
		// before awaiting `start()`. If start threw, the token was recorded
		// but no proxy was running, and the next authenticate() call with
		// the same token took the "unchanged" path and falsely returned
		// true. This test pins the corrected ordering: state mutates only
		// after start() succeeds.
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];

		// Replace start() with a fake that records every invocation
		// (whether or not it succeeds) and fails the first attempt only.
		let failNext = true;
		proxy.start = async (token: string) => {
			proxy.startCalls.push({ token });
			if (failNext) {
				failNext = false;
				throw new Error('proxy bind failed');
			}
			return {
				baseUrl: 'http://127.0.0.1:0',
				nonce: `nonce-for-${token}`,
				dispose: () => { proxy.disposeCount++; },
			};
		};

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await assert.rejects(agent.authenticate('https://api.github.com', 'tok'), /proxy bind failed/);

		// Models still empty (proxy never started, refresh never ran).
		assert.deepStrictEqual(agent.models.get(), []);

		// Retry with the SAME token MUST attempt start() again — not
		// short-circuit on `tokenChanged === false`.
		const accepted = await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual({
			accepted,
			startTokens: proxy.startCalls.map(c => c.token),
			disposeCount: proxy.disposeCount,
			modelIds: agent.models.get().map(m => m.id),
		}, {
			accepted: true,
			startTokens: ['tok', 'tok'],
			disposeCount: 0,
			modelIds: [CLAUDE_OPUS.id, CLAUDE_SONNET.id],
		});
	});

	test('model filter excludes non-Claude entries', async () => {
		// Same fixture set as the populate test, but assert on ids only —
		// catches every exclusion criterion in one snapshot.
		const { agent } = createTestContext(disposables);
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual(
			agent.models.get().map(m => m.id),
			['claude-opus-4.6', 'claude-sonnet-4.6'],
		);
	});

	test('AgentSession URI helpers round-trip the claude scheme', () => {
		const uri = AgentSession.uri('claude', 'abc');
		assert.deepStrictEqual({
			scheme: uri.scheme,
			id: AgentSession.id(uri),
			provider: AgentSession.provider(uri),
		}, { scheme: 'claude', id: 'abc', provider: 'claude' });
	});

	test('dispose disposes the proxy handle and is idempotent', async () => {
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		agent.dispose();
		agent.dispose();

		assert.strictEqual(proxy.disposeCount, 1);
	});

	test('stubbed methods throw with the right phase number', async () => {
		// `sendMessage`, `abortSession`, and `changeModel` MUST return a
		// rejected promise (not throw synchronously). AgentSideEffects.handleAction
		// chains `.catch()` on the result to surface the error as a SessionError
		// action; a synchronous throw escapes that chain and the workbench
		// hangs forever on a turn that never completes (live smoke regression).
		// `respondToPermissionRequest`/`respondToUserInputRequest` are
		// `void`-returning by interface, so they throw synchronously and we
		// capture that via try/catch.
		const { agent } = createTestContext(disposables);
		const promiseCases: Array<{ name: string; phase: number; thunk: () => Promise<unknown> }> = [
			{ name: 'sendMessage', phase: 6, thunk: () => agent.sendMessage(URI.parse('claude:/x'), 'hi') },
			{ name: 'abortSession', phase: 9, thunk: () => agent.abortSession(URI.parse('claude:/x')) },
			{ name: 'changeModel', phase: 9, thunk: () => agent.changeModel(URI.parse('claude:/x'), { id: 'claude-opus-4.5' }) },
		];
		const voidCases: Array<{ name: string; phase: number; thunk: () => void }> = [
			{ name: 'respondToPermissionRequest', phase: 7, thunk: () => agent.respondToPermissionRequest('id', true) },
		];

		const observed: Array<{ name: string; message: string; sync: boolean }> = [];
		for (const c of promiseCases) {
			let p: Promise<unknown>;
			try {
				p = c.thunk();
			} catch (e) {
				// Synchronous throw — the bug we're guarding against.
				observed.push({ name: c.name, message: e instanceof Error ? e.message : String(e), sync: true });
				continue;
			}
			let message = 'no-throw';
			try {
				await p;
			} catch (e) {
				message = e instanceof Error ? e.message : String(e);
			}
			observed.push({ name: c.name, message, sync: false });
		}
		for (const c of voidCases) {
			try {
				c.thunk();
				observed.push({ name: c.name, message: 'no-throw', sync: false });
			} catch (e) {
				observed.push({ name: c.name, message: e instanceof Error ? e.message : String(e), sync: true });
			}
		}

		assert.deepStrictEqual(
			observed,
			[
				{ name: 'sendMessage', message: 'TODO: Phase 6', sync: false },
				{ name: 'abortSession', message: 'TODO: Phase 9', sync: false },
				{ name: 'changeModel', message: 'TODO: Phase 9', sync: false },
				{ name: 'respondToPermissionRequest', message: 'TODO: Phase 7', sync: true },
			],
		);
	});

	test('AgentService surfaces the registered ClaudeAgent in the providers map', () => {
		const { agent } = createTestContext(disposables);
		const fileService = disposables.add(new FileService(new NullLogService()));
		const service = disposables.add(new AgentService(
			new NullLogService(),
			fileService,
			createNullSessionDataService(),
			{ _serviceBrand: undefined } as IProductService,
			createNoopGitService(),
		));

		service.registerProvider(agent);

		// AgentSideEffects publishes registered providers into root state
		// on the next autorun tick. The state manager exposes the root
		// state via a public accessor.
		const rootAgents = service.stateManager.rootState.agents;
		assert.deepStrictEqual(
			rootAgents.map(a => ({ provider: a.provider, displayName: a.displayName })),
			[{ provider: 'claude', displayName: 'Claude' }],
		);
	});

	test('stale model writes from an old token are dropped', async () => {
		// Wire a controllable models() so token-A's refresh can hang
		// while token-B's refresh runs to completion. Phase 4's stale-
		// write guard MUST drop the late token-A result.
		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		const tokAModels = new DeferredPromise<CCAModel[]>();
		api.models = (token: string) => token === 'tokA'
			? tokAModels.p
			: Promise.resolve([CLAUDE_SONNET]);

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		// First authenticate: refresh-A starts and hangs on tokAModels.p.
		await agent.authenticate('https://api.github.com', 'tokA');
		// Second authenticate: refresh-B runs to completion, models == [B].
		await agent.authenticate('https://api.github.com', 'tokB');
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [CLAUDE_SONNET.id]);

		// Now unblock refresh-A: it must observe the rotated token and
		// drop its write rather than overwrite refresh-B's result.
		tokAModels.complete([CLAUDE_OPUS]);
		await tick();
		assert.deepStrictEqual(agent.models.get().map(m => m.id), [CLAUDE_SONNET.id]);
	});

	// #region Phase 5 — session lifecycle

	test('createSession (non-fork) returns a claude:/<uuid> URI without touching DB or SDK', async () => {
		// Per-session DB is overlay/cache only. Phase 5 non-fork creates
		// are in-memory: no DB row, no SDK call. The first sendMessage
		// (Phase 6) is the one that lands data on disk. PR #313841
		// makes createSession a hot path (eager creation on folder pick
		// + 30s GC), so the in-memory contract is load-bearing.
		const { agent, sdk, sessionData } = createTestContext(disposables);

		const result = await agent.createSession({ workingDirectory: URI.parse('file:///workspace') });

		assert.deepStrictEqual({
			scheme: result.session.scheme,
			provider: AgentSession.provider(result.session),
			isUuid: isUUID(AgentSession.id(result.session)),
			workingDirectory: result.workingDirectory?.toString(),
			provisional: result.provisional,
			openDatabaseCalls: sessionData.openDatabaseCallCount,
			tryOpenDatabaseCalls: sessionData.tryOpenDatabaseCallCount,
			sdkServiceBranded: sdk._serviceBrand === undefined,
		}, {
			scheme: 'claude',
			provider: 'claude',
			isUuid: true,
			workingDirectory: 'file:///workspace',
			provisional: undefined,
			openDatabaseCalls: 0,
			tryOpenDatabaseCalls: 0,
			sdkServiceBranded: true,
		});
	});

	test('createSession honors config.session when the workbench pre-mints the URI', async () => {
		// Workbench eagerly mints the session URI client-side (PR #313841
		// folder-pick path) and round-trips it through createSession so
		// the chat editor can render immediately. AgentService then
		// double-checks the returned URI matches and surfaces "Agent
		// host returned unexpected session URI" if the agent ignored
		// the hint. Mirrors CopilotAgent's `config.session ?
		// AgentSession.id(config.session) : generateUuid()` contract.
		const { agent } = createTestContext(disposables);
		const expected = AgentSession.uri('claude', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

		const result = await agent.createSession({ session: expected });

		assert.deepStrictEqual({
			session: result.session.toString(),
			provisional: result.provisional,
		}, {
			session: expected.toString(),
			provisional: undefined,
		});
	});

	test('createSession({ fork }) throws TODO: Phase 6 with no side effects', async () => {
		// Fork requires the SDK session handle (protocol turn ID -> SDK
		// event ID translation), which Phase 5 doesn't carry. Locking the
		// throw here so the deferral is explicit and Phase 6 can't quietly
		// half-implement fork without re-greening this case.
		const { agent, sessionData } = createTestContext(disposables);

		await assert.rejects(
			agent.createSession({
				fork: {
					session: AgentSession.uri('claude', 'src-uuid'),
					turnIndex: 0,
					turnId: 'turn-1',
				},
			}),
			/Phase 6/,
		);

		assert.deepStrictEqual({
			openDatabaseCalls: sessionData.openDatabaseCallCount,
			tryOpenDatabaseCalls: sessionData.tryOpenDatabaseCallCount,
		}, {
			openDatabaseCalls: 0,
			tryOpenDatabaseCalls: 0,
		});
	});

	test('shutdown resolves without throwing', async () => {
		const { agent } = createTestContext(disposables);
		await agent.shutdown();
	});

	test('disposeSession is a safe no-op for an unknown session', async () => {
		const { agent } = createTestContext(disposables);
		await agent.disposeSession(URI.parse('claude:/never-created'));
	});

	test('shutdown disposes session wrappers; concurrent disposeSession does not double-dispose', async () => {
		// Locks the no-double-dispose contract that Phase 6 will inherit
		// once SDK Query subprocesses + in-flight metadata writes need
		// real serialization. In Phase 5 dispose is synchronous, so the
		// guarantee comes from `DisposableMap.deleteAndDispose` checking
		// key presence; the test still pins each wrapper's disposeCount
		// at exactly 1 across the concurrent calls.
		class CountingClaudeAgentSession extends ClaudeAgentSession {
			disposeCount = 0;
			override dispose(): void {
				this.disposeCount++;
				super.dispose();
			}
		}
		class TestClaudeAgent extends ClaudeAgent {
			readonly created: CountingClaudeAgentSession[] = [];
			protected override _createSessionWrapper(sessionId: string, sessionUri: URI, workingDirectory: URI | undefined): ClaudeAgentSession {
				const w = new CountingClaudeAgentSession(sessionId, sessionUri, workingDirectory);
				this.created.push(w);
				return w;
			}
		}

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(TestClaudeAgent));

		const r1 = await agent.createSession({});
		const r2 = await agent.createSession({});

		const p1 = agent.disposeSession(r1.session);
		const p2 = agent.shutdown();
		await Promise.all([p1, p2]);

		assert.deepStrictEqual({
			disposeCounts: agent.created.map(w => w.disposeCount),
			sessionUris: agent.created.map(w => w.sessionUri.toString()).sort(),
		}, {
			disposeCounts: [1, 1],
			sessionUris: [r1.session.toString(), r2.session.toString()].sort(),
		});
	});

	test('disposeSession removes the wrapper but does NOT delete the SDK or DB session', async () => {
		// Plan section 3.3.4 — `disposeSession` is wrapper teardown, NOT
		// session deletion. The SDK session and the per-session DB
		// outlive `disposeSession`; permanent deletion is a Phase 13
		// concern (deletion command) and goes through a different code
		// path. The user-visible consequence: closing a tab in the
		// workbench drops the wrapper but the session reappears in the
		// session list (and its history is still on disk) until
		// explicitly deleted. This invariant prevents accidental
		// regression in Phase 6+ where wrapper teardown will gain real
		// cleanup work (Query.interrupt) — that work MUST NOT spill
		// into SDK-side or DB-side deletion.
		const { agent, sdk } = createTestContext(disposables);
		const created = await agent.createSession({});
		// Make the SDK report the just-created session as if its
		// metadata had been written by an earlier `query()` turn —
		// that's the steady state once Phase 6 sendMessage lands.
		sdk.sessionList = [{
			sessionId: AgentSession.id(created.session),
			summary: 'Hello world',
			lastModified: 100,
		}];

		await agent.disposeSession(created.session);
		const result = await agent.listSessions();

		assert.deepStrictEqual({
			ids: result.map(r => AgentSession.id(r.session)),
			summary: result[0]?.summary,
			sdkCalls: sdk.listSessionsCallCount,
		}, {
			ids: [AgentSession.id(created.session)],
			summary: 'Hello world',
			sdkCalls: 1,
		});
	});

	test('getSessionMessages returns an empty transcript for any session', async () => {
		// Phase 5 doesn't reconstruct transcripts. Real history reconstruction
		// from the SDK event log lands in Phase 13; the bare method shape is
		// required by IAgent so callers can subscribe before any messages
		// exist. Returning `[]` is correct: the agent service supplies its
		// own provisional turns from in-memory state until this method
		// surfaces the persisted log. We assert the result is also a fresh
		// array (not a shared sentinel) so future implementations can't
		// leak mutations.
		const { agent } = createTestContext(disposables);
		const a = await agent.getSessionMessages(URI.parse('claude:/unknown-1'));
		const b = await agent.getSessionMessages(URI.parse('claude:/unknown-2'));
		assert.deepStrictEqual({ a, b, distinct: a !== b }, { a: [], b: [], distinct: true });
	});

	test('listSessions returns SDK entries decorated with the per-session DB overlay', async () => {
		// Plan section 3.3.2: the SDK is the source of truth; the per-session DB
		// is a pure overlay/cache. We seed two SDK entries and a single
		// DB carrying `claude.customizationDirectory` for entry 'a'. The
		// result must include both entries; the overlay value must
		// surface only on the entry that has a DB.
		const dbA = new TestSessionDatabase();
		await dbA.setMetadata('claude.customizationDirectory', URI.file('/foo').toString());

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				if (AgentSession.id(session) === 'a') {
					return { object: dbA, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'a', summary: 'Session A', lastModified: 1000, createdAt: 900 },
			{ sessionId: 'b', summary: 'Session B', lastModified: 2000, createdAt: 1900 },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		const a = result.find(r => AgentSession.id(r.session) === 'a');
		const b = result.find(r => AgentSession.id(r.session) === 'b');
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => AgentSession.id(r.session)).sort(),
			summaryA: a?.summary,
			summaryB: b?.summary,
			modifiedA: a?.modifiedTime,
			modifiedB: b?.modifiedTime,
			custDirA: a?.customizationDirectory?.toString(),
			custDirB: b?.customizationDirectory,
			sdkCalls: sdk.listSessionsCallCount,
		}, {
			count: 2,
			ids: ['a', 'b'],
			summaryA: 'Session A',
			summaryB: 'Session B',
			modifiedA: 1000,
			modifiedB: 2000,
			custDirA: URI.file('/foo').toString(),
			custDirB: undefined,
			sdkCalls: 1,
		});
	});

	test('listSessions tolerates a corrupt DB without poisoning the rest of the listing', async () => {
		// Plan section 3.3.2 risk: a single corrupt per-session DB MUST NOT
		// drop the other entries from the listing. CopilotAgent's
		// `Promise.all`-with-throwing-mapper pattern at copilotAgent.ts:519
		// has this latent bug; we follow AgentService.listSessions's
		// inner-try/catch pattern instead. We simulate the failure by
		// rejecting `tryOpenDatabase` for one specific sessionId; the
		// other two must still surface, and the corrupt one must fall
		// back to the bare SDK-derived entry (NOT undefined / NOT
		// dropped).
		const dbOk = new TestSessionDatabase();
		await dbOk.setMetadata('claude.customizationDirectory', URI.file('/ok').toString());

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				const id = AgentSession.id(session);
				if (id === 'corrupt') {
					throw new Error('simulated DB open failure');
				}
				if (id === 'ok') {
					return { object: dbOk, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'ok', summary: 'OK', lastModified: 100 },
			{ sessionId: 'corrupt', summary: 'Corrupt', lastModified: 200 },
			{ sessionId: 'external', summary: 'External', lastModified: 300 },
		];

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		const find = (id: string) => result.find(r => AgentSession.id(r.session) === id);
		assert.deepStrictEqual({
			count: result.length,
			ids: result.map(r => AgentSession.id(r.session)).sort(),
			okCustDir: find('ok')?.customizationDirectory?.toString(),
			corruptCustDir: find('corrupt')?.customizationDirectory,
			corruptSummary: find('corrupt')?.summary,
			externalCustDir: find('external')?.customizationDirectory,
		}, {
			count: 3,
			ids: ['corrupt', 'external', 'ok'],
			okCustDir: URI.file('/ok').toString(),
			corruptCustDir: undefined,
			corruptSummary: 'Corrupt',
			externalCustDir: undefined,
		});
	});

	test('shutdown is idempotent and returns the same memoized promise on concurrent calls', async () => {
		// Phase 6+ INVARIANT: the SDK Query subprocess for each live
		// session is aborted inside `shutdown()`. If two callers race
		// (e.g. ChatService.onDidShutdown + the host's own teardown),
		// they MUST share one drain pass — otherwise we double-abort
		// and risk EBUSY on the SQLite handle. Phase 5 has no async
		// work yet, so the race is benign in practice; the memoization
		// is locked NOW so Phase 6 inherits the contract for free.
		// Mirror of `CopilotAgent.shutdown()` at copilotAgent.ts:1246.
		const { agent } = createTestContext(disposables);
		await agent.createSession({});
		await agent.createSession({});

		const first = agent.shutdown();
		const second = agent.shutdown();
		await Promise.all([first, second]);
		const third = agent.shutdown();
		await third;

		assert.deepStrictEqual({
			firstEqualsSecond: first === second,
			firstEqualsThird: first === third,
		}, {
			firstEqualsSecond: true,
			firstEqualsThird: true,
		});
	});

	test('ClaudeAgentSdkService caches the resolved module and logs the first load failure exactly once', async () => {
		// Plan section 3.1 risk: a corrupt postinstall (missing native binding,
		// bad node_modules) will fault every `import()` call. We MUST
		// surface the first failure clearly so it's diagnosable, but
		// MUST NOT spam the log on every subsequent call (listSessions
		// runs per workbench refresh and per session-list rerender).
		// Successful resolution is also cached so the dynamic import
		// runs only once across the lifetime of the host.
		//
		// We drive this via a `TestableClaudeAgentSdkService` that
		// overrides the protected `_loadSdk` seam — the production code
		// returns the narrowed `IClaudeSdkBindings` slice rather than
		// the full SDK module type, so the test can build a fake
		// without naming every export. A `RecordingLogService` captures
		// `error()` invocations.
		const errorCalls: unknown[][] = [];
		class RecordingLogService extends NullLogService {
			override error(...args: unknown[]): void {
				errorCalls.push(args);
			}
		}

		let importBehavior: 'fail' | IClaudeSdkBindings = 'fail';
		let importInvocations = 0;
		class TestableClaudeAgentSdkService extends ClaudeAgentSdkService {
			protected override async _loadSdk(): Promise<IClaudeSdkBindings> {
				importInvocations++;
				if (importBehavior === 'fail') {
					throw new Error('simulated SDK load failure');
				}
				return importBehavior;
			}
		}

		const services = new ServiceCollection([ILogService, new RecordingLogService()]);
		const inst = disposables.add(new InstantiationService(services));
		const svc = inst.createInstance(TestableClaudeAgentSdkService);

		// First two calls fault → exactly one log entry; both retry the import.
		await assert.rejects(() => svc.listSessions(), /simulated SDK load failure/);
		await assert.rejects(() => svc.listSessions(), /simulated SDK load failure/);
		const failuresLogged = errorCalls.length;
		const importInvocationsAfterFailures = importInvocations;

		// Recover.
		importBehavior = { listSessions: async () => [{ sessionId: 's', summary: 's', lastModified: 1 }] };
		const result1 = await svc.listSessions();
		const importInvocationsAfterFirstSuccess = importInvocations;

		// Subsequent successful calls hit the cache.
		const result2 = await svc.listSessions();

		assert.deepStrictEqual({
			failuresLogged,
			importInvocationsAfterFailures,
			importInvocationsAfterFirstSuccess,
			invocationsAfterCachedCall: importInvocations,
			result1Length: result1.length,
			result1Id: result1[0]?.sessionId,
			result2Length: result2.length,
			finalLogCount: errorCalls.length,
		}, {
			failuresLogged: 1,
			importInvocationsAfterFailures: 2,
			importInvocationsAfterFirstSuccess: 3,
			invocationsAfterCachedCall: 3,
			result1Length: 1,
			result1Id: 's',
			result2Length: 1,
			finalLogCount: 1,
		});
	});

	test('resolveSessionConfig returns Claude-native permissionMode + reused Permissions schema', async () => {
		// Plan section 3.3.5 / decision B5 — Claude collapses the platform's
		// two-axis approval model (`autoApprove` × `mode`) onto a single
		// `permissionMode` axis matching the SDK's native
		// `PermissionMode` enum. `Permissions` (allow/deny tool lists)
		// is reused unchanged from `platformSessionSchema` because the
		// SDK accepts `allowedTools` / `disallowedTools` natively.
		// Tested keys: presence + ordering of enum + the four-value
		// canonical set + default. Skipped keys (AutoApprove, Mode,
		// Isolation, Branch, BranchNameHint) MUST be absent — workbench
		// `AgentHostModePicker` and friends key off these property names
		// to decide what to render, and accidentally re-introducing
		// `mode` would drop the wrong picker into the Claude UI.
		const { agent } = createTestContext(disposables);
		const result = await agent.resolveSessionConfig({});
		const properties = result.schema.properties;
		const permissionMode = properties['permissionMode'];

		assert.deepStrictEqual({
			topLevelType: result.schema.type,
			propertyKeys: Object.keys(properties).sort(),
			permissionModeType: permissionMode?.type,
			permissionModeEnum: permissionMode?.enum,
			permissionModeDefault: permissionMode?.default,
			permissionsType: properties['permissions']?.type,
			values: result.values,
			autoApproveAbsent: properties['autoApprove'] === undefined,
			modeAbsent: properties['mode'] === undefined,
			isolationAbsent: properties['isolation'] === undefined,
			branchAbsent: properties['branch'] === undefined,
		}, {
			topLevelType: 'object',
			propertyKeys: ['permissionMode', 'permissions'],
			permissionModeType: 'string',
			permissionModeEnum: ['default', 'acceptEdits', 'bypassPermissions', 'plan'],
			permissionModeDefault: 'default',
			permissionsType: 'object',
			values: { permissionMode: 'default' },
			autoApproveAbsent: true,
			modeAbsent: true,
			isolationAbsent: true,
			branchAbsent: true,
		});
	});

	test('sessionConfigCompletions returns no items (permissionMode is a static enum)', async () => {
		// Plan section 3.3.5 — Claude's only schema property is the
		// `permissionMode` static enum, so dynamic completion is
		// definitionally empty. Locks the contract before Phase 6's
		// branch picker (subject to the worktree-extraction prerequisite
		// in section 8) might want to plug into this method.
		const { agent } = createTestContext(disposables);
		const result = await agent.sessionConfigCompletions({ property: 'permissionMode', query: 'def' });
		assert.deepStrictEqual(result, { items: [] });
	});

	test('dispose disposes session wrappers before releasing the proxy handle', async () => {
		// In Phase 6 the SDK `Query` subprocesses owned by each session
		// wrapper talk to the proxy and must be aborted before the proxy
		// handle is released. The ordering `wrappers → proxy` is therefore
		// load-bearing. Phase 5 has no subprocesses, but we lock the
		// ordering now via a monotonic-counter sentinel: each disposable
		// records its order, and wrapper teardown must precede proxy
		// release.
		let counter = 0;
		let proxyDisposedAt: number | undefined;
		let wrapperDisposedAt: number | undefined;

		class RecordingProxyService implements IClaudeProxyService {
			declare readonly _serviceBrand: undefined;
			async start(_token: string): Promise<IClaudeProxyHandle> {
				return {
					baseUrl: 'http://127.0.0.1:0',
					nonce: 'n',
					dispose: () => { proxyDisposedAt = ++counter; },
				};
			}
			dispose(): void { /* no-op */ }
		}
		class RecordingWrapper extends ClaudeAgentSession {
			override dispose(): void {
				wrapperDisposedAt = ++counter;
				super.dispose();
			}
		}
		class TestClaudeAgent extends ClaudeAgent {
			protected override _createSessionWrapper(sessionId: string, sessionUri: URI, workingDirectory: URI | undefined): ClaudeAgentSession {
				return new RecordingWrapper(sessionId, sessionUri, workingDirectory);
			}
		}

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new RecordingProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(TestClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await agent.createSession({});
		agent.dispose();

		assert.deepStrictEqual({
			wrapperRecorded: wrapperDisposedAt !== undefined,
			proxyRecorded: proxyDisposedAt !== undefined,
			wrapperBeforeProxy: (wrapperDisposedAt ?? Infinity) < (proxyDisposedAt ?? -Infinity),
		}, {
			wrapperRecorded: true,
			proxyRecorded: true,
			wrapperBeforeProxy: true,
		});
	});

	// #endregion
});
