/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { CHAT_PET_MOVE_CELL_SIZE, getChatPetMoveDuration, getChatPetMoveFacingRows, getChatPetMovePalette, getChatPetMoveStillIndex, IChatPetMove } from '../chatPetMoves.js';

const MAX_LOOP_PLAYBACK_DURATION = 4_000;
const MIN_LOOP_PLAYBACK_DURATION = 2_000;

/** How long a taught move plays as a reaction: once for one-shot moves, a couple of loops (at most 4 s) for looping ones. */
export function getChatPetMovePlaybackDuration(move: IChatPetMove): number {
	const total = getChatPetMoveDuration(move);
	return move.loop ? Math.min(MAX_LOOP_PLAYBACK_DURATION, Math.max(MIN_LOOP_PLAYBACK_DURATION, total * 2)) : total;
}

/** Paints move rows with their top-left pixel at `left`, `top`, one square of `size` per letter. */
function paintChatPetRows(context: CanvasRenderingContext2D, rows: readonly string[], palette: (letter: string) => string | undefined, left: number, top: number, size: number): void {
	rows.forEach((row, y) => {
		for (let x = 0; x < row.length; x++) {
			const color = palette(row[x]);
			if (color) {
				context.fillStyle = color;
				context.fillRect(left + x * size, top + y * size, size, size);
			}
		}
	});
}

/**
 * Draws a move's sprite sheets for a colorway and facing direction, as the pet plays its own: every
 * frame side by side, and the reduced-motion frame alone. The left-facing sheets are already
 * mirrored, with fixed-orientation letters kept readable, so the runtime must not mirror them again.
 * The canvas belongs to the main window: auxiliary windows can't create elements, and the sheets
 * are only data URLs.
 */
export function renderChatPetMoveSheets(move: IChatPetMove, variant: 'stable' | 'insiders', facing: 'left' | 'right') {
	const frameWidth = (move.frames[0]?.rows[0]?.length ?? 0) * CHAT_PET_MOVE_CELL_SIZE;
	const frameHeight = (move.frames[0]?.rows.length ?? 0) * CHAT_PET_MOVE_CELL_SIZE;
	const palette = getChatPetMovePalette(move, variant);
	const draw = (frameIndexes: readonly number[]): string => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = frameWidth * frameIndexes.length;
		canvas.height = frameHeight;
		const context = canvas.getContext('2d');
		if (!context) {
			return '';
		}
		frameIndexes.forEach((frameIndex, slot) => {
			paintChatPetRows(context, getChatPetMoveFacingRows(move.frames[frameIndex].rows, move.fixed, facing), palette, slot * frameWidth, 0, CHAT_PET_MOVE_CELL_SIZE);
		});
		return canvas.toDataURL('image/png');
	};
	return {
		animated: { url: draw(move.frames.map((_, index) => index)), frameWidth, frameHeight, frameDurations: move.frames.map(frame => frame.durationMs), iterations: move.loop ? Infinity : 1 },
		reducedMotion: { url: draw([getChatPetMoveStillIndex(move)]), frameWidth, frameHeight, frameDurations: [], iterations: 1 },
	};
}

/** A frame of a move to show in a preview, under a label. */
export interface IChatPetMovePreviewTile {
	readonly label: string;
	readonly move: IChatPetMove;
	readonly frameIndex: number;
}

const PREVIEW_CELL_SIZE = 6;
const PREVIEW_MAX_COLUMNS = 8;
const PREVIEW_GAP = 8;
const PREVIEW_LABEL_HEIGHT = 16;
const PREVIEW_BACKGROUND = '#6b6b6b';
/** The chat input's background and border in the default dark and light themes. */
const PREVIEW_THEMES = [{ background: '#1f1f1f', floor: '#3c3c3c' }, { background: '#ffffff', floor: '#d4d4d4' }];

/**
 * Draws frames of moves for an agent to check what it drew: every frame under its label, standing
 * on the chat input's edge in a dark and a light theme, in balanced rows of up to 8. Frames of
 * different sizes are aligned bottom-left, like the body. Returns a PNG.
 */
export function renderChatPetMovePreview(tiles: readonly IChatPetMovePreviewTile[], variant: 'stable' | 'insiders'): VSBuffer | undefined {
	if (!tiles.length) {
		return undefined;
	}
	const frames = tiles.map(tile => tile.move.frames[tile.frameIndex].rows);
	// A cell of margin around the frame, so pixels at its edges stand out from the tile's edges.
	const tileWidth = (Math.max(...frames.map(rows => rows[0]?.length ?? 0)) + 2) * PREVIEW_CELL_SIZE;
	const themeHeight = (Math.max(...frames.map(rows => rows.length)) + 2) * PREVIEW_CELL_SIZE;
	const columns = Math.ceil(tiles.length / Math.ceil(tiles.length / PREVIEW_MAX_COLUMNS));
	const rowHeight = PREVIEW_LABEL_HEIGHT + themeHeight * PREVIEW_THEMES.length + PREVIEW_GAP;
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = PREVIEW_GAP + columns * (tileWidth + PREVIEW_GAP);
	canvas.height = PREVIEW_GAP + Math.ceil(tiles.length / columns) * rowHeight;
	const context = canvas.getContext('2d');
	if (!context) {
		return undefined;
	}
	context.fillStyle = PREVIEW_BACKGROUND;
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.font = 'bold 11px sans-serif';
	tiles.forEach((tile, index) => {
		const left = PREVIEW_GAP + (index % columns) * (tileWidth + PREVIEW_GAP);
		const top = PREVIEW_GAP + Math.floor(index / columns) * rowHeight;
		context.fillStyle = '#ffffff';
		context.fillText(tile.label, left, top + PREVIEW_LABEL_HEIGHT - 5, tileWidth);
		const rows = frames[index];
		const palette = getChatPetMovePalette(tile.move, variant);
		PREVIEW_THEMES.forEach((theme, themeIndex) => {
			const themeTop = top + PREVIEW_LABEL_HEIGHT + themeIndex * themeHeight;
			const floor = themeTop + themeHeight - PREVIEW_CELL_SIZE;
			context.fillStyle = theme.background;
			context.fillRect(left, themeTop, tileWidth, themeHeight);
			context.fillStyle = theme.floor;
			context.fillRect(left, floor, tileWidth, 2);
			paintChatPetRows(context, rows, palette, left + PREVIEW_CELL_SIZE, floor - rows.length * PREVIEW_CELL_SIZE, PREVIEW_CELL_SIZE);
		});
	});
	return decodeBase64(canvas.toDataURL('image/png').split(',')[1]);
}
