/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { GetSessionMessagesOptions, GetSubagentMessagesOptions, ListSubagentsOptions, Options, SDKSessionInfo, SessionMessage, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, type Turn } from '../../common/state/protocol/state.js';
import { buildSubagentSessionUri } from '../../common/state/sessionState.js';
import { IClaudeAgentSdkService } from '../../node/claude/claudeAgentSdkService.js';
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry } from '../../node/claude/claudeSubagentRegistry.js';
import {
	extractSpawningPromptFromTranscript,
	fetchParentTurns,
	getSubagentTranscript,
	type ISubagentLookupContext,
	type ISubagentLookupStrategy,
	NativeStrategy,
	PromptMatchStrategy,
	resolveAgentIdViaChain,
	TextSuffixStrategy,
} from '../../node/claude/claudeSubagentResolver.js';

class FakeSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	sessionMessages = new Map<string, readonly SessionMessage[]>();
	subagentIds = new Map<string, readonly string[]>();
	subagentMessages = new Map<string, readonly SessionMessage[]>();

	listSessionsRejection: Error | undefined;
	getSessionMessagesRejection: Error | undefined;
	listSubagentsRejection: Error | undefined;
	getSubagentMessagesRejection: Error | undefined;

	getSessionMessagesCalls: { sessionId: string; options: unknown }[] = [];
	listSubagentsCalls: string[] = [];
	getSubagentMessagesCalls: { sessionId: string; agentId: string }[] = [];

	async listSessions(): Promise<readonly SDKSessionInfo[]> { return []; }
	async getSessionInfo(_id: string): Promise<SDKSessionInfo | undefined> { return undefined; }
	async startup(_p: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> { throw new Error('not used'); }
	async getSessionMessages(sessionId: string, options?: GetSessionMessagesOptions): Promise<readonly SessionMessage[]> {
		this.getSessionMessagesCalls.push({ sessionId, options });
		if (this.getSessionMessagesRejection) { throw this.getSessionMessagesRejection; }
		return this.sessionMessages.get(sessionId) ?? [];
	}
	async listSubagents(sessionId: string, _options?: ListSubagentsOptions): Promise<readonly string[]> {
		this.listSubagentsCalls.push(sessionId);
		if (this.listSubagentsRejection) { throw this.listSubagentsRejection; }
		return this.subagentIds.get(sessionId) ?? [];
	}
	async getSubagentMessages(sessionId: string, agentId: string, _options?: GetSubagentMessagesOptions): Promise<readonly SessionMessage[]> {
		this.getSubagentMessagesCalls.push({ sessionId, agentId });
		if (this.getSubagentMessagesRejection) { throw this.getSubagentMessagesRejection; }
		return this.subagentMessages.get(`${sessionId}::${agentId}`) ?? [];
	}
}

function makeAgentToolCallTurn(toolCallId: string, opts: { prompt?: string; suffixText?: string; toolName?: string; status?: ToolCallStatus.Completed }): Turn {
	return {
		id: 'turn-' + toolCallId,
		userMessage: { text: '' },
		responseParts: [{
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				toolCallId,
				toolName: opts.toolName ?? 'Task',
				displayName: 'Task',
				status: opts.status ?? ToolCallStatus.Completed,
				confirmed: ToolCallConfirmationReason.NotNeeded,
				invocationMessage: 'invoking task',
				toolInput: opts.prompt !== undefined ? JSON.stringify({ prompt: opts.prompt, description: 'd' }) : undefined,
				success: true,
				pastTenseMessage: 'task done',
				content: opts.suffixText !== undefined ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : undefined,
			},
		}],
		state: 0 as unknown as Turn['state'],
		startedAt: 1,
		endedAt: 2,
		usage: undefined,
	} as Turn;
}

suite('claudeSubagentResolver — SUBAGENT_ID_SUFFIX_REGEX', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches canonical and drifted formats; rejects unrelated text', () => {
		const results = [
			'agentId: abc123 (use SendMessage with to: \'abc123\') ...',
			'agentId:   abc123\n', // multiple spaces
			'  agentId: abc123', // leading whitespace
			'AgentId: ABC123', // mixed case rejected? — regex is case-insensitive
			'noise\nagentId: xyz789 trailing', // multi-line, anchored to line start
			'agentid:abc', // missing space after colon — rejected
			'description: not an agent id',
		].map(input => {
			const m = SUBAGENT_ID_SUFFIX_REGEX.exec(input);
			return m ? m[1] : undefined;
		});
		assert.deepStrictEqual(results, [
			'abc123',
			'abc123',
			'abc123',
			'ABC123',
			'xyz789',
			undefined,
			undefined,
		]);
	});
});

