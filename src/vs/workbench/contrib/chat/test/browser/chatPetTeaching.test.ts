/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { getChatPetBuiltInMoves } from '../../browser/chatPetBuiltInMoves.js';
import { ChatPetMovePoses, serializeChatPetMove } from '../../browser/chatPetMoves.js';
import { IChatPetReaction } from '../../browser/chatPetReactions.js';
import { ChatPetService } from '../../browser/chatPetService.js';
import { getChatPetMoveGuide, getChatPetMovesGuide, showChatPetTaughtMoves, validateChatPetLesson } from '../../browser/chatPetTeaching.js';
import { IChatPetWidgetService } from '../../browser/widget/chatPetWidgetService.js';

const chatPetSalute = {
	name: 'YES SIR',
	about: 'Salutes with a YES sign.',
	loop: false,
	colors: { Y: '#ffd700' },
	fixed: 'Y',
	frames: [
		{ ms: 120, rows: ChatPetMovePoses.idle.map(row => `${row}..`) },
		{ ms: 400, rows: ChatPetMovePoses.crouch.map((row, index) => `${row}${index < 2 ? 'YY' : '..'}`) },
		{ ms: 120, rows: ChatPetMovePoses.idle.map(row => `${row}..`) },
	],
};

const chatPetExecuteReaction = { when: 'when I tell you to execute on our plan', phrases: ['do it', 'go ahead', 'Do it!'], play: 'YES SIR' };

