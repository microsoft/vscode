/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_PET_OPEN_DOCUMENT_COMMAND_ID } from '../../browser/chatPetDocument.js';
import { serializeChatPetMove } from '../../browser/chatPetMoves.js';
import { ChatPetAnimationPreview } from '../../browser/chatPetSpriteUi.js';
import { ChatPetSpritesWidget, getChatPetSpriteItems } from '../../browser/chatPetSpritesWidget.js';
import { getChatPetBuiltInAnimationImage } from '../../browser/widget/chatPetWidget.js';
import { CHAT_PET_PAGE_TEST_DIMENSION, clickChatPetPageButton, clickChatPetPageLink, createChatPetPageHarness, createTestChatPetMove as move, getChatPetPageDetail, getChatPetPageNotice, getChatPetPageSelectedRow } from './chatPetPageTestUtils.js';

suite('ChatPetSpritesWidget', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a sprite is used by the events that play it now, and the text interactions taught to', () => {
		const items = getChatPetSpriteItems({
			moves: [move('yes-sir'), move('coffee')],
			reactions: [
				{ id: 'a', trigger: 'message', when: '', phrases: ['do it'], play: 'yes-sir', enabled: true },
				{ id: 'b', trigger: 'click', when: '', phrases: [], play: 'yes-sir', enabled: false },
				{ id: 'c', trigger: 'requestDone', when: '', phrases: [], play: 'love', enabled: true },
			],
			disabledBuiltIns: ['click/worry', 'requestDone/celebrate'],
			variant: 'stable',
			animate: false,
		});
		const summary = (id: string) => { const item = items.find(candidate => candidate.id === id); return item?.kind === 'row' ? `${item.summary}${item.off ? ' (off)' : ''}` : undefined; };
		assert.deepStrictEqual({
			// The taught coffee stands in for the built-in one.
			sections: items.filter(item => item.kind === 'header').map(item => `${item.label}${item.count === undefined ? '' : ` ${item.count}`}`),
			coffees: items.filter(item => item.id === 'coffee').length,
			yesSir: summary('yes-sir'),
			coffee: summary('coffee'),
			love: summary('love'),
			// A sprite whose every use is off is dimmed.
			worry: summary('worry'),
			// The button press no longer plays for finished requests: the taught love does, in its place.
			celebrate: summary('celebrate'),
			sleep: summary('sleep'),
		}, {
			sections: ['Taught 2', 'Built-in Moves', 'Pet Animations'],
			coffees: 1,
			yesSir: 'Clicked (off) · “do it”',
			coffee: 'Not used by an interaction',
			love: 'Clicked · Request finished',
			worry: 'Clicked (off) (off)',
			celebrate: 'Clicked',
			sleep: 'Falls asleep',
		});
	});

	test('a sprite plays, copies, opens in pets.md, is used in an interaction on the Interactions page, imports and is forgotten', async () => {
		const store = disposables.add(new DisposableStore());
		const harness = createChatPetPageHarness(store);
		const { parent, chatPetService, commands, copied, clipboard, played, shown } = harness;
		chatPetService.learnMove(move('yes-sir', 'Salutes with a gold YES!'));
		const messageId = chatPetService.addReaction({ trigger: 'message', when: '', phrases: ['do it', 'go ahead'], play: 'yes-sir' }).id;
		chatPetService.setReactionEnabled(chatPetService.addReaction({ trigger: 'click', when: '', phrases: [], play: 'yes-sir' }).id, false);
		const widget = store.add(harness.instantiationService.createInstance(ChatPetSpritesWidget, parent, harness.host));
		widget.setVisible(true);
		widget.layout(CHAT_PET_PAGE_TEST_DIMENSION);
		const detail = () => { const { actions, entries, listButtons } = getChatPetPageDetail(parent); return { actions, entries, listButtons }; };

		// The first taught move is selected; what uses it only tells, and links to the Interactions page.
		const taught = { ...detail(), toggles: parent.querySelectorAll('.chat-pet-interaction-pool-entry .monaco-custom-toggle').length };
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Play');
		clickChatPetPageLink(parent, '“do it”, “go ahead”');
		clickChatPetPageLink(parent, 'Clicked');
		clickChatPetPageButton(parent, '.chat-pet-interaction-pool', 'Use in an Interaction…');
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Copy');
		await new Promise(resolve => setTimeout(resolve, 0));
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Edit as Text');
		widget.select('cowboy');
		const builtInMove = detail();
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Customize');
		// The states the pet holds can't be played on request or used by anything else.
		widget.select('sleep');
		const heldAnimation = detail();
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'New Move');
		// Importing teaches a move copied as text; anything else says so under the toolbar.
		clipboard.text = 'not a move';
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Import from Clipboard');
		await new Promise(resolve => setTimeout(resolve, 0));
		const importFailed = getChatPetPageNotice(parent) !== undefined;
		clipboard.text = `\`\`\`pet\n${serializeChatPetMove(move('shared-bow'))}\`\`\``;
		clickChatPetPageButton(parent, '.chat-pet-interactions-toolbar', 'Import from Clipboard');
		await new Promise(resolve => setTimeout(resolve, 0));
		const imported = { selected: getChatPetPageSelectedRow(parent), moves: chatPetService.moves.get().map(candidate => candidate.name) };
		// Forgetting asks for a second click; Keep takes it back. The move's interactions go with it.
		widget.select('yes-sir');
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Forget');
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Keep');
		const kept = detail().actions;
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Forget');
		clickChatPetPageButton(parent, '.chat-pet-interaction-actions', 'Forget yes-sir');
		const forgotten = { moves: chatPetService.moves.get().map(candidate => candidate.name), reactions: chatPetService.reactions.get().length, selected: getChatPetPageSelectedRow(parent) };

		assert.deepStrictEqual({
			taught, played, shown, copied, builtInMove, heldAnimation, importFailed, imported, kept, forgotten,
			commands: commands.map(command => {
				const args = command.args as { readonly revealMove?: string; readonly insertMove?: string } | undefined;
				return [command.id, Object.keys(args ?? {}).join(), (args?.insertMove ?? args?.revealMove)?.split('\n')[0]];
			}),
		}, {
			taught: { actions: ['Play', 'Edit as Text', 'Copy', 'Forget'], entries: ['Clicked (off)', '“do it”, “go ahead”'], listButtons: ['Use in an Interaction…'], toggles: 0 },
			played: ['yes-sir'],
			shown: [`interactions:reaction:${messageId}`, 'interactions:trigger:click', 'newInteraction:yes-sir'],
			copied: [serializeChatPetMove(move('yes-sir', 'Salutes with a gold YES!'))],
			builtInMove: { actions: ['Play', 'Customize', 'Copy'], entries: [], listButtons: ['Use in an Interaction…'] },
			heldAnimation: { actions: [], entries: ['Falls asleep'], listButtons: [] },
			importFailed: true,
			imported: { selected: 'shared-bow', moves: ['yes-sir', 'shared-bow'] },
			kept: ['Play', 'Edit as Text', 'Copy', 'Forget'],
			forgotten: { moves: ['shared-bow'], reactions: 0, selected: 'shared-bow' },
			commands: [
				[CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, 'revealMove', 'yes-sir'],
				[CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, 'insertMove', 'name: cowboy'],
				[CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, 'insertMove', 'name: new-move'],
			],
		});
	});

	test('the stage plays the pet\'s own animations from their sheets, frame by frame', async () => {
		const store = disposables.add(new DisposableStore());
		const stage = mainWindow.document.createElement('div');
		const canvas = mainWindow.document.createElement('canvas');
		stage.appendChild(canvas);
		mainWindow.document.body.appendChild(stage);
		store.add(toDisposable(() => stage.remove()));
		// The love reaction's first frame is short, so the second one comes soon after the sheet loads.
		store.add(new ChatPetAnimationPreview(stage, canvas, 'love', 'stable', true));
		const deadline = Date.now() + 5_000;
		while (stage.dataset.loading && Date.now() < deadline) {
			await timeout(20);
		}
		const first = canvas.dataset.frame;
		await timeout(getChatPetBuiltInAnimationImage('love', 'stable').sheet!.frames[0].durationMs + 100);

		assert.deepStrictEqual({ loaded: stage.dataset.loading === undefined, first, second: canvas.dataset.frame }, { loaded: true, first: '0', second: '1' });
	});
});
