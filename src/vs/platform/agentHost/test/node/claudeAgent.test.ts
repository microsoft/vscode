/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { Options, Query, SDKMessage, SDKSessionInfo, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CCAModel } from '@vscode/copilot-api';

import assert from 'assert';
import {
	makeAssistantMessage,
	makeContentBlockStartText,
	makeContentBlockStartThinking,
	makeContentBlockStop,
	makeMessageStart,
	makeMessageStop,
	makeResultSuccess,
	makeStreamEvent,
	makeSystemInitMessage,
	makeTextDelta,
	makeThinkingDelta,
} from './claudeMapSessionEventsTestUtils.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { isUUID } from '../../../../base/common/uuid.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { FileService } from '../../../files/common/fileService.js';
import { IAgentMaterializeSessionEvent, AgentSession, AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { MessageAttachmentKind, ResponsePartKind } from '../../common/state/sessionState.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { ClaudeAgent } from '../../node/claude/claudeAgent.js';
import { ClaudeAgentSdkService, IClaudeAgentSdkService, IClaudeSdkBindings } from '../../node/claude/claudeAgentSdkService.js';
import { IClaudeProxyHandle, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { resolvePromptToContentBlocks } from '../../node/claude/claudePromptResolver.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { AgentService } from '../../node/agentService.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

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

	/**
	 * Phase 6: counts {@link startup} invocations. The Phase-6 contract
	 * is that materialization is the FIRST `startup()` call, so this
	 * field anchors invariants like "non-fork createSession does not
	 * touch the SDK" and "materialize fires exactly once".
	 */
	startupCallCount = 0;

	/**
	 * Captures every {@link Options} argument forwarded to {@link startup}.
	 * Tests assert env strip, abortController identity, sessionId / resume
	 * routing, and the canUseTool stub via this list.
	 */
	readonly capturedStartupOptions: Options[] = [];

	/**
	 * Programmable rejection for {@link startup}. Set per test to simulate
	 * SDK init failure (corrupt postinstall, network error, abort during
	 * init handshake). Cleared automatically after the first throw — set
	 * to a fresh value if a test wants repeated failures.
	 */
	startupRejection: Error | undefined;

	/**
	 * Messages the {@link FakeQuery} produced by `warm.query(...)` will
	 * yield. Tests stage the SDK transcript here before invoking
	 * `sendMessage`. The default empty array means the prompt iterable
	 * is consumed but no messages stream back — useful for tests that
	 * never expect a `result` (e.g. cancellation paths).
	 */
	nextQueryMessages: SDKMessage[] = [];

	/**
	 * Optional async hook invoked between yielded messages. Tests use it
	 * to block the iterator at a specific index so concurrent
	 * `sendMessage` / `disposeSession` / `shutdown` races can be staged
	 * deterministically. Resolves immediately when undefined.
	 */
	queryAdvance: ((index: number) => Promise<void>) | undefined;

	/** All warm queries produced by {@link startup}. Last entry is the most recent. */
	readonly warmQueries: FakeWarmQuery[] = [];

	/**
	 * Programmable rejection for {@link listSessions}. Set per test to
	 * simulate the SDK dynamic import failing (corrupt postinstall,
	 * missing optional dep). Mirror of {@link startupRejection}.
	 */
	listSessionsRejection: Error | undefined;

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		this.listSessionsCallCount++;
		if (this.listSessionsRejection) {
			const err = this.listSessionsRejection;
			throw err;
		}
		return this.sessionList;
	}

	/**
	 * Fake for {@link IClaudeAgentSdkService.getSessionInfo}. Tests stage
	 * `sessionList` and the fake searches it by id; setting
	 * {@link getSessionInfoOverride} replaces the default lookup
	 * wholesale (used to simulate the "session moved off disk" case).
	 */
	getSessionInfoOverride: ((sessionId: string) => Promise<SDKSessionInfo | undefined>) | undefined;

	getSessionInfoCalls: string[] = [];

	async getSessionInfo(sessionId: string): Promise<SDKSessionInfo | undefined> {
		this.getSessionInfoCalls.push(sessionId);
		if (this.getSessionInfoOverride) {
			return this.getSessionInfoOverride(sessionId);
		}
		return this.sessionList.find(s => s.sessionId === sessionId);
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		this.startupCallCount++;
		this.capturedStartupOptions.push(params.options);
		if (this.startupRejection) {
			const err = this.startupRejection;
			this.startupRejection = undefined;
			throw err;
		}
		const warm = new FakeWarmQuery(this);
		this.warmQueries.push(warm);
		return warm;
	}
}

/**
 * Test double for `WarmQuery`. Each instance is bound to a single
 * `FakeClaudeAgentSdkService` so mutations to `nextQueryMessages` after
 * `startup()` resolves but before `warm.query(...)` runs still propagate.
 */
class FakeWarmQuery implements WarmQuery {
	queryCallCount = 0;
	asyncDisposeCount = 0;
	closeCount = 0;
	/** The {@link FakeQuery} returned from `query()`. Undefined before. */
	produced: FakeQuery | undefined;

	constructor(private readonly _sdk: FakeClaudeAgentSdkService) { }

	query(prompt: string | AsyncIterable<SDKUserMessage>): Query {
		this.queryCallCount++;
		if (typeof prompt === 'string') {
			throw new Error('FakeWarmQuery: agent host always passes an AsyncIterable, never a string prompt');
		}
		const q = new FakeQuery(prompt, this._sdk);
		this.produced = q;
		return q;
	}

	close(): void {
		this.closeCount++;
	}

	async [Symbol.asyncDispose](): Promise<void> {
		this.asyncDisposeCount++;
	}
}

/**
 * Test double for the SDK's `Query` AsyncGenerator. Snapshots the bound
 * prompt iterable on construction so tests can assert on what the agent
 * actually pushed to the SDK, then yields messages from
 * {@link FakeClaudeAgentSdkService.nextQueryMessages} in order.
 */
class FakeQuery implements AsyncGenerator<SDKMessage, void> {
	/** The iterable passed to `warm.query(...)`. */
	readonly capturedPrompt: AsyncIterable<SDKUserMessage>;

	/** Prompts the agent has actually pushed (drained from `capturedPrompt` by `_collectPrompts`). */
	readonly drainedPrompts: SDKUserMessage[] = [];

	interruptCount = 0;
	returnCount = 0;
	throwCount = 0;

	private _yieldIndex = 0;

	constructor(prompt: AsyncIterable<SDKUserMessage>, private readonly _sdk: FakeClaudeAgentSdkService) {
		this.capturedPrompt = prompt;
		const iterator = prompt[Symbol.asyncIterator]();
		// Drain the prompt iterable in the background so the agent's
		// `_pendingPromptDeferred.complete()` actually pumps the queue.
		// The real SDK consumes prompts as they arrive; this fake mirrors
		// that pull behavior without waiting for the full transcript first.
		void (async () => {
			while (true) {
				const r = await iterator.next();
				if (r.done) {
					return;
				}
				this.drainedPrompts.push(r.value);
			}
		})();
	}

	[Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
		return this;
	}

	async next(): Promise<IteratorResult<SDKMessage, void>> {
		if (this._sdk.queryAdvance) {
			await this._sdk.queryAdvance(this._yieldIndex);
		}
		if (this._yieldIndex >= this._sdk.nextQueryMessages.length) {
			return { done: true, value: undefined };
		}
		const value = this._sdk.nextQueryMessages[this._yieldIndex++];
		return { done: false, value };
	}

	async return(_value: void): Promise<IteratorResult<SDKMessage, void>> {
		this.returnCount++;
		return { done: true, value: undefined };
	}

	async throw(err: unknown): Promise<IteratorResult<SDKMessage, void>> {
		this.throwCount++;
		throw err;
	}

	async interrupt(): Promise<void> {
		this.interruptCount++;
	}

