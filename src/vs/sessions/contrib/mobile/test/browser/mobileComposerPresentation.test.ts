/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../browser/parts/mobile/mobileChatShell.css';
import '../../../chat/browser/media/chatWidget.css';
import '../../../chat/browser/media/chatInput.css';
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
		test(`${theme}: hidden dictation stays hidden while available dictation keeps its touch target`, () => {
			const root = createRoot(theme);
			const toolbar = dom.append(root, dom.$('.sessions-chat-toolbar'));
			const dictate = dom.append(toolbar, dom.$('button.sessions-chat-stt-button.hidden', { type: 'button' }));
			const combinedVoice = dom.append(toolbar, dom.$('.sessions-chat-voice-input-mode'));
			const hidden = mainWindow.getComputedStyle(dictate).display;
			dictate.classList.remove('hidden');
			combinedVoice.classList.add('hidden');
			const available = {
				visible: mainWindow.getComputedStyle(dictate).display !== 'none',
				height: dictate.getBoundingClientRect().height,
				touchInset: mainWindow.getComputedStyle(dictate, '::after').top,
				combined: mainWindow.getComputedStyle(combinedVoice).display,
			};
			dictate.classList.add('hidden');
			assert.deepStrictEqual({ hidden, available, hiddenAgain: mainWindow.getComputedStyle(dictate).display }, {
				hidden: 'none',
				available: { visible: true, height: 36, touchInset: '-4px', combined: 'none' },
				hiddenAgain: 'none',
			});
		});

		for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
			for (const experimentalLayout of [false, true]) {
				test(`${theme}, ${width}x${height}, experimental layout ${experimentalLayout}: an enabled greeting replaces the logo and stays above the controls`, () => {
					const root = createRoot(theme, width, height);
					const container = dom.append(root, dom.$('.new-chat-widget-container.revealed'));
					const content = dom.append(container, dom.$('.new-chat-widget-content.welcome-phrases-visible'));
					content.classList.toggle('experimental-new-session-composer', experimentalLayout);
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
	}

	test('the original phone presentation is unchanged and mobile still has a hero when welcome phrases are off', () => {
		const root = createRoot('vs-dark');
		const content = dom.append(root, dom.$('.new-chat-widget-content.welcome-phrases-visible'));
		const workspace = dom.append(content, dom.$('.new-session-workspace-picker-container'));
		const mobileWithGreeting = mainWindow.getComputedStyle(workspace, '::before').content;
		content.classList.remove('welcome-phrases-visible');
		const mobileWithoutGreeting = mainWindow.getComputedStyle(workspace, '::before').content;
		content.classList.add('welcome-phrases-visible');
		root.classList.remove('mobile-workbench');
		assert.deepStrictEqual({
			mobileWithGreeting, mobileWithoutGreeting,
			fullPhone: mainWindow.getComputedStyle(workspace, '::before').content,
		}, { mobileWithGreeting: 'none', mobileWithoutGreeting: '""', fullPhone: '""' });
	});
});
