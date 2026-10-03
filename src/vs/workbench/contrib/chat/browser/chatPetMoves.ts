/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isChatPetBuiltInReaction } from './chatPetReactions.js';

/**
 * A pet move is a plain-text animation, one character per pet logical pixel:
 *
 * ```text
 * name: wave
 * about: Waves hello with its right antenna.
 * loop: yes
 * colors: Y=#ffe780
 * fixed: Y
 *
 * frame 120
 * ..A......A..
 * ...
 * ```
 *
 * `C`, `A` and `B` are the body's light, mid and dark colors (blue in Stable, green in Insiders),
 * `E` is an eye, `.` is transparent, and any other letter is a prop declared in `colors:`. Letters
 * listed in `fixed:` keep their screen orientation when the pet faces left, so text stays readable.
 * The body lives in the bottom-left 12 x 12 box; extra rows on top and columns on the right hold props.
 */
export interface IChatPetMove {
	readonly name: string;
	readonly about: string;
	readonly loop: boolean;
	/** Zero-based index of the frame shown for reduced motion, or undefined for the longest frame. */
	readonly still: number | undefined;
	/** Prop letter to `#rrggbb` color. */
	readonly colors: Readonly<Record<string, string>>;
	readonly fixed: string;
	readonly frames: readonly IChatPetMoveFrame[];
}

interface IChatPetMoveFrame {
	readonly durationMs: number;
	readonly rows: readonly string[];
}

/** Opens the list of moves and reactions the pet was taught. */
export const CHAT_PET_TAUGHT_MOVES_COMMAND_ID = 'chat.pet.taughtMoves';

/** Source pixels per logical pixel, matching the pet's own sprite sheets. */
export const CHAT_PET_MOVE_CELL_SIZE = 8;
/** The body's home box, in logical pixels. */
export const CHAT_PET_MOVE_HOME_SIZE = 12;

export const ChatPetMoveLimits = {
	maxFrames: 16,
	maxWidth: 24,
	maxHeight: 24,
	minFrameDurationMs: 20,
	maxFrameDurationMs: 2_000,
	maxTotalDurationMs: 5_000,
	maxSourceLength: 16_384,
	maxAboutLength: 200,
} as const;

const ChatPetMoveBodyPalettes = {
	stable: { C: '#23a8f2', A: '#0077b8', B: '#004e7c' },
	insiders: { C: '#24bfa5', A: '#009a7c', B: '#004538' },
} as const;

const CHAT_PET_MOVE_EYE_COLOR = '#191a1b';

/**
 * Real poses of the pet as move rows, derived from the sprite sheets in `widget/media/chatPet/`
 * (the Stable colorway, with its baked eyes). They let taught moves start from the true body.
 */
export const ChatPetMovePoses = {
	idle: [
		'..A......A..',
		'...A....A...',
		'....A..A....',
		'.....BA.....',
		'....BACC....',
		'...BACCCC...',
		'..BACCCCCC..',
		'.BACCCCCCCC.',
		'BAACCECCECCC',
		'BAACCECCECCC',
		'BAACCCCCCCCC',
		'.BAAACCCCCC.',
	],
	crouch: [
		'............',
		'............',
		'............',
		'..A......A..',
		'...A....A...',
		'....A..A....',
		'...BACCCC...',
		'.BACCCCCCCC.',
		'BAACCCCCCCCC',
		'BAACCECCECCC',
		'BAACCECCECCC',
		'.BAAACCCCCC.',
	],
	airborne: [
		'..A.A.......',
		'...A.A......',
		'....BACC....',
		'...BACCCC...',
		'..BACCCCCC..',
		'.BAACCCCCCC.',
		'.BAACECCECC.',
		'.BAACECCECC.',
		'..BAAACCCC..',
		'............',
		'............',
		'............',
	],
	/** The heart antennae of the love reaction; `R` is `#ed1c24`. */
	love: [
		'....AA.AA...',
		'...ARRARRA..',
		'...ARRRRRA..',
		'....ARRRA...',
		'....BACC....',
		'...BACCCC...',
		'..BACCCCCC..',
		'.BACCCCCCCC.',
		'BAACCECCECCC',
		'BAACCECCECCC',
		'BAACCCCCCCCC',
		'.BAAACCCCCC.',
	],
} as const;

