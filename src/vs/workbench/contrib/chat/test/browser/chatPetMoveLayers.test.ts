/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { findChatPetMove, getChatPetBuiltInMoves } from '../../browser/chatPetBuiltInMoves.js';
import { composeChatPetMove, readChatPetMove } from '../../browser/chatPetMoveLayers.js';
import { getChatPetMoveStillIndex } from '../../browser/chatPetMoves.js';

suite('ChatPetMoveLayers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('composes poses, expressions, props and text on one canvas, with the body at the bottom left', () => {
		const errors: string[] = [];
		const composed = composeChatPetMove({
			colors: { H: '#b65135', h: '#6f403b', W: '#74b4e0' },
			props: { hat: ['..HH..', '.HHHH.', 'hhhhhh'], drop: ['W', 'W', 'W'] },
			frames: [
				// A hat on the head instead of the antennae, and a drop falling behind the chat input.
				{ ms: 100, pose: 'crouch', eyes: 'happy', antennae: false, place: [{ prop: 'hat', x: 3, y: 4 }, { prop: 'drop', x: 13, y: 10 }] },
				{ ms: 200, pose: 'idle', eyes: 'x', recolor: { C: 'W' }, text: [{ text: 'ok', x: 12, y: -2, size: 'small', color: 'green' }] },
			],
		}, errors);

		assert.deepStrictEqual({
			errors,
			composed,
			// The love pose brings the red of its hearts, unless the move has its own.
			love: composeChatPetMove({ frames: [{ ms: 100, pose: 'love' }] }, [])?.colors,
			ownLove: composeChatPetMove({ colors: { R: '#ff0000' }, frames: [{ ms: 100, pose: 'love' }] }, [])?.colors,
			// Expressions stay on the body, even where the airborne pose is narrower than x eyes.
			airborneX: composeChatPetMove({ frames: [{ ms: 100, pose: 'airborne', eyes: 'x' }] }, [])?.frames[0].rows.slice(6, 9),
		}, {
			errors: [],
			composed: {
				frames: [{
					durationMs: 100,
					rows: [
						'....................',
						'....................',
						'....................',
						'....................',
						'....................',
						'....................',
						'.....HH.............',
						'....HHHH............',
						'...hhhhhh...........',
						'.BACCCCCCCC.........',
						'BAACCCCCCCCC........',
						'BAACCCCCCCCC........',
						'BAACEECCEECC.W......',
						'.BAAACCCCCC..W......',
					],
				}, {
					durationMs: 200,
					rows: [
						'.............30.3030',
						'............30.03132',
						'..A......A..31.13103',
						'...A....A...32.23130',
						'....A..A....33033232',
						'.....BA......33.3333',
						'....BAWW............',
						'...BAWWWW...........',
						'..BAWWWWWW..........',
						'.BAWWWWWWWW.........',
						'BAAEWEWWEWEW........',
						'BAAWEWWWWEWW........',
						'BAAEWEWWEWEW........',
						'.BAAAWWWWWW.........',
					],
				}],
				// The text's ramp takes letters the move doesn't use, and keeps reading left to right.
				colors: { '0': '#8be09a', '1': '#41bd6a', '2': '#23904a', '3': '#145a2e' },
				fixed: '0123',
			},
			love: { R: '#ed1c24' },
			ownLove: {},
			airborneX: ['.BAECECCECE.', '.BAAECCCCEC.', '..BEAECCEC..'],
		});
	});

	test('reports every mistake for the agent to fix', () => {
		const errors: string[] = [];
		const composed = composeChatPetMove({
			props: { cape: ['C C'], huge: Array.from({ length: 25 }, () => 'H') },
			frames: [
				{ ms: 100 },
				{ ms: 100, pose: 'jump' },
				{ ms: 100, pose: 'idle', eyes: 'sleepy' },
				{ ms: 100, pose: 'idle', recolor: { R: 'H' } },
				{ ms: 100, pose: 'idle', place: [{ prop: 'hat', x: 0, y: 0 }] },
				{ ms: 100, pose: 'idle', text: [{ text: 'HELLO WORLD!!', x: 0, y: 0 }, { text: 'HI~', x: 0, y: 0 }, { text: 'OK', x: 0, y: 0, color: 'teal' }, { text: 'GO', x: 20, y: 0 }, { text: 'UP', x: 0, y: -20 }, { text: 'NO', y: 1 }] },
				{ ms: 100, rows: ['..A..', '.B B.'] },
				{ ms: 100, pose: 'idle', place: Array.from({ length: 33 }, () => ({ prop: 'cape', x: 0, y: 0 })) },
				// Oversized rows are refused before they are padded into a canvas.
				{ ms: 100, rows: ['.'.repeat(30)] },
				// A single prop or text given as an object rather than a list is reported, not dropped.
				{ ms: 100, pose: 'idle', place: { prop: 'cape', x: 0, y: 0 }, text: { text: 'OK', x: 0, y: -8 } },
			],
		}, errors);
		const tooManyFrames: string[] = [];
		composeChatPetMove({ frames: Array.from({ length: 17 }, () => ({ ms: 100, pose: 'idle' })) }, tooManyFrames);

		assert.deepStrictEqual({ composed, errors, tooManyFrames }, {
			composed: undefined,
			errors: [
				'Prop "cape" must use "." for transparent pixels and letters or digits for colors.',
				'Prop "huge" must be a list of 1 to 24 rows of at most 24 pixels, such as ["..Y..", ".YYY."], with its colors in the move\'s "colors".',
				'Frame 1 needs a "pose" (idle, crouch, airborne, love) or "rows".',
				'Frame 2 needs a "pose" (idle, crouch, airborne, love) or "rows".',
				'Frame 3: "eyes" must be one of open, right, up, up-right, wide, happy, squint, x.',
				'Frame 4: "recolor" maps body letters (C, A, B or E) to other letters or digits, such as {"C": "Y"}.',
				'Frame 5 places "hat", which is not in "props".',
				'Frame 6: the text "HELLO WORLD!!" must be 1 to 12 characters.',
				'Frame 6: the text "HI~" can\'t use ~; the font has letters, digits, spaces and ! ? . , \' - + :',
				'Frame 6: the text color "teal" must be one of gold, red, pink, purple, blue, green, orange, brown, white, black.',
				'Frame 6: give "NO" a number x and y for its top-left pixel.',
				'Frame 6: "GO" is 12x7 pixels at x 20, y 0, so it goes past the canvas, which spans x 0 to 23 and y -12 to 11.',
				'Frame 6: "UP" is 12x7 pixels at x 0, y -20, so it goes past the canvas, which spans x 0 to 23 and y -12 to 11.',
				'Frame 7: rows must use "." for transparent pixels and letters or digits for colors.',
				'Frame 8 has 33 props and texts; the limit is 32.',
				'Frame 9: its rows are 30x1; draw at most 24x24.',
				'Frame 10: "place" must be a list.',
				'Frame 10: "text" must be a list.',
			],
			tooManyFrames: ['The move has 17 frames; the limit is 16.'],
		});
	});

	test('reads moves drawn in layers without writing them as text first', () => {
		const errors: string[] = [];
		const broken = readChatPetMove({ name: 'sign', colors: { 'Y\nname: hacked': '#ffffff' }, frames: [{ ms: -5, pose: 'idle' }] }, errors);
		const sign = readChatPetMove({ name: 'Sign Board', about: 'Fixes issue #42', loop: false, still: 1, frames: [{ ms: 100, pose: 'idle' }] }, []);

		assert.deepStrictEqual({
			broken,
			// A color letter can't add lines to the move, and a duration is checked as a duration.
			errors,
			sign: sign && { ...sign, frames: sign.frames.length },
		}, {
			broken: undefined,
			errors: [
				'Move "sign": "Y\nname: hacked=#ffffff" is not a color; use X=#rrggbb, where X is a letter or digit.',
				'Move "sign": Frame 1 lasts -5 ms; use 20 to 2000 ms.',
			],
			sign: { name: 'sign-board', about: 'Fixes issue #42', loop: false, still: 0, colors: {}, fixed: '', frames: 1 },
		});
	});

	test('the examples are moves the pet knows out of the box', () => {
		const moves = getChatPetBuiltInMoves();
		const yes = moves[0];
		const taughtYes = { ...yes, about: 'Taught.' };

		assert.deepStrictEqual({
			names: moves.map(move => move.name),
			// A taught move replaces the built-in move with its name.
			found: [findChatPetMove([taughtYes], 'yes')?.about, findChatPetMove([taughtYes], 'trophy')?.name, findChatPetMove([taughtYes], 'moonwalk')],
			// The big font on its still frame, shaded like the body: highlight 0, base 1, shadow 2 and edge 3.
			yes: yes.frames[getChatPetMoveStillIndex(yes)].rows.slice(0, 9),
		}, {
			names: ['yes', 'idea', 'ship-it', 'cowboy', 'rubber-duck', 'magic', 'trophy', 'debug', 'coffee', 'zapped'],
			found: ['Taught.', 'trophy', undefined],
			yes: [
				'......................',
				'300.300300000.30000300',
				'321.312311333301333311',
				'332002331100.33200.311',
				'.33113.31133..33310322',
				'..311..311......312333',
				'..322..322000300023300',
				'..333..33333333333.333',
				'......................',
			],
		});
	});
});
