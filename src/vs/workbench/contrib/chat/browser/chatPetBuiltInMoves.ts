/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../base/common/arrays.js';
import { localize } from '../../../../nls.js';
import { ChatPetMoveExamples } from './chatPetMoveExamples.js';
import { readChatPetMove } from './chatPetMoveLayers.js';
import { IChatPetMove } from './chatPetMoves.js';

let builtInMoves: readonly IChatPetMove[] | undefined;

/**
 * The moves the pet knows out of the box: the examples the guide teaches agents with, which play
 * by name like taught moves. A taught move with the same name replaces one. They can't be
 * forgotten, and they don't count toward the moves the pet can learn.
 */
export function getChatPetBuiltInMoves(): readonly IChatPetMove[] {
	builtInMoves ??= coalesce(ChatPetMoveExamples.map(example => readChatPetMove(example.move, [])));
	return builtInMoves;
}

/** The names of the built-in moves, without composing them. */
export function getChatPetBuiltInMoveNames(): string[] {
	return ChatPetMoveExamples.map(example => example.move.name);
}

/** The move the pet plays for a name: the taught move, or else the built-in one. */
export function findChatPetMove(taughtMoves: readonly IChatPetMove[], name: string): IChatPetMove | undefined {
	return taughtMoves.find(move => move.name === name) ?? getChatPetBuiltInMoves().find(move => move.name === name);
}

/** What a built-in move shows, for users; their `about` is written for agents, in English. */
export function describeChatPetBuiltInMove(name: string): string | undefined {
	switch (name) {
		case 'yes': return localize('chatPet.builtIn.yes', "Jumps for joy as a big gold YES! pops up");
		case 'idea': return localize('chatPet.builtIn.idea', "A light bulb flickers on above its head");
		case 'ship-it': return localize('chatPet.builtIn.shipIt', "A little rocket blasts off beside it");
		case 'cowboy': return localize('chatPet.builtIn.cowboy', "Puts on a cowboy hat, twirls a lasso and tips the hat");
		case 'rubber-duck': return localize('chatPet.builtIn.rubberDuck', "Presses a rubber duck, which squeaks");
		case 'magic': return localize('chatPet.builtIn.magic', "Swishes a magic wand and stars burst out");
		case 'trophy': return localize('chatPet.builtIn.trophy', "A gold trophy rises beside it and shines");
		case 'debug': return localize('chatPet.builtIn.debug', "Squashes a bug with a hammer");
		case 'coffee': return localize('chatPet.builtIn.coffee', "A steaming mug of coffee appears");
		case 'zapped': return localize('chatPet.builtIn.zapped', "A storm cloud strikes it with lightning");
		default: return undefined;
	}
}
