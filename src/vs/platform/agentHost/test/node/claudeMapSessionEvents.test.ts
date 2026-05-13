/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AgentSignal } from '../../common/agentService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ResponsePartKind, ToolResultContentType } from '../../common/state/sessionState.js';
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from '../../node/claude/claudeMapSessionEvents.js';
import {
	makeAssistantMessage,
	makeContentBlockStartText,
	makeContentBlockStartThinking,
	makeContentBlockStartToolUse,
	makeContentBlockStop,
	makeInputJsonDelta,
	makeMessageStart,
	makeMessageStop,
	makeResultSuccess,
	makeStreamEvent,
	makeTextDelta,
	makeThinkingDelta,
	makeUserToolResultMessage,
} from './claudeMapSessionEventsTestUtils.js';

/**
 * Direct unit tests for {@link mapSDKMessageToAgentSignals}.
 *
 * The mapper takes a per-session {@link ClaudeMapperState} and is
 * exercised here as a stand-alone function. The integrated
 * `claudeAgent.test.ts` suite still drives the mapper end-to-end
 * alongside the SDK envelope plumbing.
 */
suite('claudeMapSessionEvents — direct mapper tests', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION = URI.parse('agent-session://test/abc');
	const SESSION_STR = SESSION.toString();
	const SESSION_ID = 'sid-1';
	const TURN_ID = 'turn-1';

	/**
	 * Captures `warn` calls so defense-in-depth tests can assert the
	 * mapper logged the dropped diagnostic.
	 */
	class CapturingLogService extends NullLogService {
		readonly warns: string[] = [];
		override warn(message: string, ...args: unknown[]): void {
			this.warns.push([message, ...args.map(a => String(a))].join(' '));
		}
	}

	test('message_start emits no signals', () => {
		const signals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeMessageStart()),
			SESSION,
			TURN_ID,
			new ClaudeMapperState(),
			new NullLogService(),
		);

		assert.deepStrictEqual(signals, []);
	});

	test('text content block: start emits SessionResponsePart, deltas emit SessionDelta', () => {
		const out: AgentSignal[] = [];
		const log = new NullLogService();
		const state = new ClaudeMapperState();
		const push = (msgs: AgentSignal[]) => out.push(...msgs);

		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart()), SESSION, TURN_ID, state, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'Hello, ')), SESSION, TURN_ID, state, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'world!')), SESSION, TURN_ID, state, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log));

		assert.strictEqual(out.length, 3);
		const start = out[0];
		assert.ok(start.kind === 'action' && start.action.type === ActionType.SessionResponsePart);
		assert.strictEqual(start.action.session, SESSION_STR);
		assert.strictEqual(start.action.turnId, TURN_ID);
		assert.strictEqual(start.action.part.kind, ResponsePartKind.Markdown);
		const partId = start.action.part.id;
		assert.ok(partId.length > 0);

		assert.deepStrictEqual(out.slice(1), [
			{
				kind: 'action',
				session: SESSION,
				action: {
					type: ActionType.SessionDelta,
					session: SESSION_STR,
					turnId: TURN_ID,
					partId,
					content: 'Hello, ',
				},
			},
			{
				kind: 'action',
				session: SESSION,
				action: {
					type: ActionType.SessionDelta,
					session: SESSION_STR,
					turnId: TURN_ID,
					partId,
					content: 'world!',
				},
			},
		]);
	});

	test('thinking content block: start emits Reasoning part, deltas emit SessionReasoning', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		const startSignals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)),
			SESSION,
			TURN_ID,
			state,
			log,
		);
		assert.strictEqual(startSignals.length, 1);
		const start = startSignals[0];
		assert.ok(start.kind === 'action' && start.action.type === ActionType.SessionResponsePart);
		assert.strictEqual(start.action.part.kind, ResponsePartKind.Reasoning);
		const partId = start.action.part.id;

		const deltaSignals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeThinkingDelta(0, 'pondering')),
			SESSION,
			TURN_ID,
			state,
			log,
		);
		assert.deepStrictEqual(deltaSignals, [{
			kind: 'action',
			session: SESSION,
			action: {
				type: ActionType.SessionReasoning,
				session: SESSION_STR,
				turnId: TURN_ID,
				partId,
				content: 'pondering',
			},
		}]);
	});

	// #region Phase 7 §3.3 tool_use / tool_result — Tests 8/9/10/11

	test('Test 8 — content_block_start tool_use emits SessionToolCallStart with displayName', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();

		const signals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_1', 'Read')),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(signals, [{
			kind: 'action',
			session: SESSION,
			action: {
				type: ActionType.SessionToolCallStart,
				session: SESSION_STR,
				turnId: TURN_ID,
				toolCallId: 'tu_1',
				toolName: 'Read',
				displayName: 'Read file',
			},
		}]);
		assert.deepStrictEqual(log.warns, []);
	});

	test('Test 9 — input_json_delta emits SessionToolCallDelta scoped to the open tool_use block', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		// Open the block first so the per-message map knows about index 0.
		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_1', 'Read')), SESSION, TURN_ID, state, log);

		const signals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_pa')),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(signals, [{
			kind: 'action',
			session: SESSION,
			action: {
				type: ActionType.SessionToolCallDelta,
				session: SESSION_STR,
				turnId: TURN_ID,
				toolCallId: 'tu_1',
				content: '{"file_pa',
			},
		}]);
	});

	test('Test 10 — synthetic user tool_result emits SessionToolCallComplete with the originating turnId', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();

		// Drive the tool_use through state, simulating the multi-message
		// flow: the tool_use lands on TURN_ID, content_block_stop drains
		// the per-message map, then a synthetic user message in the next
		// (separate) turn carries the tool_result. Cross-message lookup
		// must recover the original turnId.
		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_1', 'Read')), SESSION, TURN_ID, state, log);
		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'tu_1', 'file contents'),
			SESSION,
			'turn-2-irrelevant',
			state,
			log,
		);

		assert.deepStrictEqual(signals, [{
			kind: 'action',
			session: SESSION,
			action: {
				type: ActionType.SessionToolCallComplete,
				session: SESSION_STR,
				turnId: TURN_ID,
				toolCallId: 'tu_1',
				result: {
					success: true,
					pastTenseMessage: 'Read file finished',
					content: [{ type: ToolResultContentType.Text, text: 'file contents' }],
				},
			},
		}]);
		assert.deepStrictEqual(log.warns, []);
	});

	test('Test 11 — tool_result for unknown tool_use_id emits no signal and warns', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'unknown-id', 'orphan content'),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(signals, []);
		assert.strictEqual(log.warns.length, 1);
		assert.ok(log.warns[0].includes('tool_result for unknown tool_use_id unknown-id'));
	});

	test('tool_result with is_error: true reports success=false', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_err', 'Bash')), SESSION, TURN_ID, state, log);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'tu_err', 'permission denied', { isError: true }),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.strictEqual(signals.length, 1);
		const complete = signals[0];
		assert.ok(complete.kind === 'action' && complete.action.type === ActionType.SessionToolCallComplete);
		assert.strictEqual(complete.action.result.success, false);
	});

	test('tool_result content as TextBlock array unwraps to ToolResultTextContent[]', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_2', 'Read')), SESSION, TURN_ID, state, log);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'tu_2', [
				{ type: 'text', text: 'first' },
				{ type: 'text', text: 'second' },
			]),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		const complete = signals[0];
		assert.ok(complete.kind === 'action' && complete.action.type === ActionType.SessionToolCallComplete);
		assert.deepStrictEqual(complete.action.result.content, [
			{ type: ToolResultContentType.Text, text: 'first' },
			{ type: ToolResultContentType.Text, text: 'second' },
		]);
	});

	// #endregion

	// #region Phase 8 — file-edit cache

	test('Phase 8 — cached file edit is appended to SessionToolCallComplete.result.content', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_edit', 'Write')), SESSION, TURN_ID, state, log);

		const fileEdit = {
			type: ToolResultContentType.FileEdit as const,
			before: { uri: 'file:///tmp/a', content: { uri: 'session-db://abc/before' } },
			after: { uri: 'file:///tmp/a', content: { uri: 'session-db://abc/after' } },
			diff: { added: 3, removed: 1 },
		};
		state.cacheFileEdit('tu_edit', fileEdit);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'tu_edit', 'wrote file'),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		const complete = signals[0];
		assert.ok(complete.kind === 'action' && complete.action.type === ActionType.SessionToolCallComplete);
		assert.deepStrictEqual(complete.action.result.content, [
			{ type: ToolResultContentType.Text, text: 'wrote file' },
			fileEdit,
		]);
	});

	test('Phase 8 — no cached edit leaves content text-only (no regression)', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, 'tu_read', 'Read')), SESSION, TURN_ID, state, log);

		const signals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, 'tu_read', 'file contents'),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		const complete = signals[0];
		assert.ok(complete.kind === 'action' && complete.action.type === ActionType.SessionToolCallComplete);
		assert.deepStrictEqual(complete.action.result.content, [
			{ type: ToolResultContentType.Text, text: 'file contents' },
		]);
	});

	test('Phase 8 — takeFileEdit returns undefined on cache miss and consumes on hit', () => {
		const state = new ClaudeMapperState();

		assert.strictEqual(state.takeFileEdit('absent'), undefined);

		const fileEdit = {
			type: ToolResultContentType.FileEdit as const,
			before: { uri: 'file:///tmp/x', content: { uri: 'session-db://x/before' } },
			after: { uri: 'file:///tmp/x', content: { uri: 'session-db://x/after' } },
			diff: undefined,
		};
		state.cacheFileEdit('tu_x', fileEdit);
		assert.strictEqual(state.takeFileEdit('tu_x'), fileEdit);
		// Second take is a miss — the entry was consumed.
		assert.strictEqual(state.takeFileEdit('tu_x'), undefined);
	});

	// #endregion

	test('canonical assistant envelope drops tool_use blocks silently (partial stream owns SessionToolCallStart)', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();

		const signals = mapSDKMessageToAgentSignals(
			makeAssistantMessage(SESSION_ID, [
				{ type: 'text', text: 'final', citations: null },
				{ type: 'tool_use', id: 'tu_a', name: 'Bash', input: {} },
			]),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(signals, []);
		assert.deepStrictEqual(log.warns, []);
	});

	test('canonical assistant envelope without tool_use emits nothing and does not warn', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();

		const signals = mapSDKMessageToAgentSignals(
			makeAssistantMessage(SESSION_ID, [{ type: 'text', text: 'final answer', citations: null }]),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(signals, []);
		assert.deepStrictEqual(log.warns, []);
	});

	test('result success emits SessionUsage (with model) followed by SessionTurnComplete', () => {
		const result = makeResultSuccess(SESSION_ID);
		result.usage.input_tokens = 12;
		result.usage.output_tokens = 34;
		result.usage.cache_read_input_tokens = 5;
		result.modelUsage = {
			'claude-test': {
				inputTokens: 12,
				outputTokens: 34,
				cacheReadInputTokens: 5,
				cacheCreationInputTokens: 0,
				webSearchRequests: 0,
				costUSD: 0,
				contextWindow: 200_000,
				maxOutputTokens: 8192,
			},
		};

		const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService());

		assert.deepStrictEqual(signals, [
			{
				kind: 'action',
				session: SESSION,
				action: {
					type: ActionType.SessionUsage,
					session: SESSION_STR,
					turnId: TURN_ID,
					usage: {
						inputTokens: 12,
						outputTokens: 34,
						cacheReadTokens: 5,
						model: 'claude-test',
					},
				},
			},
			{
				kind: 'action',
				session: SESSION,
				action: {
					type: ActionType.SessionTurnComplete,
					session: SESSION_STR,
					turnId: TURN_ID,
				},
			},
		]);
	});

	test('result success without modelUsage omits the model field on SessionUsage', () => {
		const result = makeResultSuccess(SESSION_ID);
		result.modelUsage = {};

		const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService());

		assert.strictEqual(signals.length, 2);
		const usage = signals[0];
		assert.ok(usage.kind === 'action' && usage.action.type === ActionType.SessionUsage);
		assert.strictEqual(usage.action.usage.model, undefined);
	});

	test('result drains pending tool_use entries that never received a tool_result and warns once per orphan', () => {
		const log = new CapturingLogService();
		const state = new ClaudeMapperState();
		const TOOL_USE_ID = 'toolu_orphan_1';

		// Open a tool_use block that will never be paired with a tool_result.
		mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, TOOL_USE_ID, 'Read')),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		// Turn ends with no tool_result for the tool_use.
		const resultSignals = mapSDKMessageToAgentSignals(
			makeResultSuccess(SESSION_ID),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.strictEqual(resultSignals.length, 2);
		assert.strictEqual(log.warns.length, 1);
		assert.ok(log.warns[0].includes(TOOL_USE_ID), `expected warn to mention orphan id, got: ${log.warns[0]}`);
		assert.ok(log.warns[0].includes('Read'), `expected warn to mention tool name, got: ${log.warns[0]}`);

		// A late-arriving tool_result for the orphan must now be treated
		// as unknown — proving the cross-message state was actually cleared.
		const lateSignals = mapSDKMessageToAgentSignals(
			makeUserToolResultMessage(SESSION_ID, TOOL_USE_ID, 'late content'),
			SESSION,
			TURN_ID,
			state,
			log,
		);

		assert.deepStrictEqual(lateSignals, []);
		assert.strictEqual(log.warns.length, 2);
		assert.ok(log.warns[1].includes(`tool_result for unknown tool_use_id ${TOOL_USE_ID}`));
	});

	test('message_stop and unknown stream events emit nothing', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		const stop = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeMessageStop()),
			SESSION,
			TURN_ID,
			state,
			log,
		);
		assert.deepStrictEqual(stop, []);
	});

	test('multi-block ordering: text @0 then thinking @1 keep distinct part ids and route deltas correctly', () => {
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		const text0 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log);
		const think1 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(1)), SESSION, TURN_ID, state, log);

		const text0Start = text0[0];
		const think1Start = think1[0];
		assert.ok(text0Start.kind === 'action' && text0Start.action.type === ActionType.SessionResponsePart);
		assert.ok(think1Start.kind === 'action' && think1Start.action.type === ActionType.SessionResponsePart);
		assert.strictEqual(text0Start.action.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual(think1Start.action.part.kind, ResponsePartKind.Reasoning);
		const textPartId = text0Start.action.part.id;
		const thinkPartId = think1Start.action.part.id;
		assert.notStrictEqual(textPartId, thinkPartId);

		const dText = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'A')), SESSION, TURN_ID, state, log);
		const dThink = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(1, 'B')), SESSION, TURN_ID, state, log);

		assert.ok(dText[0].kind === 'action' && dText[0].action.type === ActionType.SessionDelta);
		assert.strictEqual(dText[0].action.partId, textPartId);
		assert.ok(dThink[0].kind === 'action' && dThink[0].action.type === ActionType.SessionReasoning);
		assert.strictEqual(dThink[0].action.partId, thinkPartId);
	});

	test('two SDK messages within one turn at the same content-block index produce distinct part ids', () => {
		// Regression: pre-tool message had thinking@0; post-tool-result
		// message has text@0. Same turnId, same content-block index.
		// The Anthropic SDK resets `event.index` on each message_start,
		// so the part id must include the SDK message id to avoid
		// collision with the earlier Reasoning part (which would cause
		// the reducer to drop the new Markdown part as a duplicate).
		const log = new NullLogService();
		const state = new ClaudeMapperState();

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart('msg_a')), SESSION, TURN_ID, state, log);
		const thinkStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)), SESSION, TURN_ID, state, log);
		const thinkDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(0, 'plan')), SESSION, TURN_ID, state, log);

		mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart('msg_b')), SESSION, TURN_ID, state, log);
		const textStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log);
		const textDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'done')), SESSION, TURN_ID, state, log);

		const thinkStartSignal = thinkStart[0];
		const textStartSignal = textStart[0];
		assert.ok(thinkStartSignal.kind === 'action' && thinkStartSignal.action.type === ActionType.SessionResponsePart);
		assert.ok(textStartSignal.kind === 'action' && textStartSignal.action.type === ActionType.SessionResponsePart);
		assert.strictEqual(thinkStartSignal.action.part.kind, ResponsePartKind.Reasoning);
		assert.strictEqual(textStartSignal.action.part.kind, ResponsePartKind.Markdown);
		const thinkPartId = thinkStartSignal.action.part.id;
		const textPartId = textStartSignal.action.part.id;
		assert.notStrictEqual(thinkPartId, textPartId, 'text@0 in second message must not collide with thinking@0 in first message');

		const thinkDeltaSignal = thinkDelta[0];
		const textDeltaSignal = textDelta[0];
		assert.ok(thinkDeltaSignal.kind === 'action' && thinkDeltaSignal.action.type === ActionType.SessionReasoning);
		assert.strictEqual(thinkDeltaSignal.action.partId, thinkPartId);
		assert.ok(textDeltaSignal.kind === 'action' && textDeltaSignal.action.type === ActionType.SessionDelta);
		assert.strictEqual(textDeltaSignal.action.partId, textPartId);
	});
});