const RESERVED_LETTERS = new Set(['.', 'C', 'A', 'B', 'E']);
/** What `toChatPetMoveName` makes of a name, so every valid name is also found by it. */
const NAME_PATTERN = /^(?=.{2,31}$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COLOR_LETTER_PATTERN = /^[A-Za-z0-9]$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const FRAME_PATTERN = /^frame\s+(?<duration>\d+)\s*(?:ms)?$/;
const TRAILING_COMMENT_PATTERN = /\s+#.*$/;
const LOOP_VALUES: Readonly<Record<string, boolean>> = { yes: true, no: false, true: true, false: false, on: true, off: false, '1': true, '0': false };

/**
 * Parses a move. Lines starting with `#` are comments, and so is anything after ` #` at the end of
 * a line (colors use `=#rrggbb`, which is not a comment), except in `about:`, which is prose.
 * Throws an error that says what to fix.
 */
export function parseChatPetMove(text: string): IChatPetMove {
	if (text.length > ChatPetMoveLimits.maxSourceLength) {
		throw new Error(localize('chatPet.move.tooLong', "The move is longer than {0} characters.", ChatPetMoveLimits.maxSourceLength));
	}
	let name = '';
	let about = '';
	let loop = true;
	let still: number | undefined;
	const colors: Record<string, string> = {};
	let fixed = '';
	const frames: { durationMs: number; rows: string[] }[] = [];
	let current: { durationMs: number; rows: string[] } | undefined;
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		const lineNumber = index + 1;
		const raw = lines[index].trim();
		if (raw.startsWith('#')) {
			continue;
		}
		const line = raw.replace(TRAILING_COMMENT_PATTERN, '');
		const frameMatch = FRAME_PATTERN.exec(line);
		if (frameMatch?.groups) {
			current = { durationMs: Number(frameMatch.groups.duration), rows: [] };
			frames.push(current);
			continue;
		}
		if (!line) {
			continue;
		}
		if (current) {
			current.rows.push(line);
			continue;
		}
		const separator = line.indexOf(':');
		if (separator < 0) {
			throw new Error(localize('chatPet.move.expectedHeader', "Line {0}: expected \"key: value\" or \"frame <ms>\".", lineNumber));
		}
		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		switch (key) {
			case 'name':
				name = value;
				break;
			case 'about':
				about = raw.slice(raw.indexOf(':') + 1).trim().slice(0, ChatPetMoveLimits.maxAboutLength);
				break;
			case 'loop': {
				const parsed = Object.hasOwn(LOOP_VALUES, value.toLowerCase()) ? LOOP_VALUES[value.toLowerCase()] : undefined;
				if (parsed === undefined) {
					throw new Error(localize('chatPet.move.badLoop', "Line {0}: loop must be yes or no.", lineNumber));
				}
				loop = parsed;
				break;
			}
			case 'still':
				if (!/^\d+$/.test(value)) {
					throw new Error(localize('chatPet.move.badStill', "Line {0}: still must be a frame number.", lineNumber));
				}
				still = Number(value) - 1;
				break;
			case 'colors':
				for (const item of value.split(/[\s,]+/).filter(Boolean)) {
					const [letter, color] = item.split('=');
					if (letter?.length !== 1 || !color || !COLOR_PATTERN.test(color)) {
						throw new Error(localize('chatPet.move.badColor', "Line {0}: \"{1}\" is not a color; use X=#rrggbb.", lineNumber, item));
					}
					colors[letter] = color.toLowerCase();
				}
				break;
			case 'fixed':
				fixed = value.replace(/[\s,]+/g, '');
				break;
			default:
				throw new Error(localize('chatPet.move.unknownHeader', "Line {0}: unknown header \"{1}\"; use name, about, loop, still, colors or fixed.", lineNumber, key));
		}
	}
	return { name, about, loop, still, colors, fixed, frames };
}

