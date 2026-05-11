/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration test for Phase 6 ClaudeAgent.
 *
 * Wires together:
 *  - Real {@link ClaudeProxyService} bound to a real loopback HTTP listener.
 *  - Stubbed {@link ICopilotApiService} that yields a canned Anthropic
 *    `MessageStreamEvent` sequence.
 *  - Real {@link ClaudeAgent} driving the materialize lifecycle.
 *  - Recording {@link IClaudeAgentSdkService} that, on `startup()`,
 *    performs a real HTTP round-trip against the proxy using the
 *    `Options.settings.env.ANTHROPIC_BASE_URL` /
 *    `Options.settings.env.ANTHROPIC_AUTH_TOKEN` it received — exactly
 *    what the real Claude SDK subprocess would do when forked.
 *
 * The test does NOT fork the bundled `@anthropic-ai/claude-agent-sdk`
 * subprocess. That fork is exercised live by the Phase 6 smoke run
 * (`smoke.md`). What this test guarantees in CI is the cross-component
 * wiring that connects the two:
 *  - The agent constructs `Bearer <nonce>.<sessionId>` in a format the
 *    real proxy's auth parser accepts.
 *  - The agent passes the proxy's actual `baseUrl` through
 *    `Options.settings.env`.
 *  - The proxy's SSE encoding round-trips the canned upstream stream.
 *  - The agent's strip-env contract on `Options.env`
 *    (`NODE_OPTIONS===undefined`, `ELECTRON_RUN_AS_NODE==='1'`) is
 *    captured by what the SDK service receives.
 *  - Disposing the agent disposes the proxy handle and the WarmQuery
 *    (no orphan resources).
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { Options, PermissionResult, Query, SDKMessage, SDKResultSuccess, SDKSessionInfo, SDKSystemMessage, SDKUserMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import type * as http from 'http';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { type AgentSignal, GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolResultContentType } from '../../common/state/sessionState.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { ClaudeAgent } from '../../node/claude/claudeAgent.js';
import { IClaudeAgentSdkService } from '../../node/claude/claudeAgentSdkService.js';
import { ClaudeProxyService, IClaudeProxyService } from '../../node/claude/claudeProxyService.js';
import { ICopilotApiService, type ICopilotApiServiceRequestOptions } from '../../node/shared/copilotApiService.js';
import { createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import {
	makeContentBlockStartText,
	makeContentBlockStartToolUse,
	makeContentBlockStop,
	makeInputJsonDelta,
	makeMessageStart,
	makeMessageStop,
	makeStreamEvent,
	makeTextDelta,
	makeUserToolResultMessage,
} from './claudeMapSessionEventsTestUtils.js';

// #region Test fixtures

const ANTHROPIC_MODEL: CCAModel = {
	id: 'claude-opus-4.6',
	name: 'Claude Opus 4.6',
	vendor: 'Anthropic',
	supported_endpoints: ['/v1/messages'],
	object: 'model',
	version: '4.6',
	is_chat_default: false,
	is_chat_fallback: false,
	model_picker_category: '',
	model_picker_enabled: true,
	preview: false,
	billing: { is_premium: false, multiplier: 1, restricted_to: [] },
	capabilities: {
		family: 'test',
		limits: { max_context_window_tokens: 200_000, max_output_tokens: 8192, max_prompt_tokens: 200_000 },
		object: 'model_capabilities',
		supports: { parallel_tool_calls: true, streaming: true, tool_calls: true, vision: false },
		tokenizer: 'o200k_base',
		type: 'chat',
	},
	policy: { state: 'enabled', terms: '' },
};

const TEST_UUID = '11111111-2222-3333-4444-555555555555';

function makeMessage(model: string): Anthropic.Message {
	return {
		id: 'msg_int_test',
		type: 'message',
		role: 'assistant',
		model,
		content: [{ type: 'text', text: '', citations: null }],
		stop_reason: 'end_turn',
		stop_sequence: null,
		stop_details: null,
		container: null,
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			cache_creation: null,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			inference_geo: null,
			server_tool_use: null,
			service_tier: null,
		},
	};
}

/** Canned Anthropic `MessageStreamEvent` sequence for the `messages` stub. */
function makeCannedStream(model: string): Anthropic.MessageStreamEvent[] {
	const message = makeMessage(model);
	const contentBlockStart: Anthropic.RawContentBlockStartEvent = {
		type: 'content_block_start',
		index: 0,
		content_block: { type: 'text', text: '', citations: [] },
	};
	const contentBlockDelta: Anthropic.RawContentBlockDeltaEvent = {
		type: 'content_block_delta',
		index: 0,
		delta: { type: 'text_delta', text: 'hello' },
	};
	const messageDelta: Anthropic.RawMessageDeltaEvent = {
		type: 'message_delta',
		delta: { stop_reason: 'end_turn', stop_sequence: null, stop_details: null, container: null },
		usage: {
			input_tokens: 1,
			output_tokens: 1,
			cache_creation_input_tokens: null,
			cache_read_input_tokens: null,
			server_tool_use: null,
		},
	};
	return [
		{ type: 'message_start', message },
		contentBlockStart,
		contentBlockDelta,
		{ type: 'content_block_stop', index: 0 },
		messageDelta,
		{ type: 'message_stop' },
	];
}

function makeSystemInitMessage(sessionId: string): SDKSystemMessage {
	return {
		type: 'system',
		subtype: 'init',
		apiKeySource: 'user',
		claude_code_version: '0.0.0-test',
		cwd: '/workspace',
		tools: [],
		mcp_servers: [],
		model: 'claude-test',
		permissionMode: 'default',
		slash_commands: [],
		output_style: 'default',
		skills: [],
		plugins: [],
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}

function makeResultSuccess(sessionId: string): SDKResultSuccess {
	return {
		type: 'result',
		subtype: 'success',
		duration_ms: 0,
		duration_api_ms: 0,
		is_error: false,
		num_turns: 1,
		result: '',
		stop_reason: 'end_turn',
		total_cost_usd: 0,
		usage: {
			cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			inference_geo: 'unknown',
			input_tokens: 0,
			iterations: [],
			output_tokens: 0,
			server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 },
			service_tier: 'standard',
			speed: 'standard',
		},
		modelUsage: {},
		permission_denials: [],
		uuid: TEST_UUID,
		session_id: sessionId,
	};
}

// #endregion

// #region Stubbed CAPI

class StubCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	streamEvents: Anthropic.MessageStreamEvent[] = [];
	availableModels: CCAModel[] = [ANTHROPIC_MODEL];

	readonly messagesCallCount = { count: 0 };

	messages(
		token: string,
		request: Anthropic.MessageCreateParamsStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(
		token: string,
		request: Anthropic.MessageCreateParamsNonStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message>;
	messages(
		token: string,
		request: Anthropic.MessageCreateParams,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		this.messagesCallCount.count++;
		if (request.stream) {
			return this._stream(options);
		}
		return Promise.reject(new Error('non-streaming not used in integration test'));
	}

	private async *_stream(
		options: ICopilotApiServiceRequestOptions | undefined,
	): AsyncGenerator<Anthropic.MessageStreamEvent> {
		for (const ev of this.streamEvents) {
			if (options?.signal?.aborted) {
				const err = new Error('Aborted');
				(err as { name: string }).name = 'AbortError';
				throw err;
			}
			yield ev;
		}
	}

	async countTokens(): Promise<Anthropic.MessageTokensCount> {
		throw new Error('countTokens not used in integration test');
	}

	async models(): Promise<CCAModel[]> {
		return this.availableModels;
	}
}

// #endregion

// #region Recording SDK service that round-trips through the real proxy

interface IProxyRoundTripResult {
	readonly status: number;
	readonly contentType: string | undefined;
	readonly events: readonly { readonly type: string; readonly data: unknown }[];
}

/**
 * Marker entry the test can interleave inside
 * {@link ProxyRoundTripSdkService.queryMessages} between SDK messages.
 * When {@link RoundTripQuery.next} encounters a marker, it invokes the
 * captured {@link Options.canUseTool} closure and waits for it to
 * resolve before proceeding to the next entry, mirroring the real SDK
 * subprocess's behaviour around an assistant `tool_use` → synthetic
 * user `tool_result` round-trip.
 */
interface CanUseToolMarker {
	readonly kind: 'canUseTool';
	readonly toolName: string;
	readonly input: Record<string, unknown>;
	readonly toolUseID: string;
}

type QueryStreamItem = SDKMessage | CanUseToolMarker;

function isCanUseToolMarker(item: QueryStreamItem): item is CanUseToolMarker {
	return (item as CanUseToolMarker).kind === 'canUseTool';
}

/**
 * Test double for {@link IClaudeAgentSdkService}. On `startup()`, performs
 * a real HTTP `POST /v1/messages` against the proxy URL the agent passed
 * via `Options.settings.env`, using the bearer the agent constructed.
 * This stands in for the SDK subprocess's first model call so we can
 * assert the agent → proxy → CAPI round-trip works without forking
 * `@anthropic-ai/claude-agent-sdk`'s bundled CLI.
 */
class ProxyRoundTripSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	readonly capturedStartupOptions: Options[] = [];
	readonly proxyRoundTrips: IProxyRoundTripResult[] = [];

	/**
	 * Items the produced WarmQuery's Query will yield in order. SDK
	 * messages flow through unchanged; {@link CanUseToolMarker} entries
	 * pause the iterator and invoke the captured
	 * `Options.canUseTool` closure (mirroring what the real SDK
	 * subprocess does between assistant `tool_use` and the synthetic
	 * `user` `tool_result` it follows up with).
	 */
	queryMessages: QueryStreamItem[] = [];

	/** Records the {@link PermissionResult} returned by each `canUseTool` invocation in {@link queryMessages} order. */
	readonly canUseToolResults: PermissionResult[] = [];

	readonly warmQueries: RoundTripWarmQuery[] = [];

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		return [];
	}

	async getSessionInfo(_sessionId: string): Promise<SDKSessionInfo | undefined> {
		return undefined;
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		this.capturedStartupOptions.push(params.options);

		const settings = params.options.settings;
		const settingsEnv = (settings && typeof settings === 'object' && settings.env) ? settings.env : {};
		const baseUrl = settingsEnv['ANTHROPIC_BASE_URL'];
		const bearer = settingsEnv['ANTHROPIC_AUTH_TOKEN'];
		if (!baseUrl || !bearer) {
			throw new Error('ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN missing from settings.env');
		}

		const result = await postSseToProxy(`${baseUrl}/v1/messages`, bearer, {
			model: 'claude-opus-4-6',
			messages: [{ role: 'user', content: 'hi' }],
			stream: true,
			max_tokens: 4096,
		});
		this.proxyRoundTrips.push(result);

		const warm = new RoundTripWarmQuery(this);
		this.warmQueries.push(warm);
		return warm;
	}
}

