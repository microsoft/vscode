/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPetInteractionsWidget } from '../../browser/chatPetInteractionsWidget.js';
import { CHAT_PET_PAGE_TEST_DIMENSION, chooseChatPetPageOption, chooseChatPetPageSprite, clickChatPetPageButton, clickChatPetPageEntryAction, clickChatPetPageLink, clickChatPetPageRow, createChatPetPageHarness, createTestChatPetMove as move, getChatPetPageDetail, getChatPetPageForm, getChatPetPageRows, getChatPetPageSelectedRow, getChatPetPageSprite, toggleChatPetPageEntry, typeChatPetPagePhrases } from './chatPetPageTestUtils.js';

suite('ChatPetInteractionsWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(store: DisposableStore, moves: string[], dimension = CHAT_PET_PAGE_TEST_DIMENSION) {
		const harness = createChatPetPageHarness(store);
		for (const name of moves) {
			harness.chatPetService.learnMove(move(name));
		}
		const widget = store.add(harness.instantiationService.createInstance(ChatPetInteractionsWidget, harness.parent, harness.host));
		widget.setVisible(true);
		widget.layout(dimension);
		return { ...harness, widget, reactions: () => harness.chatPetService.reactions.get().map(reaction => `${reaction.trigger}:${reaction.play}`) };
	}

	test('an event plays the one sprite picked from its tiles: a move in place of the pet\'s own animation, that again, or nothing', () => {
		const store = disposables.add(new DisposableStore());
		const { parent, chatPetService, widget, reactions, shown } = createWidget(store, ['wave']);

		clickChatPetPageRow(parent, 'Request finished');
		const offered = getChatPetPageSprite(parent);
		chooseChatPetPageSprite(parent, 'wave');
		const afterMove = { row: getChatPetPageRows(parent)[2], chosen: getChatPetPageSprite(parent)?.value, reactions: reactions() };
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Show Sprite');
		// Another sprite replaces the move rather than joining it.
		chooseChatPetPageSprite(parent, 'Love');
		const afterReaction = { row: getChatPetPageRows(parent)[2], reactions: reactions() };
		chooseChatPetPageSprite(parent, 'Nothing');
		const afterNothing = { row: getChatPetPageRows(parent)[2], actions: getChatPetPageDetail(parent).actions, stage: getChatPetPageDetail(parent).stage, reactions: reactions(), disabled: [...chatPetService.disabledBuiltInReactions.get()] };
		chooseChatPetPageSprite(parent, 'Button press');
		const afterOwn = { row: getChatPetPageRows(parent)[2], disabled: [...chatPetService.disabledBuiltInReactions.get()] };
		// Every event offers the same sprites, its own animation first.
		widget.select('trigger:sleep');
		const sleep = getChatPetPageSprite(parent);

		assert.deepStrictEqual({
			offered: { value: offered?.value, groups: offered?.groups, count: offered?.options.length, love: offered?.options.includes('Love') },
			afterMove, shown, afterReaction, afterNothing, afterOwn,
			sleep: { value: sleep?.value, groups: sleep?.groups, count: sleep?.options.length, love: sleep?.options.includes('Love') },
		}, {
			offered: { value: 'Button press', groups: ['Pet\'s Own', 'Taught', 'Built-in Moves', 'Pet Animations', 'Off'], count: 21, love: true },
			afterMove: { row: 'Request finished: Plays wave', chosen: 'wave', reactions: ['requestDone:wave'] },
			shown: ['sprites:wave'],
			afterReaction: { row: 'Request finished: Plays Love', reactions: ['requestDone:love'] },
			afterNothing: { row: 'Request finished: Plays nothing (off)', actions: [], stage: 'empty', reactions: [], disabled: ['requestDone/celebrate'] },
			afterOwn: { row: 'Request finished: Plays Button press', disabled: [] },
			// Sleeping is no reaction, so nothing is taken out of Pet Animations here, unlike the button press above.
			sleep: { value: 'Sleeping', groups: ['Pet\'s Own', 'Taught', 'Built-in Moves', 'Pet Animations', 'Off'], count: 22, love: true },
		});
	});

	test('the click plays one of a pool: sprites turn off, join and leave it', () => {
		const store = disposables.add(new DisposableStore());
		const { parent, chatPetService, reactions, shown } = createWidget(store, ['wave']);

		const rows = getChatPetPageRows(parent);
		toggleChatPetPageEntry(parent, 'Worried');
		const afterToggle = { entries: getChatPetPageDetail(parent).entries, row: getChatPetPageRows(parent)[1], disabled: [...chatPetService.disabledBuiltInReactions.get()] };
		// A sprite is added from those the click doesn't play yet; once added, it turns off and links like the pet's own.
		clickChatPetPageButton(parent, '.chat-pet-interaction-pool', 'Add Sprite…');
		const adding = getChatPetPageForm(parent);
		chooseChatPetPageOption(parent, 'Sprite', 'wave');
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const afterAdd = { form: getChatPetPageForm(parent), entries: getChatPetPageDetail(parent).entries, reactions: reactions() };
		toggleChatPetPageEntry(parent, 'wave');
		clickChatPetPageLink(parent, 'wave');
		const afterOff = { entries: getChatPetPageDetail(parent).entries, enabled: chatPetService.reactions.get().map(reaction => reaction.enabled) };
		clickChatPetPageEntryAction(parent, 'wave');
		const afterRemove = { entries: getChatPetPageDetail(parent).entries, reactions: reactions() };

		assert.deepStrictEqual({ rows, afterToggle, adding, afterAdd, afterOff, afterRemove, shown }, {
			rows: [
				'# Built-in',
				'Clicked: Plays Button press, Love, Sunglasses, Singing, Speechless, Worried',
				'Request finished: Plays Button press',
				'Confirmation needed: Plays Clapping',
				'Shaken: Plays Dizzy',
				'Falls asleep: Plays Sleeping',
				'Typing: Plays Typing',
				'Responding: Plays Thinking',
				'# Text Interactions0',
				'No text interactions yet: Play a sprite when a message says something (placeholder)',
			],
			afterToggle: { entries: ['Button press', 'Love', 'Sunglasses', 'Singing', 'Speechless', 'Worried (off)'], row: 'Clicked: Plays Button press, Love, Sunglasses, Singing, Speechless, Worried (off)', disabled: ['click/worry'] },
			// The trigger is fixed, and the sprites the click already plays are left out of the choice.
			adding: { title: 'Add a sprite', fields: ['Plays when', 'Sprite'], values: ['Clicked', 'wave'], options: [14], error: undefined, buttons: ['Save', 'Cancel'] },
			afterAdd: { form: undefined, entries: ['Button press', 'Love', 'Sunglasses', 'Singing', 'Speechless', 'Worried (off)', 'wave [Remove]'], reactions: ['click:wave'] },
			afterOff: { entries: ['Button press', 'Love', 'Sunglasses', 'Singing', 'Speechless', 'Worried (off)', 'wave (off) [Remove]'], enabled: [false] },
			afterRemove: { entries: ['Button press', 'Love', 'Sunglasses', 'Singing', 'Speechless', 'Worried (off)'], reactions: [] },
			shown: ['sprites:wave'],
		});
	});

	test('text interactions are written, changed, turned off and removed with the form in the pane', () => {
		const store = disposables.add(new DisposableStore());
		const { parent, chatPetService, widget, shown } = createWidget(store, ['wave']);
		const phrases = () => chatPetService.reactions.get().map(reaction => `${reaction.phrases.join('|')}:${reaction.play}:${reaction.enabled}`);

		widget.select('placeholder:text');
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'New Text Interaction');
		const opened = getChatPetPageForm(parent);
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const rejected = getChatPetPageForm(parent)?.error !== undefined;
		typeChatPetPagePhrases(parent, 'Hello!, hi there');
		chooseChatPetPageOption(parent, 'Sprite', 'Sunglasses');
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const afterAdd = { form: getChatPetPageForm(parent), selected: getChatPetPageSelectedRow(parent), rows: getChatPetPageRows(parent).slice(8), reactions: phrases() };
		// Changing keeps the id; the sprite link goes to the Sprites page.
		const id = chatPetService.reactions.get()[0].id;
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Change…');
		const editing = getChatPetPageForm(parent);
		typeChatPetPagePhrases(parent, 'good morning');
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const afterEdit = { sameId: chatPetService.reactions.get()[0].id === id, selected: getChatPetPageSelectedRow(parent) };
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Show Sprite');
		const toggle = parent.querySelector<HTMLElement>('.chat-pet-interaction-enabled .monaco-custom-toggle');
		assert.ok(toggle, 'enabled toggle');
		toggle.click();
		const afterOff = { row: getChatPetPageRows(parent)[9], reactions: phrases() };
		// A second one from the toolbar; Cancel drops it and the selected one shows again.
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'New Text Interaction');
		const second = getChatPetPageForm(parent) !== undefined;
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Cancel');
		const afterCancel = { form: getChatPetPageForm(parent), selected: getChatPetPageSelectedRow(parent) };
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Remove');
		const afterRemove = { reactions: phrases(), selected: getChatPetPageSelectedRow(parent) };

		assert.deepStrictEqual({ opened, rejected, afterAdd, editing, afterEdit, shown, afterOff, second, afterCancel, afterRemove }, {
			opened: { title: 'New text interaction', fields: ['Plays when', 'Phrases', 'Sprite'], values: ['A message contains phrases', '', 'wave'], options: [20], error: undefined, buttons: ['Save', 'Cancel'] },
			rejected: true,
			afterAdd: { form: undefined, selected: '“hello”, “hi there”', rows: ['# Text Interactions1', '“hello”, “hi there”: Plays Sunglasses'], reactions: ['hello|hi there:cool:true'] },
			editing: { title: 'Change this interaction', fields: ['Plays when', 'Phrases', 'Sprite'], values: ['A message contains phrases', 'hello, hi there', 'Sunglasses'], options: [20], error: undefined, buttons: ['Save', 'Cancel', 'Remove'] },
			afterEdit: { sameId: true, selected: '“good morning”' },
			shown: ['sprites:cool'],
			afterOff: { row: '“good morning”: Plays Sunglasses (off) (off)', reactions: ['good morning:cool:false'] },
			second: true,
			afterCancel: { form: undefined, selected: '“good morning”' },
			afterRemove: { reactions: [], selected: 'No text interactions yet' },
		});
	});

	test('a sprite sent from the Sprites page lands in the form with the event to pick', () => {
		const store = disposables.add(new DisposableStore());
		const { parent, widget, reactions } = createWidget(store, ['wave', 'bow']);

		widget.newInteraction('bow');
		const opened = getChatPetPageForm(parent);
		chooseChatPetPageOption(parent, 'Plays when', 'Request finished');
		const onEvent = getChatPetPageForm(parent);
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const afterSave = { form: getChatPetPageForm(parent), selected: getChatPetPageSelectedRow(parent), chosen: getChatPetPageSprite(parent)?.value, reactions: reactions() };
		// The same sprite again is refused; Cancel drops the form.
		widget.newInteraction('bow');
		chooseChatPetPageOption(parent, 'Plays when', 'Request finished');
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Save');
		const duplicate = getChatPetPageForm(parent)?.error !== undefined;
		clickChatPetPageButton(parent, '.chat-pet-trigger-form-actions', 'Cancel');

		assert.deepStrictEqual({ opened, onEvent, afterSave, duplicate, cancelled: { form: getChatPetPageForm(parent), reactions: reactions() } }, {
			opened: { title: 'New interaction', fields: ['Plays when', 'Phrases', 'Sprite'], values: ['A message contains phrases', '', 'bow'], options: [8, 21], error: undefined, buttons: ['Save', 'Cancel'] },
			onEvent: { title: 'New interaction', fields: ['Plays when', 'Sprite'], values: ['Request finished', 'bow'], options: [8, 21], error: undefined, buttons: ['Save', 'Cancel'] },
			afterSave: { form: undefined, selected: 'Request finished', chosen: 'bow', reactions: ['requestDone:bow'] },
			duplicate: true,
			cancelled: { form: undefined, reactions: ['requestDone:bow'] },
		});
	});

	test('Restore Defaults puts the pet\'s own animations back on every event and leaves text interactions alone', () => {
		const store = disposables.add(new DisposableStore());
		const { parent, chatPetService, reactions } = createWidget(store, ['wave']);
		const toolbar = () => Array.from(parent.querySelectorAll<HTMLButtonElement>('.chat-pet-interactions-toolbar .monaco-button')).map(button => `${button.textContent}${button.classList.contains('disabled') ? ' (disabled)' : ''}`);

		// Nothing to restore yet; then a text interaction, a sprite on an event, one in the click's pool, and an event turned off.
		const untouched = toolbar();
		chatPetService.addReaction({ trigger: 'message', when: '', phrases: ['hello'], play: 'wave' });
		chatPetService.setTriggerSprite('requestDone', { kind: 'sprite', play: 'wave' });
		chatPetService.addReaction({ trigger: 'click', when: '', phrases: [], play: 'wave' });
		chatPetService.setTriggerSprite('sleep', { kind: 'nothing' });
		// The first click asks; Keep changes nothing.
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Restore Defaults');
		const asked = toolbar();
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Keep');
		const kept = { toolbar: toolbar(), reactions: reactions() };
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Restore Defaults');
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Restore Built-in Defaults');

		assert.deepStrictEqual({ untouched, asked, kept, restored: { toolbar: toolbar(), reactions: reactions(), disabled: [...chatPetService.disabledBuiltInReactions.get()], rows: getChatPetPageRows(parent).slice(2, 6) } }, {
			untouched: ['New Text Interaction', 'Edit as Text', 'Restore Defaults (disabled)'],
			asked: ['New Text Interaction', 'Edit as Text', 'Restore Built-in Defaults', 'Keep'],
			kept: { toolbar: ['New Text Interaction', 'Edit as Text', 'Restore Defaults'], reactions: ['message:wave', 'requestDone:wave', 'click:wave'] },
			restored: { toolbar: ['New Text Interaction', 'Edit as Text', 'Restore Defaults (disabled)'], reactions: ['message:wave'], disabled: [], rows: ['Request finished: Plays Button press', 'Confirmation needed: Plays Clapping', 'Shaken: Plays Dizzy', 'Falls asleep: Plays Sleeping'] },
		});
	});

	test('the detail pane scrolls when its content outgrows it', async () => {
		const store = disposables.add(new DisposableStore());
		const { parent } = createWidget(store, ['wave'], new Dimension(900, 420));

		// The click's pool alone overflows a short pane; the form under it, more so, and scrolls into view once it opens.
		const content = parent.querySelector<HTMLElement>('.chat-pet-interaction-detail-content')!;
		const clips = content.clientHeight > 0 && content.clientHeight < content.scrollHeight;
		clickChatPetPageButton(parent, '.chat-pet-interaction-pool', 'Add Sprite…');
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({ clips, formRevealed: content.scrollTop > 0 && content.scrollTop <= content.scrollHeight - content.clientHeight }, { clips: true, formRevealed: true });
	});
});