/** Checks a parsed move and returns what must be fixed before the pet can learn it. */
export function validateChatPetMove(move: IChatPetMove): { readonly errors: readonly string[] } {
	const errors: string[] = [];
	if (!NAME_PATTERN.test(move.name)) {
		errors.push(localize('chatPet.move.badName', "The name \"{0}\" must be 2 to 31 lowercase letters and digits, starting with a letter, with single dashes between words.", move.name));
	} else if (isChatPetBuiltInReaction(move.name)) {
		errors.push(localize('chatPet.move.reservedName', "The name \"{0}\" is taken by a built-in reaction.", move.name));
	}
	for (const [letter, color] of Object.entries(move.colors)) {
		if (RESERVED_LETTERS.has(letter)) {
			errors.push(localize('chatPet.move.reservedLetter', "The color letter \"{0}\" is reserved for the body, eyes or transparency.", letter));
		} else if (!COLOR_LETTER_PATTERN.test(letter) || !COLOR_PATTERN.test(color)) {
			errors.push(localize('chatPet.move.badColorEntry', "\"{0}={1}\" is not a color; use X=#rrggbb, where X is a letter or digit.", letter, color));
		}
	}
	for (const letter of move.fixed) {
		if (!Object.hasOwn(move.colors, letter)) {
			errors.push(localize('chatPet.move.fixedUndeclared', "The fixed letter \"{0}\" must also be declared in colors.", letter));
		}
	}
	if (move.frames.length === 0) {
		errors.push(localize('chatPet.move.noFrames', "The move has no frames; add \"frame <ms>\" followed by grid rows."));
		return { errors };
	}
	if (move.frames.length > ChatPetMoveLimits.maxFrames) {
		// Checking every frame of a long paste would bury this in errors.
		errors.push(localize('chatPet.move.tooManyFrames', "The move has {0} frames; the limit is {1}.", move.frames.length, ChatPetMoveLimits.maxFrames));
		return { errors };
	}
	const height = move.frames[0].rows.length;
	const width = move.frames[0].rows[0]?.length ?? 0;
	const allowed = new Set([...RESERVED_LETTERS, ...Object.keys(move.colors)]);
	move.frames.forEach((frame, index) => {
		const number = index + 1;
		if (frame.durationMs < ChatPetMoveLimits.minFrameDurationMs || frame.durationMs > ChatPetMoveLimits.maxFrameDurationMs) {
			errors.push(localize('chatPet.move.badDuration', "Frame {0} lasts {1} ms; use {2} to {3} ms.", number, frame.durationMs, ChatPetMoveLimits.minFrameDurationMs, ChatPetMoveLimits.maxFrameDurationMs));
		}
		if (frame.rows.length !== height) {
			errors.push(localize('chatPet.move.badHeight', "Frame {0} has {1} rows; every frame needs {2} like frame 1.", number, frame.rows.length, height));
		}
		const unevenRow = frame.rows.findIndex(row => row.length !== width);
		if (unevenRow >= 0) {
			errors.push(localize('chatPet.move.badWidth', "Frame {0}, row {1} is {2} wide (\"{3}\"); every row needs {4}, like the rows of frame 1.", number, unevenRow + 1, frame.rows[unevenRow].length, frame.rows[unevenRow], width));
		}
		const unknown = [...new Set(frame.rows.join(''))].filter(letter => !allowed.has(letter));
		if (unknown.length) {
			errors.push(localize('chatPet.move.unknownLetters', "Frame {0} uses undeclared letters {1}; declare them in colors.", number, unknown.join('')));
		}
	});
	if (width < CHAT_PET_MOVE_HOME_SIZE || height < CHAT_PET_MOVE_HOME_SIZE) {
		errors.push(localize('chatPet.move.tooSmall', "Frames are {0}x{1}; they must be at least {2}x{2}.", width, height, CHAT_PET_MOVE_HOME_SIZE));
	}
	if (width > ChatPetMoveLimits.maxWidth || height > ChatPetMoveLimits.maxHeight) {
		errors.push(localize('chatPet.move.tooLarge', "Frames are {0}x{1}; the limit is {2}x{3}.", width, height, ChatPetMoveLimits.maxWidth, ChatPetMoveLimits.maxHeight));
	}
	const total = getChatPetMoveDuration(move);
	if (total > ChatPetMoveLimits.maxTotalDurationMs) {
		errors.push(localize('chatPet.move.tooLongDuration', "The move lasts {0} ms; the limit is {1} ms.", total, ChatPetMoveLimits.maxTotalDurationMs));
	}
	if (move.still !== undefined && (!Number.isInteger(move.still) || move.still < 0 || move.still >= move.frames.length)) {
		errors.push(localize('chatPet.move.badStillFrame', "still: {0} is not a frame number (1-{1}).", move.still + 1, move.frames.length));
	}
	// Moves are stored as text, and stored text over the limit doesn't load.
	if (!errors.length && serializeChatPetMove(move).length > ChatPetMoveLimits.maxSourceLength) {
		errors.push(localize('chatPet.move.tooLong', "The move is longer than {0} characters.", ChatPetMoveLimits.maxSourceLength));
	}
	return { errors };
}