class RoundTripWarmQuery implements WarmQuery {
	asyncDisposeCount = 0;
	closeCount = 0;

	constructor(private readonly _sdk: ProxyRoundTripSdkService) { }

	query(prompt: string | AsyncIterable<SDKUserMessage>): Query {
		if (typeof prompt === 'string') {
			throw new Error('integration test: agent host always passes an AsyncIterable');
		}
		return new RoundTripQuery(prompt, this._sdk);
	}

	close(): void {
		this.closeCount++;
	}

	async [Symbol.asyncDispose](): Promise<void> {
		this.asyncDisposeCount++;
	}
}

class RoundTripQuery implements AsyncGenerator<SDKMessage, void> {
	private _index = 0;
	private readonly _drainer: Promise<void>;

	constructor(prompt: AsyncIterable<SDKUserMessage>, private readonly _sdk: ProxyRoundTripSdkService) {
		// Drain the prompt iterable in the background so the agent's
		// `_pendingPromptDeferred.complete()` actually pumps the queue.
		const it = prompt[Symbol.asyncIterator]();
		this._drainer = (async () => {
			while (true) {
				const r = await it.next();
				if (r.done) {
					return;
				}
			}
		})();
	}

	[Symbol.asyncIterator](): AsyncGenerator<SDKMessage, void> {
		return this;
	}

