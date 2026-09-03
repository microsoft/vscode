/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import '../../../workbench/browser/parts/editor/media/multieditortabscontrol.css';
import '../../browser/media/workbench.css';
import '../../browser/parts/media/chatCompositeBar.css';
import '../../browser/parts/media/editorPart.css';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - EditorPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('constrains the Browser navbar to the editor header height', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-spacing-size40', '4px');
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');

		const editorPart = appendElement(workbench, 'part editor');
		const editorContent = appendElement(editorPart, 'content');
		const editorGroupContainer = appendElement(editorContent, 'editor-group-container');
		const browserRoot = appendElement(editorGroupContainer, 'browser-root');
		const navbar = appendElement(browserRoot, 'browser-navbar');
		navbar.style.display = 'flex';
		navbar.style.alignItems = 'center';

		const urlContainer = appendElement(navbar, 'browser-url-container');
		urlContainer.style.height = '25px';

		try {
			const defaultHeight = mainWindow.getComputedStyle(navbar).height;
			editorGroupContainer.classList.add('editor-tabs-compact-height');
			const compactHeight = mainWindow.getComputedStyle(navbar).height;

			assert.deepStrictEqual({ defaultHeight, compactHeight }, {
				defaultHeight: '32px',
				compactHeight: '28px',
			});
		} finally {
			workbench.remove();
		}
	});

	test('matches the chat tab container separator', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-activeSessionView-foreground', 'rgb(100, 100, 100)');
		workbench.style.setProperty('--vscode-agentsPanel-foreground', 'rgb(100, 100, 100)');
		workbench.style.setProperty('--vscode-contrastBorder', 'rgb(255, 255, 255)');
		workbench.style.setProperty('--vscode-spacing-size20', '2px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');

		const editorPart = appendElement(workbench, 'part editor');
		const editorContent = appendElement(editorPart, 'content');
		const editorGroupContainer = appendElement(editorContent, 'editor-group-container');
		const title = appendElement(editorGroupContainer, 'title tabs');
		const tabsAndActionsContainer = appendElement(title, 'tabs-and-actions-container tabs-border-bottom');
		tabsAndActionsContainer.style.setProperty('--tabs-border-bottom-color', 'var(--modern-ui-editor-tabs-border)');

		const sessionView = appendElement(workbench, 'session-view tabs-replace-header');
		sessionView.style.setProperty('--session-view-foreground', 'rgb(100, 100, 100)');
		const chatGroupsView = appendElement(sessionView, 'chat-groups-view single-group');
		const chatBar = appendElement(chatGroupsView, 'chat-composite-bar session-chat-tabs-bar');
		const chatTabsRow = appendElement(chatBar, 'chat-composite-bar-tabs-row');

		try {
			const getSeparatorStyles = () => {
				const titleSeparatorStyle = mainWindow.getComputedStyle(tabsAndActionsContainer, '::after');
				const chatBarStyle = mainWindow.getComputedStyle(chatBar);
				const chatTabsRowStyle = mainWindow.getComputedStyle(chatTabsRow);
				return {
					sidePanel: {
						color: titleSeparatorStyle.backgroundColor,
						leftInset: titleSeparatorStyle.left,
						rightInset: titleSeparatorStyle.right,
						width: titleSeparatorStyle.height,
					},
					chat: {
						color: chatTabsRowStyle.borderBottomColor,
						leftInset: chatBarStyle.paddingLeft,
						rightInset: chatBarStyle.paddingRight,
						width: chatTabsRowStyle.borderBottomWidth,
					},
				};
			};

			const defaultTheme = getSeparatorStyles();
			workbench.classList.add('hc-black');
			const highContrastTheme = getSeparatorStyles();

			assert.deepStrictEqual({
				defaultTheme,
				highContrastTheme,
				hasDuplicateTitleSeparator: mainWindow.getComputedStyle(title, '::after').content !== 'none',
			}, {
				defaultTheme: {
					sidePanel: {
						color: defaultTheme.chat.color,
						leftInset: '2px',
						rightInset: '2px',
						width: '1px',
					},
					chat: {
						color: defaultTheme.chat.color,
						leftInset: '2px',
						rightInset: '2px',
						width: '1px',
					},
				},
				highContrastTheme: {
					sidePanel: {
						color: 'rgb(255, 255, 255)',
						leftInset: '2px',
						rightInset: '2px',
						width: '1px',
					},
					chat: {
						color: 'rgb(255, 255, 255)',
						leftInset: '2px',
						rightInset: '2px',
						width: '1px',
					},
				},
				hasDuplicateTitleSeparator: false,
			});
		} finally {
			workbench.remove();
		}
	});
});
