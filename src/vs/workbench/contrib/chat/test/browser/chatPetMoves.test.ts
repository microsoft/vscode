/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPetMovePoses, getChatPetMoveFacingRows, getChatPetMovePalette, getChatPetMoveStillIndex, IChatPetMove, parseChatPetMove, serializeChatPetMove, validateChatPetMove } from '../../browser/chatPetMoves.js';

const idle = ChatPetMovePoses.idle.join('\n');

function moveText(header: string, ...frames: [number, readonly string[]][]): string {
	return [header, ...frames.map(([durationMs, rows]) => `frame ${durationMs}\n${rows.join('\n')}`)].join('\n\n');
}

function withRow(rows: readonly string[], index: number, row: string): string[] {
	const result = [...rows];
	result[index] = row;
	return result;
}

suite('ChatPetMoves', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the pet studio format, including comments, and round-trips it', () => {
		const text = [
			'# A salute with a readable sign.',
			'name: yes-sir  # the name',
			'about: Salutes.',
			'loop: no            # plays once',
			'still: 2',
			'colors: Y=#FFD700, W=#ffffff',
			'fixed: Y',
			'',
			`frame 120 ms\n${idle}`,
			`frame 400\n${idle}`,
		].join('\n');
		const move = parseChatPetMove(text);
		assert.deepStrictEqual({ ...move, frames: move.frames.map(frame => frame.durationMs) }, {
			name: 'yes-sir',
			about: 'Salutes.',
			loop: false,
			still: 1,
			colors: { Y: '#ffd700', W: '#ffffff' },
			fixed: 'Y',
			frames: [120, 400],
		});
		assert.deepStrictEqual(parseChatPetMove(serializeChatPetMove(move)), move);
	});

	test('reports syntax errors with their line and cuts long descriptions', () => {
		const syntaxError = (text: string) => {
			try {
				parseChatPetMove(text);
				return undefined;
			} catch (error) {
				return error.message;
			}
		};
		assert.deepStrictEqual({
			errors: [
				syntaxError('name: a\nloop: maybe'),
				// Only yes, no and their synonyms, not what every object has.
				syntaxError('loop: constructor'),
				syntaxError('still: two'),
				syntaxError('colors: Y=gold'),
				syntaxError('\nspeed: 3'),
				syntaxError('just some text'),
				syntaxError(`name: ok\n\nframe 100\n${idle}`),
			],
			// Agents read descriptions back, so they stay short.
			aboutLength: parseChatPetMove(`name: ok\nabout: ${'x'.repeat(300)}`).about.length,
			// Descriptions are prose, where # is no comment.
			about: parseChatPetMove('name: ok\nabout: Fixes issue #42 # and more').about,
		}, {
			errors: [
				'Line 2: loop must be yes or no.',
				'Line 1: loop must be yes or no.',
				'Line 1: still must be a frame number.',
				'Line 1: "Y=gold" is not a color; use X=#rrggbb.',
				'Line 2: unknown header "speed"; use name, about, loop, still, colors or fixed.',
				'Line 1: expected "key: value" or "frame <ms>".',
				undefined,
			],
			aboutLength: 200,
			about: 'Fixes issue #42 # and more',
		});
	});

	test('validates names, letters, sizes and timing', () => {
		const errors = (text: string) => validateChatPetMove(parseChatPetMove(text)).errors.length;
		const small = ChatPetMovePoses.idle.slice(1);
		assert.deepStrictEqual({
			valid: errors(moveText('name: my-wave', [100, ChatPetMovePoses.idle])),
			badName: errors(moveText('name: My Wave', [100, ChatPetMovePoses.idle])),
			// Names are as `toChatPetMoveName` writes them, so the pet finds every move by its name.
			unfindableNames: ['wave-', 'yes--sir', 'x'].map(name => errors(moveText(`name: ${name}`, [100, ChatPetMovePoses.idle]))),
			badColors: validateChatPetMove({ ...parseChatPetMove(moveText('name: my-wave', [100, ChatPetMovePoses.idle])), colors: { Y: 'gold', '@': '#ffffff' } }).errors,
			reservedName: errors(moveText('name: jump', [100, ChatPetMovePoses.idle])),
			formerCommandName: errors(moveText('name: help', [100, ChatPetMovePoses.idle])),
			undeclaredLetter: errors(moveText('name: my-wave', [100, withRow(ChatPetMovePoses.idle, 0, '..A......AZ.')])),
			fixedWithoutColor: errors(moveText('name: my-wave\nfixed: Y', [100, ChatPetMovePoses.idle])),
			reservedColorLetter: errors(moveText('name: my-wave\ncolors: C=#ffffff', [100, ChatPetMovePoses.idle])),
			tooSmall: errors(moveText('name: my-wave', [100, small])),
			tooShort: errors(moveText('name: my-wave', [10, ChatPetMovePoses.idle])),
			// One error, rather than one for every frame of a long paste.
			tooManyFrames: errors(moveText('name: my-wave', ...Array.from({ length: 40 }, () => [1, ChatPetMovePoses.idle.slice(1)] as [number, readonly string[]]))),
			tooLong: errors(moveText('name: my-wave', [2_000, ChatPetMovePoses.idle], [2_000, ChatPetMovePoses.crouch], [2_000, ChatPetMovePoses.idle])),
			stillOutOfRange: errors(moveText('name: my-wave\nstill: 3', [100, ChatPetMovePoses.idle])),
			noFrames: errors('name: my-wave'),
			// Under the text limit as written, but not once stored with its default headers.
			tooLongStored: validateChatPetMove({ ...parseChatPetMove(moveText('name: my-wave', [100, ChatPetMovePoses.idle])), about: 'x'.repeat(16_384) }).errors.length,
		}, {
			valid: 0,
			badName: 1,
			unfindableNames: [1, 1, 1],
			badColors: [
				'"Y=gold" is not a color; use X=#rrggbb, where X is a letter or digit.',
				'"@=#ffffff" is not a color; use X=#rrggbb, where X is a letter or digit.',
			],
			reservedName: 1,
			formerCommandName: 0,
			undeclaredLetter: 1,
			fixedWithoutColor: 1,
			reservedColorLetter: 1,
			tooSmall: 1,
			tooShort: 1,
			tooManyFrames: 1,
			tooLong: 1,
			stillOutOfRange: 1,
			noFrames: 1,
			tooLongStored: 1,
		});
	});

	test('accepts the moves shared by pet studio', () => {
		const lgtm = parseChatPetMove(moveText(
			'name: lgtm\nabout: Approves your pull request.\nloop: no\ncolors: G=#89d185 W=#ffffff\nfixed: G W',
			[150, ['............', '............', '............', '............', ...ChatPetMovePoses.idle]],
			[500, ['........GG..', '.......GG...', '...GG.GG..W.', '....GGG.....', ...ChatPetMovePoses.idle]],
			[150, ['............', '............', '............', '............', ...ChatPetMovePoses.idle]],
		));
		assert.deepStrictEqual(validateChatPetMove(lgtm), { errors: [] });
	});

	test('keeps fixed letters readable when the pet faces left', () => {
		const rows = [
			'GG.C',
			'G..A',
		];
		assert.deepStrictEqual({
			right: getChatPetMoveFacingRows(rows, 'G', 'right'),
			left: getChatPetMoveFacingRows(rows, 'G', 'left'),
			mirroredOnly: getChatPetMoveFacingRows(rows, '', 'left'),
			// A sign's backdrop stays whole around its letters.
			sign: getChatPetMoveFacingRows(['WYYWW', 'WWWYW'], 'Y', 'left'),
			// Separate words each keep their orientation in their mirrored place, and the body between them stays whole.
			words: getChatPetMoveFacingRows(['GH......', '........', 'CCAB..HG'], 'GH', 'left'),
		}, {
			right: ['GG.C', 'G..A'],
			left: ['C.GG', 'A.G.'],
			mirroredOnly: ['C.GG', 'A..G'],
			sign: ['WYYWW', 'WWWYW'],
			words: ['......GH', '........', 'HG..BACC'],
		});
	});

	test('chooses the still frame and maps colors per colorway', () => {
		const move: IChatPetMove = parseChatPetMove(moveText('name: my-move\ncolors: Y=#ffd700', [100, ChatPetMovePoses.idle], [300, ChatPetMovePoses.crouch], [300, ChatPetMovePoses.idle]));
		const stable = getChatPetMovePalette(move, 'stable');
		const insiders = getChatPetMovePalette(move, 'insiders');
		assert.deepStrictEqual({
			still: getChatPetMoveStillIndex(move),
			explicitStill: getChatPetMoveStillIndex({ ...move, still: 0 }),
			stable: ['.', 'C', 'A', 'B', 'E', 'Y'].map(stable),
			insiders: ['C', 'Y'].map(insiders),
		}, {
			still: 2,
			explicitStill: 0,
			stable: [undefined, '#23a8f2', '#0077b8', '#004e7c', '#191a1b', '#ffd700'],
			insiders: ['#24bfa5', '#ffd700'],
		});
	});

	test('reference poses match the real pet sprites', async () => {
		const decode = async (file: string, frameIndex: number, frameWidth: number) => {
			// Decode from bytes: an image loaded from its file URL would taint the canvas.
			const response = await fetch(FileAccess.asBrowserUri(`vs/workbench/contrib/chat/browser/widget/media/chatPet/${file}`).toString(true));
			const image = await mainWindow.createImageBitmap(await response.blob());
			const canvas = mainWindow.document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d', { willReadFrequently: true })!;
			context.drawImage(image, 0, 0);
			image.close();
			const palette: Record<string, string> = { '23a8f2': 'C', '0077b8': 'A', '004e7c': 'B', '191a1b': 'E', 'ed1c24': 'R' };
			const rows: string[] = [];
			for (let y = 0; y < 12; y++) {
				let row = '';
				for (let x = 0; x < 12; x++) {
					const [r, g, b, a] = context.getImageData(frameIndex * frameWidth + x * 8 + 4, y * 8 + 4, 1, 1).data;
					row += a < 128 ? '.' : palette[[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')] ?? '?';
				}
				rows.push(row);
			}
			return rows;
		};
		// Love draws its eyes at runtime (the DOM eye layer), so its sprite has empty sockets.
		const withRuntimeEyes = (rows: string[]) => rows.map((row, y) => y === 8 || y === 9 ? `${row.slice(0, 5)}E${row.slice(6, 8)}E${row.slice(9)}` : row);
		assert.deepStrictEqual({
			idle: await decode('buddy-idle-stable-96.png', 0, 96),
			crouch: await decode('buddy-jump-stable-96.spritesheet.png', 1, 96),
			airborne: await decode('buddy-jump-stable-96.spritesheet.png', 3, 96),
			love: withRuntimeEyes(await decode('buddy-love-stable-96.spritesheet.png', 5, 96)),
		}, {
			idle: [...ChatPetMovePoses.idle],
			crouch: [...ChatPetMovePoses.crouch],
			airborne: [...ChatPetMovePoses.airborne],
			love: [...ChatPetMovePoses.love],
		});
	});
});