	async next(): Promise<IteratorResult<SDKMessage, void>> {
		while (this._index < this._sdk.queryMessages.length) {
			const item = this._sdk.queryMessages[this._index++];
			if (isCanUseToolMarker(item)) {
				const startup = this._sdk.capturedStartupOptions[0];
				if (!startup?.canUseTool) {
					throw new Error('integration test: canUseTool marker but Options.canUseTool not wired');
				}
				const result = await startup.canUseTool(item.toolName, item.input, {
					signal: new AbortController().signal,
					toolUseID: item.toolUseID,
				});
				this._sdk.canUseToolResults.push(result);
				continue;
			}
			return { done: false, value: item };
		}
		await this._drainer;
		return { done: true, value: undefined };
	}

	async return(): Promise<IteratorResult<SDKMessage, void>> {
		return { done: true, value: undefined };
	}

	async throw(err: unknown): Promise<IteratorResult<SDKMessage, void>> {
		throw err;
	}

	async interrupt(): Promise<void> { /* not used */ }

	setPermissionMode(): never { throw new Error('not modeled'); }
	setModel(): never { throw new Error('not modeled'); }
	setMaxThinkingTokens(): never { throw new Error('not modeled'); }
	applyFlagSettings(): never { throw new Error('not modeled'); }
	initializationResult(): never { throw new Error('not modeled'); }
	supportedCommands(): never { throw new Error('not modeled'); }
	supportedModels(): never { throw new Error('not modeled'); }
	supportedAgents(): never { throw new Error('not modeled'); }
	mcpServerStatus(): never { throw new Error('not modeled'); }
	getContextUsage(): never { throw new Error('not modeled'); }
	reloadPlugins(): never { throw new Error('not modeled'); }
	accountInfo(): never { throw new Error('not modeled'); }
	rewindFiles(): never { throw new Error('not modeled'); }
	readFile(): never { throw new Error('not modeled'); }
	seedReadState(): never { throw new Error('not modeled'); }
	reconnectMcpServer(): never { throw new Error('not modeled'); }
	toggleMcpServer(): never { throw new Error('not modeled'); }
	setMcpServers(): never { throw new Error('not modeled'); }
	streamInput(): never { throw new Error('not modeled'); }
	stopTask(): never { throw new Error('not modeled'); }
	close(): void { /* no-op */ }
	[Symbol.asyncDispose](): Promise<void> { return Promise.resolve(); }
}