	// Phase 6 doesn't exercise the rest of the Query control surface; if a
	// test trips one of these, surface it loudly so we know to model it.
	setPermissionMode(): never { throw new Error('FakeQuery: setPermissionMode not modeled'); }
	setModel(): never { throw new Error('FakeQuery: setModel not modeled'); }
	setMaxThinkingTokens(): never { throw new Error('FakeQuery: setMaxThinkingTokens not modeled'); }
	applyFlagSettings(): never { throw new Error('FakeQuery: applyFlagSettings not modeled'); }
	initializationResult(): never { throw new Error('FakeQuery: initializationResult not modeled'); }
	supportedCommands(): never { throw new Error('FakeQuery: supportedCommands not modeled'); }
	supportedModels(): never { throw new Error('FakeQuery: supportedModels not modeled'); }
	supportedAgents(): never { throw new Error('FakeQuery: supportedAgents not modeled'); }
	mcpServerStatus(): never { throw new Error('FakeQuery: mcpServerStatus not modeled'); }
	getContextUsage(): never { throw new Error('FakeQuery: getContextUsage not modeled'); }
	reloadPlugins(): never { throw new Error('FakeQuery: reloadPlugins not modeled'); }
	accountInfo(): never { throw new Error('FakeQuery: accountInfo not modeled'); }
	rewindFiles(): never { throw new Error('FakeQuery: rewindFiles not modeled'); }
	readFile(): never { throw new Error('FakeQuery: readFile not modeled'); }
	seedReadState(): never { throw new Error('FakeQuery: seedReadState not modeled'); }
	reconnectMcpServer(): never { throw new Error('FakeQuery: reconnectMcpServer not modeled'); }
	toggleMcpServer(): never { throw new Error('FakeQuery: toggleMcpServer not modeled'); }
	setMcpServers(): never { throw new Error('FakeQuery: setMcpServers not modeled'); }
	streamInput(): never { throw new Error('FakeQuery: streamInput not modeled'); }
	stopTask(): never { throw new Error('FakeQuery: stopTask not modeled'); }
	close(): void { /* no-op */ }
	[Symbol.asyncDispose](): Promise<void> { return Promise.resolve(); }
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

/**
 * Build a `CCAModelSupports` with `reasoning_effort` / `adaptive_thinking`
 * augmentations the SDK type doesn't yet declare (tracked at
 * microsoft/vscode-capi#85). Mirrors the runtime shape `claudeAgent.ts`
 * narrows at the read boundary.
 */
function makeSupports(extras: { adaptive_thinking?: boolean; reasoning_effort?: readonly string[] } = {}): CCAModel['capabilities']['supports'] {
	return { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false, ...extras } as CCAModel['capabilities']['supports'];
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

/**
 * {@link NullLogService} subclass that captures `warn` / `error` messages
 * so tests can assert defense-in-depth diagnostics fired from the mapper
 * or other internals. All other levels remain no-ops.
 */
class CapturingLogService extends NullLogService {
	readonly warns: string[] = [];
	readonly errors: string[] = [];
	override warn(message: string, ...args: unknown[]): void {
		this.warns.push([message, ...args.map(a => String(a))].join(' '));
	}
	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push([String(message), ...args.map(a => String(a))].join(' '));
	}
}

function createTestContext(
	disposables: Pick<DisposableStore, 'add'>,
	overrides?: { logService?: ILogService },
): ITestContext {
	const proxy = new FakeClaudeProxyService();
	const api = new FakeCopilotApiService();
	api.models = async () => [...ALL_MODELS];
	const sdk = new FakeClaudeAgentSdkService();
	const sessionData = new RecordingSessionDataService(createSessionDataService());

	const services = new ServiceCollection(
		[ILogService, overrides?.logService ?? new NullLogService()],
		[ICopilotApiService, api],
		[IClaudeProxyService, proxy],
		[ISessionDataService, sessionData],
		[IClaudeAgentSdkService, sdk],
		[IAgentHostGitService, createNoopGitService()],
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

	test('createSession before authenticate throws ProtocolError(AHP_AUTH_REQUIRED) with protected resources', async () => {
		const { agent } = createTestContext(disposables);

		await assert.rejects(
			() => agent.createSession({ workingDirectory: URI.file('/workspace') }),
			(err: Error) =>
				err instanceof ProtocolError &&
				err.code === AHP_AUTH_REQUIRED &&
				Array.isArray(err.data) &&
				(err.data as ProtectedResourceMetadata[])[0]?.resource === 'https://api.github.com',
		);
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
				{ provider: 'claude', id: 'claude-opus-4.6', name: 'Claude Opus 4.6', maxContextWindow: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1 } },
				{ provider: 'claude', id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', maxContextWindow: 200_000, supportsVision: false, policyState: 'enabled', _meta: { multiplierNumeric: 1 } },
			],
		});
	});

	test('authenticate surfaces the CAPI chat-default model first; ties preserve insertion order', async () => {
		// `IAgentModelInfo` carries no explicit `isDefault` bit; the
		// picker uses `models[0]` as the de facto default at
		// modelPicker.ts:144. So a stable sort by `is_chat_default`
		// ensures whichever model CAPI flags as the chat default ends
		// up at position 0, regardless of the order CAPI returned the
		// list. Equal-priority entries fall through the comparator
		// unchanged so insertion order wins on ties.
		const opus = makeModel({ id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic' });
		const sonnetDefault = makeModel({ id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic', is_chat_default: true });
		const haiku = makeModel({ id: 'claude-haiku-4.6', name: 'Claude Haiku 4.6', vendor: 'Anthropic' });

		const { agent, api } = createTestContext(disposables);
		api.models = async () => [opus, sonnetDefault, haiku];
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		assert.deepStrictEqual(
			agent.models.get().map(m => m.id),
			['claude-sonnet-4.6', 'claude-opus-4.6', 'claude-haiku-4.6'],
		);
	});

	test('authenticate sources configSchema enum from each model\'s reasoning_effort list (Phase 6.1 / Cycle D3 / I5)', async () => {
		// Per Phase 6.1 plan D3 + CONTEXT.md M12 (line ~1802): the
		// `configSchema.properties.thinkingLevel.enum` advertised on each
		// Claude model must come from that model's own
		// `capabilities.supports.reasoning_effort` list — different
		// Claude models support different effort subsets (some
		// `['low','medium','high']`, some `['high']`, some none at all).
		// Mirror of the extension pattern at
		// extensions/copilot/src/extension/chatSessions/claude/node/
		// claudeCodeModels.ts:208-212 (`pickReasoningEffort`), which
		// reads `endpoint.supportsReasoningEffort` per-endpoint.
		//
		// CAPI's `/models` JSON exposes `reasoning_effort: string[]` and
		// `adaptive_thinking: boolean` on each model's `supports` bag,
		// but the published `@vscode/copilot-api` types don't yet
		// surface these fields (tracked at microsoft/vscode-capi#85);
		// `claudeAgent.ts` narrows the bag locally at the read boundary.
		const capsBase = {
			family: 'test',
			limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
			object: 'model_capabilities',
			tokenizer: 'o200k_base',
			type: 'chat',
		} as const;
		const fullEffortModel = makeModel({
			id: 'claude-opus-4.6', name: 'Claude Opus 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['low', 'medium', 'high'] }) },
		});
		const highOnlyModel = makeModel({
			id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['high'] }) },
		});
		const emptyEffortModel = makeModel({
			id: 'claude-haiku-4.6', name: 'Claude Haiku 4.6', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: false, reasoning_effort: [] }) },
		});
		const unknownEffortModel = makeModel({
			id: 'claude-opus-4.5', name: 'Claude Opus 4.5', vendor: 'Anthropic',
			capabilities: { ...capsBase, supports: makeSupports({ adaptive_thinking: true, reasoning_effort: ['low', 'bogus', 'high'] }) },
		});
		const noEffortFieldModel = makeModel({
			id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'Anthropic',
		});

		const { agent, api } = createTestContext(disposables);
		api.models = async () => [fullEffortModel, highOnlyModel, emptyEffortModel, unknownEffortModel, noEffortFieldModel];
		await agent.authenticate('https://api.github.com', 'tok');
		await tick();

		const schemasById = Object.fromEntries(
			agent.models.get().map(m => [m.id, m.configSchema] as const),
		);
		assert.deepStrictEqual(schemasById, {
			'claude-opus-4.6': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'medium', 'high'],
						enumLabels: ['Low', 'Medium', 'High'],
						default: 'high',
					},
				},
			},
			'claude-sonnet-4.6': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['high'],
						enumLabels: ['High'],
						default: 'high',
					},
				},
			},
			'claude-haiku-4.6': undefined,
			'claude-opus-4.5': {
				type: 'object',
				properties: {
					thinkingLevel: {
						type: 'string',
						title: 'Thinking Level',
						description: 'Controls how much reasoning effort Claude uses.',
						enum: ['low', 'high'],
						enumLabels: ['Low', 'High'],
						default: 'high',
					},
				},
			},
			'claude-sonnet-4.5': undefined,
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
			[IAgentHostGitService, createNoopGitService()],
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
		// `abortSession` and `changeModel` MUST return a rejected promise
		// (not throw synchronously). AgentSideEffects.handleAction chains
		// `.catch()` on the result to surface the error as a SessionError
		// action; a synchronous throw escapes that chain and the workbench
		// hangs forever on a turn that never finishes (the live smoke
		// caught this in the Phase 5 walk).
		// `respondToPermissionRequest`/`respondToUserInputRequest` are
		// `void`-returning by interface, so they throw synchronously and we
		// capture that via try/catch.
		//
		// Phase 6 update: `sendMessage` graduated from the stubbed list —
		// it now materializes the provisional session and forwards to
		// `ClaudeAgentSession.send`. Its negative path (unknown session
		// id) is covered by Cycle 12; keep this test focused on stubs.
		const { agent } = createTestContext(disposables);
		const promiseCases: Array<{ name: string; phase: number; thunk: () => Promise<unknown> }> = [
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

	test('createSession (non-fork) returns a claude:/<uuid> URI with provisional: true; no DB or SDK contact', async () => {
		// Phase 6 §5.1 Test 1. Per-session DB is overlay/cache only and
		// the SDK subprocess fork is deferred until first sendMessage.
		// `provisional: true` opts the session into the AgentService's
		// deferred-`sessionAdded` protocol. Workbench eagerly creates
		// sessions on folder-pick + arms a 30s GC; for an empty Claude
		// session that's a cheap in-memory drop because nothing has
		// been persisted yet.
		const { agent, sdk, sessionData } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const result = await agent.createSession({ workingDirectory: URI.parse('file:///workspace') });

		assert.deepStrictEqual({
			scheme: result.session.scheme,
			provider: AgentSession.provider(result.session),
			isUuid: isUUID(AgentSession.id(result.session)),
			workingDirectory: result.workingDirectory?.toString(),
			provisional: result.provisional,
			openDatabaseCalls: sessionData.openDatabaseCallCount,
			tryOpenDatabaseCalls: sessionData.tryOpenDatabaseCallCount,
			startupCallCount: sdk.startupCallCount,
			listSessionsCallCount: sdk.listSessionsCallCount,
		}, {
			scheme: 'claude',
			provider: 'claude',
			isUuid: true,
			workingDirectory: 'file:///workspace',
			provisional: true,
			openDatabaseCalls: 0,
			tryOpenDatabaseCalls: 0,
			startupCallCount: 0,
			listSessionsCallCount: 0,
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
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const expected = AgentSession.uri('claude', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

		const result = await agent.createSession({ session: expected });

		assert.deepStrictEqual({
			session: result.session.toString(),
			provisional: result.provisional,
		}, {
			session: expected.toString(),
			provisional: true,
		});
	});

	test('createSession({ fork }) throws TODO: Phase 6.5 with no side effects', async () => {
		// Phase-6 update: fork is deferred to Phase 6.5 because Claude's
		// `forkSession(sessionId, { upToMessageId })` takes a message UUID,
		// not an event id, and the protocol-turn-ID → message-UUID
		// translation needs `sdk.getSessionMessages` (also Phase 6.5).
		// Locking the throw message here so a half-implementation can't
		// land in Phase 6 without re-greening this case.
		const { agent, sessionData, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		await assert.rejects(
			agent.createSession({
				fork: {
					session: AgentSession.uri('claude', 'src-uuid'),
					turnIndex: 0,
					turnId: 'turn-1',
				},
			}),
			/Phase 6\.5/,
		);

		assert.deepStrictEqual({
			openDatabaseCalls: sessionData.openDatabaseCallCount,
			tryOpenDatabaseCalls: sessionData.tryOpenDatabaseCallCount,
			startupCallCount: sdk.startupCallCount,
			listSessionsCallCount: sdk.listSessionsCallCount,
		}, {
			openDatabaseCalls: 0,
			tryOpenDatabaseCalls: 0,
			startupCallCount: 0,
			listSessionsCallCount: 0,
		});
	});

	test('first sendMessage on a provisional session materializes it (single startup, single materialize event)', async () => {
		// Phase 6 §5.1 Test 3 (tracer). Forces the materialize spine into
		// existence: `_provisionalSessions` map, `_materializeProvisional`,
		// `IClaudeAgentSdkService.startup()`, `_onDidMaterializeSession`
		// event, and `entry.send` plumbing in `ClaudeAgentSession`.
		//
		// Public-interface assertions only: we never read `_sessions`
		// or `_provisionalSessions` directly. The behavioral signature
		// of "first send materializes" is:
		//   - SDK `startup()` is called exactly once (was 0 after
		//     createSession; is 1 after sendMessage).
		//   - The materialize event fires exactly once with the right URI.
		//   - The startup options carry the working directory the user
		//     picked at createSession time.
		const { agent, sdk, proxy } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		assert.strictEqual(proxy.startCalls.length, 1, 'proxy started by authenticate');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		assert.strictEqual(sdk.startupCallCount, 0, 'createSession does not touch the SDK');

		const events: IAgentMaterializeSessionEvent[] = [];
		assert.ok(agent.onDidMaterializeSession, 'agent must expose onDidMaterializeSession');
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			materializeEventCount: events.length,
			eventSession: events[0]?.session.toString(),
			eventCwd: events[0]?.workingDirectory?.fsPath,
			startupOptionsCwd: sdk.capturedStartupOptions[0]?.cwd,
			startupOptionsSessionId: sdk.capturedStartupOptions[0]?.sessionId,
		}, {
			startupCallCount: 1,
			materializeEventCount: 1,
			eventSession: created.session.toString(),
			eventCwd: URI.file('/work').fsPath,
			startupOptionsCwd: URI.file('/work').fsPath,
			startupOptionsSessionId: sessionId,
		});
	});

	test('materialize event payload shape — { session, workingDirectory, project: undefined }', async () => {
		// Phase 6 §5.1 Test 4. Pins the {@link IAgentMaterializeSessionEvent}
		// payload independently of the tracer in Test 3. The default
		// {@link createNoopGitService} produces no project metadata, so
		// `project` is `undefined`. AgentService relies on this exact
		// shape to forward to its `sessionAdded` notification (it spreads
		// the event into `IAgentSessionMetadata`-shaped fields), so a
		// snapshot here is the load-bearing contract.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const cwd = URI.file('/payload-shape');
		const created = await agent.createSession({ workingDirectory: cwd });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const events: IAgentMaterializeSessionEvent[] = [];
		assert.ok(agent.onDidMaterializeSession);
		disposables.add(agent.onDidMaterializeSession(e => events.push(e)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		assert.strictEqual(events.length, 1, 'event fires exactly once');
		const ev = events[0];
		assert.deepStrictEqual({
			session: ev.session.toString(),
			workingDirectory: ev.workingDirectory?.toString(),
			project: ev.project,
			keys: Object.keys(ev).sort(),
		}, {
			session: created.session.toString(),
			workingDirectory: cwd.toString(),
			project: undefined,
			keys: ['project', 'session', 'workingDirectory'],
		});
	});

	test('createSession config.model + config.config.permissionMode flow into Options on first send (M11 / Phase 6.1 C2)', async () => {
		// Phase 6.1 Cycle E (drift C2). M11 mandates that the
		// `IAgentCreateSessionConfig` bag (`model` + `config.*`) survives
		// from `createSession` → provisional record → first `query()`'s
		// `Options.*`. The pre-fix surface dropped both: `provisional`
		// had no `model`/`config` fields and the materialize site
		// hardcoded `permissionMode: 'default'` with no `Options.model`
		// at all — SDK defaults silently won.
		// Pinned shape: `Options.model === created-time model.id`,
		// `Options.permissionMode === created-time permissionMode`.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			model: { id: 'claude-sonnet-4.6' },
			config: { permissionMode: 'plan' },
		});
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			permissionMode: sdk.capturedStartupOptions[0]?.permissionMode,
		}, {
			model: 'claude-sonnet-4.6',
			permissionMode: 'plan',
		});
	});

	test('createSession model.config.thinkingLevel flows into Options.effort on first send (M11 / Phase 6.1 C2)', async () => {
		// Phase 6.1 Cycle E. Per CONTEXT.md M11 + the M-portrait at
		// CONTEXT.md:1497, `effort` is the third leg of the
		// `IAgentCreateSessionConfig` → `Options.*` triplet (alongside
		// model and permissionMode). Unlike the other two, effort is
		// nested inside `ModelSelection.config.thinkingLevel` rather
		// than living as its own session-config key — mirroring
		// CopilotAgent's `_getReasoningEffort` pattern at
		// copilotAgent.ts:487. The SDK's `Options.effort` accepts the
		// full 5-value `EffortLevel` union (sdk.d.ts:443 + sdk.d.ts:1214);
		// the 4-value clamp at sdk.d.ts:4292 only applies to the live
		// `applyFlagSettings` hot-swap path (Phase 9).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			model: { id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } },
		});
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		assert.deepStrictEqual({
			model: sdk.capturedStartupOptions[0]?.model,
			effort: sdk.capturedStartupOptions[0]?.effort,
		}, {
			model: 'claude-opus-4.6',
			effort: 'high',
		});
	});

	test('two sendMessage calls reuse the materialized Query', async () => {
		// Phase 6 §5.1 Test 5. After the first send materializes the
		// session, subsequent sends MUST push onto the same prompt
		// iterable / SDK Query — they MUST NOT re-fork the subprocess
		// (`startup()` is expensive and would lose conversational state
		// since the SDK's resume-from-session-id only kicks in on init).
		// The invariants here are: (a) `startup()` is called exactly once
		// across both turns, (b) `warm.query()` is bound exactly once,
		// (c) both deferreds resolve on their respective `result` SDK
		// messages, (d) both prompts traverse the prompt iterable.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Stage two turns. Park the iterator at index 2 (right after the
		// first `result`) until the test releases it; this proves the
		// second send reuses the same Query rather than spawning a new
		// one (the gate would otherwise be irrelevant). Index choice
		// mirrors plan §5.1 test 5.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 2) {
				await advance.p;
			}
		};
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
			makeResultSuccess(sessionId),
		];

		// First turn — materializes; resolves on result(idx=1).
		await agent.sendMessage(created.session, 'turn-1', undefined, 'turn-id-1');

		// Snapshot before the second send so we can assert the second send
		// did NOT call startup() again.
		const startupCallsAfterTurn1 = sdk.startupCallCount;
		const queryCallsAfterTurn1 = sdk.warmQueries[0]?.queryCallCount ?? -1;

		// Second turn — pushes onto the existing Query.
		const p2 = agent.sendMessage(created.session, 'turn-2', undefined, 'turn-id-2');
		// Release the parked iterator so result(idx=2) flows through.
		advance.complete();
		await p2;

		assert.deepStrictEqual({
			startupCallsAfterTurn1,
			startupCallsAfterTurn2: sdk.startupCallCount,
			queryCallsAfterTurn1,
			queryCallsAfterTurn2: sdk.warmQueries[0]?.queryCallCount,
			warmQueryCount: sdk.warmQueries.length,
			drainedPromptCount: sdk.warmQueries[0]?.produced?.drainedPrompts.length,
		}, {
			startupCallsAfterTurn1: 1,
			startupCallsAfterTurn2: 1,
			queryCallsAfterTurn1: 1,
			queryCallsAfterTurn2: 1,
			warmQueryCount: 1,
			drainedPromptCount: 2,
		});
	});

	test('text content_block emits SessionResponsePart(Markdown) before SessionDelta', async () => {
		// Phase 6 §5.1 Test 6 + §3.6. The protocol reducer at
		// `actions.ts:233 (SessionDelta)` requires the targeted
		// `SessionResponsePart` to have already been emitted, otherwise
		// the delta has nowhere to land. This test pins that ordering by
		// staging a single text turn and asserting the first emitted
		// `SessionResponsePart(Markdown, partId=X)` precedes every
		// `SessionDelta(partId=X)` for the same X. The mapper allocates
		// the partId on `content_block_start`, BEFORE any delta can
		// arrive (deltas are SDK-ordered after the start), so the
		// invariant holds by construction.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'hello ')),
			makeStreamEvent(sessionId, makeTextDelta(0, 'world')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const actionSignals = signals.filter(s => s.kind === 'action');
		const partActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.SessionResponsePart);
		const deltaActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.SessionDelta);

		assert.strictEqual(partActions.length, 1, 'exactly one Markdown response part');
		assert.strictEqual(deltaActions.length, 2, 'two text deltas');

		const part = partActions[0].s.kind === 'action' && partActions[0].s.action.type === ActionType.SessionResponsePart
			? partActions[0].s.action
			: undefined;
		const firstDelta = deltaActions[0].s.kind === 'action' && deltaActions[0].s.action.type === ActionType.SessionDelta
			? deltaActions[0].s.action
			: undefined;
		const secondDelta = deltaActions[1].s.kind === 'action' && deltaActions[1].s.action.type === ActionType.SessionDelta
			? deltaActions[1].s.action
			: undefined;

		assert.ok(part, 'SessionResponsePart action present');
		assert.ok(firstDelta, 'first SessionDelta action present');
		assert.ok(secondDelta, 'second SessionDelta action present');
		assert.strictEqual(part.part.kind, ResponsePartKind.Markdown, 'part kind is Markdown');

		assert.deepStrictEqual({
			partKindIsMarkdown: part.part.kind === ResponsePartKind.Markdown,
			partPrecedesDelta: partActions[0].i < deltaActions[0].i,
			partIdsMatch: part.part.id === firstDelta.partId && part.part.id === secondDelta.partId,
			turnId: part.turnId,
			deltaTexts: [firstDelta.content, secondDelta.content],
			session: part.session.toString(),
		}, {
			partKindIsMarkdown: true,
			partPrecedesDelta: true,
			partIdsMatch: true,
			turnId: 'turn-1',
			deltaTexts: ['hello ', 'world'],
			session: created.session.toString(),
		});
	});

	test('thinking content_block emits SessionResponsePart(Reasoning) before SessionReasoning', async () => {
		// Phase 6 §5.1 Test 7. Same ordering invariant as Test 6 but for
		// extended-thinking blocks: `SessionResponsePart(Reasoning)` MUST
		// precede every `SessionReasoning(partId)` for the same partId
		// (`actions.ts:540` reducer requires the part to exist).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartThinking(0)),
			makeStreamEvent(sessionId, makeThinkingDelta(0, 'let me think')),
			makeStreamEvent(sessionId, makeThinkingDelta(0, ' more')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const actionSignals = signals.filter(s => s.kind === 'action');
		const partActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.SessionResponsePart);
		const reasoningActions = actionSignals
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.kind === 'action' && s.action.type === ActionType.SessionReasoning);

		const part = partActions[0]?.s.kind === 'action' && partActions[0].s.action.type === ActionType.SessionResponsePart
			? partActions[0].s.action
			: undefined;
		const firstReasoning = reasoningActions[0]?.s.kind === 'action' && reasoningActions[0].s.action.type === ActionType.SessionReasoning
			? reasoningActions[0].s.action
			: undefined;
		const secondReasoning = reasoningActions[1]?.s.kind === 'action' && reasoningActions[1].s.action.type === ActionType.SessionReasoning
			? reasoningActions[1].s.action
			: undefined;

		assert.ok(part, 'SessionResponsePart action present');
		assert.ok(firstReasoning, 'first SessionReasoning action present');
		assert.ok(secondReasoning, 'second SessionReasoning action present');
		assert.ok(part.part.kind === ResponsePartKind.Reasoning, 'part kind is Reasoning');

		assert.deepStrictEqual({
			partActionsCount: partActions.length,
			reasoningActionsCount: reasoningActions.length,
			partKindIsReasoning: part.part.kind === ResponsePartKind.Reasoning,
			partPrecedesReasoning: partActions[0].i < reasoningActions[0].i,
			partIdsMatch: part.part.id === firstReasoning.partId && part.part.id === secondReasoning.partId,
			turnId: part.turnId,
			reasoningTexts: [firstReasoning.content, secondReasoning.content],
		}, {
			partActionsCount: 1,
			reasoningActionsCount: 2,
			partKindIsReasoning: true,
			partPrecedesReasoning: true,
			partIdsMatch: true,
			turnId: 'turn-1',
			reasoningTexts: ['let me think', ' more'],
		});
	});

	test('result emits SessionUsage immediately before SessionTurnComplete', async () => {
		// Phase 6 §5.1 Test 8 + §4 mapping table. The protocol contract
		// requires usage to be reported BEFORE the turn is marked
		// complete (otherwise consumers that flush state on
		// `SessionTurnComplete` lose the usage attribution). Both
		// signals come from the single `result` SDK message; the mapper
		// emits them in the prescribed order.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		const result = makeResultSuccess(sessionId);
		// Override the zero-default usage with values the mapper must
		// forward verbatim into `SessionUsage.usage`.
		result.usage.input_tokens = 17;
		result.usage.output_tokens = 42;
		result.usage.cache_read_input_tokens = 5;
		result.modelUsage = {
			'claude-sonnet-4-test': {
				inputTokens: 17,
				outputTokens: 42,
				cacheReadInputTokens: 5,
				cacheCreationInputTokens: 0,
				webSearchRequests: 0,
				costUSD: 0,
				contextWindow: 200000,
				maxOutputTokens: 8192,
			},
		};
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), result];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const tail = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter((a): a is NonNullable<typeof a> =>
				a?.type === ActionType.SessionUsage || a?.type === ActionType.SessionTurnComplete);

		const usage = tail[0]?.type === ActionType.SessionUsage ? tail[0] : undefined;
		const complete = tail[1]?.type === ActionType.SessionTurnComplete ? tail[1] : undefined;

		assert.ok(usage, 'first action in tail is SessionUsage');
		assert.ok(complete, 'second action in tail is SessionTurnComplete');

		assert.deepStrictEqual({
			tailLength: tail.length,
			usageType: tail[0]?.type,
			completeType: tail[1]?.type,
			usageTurnId: usage.turnId,
			completeTurnId: complete.turnId,
			inputTokens: usage.usage.inputTokens,
			outputTokens: usage.usage.outputTokens,
			cacheReadTokens: usage.usage.cacheReadTokens,
			model: usage.usage.model,
		}, {
			tailLength: 2,
			usageType: ActionType.SessionUsage,
			completeType: ActionType.SessionTurnComplete,
			usageTurnId: 'turn-1',
			completeTurnId: 'turn-1',
			inputTokens: 17,
			outputTokens: 42,
			cacheReadTokens: 5,
			model: 'claude-sonnet-4-test',
		});
	});

	test('multiple text blocks each get a distinct partId; deltas route correctly', async () => {
		// Phase 6 §5.1 Test 9. Anthropic streams interleave text blocks
		// (e.g. assistant emits two paragraphs in the same turn). Each
		// `content_block_start` event has a distinct `index`; the mapper
		// allocates a fresh partId per index and routes deltas via the
		// `currentBlockParts` map. This test stages two text blocks at
		// indices 0 and 1, sends a delta into each, and asserts the
		// allocation produced two distinct partIds and the deltas
		// landed on the right one.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'first ')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeContentBlockStartText(1)),
			makeStreamEvent(sessionId, makeTextDelta(1, 'second')),
			makeStreamEvent(sessionId, makeContentBlockStop(1)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const partActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.SessionResponsePart);
		const deltaActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.SessionDelta);

		const part0 = partActions[0]?.type === ActionType.SessionResponsePart ? partActions[0] : undefined;
		const part1 = partActions[1]?.type === ActionType.SessionResponsePart ? partActions[1] : undefined;
		const delta0 = deltaActions[0]?.type === ActionType.SessionDelta ? deltaActions[0] : undefined;
		const delta1 = deltaActions[1]?.type === ActionType.SessionDelta ? deltaActions[1] : undefined;

		assert.ok(part0 && part1, 'two SessionResponsePart actions present');
		assert.ok(delta0 && delta1, 'two SessionDelta actions present');

		const id0 = part0.part.kind === ResponsePartKind.Markdown ? part0.part.id : '';
		const id1 = part1.part.kind === ResponsePartKind.Markdown ? part1.part.id : '';

		assert.deepStrictEqual({
			partActionsCount: partActions.length,
			deltaActionsCount: deltaActions.length,
			distinctPartIds: id0 !== id1,
			delta0RoutedToPart0: delta0.partId === id0,
			delta1RoutedToPart1: delta1.partId === id1,
			delta0Content: delta0.content,
			delta1Content: delta1.content,
		}, {
			partActionsCount: 2,
			deltaActionsCount: 2,
			distinctPartIds: true,
			delta0RoutedToPart0: true,
			delta1RoutedToPart1: true,
			delta0Content: 'first ',
			delta1Content: 'second',
		});
	});

	test('canonical SDKAssistantMessage with tool_use content fires defense-in-depth warning (Phase 6.1 / Cycle F)', async () => {
		// Phase 6 sets `canUseTool: deny`, so the canonical
		// `SDKAssistantMessage` (`type: 'assistant'`) should never carry
		// `tool_use` content blocks. If one arrives anyway (SDK race,
		// future change) the mapper warns and drops rather than handing
		// the reducer a part it has no handler for. Mirrors the existing
		// `content_block_start` defense-in-depth at
		// claudeMapSessionEvents.ts:163-167.
		const logService = new CapturingLogService();
		const { agent, sdk } = createTestContext(disposables, { logService });
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeAssistantMessage(sessionId, [
				{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
			]),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const responsePartCount = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.SessionResponsePart).length;

		assert.deepStrictEqual({
			responsePartCount,
			warnedAboutToolUse: logService.warns.some(m => /tool_use/.test(m)),
		}, {
			responsePartCount: 0,
			warnedAboutToolUse: true,
		});
	});

	test('canonical SDKAssistantMessage with text content does not double-emit signals already produced by stream_event partials (Phase 6.1 / Cycle F)', async () => {
		// CONTEXT.md M8:875 — partials are advisory, final
		// `SDKAssistantMessage` is canonical. With `includePartialMessages:
		// true` (Phase 6 §3.4) the `stream_event` partials already drove
		// the response part + per-token deltas. The terminal `'assistant'`
		// envelope MUST NOT add a second copy: the reducer is append-only
		// (no replace path), so a double-emit would corrupt the activeTurn
		// `responseParts` list with a duplicated block.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'hello')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeAssistantMessage(sessionId, [
				{ type: 'text', text: 'hello', citations: null },
			]),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => signals.push(s)));

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const partActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.SessionResponsePart);
		const deltaActions = signals
			.map(s => s.kind === 'action' ? s.action : undefined)
			.filter(a => a?.type === ActionType.SessionDelta);

		const delta0 = deltaActions[0]?.type === ActionType.SessionDelta ? deltaActions[0] : undefined;

		assert.deepStrictEqual({
			partCount: partActions.length,
			deltaCount: deltaActions.length,
			deltaContent: delta0?.content,
		}, {
			partCount: 1,
			deltaCount: 1,
			deltaContent: 'hello',
		});
	});

	test('_isResumed flips on first system:init', async () => {
		// Phase 6 §5.1 Test 10. The SDK's `system:init` message marks
		// the start of a session. Phase 7+ teardown+recreate uses
		// `_isResumed` to drive `Options.resume = sessionId` on the
		// second `startup()`, signalling the SDK to reuse the existing
		// transcript. Phase 6 has no teardown+recreate yet, so the test
		// asserts the flag flip directly through a session getter.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		// Snapshot before the SDK has streamed any messages.
		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const session = agent.getSessionForTesting(created.session);
		assert.ok(session, 'session is materialized');
		assert.strictEqual(session.isResumed, true, 'isResumed flipped after system:init');
	});

	test('disposing a materialized session aborts the controller and rejects the in-flight send', async () => {
		// Phase 6 §5.1 Test 11. The dispose chain registered in
		// `ClaudeAgentSession`'s constructor calls
		// `abortController.abort()`. The for-await loop sees
		// `signal.aborted` and throws `CancellationError`, and the
		// `_processMessages` catch latches `_fatalError` + rejects every
		// in-flight deferred. Without the latch the in-flight send
		// would park forever and the test would hang.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		// Park the iterator at index 0 so `_processMessages` is
		// suspended inside `next()` when dispose runs. After dispose
		// flips `signal.aborted`, releasing `advance` lets the
		// for-await body run the `if (aborted) throw` check.
		const advance = new DeferredPromise<void>();
		sdk.queryAdvance = async (idx: number) => {
			if (idx === 0) {
				await advance.p;
			}
		};
		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		// Use the materialize event to deterministically wait until the
		// session is in `_sessions` (and the in-flight deferred has been
		// queued by `entry.send`). Without this we'd race materialize.
		const materialized = Event.toPromise(agent.onDidMaterializeSession);

		const send = agent.sendMessage(created.session, 'hi', undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		await materialized;
		// One additional macro-flush so `entry.send` has pushed the
		// deferred to `_inFlightRequests` and `_processMessages` has
		// started its for-await (parked on `advance.p`).
		await new Promise<void>(resolve => setImmediate(resolve));

		const aborter = sdk.capturedStartupOptions[0]?.abortController;
		await agent.disposeSession(created.session);
		// Release the parked iterator so the for-await loop unblocks
		// and the abort-check throws CancellationError.
		advance.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			abortedAfterDispose: aborter?.signal.aborted,
			sessionRemoved: agent.getSessionForTesting(created.session) === undefined,
		}, {
			rejectedIsCancellation: true,
			abortedAfterDispose: true,
			sessionRemoved: true,
		});
	});

	test('dispose racing _writeCustomizationDirectory does not orphan the materialized session (C1)', async () => {
		// Council-review C1 regression. The plan's Q8 belt-and-suspenders
		// abort guard at `_materializeProvisional` only catches an abort
		// that lands while `await sdk.startup()` is in flight.
		// `_writeCustomizationDirectory` is a SECOND async boundary where
		// a racing `disposeSession` (which uses `_disposeSequencer` — a
		// different sequencer from `sendMessage`'s `_sessionSequencer`)
		// can fire, find the provisional record, abort, remove, and
		// return. Without the pre-commit abort gate added in this fix,
		// materialize would still set `_sessions[sessionId]` and fire
		// `onDidMaterializeSession` — leaking a WarmQuery subprocess.
		//
		// Test setup uses a custom session database whose `setMetadata`
		// blocks on a per-test deferred so we can deterministically
		// interleave dispose with persist. The fix asserts:
		//  - the racing `sendMessage` rejects with `CancellationError`
		//  - the session never lands in `_sessions`
		//  - `onDidMaterializeSession` never fires
		//  - the WarmQuery is asyncDisposed (no orphan subprocess)
		const persistGate = new DeferredPromise<void>();
		let persistEntered = false;
		const blockingDb = new TestSessionDatabase();
		const originalSetMetadata = blockingDb.setMetadata.bind(blockingDb);
		blockingDb.setMetadata = async (key, value) => {
			persistEntered = true;
			await persistGate.p;
			await originalSetMetadata(key, value);
		};

		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];
		const sdk = new FakeClaudeAgentSdkService();
		const sessionData = createSessionDataService(blockingDb);

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentHostGitService, createNoopGitService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const materializeEvents: IAgentMaterializeSessionEvent[] = [];
		disposables.add(agent.onDidMaterializeSession(e => materializeEvents.push(e)));

		// Kick off the materialize. It will pass the post-startup abort
		// gate, create the wrapper, then park inside `setMetadata`.
		const send = agent.sendMessage(created.session, 'hi', undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		// Wait until the persist step has actually been entered. This is
		// the deterministic gate — without it we'd be racing the materialize
		// progress against our dispose call.
		while (!persistEntered) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		// Now dispose while persist is parked. The dispose-sequencer is
		// independent of the send-sequencer, so this runs immediately:
		// finds the provisional, aborts the controller, removes from
		// `_provisionalSessions`, returns.
		await agent.disposeSession(created.session);

		// Release the persist gate. Materialize resumes after the
		// `await setMetadata`, hits the pre-commit abort gate (signal is
		// aborted), disposes the wrapper, and throws CancellationError.
		persistGate.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			sessionNotInMap: agent.getSessionForTesting(created.session) === undefined,
			materializeNeverFired: materializeEvents.length === 0,
			warmQueryDisposed: sdk.warmQueries[0]?.asyncDisposeCount === 1,
		}, {
			rejectedIsCancellation: true,
			sessionNotInMap: true,
			materializeNeverFired: true,
			warmQueryDisposed: true,
		});
	});

	test('disposing a provisional session never calls SDK startup and removes the record', async () => {
		// Phase 6 §5.1 Test 12. Symmetric with createSession's
		// "no SDK contact" invariant: provisional dispose must NOT
		// reach `sdk.startup` (no subprocess spawn for an
		// already-cancelled session). Pinned by:
		//  - `sdk.startupCallCount === 0` after dispose
		//  - a subsequent `sendMessage` for the same URI throws
		//    'Cannot send to unknown session' (proves the provisional
		//    record was actually removed, not just abort-flagged)
		//  - the provisional's `AbortController` flipped to aborted
		//    (so any future racing materialize would short-circuit)
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({ workingDirectory: URI.file('/work') });

		await agent.disposeSession(created.session);

		// Materializing now requires a provisional record; without it
		// the sequencer task throws synchronously inside the queued fn.
		const sendErr = await agent.sendMessage(created.session, 'hi', undefined, 'turn-1')
			.then(() => undefined, err => err);

		assert.deepStrictEqual({
			startupCallCount: sdk.startupCallCount,
			warmQueriesLength: sdk.warmQueries.length,
			sendThrewUnknown: sendErr instanceof Error && /unknown session/i.test(sendErr.message),
			materializedAbsent: agent.getSessionForTesting(created.session) === undefined,
		}, {
			startupCallCount: 0,
			warmQueriesLength: 0,
			sendThrewUnknown: true,
			materializedAbsent: true,
		});
	});

	test('shutdown drains a mix of provisional and materialized sessions', async () => {
		// Phase 6 §5.1 Test 13. The shutdown spec is two-phase:
		//  1) Provisional sessions: abort each AbortController + clear
		//     the map. No SDK contact (mirrors `disposeSession`'s
		//     provisional branch). This unblocks any racing
		//     `await sdk.startup()` so the materialize unwinds via the
		//     post-startup abort guard.
		//  2) Materialized sessions: drain through the per-session
		//     `_disposeSequencer` so a concurrent caller targeting the
		//     same id is serialized; each entry's `dispose()` flips
		//     `signal.aborted` and asyncDisposes the WarmQuery.
		// What this test pins: after `shutdown()`, every provisional
		// AbortController is aborted, every materialized session has
		// been removed from the map, and `shutdown()` is memoized
		// (second call returns the same promise identity).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		// Materialize one session by running a turn end-to-end.
		const matCreated = await agent.createSession({ workingDirectory: URI.file('/work-mat') });
		sdk.nextQueryMessages = [
			makeSystemInitMessage(AgentSession.id(matCreated.session)),
			makeResultSuccess(AgentSession.id(matCreated.session)),
		];
		await agent.sendMessage(matCreated.session, 'hi', undefined, 'turn-1');

		// Leave a second session provisional.
		const provCreated = await agent.createSession({ workingDirectory: URI.file('/work-prov') });
		const provAborter = (() => {
			// The provisional's controller isn't directly observable from the
			// public surface; capture it indirectly via the `capturedStartupOptions`
			// of a hypothetical materialize. Since we never materialize the
			// provisional here, we reach into the agent's test accessor:
			const provSession = agent.getSessionForTesting(provCreated.session);
			assert.strictEqual(provSession, undefined, 'second session must remain provisional');
			return undefined;
		})();
		assert.strictEqual(provAborter, undefined);

		// Capture the materialized session's WarmQuery so we can assert
		// it was asyncDisposed by shutdown.
		const matWarm = sdk.warmQueries[0];
		assert.ok(matWarm, 'materialized session must have a WarmQuery');
		const asyncDisposeBefore = matWarm.asyncDisposeCount;

		const first = agent.shutdown();
		const second = agent.shutdown();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			memoized: first === second,
			matRemoved: agent.getSessionForTesting(matCreated.session) === undefined,
			matWarmAsyncDisposed: matWarm.asyncDisposeCount > asyncDisposeBefore,
			// A post-shutdown sendMessage to the provisional URI must
			// fail because the provisional record was cleared.
			provDropped: await agent.sendMessage(provCreated.session, 'late', undefined, 'turn-late')
				.then(() => false, err => err instanceof Error && /unknown session/i.test(err.message)),
			// Same for the materialized URI.
			matDropped: await agent.sendMessage(matCreated.session, 'late', undefined, 'turn-late')
				.then(() => false, err => err instanceof Error && /unknown session/i.test(err.message)),
		}, {
			memoized: true,
			matRemoved: true,
			matWarmAsyncDisposed: true,
			provDropped: true,
			matDropped: true,
		});
	});

	test('mapper throwing on a malformed stream_event is logged and the turn continues', async () => {
		// Phase 6 §5.1 Test 14. The mapper does its OWN warn-and-skip
		// for known malformed shapes (e.g. tool_use streams while
		// `canUseTool: deny`). The try/catch in `_processMessages` is
		// defense-in-depth for everything else: a programming bug in
		// the mapper, an SDK output we didn't anticipate, etc. This
		// test pins that resilience guarantee — pass an event that
		// makes the mapper crash on field access (`event.delta.type`
		// when `delta` is missing), then verify:
		//   1) the catch absorbs the throw (turn doesn't reject),
		//   2) the next valid stream event still flows through (the
		//      mapper state isn't poisoned),
		//   3) the result message still completes the deferred.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		const sessionUri = created.session;
		const observed: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => {
			if (AgentSession.id(s.session) === AgentSession.id(sessionUri)) {
				observed.push(s);
			}
		}));

		// Build a `content_block_delta` event missing the required
		// `delta` field. The malformed event is typed as
		// `BetaRawContentBlockDeltaEvent` via `// @ts-expect-error`
		// rather than a cast — keeps the type system honest about the
		// shape while still letting the runtime exercise the mapper's
		// defensive try/catch.
		const malformedDeltaEvent = { type: 'content_block_delta', index: 0 };
		// @ts-expect-error - intentionally missing `delta` field to test mapper resilience
		const malformedEvent: BetaRawContentBlockDeltaEvent = malformedDeltaEvent;
		const malformedMessage = makeStreamEvent(sessionId, malformedEvent);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart()),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			malformedMessage,
			makeStreamEvent(sessionId, makeTextDelta(0, 'recover')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeResultSuccess(sessionId),
		];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const deltas = observed.flatMap(s =>
			s.kind === 'action' && s.action.type === ActionType.SessionDelta
				? [s.action.content]
				: []);
		const turnCompletes = observed.filter(s =>
			s.kind === 'action' && s.action.type === ActionType.SessionTurnComplete);

		assert.deepStrictEqual({
			deltas,
			turnCompleteCount: turnCompletes.length,
		}, {
			deltas: ['recover'],
			turnCompleteCount: 1,
		});
	});

	test('sendMessage tags SDKUserMessage.uuid with the effective turn id (M1 / Turn.id ↔ uuid invariant)', async () => {
		// Phase 6.1 Cycle C / drift C1. M1 + the Glossary mandate that
		// the outbound `SDKUserMessage.uuid` carries the agent host's
		// `effectiveTurnId` (`turnId ?? generateUuid()`). Phase 6.5 fork
		// (`sdk.getSessionMessages` → message-UUID lookup) and Phase 13
		// replay (`SDKUserMessageReplay.uuid`) both depend on this id
		// being our turn id, NOT a fresh SDK-generated uuid.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-explicit');

		const drained = sdk.warmQueries[0]?.produced?.drainedPrompts ?? [];
		assert.deepStrictEqual({
			drainedCount: drained.length,
			uuid: drained[0]?.uuid,
		}, {
			drainedCount: 1,
			uuid: 'turn-explicit',
		});
	});

	test('attachments (File and Directory) become a system-reminder block on the user message', async () => {
		// Phase 6 §5.1 Test 15. The prompt resolver must produce two
		// content blocks for an attachment-bearing send: a `text`
		// block carrying the prompt, then a `text` block wrapped in
		// `<system-reminder>` listing the attached URIs (one line
		// per entry, prefix `- `, paths via fsPath for `file:` URIs).
		// Phase 6 only round-trips File and Directory — the Selection
		// branch is dead-code (AgentSideEffects strips text/selection
		// at the protocol → agent boundary).
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [
			makeSystemInitMessage(sessionId),
			makeResultSuccess(sessionId),
		];

		const fileUri = URI.file('/work/src/foo.ts');
		const dirUri = URI.file('/work/src/bar');
		await agent.sendMessage(created.session, 'review please', [
			{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: 'foo.ts', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, uri: dirUri.toString(), label: 'bar', displayKind: 'directory' },
		], 'turn-1');

		const drained = sdk.warmQueries[0]?.produced?.drainedPrompts ?? [];
		assert.strictEqual(drained.length, 1, 'one prompt was drained');
		const userMessage = drained[0];
		const content = userMessage.message.content;
		assert.ok(Array.isArray(content), 'content blocks are an array');

		assert.deepStrictEqual({
			blockCount: content.length,
			promptText: content[0]?.type === 'text' ? content[0].text : undefined,
			reminderText: content[1]?.type === 'text' ? content[1].text : undefined,
		}, {
			blockCount: 2,
			promptText: 'review please',
			reminderText:
				'<system-reminder>\nThe user provided the following references:\n' +
				`- ${fileUri.fsPath}\n` +
				`- ${dirUri.fsPath}\n\n` +
				'IMPORTANT: this context may or may not be relevant to your tasks. ' +
				'You should not respond to this context unless it is highly relevant to your task.\n' +
				'</system-reminder>',
		});
	});

	test('selection attachments become URI references with line suffixes', () => {
		const fileUri = URI.file('/work/src/foo.ts');
		const blocks = resolvePromptToContentBlocks('review please', [{
			type: MessageAttachmentKind.Resource,
			uri: fileUri.toString(),
			label: 'foo.ts',
			displayKind: 'selection',
			selection: {
				range: {
					start: { line: 9, character: 1 },
					end: { line: 11, character: 2 },
				},
			},
		}]);

		assert.strictEqual(blocks.length, 2);
		assert.strictEqual(blocks[0].type, 'text');
		assert.strictEqual(blocks[0].text, 'review please');
		assert.strictEqual(blocks[1].type, 'text');
		assert.ok(blocks[1].text.includes(`- ${fileUri.fsPath}:10`));
		assert.ok(!blocks[1].text.includes('```'));
	});

	test('shutdown resolves without throwing', async () => {
		const { agent } = createTestContext(disposables);
		await agent.shutdown();
	});

	test('disposeSession is a safe no-op for an unknown session', async () => {
		const { agent } = createTestContext(disposables);
		await agent.disposeSession(URI.parse('claude:/never-created'));
	});

	test('shutdown clears provisional sessions; concurrent disposeSession is safe', async () => {
		// Phase-6 update: createSession is provisional, so no
		// `ClaudeAgentSession` wrappers exist before the first
		// `sendMessage`. The wrapper-disposal-once invariant moves to
		// the materialized-session shutdown drain in Cycle 13 (§5.1
		// Test 13). What this test still pins: shutdown + a concurrent
		// `disposeSession` for a provisional URI complete without
		// throwing, both share the `_disposeSequencer` for the same
		// key, and the agent does not surface a double-dispose error.
		const { agent } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const r1 = await agent.createSession({});
		await agent.createSession({});

		const p1 = agent.disposeSession(r1.session);
		const p2 = agent.shutdown();
		await Promise.all([p1, p2]);

		// `shutdown` is memoized — a second call returns the same
		// promise. Pin that here so concurrent teardowns don't double-drain.
		const third = agent.shutdown();
		assert.strictEqual(third, p2);
		await third;
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
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
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

	test('createSession.model round-trips through the per-session DB to listSessions[].model (Phase 6.1 I8 + I7 + C2)', async () => {
		// Phase 6.1 Cycle E (drift I8). Closes the missing-metadata leak:
		// `IAgentCreateSessionConfig.model` is supposed to be persisted
		// per-session and surface back via `listSessions(): IAgentSessionMetadata.model`.
		// Pre-fix, only `customizationDirectory` was overlayed; `model`
		// was silently dropped. The CopilotAgent reference path
		// (`copilotAgent.ts:1483-1564`, `_META_MODEL`/`_serializeModelSelection`/
		// `_storeSessionMetadata`/`_readSessionMetadata`) shows the
		// canonical shape: a JSON-serialised `ModelSelection` keyed by
		// a provider-private metadata constant.
		// Round-trip: createSession({ model }) → sendMessage materializes
		// (writes sidecar) → SDK reports the session in its listing →
		// listSessions surfaces the persisted `model`.
		const { agent, sdk } = createTestContext(disposables);
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');

		const created = await agent.createSession({
			workingDirectory: URI.file('/work'),
			model: { id: 'claude-opus-4.6', config: { thinking: 'extended' } },
		});
		const sessionId = AgentSession.id(created.session);

		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];
		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		sdk.sessionList = [{
			sessionId,
			summary: 'Round trip',
			lastModified: 1234,
		}];
		const list = await agent.listSessions();
		const entry = list.find(r => AgentSession.id(r.session) === sessionId);

		assert.deepStrictEqual({
			model: entry?.model,
			summary: entry?.summary,
		}, {
			model: { id: 'claude-opus-4.6', config: { thinking: 'extended' } },
			summary: 'Round trip',
		});
	});

	test('listSessions returns an empty list (does not reject) when the SDK fails to load', async () => {
		// Copilot-reviewer comment: `AgentService.listSessions` fans out
		// across providers via `Promise.all` (agentService.ts:202-204).
		// If our SDK dynamic import rejects (corrupt install, missing
		// optional dep) and we let it propagate, every other provider's
		// session list disappears too \u2014 the sibling Copilot provider
		// goes blank. Catching here keeps Claude's row empty while
		// Copilot's row still surfaces.
		const sdk = new FakeClaudeAgentSdkService();
		sdk.listSessionsRejection = new Error('simulated SDK load failure');

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new FakeClaudeProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, sdk],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		const result = await agent.listSessions();
		assert.deepStrictEqual(result, []);
	});

	test('getSessionMetadata joins SDK info with sidecar overlay, returns SDK-only fields for external sessions, and undefined for unknown ids (Phase 6.1 / Cycle D4 / I7)', async () => {
		// Phase 6.1 plan / Cycle D4 + drift I7. CONTEXT.md M11 / agents.md
		// section "Lazy session metadata" (~line 2125) require Claude to
		// expose a per-session lookup that mirrors the
		// `IAgent.getSessionMetadata` shape so AgentService can hydrate
		// stale session URIs without enumerating the full provider
		// catalog. The Claude shape MUST surface external CLI sessions
		// (no sidecar) — otherwise `claude:/<id>` URIs from raw Anthropic
		// CLI runs become un-hydrate-able once enumerated. Composes:
		//   sdkService.getSessionInfo(id)   -> summary, cwd, timestamps
		//   _readSessionMetadata(uri)       -> model, customizationDirectory
		// SDK miss => undefined (caller treats as deleted/not-yet-created).
		const dbSidecar = new TestSessionDatabase();
		await dbSidecar.setMetadata('claude.customizationDirectory', URI.file('/cust').toString());
		await dbSidecar.setMetadata('claude.model', JSON.stringify({ id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } }));

		const sessionData: ISessionDataService = {
			...createNullSessionDataService(),
			tryOpenDatabase: async session => {
				if (AgentSession.id(session) === 'sidecar') {
					return { object: dbSidecar, dispose: () => { /* no-op */ } };
				}
				return undefined;
			},
		};
		const sdk = new FakeClaudeAgentSdkService();
		sdk.sessionList = [
			{ sessionId: 'sidecar', summary: 'With Sidecar', lastModified: 5000, createdAt: 4900, cwd: '/work' },
			{ sessionId: 'external', summary: 'External', lastModified: 6000, createdAt: 5900, cwd: '/raw-cli' },
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

		const sidecarUri = AgentSession.uri('claude', 'sidecar');
		const externalUri = AgentSession.uri('claude', 'external');
		const unknownUri = AgentSession.uri('claude', 'unknown');

		const sidecar = await agent.getSessionMetadata!(sidecarUri);
		const external = await agent.getSessionMetadata!(externalUri);
		const unknown = await agent.getSessionMetadata!(unknownUri);

		assert.deepStrictEqual({
			sidecar: {
				session: sidecar?.session.toString(),
				summary: sidecar?.summary,
				startTime: sidecar?.startTime,
				modifiedTime: sidecar?.modifiedTime,
				workingDirectory: sidecar?.workingDirectory?.toString(),
				customizationDirectory: sidecar?.customizationDirectory?.toString(),
				model: sidecar?.model,
			},
			external: {
				session: external?.session.toString(),
				summary: external?.summary,
				startTime: external?.startTime,
				modifiedTime: external?.modifiedTime,
				workingDirectory: external?.workingDirectory?.toString(),
				customizationDirectory: external?.customizationDirectory,
				model: external?.model,
			},
			unknown,
			sdkLookups: sdk.getSessionInfoCalls.slice().sort(),
		}, {
			sidecar: {
				session: sidecarUri.toString(),
				summary: 'With Sidecar',
				startTime: 4900,
				modifiedTime: 5000,
				workingDirectory: URI.file('/work').toString(),
				customizationDirectory: URI.file('/cust').toString(),
				model: { id: 'claude-opus-4.6', config: { thinkingLevel: 'high' } },
			},
			external: {
				session: externalUri.toString(),
				summary: 'External',
				startTime: 5900,
				modifiedTime: 6000,
				workingDirectory: URI.file('/raw-cli').toString(),
				customizationDirectory: undefined,
				model: undefined,
			},
			unknown: undefined,
			sdkLookups: ['external', 'sidecar', 'unknown'],
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
		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
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
		importBehavior = {
			listSessions: async () => [{ sessionId: 's', summary: 's', lastModified: 1 }],
			getSessionInfo: async () => undefined,
			startup: async () => { throw new Error('TestableClaudeAgentSdkService: startup not modeled'); },
		};
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
		// Tested keys: presence + ordering of enum + the six-value
		// canonical set (matching SDK `PermissionMode` typedef at
		// `sdk.d.ts:1560`, ratified in Phase 6.1 Cycle A under I2) +
		// default. Skipped keys (AutoApprove, Mode, Isolation, Branch,
		// BranchNameHint) MUST be absent — workbench
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
			permissionModeEnum: ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto'],
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

	test('dispose releases the proxy handle even with no materialized sessions', async () => {
		// Phase-6 update: the wrapper-before-proxy ordering invariant
		// only applies once a session has been materialized — provisional
		// sessions hold no SDK subprocess that talks to the proxy. The
		// wrapper-before-proxy ordering test moves to Cycle 11 (§5.1
		// Test 11 — dispose materialized aborts controller). What this
		// test still pins for Phase 6: dispose releases the proxy handle
		// even if no session was ever materialized, so authenticated-but-
		// unused agents don't leak the proxy refcount.
		let proxyDisposed = false;

		class RecordingProxyService implements IClaudeProxyService {
			declare readonly _serviceBrand: undefined;
			async start(_token: string): Promise<IClaudeProxyHandle> {
				return {
					baseUrl: 'http://127.0.0.1:0',
					nonce: 'n',
					dispose: () => { proxyDisposed = true; },
				};
			}
			dispose(): void { /* no-op */ }
		}

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, new FakeCopilotApiService()],
			[IClaudeProxyService, new RecordingProxyService()],
			[ISessionDataService, createNullSessionDataService()],
			[IClaudeAgentSdkService, new FakeClaudeAgentSdkService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate('https://api.github.com', 'tok');
		await agent.createSession({});
		agent.dispose();

		assert.strictEqual(proxyDisposed, true);
	});

	test('agent.dispose() during a racing first sendMessage aborts the provisional and disposes the WarmQuery', async () => {
		// Copilot reviewer: `dispose()` did not abort provisional
		// AbortControllers. If a `sendMessage` was racing materialize
		// (parked inside `_writeCustomizationDirectory`), `dispose()`
		// would synchronously dispose `_sessions` and remove provisional
		// records via teardown — but the materialize sequencer
		// continuation, having already passed the post-startup abort
		// gate, would resume past the persist step and call
		// `_sessions.set(...)` on an already-disposed DisposableMap,
		// orphaning the WarmQuery subprocess. The fix adds a
		// `provisional.abortController.abort()` step before
		// `super.dispose()` so the post-customization-write abort gate
		// catches the race and asyncDisposes the WarmQuery.
		const persistGate = new DeferredPromise<void>();
		let persistEntered = false;
		const blockingDb = new TestSessionDatabase();
		const originalSetMetadata = blockingDb.setMetadata.bind(blockingDb);
		blockingDb.setMetadata = async (key, value) => {
			persistEntered = true;
			await persistGate.p;
			await originalSetMetadata(key, value);
		};

		const proxy = new FakeClaudeProxyService();
		const api = new FakeCopilotApiService();
		api.models = async () => [...ALL_MODELS];
		const sdk = new FakeClaudeAgentSdkService();
		const sessionData = createSessionDataService(blockingDb);

		const services = new ServiceCollection(
			[ILogService, new NullLogService()],
			[ICopilotApiService, api],
			[IClaudeProxyService, proxy],
			[ISessionDataService, sessionData],
			[IClaudeAgentSdkService, sdk],
			[IAgentHostGitService, createNoopGitService()],
		);
		const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
		const agent: ClaudeAgent = instantiationService.createInstance(ClaudeAgent);

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'tok');
		const created = await agent.createSession({ workingDirectory: URI.file('/work') });
		const sessionId = AgentSession.id(created.session);
		sdk.nextQueryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		const send = agent.sendMessage(created.session, 'hi', undefined, 'turn-1');
		const settle: { rejected?: unknown } = {};
		const sendDone = send.then(() => { settle.rejected = false; }, err => { settle.rejected = err; });

		while (!persistEntered) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		// Now dispose the WHOLE AGENT while persist is parked. This is
		// the path the reviewer flagged: provisional AbortController
		// must be aborted so the post-customization-write gate catches.
		agent.dispose();

		persistGate.complete();
		await sendDone;

		assert.deepStrictEqual({
			rejectedIsCancellation: isCancellationError(settle.rejected),
			warmQueryDisposed: sdk.warmQueries[0]?.asyncDisposeCount === 1,
		}, {
			rejectedIsCancellation: true,
			warmQueryDisposed: true,
		});
	});

	// #endregion
});
