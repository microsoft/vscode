/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { getChatPetBuiltInMoveNames } from './chatPetBuiltInMoves.js';
import { readChatPetMove } from './chatPetMoveLayers.js';
import { CHAT_PET_MOVE_HOME_SIZE, ChatPetMoveLimits, ChatPetMovePoses, IChatPetMove, serializeChatPetMove } from './chatPetMoves.js';
import { ChatPetBuiltInReactions, ChatPetBuiltInTriggers, ChatPetReactionLimits, ChatPetReactionTrigger, IChatPetReactionInput, isChatPetReactionTrigger, sanitizeChatPetReaction } from './chatPetReactions.js';
import { CHAT_PET_MAX_MOVES } from './chatPetService.js';

/**
 * `pets.md` is the pet's memory as a text file: every move and reaction it was taught, in
 * fenced `pet` code blocks. It is served from what the pet knows, so what the user, an agent or
 * the Sprites or Interactions page changes shows up in it, and saving it teaches the pet by hand. Only the
 * blocks count: prose is regenerated.
 */
export const CHAT_PET_DOCUMENT_SCHEME = 'vscode-chat-pet';
export const CHAT_PET_DOCUMENT_URI = URI.from({ scheme: CHAT_PET_DOCUMENT_SCHEME, path: '/pets.md' });

/** Opens `pets.md`, revealing a move or inserting a new block (see `IChatPetOpenDocumentArgs`). */
export const CHAT_PET_OPEN_DOCUMENT_COMMAND_ID = 'chat.pet.openPetsFile';

export interface IChatPetOpenDocumentArgs {
	/** The name of a move whose block to reveal. */
	readonly revealMove?: string;
	/** A move in the text format to add as a new block, selected but unsaved, such as a template or a built-in move to customize. */
	readonly insertMove?: string;
}

/** What a `pets.md` says, or what must be fixed before the pet can learn it. */
export interface IChatPetDocument {
	readonly moves: readonly IChatPetMove[];
	readonly reactions: readonly IChatPetReactionInput[];
	readonly errors: readonly string[];
}

const FENCE_OPEN_PATTERN = /^\s{0,3}```\s*(?<info>\S*)\s*$/;
const FENCE_CLOSE_PATTERN = /^\s{0,3}```\s*$/;
const REACTION_KEY_PATTERN = /^\s*play\s*:/im;

function toPetBlock(text: string): string[] {
	return ['```pet', ...text.replace(/\n$/, '').split('\n'), '```'];
}

function serializeReactionBlock(reaction: IChatPetReactionInput): string[] {
	const lines = [`play: ${reaction.play}`, `trigger: ${reaction.trigger}`];
	if (reaction.trigger === 'message') {
		lines.push(`phrases: ${reaction.phrases.join(', ')}`);
	}
	if (reaction.when) {
		lines.push(`when: ${reaction.when}`);
	}
	if (reaction.enabled === false) {
		lines.push('enabled: no');
	}
	return toPetBlock(lines.join('\n'));
}

/** Writes `pets.md` for what the pet knows. */
export function serializeChatPetDocument(moves: readonly IChatPetMove[], reactions: readonly IChatPetReactionInput[]): string {
	const lines = [
		`# ${localize('chatPet.document.title', "VS Code Pet")}`,
		'',
		localize('chatPet.document.intro', "What the VS Code pet was taught: its reactions and its moves. Edit this file and save it to teach the pet by hand: only the pet code blocks count, the pet forgets the ones you delete, and it plays the moves you change. The pet's Sprites and Interactions pages show the same things; to have an agent teach it instead, type /pet in the Agents window."),
		'',
		`## ${localize('chatPet.document.reactions', "Reactions")}`,
		'',
		localize('chatPet.document.reactionsHelp', "A reaction plays a move when something happens. Each one is a pet block with: play (a move below, a built-in move such as {0}, or a built-in reaction: {1}); trigger (message plays when a message you send contains one of the phrases; the pet's own events are {2}); phrases (for message, separated by commas, matched as whole words, ignoring case and punctuation); when (what it is about, in your words); and enabled (no keeps a reaction without playing it). A reaction alone on its phrases always plays; when several match a message, one plays at random. On click, your moves join the pet's own animations, and one of them plays. On any other event, one move plays in place of the pet's own animation, for as long as the event lasts: the last reaction written for it. Which of the pet's own animations still play is set on its Interactions page.", getChatPetBuiltInMoveNames().slice(0, 3).join(', '), ChatPetBuiltInReactions.join(', '), ChatPetBuiltInTriggers.join(', ')),
		'',
	];
	if (reactions.length) {
		for (const reaction of reactions) {
			lines.push(...serializeReactionBlock(reaction), '');
		}
	} else {
		lines.push(localize('chatPet.document.noReactions', "The pet has no reactions yet."), '');
	}
	lines.push(
		`## ${localize('chatPet.document.moves', "Moves")}`,
		'',
		localize('chatPet.document.movesHelp', "A move is a pixel-art animation. Each one is a pet block in the pet's text format: name (2 to 31 lowercase letters, digits and dashes); about (what it shows); loop (yes or no); still (the frame shown for reduced motion); colors (prop letters and their colors, such as Y=#ffe780); fixed (letters that stay readable when the pet faces left, such as text); then a frame line with its duration in milliseconds before each frame's rows, one character per pixel: C, A and B are the body's light, mid and dark colors, E an eye, . transparent, and other letters the colors declared. Frames are at least {0}x{0} and at most {1}x{2}, with the body in the bottom-left {0}x{0}; a move has at most {3} frames and lasts at most {4} seconds. Lines starting with # are comments. A move with the name of a built-in move replaces it.", CHAT_PET_MOVE_HOME_SIZE, ChatPetMoveLimits.maxWidth, ChatPetMoveLimits.maxHeight, ChatPetMoveLimits.maxFrames, ChatPetMoveLimits.maxTotalDurationMs / 1000),
		'',
	);
	if (moves.length) {
		for (const move of moves) {
			lines.push(...toPetBlock(serializeChatPetMove(move)), '');
		}
	} else {
		lines.push(localize('chatPet.document.noMoves', "The pet has no taught moves yet. Use New Move on its Sprites page to start one here, or Customize a built-in move."), '');
	}
	return lines.join('\n');
}

