/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatQuestionContent } from '../../../../browser/widget/chatContentParts/chatQuestionContent.js';
import { IChatQuestion } from '../../../../common/chatService/chatService.js';
import '../../../../../../browser/media/style.css';

suite('ChatQuestionContent', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function renderPreview(question: IChatQuestion, theme = 'vs-dark') {
		const root = dom.append(mainWindow.document.body, dom.$(`.monaco-workbench.${theme}.interactive-session`));
		store.add(toDisposable(() => root.remove()));
		const card = dom.append(root, dom.$('.chat-question-carousel-container.chat-question-carousel-preview.chat-card.chat-card-large'));
		card.style.width = '200px';
		const content = dom.append(card, dom.$('div'));
		const instantiationService = workbenchInstantiationService(undefined, store);
		store.add(instantiationService.createInstance(ChatQuestionContent, content, question, { readOnly: true }));
		return card;
	}

	for (const type of ['text', 'singleSelect', 'multiSelect'] as const) {
		test(`read-only ${type} presentation never creates answer controls, mutates defaults or moves focus`, () => {
			const focused = dom.append(mainWindow.document.body, dom.$('button'));
			store.add(toDisposable(() => focused.remove()));
			focused.focus();
			const question: IChatQuestion = {
				id: 'layout', type, title: 'Layout', message: 'Choose **one** layout', description: 'Choose a starting point.',
				detailedMessage: 'Keep **accessibility** in mind.', required: true,
				options: type === 'text' ? undefined : [
					{ id: 'list', label: 'List - Dense scan', value: 'list' },
					{ id: 'grid', label: 'Grid - Visual overview', value: 'grid' },
				],
				defaultValue: 'grid',
			};
			const before = JSON.stringify(question);
			const card = renderPreview(question);
			card.querySelector('.chat-question-list-item')?.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
			assert.deepStrictEqual({
				title: card.querySelector('.chat-question-heading')?.textContent,
				message: card.querySelector('.chat-question-title')?.textContent,
				description: card.querySelector('.chat-question-description')?.textContent,
				details: card.querySelector('.chat-question-detailed-message strong')?.textContent,
				options: [...card.querySelectorAll('.chat-question-list-label-title')].map(option => option.textContent),
				controls: card.querySelectorAll('input, textarea, button, [tabindex], [role="listbox"]').length,
				focus: mainWindow.document.activeElement === focused,
				unchanged: JSON.stringify(question) === before,
			}, {
				title: 'Layout', message: 'Choose one layout *', description: 'Choose a starting point.', details: 'accessibility',
				options: type === 'text' ? [] : ['Grid', 'List'], controls: 0, focus: true, unchanged: true,
			});
		});
	}

	test('read-only agent markdown preserves emphasis but not remote images or command links', () => {
		const card = renderPreview({
			id: 'safe', type: 'text', title: '<script>title</script>',
			message: '**Choose** [run](command:workbench.action.files.newUntitledFile) ![image](https://example.com/a.png)',
			detailedMessage: '<img src="https://example.com/b.png" onerror="alert(1)">',
		});
		assert.deepStrictEqual({
			title: card.querySelector('.chat-question-heading')?.textContent,
			emphasis: card.querySelector('.chat-question-title strong')?.textContent,
			activeContent: card.querySelectorAll('img, script, a[data-href^="command:"], a[href^="command:"]').length,
		}, { title: '<script>title</script>', emphasis: 'Choose', activeContent: 0 });
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`read-only options wrap within narrow cards in ${theme}`, () => {
			const card = renderPreview({
				id: 'long', type: 'multiSelect', title: 'Layout', description: 'd'.repeat(200),
				options: [{ id: 'one', label: `Title - ${'x'.repeat(200)}`, value: 'one' }],
			}, theme);
			assert.ok(card.scrollWidth <= card.clientWidth, `Preview overflows its card: ${card.scrollWidth} > ${card.clientWidth}`);
		});
	}
});
