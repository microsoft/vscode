/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { mobileNewSessionPresentation } from '../../browser/mobileNewSessionPresentation.js';
import '../../../../browser/parts/mobile/mobileChatShell.css';
import '../../../../../workbench/contrib/sessions/browser/chat/media/chatWidget.css';
import '../../../../../workbench/contrib/sessions/browser/chat/media/chatInput.css';
import '../../../../../workbench/contrib/sessions/browser/chat/media/sharedChatInputComposer.css';
import '../../../../../workbench/contrib/chat/browser/widget/media/chat.css';
import '../../../../browser/mobile/media/mobileWorkbench.css';
import '../../../../browser/mobile/media/mobileChat.css';

suite('Mobile composer presentation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRoot(theme: string, width = 390, height = 844) {
		const root = dom.append(mainWindow.document.body, dom.$(`.monaco-workbench.agent-sessions-workbench.phone-layout.mobile-workbench.${theme}`));
		store.add(toDisposable(() => root.remove()));
		root.style.position = 'relative';
		root.style.width = `${width}px`;
		root.style.height = `${height}px`;
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-spacing-size120', '12px');
		root.style.setProperty('--vscode-spacing-size160', '16px');
		root.style.setProperty('--vscode-spacing-size200', '20px');
		root.style.setProperty('--vscode-spacing-size400', '40px');
		return root;
	}

	for (const theme of ['vs', 'vs-dark', 'hc-light', 'hc-black']) {
		test(`${theme}: shared composer actions respect visibility and retain touch targets`, () => {
			const root = createRoot(theme);
			const composer = dom.append(root, dom.$('.new-chat-input-container.sessions-shared-chat-input'));
			composer.style.display = 'block';
			const chat = dom.append(composer, dom.$('.interactive-session'));
			const toolbar = dom.append(chat, dom.$('.chat-input-toolbars'));
			const execute = dom.append(toolbar, dom.$('.chat-execute-toolbar'));
			const actionBar = dom.append(execute, dom.$('.monaco-action-bar'));
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			const item = dom.append(actions, dom.$('li.action-item.chat-submit-button'));
			const submit = dom.append(item, dom.$('a.action-label.codicon.codicon-arrow-up', { role: 'button' }));
			const configurationItem = dom.append(actions, dom.$('li.action-item'));
			const configurationSlot = dom.append(configurationItem, dom.$('.sessions-chat-picker-slot.sessions-chat-picker-slot-mobile-config'));
			const configuration = dom.append(configurationSlot, dom.$('a.action-label', { role: 'button' }));
			dom.append(configuration, dom.$('span.chat-input-picker-label')).textContent = 'GPT-5.6';
			item.style.display = 'none';
			const hidden = submit.getBoundingClientRect().height;
			item.style.display = '';
			const available = {
				height: submit.getBoundingClientRect().height,
				touchInset: mainWindow.getComputedStyle(submit, '::after').top,
			};
			item.style.display = 'none';
			const configurationBounds = configuration.getBoundingClientRect();
			const x = configurationBounds.left + configurationBounds.width / 2;
			const y = configurationBounds.top + configurationBounds.height / 2;
			assert.deepStrictEqual({
				hidden,
				available,
				hiddenAgain: submit.getBoundingClientRect().height,
				configuration: {
					height: configuration.getBoundingClientRect().height,
					touchInset: mainWindow.getComputedStyle(configuration, '::after').top,
					touchHits: [-21.5, 21.5].map(offset => configuration.contains(mainWindow.document.elementFromPoint(x, y + offset))),
				},
			}, {
				hidden: 0,
				available: { height: 36, touchInset: '-4px' },
				hiddenAgain: 0,
				configuration: { height: 36, touchInset: '-4px', touchHits: [true, true] },
			});
		});

		for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
			test(`${theme}, ${width}x${height}: an enabled greeting replaces the logo and stays above the controls`, () => {
				const root = createRoot(theme, width, height);
				const container = dom.append(root, dom.$('.new-chat-widget-container.revealed'));
				const content = dom.append(container, dom.$('.new-chat-widget-content.welcome-phrases-visible'));
				const presentation = store.add(mobileNewSessionPresentation.create(false, store.add(new TestInstantiationService())));
				presentation.render(container, content);
				const welcome = dom.append(content, dom.$('.new-session-welcome-message'));
				dom.append(welcome, dom.$('h2.new-session-welcome-message-title')).textContent = 'What are we building, Alexandra?';
				const workspace = dom.append(content, dom.$('.new-session-workspace-picker-container'));
				const placeRow = dom.append(workspace, dom.$('.sessions-new-session-place-row'));
				dom.append(placeRow, dom.$('button', { type: 'button' })).textContent = 'Cloud';
				const folderRow = dom.append(workspace, dom.$('.sessions-workspace-category-picker'));
				dom.append(folderRow, dom.$('button', { type: 'button' })).textContent = 'example/project';
				const input = dom.append(content, dom.$('.new-chat-input-container'));
				input.style.height = '112px';
				const welcomeRect = welcome.getBoundingClientRect();
				const workspaceRect = workspace.getBoundingClientRect();
				const inputRect = input.getBoundingClientRect();
				assert.deepStrictEqual({
					logo: mainWindow.getComputedStyle(workspace, '::before').content,
					welcomeAboveControls: welcomeRect.bottom <= workspaceRect.top,
					controlsAboveInput: workspaceRect.bottom <= inputRect.top,
					welcomeWithinViewport: welcomeRect.left >= root.getBoundingClientRect().left && welcomeRect.right <= root.getBoundingClientRect().right,
					inputWithinViewport: inputRect.bottom <= root.getBoundingClientRect().bottom,
				}, { logo: 'none', welcomeAboveControls: true, controlsAboveInput: true, welcomeWithinViewport: true, inputWithinViewport: true });
			});
		}
	}

	test('a compact host choice retains its full touch target', () => {
		const root = createRoot('vs-dark', 320, 100);
		const container = dom.append(root, dom.$('.new-chat-widget-container.revealed'));
		const row = dom.append(container, dom.$('.sessions-new-session-place-row'));
		row.style.display = 'flex';
		const host = dom.append(row, dom.$('.action-item.sessions-chat-picker-slot.sessions-workspace-category-picker-slot.sessions-new-session-place'));
		host.style.width = '100px';
		host.style.height = '22px';
		const bounds = host.getBoundingClientRect();
		const x = bounds.left + bounds.width / 2;
		const y = bounds.top + bounds.height / 2;
		assert.deepStrictEqual([-21.5, 21.5].map(offset => host.contains(root.ownerDocument.elementFromPoint(x, y + offset))), [true, true]);
	});

	test('a long configuration label shrinks without taking space from Add Context', () => {
		const root = createRoot('vs-dark', 320);
		const composer = dom.append(root, dom.$('.sessions-shared-chat-input'));
		const chat = dom.append(composer, dom.$('.interactive-session'));
		const toolbars = dom.append(chat, dom.$('.chat-input-toolbars'));
		const primary = dom.append(toolbars, dom.$('.monaco-toolbar.responsive.responsive-last.chat-input-toolbar'));
		primary.style.flex = '0 0 200px';
		const actionBar = dom.append(primary, dom.$('.monaco-action-bar'));
		const actions = dom.append(actionBar, dom.$('ul.actions-container'));
		const attachItem = dom.append(actions, dom.$('li.action-item.menu-entry.toolbar-shrinkable-item'));
		const attach = dom.append(attachItem, dom.$('a.action-label.codicon.codicon-add-compact', { role: 'button' }));
		const emptyControls = dom.append(actions, dom.$('li.action-item.sessions-shared-chat-input-session-controls.toolbar-shrinkable-item.compact-picker'));
		dom.append(emptyControls, dom.$('.sessions-chat-config-toolbar.new-chat-session-controls.has-no-actions'));
		const configurationItem = dom.append(actions, dom.$('li.action-item.chat-input-picker-item'));
		const configurationSlot = dom.append(configurationItem, dom.$('.sessions-chat-picker-slot.sessions-chat-picker-slot-mobile-config'));
		const configuration = dom.append(configurationSlot, dom.$('a.action-label', { role: 'button' }));
		const label = dom.append(configuration, dom.$('span.chat-input-picker-label'));
		label.textContent = 'A model with a long display name';

		const attachBounds = attach.getBoundingClientRect();
		const configurationBounds = configuration.getBoundingClientRect();
		const touchTargetInset = -parseFloat(mainWindow.getComputedStyle(configuration, '::after').right);
		assert.deepStrictEqual({
			attachWidth: attachBounds.width,
			emptyControlsWidth: emptyControls.getBoundingClientRect().width,
			separateControls: attachBounds.right <= configurationBounds.left,
			boundedLabel: label.getBoundingClientRect().right <= configurationBounds.right && configurationBounds.right <= primary.getBoundingClientRect().right,
			noTextSpill: configuration.scrollWidth <= configuration.clientWidth + touchTargetInset,
			singleLine: label.getBoundingClientRect().height <= parseFloat(mainWindow.getComputedStyle(configuration).lineHeight),
			truncated: label.scrollWidth > label.clientWidth,
		}, { attachWidth: 36, emptyControlsWidth: 0, separateControls: true, boundedLabel: true, noTextSpill: true, singleLine: true, truncated: true });
	});

	test('mobile has a hero only when welcome phrases are off and the view has room', () => {
		const root = createRoot('vs-dark');
		const container = dom.append(root, dom.$('.new-chat-widget-container.revealed'));
		const content = dom.append(container, dom.$('.new-chat-widget-content.welcome-phrases-visible'));
		const presentation = store.add(mobileNewSessionPresentation.create(false, store.add(new TestInstantiationService())));
		presentation.render(container, content);
		const workspace = dom.append(content, dom.$('.new-session-workspace-picker-container'));
		const mobileWithGreeting = mainWindow.getComputedStyle(workspace, '::before').content;
		content.classList.remove('welcome-phrases-visible');
		const mobileWithoutGreeting = mainWindow.getComputedStyle(workspace, '::before').content;
		root.style.height = '300px';
		const mobileWithKeyboard = mainWindow.getComputedStyle(workspace, '::before').content;
		assert.deepStrictEqual({ mobileWithGreeting, mobileWithoutGreeting, mobileWithKeyboard }, { mobileWithGreeting: 'none', mobileWithoutGreeting: '""', mobileWithKeyboard: 'none' });
	});
});
