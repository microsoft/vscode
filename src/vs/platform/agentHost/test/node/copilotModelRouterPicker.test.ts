/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentDecisionsRequest, IAgentDecisionsResult } from '../../common/agentDecisions.js';
import { ModelRouterPickerError, ModelRouterPickerFailure, type IModelRouterPickRequest } from '../../node/copilot/copilotModelRouter.js';
import { buildModelRouterDecisionsRequest, DecisionsModelRouterPicker, modelRouterRequestLimits, truncateToEscapedBytes } from '../../node/copilot/copilotModelRouterPicker.js';

const candidates = [
	{ id: 'haiku', name: 'Haiku', when: 'Small edits.', examples: ['rename x'] },
	{ id: 'opus', name: 'Opus', when: 'Planning.', examples: [] },
];

function pickRequest(overrides: Partial<IModelRouterPickRequest> = {}): IModelRouterPickRequest {
	return { text: 'plan the migration', candidates, guidance: '', askEffort: true, chat: 'chat-1', ...overrides };
}

const serializedBytes = (value: unknown) => VSBuffer.fromString(JSON.stringify(value)).byteLength;

suite('DecisionsModelRouterPicker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sends a first turn\'s prompt as text, and a follow-up\'s recent turns as JSON', () => {
		const first = buildModelRouterDecisionsRequest(pickRequest());
		const followUp = buildModelRouterDecisionsRequest(pickRequest({
			followUp: { currentModel: 'opus', currentEffort: undefined, recentTurns: [{ prompt: 'earlier', response: 'done' }], turns: 1, lastTurnState: 'complete', lastTurnToolCalls: 0, lastTurnFailedToolCalls: 0 },
		}));
		assert.deepStrictEqual({
			model: first.model,
			firstContext: first.context,
			firstQuestions: first.questions.map(q => q.name),
			followUpTurns: followUp.context.kind === 'json' ? (followUp.context.value as { recentTurns: unknown }).recentTurns : undefined,
			followUpQuestions: followUp.questions.map(q => q.name),
		}, {
			model: 'gpt-6-luna-decisions',
			firstContext: { kind: 'text', text: 'A user sent this message to an AI coding agent:\n\nplan the migration' },
			firstQuestions: ['model', 'effort'],
			followUpTurns: [{ prompt: 'earlier', response: 'done' }],
			followUpQuestions: ['model', 'effort'],
		});
	});

	test('adds the facts about a turn after the message, and each model\'s facts to its option', () => {
		const situation = ['Attached: 1 image', 'Workspace: shop-checkout'];
		const withFacts = candidates.map(candidate => candidate.id === 'opus' ? { ...candidate, facts: 'high cost, context window 1M' } : candidate);
		const first = buildModelRouterDecisionsRequest(pickRequest({ situation, candidates: withFacts, askEffort: false }));
		const followUp = buildModelRouterDecisionsRequest(pickRequest({
			situation,
			followUp: { currentModel: 'opus', currentEffort: undefined, recentTurns: [], turns: 1, lastTurnState: 'complete', lastTurnToolCalls: 0, lastTurnFailedToolCalls: 0 },
		}));
		const plain = buildModelRouterDecisionsRequest(pickRequest({ askEffort: false }));
		const question = (request: IAgentDecisionsRequest) => request.questions[0];
		assert.deepStrictEqual({
			firstContext: first.context,
			options: question(first).kind === 'choice' ? [...(question(first) as { options: { description: string }[] }).options.map(option => option.description)].sort() : undefined,
			followUpSituation: followUp.context.kind === 'json' ? (followUp.context.value as { situation: unknown }).situation : undefined,
			// The decision is told what the facts are for only when there are some.
			explained: [first, followUp, plain].map(request => question(request).instructions.includes('facts about it')),
		}, {
			firstContext: { kind: 'text', text: 'A user sent this message to an AI coding agent:\n\nplan the migration\n\nFacts about this request, which are not part of the message:\n- Attached: 1 image\n- Workspace: shop-checkout' },
			options: ['Haiku. Use for: Small edits. Examples: "rename x"', 'Opus (high cost, context window 1M). Use for: Planning.'],
			followUpSituation: situation,
			explained: [true, true, false],
		});
	});

	test('keeps each fact to one bounded line, and drops the facts before cutting the message when the request is too large', () => {
		const bounded = buildModelRouterDecisionsRequest(pickRequest({ text: 'fix this', situation: [`Attached: 1 image\n- Plan mode${' x'.repeat(1000)}`, '  ', ...Array.from({ length: 12 }, (_, index) => `Fact ${index}`)] }));
		const boundedLines = bounded.context.kind === 'text' ? bounded.context.text.split('\n').filter(line => line.startsWith('- ')) : [];

		// A router whose guidance leaves room for the message but not for the facts as well.
		const size = (guidance: string) => serializedBytes(buildModelRouterDecisionsRequest(pickRequest({ text: 'fix this', guidance })));
		const bytesPerCharacter = (size('g'.repeat(2000)) - size('g'.repeat(1000))) / 1000;
		const guidance = 'g'.repeat(1000 + Math.floor((modelRouterRequestLimits.request - size('g'.repeat(1000)) - 100) / bytesPerCharacter));
		const tight = buildModelRouterDecisionsRequest(pickRequest({ text: 'fix this', guidance, situation: ['Attached: 1 image', 'Workspace: shop-checkout'] }));
		// With no text, the attachment was all there was to go by, so there is nothing left to ask about.
		assert.throws(() => buildModelRouterDecisionsRequest(pickRequest({ text: '', guidance, situation: ['Attached: 1 image', 'Workspace: shop-checkout'] })), ModelRouterPickerError);
		assert.throws(() => buildModelRouterDecisionsRequest(pickRequest({ text: ' ' })), ModelRouterPickerError);

		assert.deepStrictEqual({
			boundedLines: boundedLines.map(line => line.length <= modelRouterRequestLimits.situationLine + 2 ? line.slice(0, 40) : 'too long'),
			tightContext: tight.context,
			tightExplained: tight.questions.map(question => question.instructions.includes('facts about it')),
			tightFits: serializedBytes(tight) <= modelRouterRequestLimits.request,
		}, {
			boundedLines: ['- Attached: 1 image - Plan mode x x x x ', ...Array.from({ length: 7 }, (_, index) => `- Fact ${index}`)],
			tightContext: { kind: 'text', text: 'A user sent this message to an AI coding agent:\n\nfix this' },
			tightExplained: [false, false],
			tightFits: true,
		});
	});

	test('caps the prompt and recent turns in bytes after JSON escaping', () => {
		// Each control character is one byte as text and six once escaped.
		const control = '\u0001'.repeat(64 * 1024);
		const built = buildModelRouterDecisionsRequest(pickRequest({
			text: control,
			followUp: { currentModel: 'opus', currentEffort: undefined, recentTurns: Array.from({ length: 4 }, () => ({ prompt: control, response: `"\\${control}` })), turns: 4, lastTurnState: 'complete', lastTurnToolCalls: 0, lastTurnFailedToolCalls: 0 },
		}));
		const value = built.context.kind === 'json' ? built.context.value as { request: string; recentTurns: { prompt: string; response: string }[] } : undefined;
		assert.ok(value);
		assert.ok(serializedBytes(value.request) - 2 <= modelRouterRequestLimits.prompt);
		assert.ok(value.recentTurns.every(turn => serializedBytes(turn.prompt) - 2 + serializedBytes(turn.response) - 2 <= modelRouterRequestLimits.recentTurn));
		assert.ok(serializedBytes(built) <= modelRouterRequestLimits.request);
		assert.ok(serializedBytes(buildModelRouterDecisionsRequest(pickRequest({ text: control }))) <= modelRouterRequestLimits.request, 'a first turn is capped too');
		assert.strictEqual(truncateToEscapedBytes('ab\uD83D\uDE00', 4), 'ab', 'never splits a surrogate pair');
	});

	test('tells the effort question that a follow-up carries the earlier turns\' work', () => {
		const effortOf = (request: IAgentDecisionsRequest) => request.questions.find(q => q.name === 'effort')?.instructions ?? '';
		const first = buildModelRouterDecisionsRequest(pickRequest({ text: 'fix it' }));
		const followUp = buildModelRouterDecisionsRequest(pickRequest({
			text: 'fix it',
			followUp: { currentModel: 'opus', currentEffort: undefined, recentTurns: [{ prompt: 'why does this crash?', response: 'It unwraps an empty line.' }], turns: 1, lastTurnState: 'complete', lastTurnToolCalls: 3, lastTurnFailedToolCalls: 0 },
		}));
		assert.deepStrictEqual([effortOf(first).includes('This is a follow-up'), effortOf(followUp).includes('This is a follow-up')], [false, true]);
	});

	test('maps answers to a pick, and a tie to no pick', async () => {
		const answers = (tied: boolean): IAgentDecisionsResult => ({
			model: 'gpt-6-luna-decisions',
			answers: [
				{ kind: 'choice', name: 'model', value: 'opus', tied, confidence: 0.8, probabilities: [{ value: 'opus', probability: 0.8 }, { value: 'haiku', probability: 0.2 }] },
				{ kind: 'score', name: 'effort', score: 2.1, level: 'High', confidence: 0.7 },
			],
		});
		const clear = await new DecisionsModelRouterPicker(async () => answers(false)).pick(pickRequest());
		const tie = await new DecisionsModelRouterPicker(async () => answers(true)).pick(pickRequest());
		assert.deepStrictEqual([clear, { model: tie.model, confidence: tie.confidence }], [
			{ model: 'opus', confidence: 0.8, probabilities: { opus: 0.8, haiku: 0.2 }, effortScore: 2.1 },
			{ model: undefined, confidence: 0 },
		]);
	});

	test('reports an account that can\'t use the decision model separately from an outage', async () => {
		const failWith = (kind: string) => new DecisionsModelRouterPicker((_: IAgentDecisionsRequest) => Promise.reject(Object.assign(new Error(kind), { data: { kind } }))).pick(pickRequest()).catch(error => (error as ModelRouterPickerError).failure);
		assert.deepStrictEqual(await Promise.all([failWith('notEnabled'), failWith('timeout')]), [ModelRouterPickerFailure.NoDecisionModel, ModelRouterPickerFailure.Unavailable]);
	});
});
