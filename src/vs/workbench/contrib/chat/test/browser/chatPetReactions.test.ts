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
import { findChatPetReaction, getChatPetTriggerPool, getChatPetTriggerSprite, IChatPetReaction, normalizeChatPetReactionText, pickChatPetTriggerReaction, sanitizeChatPetReaction } from '../../browser/chatPetReactions.js';
import { ChatPetService } from '../../browser/chatPetService.js';

function reaction(play: string, phrases: string[]): IChatPetReaction {
	return { id: play, trigger: 'message', when: '', phrases, play, enabled: true };
}

function clickReaction(play: string): IChatPetReaction {
	return { id: `click-${play}`, trigger: 'click', when: '', phrases: [], play, enabled: true };
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

	test('a reaction alone on its phrases always plays; one of several matches plays at random', () => {
		const reactions = [reaction('jump', ['do it']), reaction('love', ['do it', 'go ahead']), reaction('cool', ['ship it']), { ...reaction('wave', ['bye']), enabled: false }];
		const played = (message: string, roll: number) => findChatPetReaction(message, reactions, () => roll)?.play;
		assert.deepStrictEqual({
			alone: [played('go ahead', 0), played('go ahead', 0.99), played('ship it', 0.5)],
			// Two match "do it": the roll picks one of them, never the third.
			shared: [played('do it', 0), played('do it', 0.49), played('do it', 0.5), played('do it', 0.999)],
			none: played('hello', 0),
			// A reaction turned off is kept but never plays.
			off: played('bye', 0),
		}, {
			alone: ['love', 'love', 'cool'],
			shared: ['jump', 'jump', 'love', 'love'],
			none: undefined,
			off: undefined,
		});
	});

	test('a click plays one of its pool; any other trigger plays the one sprite assigned to it, or else its own animation', () => {
		const reactions = [reaction('love', ['click']), clickReaction('angry'), clickReaction('yes'), { ...clickReaction('ship-it'), trigger: 'requestDone' as const }, { ...clickReaction('bow'), enabled: false }];
		const describe = (pick: ReturnType<typeof pickChatPetTriggerReaction>) => pick?.animation ?? pick?.move;
		const describePool = (entries: ReturnType<typeof getChatPetTriggerPool>) => entries.map(entry => `${describe(entry.pick)}${entry.enabled ? '' : ' (off)'}`);
		// Six built-in click animations and two taught moves that are on: the roll picks across those eight, never the move turned off.
		const click = (roll: number, previous?: string) => describe(pickChatPetTriggerReaction('click', reactions, [], () => roll, previous));
		// Two reactions on one trigger without a pool: the newest that is on plays; off, they leave the pet's own animation.
		const twice = [{ ...clickReaction('ship-it'), trigger: 'requestDone' as const }, { ...clickReaction('yes'), id: 'later', trigger: 'requestDone' as const }];
		assert.deepStrictEqual({
			messageIgnoresClickReactions: findChatPetReaction('click', reactions, () => 0)?.play,
			pool: describePool(getChatPetTriggerPool('click', reactions, [])),
			roll: [click(0), click(0.74), click(0.75), click(0.999)],
			// The previous pick is skipped while there is a choice.
			notAgain: [click(0, 'celebrate'), click(0.999, 'yes')],
			// The move taught for finished requests replaces the button press, whether or not that is turned off.
			replaced: describePool(getChatPetTriggerPool('requestDone', reactions, [])),
			replacedPlays: [describe(pickChatPetTriggerReaction('requestDone', reactions, [], () => 0.999)), describe(pickChatPetTriggerReaction('requestDone', reactions, ['requestDone/celebrate'], () => 0))],
			assigned: getChatPetTriggerSprite('requestDone', reactions, []),
			// Turned off with nothing assigned, a trigger plays nothing.
			off: describePool(getChatPetTriggerPool('confirmation', reactions, ['confirmation/clap'])),
			offPlays: pickChatPetTriggerReaction('confirmation', reactions, ['confirmation/clap'], () => 0),
			nothing: getChatPetTriggerSprite('confirmation', reactions, ['confirmation/clap']),
			// A trigger nothing was taught for plays its own animation, every time.
			untouched: [describe(pickChatPetTriggerReaction('sleep', reactions, [], () => 0)), describe(pickChatPetTriggerReaction('sleep', reactions, [], () => 0.999, 'sleep'))],
			own: getChatPetTriggerSprite('sleep', reactions, []),
			newestWins: getChatPetTriggerSprite('requestDone', twice, []).play,
			offFallsBack: getChatPetTriggerSprite('requestDone', twice.map(candidate => ({ ...candidate, enabled: false })), []).kind,
		}, {
			messageIgnoresClickReactions: 'love',
			pool: ['celebrate', 'love', 'cool', 'sing', 'speechless', 'worry', 'angry', 'yes', 'bow (off)'],
			roll: ['celebrate', 'worry', 'angry', 'yes'],
			notAgain: ['love', 'angry'],
			replaced: ['ship-it'],
			replacedPlays: ['ship-it', 'ship-it'],
			assigned: { kind: 'sprite', play: 'ship-it', reactionId: 'click-ship-it' },
			off: ['clap (off)'],
			offPlays: undefined,
			nothing: { kind: 'nothing' },
			untouched: ['sleep', 'sleep'],
			own: { kind: 'own' },
			newestWins: 'yes',
			offFallsBack: 'own',
		});
	});

	test('tidies reactions and rejects unusable ones', () => {
		assert.deepStrictEqual({
			tidy: sanitizeChatPetReaction({ trigger: 'message', when: '  when I say go  ', phrases: [' Do it ', 'do it!', '', 'go ahead'], play: 'Yes-Sir' }, ['yes-sir']),
			builtIn: sanitizeChatPetReaction({ trigger: 'message', when: '', phrases: ['yay'], play: 'celebrate' }, []),
			// Click reactions listen for no phrases, so any given are dropped.
			click: sanitizeChatPetReaction({ trigger: 'click', when: 'sometimes when clicked', phrases: ['ignored'], play: 'yes-sir' }, ['yes-sir']),
			unknownMove: typeof sanitizeChatPetReaction({ trigger: 'message', when: '', phrases: ['yay'], play: 'moonwalk' }, []),
			noPhrases: typeof sanitizeChatPetReaction({ trigger: 'message', when: '', phrases: ['!!', ' '], play: 'love' }, []),
			off: sanitizeChatPetReaction({ trigger: 'click', when: '', phrases: [], play: 'love', enabled: false }, []),
			// Any sprite plays on any of the pet's events, built-in moves and its own reactions included.
			builtInMoveOnEvent: sanitizeChatPetReaction({ trigger: 'sleep', when: '', phrases: [], play: 'cowboy' }, ['cowboy']),
			reactionOnEvent: sanitizeChatPetReaction({ trigger: 'sleep', when: '', phrases: [], play: 'love' }, []),
		}, {
			tidy: { trigger: 'message', when: 'when I say go', phrases: ['do it', 'go ahead'], play: 'yes-sir', enabled: true },
			builtIn: { trigger: 'message', when: '', phrases: ['yay'], play: 'celebrate', enabled: true },
			click: { trigger: 'click', when: 'sometimes when clicked', phrases: [], play: 'yes-sir', enabled: true },
			unknownMove: 'string',
			noPhrases: 'string',
			off: { trigger: 'click', when: '', phrases: [], play: 'love', enabled: false },
			builtInMoveOnEvent: { trigger: 'sleep', when: '', phrases: [], play: 'cowboy', enabled: true },
			reactionOnEvent: { trigger: 'sleep', when: '', phrases: [], play: 'love', enabled: true },
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
		const salute = service.addReaction({ trigger: 'message', when: 'when I tell you to execute the plan', phrases: ['do it', 'execute the plan'], play: 'yes-sir' });
		service.addReaction({ trigger: 'message', when: 'sometimes when I say go', phrases: ['go'], play: 'jump' });
		// Built-in moves play too, without being taught.
		service.addReaction({ trigger: 'message', when: 'when I say howdy', phrases: ['howdy'], play: 'cowboy' });
		service.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		const other = disposables.add(new ChatPetService(storage, NullTelemetryService, new NullLogService()));
		const stored = {
			moves: other.moves.get().map(move => move.name),
			reactions: other.reactions.get().map(reaction => `${reaction.trigger}:${reaction.play}:${reaction.phrases.join('|')}`),
		};
		assert.strictEqual(service.forgetMove('yes-sir'), true);
		assert.deepStrictEqual({
			stored,
			removedSalute: !service.reactions.get().some(reaction => reaction.id === salute.id),
			afterForget: { moves: service.moves.get().map(move => move.name), reactions: service.reactions.get().map(reaction => reaction.play) },
			syncedOther: other.moves.get().map(move => move.name),
			forgetUnknown: service.forgetMove('moonwalk'),
		}, {
			stored: { moves: ['wave', 'yes-sir'], reactions: ['message:yes-sir:do it|execute the plan', 'message:jump:go', 'message:cowboy:howdy', 'click:wave:'] },
			removedSalute: true,
			afterForget: { moves: ['wave'], reactions: ['jump', 'cowboy', 'wave'] },
			syncedOther: ['wave'],
			forgetUnknown: false,
		});
	});

	test('changes a reaction in place and replaces everything taught, keeping the ids of unchanged reactions', () => {
		const { service } = createService();
		service.learnMove(move('wave'));
		service.learnMove(move('bow'));
		const kept = service.addReaction({ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' });
		const changed = service.addReaction({ trigger: 'click', when: '', phrases: [], play: 'bow' });
		const updated = service.updateReaction(changed.id, { trigger: 'click', when: 'now and then', phrases: [], play: 'bow' });
		// Turning a reaction off keeps it; a change that says nothing about it leaves it off.
		const turnedOff = service.setReactionEnabled(kept.id, false);
		service.updateReaction(kept.id, { trigger: 'message', when: '', phrases: ['hello', 'hey'], play: 'wave' });
		const afterUpdate = service.reactions.get().map(reaction => `${reaction.id}:${reaction.play}:${reaction.when}:${reaction.enabled}`);
		service.replaceTaught([move('bow'), move('nod')], [
			{ trigger: 'click', when: 'now and then', phrases: [], play: 'bow' },
			{ trigger: 'message', when: '', phrases: ['hi'], play: 'nod' },
		]);
		const replaced = service.reactions.get();
		assert.deepStrictEqual({
			updated,
			turnedOff,
			turnOffUnknown: service.setReactionEnabled('nope', false),
			updateUnknown: service.updateReaction('nope', { trigger: 'click', when: '', phrases: [], play: 'bow' }),
			afterUpdate,
			moves: service.moves.get().map(move => move.name),
			keptId: replaced[0].id === changed.id,
			newId: replaced[1].id !== kept.id && replaced[1].id !== changed.id,
			plays: replaced.map(reaction => reaction.play),
		}, {
			updated: true,
			turnedOff: true,
			turnOffUnknown: false,
			updateUnknown: false,
			afterUpdate: [`${kept.id}:wave::false`, `${changed.id}:bow:now and then:true`],
			moves: ['bow', 'nod'],
			keptId: true,
			newId: true,
			plays: ['bow', 'nod'],
		});
	});

	test('keeps one reaction per trigger without a pool: a new one replaces it, and the last one written as text stays', () => {
		const { service } = createService();
		service.learnMove(move('wave'));
		service.learnMove(move('bow'));
		const first = service.addReaction({ trigger: 'requestDone', when: '', phrases: [], play: 'wave' });
		const second = service.addReaction({ trigger: 'requestDone', when: '', phrases: [], play: 'bow' });
		// Clicks and messages add up as before.
		service.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		service.addReaction({ trigger: 'click', when: '', phrases: [], play: 'bow' });
		const kept = service.addReaction({ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' });
		const afterAdd = service.reactions.get().map(reaction => `${reaction.trigger}:${reaction.play}`);
		// Moving a text interaction onto a trigger takes that trigger over too.
		service.updateReaction(kept.id, { trigger: 'requestDone', when: '', phrases: [], play: 'wave' });
		const afterUpdate = { reactions: service.reactions.get().map(reaction => `${reaction.trigger}:${reaction.play}`), firstGone: !service.reactions.get().some(reaction => reaction.id === first.id), secondGone: !service.reactions.get().some(reaction => reaction.id === second.id), keptId: service.reactions.get().some(reaction => reaction.id === kept.id) };
		// Setting the sprite an event plays: a sprite, the pet's own animation, or nothing; each undoes the others.
		service.setTriggerSprite('sleep', { kind: 'sprite', play: 'bow' });
		const assigned = { reactions: service.reactions.get().filter(reaction => reaction.trigger === 'sleep').map(reaction => reaction.play), disabled: [...service.disabledBuiltInReactions.get()] };
		service.setTriggerSprite('sleep', { kind: 'nothing' });
		const nothing = { reactions: service.reactions.get().filter(reaction => reaction.trigger === 'sleep').length, disabled: [...service.disabledBuiltInReactions.get()] };
		service.setTriggerSprite('sleep', { kind: 'own' });
		const own = { reactions: service.reactions.get().filter(reaction => reaction.trigger === 'sleep').length, disabled: [...service.disabledBuiltInReactions.get()] };
		service.replaceTaught([move('wave'), move('bow')], [
			{ trigger: 'typing', when: '', phrases: [], play: 'wave' },
			{ trigger: 'click', when: '', phrases: [], play: 'wave' },
			{ trigger: 'click', when: '', phrases: [], play: 'bow' },
			{ trigger: 'typing', when: '', phrases: [], play: 'bow' },
		]);
		assert.deepStrictEqual({
			afterAdd,
			afterUpdate,
			assigned, nothing, own,
			written: service.reactions.get().map(reaction => `${reaction.trigger}:${reaction.play}`),
		}, {
			afterAdd: ['requestDone:bow', 'click:wave', 'click:bow', 'message:wave'],
			afterUpdate: { reactions: ['click:wave', 'click:bow', 'requestDone:wave'], firstGone: true, secondGone: true, keptId: true },
			assigned: { reactions: ['bow'], disabled: [] },
			nothing: { reactions: 0, disabled: ['sleep/sleep'] },
			own: { reactions: 0, disabled: [] },
			written: ['click:wave', 'click:bow', 'typing:bow'],
		});
	});

	test('turns the pet\'s own animations off and on for their triggers, shared through storage', () => {
		const { storage, service } = createService();
		service.setBuiltInReactionEnabled('click', 'worry', false);
		service.setBuiltInReactionEnabled('requestDone', 'celebrate', false);
		service.setBuiltInReactionEnabled('click', 'worry', false);
		const other = disposables.add(new ChatPetService(storage, NullTelemetryService, new NullLogService()));
		const stored = [...other.disabledBuiltInReactions.get()];
		service.setBuiltInReactionEnabled('click', 'worry', true);
		const afterEnable = [...service.disabledBuiltInReactions.get()];
		// Restoring the defaults turns everything back on and forgets what was taught for the pet's events, not for messages.
		service.learnMove(move('wave'));
		service.addReaction({ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' });
		service.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		service.resetBuiltInReactions();
		const reset = { reactions: service.reactions.get().map(reaction => reaction.trigger), disabled: [...service.disabledBuiltInReactions.get()] };
		// Keys for triggers or animations that don't exist are dropped when read.
		storage.store('chat.vscodePet.disabledBuiltInReactions', JSON.stringify(['click/worry', 'click/moonwalk', 'hover/love', 42, 'click/worry']), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		assert.deepStrictEqual({
			stored,
			afterEnable,
			reset,
			cleaned: [...createService(storage).service.disabledBuiltInReactions.get()],
		}, {
			stored: ['click/worry', 'requestDone/celebrate'],
			afterEnable: ['requestDone/celebrate'],
			reset: { reactions: ['message'], disabled: [] },
			cleaned: ['click/worry'],
		});
	});

	test('ignores corrupt stored data', () => {
		const storage = disposables.add(new TestStorageService());
		storage.store('chat.vscodePet.moves', JSON.stringify(['name: ok\n\nframe 100\n' + ChatPetMovePoses.idle.join('\n'), 'not a move', 42, 'name: Bad\n\nframe 100\n' + ChatPetMovePoses.idle.join('\n')]), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		storage.store('chat.vscodePet.reactions', JSON.stringify([
			// Stored before reactions had triggers, or while they had a chance.
			{ id: 'a', when: '', phrases: ['Go!'], play: 'ok', chance: 0.5 },
			{ id: 'b', when: '', phrases: ['go'], play: 'gone' },
			{ id: 'c', phrases: 'go', play: 'ok' },
			{ id: 'd', trigger: 'hover', when: '', phrases: [], play: 'ok' },
			{ id: 'e', trigger: 'click', when: '', phrases: [], play: 'ok' },
			{ id: 'f', trigger: 'click', when: '', phrases: [], play: 'ok', enabled: false },
			'not a reaction',
		]), StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		const { service } = createService(storage);
		const unreadable = disposables.add(new TestStorageService());
		unreadable.store('chat.vscodePet.reactions', '{not json', StorageScope.APPLICATION_SHARED, StorageTarget.USER);
		assert.deepStrictEqual({
			moves: service.moves.get().map(move => move.name),
			reactions: service.reactions.get(),
			unreadable: createService(unreadable).service.reactions.get(),
		}, {
			moves: ['ok'],
			reactions: [
				{ id: 'a', trigger: 'message', when: '', phrases: ['go'], play: 'ok', enabled: true },
				{ id: 'e', trigger: 'click', when: '', phrases: [], play: 'ok', enabled: true },
				{ id: 'f', trigger: 'click', when: '', phrases: [], play: 'ok', enabled: false },
			],
			unreadable: [],
		});
	});
});
