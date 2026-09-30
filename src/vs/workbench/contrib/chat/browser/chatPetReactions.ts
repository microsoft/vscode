/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/** Reactions the pet already knows and can play on request, which taught reactions can play without a new move. */
export const ChatPetBuiltInReactions = ['love', 'cool', 'sing', 'worry', 'speechless', 'celebrate', 'clap', 'dizzy', 'jump'] as const;
export type ChatPetBuiltInReaction = typeof ChatPetBuiltInReactions[number];

/**
 * The pet's own animations: its reactions, and the states it holds while something goes on, which
 * play only through their triggers.
 */
export const ChatPetBuiltInAnimations = [...ChatPetBuiltInReactions, 'sleep', 'typing', 'thinking'] as const;
export type ChatPetBuiltInAnimation = typeof ChatPetBuiltInAnimations[number];

/**
 * The things that happen to the pet and make it play something. Each plays one of the pet's own
 * animations out of the box. A click has a pool: taught moves join its animations, and one of
 * the pool plays at random. Every other trigger plays one sprite: a taught move replaces the pet's
 * own animation for it.
 */
export const ChatPetBuiltInTriggers = ['click', 'requestDone', 'confirmation', 'dizzy', 'sleep', 'typing', 'responding'] as const;
export type ChatPetBuiltInTrigger = typeof ChatPetBuiltInTriggers[number];

/** What starts a reaction: a chat message the user sends with one of its phrases, or one of the pet's built-in triggers. */
export type ChatPetReactionTrigger = 'message' | ChatPetBuiltInTrigger;

/** The pet's own animations for each built-in trigger, in the order they are shown; one each, but for the click's pool. */
export const ChatPetBuiltInTriggerAnimations: Readonly<Record<ChatPetBuiltInTrigger, readonly ChatPetBuiltInAnimation[]>> = {
	click: ['celebrate', 'love', 'cool', 'sing', 'speechless', 'worry'],
	requestDone: ['celebrate'],
	confirmation: ['clap'],
	dizzy: ['dizzy'],
	sleep: ['sleep'],
	typing: ['typing'],
	responding: ['thinking'],
};

/** Whether a trigger plays one of several sprites at random, rather than the one sprite assigned to it. */
export function hasChatPetTriggerPool(trigger: ChatPetBuiltInTrigger): boolean {
	return trigger === 'click';
}

/**
 * A taught reaction: when its trigger happens, the pet plays `play`. A message reaction's phrases
 * are written once, when the reaction is taught, so matching a message is local, instant and free;
 * reactions to built-in triggers have no phrases. When several reactions answer the same message,
 * one of them plays at random, so a reaction that is alone on its phrases always plays. A reaction
 * to a click joins the pet's own animations for it, and one of the pool plays; a reaction to any
 * other built-in trigger is the one sprite it plays, in place of the pet's own animation, held for
 * as long as the trigger lasts.
 */
export interface IChatPetReaction {
	readonly id: string;
	readonly trigger: ChatPetReactionTrigger;
	/** What the reaction is about, in the user's words, e.g. "when I tell you to execute the plan". */
	readonly when: string;
	/** Normalized with {@link normalizeChatPetReactionText}; empty unless the trigger is `message`. */
	readonly phrases: readonly string[];
	/** A taught move name or a built-in reaction. */
	readonly play: string;
	/** Off, the reaction is kept and shown on the Interactions page, but doesn't play. */
	readonly enabled: boolean;
}

/** A reaction to store, as `sanitizeChatPetReaction` returns it; `enabled` defaults to on. */
export type IChatPetReactionInput = Omit<IChatPetReaction, 'id' | 'enabled'> & { readonly enabled?: boolean };

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

export function isChatPetBuiltInAnimation(name: string): name is ChatPetBuiltInAnimation {
	return (ChatPetBuiltInAnimations as readonly string[]).includes(name);
}

export function isChatPetBuiltInTrigger(value: unknown): value is ChatPetBuiltInTrigger {
	return typeof value === 'string' && (ChatPetBuiltInTriggers as readonly string[]).includes(value);
}

export function isChatPetReactionTrigger(value: unknown): value is ChatPetReactionTrigger {
	return value === 'message' || isChatPetBuiltInTrigger(value);
}

