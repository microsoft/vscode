/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject, isString, isStringArray } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { CHAT_PET_MOVE_HOME_SIZE, ChatPetMoveLimits, ChatPetMovePoses, IChatPetMove, parseChatPetMove, toChatPetMoveName, validateChatPetMove } from './chatPetMoves.js';

/**
 * Agents draw taught moves in layers, which they compose far better than whole grids: every frame
 * is a pose of the pet's real body with an expression, then props drawn once and placed where the
 * frame needs them, then text in a bold pixel font shaded for them. Composing flattens the layers
 * into the rows of the move format, which the pet stores and plays.
 *
 * Coordinates are logical pixels: the body's box spans x 0 to 11 and y 0 to 11, props and text go
 * above it (negative y) and right of it (x from 12), and what falls below y 11 is hidden by the
 * chat input.
 */
export interface IChatPetLayeredMove {
	readonly name: string;
	readonly about: string;
	readonly loop: boolean;
	/** The 1-based frame shown for reduced motion. */
	readonly still?: number;
	/** Prop letter to `#rrggbb` color. */
	readonly colors?: Readonly<Record<string, string>>;
	/** Pictures drawn once as rows, to place on any frame. */
	readonly props?: Readonly<Record<string, readonly string[]>>;
	readonly frames: readonly IChatPetLayeredFrame[];
}

export interface IChatPetLayeredFrame {
	readonly ms: number;
	readonly pose?: ChatPetMovePose;
	/** The frame's body drawn from scratch, bottom-left aligned like the pose it replaces. */
	readonly rows?: readonly string[];
	/** `false` takes the antennae off the pose, for headwear. */
	readonly antennae?: boolean;
	readonly eyes?: ChatPetMoveEyeStyle;
	/** Body letters (`C`, `A`, `B`, `E`) drawn as other letters, such as a flash when struck. */
	readonly recolor?: Readonly<Record<string, string>>;
	/** Props by name, at the position of their top-left pixel. */
	readonly place?: readonly { readonly prop: string; readonly x: number; readonly y: number }[];
	/** Text at the position of its top-left pixel; big unless `size` is `small`. */
	readonly text?: readonly { readonly text: string; readonly x: number; readonly y: number; readonly color?: ChatPetMoveRamp; readonly size?: 'big' | 'small' }[];
}

export type ChatPetMovePose = keyof typeof ChatPetMovePoses;

/** The top pixel of the left eye in each pose; the right eye is 3 pixels further right. */
const EYE_ANCHORS: Readonly<Record<ChatPetMovePose, readonly [number, number]>> = { idle: [5, 8], crouch: [5, 9], airborne: [5, 6], love: [5, 8] };

