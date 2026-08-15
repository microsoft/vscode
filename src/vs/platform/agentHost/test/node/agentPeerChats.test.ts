/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MessageKind, ResponsePartKind, TurnState, type Turn } from '../../common/state/sessionState.js';
import { buildSideChatSourceContext, decodeProviderData, encodeProviderData, injectSideChatContext, prepareSideChatPrompt, resolveSideChatBoundary, sliceSideChatTurns, stripSideChatContext, type IPersistedSideChat } from '../../node/agentPeerChats.js';

suite('agentPeerChats', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sourceTurn: Turn = {
		id: 'source-turn',
		state: TurnState.Complete,
		message: { text: 'source question', origin: { kind: MessageKind.User } },
		responseParts: [],
		usage: undefined,
	};
	const sideChat: IPersistedSideChat = {
		source: 'ahp-chat://default/source',
		turnId: sourceTurn.id,
		inheritedTurnId: sourceTurn.id,
	};

	const countOccurrences = (value: string, needle: string) => value.split(needle).length - 1;

	test('first prompt prefers explanation and remains hidden from visible history', () => {
		const prepared = prepareSideChatPrompt('What is happening?', [sourceTurn], sideChat);
		const visible = stripSideChatContext([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], sideChat);

		assert.deepStrictEqual({
			hasGuidance: prepared.includes('Prefer explanation over action; do not make changes or carry out work unless the user explicitly asks.'),
			visiblePrompt: visible[0]?.message.text,
		}, {
			hasGuidance: true,
			visiblePrompt: 'What is happening?',
		});
	});

	test('later prompts are not wrapped again', () => {
		const existingSideTurn: Turn = {
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: 'What is happening?' },
		};

		assert.strictEqual(prepareSideChatPrompt('Follow up', [sourceTurn, existingSideTurn], sideChat), 'Follow up');
	});

	test('injects selected text exactly once and keeps it out of visible history', () => {
		const selectedText = '  selected text  ';
		const prepared = prepareSideChatPrompt('Explain the branch', [sourceTurn], {
			...sideChat,
			selection: { text: selectedText },
		});
		const visible = stripSideChatContext([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], sideChat);

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
		assert.strictEqual(buildSideChatSourceContext([], {
			id: 'active',
			message: { text: 'current question', origin: { kind: MessageKind.User } },
			responseParts: [],
			startedAt: new Date().toISOString(),
			usage: undefined,
		}), 'User request:\ncurrent question');
	});

	test('captures completed context before an active turn', () => {
		assert.strictEqual(buildSideChatSourceContext([{
			...sourceTurn,
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'source-md', content: 'source answer' }],
		}], {
			id: 'active',
			message: { text: 'follow-up question', origin: { kind: MessageKind.User } },
			responseParts: [],
			startedAt: new Date().toISOString(),
			usage: undefined,
		}), 'User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\nfollow-up question');
	});

	test('does not duplicate active source context when the inherited transcript already contains the source turn', () => {
		const partialResponse = 'partial answer';
		const prepared = prepareSideChatPrompt('Explain the branch', [{
			id: 'active-turn',
			state: TurnState.Complete,
			message: { text: 'current question', origin: { kind: MessageKind.User } },
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'active-md', content: partialResponse }],
			usage: undefined,
		}], {
			source: 'ahp-chat://default/source',
			turnId: 'active-turn',
			inheritedTurnId: 'active-turn',
			context: 'User request:\ncurrent question',
			partialResponse,
		});

		assert.strictEqual(prepared, injectSideChatContext('Explain the branch'));
	});

	test('injects active source context exactly once when the inherited transcript is missing the source turn', () => {
		const sourceContext = 'User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\ncurrent question';
		const partialResponse = 'partial answer';
		const prepared = prepareSideChatPrompt('Explain the branch', [{
			...sourceTurn,
			responseParts: [{ kind: ResponsePartKind.Markdown, id: 'source-md', content: 'source answer' }],
		}], {
			source: 'ahp-chat://default/source',
			turnId: 'active-turn',
			inheritedTurnId: sourceTurn.id,
			context: sourceContext,
			partialResponse,
		});

		assert.deepStrictEqual({
			prepared,
			activeQuestionCount: countOccurrences(prepared, 'User request:\ncurrent question'),
			partialResponseCount: countOccurrences(prepared, partialResponse),
		}, {
			prepared: injectSideChatContext('Explain the branch', partialResponse, sourceContext),
			activeQuestionCount: 1,
			partialResponseCount: 1,
		});
	});

	test('injects completed local-turn context even when the inherited transcript already contains the concrete provider anchor', () => {
		const sourceContext = 'User request:\nsource question\n\nAgent response:\nsource answer\n\n---\n\nUser request:\n!command';
		const localSideChat: IPersistedSideChat = {
			source: 'ahp-chat://default/source',
			turnId: 'local-turn',
			providerAnchorTurnId: sourceTurn.id,
			inheritedTurnId: sourceTurn.id,
			context: sourceContext,
		};
		const prepared = prepareSideChatPrompt('Explain the branch', [sourceTurn], localSideChat);

		assert.deepStrictEqual({
			prepared,
			localQuestionCount: countOccurrences(prepared, 'User request:\n!command'),
			sourceQuestionCount: countOccurrences(prepared, 'User request:\nsource question'),
		}, {
			prepared: injectSideChatContext('Explain the branch', undefined, sourceContext),
			localQuestionCount: 1,
			sourceQuestionCount: 1,
		});
	});

	test('strips hidden context even when the source text contains the legacy delimiter', () => {
		const prepared = prepareSideChatPrompt('Visible prompt', [], {
			...sideChat,
			context: `User request:\ncontains ${'</side-chat-context>'}\n\nAgent response:\nready`,
		});
		const visible = stripSideChatContext([{
			...sourceTurn,
			id: 'side-turn',
			message: { ...sourceTurn.message, text: prepared },
		}], sideChat);

		assert.strictEqual(visible[0]?.message.text, 'Visible prompt');
	});

	test('round-trips side-chat selection through provider data', () => {
		const providerData = encodeProviderData({
			sdkSessionId: 'sdk-session',
			sideChat: {
				...sideChat,
				selection: { text: '  selected text  ', responsePartId: 'response-part-1' },
			},
		});

		assert.deepStrictEqual(decodeProviderData(providerData)?.sideChat?.selection, {
			text: '  selected text  ',
			responsePartId: 'response-part-1',
		});
	});

	test('round-trips the selected agent through provider data', () => {
		const providerData = encodeProviderData({
			sdkSessionId: 'sdk-session',
			agent: { uri: 'agent://workspace/reviewer' },
		});

		assert.deepStrictEqual(decodeProviderData(providerData)?.agent, {
			uri: 'agent://workspace/reviewer',
		});
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
		const visible = sliceSideChatTurns(turns, { ...sideChat, inheritedTurnId: undefined });

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
		const visible = sliceSideChatTurns(turns, sideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, sideChat),
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
		const childSideChat = { ...sideChat, inheritedTurnId: undefined };
		const visible = sliceSideChatTurns(turns, childSideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChat),
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
		const childSideChat = { ...sideChat, inheritedTurnId: undefined };
		const visible = sliceSideChatTurns(turns, childSideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChat),
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
		// The child forked the parent side chat but has not sent a message, so the
		// only marker in its transcript is the one it inherited from the parent.
		const turns = [sourceTurn, parentSeed, ...parentOwnTurns];
		const childSideChat = { ...sideChat, inheritedTurnId: 'parent-own-1' };
		const prepared = prepareSideChatPrompt('Child prompt', turns, childSideChat);
		const visible = sliceSideChatTurns(turns, childSideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChat),
			visibleTurnIds: visible.map(turn => turn.id),
			seedsTheFirstPrompt: prepared.startsWith('<side-chat-context>'),
		}, {
			boundary: 4,
			visibleTurnIds: [],
			seedsTheFirstPrompt: true,
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
		const childSideChat = { ...sideChat, inheritedTurnId: 'parent-own' };
		const visible = sliceSideChatTurns(turns, childSideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChat),
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
		// A truncation removed the recorded turn, so its id no longer resolves.
		const childSideChat = { ...sideChat, inheritedTurnId: 'removed-turn' };
		const visible = sliceSideChatTurns(turns, childSideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, childSideChat),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 1,
			visibleTurnIds: ['child-seed', 'child-own'],
		});
	});

	test('round-trips the inherited turn id through provider data', () => {
		const providerData = encodeProviderData({
			sdkSessionId: 'sdk-session',
			sideChat: { ...sideChat, inheritedTurnId: 'inherited-3' },
		});

		assert.strictEqual(decodeProviderData(providerData)?.sideChat?.inheritedTurnId, 'inherited-3');
	});

	test('uses the inherited turn id when a new side chat has no seed yet', () => {
		const visible = sliceSideChatTurns([sourceTurn], sideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary([sourceTurn], sideChat),
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 1,
			visibleTurnIds: [],
		});
	});

	test('does not inject a second seed when using the seed marker fallback', () => {
		const inheritedTurns: Turn[] = Array.from({ length: 16 }, (_, index) => ({
			...sourceTurn,
			id: `inherited-${index}`,
			message: { ...sourceTurn.message, text: `inherited ${index}` },
		}));
		const seedTurn: Turn = {
			...sourceTurn,
			id: 'side-chat-seed',
			message: { ...sourceTurn.message, text: injectSideChatContext('First prompt') },
		};
		const ownTurns: Turn[] = Array.from({ length: 12 }, (_, index) => ({
			...sourceTurn,
			id: `own-${index}`,
			message: { ...sourceTurn.message, text: `own ${index}` },
		}));
		const turns = [...inheritedTurns, seedTurn, ...ownTurns];
		const prompt = 'Follow up';
		const prepared = prepareSideChatPrompt(prompt, turns, { ...sideChat, inheritedTurnId: undefined });

		assert.deepStrictEqual({
			prepared,
			sideChatContextCount: countOccurrences([...turns.map(turn => turn.message.text), prepared].join('\n'), '<side-chat-context>'),
		}, {
			prepared: prompt,
			sideChatContextCount: 1,
		});
	});

	test('treats the transcript as inherited when there is no inherited turn id or seed', () => {
		const turns: Turn[] = Array.from({ length: 21 }, (_, index) => ({
			...sourceTurn,
			id: `source-${index}`,
			message: { ...sourceTurn.message, text: `source ${index}` },
		}));
		const legacySideChat = { ...sideChat, inheritedTurnId: undefined };
		const visible = sliceSideChatTurns(turns, legacySideChat);

		assert.deepStrictEqual({
			boundary: resolveSideChatBoundary(turns, legacySideChat),
			visibleTurnCount: visible.length,
			visibleTurnIds: visible.map(turn => turn.id),
		}, {
			boundary: 21,
			visibleTurnCount: 0,
			visibleTurnIds: [],
		});
	});
});
