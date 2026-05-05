/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { FileService } from '../../../files/common/fileService.js';
import { AgentSession } from '../../common/agentService.js';
import { ClaudeAgent } from '../../node/claude/claudeAgent.js';
import { IClaudeProxyHandle, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createNullSessionDataService } from '../common/sessionTestHelpers.js';

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

// #endregion

// #region Fixture models

/** Build a {@link CCAModel} with sensible defaults; override per test. */
function makeModel(overrides: Partial<CCAModel> & { readonly id: string; readonly name: string; readonly vendor: string }): CCAModel {
	return {
		billing: { is_premium: false, multiplier: 1, restricted_to: [] } as unknown as CCAModel['billing'],
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
}

function createTestContext(disposables: Pick<DisposableStore, 'add'>): ITestContext {
	const proxy = new FakeClaudeProxyService();
	const api = new FakeCopilotApiService();
	api.models = async () => [...ALL_MODELS];

	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[ICopilotApiService, api],
		[IClaudeProxyService, proxy],
	);
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));
	return { agent, proxy, api };
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
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		agent.dispose();
		agent.dispose();

		assert.strictEqual(proxy.disposeCount, 1);
	});

	test('stubbed methods throw with the right phase number', () => {
		const { agent } = createTestContext(disposables);
		const cases: Array<{ name: string; phase: number; thunk: () => unknown }> = [
			{ name: 'createSession', phase: 5, thunk: () => agent.createSession() },
			{ name: 'sendMessage', phase: 6, thunk: () => agent.sendMessage(URI.parse('claude:/x'), 'hi') },
			{ name: 'respondToPermissionRequest', phase: 7, thunk: () => agent.respondToPermissionRequest('id', true) },
			{ name: 'abortSession', phase: 9, thunk: () => agent.abortSession(URI.parse('claude:/x')) },
		];
		const observed = cases.map(c => {
			try {
				const result = c.thunk();
				if (result instanceof Promise) {
					// Surface the rejection synchronously for snapshotting.
					let err: Error | undefined;
					result.catch(e => { err = e instanceof Error ? e : new Error(String(e)); });
					// Async stubs throw synchronously in this implementation,
					// but if a future stub uses `async` the thunk will return
					// a rejected promise — fall through and miss the assertion.
					return { name: c.name, message: err?.message ?? 'no-throw' };
				}
				return { name: c.name, message: 'no-throw' };
			} catch (e) {
				return { name: c.name, message: e instanceof Error ? e.message : String(e) };
			}
		});

		assert.deepStrictEqual(
			observed,
			cases.map(c => ({ name: c.name, message: `TODO: Phase ${c.phase}` })),
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
});