interface IChatPetDocumentBlock {
	/** The 1-based line of the opening fence. */
	readonly line: number;
	readonly text: string;
}

/** The `pet` (or untagged) code blocks of a document, so a move pasted into a plain block counts too. */
function readPetBlocks(text: string): IChatPetDocumentBlock[] {
	const blocks: IChatPetDocumentBlock[] = [];
	const lines = text.split(/\r?\n/);
	let open: { readonly line: number; readonly counts: boolean; readonly rows: string[] } | undefined;
	lines.forEach((raw, index) => {
		if (open) {
			if (FENCE_CLOSE_PATTERN.test(raw)) {
				if (open.counts) {
					blocks.push({ line: open.line, text: open.rows.join('\n') });
				}
				open = undefined;
			} else {
				open.rows.push(raw);
			}
			return;
		}
		const match = FENCE_OPEN_PATTERN.exec(raw);
		if (match?.groups) {
			const info = match.groups.info.toLowerCase();
			open = { line: index + 1, counts: info === '' || info === 'pet', rows: [] };
		}
	});
	if (open?.counts) {
		blocks.push({ line: open.line, text: open.rows.join('\n') });
	}
	return blocks;
}

interface IChatPetRawReaction {
	readonly line: number;
	readonly play: string;
	readonly trigger: ChatPetReactionTrigger;
	readonly phrases: readonly string[];
	readonly when: string;
	readonly enabled: boolean;
}

const ENABLED_VALUES: Readonly<Record<string, boolean>> = { yes: true, no: false, true: true, false: false, on: true, off: false, '1': true, '0': false };

/** Reads a reaction block's `key: value` lines; `#` starts a comment, as in moves. */
function readReactionBlock(block: IChatPetDocumentBlock, errors: string[]): IChatPetRawReaction | undefined {
	let play = '';
	let trigger: ChatPetReactionTrigger = 'message';
	const phrases: string[] = [];
	let when = '';
	let enabled = true;
	let valid = true;
	const fail = (line: number, message: string) => {
		errors.push(localize('chatPet.document.lineError', "Line {0}: {1}", line, message));
		valid = false;
	};
	block.text.split('\n').forEach((raw, index) => {
		const line = block.line + 1 + index;
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			return;
		}
		const separator = trimmed.indexOf(':');
		if (separator < 0) {
			fail(line, localize('chatPet.document.reactionExpectedHeader', "expected \"key: value\" in a reaction; use play, trigger, phrases, when or enabled."));
			return;
		}
		const key = trimmed.slice(0, separator).trim().toLowerCase();
		const value = trimmed.slice(separator + 1).trim();
		switch (key) {
			case 'play':
				play = value;
				break;
			case 'trigger': {
				// Written by hand, so any casing goes: "Click", "requestdone".
				const known = ['message', ...ChatPetBuiltInTriggers].find(candidate => candidate.toLowerCase() === value.toLowerCase());
				if (!known || !isChatPetReactionTrigger(known)) {
					fail(line, localize('chatPet.document.badTrigger', "trigger must be message or one of {0}, not \"{1}\".", ChatPetBuiltInTriggers.join(', '), value));
				} else {
					trigger = known;
				}
				break;
			}
			case 'phrases':
				phrases.push(...value.split(',').map(phrase => phrase.trim()).filter(Boolean));
				break;
			case 'when':
				when = value;
				break;
			case 'enabled': {
				const parsed = Object.hasOwn(ENABLED_VALUES, value.toLowerCase()) ? ENABLED_VALUES[value.toLowerCase()] : undefined;
				if (parsed === undefined) {
					fail(line, localize('chatPet.document.badEnabled', "enabled must be yes or no, not \"{0}\".", value));
				} else {
					enabled = parsed;
				}
				break;
			}
			default:
				fail(line, localize('chatPet.document.reactionUnknownHeader', "unknown reaction header \"{0}\"; use play, trigger, phrases, when or enabled.", key));
		}
	});
	return valid ? { line: block.line, play, trigger, phrases, when, enabled } : undefined;
}

