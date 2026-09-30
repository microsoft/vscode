/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { isObject, isStringArray } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ChatPetMoveExamples } from './chatPetMoveExamples.js';
import { describeChatPetBuiltInMove, getChatPetBuiltInMoveNames, getChatPetBuiltInMoves } from './chatPetBuiltInMoves.js';
import { ChatPetMoveLayerLimits, ChatPetMoveRamps, readChatPetMove, toChatPetLine } from './chatPetMoveLayers.js';
import { CHAT_PET_MOVE_HOME_SIZE, ChatPetMoveLimits, ChatPetMovePoses, getChatPetMoveDuration, IChatPetMove, serializeChatPetMove, toChatPetMoveName } from './chatPetMoves.js';
import { ChatPetBuiltInReactions, ChatPetBuiltInTriggers, ChatPetReactionLimits, describeChatPetTrigger, IChatPetReaction, IChatPetReactionInput, isChatPetBuiltInReaction, isChatPetReactionTrigger, sanitizeChatPetReaction } from './chatPetReactions.js';
import { CHAT_PET_MAX_MOVES, IChatPetService } from './chatPetService.js';
import { IChatPetWidgetService } from './widget/chatPetWidgetService.js';

/** A lesson for the pet, checked and ready to apply. */
export interface IChatPetLesson {
	readonly moves: readonly IChatPetMove[];
	readonly reactions: readonly IChatPetReactionInput[];
	readonly removedReactionIds: readonly string[];
	readonly forgottenMoves: readonly string[];
	readonly play: string | undefined;
}

/** A checked lesson: ready to apply, or what must be fixed first. */
type ChatPetLessonResult =
	| { readonly valid: true; readonly lesson: IChatPetLesson }
	| { readonly valid: false; readonly errors: readonly string[] };

const CHAT_PET_LESSON_MAX_ITEMS = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

/** A list field of a lesson. Anything else than a list is a mistake, reported rather than ignored. */
function asArray(value: unknown, field: string, errors: string[]): readonly unknown[] {
	if (value !== undefined && !Array.isArray(value)) {
		errors.push(localize('chatPet.lesson.notList', "\"{0}\" must be a list.", field));
	}
	return Array.isArray(value) ? value : [];
}

/**
 * Checks a lesson, as the `teachPet` tool receives it from an agent. The input is untrusted:
 * anything unusable becomes an error for the agent to fix, and nothing applies until the whole
 * lesson is valid.
 */