/** The key under which a built-in animation turned off for a trigger is remembered. */
export function getChatPetBuiltInReactionKey(trigger: ChatPetBuiltInTrigger, animation: ChatPetBuiltInAnimation): string {
	return `${trigger}/${animation}`;
}

/** A built-in trigger, as users see it. */
export function describeChatPetTrigger(trigger: ChatPetReactionTrigger): { readonly label: string; readonly description: string } {
	switch (trigger) {
		case 'message': return { label: localize('chatPet.trigger.message', "Message"), description: localize('chatPet.trigger.message.description', "A message you send contains one of the phrases.") };
		case 'click': return { label: localize('chatPet.trigger.click', "Clicked"), description: localize('chatPet.trigger.click.description', "You click the pet.") };
		case 'requestDone': return { label: localize('chatPet.trigger.requestDone', "Request finished"), description: localize('chatPet.trigger.requestDone.description', "The agent finishes answering.") };
		case 'confirmation': return { label: localize('chatPet.trigger.confirmation', "Confirmation needed"), description: localize('chatPet.trigger.confirmation.description', "The agent asks you to confirm something.") };
		case 'dizzy': return { label: localize('chatPet.trigger.dizzy', "Shaken"), description: localize('chatPet.trigger.dizzy.description', "The mouse darts back and forth over the pet.") };
		case 'sleep': return { label: localize('chatPet.trigger.sleep', "Falls asleep"), description: localize('chatPet.trigger.sleep.description', "Nothing has happened for a while.") };
		case 'typing': return { label: localize('chatPet.trigger.typing', "Typing"), description: localize('chatPet.trigger.typing.description', "You type in the chat input.") };
		case 'responding': return { label: localize('chatPet.trigger.responding', "Responding"), description: localize('chatPet.trigger.responding.description', "The agent is working on your request.") };
	}
}

