/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createChatPetMoveTemplate, findChatPetDocumentMoveLine, parseChatPetDocument, readChatPetSharedMove, serializeChatPetDocument } from '../../browser/chatPetDocument.js';
import { ChatPetMovePoses, IChatPetMove, parseChatPetMove, serializeChatPetMove } from '../../browser/chatPetMoves.js';
import { IChatPetReactionInput } from '../../browser/chatPetReactions.js';

function move(name: string, about = ''): IChatPetMove {
	return parseChatPetMove(`name: ${name}\n${about ? `about: ${about}\n` : ''}loop: no\ncolors: Y=#ffe780\nfixed: Y\n\nframe 200\n${ChatPetMovePoses.idle.map(row => `${row}Y`).join('\n')}\n`);
}

suite('ChatPetDocument', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips moves and reactions through pets.md', () => {
		const moves = [move('yes-sir', 'Salutes with a gold YES!'), move('wave')];
		const reactions: IChatPetReactionInput[] = [
			{ trigger: 'message', when: 'when I tell you to execute the plan', phrases: ['do it', 'go ahead'], play: 'yes-sir', enabled: true },
			{ trigger: 'click', when: '', phrases: [], play: 'wave', enabled: false },
			{ trigger: 'message', when: '', phrases: ['howdy'], play: 'cowboy', enabled: true },
		];
		const text = serializeChatPetDocument(moves, reactions);
		const parsed = parseChatPetDocument(text);
		assert.deepStrictEqual({
			errors: parsed.errors,
			moves: parsed.moves.map(serializeChatPetMove),
			reactions: parsed.reactions,
			// Blocks are fenced as pet, so the file reads as markdown and moves can be copied out whole.
			blocks: text.split('\n').filter(line => line === '```pet').length,
			// Only a reaction turned off says so.
			enabledLines: text.split('\n').filter(line => line.startsWith('enabled:')),
			revealLine: text.split('\n')[findChatPetDocumentMoveLine(text, 'wave')! - 1],
			unknownReveal: findChatPetDocumentMoveLine(text, 'nope'),
		}, {
			errors: [],
			moves: moves.map(serializeChatPetMove),
			reactions,
			blocks: 5,
			enabledLines: ['enabled: no'],
			revealLine: 'name: wave',
			unknownReveal: undefined,
		});
	});

	test('reads what a user writes by hand, forgivingly', () => {
		const text = [
			'# My pet',
			'Some notes that are not kept.',
			'```',
			'# a move pasted into a plain block still counts',
			serializeChatPetMove(move('bow')).trim(),
			'```',
			'```json',
			'{ "not": "a pet block" }',
			'```',
			'```pet',
			'Play: BOW',
			'Trigger: Click',
			'Enabled: Off',
			'```',
			'```pet',
			'play: bow',
			'phrases: Hello!, hi there,, ',
			'phrases: good morning',
			'when: when I greet you',
			'```',
		].join('\n');
		const parsed = parseChatPetDocument(text);
		assert.deepStrictEqual({ errors: parsed.errors, moves: parsed.moves.map(move => move.name), reactions: parsed.reactions }, {
			errors: [],
			moves: ['bow'],
			reactions: [
				{ trigger: 'click', when: '', phrases: [], play: 'bow', enabled: false },
				{ trigger: 'message', when: 'when I greet you', phrases: ['hello', 'hi there', 'good morning'], play: 'bow', enabled: true },
			],
		});
	});

	test('reports every mistake with its line, and keeps nothing until they are fixed', () => {
		const head = [
			'## Reactions',
			'```pet',
			'play: moonwalk',
			'phrases: slide',
			'```',
			'```pet',
			'play: love',
			'trigger: hover',
			'chance: 30%',
			'enabled: maybe',
			'phrases: ',
			'```',
			'```pet',
			'# nothing here yet',
			'```',
			'## Moves',
		];
		const bow = ['```pet', ...serializeChatPetMove(move('bow')).trim().split('\n'), '```'];
		const duplicateLine = head.length + bow.length + 1;
		const badNameLine = duplicateLine + bow.length;
		const text = [...head, ...bow, ...bow, '```pet', 'name: Bad Name', 'frame 100', ...ChatPetMovePoses.idle, '```'].join('\n');
		const parsed = parseChatPetDocument(text);
		assert.deepStrictEqual({ moves: parsed.moves.map(move => move.name), reactions: parsed.reactions.length, errors: parsed.errors }, {
			moves: ['bow'],
			reactions: 0,
			errors: [
				'Line 8: trigger must be message or one of click, requestDone, confirmation, dizzy, sleep, typing, responding, not "hover".',
				// Reactions have no chance: a phrase alone always plays, and one of several matches plays at random.
				'Line 9: unknown reaction header "chance"; use play, trigger, phrases, when or enabled.',
				'Line 10: enabled must be yes or no, not "maybe".',
				'Line 13: The pet block is empty; write a move or a reaction in it, or delete it.',
				`Line ${duplicateLine}: There is already a move called "bow" above.`,
				`Line ${badNameLine}: Move "Bad Name": The name "Bad Name" must be 2 to 31 lowercase letters and digits, starting with a letter, with single dashes between words.`,
				// Reactions are checked once every move is known, so they may play moves written below them.
				'Line 2: The pet doesn\'t know a move called "moonwalk" yet.',
			],
		});
	});

	test('reads a move shared as text, bare or in a fenced block', () => {
		const bow = serializeChatPetMove(move('bow'));
		const read = (text: string) => { const result = readChatPetSharedMove(text); return result.move ? serializeChatPetMove(result.move) : result.error; };
		assert.deepStrictEqual({
			bare: read(bow) === bow,
			fenced: read(`Here is my move:\n\n\`\`\`pet\n${bow}\`\`\`\n`) === bow,
			plainFence: read(`\`\`\`\n${bow}\`\`\``) === bow,
			empty: read('  \n'),
			notAMove: read('hello there'),
			reaction: read('play: bow\ntrigger: click'),
		}, {
			bare: true,
			fenced: true,
			plainFence: true,
			empty: 'There is no move in the text; copy one as text first.',
			notAMove: 'Move "": Line 1: expected "key: value" or "frame <ms>".',
			reaction: 'Move "": Line 1: unknown header "play"; use name, about, loop, still, colors or fixed.',
		});
	});

	test('offers a template under a name no move has', () => {
		const template = createChatPetMoveTemplate(['new-move', 'new-move-2']);
		const parsed = parseChatPetDocument(`\`\`\`pet\n${serializeChatPetMove(template)}\`\`\`\n`);
		assert.deepStrictEqual({ name: template.name, errors: parsed.errors, frames: parsed.moves[0]?.frames.length, first: createChatPetMoveTemplate([]).name }, {
			name: 'new-move-3',
			errors: [],
			frames: 2,
			first: 'new-move',
		});
	});
});
