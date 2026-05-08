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
import { ResponsePartKind } from '../../common/state/sessionState.js';
import { mapSDKMessageToAgentSignals } from '../../node/claude/claudeMapSessionEvents.js';
import {
	makeAssistantMessage,
	makeContentBlockStartText,
	makeContentBlockStartThinking,
	makeContentBlockStartToolUse,
	makeContentBlockStop,
	makeMessageStart,
	makeMessageStop,
	makeResultSuccess,
	makeStreamEvent,
	makeTextDelta,
	makeThinkingDelta,
} from './claudeMapSessionEventsTestUtils.js';

/**
 * Direct unit tests for {@link mapSDKMessageToAgentSignals}.
 *
 * Calls the mapper as a pure function — no state, no harness, no
 * service collection. The integrated `claudeAgent.test.ts` suite still
 * exercises the mapper end-to-end alongside the SDK envelope plumbing.
 */
suite('claudeMapSessionEvents — direct mapper tests', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION = URI.parse('agent-session://test/abc');
	const SESSION_STR = SESSION.toString();
	const SESSION_ID = 'sid-1';
	const TURN_ID = 'turn-1';

	/**
	 * Captures `warn` calls so defense-in-depth tests can assert the
	 * mapper logged the dropped tool_use diagnostic.
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
			new NullLogService(),
		);

		assert.deepStrictEqual(signals, []);
	});

	test('text content block: start emits SessionResponsePart, deltas emit SessionDelta', () => {
		const out: AgentSignal[] = [];
		const log = new NullLogService();
		const push = (msgs: AgentSignal[]) => out.push(...msgs);

		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart()), SESSION, TURN_ID, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'Hello, ')), SESSION, TURN_ID, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'world!')), SESSION, TURN_ID, log));
		push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, log));

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

		const startSignals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)),
			SESSION,
			TURN_ID,
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

	test('streamed tool_use content block is dropped with a warn log (defense-in-depth)', () => {
		const log = new CapturingLogService();

		const signals = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(2, 'tu_1', 'Bash')),
			SESSION,
			TURN_ID,
			log,
		);

		assert.deepStrictEqual(signals, []);
		assert.strictEqual(log.warns.length, 1);
		assert.ok(log.warns[0].includes('dropped streamed tool_use block'));
		assert.ok(log.warns[0].includes('index 2'));
	});

	test('canonical assistant envelope drops tool_use blocks with a warn log and emits nothing', () => {
		const log = new CapturingLogService();

		const signals = mapSDKMessageToAgentSignals(
			makeAssistantMessage(SESSION_ID, [
				{ type: 'text', text: 'final', citations: null },
				{ type: 'tool_use', id: 'tu_a', name: 'Bash', input: {} },
			]),
			SESSION,
			TURN_ID,
			log,
		);

		assert.deepStrictEqual(signals, []);
		assert.strictEqual(log.warns.length, 1);
		assert.ok(log.warns[0].includes('dropped tool_use block on canonical SDKAssistantMessage'));
		assert.ok(log.warns[0].includes('id=tu_a'));
		assert.ok(log.warns[0].includes('name=Bash'));
	});

	test('canonical assistant envelope without tool_use emits nothing and does not warn', () => {
		const log = new CapturingLogService();

		const signals = mapSDKMessageToAgentSignals(
			makeAssistantMessage(SESSION_ID, [{ type: 'text', text: 'final answer', citations: null }]),
			SESSION,
			TURN_ID,
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

		const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new NullLogService());

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

		const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new NullLogService());

		assert.strictEqual(signals.length, 2);
		const usage = signals[0];
		assert.ok(usage.kind === 'action' && usage.action.type === ActionType.SessionUsage);
		assert.strictEqual(usage.action.usage.model, undefined);
	});

	test('message_stop and unknown stream events emit nothing', () => {
		const log = new NullLogService();

		const stop = mapSDKMessageToAgentSignals(
			makeStreamEvent(SESSION_ID, makeMessageStop()),
			SESSION,
			TURN_ID,
			log,
		);
		assert.deepStrictEqual(stop, []);
	});

	test('multi-block ordering: text @0 then thinking @1 keep distinct part ids and route deltas correctly', () => {
		const log = new NullLogService();

		const text0 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, log);
		const think1 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(1)), SESSION, TURN_ID, log);

		const text0Start = text0[0];
		const think1Start = think1[0];
		assert.ok(text0Start.kind === 'action' && text0Start.action.type === ActionType.SessionResponsePart);
		assert.ok(think1Start.kind === 'action' && think1Start.action.type === ActionType.SessionResponsePart);
		assert.strictEqual(text0Start.action.part.kind, ResponsePartKind.Markdown);
		assert.strictEqual(think1Start.action.part.kind, ResponsePartKind.Reasoning);
		const textPartId = text0Start.action.part.id;
		const thinkPartId = think1Start.action.part.id;
		assert.notStrictEqual(textPartId, thinkPartId);

		const dText = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, 'A')), SESSION, TURN_ID, log);
		const dThink = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(1, 'B')), SESSION, TURN_ID, log);

		assert.ok(dText[0].kind === 'action' && dText[0].action.type === ActionType.SessionDelta);
		assert.strictEqual(dText[0].action.partId, textPartId);
		assert.ok(dThink[0].kind === 'action' && dThink[0].action.type === ActionType.SessionReasoning);
		assert.strictEqual(dThink[0].action.partId, thinkPartId);
	});
});