suite('claudeSubagentResolver — TextSuffixStrategy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('hits when parent transcript carries the synthetic suffix; misses otherwise', async () => {
		const sdk = new FakeSdkService();
		const strat = new TextSuffixStrategy(sdk, new NullLogService());
		const parentUri = URI.parse('copilot:/parent-sid');
		const ctx: ISubagentLookupContext = {
			parentUri,
			parentSessionId: 'parent-sid',
			parentTranscript: [
				makeAgentToolCallTurn('toolu_hit', { suffixText: 'whatever\nagentId: a7b3c1d2\n(trailing)' }),
				makeAgentToolCallTurn('toolu_no_suffix', { suffixText: 'just text, no marker' }),
			],
			token: CancellationToken.None,
		};
		assert.deepStrictEqual({
			hit: await strat.lookup('toolu_hit', ctx),
			miss: await strat.lookup('toolu_no_suffix', ctx),
			unknown: await strat.lookup('toolu_unknown', ctx),
		}, { hit: 'a7b3c1d2', miss: undefined, unknown: undefined });
	});
});

suite('claudeSubagentResolver — PromptMatchStrategy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds the agent whose first user message matches the parent Agent.tool_use.input.prompt; rejects malformed input', async () => {
		const sdk = new FakeSdkService();
		const parentUri = URI.parse('copilot:/parent-sid');
		sdk.subagentIds.set('parent-sid', ['agentother', 'agenttarget']);
		sdk.subagentMessages.set('parent-sid::agentother', [{
			type: 'user',
			message: { content: [{ type: 'text', text: 'different prompt' }] },
		} as unknown as SessionMessage]);
		sdk.subagentMessages.set('parent-sid::agenttarget', [{
			type: 'user',
			message: { content: 'do the thing' },
		} as unknown as SessionMessage]);

		const strat = new PromptMatchStrategy(sdk, new NullLogService());
		const ctx: ISubagentLookupContext = {
			parentUri,
			parentSessionId: 'parent-sid',
			parentTranscript: [
				makeAgentToolCallTurn('toolu_target', { prompt: 'do the thing' }),
				makeAgentToolCallTurn('toolu_malformed', { prompt: undefined }), // missing toolInput
			],
			token: CancellationToken.None,
		};

		assert.deepStrictEqual({
			matched: await strat.lookup('toolu_target', ctx),
			malformed: await strat.lookup('toolu_malformed', ctx),
			unknownToolCall: await strat.lookup('toolu_does_not_exist', ctx),
		}, {
			matched: 'agenttarget',
			malformed: undefined,
			unknownToolCall: undefined,
		});
	});
});

suite('claudeSubagentResolver — NativeStrategy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('placeholder returns undefined', async () => {
		const strat = new NativeStrategy();
		assert.strictEqual(await strat.lookup(), undefined);
	});
});

suite('claudeSubagentResolver — scanTranscriptForAgentIds', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts every (toolCallId, agentId) pair in one pass; skips unrelated tools', () => {
		const transcript: readonly Turn[] = [
			makeAgentToolCallTurn('toolu_a', { suffixText: 'agentId: agenta1' }),
			makeAgentToolCallTurn('toolu_b', { suffixText: 'no marker' }),
			makeAgentToolCallTurn('toolu_c', { suffixText: 'agentId: agentc1', toolName: 'Bash' }), // non-subagent tool
			makeAgentToolCallTurn('toolu_d', { suffixText: 'agentId: agentd1', toolName: 'Agent' }),
		];
		const pairs = scanTranscriptForAgentIds(transcript);
		assert.deepStrictEqual([...pairs.entries()].sort(), [
			['toolu_a', 'agenta1'],
			['toolu_d', 'agentd1'],
		]);
	});
});