export function validateChatPetLesson(input: unknown, knownMoves: readonly string[], knownReactions: readonly IChatPetReaction[]): ChatPetLessonResult {
	const value = isRecord(input) ? input : {};
	const errors: string[] = [];
	const moveInputs = [...asArray(value.moves, 'moves', errors), ...asArray(value.pastedMoves, 'pastedMoves', errors)];
	const reactionInputs = asArray(value.reactions, 'reactions', errors);
	const forgetMoveInputs = asArray(value.forgetMoves, 'forgetMoves', errors);
	const forgetReactionInputs = asArray(value.forgetReactions, 'forgetReactions', errors);
	const playInput = toChatPetLine(value.play);
	const itemCount = moveInputs.length + reactionInputs.length + forgetMoveInputs.length + forgetReactionInputs.length + (playInput ? 1 : 0);
	if (errors.length) {
		return { valid: false, errors };
	}
	if (itemCount === 0) {
		return { valid: false, errors: [localize('chatPet.lesson.empty', "The lesson is empty: give moves, pastedMoves, reactions, forgetMoves, forgetReactions or play.")] };
	}
	if (itemCount > CHAT_PET_LESSON_MAX_ITEMS) {
		return { valid: false, errors: [localize('chatPet.lesson.tooManyItems', "The lesson has {0} changes; make at most {1} at a time.", itemCount, CHAT_PET_LESSON_MAX_ITEMS)] };
	}
	const moves: IChatPetMove[] = [];
	for (const moveInput of moveInputs) {
		const move = readChatPetMove(moveInput, errors);
		if (move) {
			moves.push(move);
		}
	}
	const builtInMoves = getChatPetBuiltInMoveNames();
	// Repeated names and ids count once, so the reaction limit below stays exact.
	const forgottenMoves: string[] = [];
	for (const name of forgetMoveInputs.map(toChatPetLine)) {
		const moveName = toChatPetMoveName(name);
		if (forgottenMoves.includes(moveName)) {
			continue;
		}
		if (knownMoves.includes(moveName)) {
			forgottenMoves.push(moveName);
		} else if (builtInMoves.includes(moveName)) {
			errors.push(localize('chatPet.lesson.builtInForget', "\"{0}\" is a built-in move, which can't be forgotten.", name));
		} else {
			// The moves it knows, so agents can forget moves by what users call them without reading the guide.
			errors.push(knownMoves.length
				? localize('chatPet.lesson.unknownForget', "There is no taught move called \"{0}\" to forget; the pet knows {1}.", name, knownMoves.join(', '))
				: localize('chatPet.lesson.unknownForgetNone', "There is no taught move called \"{0}\" to forget; the pet knows none.", name));
		}
	}
	const removedReactionIds: string[] = [];
	for (const id of forgetReactionInputs.map(toChatPetLine)) {
		if (removedReactionIds.includes(id)) {
			continue;
		}
		if (knownReactions.some(reaction => reaction.id === id)) {
			removedReactionIds.push(id);
		} else {
			errors.push(localize('chatPet.lesson.unknownReaction', "There is no reaction with the id \"{0}\".", id));
		}
	}
	const available = [...knownMoves.filter(name => !forgottenMoves.includes(name)), ...moves.map(move => move.name)];
	// Built-in moves play too, but only taught moves count toward the limit.
	const playable = [...new Set([...available, ...builtInMoves])];
	const reactions: IChatPetReactionInput[] = [];
	for (const reactionInput of reactionInputs) {
		const reaction = isRecord(reactionInput) ? reactionInput : {};
		if (reaction.trigger !== undefined && !isChatPetReactionTrigger(reaction.trigger)) {
			errors.push(localize('chatPet.lesson.badTrigger', "A reaction's trigger must be \"message\" or one of {0}, not \"{1}\".", ChatPetBuiltInTriggers.join(', '), toChatPetLine(reaction.trigger) || String(reaction.trigger)));
			continue;
		}
		const sanitized = sanitizeChatPetReaction({
			trigger: reaction.trigger ?? 'message',
			when: toChatPetLine(reaction.when),
			phrases: isStringArray(reaction.phrases) ? reaction.phrases : [],
			play: toChatPetMoveName(toChatPetLine(reaction.play)),
		}, playable);
		if (typeof sanitized === 'string') {
			errors.push(sanitized);
		} else {
			reactions.push(sanitized);
		}
	}
	let play: string | undefined;
	if (playInput) {
		const name = toChatPetMoveName(playInput);
		if (isChatPetBuiltInReaction(name) || playable.includes(name)) {
			play = name;
		} else {
			errors.push(localize('chatPet.lesson.unknownPlay', "The pet doesn't know a move called \"{0}\"; it can play {1}.", playInput, [...playable, ...ChatPetBuiltInReactions].join(', ')));
		}
	}
	if (new Set(available).size > CHAT_PET_MAX_MOVES) {
		errors.push(localize('chatPet.lesson.tooManyMoves', "The pet can know at most {0} moves; forget some first.", CHAT_PET_MAX_MOVES));
	}
	const keptReactions = knownReactions.filter(reaction => !removedReactionIds.includes(reaction.id) && !forgottenMoves.includes(reaction.play));
	if (keptReactions.length + reactions.length > ChatPetReactionLimits.maxReactions) {
		errors.push(localize('chatPet.lesson.tooManyReactions', "The pet can know at most {0} reactions; remove some first.", ChatPetReactionLimits.maxReactions));
	}
	if (errors.length) {
		return { valid: false, errors };
	}
	return { valid: true, lesson: { moves, reactions, removedReactionIds, forgottenMoves, play } };
}