/** Reads `pets.md`. Nothing is usable while there are errors, each with the line to fix. */
export function parseChatPetDocument(text: string): IChatPetDocument {
	const errors: string[] = [];
	const moves: IChatPetMove[] = [];
	const rawReactions: IChatPetRawReaction[] = [];
	for (const block of readPetBlocks(text)) {
		if (!block.text.split('\n').some(line => line.trim() && !line.trim().startsWith('#'))) {
			errors.push(localize('chatPet.document.lineError', "Line {0}: {1}", block.line, localize('chatPet.document.emptyBlock', "The pet block is empty; write a move or a reaction in it, or delete it.")));
			continue;
		}
		if (REACTION_KEY_PATTERN.test(block.text)) {
			const reaction = readReactionBlock(block, errors);
			if (reaction) {
				rawReactions.push(reaction);
			}
			continue;
		}
		const moveErrors: string[] = [];
		const move = readChatPetMove(block.text, moveErrors);
		errors.push(...moveErrors.map(error => localize('chatPet.document.lineError', "Line {0}: {1}", block.line, error)));
		if (!move) {
			continue;
		}
		if (moves.some(existing => existing.name === move.name)) {
			errors.push(localize('chatPet.document.lineError', "Line {0}: {1}", block.line, localize('chatPet.document.duplicateMove', "There is already a move called \"{0}\" above.", move.name)));
			continue;
		}
		moves.push(move);
	}
	if (moves.length > CHAT_PET_MAX_MOVES) {
		errors.push(localize('chatPet.document.tooManyMoves', "The file has {0} moves; the pet can know at most {1}.", moves.length, CHAT_PET_MAX_MOVES));
	}
	const knownMoves = [...moves.map(move => move.name), ...getChatPetBuiltInMoveNames()];
	const reactions: IChatPetReactionInput[] = [];
	for (const raw of rawReactions) {
		const sanitized = sanitizeChatPetReaction({ trigger: raw.trigger, when: raw.when, phrases: raw.phrases, play: raw.play, enabled: raw.enabled }, knownMoves);
		if (typeof sanitized === 'string') {
			errors.push(localize('chatPet.document.lineError', "Line {0}: {1}", raw.line, sanitized));
		} else {
			reactions.push(sanitized);
		}
	}
	if (reactions.length > ChatPetReactionLimits.maxReactions) {
		errors.push(localize('chatPet.document.tooManyReactions', "The file has {0} reactions; the pet can know at most {1}.", reactions.length, ChatPetReactionLimits.maxReactions));
	}
	return { moves, reactions, errors };
}

/**
 * Reads a move someone shared as text: as Copy writes it, or inside a fenced `pet` block as it
 * stands in `pets.md` or a chat message. Returns the move, or what is wrong with it.
 */
export function readChatPetSharedMove(text: string): { readonly move: IChatPetMove; readonly error?: undefined } | { readonly move?: undefined; readonly error: string } {
	const blocks = readPetBlocks(text);
	const source = (blocks.length ? blocks[0].text : text).trim();
	if (!source) {
		return { error: localize('chatPet.document.noSharedMove', "There is no move in the text; copy one as text first.") };
	}
	const errors: string[] = [];
	const move = readChatPetMove(source, errors);
	return move ? { move } : { error: errors[0] };
}

/** The 1-based line of a move's `name:` line in a document, to reveal it. */
export function findChatPetDocumentMoveLine(text: string, name: string): number | undefined {
	const lines = text.split(/\r?\n/);
	const index = lines.findIndex(line => {
		const match = /^\s*name\s*:\s*(?<name>.+?)\s*$/i.exec(line);
		return match?.groups?.name === name;
	});
	return index >= 0 ? index + 1 : undefined;
}

/** A move to start from by hand: the pet bobbing between its idle and crouch poses, under a name no move has yet. */
export function createChatPetMoveTemplate(takenNames: readonly string[]): IChatPetMove {
	let name = 'new-move';
	for (let index = 2; takenNames.includes(name); index++) {
		name = `new-move-${index}`;
	}
	return {
		name,
		about: localize('chatPet.document.templateAbout', "Bobs up and down. Change the name and draw your own frames."),
		loop: true,
		still: undefined,
		colors: {},
		fixed: '',
		frames: [
			{ durationMs: 400, rows: ChatPetMovePoses.idle },
			{ durationMs: 400, rows: ChatPetMovePoses.crouch },
		],
	};
}