/** Expressions, as the eye pixels relative to the top pixel of the left eye. */
export const ChatPetMoveEyes = {
	open: [[0, 0], [0, 1], [3, 0], [3, 1]],
	right: [[1, 0], [1, 1], [4, 0], [4, 1]],
	up: [[0, -1], [0, 0], [3, -1], [3, 0]],
	'up-right': [[1, -1], [1, 0], [4, -1], [4, 0]],
	wide: [[0, -1], [0, 0], [0, 1], [3, -1], [3, 0], [3, 1]],
	happy: [[-1, 1], [0, 1], [3, 1], [4, 1]],
	squint: [[0, 1], [1, 1], [3, 1], [4, 1]],
	x: [[-2, 0], [0, 0], [-1, 1], [-2, 2], [0, 2], [3, 0], [5, 0], [4, 1], [3, 2], [5, 2]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

export type ChatPetMoveEyeStyle = keyof typeof ChatPetMoveEyes;

/** Color ramps, lit from the upper right like the body: highlight, base, shadow and edge. */
export const ChatPetMoveRamps = {
	gold: ['#ffe994', '#ffc205', '#e7a400', '#9a5b00'],
	red: ['#fb5b6c', '#e82c41', '#ca2134', '#8b1321'],
	pink: ['#f97dbd', '#f24a9d', '#d7257d', '#830b48'],
	purple: ['#d373fc', '#bb45ea', '#9529c2', '#691a90'],
	blue: ['#74b4e0', '#4583be', '#0057aa', '#1c385e'],
	green: ['#8be09a', '#41bd6a', '#23904a', '#145a2e'],
	orange: ['#ffb35c', '#ff921f', '#e67505', '#ae5606'],
	brown: ['#cd7c4a', '#b65135', '#6f403b', '#3c2831'],
	white: ['#ffffff', '#d8e1e8', '#b9c0c7', '#70777d'],
	black: ['#70777d', '#55595e', '#383b3d', '#111c22'],
} as const;

export type ChatPetMoveRamp = keyof typeof ChatPetMoveRamps;

export const ChatPetMoveLayerLimits = {
	maxLayers: 32,
	maxTextLength: 12,
} as const;

/** Glyphs as rows separated by spaces, where `#` is ink. */
type ChatPetFont = Readonly<Record<string, string>>;

/** The big font: 6 pixels tall with 2 pixel stems, for a word that must read at a glance. */
const BIG_FONT: ChatPetFont = {
	A: '.###. ##.## ##.## ##### ##.## ##.##', B: '####. ##.## ####. ##.## ##.## ####.', C: '.#### ##... ##... ##... ##... .####', D: '####. ##.## ##.## ##.## ##.## ####.',
	E: '##### ##... ####. ##... ##... #####', F: '##### ##... ####. ##... ##... ##...', G: '.#### ##... ##.## ##.## ##.## .####', H: '##.## ##.## ##### ##.## ##.## ##.##',
	I: '#### .##. .##. .##. .##. ####', J: '...## ...## ...## ...## ##.## .###.', K: '##.## ####. ###.. ####. ##.## ##.##', L: '##... ##... ##... ##... ##... #####',
	M: '##...## ###.### ##.#.## ##...## ##...## ##...##', N: '##..## ###.## ###### ##.### ##..## ##..##', O: '.###. ##.## ##.## ##.## ##.## .###.', P: '####. ##.## ##.## ####. ##... ##...',
	Q: '.###. ##.## ##.## ##.## ##.#. .##.#', R: '####. ##.## ##.## ####. ##.## ##.##', S: '.#### ##... .###. ...## ...## ####.', T: '###### ..##.. ..##.. ..##.. ..##.. ..##..',
	U: '##.## ##.## ##.## ##.## ##.## .###.', V: '##.## ##.## ##.## ##.## .###. ..#..', W: '##...## ##...## ##.#.## ##.#.## .##.##. .#...#.', X: '##.## ##.## .###. .###. ##.## ##.##',
	Y: '##..## ##..## .####. ..##.. ..##.. ..##..', Z: '##### ...## ..##. .##.. ##... #####', '0': '.###. ##.## ##.## ##.## ##.## .###.', '1': '.## ### .## .## .## .##',
	'2': '.###. ##.## ...## ..##. .##.. #####', '3': '####. ...## .###. ...## ...## ####.', '4': '##.## ##.## ##### ...## ...## ...##', '5': '##### ##... ####. ...## ...## ####.',
	'6': '.###. ##... ####. ##.## ##.## .###.', '7': '##### ...## ..##. ..##. .##.. .##..', '8': '.###. ##.## .###. ##.## ##.## .###.', '9': '.###. ##.## ##.## .#### ...## .###.',
	'!': '## ## ## ## .. ##', '?': '.###. ##.## ...## ..##. ..... ..##.', '.': '.. .. .. .. .. ##', ',': '.. .. .. .. ## #.',
	'\'': '## .# .. .. .. ..', '-': '... ... ### ... ... ...', '+': '.... .##. #### #### .##. ....', ':': '.. ## .. .. ## ..',
	' ': '.. .. .. .. .. ..',
};

/** The small font: 5 pixels tall, for a word that pops in or has to fit beside the body. */
const SMALL_FONT: ChatPetFont = {
	A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.', E: '### #.. ##. #.. ###',
	F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#', I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.',
	K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###', M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.',
	P: '##. #.# ##. #.. #..', Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
	U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#', Y: '#.# #.# .#. .#. .#.',
	Z: '### ..# .#. #.. ###', '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
	'4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###',
	'9': '### #.# ### ..# ##.', '!': '# # # . #', '?': '##. ..# .#. ... .#.', '.': '. . . . #', ',': '.. .. .. .# #.',
	'\'': '# # . . .', '-': '... ... ### ... ...', '+': '... .#. ### .#. ...', ':': '. # . # .', ' ': '. . . . .',
};

/** The love pose's heart antennae, unless the move declares its own `R`. */
const LOVE_COLOR = '#ed1c24';

const PIXELS_PATTERN = /^[A-Za-z0-9.]*$/;
const PIXEL_PATTERN = /^[A-Za-z0-9.]$/;
const BODY_LETTER_PATTERN = /^[CABE]$/;
/** Letters for text colors, taken in order among those the move doesn't use; `R` is the love pose's. */
const TEXT_COLOR_LETTERS = '0123456789abcdefghijklmnopqrstuvwxyzDFGHIJKLMNOPQSTUVWXYZ';

/** A picture on a frame, with its top-left pixel at `x`, `y`. */
interface IChatPetMoveLayer {
	readonly label: string;
	readonly x: number;
	readonly y: number;
	readonly rows: readonly string[];
}

/** A layered move flattened into rows, with the colors and fixed letters the composition added. */
export interface IChatPetComposedMove {
	readonly frames: readonly { readonly durationMs: number; readonly rows: readonly string[] }[];
	readonly colors: Readonly<Record<string, string>>;
	readonly fixed: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

function asRecords(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.map(item => isRecord(item) ? item : {}) : [];
}

/** Rows win over a pose. */
function getChatPetMoveFrameRows(frame: Record<string, unknown>): readonly string[] | undefined {
	return isStringArray(frame.rows) && frame.rows.length ? frame.rows : undefined;
}

/**
 * Flattens a move drawn in layers, from an agent's untrusted input, into rows: every frame on one
 * canvas that fits them all, with the body's box at the bottom left. Frames given as rows alone are
 * padded the same way, which repairs miscounted rows without moving the body. Returns undefined
 * when something must be fixed first, with what in `errors`.
 */
export function composeChatPetMove(move: Readonly<Record<string, unknown>>, errors: string[]): IChatPetComposedMove | undefined {
	const errorCount = errors.length;
	const props = new Map<string, readonly string[]>();
	for (const [name, rows] of Object.entries(isRecord(move.props) ? move.props : {})) {
		if (!isStringArray(rows) || !rows.length || rows.length > ChatPetMoveLimits.maxHeight || rows.some(row => row.length > ChatPetMoveLimits.maxWidth)) {
			errors.push(localize('chatPet.layers.badProp', "Prop \"{0}\" must be a list of 1 to {1} rows of at most {2} pixels, such as [\"..Y..\", \".YYY.\"], with its colors in the move's \"colors\".", name, ChatPetMoveLimits.maxHeight, ChatPetMoveLimits.maxWidth));
		} else if (!rows.every(row => PIXELS_PATTERN.test(row))) {
			errors.push(localize('chatPet.layers.badPropPixels', "Prop \"{0}\" must use \".\" for transparent pixels and letters or digits for colors.", name));
		} else {
			const width = Math.max(...rows.map(row => row.length));
			props.set(name, rows.map(row => row.padEnd(width, '.')));
		}
	}
	const frames = asRecords(move.frames);
	// Checked before composing, which draws every frame on a canvas.
	if (frames.length > ChatPetMoveLimits.maxFrames) {
		errors.push(localize('chatPet.layers.tooManyFrames', "The move has {0} frames; the limit is {1}.", frames.length, ChatPetMoveLimits.maxFrames));
		return undefined;
	}
	const declared = isRecord(move.colors) ? move.colors : {};
	const used = new Set(Object.keys(declared));
	for (const rows of [...props.values(), ...frames.map(frame => getChatPetMoveFrameRows(frame) ?? [])]) {
		rows.forEach(row => [...row].forEach(letter => used.add(letter)));
	}
	for (const frame of frames) {
		Object.values(isRecord(frame.recolor) ? frame.recolor : {}).filter(isString).forEach(letter => used.add(letter));
	}
	const free = [...TEXT_COLOR_LETTERS].filter(letter => !used.has(letter));
	const colors: Record<string, string> = {};
	let fixed = '';
	const rampLetters = new Map<ChatPetMoveRamp, readonly string[]>();
	const lettersFor = (ramp: ChatPetMoveRamp): readonly string[] | undefined => {
		let letters = rampLetters.get(ramp);
		if (!letters && free.length >= 4) {
			letters = free.splice(0, 4);
			rampLetters.set(ramp, letters);
			letters.forEach((letter, index) => colors[letter] = ChatPetMoveRamps[ramp][index]);
			// Text keeps reading left to right when the pet faces left.
			fixed += letters.join('');
		}
		return letters;
	};
	const layered = frames.map((frame, index) => ({
		durationMs: typeof frame.ms === 'number' ? Math.round(frame.ms) : 0,
		layers: readChatPetMoveFrame(frame, index + 1, props, lettersFor, errors),
	}));
	if (errors.length > errorCount) {
		return undefined;
	}
	if (frames.some(frame => frame.pose === 'love' && !getChatPetMoveFrameRows(frame)) && !Object.hasOwn(declared, 'R')) {
		colors.R = LOVE_COLOR;
	}
	const layers = layered.flatMap(frame => frame.layers);
	const top = layers.reduce((min, layer) => Math.min(min, layer.y), CHAT_PET_MOVE_HOME_SIZE);
	const width = layers.reduce((max, layer) => Math.max(max, layer.x + layer.rows[0].length), 0);
	return {
		frames: layered.map(frame => {
			const canvas = Array.from({ length: CHAT_PET_MOVE_HOME_SIZE - top }, () => new Array<string>(width).fill('.'));
			for (const layer of frame.layers) {
				layer.rows.forEach((row, rowIndex) => {
					const y = layer.y + rowIndex;
					// Below the body's box is the chat input, which hides it.
					if (y >= CHAT_PET_MOVE_HOME_SIZE) {
						return;
					}
					[...row].forEach((letter, x) => {
						if (letter !== '.') {
							canvas[y - top][layer.x + x] = letter;
						}
					});
				});
			}
			return { durationMs: frame.durationMs, rows: canvas.map(row => row.join('')) };
		}),
		colors,
		fixed,
	};
}

/** A value from an agent as one line of text, or empty when it is not a string. */
export function toChatPetLine(value: unknown): string {
	return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : '';
}

/**
 * Reads a move as agents send it: drawn in layers, or in the text format, such as a move a user
 * pasted. Returns undefined when it has mistakes, with what in `errors`.
 */
export function readChatPetMove(value: unknown, errors: string[]): IChatPetMove | undefined {
	if (typeof value !== 'string' && !isRecord(value)) {
		errors.push(localize('chatPet.lesson.badMove', "A move must be an object with a name and frames, or a move in the text format."));
		return undefined;
	}
	const moveErrors: string[] = [];
	let move: IChatPetMove | undefined;
	try {
		move = typeof value === 'string' ? parseChatPetMove(value) : toChatPetMove(value, moveErrors);
	} catch (error) {
		moveErrors.push(error instanceof Error ? error.message : String(error));
	}
	if (move) {
		moveErrors.push(...validateChatPetMove(move).errors);
	}
	const name = move?.name ?? (typeof value === 'string' ? '' : toChatPetMoveName(toChatPetLine(value.name)));
	errors.push(...moveErrors.map(error => localize('chatPet.lesson.moveError', "Move \"{0}\": {1}", name, error)));
	return moveErrors.length ? undefined : move;
}

/** Composes a move drawn in layers, for `validateChatPetMove` to check like any other move. */
function toChatPetMove(value: Readonly<Record<string, unknown>>, errors: string[]): IChatPetMove | undefined {
	const composed = composeChatPetMove(value, errors);
	if (!composed) {
		return undefined;
	}
	const colors: Record<string, string> = {};
	for (const [letter, color] of Object.entries({ ...isRecord(value.colors) ? value.colors : {}, ...composed.colors })) {
		colors[letter] = toChatPetLine(color).toLowerCase();
	}
	return {
		name: toChatPetMoveName(toChatPetLine(value.name)),
		about: toChatPetLine(value.about).slice(0, ChatPetMoveLimits.maxAboutLength),
		loop: value.loop !== false,
		still: typeof value.still === 'number' ? value.still - 1 : undefined,
		colors,
		fixed: (isStringArray(value.fixed) ? value.fixed.join('') : toChatPetLine(value.fixed)).replace(/[\s,]+/g, '') + composed.fixed,
		frames: composed.frames,
	};
}

/** A list of a frame, such as its props: anything else than a list is a mistake, reported rather than ignored. */
function readChatPetMoveList(frame: Record<string, unknown>, field: string, number: number, errors: string[]): Record<string, unknown>[] {
	if (frame[field] !== undefined && !Array.isArray(frame[field])) {
		errors.push(localize('chatPet.layers.notList', "Frame {0}: \"{1}\" must be a list.", number, field));
	}
	return asRecords(frame[field]);
}

/** The layers of one frame, bottom to top, or none when the frame has mistakes. */
function readChatPetMoveFrame(frame: Record<string, unknown>, number: number, props: ReadonlyMap<string, readonly string[]>, lettersFor: (ramp: ChatPetMoveRamp) => readonly string[] | undefined, errors: string[]): IChatPetMoveLayer[] {
	const base = readChatPetMoveBase(frame, number, errors);
	const places = readChatPetMoveList(frame, 'place', number, errors);
	const texts = readChatPetMoveList(frame, 'text', number, errors);
	if (places.length + texts.length > ChatPetMoveLayerLimits.maxLayers) {
		errors.push(localize('chatPet.layers.tooManyLayers', "Frame {0} has {1} props and texts; the limit is {2}.", number, places.length + texts.length, ChatPetMoveLayerLimits.maxLayers));
		return [];
	}
	if (!base) {
		return [];
	}
	const layers: IChatPetMoveLayer[] = [{ label: 'rows', x: 0, y: CHAT_PET_MOVE_HOME_SIZE - base.length, rows: base }];
	const add = (label: string, position: Record<string, unknown>, rows: readonly string[]) => {
		if (Number.isFinite(position.x) && Number.isFinite(position.y)) {
			layers.push({ label, x: Math.round(position.x as number), y: Math.round(position.y as number), rows });
		} else {
			errors.push(localize('chatPet.layers.noPosition', "Frame {0}: give \"{1}\" a number x and y for its top-left pixel.", number, label));
		}
	};
	for (const place of places) {
		const name = String(place.prop);
		const rows = props.get(name);
		if (rows) {
			add(name, place, rows);
		} else {
			errors.push(localize('chatPet.layers.unknownProp', "Frame {0} places \"{1}\", which is not in \"props\".", number, name));
		}
	}
	for (const text of texts) {
		const value = typeof text.text === 'string' ? text.text : '';
		const font = text.size === 'small' ? SMALL_FONT : BIG_FONT;
		const ramp = text.color ?? 'gold';
		const missing = [...value.toUpperCase()].filter(character => !Object.hasOwn(font, character));
		if (!value || value.length > ChatPetMoveLayerLimits.maxTextLength) {
			errors.push(localize('chatPet.layers.badText', "Frame {0}: the text \"{1}\" must be 1 to {2} characters.", number, value, ChatPetMoveLayerLimits.maxTextLength));
		} else if (missing.length) {
			errors.push(localize('chatPet.layers.missingGlyph', "Frame {0}: the text \"{1}\" can't use {2}; the font has letters, digits, spaces and ! ? . , ' - + :", number, value, missing.join(' ')));
		} else if (typeof ramp !== 'string' || !Object.hasOwn(ChatPetMoveRamps, ramp)) {
			errors.push(localize('chatPet.layers.badTextColor', "Frame {0}: the text color \"{1}\" must be one of {2}.", number, String(ramp), Object.keys(ChatPetMoveRamps).join(', ')));
		} else {
			const letters = lettersFor(ramp as ChatPetMoveRamp);
			if (letters) {
				add(value, text, renderChatPetText(value.toUpperCase(), font, letters));
			} else {
				errors.push(localize('chatPet.layers.noTextLetters', "The move uses too many letters to add text colors; use fewer colors."));
			}
		}
	}
	const minY = CHAT_PET_MOVE_HOME_SIZE - ChatPetMoveLimits.maxHeight;
	for (const layer of layers) {
		const width = layer.rows[0].length;
		if (layer.x < 0 || layer.y < minY || layer.x + width > ChatPetMoveLimits.maxWidth) {
			errors.push(localize('chatPet.layers.pastCanvas', "Frame {0}: \"{1}\" is {2}x{3} pixels at x {4}, y {5}, so it goes past the canvas, which spans x 0 to {6} and y {7} to 11.", number, layer.label, width, layer.rows.length, layer.x, layer.y, ChatPetMoveLimits.maxWidth - 1, minY));
		}
	}
	return layers;
}

/** A frame's body: its rows, or its pose with the frame's antennae, eyes and colors. */
function readChatPetMoveBase(frame: Record<string, unknown>, number: number, errors: string[]): string[] | undefined {
	const recolor = readChatPetMoveRecolor(frame.recolor);
	if (!recolor) {
		errors.push(localize('chatPet.layers.badRecolor', "Frame {0}: \"recolor\" maps body letters (C, A, B or E) to other letters or digits, such as {\"C\": \"Y\"}.", number));
		return undefined;
	}
	const drawn = getChatPetMoveFrameRows(frame);
	if (drawn) {
		const rows = drawn.map(row => row.trim());
		const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
		if (!rows.every(row => PIXELS_PATTERN.test(row))) {
			errors.push(localize('chatPet.layers.badRowPixels', "Frame {0}: rows must use \".\" for transparent pixels and letters or digits for colors.", number));
			return undefined;
		}
		// Checked before padding the rows, which takes their height times their width.
		if (rows.length > ChatPetMoveLimits.maxHeight || width > ChatPetMoveLimits.maxWidth) {
			errors.push(localize('chatPet.layers.rowsTooLarge', "Frame {0}: its rows are {1}x{2}; draw at most {3}x{4}.", number, width, rows.length, ChatPetMoveLimits.maxWidth, ChatPetMoveLimits.maxHeight));
			return undefined;
		}
		return rows.map(row => [...row.padEnd(width, '.')].map(letter => recolor[letter] ?? letter).join(''));
	}
	const pose = frame.pose;
	if (typeof pose !== 'string' || !Object.hasOwn(ChatPetMovePoses, pose)) {
		errors.push(localize('chatPet.layers.noBase', "Frame {0} needs a \"pose\" ({1}) or \"rows\".", number, Object.keys(ChatPetMovePoses).join(', ')));
		return undefined;
	}
	const eyes = frame.eyes ?? 'open';
	if (typeof eyes !== 'string' || !Object.hasOwn(ChatPetMoveEyes, eyes)) {
		errors.push(localize('chatPet.layers.badEyes', "Frame {0}: \"eyes\" must be one of {1}.", number, Object.keys(ChatPetMoveEyes).join(', ')));
		return undefined;
	}
	const rows = ChatPetMovePoses[pose as ChatPetMovePose].map(row => [...row]);
	if (frame.antennae === false) {
		// Everything above the head, where headwear goes.
		const headTop = rows.findIndex(row => row.includes('B'));
		rows.slice(0, headTop).forEach(row => row.fill('.'));
	}
	const [anchorX, anchorY] = EYE_ANCHORS[pose as ChatPetMovePose];
	for (const [x, y] of ChatPetMoveEyes.open) {
		rows[anchorY + y][anchorX + x] = 'C';
	}
	for (const [x, y] of ChatPetMoveEyes[eyes as ChatPetMoveEyeStyle]) {
		// Expressions stay on the body: x eyes are wider than the airborne pose's chin.
		if (rows[anchorY + y][anchorX + x] !== '.') {
			rows[anchorY + y][anchorX + x] = 'E';
		}
	}
	return rows.map(row => row.map(letter => recolor[letter] ?? letter).join(''));
}

function readChatPetMoveRecolor(value: unknown): Readonly<Record<string, string>> | undefined {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		return undefined;
	}
	const recolor: Record<string, string> = {};
	for (const [from, to] of Object.entries(value)) {
		if (!BODY_LETTER_PATTERN.test(from) || typeof to !== 'string' || !PIXEL_PATTERN.test(to)) {
			return undefined;
		}
		recolor[from] = to;
	}
	return recolor;
}

/**
 * Draws text shaded with a ramp's letters, lit from the upper right like the body: the top of each
 * stroke in the highlight, its bottom in the shadow, and the edge tone left of and below the
 * letters, in one extra column on the left and one extra row at the bottom.
 */
function renderChatPetText(text: string, font: ChatPetFont, [highlight, base, shadow, edge]: readonly string[]): string[] {
	const glyphs = [...text].map(character => font[character].split(' '));
	const ink = glyphs[0].map((_, y) => `.${glyphs.map(glyph => glyph[y]).join('.')}`);
	const width = ink[0].length;
	const isInk = (x: number, y: number) => ink[y]?.[x] === '#';
	// Only the outside gets the edge tone: holes, such as the middle of an O, stay open.
	const key = (x: number, y: number) => (y + 1) * (width + 2) + x + 1;
	const outside = new Set<number>();
	const pending: [number, number][] = [[-1, -1]];
	for (let next = pending.pop(); next; next = pending.pop()) {
		const [x, y] = next;
		if (x >= -1 && x <= width && y >= -1 && y <= ink.length + 1 && !isInk(x, y) && !outside.has(key(x, y))) {
			outside.add(key(x, y));
			pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
		}
	}
	return Array.from({ length: ink.length + 1 }, (_, y) => Array.from({ length: width }, (_, x) => {
		if (isInk(x, y)) {
			return !isInk(x, y - 1) ? highlight : !isInk(x, y + 1) ? shadow : base;
		}
		return outside.has(key(x, y)) && (isInk(x + 1, y) || isInk(x, y - 1) || isInk(x + 1, y - 1)) ? edge : '.';
	}).join(''));
}
