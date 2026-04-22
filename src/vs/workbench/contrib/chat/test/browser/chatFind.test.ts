/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { registerChatActions } from '../../browser/actions/chatActions.js';
import { ChatViewId } from '../../browser/chat.js';
import { countChatFindMatchesInText, highlightChatFindMatches } from '../../browser/widget/chatContentMarkdownRenderer.js';
import { countCurrentChatSearchMatches, getCurrentChatSearchMatches, getNextCurrentChatSearchMatch, matchesCurrentChatSearch } from '../../browser/widgetHosts/viewPane/chatViewPane.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../common/model/chatViewModel.js';

suite('Chat Find', () => {
	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;

	let actionsRegistered = false;
	function ensureActionsRegistered(): void {
		if (!actionsRegistered) {
			registerChatActions();
			actionsRegistered = true;
		}
	}

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());
		ensureActionsRegistered();
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches request and response text', () => {
		const request = {
			message: { text: 'Explain binary search' },
			messageText: 'Explain binary search',
		} as IChatRequestViewModel;

		const response = {
			response: {
				value: 'Binary search halves the interval',
				toString: () => 'Binary search halves the interval',
			},
			setVote: () => { },
		} as unknown as IChatResponseViewModel;

		const structuredResponse = {
			response: {
				value: [{ kind: 'markdownContent', content: { value: 'Divide the array and discard half each step' } }],
				toString: () => 'Divide the array and discard half each step',
			},
			setVote: () => { },
		} as unknown as IChatResponseViewModel;

		assert.strictEqual(matchesCurrentChatSearch(request, 'binary'), true);
		assert.strictEqual(matchesCurrentChatSearch(response, 'halves'), true);
		assert.strictEqual(matchesCurrentChatSearch(structuredResponse, 'discard half'), true);
		assert.strictEqual(matchesCurrentChatSearch(request, 'graph'), false);
		assert.strictEqual(matchesCurrentChatSearch(response, 'tree'), false);
		assert.strictEqual(matchesCurrentChatSearch(structuredResponse, 'rotation'), false);
		assert.strictEqual(matchesCurrentChatSearch(request, '   '), true);
	});

	test('cycles current chat search matches', () => {
		const first = { id: 'first', message: { text: 'alpha beta alpha' }, messageText: 'alpha beta alpha' } as unknown as IChatRequestViewModel;
		const second = { id: 'second', message: { text: 'alpha' }, messageText: 'alpha' } as unknown as IChatRequestViewModel;
		const matches = getCurrentChatSearchMatches([first, second], 'alpha');

		assert.strictEqual(matches.length, 3);
		assert.strictEqual(countCurrentChatSearchMatches(first, 'alpha'), 2);
		assert.strictEqual(countCurrentChatSearchMatches(second, 'alpha'), 1);
		assert.deepStrictEqual(matches.map(match => ({ id: match.item.id, matchIndex: match.matchIndex })), [
			{ id: 'first', matchIndex: 0 },
			{ id: 'first', matchIndex: 1 },
			{ id: 'second', matchIndex: 0 },
		]);

		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, undefined, 1), matches[0]);
		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, undefined, -1), matches[2]);
		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, matches[0], 1), matches[1]);
		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, matches[1], 1), matches[2]);
		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, matches[2], 1), matches[0]);
		assert.deepStrictEqual(getNextCurrentChatSearchMatch(matches, matches[0], -1), matches[2]);
	});

	test('highlights rendered chat matches', () => {
		const container = document.createElement('div');
		container.textContent = new MarkdownString('Alpha beta alpha').value;

		highlightChatFindMatches(container, 'alpha');

		const matches = container.querySelectorAll('.chat-find-match');
		assert.strictEqual(matches.length, 2);
		assert.deepStrictEqual(Array.from(matches).map(match => match.textContent), ['Alpha', 'alpha']);
	});

	test('marks a selected rendered chat match by index', () => {
		const container = document.createElement('div');
		container.textContent = new MarkdownString('Alpha beta alpha').value;

		highlightChatFindMatches(container, 'alpha', 1);

		assert.strictEqual(container.querySelectorAll('.chat-find-match').length, 2);
		assert.strictEqual(container.querySelectorAll('.chat-find-current-match').length, 1);
		assert.strictEqual(container.querySelector('.chat-find-current-match')?.textContent, 'alpha');
		assert.strictEqual(countChatFindMatchesInText('Alpha beta alpha', 'alpha'), 2);
	});

	test('clears rendered chat highlights after repeated highlight passes', () => {
		const container = document.createElement('div');
		container.textContent = new MarkdownString('Alpha beta alpha').value;

		highlightChatFindMatches(container, 'alpha');
		highlightChatFindMatches(container, 'alpha');
		highlightChatFindMatches(container, '');

		assert.strictEqual(container.querySelectorAll('.chat-find-match').length, 0);
		assert.strictEqual(container.textContent, 'Alpha beta alpha');
	});

	test('find action opens chat view find control', async () => {
		let openFindCalled = false;
		let openViewArgs: { id: string; focus: boolean | undefined } | undefined;

		const viewsService = new class extends mock<IViewsService>() {
			override async openView(id: string, focus?: boolean) {
				openViewArgs = { id, focus };
				return {
					openFind() {
						openFindCalled = true;
					}
				};
			}
		};

		instantiationService.set(IViewsService, viewsService);

		const commandHandler = CommandsRegistry.getCommand('workbench.action.chat.find')?.handler;
		assert.ok(commandHandler, 'Command handler should be registered');

		await commandHandler(instantiationService);

		assert.deepStrictEqual(openViewArgs, { id: ChatViewId, focus: true });
		assert.strictEqual(openFindCalled, true);
	});
});