/** The shape the model uses to send and edit moves. */
function toChatPetMoveJson(move: IChatPetMove): object {
	return {
		name: move.name,
		about: move.about,
		loop: move.loop,
		...(move.still !== undefined ? { still: move.still + 1 } : {}),
		colors: move.colors,
		fixed: move.fixed,
		frames: move.frames.map(frame => ({ ms: frame.durationMs, rows: frame.rows })),
	};
}

/**
 * The guide an agent reads before teaching the pet: how to draw moves in layers, where the body's
 * parts are, the craft of the pet's own art, the examples it can study, how reactions match, and
 * what the pet knows now. Agents read tool results of a few thousand characters at once, and
 * longer ones only in part, so the guide stays short, and examples and taught moves come whole
 * only when asked for.
 */
export function getChatPetMoveGuide(moves: readonly IChatPetMove[], reactions: readonly IChatPetReaction[]): string {
	const { maxFrames, minFrameDurationMs, maxFrameDurationMs, maxTotalDurationMs, maxWidth, maxHeight } = ChatPetMoveLimits;
	const lines = [
		'The VS Code pet is a small pixel-art robot with two antennae that sits on the chat input. Teach it with teachPet: "moves" teaches or replaces moves, "preview": true returns a picture of every frame and saves nothing, "pastedMoves" teaches moves pasted as text, "reactions" play a move on messages or the pet\'s events, and "forgetMoves", "forgetReactions" (ids below) and "play" undo lessons or play.',
		'',
		'To teach a move:',
		'1. Plan it briefly: its story in key poses (anticipation, action, hold, settle) and the props or word it needs.',
		`2. Call petGuide with "examples" naming the one or two built-in moves closest to the request, and study them: ${ChatPetMoveExamples.map(example => `${example.move.name} (${example.shows})`).join(', ')}. The picture shows their still frames; if one is what the user asked for, start from it.`,
		'3. Draw the move in layers (below).',
		'4. Call teachPet with "preview": true and check every frame as a designer would: is each prop recognizable, shaded, where it belongs and visible on both themes, and does the motion flow? Fix it and preview again, at most twice.',
		'5. Call teachPet with the same lesson without "preview", then tell the user in a sentence or two what the pet learned.',
		'To change a move, call petGuide with "moves" naming it to get it whole, then send it back with the same name, changing only what was asked. A reaction that needs a new move: teach both in one call.',
		'',
		'Moves are drawn in layers, frame by frame: pose, then props, then text.',
		'- "name": 2 to 31 lowercase letters, digits and dashes, from what the user calls the move ("YES SIR" becomes "yes-sir"). Built-in reactions\' names are taken; a built-in move\'s name replaces it.',
		`- "frames": 1 to ${maxFrames}, each shown for "ms" (${minFrameDurationMs} to ${maxFrameDurationMs}), and ${maxTotalDurationMs} ms at most in all. "loop": false plays once, as reactions should. "still": the 1-based frame shown for reduced motion, the one that tells the story.`,
		'- "pose": idle (resting), crouch (squashed, to anticipate, bow or take a hit), airborne (the top of a hop) or love (heart antennae). "eyes": open (the default), right, up, up-right (looking at something), wide (surprised), happy (closed, smiling), squint (effort, laughter) or x (knocked out). "antennae": false takes them off, for headwear. "recolor" draws body letters as others in a frame, such as {"C":"Y","A":"y","B":"o"} for a flash.',
		'- "props": pictures drawn once as rows, one character per pixel: "." is transparent and any other letter or digit is a color declared in "colors" as "#rrggbb". C, A and B (the body\'s light, mid and dark) and E (its eyes) follow the pet\'s colors; never declare them. "place" puts props on a frame by their top-left pixel, such as [{"prop":"hat","x":0,"y":-1}], each covering those before it.',
		`- "text" writes a word in a shaded bold pixel font, such as [{"text":"YES!","x":0,"y":-8,"color":"gold"}]. Letters are 6 pixels tall and about 5 wide, 1 apart, with a pixel of shading on the left and below: YES! is 22x7, or 14x6 with "size":"small". Up to ${ChatPetMoveLayerLimits.maxTextLength} of A-Z, 0-9, spaces and ! ? . , ' - + :, in ${Object.keys(ChatPetMoveRamps).join(', ')}. It stays readable when the pet faces left.`,
		`- "rows" instead of a pose draws a frame's body yourself, bottom-left aligned; taught moves come back this way. At most ${ChatPetMoveLayerLimits.maxLayers} props and texts a frame.`,
		'',
		`Where things are: x grows right, y down. The body's box is x 0 to 11, y 0 to 11; the canvas reaches x ${maxWidth - 1} and y ${CHAT_PET_MOVE_HOME_SIZE - maxHeight}; the pet stands on row 11, and the chat input hides anything lower.`,
		'- idle: antenna tips at (2,0) and (9,0), head top at y 3, eyes at x 5 and 8 in rows 8 and 9.',
		'- crouch: antenna tips at (2,3) and (9,3), head top at y 6, eyes in rows 9 and 10.',
		'- airborne: antenna tips trailing at (2,0) and (4,0), head top at y 2, eyes in rows 6 and 7, rows 9 to 11 empty.',
		'- love: idle with a red heart in rows 0 to 3, and the head top at y 4.',
		...(['idle', 'crouch', 'airborne'] as const).flatMap(pose => [`${pose}:`, ...ChatPetMovePoses[pose]]),
		'',
		'Draw like the pet\'s art:',
		`- Shade each prop with 3 or 4 tones of its color, lit from the upper right: the lightest on top and right, the base in the middle, a shadow at the bottom and left, and the darkest as its outline, visible on both themes. Ramps, highlight to outline: ${Object.entries(ChatPetMoveRamps).map(([name, ramp]) => `${name} ${ramp.join(' ')}`).join('; ')}.`,
		'- Props are about the size of the head (6 to 12 pixels), with clean silhouettes: no stray pixels or dithering.',
		'- Headwear takes the antennae off: 8 to 12 pixels wide, its brim covering the head top. Held things start at an antenna tip. Floating things keep a row of air above the antenna tips, off the eyes. Things beside the pet start at x 12 to 14.',
		'- One short word at most (YES!, GO, LGTM); white text disappears on light themes, black on dark ones.',
		'',
		'Animate like the pet\'s own reactions: start and end on idle; anticipate with a crouch (80 to 150 ms), act, hold the key pose 400 to 900 ms, and settle. Props and words pop in and out over 2 or 3 frames (small, big, settled), particles fly on arcs and fade, and the eyes follow the action. Most moves have 8 to 13 frames over 1.5 to 3 seconds.',
		'',
		'Reactions:',
		`- "trigger": "message" (the default, needs "phrases") or one of the pet's own events, no phrases: ${ChatPetBuiltInTriggers.join(', ')}. Several matching a message take turns at random. On click the move joins the pet's own animations, one at random; any other event plays just this move instead of its own.`,
		'- Phrases match whole words anywhere in a message (any part of it in Chinese, Japanese or Thai), ignoring case and punctuation. Write 5 to 12 short phrases the user would really type then, including their own words; for "execute on our plan": "do it", "go ahead", "execute", "ship it". Avoid words most messages have.',
		`- "play": a move name or a built-in reaction: ${ChatPetBuiltInReactions.join(', ')}.`,
		'- "when": the situation in the user\'s words.',
		'',
		'What the pet knows now:',
		`- taught moves: ${moves.length ? moves.map(move => move.name).join(', ') : 'none'}`,
		// What users and agents wrote is quoted, so it reads as data rather than as instructions.
		...(reactions.length ? reactions.map(reaction => `- reaction ${reaction.id}: plays ${reaction.play} ${reaction.trigger === 'message' ? `on ${reaction.phrases.slice(0, CHAT_PET_GUIDE_MAX_PHRASES).map(phrase => JSON.stringify(phrase)).join(', ')}${reaction.phrases.length > CHAT_PET_GUIDE_MAX_PHRASES ? ', …' : ''}` : `on ${reaction.trigger}`}`) : ['- no reactions']),
	];
	return lines.join('\n');
}

