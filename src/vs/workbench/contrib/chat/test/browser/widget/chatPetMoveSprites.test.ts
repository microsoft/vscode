/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatPetMovePoses, parseChatPetMove } from '../../../browser/chatPetMoves.js';
import { getChatPetMovePlaybackDuration, renderChatPetMovePreview, renderChatPetMoveSheets } from '../../../browser/widget/chatPetMoveSprites.js';

/** Reads a sheet back as move rows (one letter per 8 x 8 logical pixel). */
async function readSheet(url: string, letters: Record<string, string>): Promise<{ width: number; height: number; rows: string[] }> {
	const image = await mainWindow.createImageBitmap(await (await fetch(url)).blob());
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(image, 0, 0);
	image.close();
	const rows: string[] = [];
	for (let y = 0; y < canvas.height / 8; y++) {
		let row = '';
		for (let x = 0; x < canvas.width / 8; x++) {
			const [r, g, b, a] = context.getImageData(x * 8 + 4, y * 8 + 4, 1, 1).data;
			row += a === 0 ? '.' : letters[[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')] ?? '?';
		}
		rows.push(row);
	}
	return { width: canvas.width, height: canvas.height, rows };
}

/** Reads a PNG's size and its `#rrggbb` colors at some points. */
async function readPicture(picture: VSBuffer, points: Record<string, readonly [number, number]>): Promise<{ size: number[]; colors: Record<string, string> }> {
	const image = await mainWindow.createImageBitmap(new Blob([picture.buffer.slice()], { type: 'image/png' }));
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(image, 0, 0);
	image.close();
	const colors: Record<string, string> = {};
	for (const [name, [x, y]] of Object.entries(points)) {
		colors[name] = `#${[...context.getImageData(x, y, 1, 1).data.slice(0, 3)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
	}
	return { size: [canvas.width, canvas.height], colors };
}

suite('ChatPetMoveSprites', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// A one-shot salute: the idle body with a two-letter sign beside the head, then a crouch.
	const move = parseChatPetMove([
		'name: yes-sir',
		'loop: no',
		'colors: Y=#ffe780 W=#ffffff',
		'fixed: YW',
		'',
		'frame 100',
		...ChatPetMovePoses.idle.map((row, y) => row + (y === 0 ? 'YW' : '..')),
		'',
		'frame 300',
		...ChatPetMovePoses.crouch.map(row => row + '..'),
	].join('\n'));
	const letters = { '23a8f2': 'C', '0077b8': 'A', '004e7c': 'B', '24bfa5': 'c', '191a1b': 'E', 'ffe780': 'Y', 'ffffff': 'W' };

	test('draws every frame side by side and a still frame, with fixed letters readable when facing left', async () => {
		const right = renderChatPetMoveSheets(move, 'stable', 'right');
		const left = renderChatPetMoveSheets(move, 'stable', 'left');
		const insiders = renderChatPetMoveSheets(move, 'insiders', 'right');
		const rightSheet = await readSheet(right.animated.url, letters);
		const leftSheet = await readSheet(left.animated.url, letters);
		const still = await readSheet(right.reducedMotion.url, letters);
		const insidersSheet = await readSheet(insiders.animated.url, letters);

		assert.deepStrictEqual({
			frame: [right.animated.frameWidth, right.animated.frameHeight, right.animated.frameDurations],
			iterations: [right.animated.iterations, renderChatPetMoveSheets({ ...move, loop: true }, 'stable', 'right').animated.iterations, right.reducedMotion.iterations],
			sheet: [rightSheet.width, rightSheet.height],
			still: [still.width, still.height, still.rows[11]],
			rightFirstRow: rightSheet.rows[0],
			leftFirstRow: leftSheet.rows[0],
			rightEyes: rightSheet.rows[8].slice(0, 14),
			leftEyes: leftSheet.rows[8].slice(0, 14),
			insidersLight: insidersSheet.rows[8][3],
			playback: getChatPetMovePlaybackDuration(move),
			loopPlayback: [getChatPetMovePlaybackDuration({ ...move, loop: true }), getChatPetMovePlaybackDuration({ ...move, loop: true, frames: move.frames.map(frame => ({ ...frame, durationMs: 1_500 })) })],
		}, {
			frame: [112, 96, [100, 300]],
			iterations: [1, Infinity, 1],
			sheet: [224, 96],
			// The still frame is the longest one, the crouch.
			still: [112, 96, '.BAAACCCCCC...'],
			rightFirstRow: '..A......A..YW' + '..............',
			// Mirrored, with the sign still reading left to right.
			leftFirstRow: 'YW..A......A..' + '..............',
			rightEyes: 'BAACCECCECCC..',
			leftEyes: '..CCCECCECCAAB',
			insidersLight: 'c',
			playback: 400,
			loopPlayback: [2_000, 4_000],
		});
	});

	test('previews frames side by side, standing on the chat input in a dark and a light theme', async () => {
		const preview = renderChatPetMovePreview(move.frames.map((_, index) => ({ label: `${index + 1}`, move, frameIndex: index })), 'stable')!;

		// Frames are 14x12 logical pixels of 6x6, with a pixel of margin around them, under a label.
		assert.deepStrictEqual(await readPicture(preview, {
			around: [2, 2],
			darkTheme: [10, 26],
			darkFloor: [10, 102],
			darkEye: [46, 80],
			sign: [88, 32],
			lightTheme: [10, 110],
			lightFloor: [10, 186],
			lightEye: [46, 164],
			crouchEye: [150, 86],
		}), {
			size: [216, 200],
			colors: {
				around: '#6b6b6b',
				darkTheme: '#1f1f1f',
				darkFloor: '#3c3c3c',
				darkEye: '#191a1b',
				sign: '#ffe780',
				lightTheme: '#ffffff',
				lightFloor: '#d4d4d4',
				lightEye: '#191a1b',
				crouchEye: '#191a1b',
			},
		});
	});
});