suite('claudeSubagentResolver — getSubagentTranscript', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cache hit on registry short-circuits SDK fetch; cache miss runs strategy chain and writes resolved agentId back to the registry; subsequent reads hit the cache', async () => {
		const sdk = new FakeSdkService();
		const log = new NullLogService();
		const parentUri = URI.parse('copilot:/parent-sid');
		const registry = disposables.add(new SubagentRegistry());

		// Priming populates the registry with one (toolCallId, agentId) pair via the suffix scan.
		registry.primeFromTranscript([
			makeAgentToolCallTurn('toolu_a', { suffixText: 'agentId: agentprimeda' }),
		]);
		// Live write (canUseTool bridge does this in production).
		registry.recordSpawn('toolu_b', { agentId: 'agentliveb' });

		sdk.subagentMessages.set('parent-sid::agentprimeda', []);
		sdk.subagentMessages.set('parent-sid::agentliveb', []);

		const subagentUriA = URI.parse(buildSubagentSessionUri(parentUri, 'toolu_a'));
		const subagentUriB = URI.parse(buildSubagentSessionUri(parentUri, 'toolu_b'));
		await getSubagentTranscript(subagentUriA, registry, sdk, log, CancellationToken.None);
		await getSubagentTranscript(subagentUriB, registry, sdk, log, CancellationToken.None);

		assert.deepStrictEqual({
			fetchedAgentIds: sdk.getSubagentMessagesCalls.map(c => c.agentId),
			spawnA: registry.getSpawn('toolu_a')?.agentId,
			spawnB: registry.getSpawn('toolu_b')?.agentId,
		}, {
			fetchedAgentIds: ['agentprimeda', 'agentliveb'],
			spawnA: 'agentprimeda',
			spawnB: 'agentliveb',
		});
	});

	test('unresolvable agentId returns [] (no SDK fetch attempted) and SDK fetch failure returns [] with warn-log', async () => {
		const sdk = new FakeSdkService();
		const log = new NullLogService();
		const parentUri = URI.parse('copilot:/parent-sid');
		const registry = disposables.add(new SubagentRegistry());

		// No prime, no spawn record — strategies all return undefined for an unknown id.
		const noResolve = await getSubagentTranscript(
			URI.parse(buildSubagentSessionUri(parentUri, 'toolu_unknown')),
			registry, sdk, log, CancellationToken.None,
		);

		// Cached spawn but SDK rejects — returns [].
		registry.recordSpawn('toolu_known', { agentId: 'agent-x' });
		sdk.getSubagentMessagesRejection = new Error('boom');
		const onError = await getSubagentTranscript(
			URI.parse(buildSubagentSessionUri(parentUri, 'toolu_known')),
			registry, sdk, log, CancellationToken.None,
		);

		assert.deepStrictEqual({
			noResolve,
			onError,
			fetchAttempts: sdk.getSubagentMessagesCalls.map(c => c.agentId),
		}, {
			noResolve: [],
			onError: [],
			fetchAttempts: ['agent-x'], // only the cached-hit attempted
		});
	});
});

suite('claudeSubagentResolver — resolveAgentIdViaChain (free function)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makeStrategy(name: string, returns: string | undefined, onCall?: () => void): ISubagentLookupStrategy {
		return {
			name,
			lookup: async () => {
				onCall?.();
				return returns;
			},
		};
	}

	const ctx = (token = CancellationToken.None): ISubagentLookupContext => ({
		parentUri: URI.parse('copilot:/p'),
		parentSessionId: 'p',
		token,
	});

	function makeDeps(strategies: readonly ISubagentLookupStrategy[]): {
		strategies: readonly ISubagentLookupStrategy[];
		cacheGet: (id: string) => string | undefined;
		cacheSet: (id: string, agentId: string) => void;
		cacheReads: string[];
		cacheWrites: { id: string; agentId: string }[];
		seedCache(id: string, agentId: string): void;
	} {
		const cache = new Map<string, string>();
		const cacheReads: string[] = [];
		const cacheWrites: { id: string; agentId: string }[] = [];
		return {
			strategies,
			cacheReads,
			cacheWrites,
			cacheGet: id => { cacheReads.push(id); return cache.get(id); },
			cacheSet: (id, agentId) => { cacheWrites.push({ id, agentId }); cache.set(id, agentId); },
			seedCache: (id, agentId) => cache.set(id, agentId),
		};
	}

	test('cache hit short-circuits before any strategy runs', async () => {
		const calls: string[] = [];
		const deps = makeDeps([
			makeStrategy('s1', 'should-not-fire', () => calls.push('s1')),
		]);
		deps.seedCache('toolu', 'cached-agent');

		const out = await resolveAgentIdViaChain('toolu', ctx(), deps);

		assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
			out: 'cached-agent',
			calls: [],
			cacheWrites: [],
		});
	});

	test('chain ordering: first non-undefined hit wins, later strategies skipped, cache populated', async () => {
		const calls: string[] = [];
		const deps = makeDeps([
			makeStrategy('s1', undefined, () => calls.push('s1')),
			makeStrategy('s2', 'agent-from-s2', () => calls.push('s2')),
			makeStrategy('s3', 'agent-from-s3', () => calls.push('s3')),
		]);

		const out = await resolveAgentIdViaChain('toolu', ctx(), deps);

		assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
			out: 'agent-from-s2',
			calls: ['s1', 's2'],
			cacheWrites: [{ id: 'toolu', agentId: 'agent-from-s2' }],
		});
	});

	test('full miss returns undefined and writes nothing', async () => {
		const deps = makeDeps([
			makeStrategy('s1', undefined),
			makeStrategy('s2', undefined),
		]);

		const out = await resolveAgentIdViaChain('toolu', ctx(), deps);

		assert.deepStrictEqual({ out, cacheWrites: deps.cacheWrites }, {
			out: undefined,
			cacheWrites: [],
		});
	});

	test('cancellation between strategies stops the chain', async () => {
		const tokenSource = new CancellationTokenSource();
		const calls: string[] = [];
		const deps = makeDeps([
			makeStrategy('s1', undefined, () => { calls.push('s1'); tokenSource.cancel(); }),
			makeStrategy('s2', 'never-reached', () => calls.push('s2')),
		]);

		const out = await resolveAgentIdViaChain('toolu', ctx(tokenSource.token), deps);

		assert.deepStrictEqual({ out, calls, cacheWrites: deps.cacheWrites }, {
			out: undefined,
			calls: ['s1'],
			cacheWrites: [],
		});
	});
});