/** How many moves an agent gets whole at a time, so they stay short enough to read at once. */
const CHAT_PET_GUIDE_MAX_MOVES = 2;
/** How many phrases of a reaction the guide shows, to tell it apart. */
const CHAT_PET_GUIDE_MAX_PHRASES = 3;

/**
 * Moves an agent asked for, whole: built-in moves in layers, to study before drawing a move like
 * them, and taught moves as rows, to change them. The moves come along, to picture every frame.
 */
export function getChatPetMovesGuide(taughtMoves: readonly IChatPetMove[], names: readonly string[]): { readonly text: string; readonly moves: readonly IChatPetMove[] } {
	const found: { readonly move: IChatPetMove; readonly json: object }[] = [];
	const unknown: string[] = [];
	for (const name of new Set(names.map(toChatPetMoveName))) {
		const taught = taughtMoves.find(move => move.name === name);
		const example = ChatPetMoveExamples.find(candidate => candidate.move.name === name)?.move;
		const builtIn = getChatPetBuiltInMoves().find(move => move.name === name);
		if (taught) {
			found.push({ move: taught, json: toChatPetMoveJson(taught) });
		} else if (example && builtIn) {
			found.push({ move: builtIn, json: example });
		} else {
			unknown.push(name);
		}
	}
	const shown = found.slice(0, CHAT_PET_GUIDE_MAX_MOVES);
	const lines: string[] = [];
	if (unknown.length) {
		lines.push(`The pet knows no move called ${unknown.map(name => JSON.stringify(name)).join(' or ')}; it knows ${[...new Set([...taughtMoves.map(move => move.name), ...getChatPetBuiltInMoveNames()])].join(', ')}.`);
	}
	if (shown.length) {
		lines.push(`The moves, whole: built-in moves in layers, taught moves as rows. The pictures show every frame of ${shown.map(({ move }) => move.name).join(', then ')}. To change one, send it back in "moves" with the same name, changing only what was asked.`, ...shown.map(({ json }) => JSON.stringify(json)));
	}
	if (found.length > shown.length) {
		lines.push(`Moves come ${CHAT_PET_GUIDE_MAX_MOVES} at a time; ask again for ${found.slice(shown.length).map(({ move }) => move.name).join(', ')}.`);
	}
	return { text: lines.join('\n'), moves: shown.map(({ move }) => move) };
}

