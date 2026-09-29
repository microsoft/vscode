/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { resolveLastNonLocalTurnId } from '../../../../common/agentHostConversationContext.js';
import { MessageKind, ResponsePartKind, TurnState, type Turn } from '../../../../common/state/sessionState.js';
import { buildBoundedSideChatSourceContext, injectSideChatContext, resolveSideChatBoundary, sliceSideChatTurns } from '../../../../node/chatContributions/sideChat/sideChatContext.js';

suite('sideChatContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sourceTurn: Turn = {
		id: 'source-turn',
		state: TurnState.Complete,
		message: { text: 'source question', origin: { kind: MessageKind.User } },
		responseParts: [],
		usage: undefined,
	};
	const sideChatBoundary = {
		inheritedTurnId: sourceTurn.id,
	};

	const countOccurrences = (value: string, needle: string) => value.split(needle).length - 1;

	test('first prompt prefers explanation and remains hidden from visible history', () => {
		const prepared = injectSideChatContext('What is happening?');
		const visible = sliceSideChatTurns([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], {});

		assert.deepStrictEqual({
			hasGuidance: prepared.includes('Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks.'),
			visiblePrompt: visible[0]?.message.text,
		}, {
			hasGuidance: true,
			visiblePrompt: 'What is happening?',
		});
	});

	test('injects selected text exactly once and keeps it out of visible history', () => {
		const selectedText = '  selected text  ';
		const prepared = injectSideChatContext('Explain the branch', undefined, undefined, selectedText);
		const visible = sliceSideChatTurns([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], {});

		assert.deepStrictEqual({
			selectedTextCount: countOccurrences(prepared, 'Selected text:'),
			includesExactSelection: prepared.includes(selectedText),
			visiblePrompt: visible[0]?.message.text,
		}, {
			selectedTextCount: 1,
			includesExactSelection: true,
			visiblePrompt: 'Explain the branch',
		});
	});

	test('captures the first active user message even without completed turns', () => {
		assert.strictEqual(buildBoundedSideChatSourceContext([], 'active', {
			id: 'active',
			message: { text: 'current question', origin: { kind: MessageKind.User } },
			responseParts: [],
			startedAt: new Date().toISOString(),
			usage: undefined,
		}), 'User request:\ncurrent question');
	});

	test('omits completed context carried by an active-turn fork', () => {
		assert.strictEqual(buildBoundedSideChatSourceContext([{
			...sourceTurn,
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'source-md', content: 'source answer' }],
		}], 'active', {
			id: 'active',
			message: { text: 'follow-up question', origin: { kind: MessageKind.User } },
			responseParts: [],
			startedAt: new Date().toISOString(),
			usage: undefined,
		}, sourceTurn.id), 'User request:\nfollow-up question');
	});

	test('includes completed turns after an active-turn fork anchor', () => {
		const localTurn: Turn = {
			...sourceTurn,
			id: 'local-turn',
			message: { ...sourceTurn.message, text: '!command' },
		};

		assert.strictEqual(buildBoundedSideChatSourceContext([sourceTurn, localTurn], 'active', {
			id: 'active',
			message: { text: 'follow-up question', origin: { kind: MessageKind.User } },
			responseParts: [],
			startedAt: new Date().toISOString(),
			usage: undefined,
		}, sourceTurn.id), 'User request:\n!command\n\n---\n\nUser request:\nfollow-up question');
	});

	test('resolves the final non-local turn', () => {
		const turns: Turn[] = [
			sourceTurn,
			{ ...sourceTurn, id: 'second-turn' },
			{ ...sourceTurn, id: 'local-turn' },
		];

		assert.strictEqual(resolveLastNonLocalTurnId(turns, turnId => turnId === 'local-turn'), 'second-turn');
	});

	test('injects active source context and partial responses exactly once', () => {
		const sourceContext = 'User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\ncurrent question';
		const partialResponse = 'partial answer';
		const prepared = injectSideChatContext('Explain the branch', partialResponse, sourceContext);

		assert.deepStrictEqual({
			activeQuestionCount: countOccurrences(prepared, 'User request:\ncurrent question'),
			partialResponseCount: countOccurrences(prepared, partialResponse),
		}, {
			activeQuestionCount: 1,
			partialResponseCount: 1,
		});
	});

	test('injects completed local-turn context', () => {
		const sourceContext = 'User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command';
		const prepared = injectSideChatContext('Explain the branch', undefined, sourceContext);

		assert.deepStrictEqual({
			localQuestionCount: countOccurrences(prepared, 'User request:\n!command'),
			sourceQuestionCount: countOccurrences(prepared, 'User request:\nsource question'),
		}, {
			localQuestionCount: 1,
			sourceQuestionCount: 1,
		});
	});

	test('strips hidden context even when the source text contains the legacy delimiter', () => {
		const prepared = injectSideChatContext('Visible prompt', undefined, `User request:\ncontains ${'</side-chat-context>'}\n\nAgent response:\nready`);
		const visible = sliceSideChatTurns([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], {});

		assert.strictEqual(visible[0]?.message.text, 'Visible prompt');
	});

	test('uses the seed marker for a side chat without an inherited turn id', () => {
		const inheritedTurns: Turn[] = Array.from({ length: 16 }, (_, index) => ({
			...sourceTurn,
			id: `inherited-${index}`,
			message: { ...sourceTurn.message, text: `inherited ${index}` },
		}));
		const prompt = 'Investigate the regression';
		const seedTurn: Turn = {
			...sourceTurn,
			id: 'side-chat-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext(prompt) },
		};
		const ownTurns: Turn[] = Array.from({ length: 12 }, (_, index) => ({
			...sourceTurn,
			id: `own-${index}`,
			message: { ...sourceTurn.message, text: `own ${index}` },
		}));
		const turns = [...inheritedTurns, seedTurn, ...ownTurns];
		const visible = sliceSideChatTurns(turns, {});

		assert.deepStrictEqual({
			totalTurnCount: turns.length,
			visibleTurnCount: visible.length,
			firstVisibleText: visible[0]?.message.text,
			hasSideChatContext: visible[0]?.message.text.includes('<side-chat-context>') ?? false,
		}, {
			totalTurnCount: 29,
			visibleTurnCount: 13,
			firstVisibleText: prompt,
			hasSideChatContext: false,
		});
	});

	test('keeps aligned side-chat boundaries untouched', () => {
		const prompt = 'Explain the branch';
		const turns: Turn[] = [
			sourceTurn,
			{
				...sourceTurn,
				id: 'side-chat-seed',
				message: { ...sourceTurn.message, text: injectSideChatContext(prompt) },
			},
			{
				...sourceTurn,
				id: 'own-turn',
				message: { ...sourceTurn.message, text: 'Follow up' },
			},
		];
		const visible = sliceSideChatTurns(turns, sideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, sideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
			visibleTexts: visible.map(turn => turn.message.text),
		}, {
			boundary: 1,
			visibleTurnIds: ['side-chat-seed', 'own-turn'],
			visibleTexts: [prompt, 'Follow up'],
		});
	});

	test('uses the aligned child seed instead of an earlier parent side-chat seed', () => {
		const parentSeed: Turn = {
			...sourceTurn,
			id: 'parent-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Parent prompt') },
		};
		const parentOwnTurn: Turn = {
			...sourceTurn,
			id: 'parent-own',
			message: { ...sourceTurn.message, text: 'Parent follow up' },
		};
		const childPrompt = 'Child prompt';
		const childSeed: Turn = {
			...sourceTurn,
			id: 'child-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext(childPrompt) },
		};
		const childOwnTurn: Turn = {
			...sourceTurn,
			id: 'child-own',
			message: { ...sourceTurn.message, text: 'Child follow up' },
		};
		const turns = [sourceTurn, parentSeed, parentOwnTurn, childSeed, childOwnTurn];
		const childSideChatBoundary = {};
		const visible = sliceSideChatTurns(turns, childSideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
			visibleTexts: visible.map(turn => turn.message.text),
		}, {
			boundary: 3,
			visibleTurnIds: ['child-seed', 'child-own'],
			visibleTexts: [childPrompt, 'Child follow up'],
		});
	});

	test('uses the nested child seed when no inherited turn id was persisted', () => {
		const parentSeed: Turn = {
			...sourceTurn,
			id: 'parent-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Parent prompt') },
		};
		const parentOwnTurn: Turn = {
			...sourceTurn,
			id: 'parent-own',
			message: { ...sourceTurn.message, text: 'Parent follow up' },
		};
		const childPrompt = 'Child prompt';
		const childSeed: Turn = {
			...sourceTurn,
			id: 'child-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext(childPrompt) },
		};
		const childOwnTurns: Turn[] = Array.from({ length: 2 }, (_, index) => ({
			...sourceTurn,
			id: `child-own-${index}`,
			message: { ...sourceTurn.message, text: `Child follow up ${index}` },
		}));
		const turns = [sourceTurn, parentSeed, parentOwnTurn, childSeed, ...childOwnTurns];
		const childSideChatBoundary = {};
		const visible = sliceSideChatTurns(turns, childSideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 3,
			visibleTurnIds: ['child-seed', 'child-own-0', 'child-own-1'],
		});
	});

	test('keeps a nested child that has not sent anything at its inherited turn', () => {
		const parentSeed: Turn = {
			...sourceTurn,
			id: 'parent-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Parent prompt') },
		};
		const parentOwnTurns: Turn[] = Array.from({ length: 2 }, (_, index) => ({
			...sourceTurn,
			id: `parent-own-${index}`,
			message: { ...sourceTurn.message, text: `Parent follow up ${index}` },
		}));
		const turns = [sourceTurn, parentSeed, ...parentOwnTurns];
		const childSideChatBoundary = { inheritedTurnId: 'parent-own-1' };
		const visible = sliceSideChatTurns(turns, childSideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 4,
			visibleTurnIds: [],
		});
	});

	test('keeps the inherited turn of a nested child that already sent messages', () => {
		const parentSeed: Turn = {
			...sourceTurn,
			id: 'parent-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Parent prompt') },
		};
		const childSeed: Turn = {
			...sourceTurn,
			id: 'child-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Child prompt') },
		};
		const turns = [sourceTurn, parentSeed, { ...sourceTurn, id: 'parent-own' }, childSeed, { ...sourceTurn, id: 'child-own' }];
		const childSideChatBoundary = { inheritedTurnId: 'parent-own' };
		const visible = sliceSideChatTurns(turns, childSideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 3,
			visibleTurnIds: ['child-seed', 'child-own'],
		});
	});

	test('falls back to the last marker when the inherited turn is gone', () => {
		const childSeed: Turn = {
			...sourceTurn,
			id: 'child-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('Child prompt') },
		};
		const turns = [sourceTurn, childSeed, { ...sourceTurn, id: 'child-own' }];
		const childSideChatBoundary = { inheritedTurnId: 'removed-turn' };
		const visible = sliceSideChatTurns(turns, childSideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 1,
			visibleTurnIds: ['child-seed', 'child-own'],
		});
	});

	test('uses the inherited turn id when a new side chat has no seed yet', () => {
		const visible = sliceSideChatTurns([sourceTurn], sideChatBoundary);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary([sourceTurn], sideChatBoundary),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 1,
			visibleTurnIds: [],
		});
	});

	test('treats the transcript as inherited when there is no inherited turn id or seed', () => {
		const turns: Turn[] = Array.from({ length: 21 }, (_, index) => ({
			...sourceTurn,
			id: `source-${index}`,
			message: { ...sourceTurn.message, text: `source ${index}` },
		}));
		const sideChatBoundaryWithoutTurn = {};
		const visible = sliceSideChatTurns(turns, sideChatBoundaryWithoutTurn);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, sideChatBoundaryWithoutTurn),
			visibleTurnCount: visible.length,
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 21,
			visibleTurnCount: 0,
			visibleTurnIds: [],
		});
	});
});