/** One of the pet's own animations, as users see it. */
export function describeChatPetBuiltInAnimation(animation: ChatPetBuiltInAnimation): string {
	switch (animation) {
		case 'love': return localize('chatPet.animation.love', "Love");
		case 'cool': return localize('chatPet.animation.cool', "Sunglasses");
		case 'sing': return localize('chatPet.animation.sing', "Singing");
		case 'worry': return localize('chatPet.animation.worry', "Worried");
		case 'speechless': return localize('chatPet.animation.speechless', "Speechless");
		case 'celebrate': return localize('chatPet.animation.celebrate', "Button press");
		case 'clap': return localize('chatPet.animation.clap', "Clapping");
		case 'dizzy': return localize('chatPet.animation.dizzy', "Dizzy");
		case 'jump': return localize('chatPet.animation.jump', "Jump");
		case 'sleep': return localize('chatPet.animation.sleep', "Sleeping");
		case 'typing': return localize('chatPet.animation.typing', "Typing");
		case 'thinking': return localize('chatPet.animation.thinking', "Thinking");
	}
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

/** One of `candidates` at random, with `random` in [0, 1). */
function pickChatPetReaction(candidates: readonly IChatPetReaction[], random: () => number): IChatPetReaction | undefined {
	return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : undefined;
}

/**
 * The reaction to play for a message, if any. A phrase matches whole words, ignoring case and
 * punctuation, or anywhere in scripts written without spaces, such as Chinese. A reaction alone
 * on its phrases always plays; when several match, one of them plays at random.
 */
export function findChatPetReaction(message: string, reactions: readonly IChatPetReaction[], random: () => number): IChatPetReaction | undefined {
	const normalized = normalizeChatPetReactionText(message);
	if (!normalized) {
		return undefined;
	}
	const padded = ` ${normalized} `;
	const matches = (phrase: string) => UNSPACED_SCRIPTS.test(phrase) ? normalized.includes(phrase) : padded.includes(` ${phrase} `);
	return pickChatPetReaction(reactions.filter(reaction => reaction.enabled && reaction.trigger === 'message' && reaction.phrases.some(matches)), random);
}

/** What a built-in trigger plays: one of the pet's own animations, or the move of a taught reaction. */
export type ChatPetTriggerPick =
	| { readonly animation: ChatPetBuiltInAnimation; readonly move?: undefined }
	| { readonly animation?: undefined; readonly move: string; readonly reactionId: string };

/** An entry of a built-in trigger's pool: what it can play, and whether it is on. */
export interface IChatPetTriggerPoolEntry {
	readonly pick: ChatPetTriggerPick;
	readonly enabled: boolean;
}

/**
 * The one sprite a built-in trigger without a pool plays: the pet's own animation for it, a
 * sprite assigned in its place, or nothing when the user turned the trigger off.
 */
export type ChatPetTriggerSprite =
	| { readonly kind: 'own'; readonly play?: undefined }
	| { readonly kind: 'nothing'; readonly play?: undefined }
	| { readonly kind: 'sprite'; readonly play: string; readonly reactionId: string };

/** What a built-in trigger without a pool plays: the newest taught reaction for it that is on replaces the pet's own animation. */
export function getChatPetTriggerSprite(trigger: ChatPetBuiltInTrigger, reactions: readonly IChatPetReaction[], disabledBuiltIns: readonly string[]): ChatPetTriggerSprite {
	const assigned = reactions.filter(reaction => reaction.trigger === trigger && reaction.enabled).at(-1);
	if (assigned) {
		return { kind: 'sprite', play: assigned.play, reactionId: assigned.id };
	}
	return disabledBuiltIns.includes(getChatPetBuiltInReactionKey(trigger, ChatPetBuiltInTriggerAnimations[trigger][0])) ? { kind: 'nothing' } : { kind: 'own' };
}

/**
 * Everything a built-in trigger can play, on or off. A click's pool holds the pet's own animations
 * for it, then the taught reactions for it. Any other trigger holds one entry: the sprite assigned
 * to it, or else the pet's own animation, off when the trigger was turned off.
 */
export function getChatPetTriggerPool(trigger: ChatPetBuiltInTrigger, reactions: readonly IChatPetReaction[], disabledBuiltIns: readonly string[]): IChatPetTriggerPoolEntry[] {
	if (!hasChatPetTriggerPool(trigger)) {
		const sprite = getChatPetTriggerSprite(trigger, reactions, disabledBuiltIns);
		return sprite.kind === 'sprite'
			? [{ pick: { move: sprite.play, reactionId: sprite.reactionId }, enabled: true }]
			: [{ pick: { animation: ChatPetBuiltInTriggerAnimations[trigger][0] }, enabled: sprite.kind === 'own' }];
	}
	return [
		...ChatPetBuiltInTriggerAnimations[trigger].map(animation => ({ pick: { animation }, enabled: !disabledBuiltIns.includes(getChatPetBuiltInReactionKey(trigger, animation)) })),
		...reactions.filter(reaction => reaction.trigger === trigger).map(reaction => ({ pick: { move: reaction.play, reactionId: reaction.id }, enabled: reaction.enabled })),
	];
}

/**
 * What a built-in trigger plays this time: one of the pool entries that are on, at random, not
 * `previous` again when there is a choice. Undefined when nothing is on.
 */
export function pickChatPetTriggerReaction(trigger: ChatPetBuiltInTrigger, reactions: readonly IChatPetReaction[], disabledBuiltIns: readonly string[], random: () => number, previous?: string): ChatPetTriggerPick | undefined {
	const pool = getChatPetTriggerPool(trigger, reactions, disabledBuiltIns).filter(entry => entry.enabled).map(entry => entry.pick);
	const candidates = previous !== undefined && pool.length > 1 ? pool.filter(pick => (pick.animation ?? pick.move) !== previous) : pool;
	return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : undefined;
}

/**
 * Checks and tidies a reaction before it is stored: normalizes its phrases and drops duplicate or
 * empty ones. Returns a localized error when the reaction can't be used. `knownMoves` are the
 * names of taught moves `play` may refer to.
 */
export function sanitizeChatPetReaction(input: IChatPetReactionInput, knownMoves: readonly string[]): Omit<IChatPetReaction, 'id'> | string {
	const play = input.play.trim().toLowerCase();
	if (!isChatPetBuiltInReaction(play) && !knownMoves.includes(play)) {
		return localize('chatPet.reaction.unknownMove', "The pet doesn't know a move called \"{0}\" yet.", input.play);
	}
	const phrases: string[] = [];
	if (input.trigger === 'message') {
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
	}
	return {
		trigger: input.trigger,
		when: input.when.trim().slice(0, ChatPetReactionLimits.maxWhenLength),
		phrases,
		play,
		enabled: input.enabled ?? true,
	};
}