export function describeChatPetMove(move: IChatPetMove): string {
	const seconds = (getChatPetMoveDuration(move) / 1000).toFixed(1);
	return move.loop
		? localize('chatPet.teach.describeLoop', "{0}: loops for a few seconds ({1} s each time)", move.name, seconds)
		: localize('chatPet.teach.describeOnce', "{0}: plays once ({1} s)", move.name, seconds);
}

export function describeChatPetReaction(reaction: IChatPetReactionInput): string {
	if (reaction.trigger !== 'message') {
		return localize('chatPet.teach.describeTriggered', "plays {0} when {1}", reaction.play, describeChatPetTrigger(reaction.trigger).description.replace(/\.$/, '').replace(/^\w/, letter => letter.toLowerCase()));
	}
	return localize('chatPet.teach.describeReaction', "plays {0} when a message contains {1}", reaction.play, reaction.phrases.map(phrase => `"${phrase}"`).join(', '));
}

type ChatPetPickItem = IQuickPickItem & ({ readonly kind: 'move'; readonly move: IChatPetMove } | { readonly kind: 'reaction'; readonly reaction: IChatPetReaction });

/**
 * Lists what the pet was taught, then its built-in moves: selecting a move plays it, and its
 * buttons copy it, as text to share, or forget it. Forgetting lists what is left, as a move takes
 * its reactions with it.
 */
