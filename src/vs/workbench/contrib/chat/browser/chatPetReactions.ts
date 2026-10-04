/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** Reactions the pet already knows, which taught reactions can play without a new move. */
export const ChatPetBuiltInReactions = ['love', 'cool', 'sing', 'worry', 'speechless', 'celebrate', 'dizzy', 'jump'] as const;
export type ChatPetBuiltInReaction = typeof ChatPetBuiltInReactions[number];

/**
 * A taught reaction: when a chat message contains one of `phrases`, the pet plays `play` with
 * probability `chance`. The phrases are written once, when the reaction is taught, so matching a
 * message is local, instant and free.
 */
export interface IChatPetReaction {
	readonly id: string;
	/** What the reaction is about, in the user's words, e.g. "when I tell you to execute the plan". */
	readonly when: string;
	/** Normalized with {@link normalizeChatPetReactionText}. */
	readonly phrases: readonly string[];
	/** A taught move name or a built-in reaction. */
	readonly play: string;
	readonly chance: number;
}

export type IChatPetReactionInput = Omit<IChatPetReaction, 'id'>;

export const ChatPetReactionLimits = {
	maxReactions: 24,
	maxPhrases: 24,
	maxPhraseLength: 60,
	maxWhenLength: 200,
} as const;

/** Scripts written without spaces between words, where a phrase can match inside a longer run of text. */
const UNSPACED_SCRIPTS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export function isChatPetBuiltInReaction(name: string): name is ChatPetBuiltInReaction {
	return (ChatPetBuiltInReactions as readonly string[]).includes(name);
}

/** Lowercases, turns curly quotes into straight ones, drops other punctuation and collapses spaces. */
export function normalizeChatPetReactionText(text: string): string {
	return text
		.toLowerCase()
		.replace(/[\u2018\u2019\u02bc]/g, '\'')
		.replace(/[^\p{L}\p{M}\p{N}'\s]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The reaction to play for a message, if any. A phrase matches whole words, ignoring case and
 * punctuation, or anywhere in scripts written without spaces, such as Chinese. Matching reactions
 * are tried in order, each with its own chance, and the first one that wins its roll plays.
 */
export function findChatPetReaction(message: string, reactions: readonly IChatPetReaction[], random: () => number): IChatPetReaction | undefined {
	const normalized = normalizeChatPetReactionText(message);
	if (!normalized) {
		return undefined;
	}
	const padded = ` ${normalized} `;
	const matches = (phrase: string) => UNSPACED_SCRIPTS.test(phrase) ? normalized.includes(phrase) : padded.includes(` ${phrase} `);
	return reactions.find(reaction => reaction.phrases.some(matches) && random() < reaction.chance);
}

/**
 * Checks and tidies a reaction before it is stored: normalizes its phrases, drops duplicate or empty
 * ones and clamps the chance to (0, 1]. Returns a localized error when the reaction can't be used.
 * `knownMoves` are the names of taught moves `play` may refer to.
 */
export function sanitizeChatPetReaction(input: IChatPetReactionInput, knownMoves: readonly string[]): IChatPetReactionInput | string {
	const play = input.play.trim().toLowerCase();
	if (!isChatPetBuiltInReaction(play) && !knownMoves.includes(play)) {
		return localize('chatPet.reaction.unknownMove', "The pet doesn't know a move called \"{0}\" yet.", input.play);
	}
	const phrases: string[] = [];
	for (const phrase of input.phrases) {
		const normalized = normalizeChatPetReactionText(phrase.slice(0, ChatPetReactionLimits.maxPhraseLength));
		if (normalized && !phrases.includes(normalized)) {
			phrases.push(normalized);
		}
		if (phrases.length === ChatPetReactionLimits.maxPhrases) {
			break;
		}
	}
	if (!phrases.length) {
		return localize('chatPet.reaction.noPhrases', "The reaction needs at least one phrase to listen for.");
	}
	const chance = Number.isFinite(input.chance) ? Math.min(1, Math.max(0.01, input.chance)) : 1;
	return {
		when: input.when.trim().slice(0, ChatPetReactionLimits.maxWhenLength),
		phrases,
		play,
		chance,
	};
}
