/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatPetMovePoses, IChatPetMove, parseChatPetMove } from '../../browser/chatPetMoves.js';
import { findChatPetReaction, IChatPetReaction, normalizeChatPetReactionText, sanitizeChatPetReaction } from '../../browser/chatPetReactions.js';
import { ChatPetService } from '../../browser/chatPetService.js';

function reaction(play: string, phrases: string[], chance = 1): IChatPetReaction {
	return { id: play, when: '', phrases, play, chance };
}

function move(name: string): IChatPetMove {
	return parseChatPetMove(`name: ${name}\nloop: no\n\nframe 200\n${ChatPetMovePoses.idle.join('\n')}`);
}

suite('ChatPetReactions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches whole phrases, ignoring case, punctuation and curly quotes', () => {
		const reactions = [reaction('yes-sir', ['do it', 'let\'s go', 'execute the plan', '开始吧'])];
		const played = (message: string) => findChatPetReaction(message, reactions, () => 0)?.play;
		assert.deepStrictEqual({
			normalized: normalizeChatPetReactionText('  OK, Do it!!  Let’s   GO. '),
			// Vowel signs are part of the word, not punctuation.
			combiningMarks: normalizeChatPetReactionText('अभी करो!'),
			plain: played('do it'),
			inSentence: played('Great plan. Do it now, please.'),
			curly: played('Let’s go!'),
			// Chinese, like Japanese and Thai, has no spaces between words.
			unspaced: played('好的开始吧！'),
			partialWord: played('undo it'),
			otherText: played('what do you think?'),
			empty: played('   '),
		}, {
			normalized: 'ok do it let\'s go',
			combiningMarks: 'अभी करो',
			plain: 'yes-sir',
			inSentence: 'yes-sir',
			curly: 'yes-sir',
			unspaced: 'yes-sir',
			partialWord: undefined,
			otherText: undefined,
			empty: undefined,
		});
	});

	test('tries matching reactions in order, each with its own chance', () => {
		const reactions = [reaction('jump', ['do it'], 0.3), reaction('love', ['do it'], 1)];
		const rolls = (values: number[]) => findChatPetReaction('do it', reactions, () => values.shift()!)?.play;
		assert.deepStrictEqual([rolls([0.1]), rolls([0.5, 0.9]), rolls([0.29])], ['jump', 'love', 'jump']);
	});

	test('tidies reactions and rejects unusable ones', () => {
		assert.deepStrictEqual({
			tidy: sanitizeChatPetReaction({ when: '  when I say go  ', phrases: [' Do it ', 'do it!', '', 'go ahead'], play: 'Yes-Sir', chance: 7 }, ['yes-sir']),
			builtIn: sanitizeChatPetReaction({ when: '', phrases: ['yay'], play: 'celebrate', chance: 0 }, []),
			unknownMove: typeof sanitizeChatPetReaction({ when: '', phrases: ['yay'], play: 'moonwalk', chance: 1 }, []),
			noPhrases: typeof sanitizeChatPetReaction({ when: '', phrases: ['!!', ' '], play: 'love', chance: 1 }, []),
		}, {
			tidy: { when: 'when I say go', phrases: ['do it', 'go ahead'], play: 'yes-sir', chance: 1 },
			builtIn: { when: '', phrases: ['yay'], play: 'celebrate', chance: 0.01 },
			unknownMove: 'string',
			noPhrases: 'string',
		});
	});
});

suite('ChatPetService taught moves', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(storage = disposables.add(new TestStorageService())) {
		return { storage, service: disposables.add(new ChatPetService(storage, NullTelemetryService, new NullLogService())) };
	}

	test('learns moves and reactions, shares them through storage and forgets them together', () => {
		const { storage, service } = createService();
		service.learnMove(move('yes-sir'));
		service.learnMove(move('wave'));
		service.learnMove(move('yes-sir'));
		const salute = service.addReaction({ when: 'when I tell you to execute the plan', phrases: ['do it', 'execute the plan'], play: 'yes-sir', chance: 1 });
		service.addReaction({ when: 'sometimes when I say go', phrases: ['go'], play: 'jump', chance: 0.25 });
		// Built-in moves play too, without being taught.
		service.addReaction({ when: 'when I say howdy', phrases: ['howdy'], play: 'cowboy', chance: 1 });
		const other = disposables.add(new ChatPetService(storage, NullTelemetryService, new NullLogService()));
		const stored = {
			moves: other.moves.get().map(move => move.name),
			reactions: other.reactions.get().map(reaction => `${reaction.play}:${reaction.phrases.join('|')}:${reaction.chance}`),
		};
		assert.strictEqual(service.forgetMove('yes-sir'), true);
		assert.deepStrictEqual({
			stored,
			removedSalute: !service.reactions.get().some(reaction => reaction.id === salute.id),
			afterForget: { moves: service.moves.get().map(move => move.name), reactions: service.reactions.get().map(reaction => reaction.play) },
			syncedOther: other.moves.get().map(move => move.name),
			forgetUnknown: service.forgetMove('moonwalk'),
		}, {
			stored: { moves: ['wave', 'yes-sir'], reactions: ['yes-sir:do it|execute the plan:1', 'jump:go:0.25', 'cowboy:howdy:1'] },
			removedSalute: true,
			afterForget: { moves: ['wave'], reactions: ['jump', 'cowboy'] },
			syncedOther: ['wave'],
			forgetUnknown: false,
		});
	});

	test('ignores corrupt stored data', () => {
		const storage = disposables.add(new TestStorageService());
		storage.store('chat.vscodePet.moves', JSON.stringify(['name: ok\n\nframe 100\n' + ChatPetMovePoses.idle.join('\n'), 'not a move', 42, 'name: Bad\n\nframe 100\n' + ChatPetMovePoses.idle.join('\n')]), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storage.store('chat.vscodePet.reactions', JSON.stringify([
			{ id: 'a', when: '', phrases: ['Go!'], play: 'ok', chance: 1 },
			{ id: 'b', when: '', phrases: ['go'], play: 'gone', chance: 1 },
			{ id: 'c', phrases: 'go', play: 'ok' },
			'not a reaction',
		]), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		const { service } = createService(storage);
		const unreadable = disposables.add(new TestStorageService());
		unreadable.store('chat.vscodePet.reactions', '{not json', StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		assert.deepStrictEqual({
			moves: service.moves.get().map(move => move.name),
			reactions: service.reactions.get(),
			unreadable: createService(unreadable).service.reactions.get(),
		}, { moves: ['ok'], reactions: [{ id: 'a', when: '', phrases: ['go'], play: 'ok', chance: 1 }], unreadable: [] });
	});
});