suite('ChatPetTeaching', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts a whole lesson or reports everything the agent must fix', () => {
		const knownReaction = (id: string, play = 'love'): IChatPetReaction => ({ id, trigger: 'message', when: '', phrases: ['do it'], play, enabled: true });
		const lessonResult = (input: unknown, knownMoves: readonly string[] = [], reactionIds: readonly string[] = [], play?: string) => {
			const result = validateChatPetLesson(input, knownMoves, reactionIds.map(id => knownReaction(id, play)));
			return result.valid ? { ...result.lesson, moves: result.lesson.moves.map(move => [move.name, move.fixed, move.loop, move.frames.length]) } : result;
		};
		const idleText = serializeChatPetMove({ name: 'wave', about: '', loop: true, still: undefined, colors: {}, fixed: '', frames: [{ durationMs: 100, rows: ChatPetMovePoses.idle }] });
		// A row one pixel short, and a frame missing its top row, as models often write them.
		const miscounted = validateChatPetLesson({ moves: [{ ...chatPetSalute, frames: [{ ms: 120, rows: chatPetSalute.frames[0].rows.map((row, index) => index === 4 ? row.slice(0, -1) : row) }, chatPetSalute.frames[1], { ms: 120, rows: chatPetSalute.frames[2].rows.slice(1) }] }] }, [], []);

		assert.deepStrictEqual({
			valid: lessonResult({ moves: [chatPetSalute], reactions: [chatPetExecuteReaction] }),
			// A click reaction needs no phrases, and one with a made-up trigger is a mistake to fix.
			click: lessonResult({ reactions: [{ trigger: 'click', when: 'sometimes when I click you', play: 'YES SIR' }] }, ['yes-sir']),
			badTrigger: lessonResult({ reactions: [{ trigger: 'hover', phrases: ['hi'], play: 'love' }] }),
			pasted: lessonResult({ pastedMoves: [idleText], play: 'wave' }),
			miscounted: miscounted.valid ? miscounted.lesson.moves[0].frames.map(frame => [frame.rows.length, new Set(frame.rows.map(row => row.length)).size, frame.rows.at(-1)]) : miscounted,
			// A hold written without a pose or rows must be drawn, not padded into a blank frame.
			holdWithoutRows: lessonResult({ moves: [{ ...chatPetSalute, frames: [chatPetSalute.frames[0], { ms: 600 }, chatPetSalute.frames[2]] }] }),
			broken: lessonResult({
				moves: [{ ...chatPetSalute, colors: { Y: 'gold' } }, { ...chatPetSalute, name: 'nod', frames: [{ ms: 100, rows: ['..A..'] }] }, 42],
				reactions: [{ ...chatPetExecuteReaction, play: 'moonwalk' }],
				forgetMoves: ['duck'],
				forgetReactions: ['nope'],
				play: 'moonwalk',
			}, ['wave'], ['abc']),
			empty: lessonResult({}),
			repeatedForgets: lessonResult({ forgetMoves: ['wave', 'Wave'], forgetReactions: ['abc', 'abc'] }, ['wave'], ['abc']),
			// Forgetting one reaction twice frees one place, not two.
			fullAfterRepeatedForget: lessonResult({ forgetReactions: ['r0', 'r0'], reactions: [{ phrases: ['do it'], play: 'love' }, { phrases: ['ship it'], play: 'jump' }] }, [], Array.from({ length: 24 }, (_, index) => `r${index}`)),
			// Forgetting a move also forgets the reactions that play it, which frees their places.
			roomAfterForgottenMove: lessonResult({ forgetMoves: ['wave'], reactions: [{ phrases: ['ship it'], play: 'jump' }] }, ['wave'], Array.from({ length: 24 }, (_, index) => `r${index}`), 'wave'),
			notAList: lessonResult({ moves: { name: 'wave' }, reactions: [{ phrases: ['do it'], play: 'love' }] }),
			// Built-in moves play and react without being taught, but can't be forgotten.
			builtIn: lessonResult({ reactions: [{ phrases: ['howdy'], play: 'Cowboy' }], play: 'zapped' }),
			forgetBuiltIn: lessonResult({ forgetMoves: ['trophy'] }),
		}, {
			valid: {
				moves: [['yes-sir', 'Y', false, 3]],
				reactions: [{ trigger: 'message', when: 'when I tell you to execute on our plan', phrases: ['do it', 'go ahead'], play: 'yes-sir', enabled: true }],
				removedReactionIds: [],
				forgottenMoves: [],
				play: undefined,
			},
			click: { moves: [], reactions: [{ trigger: 'click', when: 'sometimes when I click you', phrases: [], play: 'yes-sir', enabled: true }], removedReactionIds: [], forgottenMoves: [], play: undefined },
			badTrigger: { valid: false, errors: ['A reaction\'s trigger must be "message" or one of click, requestDone, confirmation, dizzy, sleep, typing, responding, not "hover".'] },
			pasted: { moves: [['wave', '', true, 1]], reactions: [], removedReactionIds: [], forgottenMoves: [], play: 'wave' },
			miscounted: [[12, 1, '.BAAACCCCCC...'], [12, 1, '.BAAACCCCCC...'], [12, 1, '.BAAACCCCCC...']],
			holdWithoutRows: { valid: false, errors: ['Move "yes-sir": Frame 2 needs a "pose" (idle, crouch, airborne, love) or "rows".'] },
			broken: {
				valid: false,
				errors: [
					'Move "yes-sir": "Y=gold" is not a color; use X=#rrggbb, where X is a letter or digit.',
					'Move "nod": Frames are 5x1; they must be at least 12x12.',
					'A move must be an object with a name and frames, or a move in the text format.',
					// Unknown names come with the moves the pet knows, so agents can pick the one users meant.
					'There is no taught move called "duck" to forget; the pet knows wave.',
					'There is no reaction with the id "nope".',
					'The pet doesn\'t know a move called "moonwalk" yet.',
					'The pet doesn\'t know a move called "moonwalk"; it can play wave, yes, idea, ship-it, cowboy, rubber-duck, magic, trophy, debug, coffee, zapped, love, cool, sing, worry, speechless, celebrate, clap, dizzy, jump.',
				],
			},
			empty: { valid: false, errors: ['The lesson is empty: give moves, pastedMoves, reactions, forgetMoves, forgetReactions or play.'] },
			repeatedForgets: { moves: [], reactions: [], removedReactionIds: ['abc'], forgottenMoves: ['wave'], play: undefined },
			fullAfterRepeatedForget: { valid: false, errors: ['The pet can know at most 24 reactions; remove some first.'] },
			roomAfterForgottenMove: { moves: [], reactions: [{ trigger: 'message', when: '', phrases: ['ship it'], play: 'jump', enabled: true }], removedReactionIds: [], forgottenMoves: ['wave'], play: undefined },
			notAList: { valid: false, errors: ['"moves" must be a list.'] },
			builtIn: { moves: [], reactions: [{ trigger: 'message', when: '', phrases: ['howdy'], play: 'cowboy', enabled: true }], removedReactionIds: [], forgottenMoves: [], play: 'zapped' },
			forgetBuiltIn: { valid: false, errors: ['"trophy" is a built-in move, which can\'t be forgotten.'] },
		});
	});

	test('tells the agent what the pet knows and gives it the moves to change or study', () => {
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		const lesson = validateChatPetLesson({ moves: [chatPetSalute, { ...chatPetSalute, name: 'wave' }, { ...chatPetSalute, name: 'coffee' }] }, [], []);
		for (const move of lesson.valid ? lesson.lesson.moves : []) {
			chatPetService.learnMove(move);
		}
		const reaction = chatPetService.addReaction({ trigger: 'message', when: 'when I say do it', phrases: ['do it', 'go ahead', 'ship it', 'let\'s go'], play: 'yes-sir' });
		const click = chatPetService.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		const guide = getChatPetMoveGuide(chatPetService.moves.get(), chatPetService.reactions.get()).split('\n');
		// A taught move, a built-in move, two unknown names, and more moves than come at a time.
		const whole = getChatPetMovesGuide(chatPetService.moves.get(), ['YES SIR', 'moonwalk', 'cowboy', 'Coffee', 'nope']);

		assert.deepStrictEqual({
			known: guide.slice(guide.indexOf('What the pet knows now:') + 1),
			whole: whole.text.split('\n').map(line => line.startsWith('{') ? `${JSON.parse(line).name} as ${JSON.parse(line).frames[0].rows ? 'rows' : 'layers'}` : line),
			pictured: whole.moves.map(move => move.name),
		}, {
			// Names only, and a few phrases per reaction, so the guide stays short.
			known: [
				'- taught moves: yes-sir, wave, coffee',
				`- reaction ${reaction.id}: plays yes-sir on "do it", "go ahead", "ship it", …`,
				`- reaction ${click.id}: plays wave on click`,
			],
			whole: [
				'The pet knows no move called "moonwalk" or "nope"; it knows yes-sir, wave, coffee, yes, idea, ship-it, cowboy, rubber-duck, magic, trophy, debug, zapped.',
				'The moves, whole: built-in moves in layers, taught moves as rows. The pictures show every frame of yes-sir, then cowboy. To change one, send it back in "moves" with the same name, changing only what was asked.',
				'yes-sir as rows',
				'cowboy as layers',
				// The taught coffee replaces the built-in one.
				'Moves come 2 at a time; ask again for coffee.',
			],
			pictured: ['yes-sir', 'cowboy'],
		});
	});

	test('keeps the guide and every pair of moves short enough for agents to read at once', () => {
		// Copilot CLI gives agents tool results over about 8,000 characters as files, which they tend to read only in part.
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		for (let index = 0; index < 8; index++) {
			chatPetService.learnMove({ ...getChatPetBuiltInMoves()[0], name: `taught-move-number-${index}`, about: 'x'.repeat(200) });
			chatPetService.addReaction({ trigger: 'message', when: 'y'.repeat(200), phrases: Array.from({ length: 12 }, (_, phrase) => `a phrase to react to ${phrase}`), play: 'yes' });
		}
		const names = getChatPetBuiltInMoves().map(move => move.name);
		const lengths = {
			guide: getChatPetMoveGuide([], []).length,
			busyGuide: getChatPetMoveGuide(chatPetService.moves.get(), chatPetService.reactions.get()).length,
			longestPair: Math.max(...names.flatMap(first => names.map(second => getChatPetMovesGuide([], [first, second]).text.length))),
		};
		assert.ok(lengths.guide <= 7_000 && lengths.busyGuide <= 8_000 && lengths.longestPair <= 7_000, JSON.stringify(lengths));
	});

	test('lists what the pet was taught in a picker that plays, copies and forgets', async () => {
		const chatPetService = disposables.add(new ChatPetService(disposables.add(new TestStorageService()), NullTelemetryService, new NullLogService()));
		const lesson = validateChatPetLesson({ moves: [chatPetSalute, { ...chatPetSalute, name: 'wave', about: '' }] }, [], []);
		for (const move of lesson.valid ? lesson.lesson.moves : []) {
			chatPetService.learnMove(move);
		}
		chatPetService.addReaction({ trigger: 'message', when: 'when I say do it', phrases: ['do it', 'ship it'], play: 'wave' });
		const shown: string[][] = [];
		const played: string[] = [];
		const copied: string[] = [];

		await showChatPetTaughtMoves(
			new class extends mock<IQuickInputService>() {
				override async pick<T extends IQuickPickItem>(picks: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: IPickOptions<T>): Promise<T | undefined> {
					const items = await picks;
					shown.push(items.map(item => item.type === 'separator' ? `-- ${item.label}` : `${item.label}${item.detail ? ` | ${item.detail}` : ''} [${item.buttons?.map(button => button.tooltip).join(', ')}]`));
					const [yesSir, wave] = items.filter((item): item is T => item.type !== 'separator');
					if (shown.length > 1) {
						return yesSir;
					}
					options?.onDidTriggerItemButton?.({ item: yesSir, button: yesSir.buttons![0], removeItem: () => { } });
					// Forgetting shows the list again, which hides this one.
					options?.onDidTriggerItemButton?.({ item: wave, button: wave.buttons![1], removeItem: () => { } });
					return undefined;
				}
			}(),
			chatPetService,
			new class extends mock<IChatPetWidgetService>() {
				override playReaction(name: string): boolean {
					played.push(name);
					return true;
				}
			}(),
			new class extends mock<IClipboardService>() {
				override async writeText(text: string): Promise<void> {
					copied.push(text);
				}
			}(),
		);
		await timeout(0);

		// The built-in moves come last, to play or copy.
		const builtInAt = (list: string[]) => list.indexOf('-- Built-in Moves');
		assert.deepStrictEqual({
			shown: shown.map(list => list.slice(0, builtInAt(list))),
			builtIn: shown.map(list => [list.length - builtInAt(list) - 1, list[builtInAt(list) + 1]]),
			played,
			copied: copied.map(text => text.split('\n')[0]),
			moves: chatPetService.moves.get().map(move => move.name),
			reactions: chatPetService.reactions.get().length,
		}, {
			shown: [[
				'-- Moves',
				'yes-sir: plays once (0.6 s) | Salutes with a YES sign. [Copy Move, Forget]',
				'wave: plays once (0.6 s) [Copy Move, Forget]',
				'-- Reactions',
				'Reaction 1: plays wave when a message contains "do it", "ship it" [Forget]',
			], [
				// Forgetting wave also forgot the reaction that played it.
				'-- Moves',
				'yes-sir: plays once (0.6 s) | Salutes with a YES sign. [Copy Move, Forget]',
			]],
			// Described for users in their language, rather than with the agents' description.
			builtIn: Array.from({ length: 2 }, () => [10, 'yes: plays once (1.7 s) | Jumps for joy as a big gold YES! pops up [Copy Move]']),
			played: ['yes-sir'],
			copied: ['name: yes-sir'],
			moves: ['yes-sir'],
			reactions: 0,
		});
	});
});