// #endregion

// #region HTTP helpers

let _httpModule: typeof http | undefined;
async function getHttp(): Promise<typeof http> {
	if (!_httpModule) {
		_httpModule = await import('http');
	}
	return _httpModule;
}

async function postSseToProxy(
	url: string,
	bearer: string,
	payload: object,
): Promise<IProxyRoundTripResult> {
	const httpMod = await getHttp();
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const body = JSON.stringify(payload);
		const req = httpMod.request({
			hostname: u.hostname,
			port: u.port,
			path: u.pathname + u.search,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${bearer}`,
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body).toString(),
				'Accept': 'text/event-stream',
				'anthropic-version': '2023-06-01',
			},
		}, res => {
			const chunks: Buffer[] = [];
			res.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf8');
				resolve({
					status: res.statusCode ?? 0,
					contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : undefined,
					events: parseSseFrames(raw),
				});
			});
			res.on('error', reject);
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function parseSseFrames(raw: string): { type: string; data: unknown }[] {
	const out: { type: string; data: unknown }[] = [];
	for (const block of raw.split('\n\n')) {
		if (!block.trim()) {
			continue;
		}
		let event = '';
		let data = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('event: ')) {
				event = line.slice('event: '.length).trim();
			} else if (line.startsWith('data: ')) {
				data = line.slice('data: '.length);
			}
		}
		if (event && data) {
			let parsed: unknown;
			try { parsed = JSON.parse(data); } catch { parsed = data; }
			out.push({ type: event, data: parsed });
		}
	}
	return out;
}

// #endregion

// #region Suite

suite('ClaudeAgent integration (proxy-backed)', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('agent → proxy → CAPI → SSE → agent: end-to-end pipeline with real proxy and stubbed CAPI', async () => {
		// This is the Phase 6 §5.2 integration test: real ClaudeProxyService
		// + real ClaudeAgent + stubbed ICopilotApiService + recording SDK
		// service that performs a real HTTP round-trip on the proxy from
		// inside `startup()`. Catches regressions in any of:
		//   - Agent's `Options.settings.env` wiring (BASE_URL / AUTH_TOKEN).
		//   - Proxy's `Bearer <nonce>.<sessionId>` parser.
		//   - Proxy's model-id rewrite (SDK ↔ endpoint format).
		//   - Proxy's SSE frame encoding.
		//   - Agent's `Options.env` strip contract.
		const capi = new StubCopilotApiService();
		capi.streamEvents = makeCannedStream('claude-opus-4.6');

		const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
		const sdk = new ProxyRoundTripSdkService();
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const services = new ServiceCollection(
			[ILogService, logService],
			[ICopilotApiService, capi],
			[IClaudeProxyService, realProxy],
			[ISessionDataService, createSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentConfigurationService, configService],
			[IAgentHostGitService, createNoopGitService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		// Authenticate — boots the proxy and snapshots the model list.
		const accepted = await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'gh-int-test-token');
		assert.strictEqual(accepted, true);

		// Create a provisional session — no SDK contact yet.
		const created = await agent.createSession({ workingDirectory: URI.file('/integration-cwd') });
		assert.strictEqual(sdk.capturedStartupOptions.length, 0, 'createSession does not touch the SDK');

		// Stage a transcript on the SDK so `sendMessage` resolves.
		const sessionId = created.session.path.replace(/^\//, '');
		sdk.queryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		// First send materializes — drives `startup()`, which performs
		// the real HTTP round-trip on the real proxy.
		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		// Snapshot what flowed through the integration in a single
		// assertion so the failure surface is the whole pipeline.
		const startup = sdk.capturedStartupOptions[0];
		const round = sdk.proxyRoundTrips[0];
		const startupSettings = startup.settings;
		const settingsEnv = (startupSettings && typeof startupSettings === 'object' && startupSettings.env) ? startupSettings.env : {};
		assert.deepStrictEqual({
			startupCallCount: sdk.capturedStartupOptions.length,
			roundTripCount: sdk.proxyRoundTrips.length,
			capiCallCount: capi.messagesCallCount.count,
			startupCwd: startup.cwd,
			startupSessionId: startup.sessionId,
			startupExecutable: startup.executable,
			subprocessElectronRunAsNode: startup.env?.['ELECTRON_RUN_AS_NODE'],
			subprocessNodeOptions: startup.env?.['NODE_OPTIONS'],
			subprocessAnthropicApiKey: startup.env?.['ANTHROPIC_API_KEY'],
			settingsBaseUrlIsLoopback: typeof settingsEnv['ANTHROPIC_BASE_URL'] === 'string'
				&& settingsEnv['ANTHROPIC_BASE_URL'].startsWith('http://127.0.0.1:'),
			settingsBearerHasNonceAndSession: typeof settingsEnv['ANTHROPIC_AUTH_TOKEN'] === 'string'
				&& settingsEnv['ANTHROPIC_AUTH_TOKEN'].split('.').length === 2
				&& settingsEnv['ANTHROPIC_AUTH_TOKEN'].endsWith(`.${sessionId}`),
			httpStatus: round.status,
			httpContentType: round.contentType,
			eventTypes: round.events.map(e => e.type),
		}, {
			startupCallCount: 1,
			roundTripCount: 1,
			capiCallCount: 1,
			startupCwd: URI.file('/integration-cwd').fsPath,
			startupSessionId: sessionId,
			startupExecutable: process.execPath,
			subprocessElectronRunAsNode: '1',
			subprocessNodeOptions: undefined,
			subprocessAnthropicApiKey: undefined,
			settingsBaseUrlIsLoopback: true,
			settingsBearerHasNonceAndSession: true,
			httpStatus: 200,
			httpContentType: 'text/event-stream',
			eventTypes: [
				'message_start',
				'content_block_start',
				'content_block_delta',
				'content_block_stop',
				'message_delta',
				'message_stop',
			],
		});

		// Cleanup: dispose the agent and assert the WarmQuery was
		// closed via Symbol.asyncDispose (no orphan subprocess).
		await agent.disposeSession(created.session);
		assert.strictEqual(sdk.warmQueries[0].asyncDisposeCount, 1, 'WarmQuery is asyncDisposed on session dispose');
	});

	test('proxy rejects a request whose bearer carries a wrong nonce (auth contract)', async () => {
		// Companion test that locks the proxy's auth contract from
		// outside the agent. If the agent ever drifts away from
		// `Bearer <nonce>.<sessionId>`, the round-trip in the test
		// above fails — but this test guarantees the proxy itself
		// rejects forged bearers regardless of the agent.
		const capi = new StubCopilotApiService();
		const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
		const handle = await realProxy.start('gh-int-test-token');
		try {
			const result = await postSseToProxy(
				`${handle.baseUrl}/v1/messages`,
				'wrong-nonce.session-x',
				{ model: 'claude-opus-4-6', messages: [], stream: true },
			);
			assert.strictEqual(result.status, 401);
			assert.strictEqual(capi.messagesCallCount.count, 0, 'auth check fires before any upstream call');
		} finally {
			handle.dispose();
		}
	});

	test('Phase 7 §5.3 — canUseTool / onElicitation closures wired through to Options on materialize', async () => {
		// Phase 7 §5.3. The Phase-6 round-trip above exercised the
		// proxy / CAPI / settings-env wiring; this test pins the
		// Phase-7 callback surface — `canUseTool` and `onElicitation`
		// must both be present in the Options the SDK service receives
		// from `_materializeProvisional` and behave per §3.4 / §3.7.
		// We don't need a full SDK message stream with tool_use blocks
		// to validate the wiring — the unit suites in
		// `claudeAgent.test.ts` cover the in-process tool round-trip
		// exhaustively. What this integration adds: the closures
		// survive the materialize → SDK boundary intact when the real
		// proxy is in the loop.
		const capi = new StubCopilotApiService();
		capi.streamEvents = makeCannedStream('claude-opus-4.6');
		const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
		const sdk = new ProxyRoundTripSdkService();
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const services = new ServiceCollection(
			[ILogService, logService],
			[ICopilotApiService, capi],
			[IClaudeProxyService, realProxy],
			[ISessionDataService, createSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentConfigurationService, configService],
			[IAgentHostGitService, createNoopGitService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'gh-int-test-token');
		const created = await agent.createSession({ workingDirectory: URI.file('/integration-cwd') });
		const sessionId = created.session.path.replace(/^\//, '');
		sdk.queryMessages = [makeSystemInitMessage(sessionId), makeResultSuccess(sessionId)];

		await agent.sendMessage(created.session, 'hi', undefined, 'turn-1');

		const startup = sdk.capturedStartupOptions[0];
		assert.ok(typeof startup.canUseTool === 'function', 'canUseTool was wired into Options');
		assert.ok(typeof startup.onElicitation === 'function', 'onElicitation was wired into Options');

		const elicitResult = await startup.onElicitation!(
			{ serverName: 'mcp-test', message: 'pick a side', mode: 'form' },
			{ signal: new AbortController().signal },
		);

		assert.deepStrictEqual({
			elicitResult,
			permissionMode: startup.permissionMode,
		}, {
			elicitResult: { action: 'cancel' },
			permissionMode: 'default',
		});
	});

	test('Phase 7 §5.3 — Read tool round-trip: SDK tool_use → pending_confirmation → respondToPermissionRequest(true) → tool_result → continuation', async () => {
		// §5.3 of the Phase-7 plan: drive a one-tool round-trip end-to-end
		// through a materialized agent backed by the real proxy. Unit
		// tests in `claudeAgent.test.ts` already cover the in-process
		// `_handleCanUseTool` mechanics; what this test pins is the
		// agent → mapper → progress-event ordering when the SDK fixture
		// invokes the captured `Options.canUseTool` mid-stream the same
		// way the real subprocess would.
		const capi = new StubCopilotApiService();
		capi.streamEvents = makeCannedStream('claude-opus-4.6');
		const realProxy = disposables.add(new ClaudeProxyService(new NullLogService(), capi));
		const sdk = new ProxyRoundTripSdkService();
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));

		const services = new ServiceCollection(
			[ILogService, logService],
			[ICopilotApiService, capi],
			[IClaudeProxyService, realProxy],
			[ISessionDataService, createSessionDataService()],
			[IClaudeAgentSdkService, sdk],
			[IAgentConfigurationService, configService],
			[IAgentHostGitService, createNoopGitService()],
		);
		const instantiationService = disposables.add(new InstantiationService(services));
		const agent = disposables.add(instantiationService.createInstance(ClaudeAgent));

		await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'gh-int-test-token');
		const created = await agent.createSession({ workingDirectory: URI.file('/integration-cwd') });
		const sessionId = created.session.path.replace(/^\//, '');

		// Canned turn: assistant says "reading", calls `Read`, the SDK
		// invokes `canUseTool`, then a synthetic user `tool_result`
		// arrives followed by an assistant continuation and `result`.
		const TOOL_USE_ID = 'tu_int_read_1';
		sdk.queryMessages = [
			makeSystemInitMessage(sessionId),
			makeStreamEvent(sessionId, makeMessageStart('msg_int_1')),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'reading')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeContentBlockStartToolUse(1, TOOL_USE_ID, 'Read')),
			makeStreamEvent(sessionId, makeInputJsonDelta(1, '{"file_path":"/tmp/x"}')),
			makeStreamEvent(sessionId, makeContentBlockStop(1)),
			makeStreamEvent(sessionId, makeMessageStop()),
			{ kind: 'canUseTool', toolName: 'Read', input: { file_path: '/tmp/x' }, toolUseID: TOOL_USE_ID },
			makeUserToolResultMessage(sessionId, TOOL_USE_ID, 'file contents'),
			makeStreamEvent(sessionId, makeMessageStart('msg_int_2')),
			makeStreamEvent(sessionId, makeContentBlockStartText(0)),
			makeStreamEvent(sessionId, makeTextDelta(0, 'done')),
			makeStreamEvent(sessionId, makeContentBlockStop(0)),
			makeStreamEvent(sessionId, makeMessageStop()),
			makeResultSuccess(sessionId),
		];

		const signals: AgentSignal[] = [];
		disposables.add(agent.onDidSessionProgress(s => {
			signals.push(s);
			if (s.kind === 'pending_confirmation' && s.state.toolCallId === TOOL_USE_ID) {
				agent.respondToPermissionRequest(TOOL_USE_ID, true);
			}
		}));

		await agent.sendMessage(created.session, 'please read /tmp/x', undefined, 'turn-1');

		// Snapshot the agent-side emission stream as a single shape so
		// the failure surface is the whole pipeline.
		const summary = signals.map(s => {
			if (s.kind === 'pending_confirmation') {
				return {
					kind: s.kind,
					toolCallId: s.state.toolCallId,
					toolName: s.state.toolName,
					permissionKind: s.permissionKind,
					permissionPath: s.permissionPath,
				};
			}
			if (s.kind === 'action') {
				const a = s.action;
				switch (a.type) {
					case ActionType.SessionResponsePart:
						return { kind: 'action', type: a.type, partKind: a.part.kind, content: a.part.kind === ResponsePartKind.Markdown ? a.part.content : undefined };
					case ActionType.SessionDelta:
						return { kind: 'action', type: a.type, content: a.content };
					case ActionType.SessionToolCallStart:
						return { kind: 'action', type: a.type, toolCallId: a.toolCallId, toolName: a.toolName };
					case ActionType.SessionToolCallDelta:
						return { kind: 'action', type: a.type, toolCallId: a.toolCallId, content: a.content };
					case ActionType.SessionToolCallComplete:
						return { kind: 'action', type: a.type, toolCallId: a.toolCallId, success: a.result.success, content: a.result.content };
					case ActionType.SessionUsage:
						return { kind: 'action', type: a.type };
					case ActionType.SessionTurnComplete:
						return { kind: 'action', type: a.type };
					default:
						return { kind: 'action', type: a.type };
				}
			}
			return { kind: s.kind };
		});

		assert.deepStrictEqual({
			summary,
			canUseToolResults: sdk.canUseToolResults,
		}, {
			summary: [
				{ kind: 'action', type: ActionType.SessionResponsePart, partKind: ResponsePartKind.Markdown, content: '' },
				{ kind: 'action', type: ActionType.SessionDelta, content: 'reading' },
				{ kind: 'action', type: ActionType.SessionToolCallStart, toolCallId: TOOL_USE_ID, toolName: 'Read' },
				{ kind: 'action', type: ActionType.SessionToolCallDelta, toolCallId: TOOL_USE_ID, content: '{"file_path":"/tmp/x"}' },
				{ kind: 'pending_confirmation', toolCallId: TOOL_USE_ID, toolName: 'Read', permissionKind: 'read', permissionPath: '/tmp/x' },
				{ kind: 'action', type: ActionType.SessionToolCallComplete, toolCallId: TOOL_USE_ID, success: true, content: [{ type: ToolResultContentType.Text, text: 'file contents' }] },
				{ kind: 'action', type: ActionType.SessionResponsePart, partKind: ResponsePartKind.Markdown, content: '' },
				{ kind: 'action', type: ActionType.SessionDelta, content: 'done' },
				{ kind: 'action', type: ActionType.SessionUsage },
				{ kind: 'action', type: ActionType.SessionTurnComplete },
			],
			canUseToolResults: [
				{ behavior: 'allow', updatedInput: { file_path: '/tmp/x' } },
			],
		});
	});
});

// #endregion