suite('claudeSubagentResolver — extractSpawningPromptFromTranscript', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns prompt for matching subagent tool; rejects malformed/streaming/wrong-tool', () => {
		const transcript: readonly Turn[] = [
			makeAgentToolCallTurn('toolu_match', { prompt: 'do the thing' }),
			makeAgentToolCallTurn('toolu_streaming', { prompt: 'unfinished', status: undefined }),
			makeAgentToolCallTurn('toolu_wrong_tool', { prompt: 'p', toolName: 'Read' }),
			makeAgentToolCallTurn('toolu_bad_json', {}),
		];
		// Mutate the streaming turn into actual streaming status (helper defaults to Completed).
		(transcript[1].responseParts[0] as { toolCall: { status: ToolCallStatus } }).toolCall.status = ToolCallStatus.Streaming;
		// Mutate bad-json turn to have non-string toolInput.
		(transcript[3].responseParts[0] as { toolCall: { toolInput: unknown } }).toolCall.toolInput = '{not json';

		assert.deepStrictEqual({
			match: extractSpawningPromptFromTranscript(transcript, 'toolu_match'),
			streaming: extractSpawningPromptFromTranscript(transcript, 'toolu_streaming'),
			wrongTool: extractSpawningPromptFromTranscript(transcript, 'toolu_wrong_tool'),
			badJson: extractSpawningPromptFromTranscript(transcript, 'toolu_bad_json'),
			missing: extractSpawningPromptFromTranscript(transcript, 'toolu_unknown'),
		}, {
			match: 'do the thing',
			streaming: undefined,
			wrongTool: undefined,
			badJson: undefined,
			missing: undefined,
		});
	});
});

suite('claudeSubagentResolver — fetchParentTurns', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns ctx.parentTranscript without calling SDK; falls through to SDK; logs and returns undefined on SDK error', async () => {
		const sdk = new FakeSdkService();
		const log = new NullLogService();
		const baseCtx = (overrides: Partial<ISubagentLookupContext>): ISubagentLookupContext => ({
			parentSessionId: 'sess-1',
			parentUri: URI.parse('file:///parent'),
			token: CancellationToken.None,
			...overrides,
		});

		const cached: readonly Turn[] = [];
		const fromCache = await fetchParentTurns(sdk, log, baseCtx({ parentTranscript: cached }), 'L');
		const fromSdk = await fetchParentTurns(sdk, log, baseCtx({}), 'L');
		sdk.getSessionMessagesRejection = new Error('boom');
		const onError = await fetchParentTurns(sdk, log, baseCtx({}), 'L');

		assert.deepStrictEqual({
			fromCacheIsCached: fromCache === cached,
			fromCacheCallCount: 0,
			fromSdkIsArray: Array.isArray(fromSdk),
			onError,
			totalSdkCalls: sdk.getSessionMessagesCalls.length,
		}, {
			fromCacheIsCached: true,
			fromCacheCallCount: 0,
			fromSdkIsArray: true,
			onError: undefined,
			totalSdkCalls: 2,
		});
	});
});

