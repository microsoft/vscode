/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../workbench/contrib/chat/browser/widget/input/media/chatInputStack.css';
import '../../browser/media/chatInput.css';
import '../../browser/media/chatWidget.css';
import '../../../../browser/parts/mobile/mobileChatShell.css';

suite('Sessions - Mobile Chat Shell', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createComposer(experimental: boolean, height: number, notices: boolean) {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench.phone-layout'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.style.width = '390px';
		workbench.style.height = `${height}px`;
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		for (const size of [4, 6, 8, 12, 16, 20]) {
			workbench.style.setProperty(`--vscode-spacing-size${size * 10}`, `${size}px`);
		}
		const widget = dom.append(workbench, dom.$('.sessions-chat-widget'));
		const container = dom.append(widget, dom.$('.new-chat-widget-container.revealed'));
		const content = dom.append(container, dom.$('.new-chat-widget-content.chat-input-stack'));
		content.classList.toggle('experimental-new-session-composer', experimental);
		const workspace = dom.append(content, dom.$('.new-session-workspace-picker-container'));
		workspace.style.animation = 'none';
		const pickers = dom.append(workspace, dom.$('.sessions-workspace-category-picker.new-chat-session-options'));
		pickers.style.height = '40px';
		dom.append(pickers, dom.$('span', undefined, 'Workspace'));
		const input = dom.append(content, dom.$('.new-chat-input-container'));
		input.style.height = '100px';
		input.style.animation = 'none';
		dom.append(content, dom.$('.new-chat-bottom-container.sessions-shared-chat-input-controls.empty'));
		const surfaces = dom.append(content, dom.$('.new-session-below-input-surfaces.chat-input-surface-stack'));
		surfaces.style.height = notices ? '100px' : '0';
		surfaces.style.display = notices ? 'block' : 'none';
		return { workbench, widget, content, workspace, pickers, input, surfaces };
	}

	for (const height of [400, 700]) {
		for (const notices of [false, true]) {
			test(`docks experimental phone pickers against the input at height ${height} with notices ${notices}`, () => {
				const { workbench, content, workspace, pickers, input, surfaces } = createComposer(true, height, notices);
				const targetWindow = dom.getWindow(workbench);
				const pickerBounds = pickers.getBoundingClientRect();
				const inputBounds = input.getBoundingClientRect();
				const hero = targetWindow.getComputedStyle(content, '::before');

				assert.deepStrictEqual({
					pickerInputGap: inputBounds.top - pickerBounds.bottom,
					pickerMatchesInputWidth: pickerBounds.left === inputBounds.left && pickerBounds.right === inputBounds.right,
					noticesAbovePickers: !notices || surfaces.getBoundingClientRect().bottom <= pickerBounds.top,
					inputBottomInset: content.getBoundingClientRect().bottom - inputBounds.bottom,
					workspaceGrows: targetWindow.getComputedStyle(workspace).flexGrow,
					heroVisible: hero.content === '""' && parseFloat(hero.height) >= 64,
					workspaceLogo: targetWindow.getComputedStyle(workspace, '::before').display,
				}, {
					pickerInputGap: 0,
					pickerMatchesInputWidth: true,
					noticesAbovePickers: true,
					inputBottomInset: 16,
					workspaceGrows: '0',
					heroVisible: true,
					workspaceLogo: 'none',
				});
			});
		}
	}

	test('keeps the standard phone workspace picker in the hero', () => {
		const { workbench, content, workspace, pickers, input } = createComposer(false, 700, true);
		const targetWindow = dom.getWindow(workbench);

		assert.deepStrictEqual({
			workspaceGrows: targetWindow.getComputedStyle(workspace).flexGrow,
			workspaceLogo: targetWindow.getComputedStyle(workspace, '::before').display,
			separateHero: targetWindow.getComputedStyle(content, '::before').content,
			pickerAboveInput: pickers.getBoundingClientRect().bottom < input.getBoundingClientRect().top,
		}, {
			workspaceGrows: '1',
			workspaceLogo: 'block',
			separateHero: 'none',
			pickerAboveInput: true,
		});
	});

	test('restores desktop composer layout when leaving phone layout', () => {
		const { workbench, content, workspace } = createComposer(true, 700, true);
		workbench.classList.remove('phone-layout');
		const targetWindow = dom.getWindow(workbench);

		assert.deepStrictEqual({
			workspaceOrder: targetWindow.getComputedStyle(workspace).order,
			workspaceGrows: targetWindow.getComputedStyle(workspace).flexGrow,
			workspaceMarginTop: targetWindow.getComputedStyle(workspace).marginTop,
			hero: targetWindow.getComputedStyle(content, '::before').content,
		}, {
			workspaceOrder: '0',
			workspaceGrows: '0',
			workspaceMarginTop: '12px',
			hero: 'none',
		});
	});

	test('does not add a phone hero to the in-session composer', () => {
		const { workbench, widget, content } = createComposer(true, 700, false);
		widget.classList.add('new-chat-in-session');

		assert.strictEqual(dom.getWindow(workbench).getComputedStyle(content, '::before').content, 'none');
	});

	test('does not add a phone hero to the no-agent-host empty state', () => {
		const { workbench, content, workspace } = createComposer(true, 700, false);
		content.classList.add('no-agent-host');
		const targetWindow = dom.getWindow(workbench);

		assert.deepStrictEqual({
			hero: targetWindow.getComputedStyle(content, '::before').content,
			workspaceGrows: targetWindow.getComputedStyle(workspace).flexGrow,
			workspaceOrder: targetWindow.getComputedStyle(workspace).order,
		}, {
			hero: 'none',
			workspaceGrows: '1',
			workspaceOrder: '0',
		});
	});

	test('restores the phone hero picker when the experimental layout is disabled', () => {
		const { workbench, content, workspace, pickers, input } = createComposer(true, 700, true);
		content.classList.remove('experimental-new-session-composer');
		const targetWindow = dom.getWindow(workbench);

		assert.deepStrictEqual({
			workspaceGrows: targetWindow.getComputedStyle(workspace).flexGrow,
			workspaceOrder: targetWindow.getComputedStyle(workspace).order,
			workspaceLogo: targetWindow.getComputedStyle(workspace, '::before').display,
			separateHero: targetWindow.getComputedStyle(content, '::before').content,
			pickerAboveInput: pickers.getBoundingClientRect().bottom < input.getBoundingClientRect().top,
		}, {
			workspaceGrows: '1',
			workspaceOrder: '0',
			workspaceLogo: 'block',
			separateHero: 'none',
			pickerAboveInput: true,
		});
	});
});