export function serializeChatPetMove(move: IChatPetMove): string {
	const lines = [`name: ${move.name}`];
	if (move.about) {
		lines.push(`about: ${move.about}`);
	}
	lines.push(`loop: ${move.loop ? 'yes' : 'no'}`);
	if (move.still !== undefined) {
		lines.push(`still: ${move.still + 1}`);
	}
	const colors = Object.entries(move.colors);
	if (colors.length) {
		lines.push(`colors: ${colors.map(([letter, color]) => `${letter}=${color}`).join(' ')}`);
	}
	if (move.fixed) {
		lines.push(`fixed: ${[...move.fixed].join(' ')}`);
	}
	for (const frame of move.frames) {
		lines.push('', `frame ${frame.durationMs}`, ...frame.rows);
	}
	return lines.join('\n') + '\n';
}

/** Turns what a user calls a move, such as "YES SIR" or "Happy dance!", into its name: `yes-sir`, `happy-dance`. */
export function toChatPetMoveName(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 31)
		.replace(/^-+|-+$/g, '');
}

export function getChatPetMoveDuration(move: IChatPetMove): number {
	return move.frames.reduce((total, frame) => total + frame.durationMs, 0);
}

/** The frame shown for reduced motion: `still:` if set, otherwise the longest frame (the last one on ties). */
export function getChatPetMoveStillIndex(move: IChatPetMove): number {
	if (move.still !== undefined) {
		return move.still;
	}
	let best = 0;
	move.frames.forEach((frame, index) => {
		if (frame.durationMs >= move.frames[best].durationMs) {
			best = index;
		}
	});
	return best;
}

/**
 * The rows of a frame as seen when the pet faces `facing`. Facing left mirrors the frame, but letters
 * in `fixed` keep their orientation, the same way the pet's own musical note stays readable. Fixed
 * pixels up to 4 columns and 1 row apart form a unit, such as a word or a sign: each unit is drawn
 * unmirrored at the mirrored position of its bounding box, so separate words stay readable in their
 * mirrored places without dragging the body between them along.
 */
export function getChatPetMoveFacingRows(rows: readonly string[], fixed: string, facing: 'left' | 'right'): string[] {
	if (facing === 'right') {
		return [...rows];
	}
	const width = rows[0]?.length ?? 0;
	const mirrored = rows.map(row => [...row].reverse());
	const key = (x: number, y: number) => y * width + x;
	const isFixed = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < rows.length && fixed.includes(rows[y][x]);
	const placed = new Set<number>();
	rows.forEach((row, startY) => {
		for (let startX = 0; startX < width; startX++) {
			if (!isFixed(startX, startY) || placed.has(key(startX, startY))) {
				continue;
			}
			const unit = new Set([key(startX, startY)]);
			const pending: [number, number][] = [[startX, startY]];
			let [minX, maxX, minY, maxY] = [startX, startX, startY, startY];
			for (let next = pending.pop(); next; next = pending.pop()) {
				const [x, y] = next;
				[minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
				for (let neighborY = y - 1; neighborY <= y + 1; neighborY++) {
					for (let neighborX = x - 4; neighborX <= x + 4; neighborX++) {
						if (isFixed(neighborX, neighborY) && !unit.has(key(neighborX, neighborY))) {
							unit.add(key(neighborX, neighborY));
							pending.push([neighborX, neighborY]);
						}
					}
				}
			}
			unit.forEach(pixel => placed.add(pixel));
			const left = width - (maxX + 1);
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					// The unit's letters, and what its mirrored letters would cover, such as a sign's backdrop.
					if (unit.has(key(x, y)) || unit.has(key(minX + maxX - x, y))) {
						mirrored[y][left + x - minX] = rows[y][x];
					}
				}
			}
		}
	});
	return mirrored.map(row => row.join(''));
}

/** The color of every letter of a move in a colorway, or undefined for transparent. */
export function getChatPetMovePalette(move: IChatPetMove, variant: 'stable' | 'insiders'): (letter: string) => string | undefined {
	const body: Readonly<Record<string, string>> = ChatPetMoveBodyPalettes[variant];
	return letter => letter === '.' ? undefined : letter === 'E' ? CHAT_PET_MOVE_EYE_COLOR : body[letter] ?? move.colors[letter];
}