export async function showChatPetTaughtMoves(quickInputService: IQuickInputService, chatPetService: IChatPetService, chatPetWidgetService: IChatPetWidgetService, clipboardService: IClipboardService): Promise<void> {
	const copyButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.copy), tooltip: localize('chatPet.teach.copyMove', "Copy Move") };
	const forgetButton: IQuickInputButton = { iconClass: ThemeIcon.asClassName(Codicon.trash), tooltip: localize('chatPet.teach.forget', "Forget") };
	const moves = chatPetService.moves.get();
	const reactions = chatPetService.reactions.get();
	const items: (ChatPetPickItem | IQuickPickSeparator)[] = [];
	if (moves.length) {
		items.push({ type: 'separator', label: localize('chatPet.teach.movesHeading', "Moves") });
		for (const move of moves) {
			items.push({ kind: 'move', move, label: describeChatPetMove(move), detail: move.about || undefined, buttons: [copyButton, forgetButton] });
		}
	}
	if (reactions.length) {
		items.push({ type: 'separator', label: localize('chatPet.teach.reactionsHeading', "Reactions") });
		reactions.forEach((reaction, index) => {
			items.push({ kind: 'reaction', reaction, label: localize('chatPet.teach.numberedReaction', "Reaction {0}: {1}", index + 1, describeChatPetReaction(reaction)), buttons: [forgetButton] });
		});
	}
	// Taught moves replace built-in moves with their names.
	const builtInMoves = getChatPetBuiltInMoves().filter(builtIn => !moves.some(move => move.name === builtIn.name));
	if (builtInMoves.length) {
		items.push({ type: 'separator', label: localize('chatPet.teach.builtInHeading', "Built-in Moves") });
		for (const move of builtInMoves) {
			items.push({ kind: 'move', move, label: describeChatPetMove(move), detail: describeChatPetBuiltInMove(move.name), buttons: [copyButton] });
		}
	}
	const picked = await quickInputService.pick(items, {
		placeHolder: localize('chatPet.teach.pickPlaceholder', "Select a move to play it. To see, edit or add moves and interactions, open Interactions or Sprites from the pet's context menu; to have an agent teach it, type /pet in the Agents window"),
		matchOnDetail: true,
		onDidTriggerItemButton: context => {
			const item = context.item as ChatPetPickItem;
			if (context.button === copyButton && item.kind === 'move') {
				void clipboardService.writeText(serializeChatPetMove(item.move));
				status(localize('chatPet.teach.copied', "Copied {0} to the clipboard", item.move.name));
			} else if (context.button === forgetButton) {
				if (item.kind === 'move') {
					chatPetService.forgetMove(item.move.name);
					status(localize('chatPet.teach.forgotMove', "Forgot {0}", item.move.name));
				} else {
					chatPetService.removeReaction(item.reaction.id);
					status(localize('chatPet.teach.forgotReaction', "Forgot the reaction that {0}", describeChatPetReaction(item.reaction)));
				}
				void showChatPetTaughtMoves(quickInputService, chatPetService, chatPetWidgetService, clipboardService);
			}
		},
	});
	if (picked?.kind === 'move' && !chatPetWidgetService.playReaction(picked.move.name)) {
		status(localize('chatPet.teach.cannotPlay', "The VS Code pet can't play {0} right now", picked.move.name));
	}
}
