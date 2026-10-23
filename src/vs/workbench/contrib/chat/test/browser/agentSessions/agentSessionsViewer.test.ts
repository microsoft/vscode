/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../../browser/agentSessions/media/agentsessionsviewer.css';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../base/browser/window.js';

suite('AgentSessionsViewer styles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('input-needed session and chat rows use static icons and warning backgrounds', () => {
		const container = mainWindow.document.createElement('div');
		container.className = 'agent-sessions-viewer';
		container.style.setProperty('--vscode-list-warningForeground', 'rgb(255, 0, 0)');

		const sessionRow = mainWindow.document.createElement('div');
		sessionRow.className = 'monaco-list-row';
		const sessionItem = mainWindow.document.createElement('div');
		sessionItem.className = 'agent-session-item';
		const sessionIcon = mainWindow.document.createElement('div');
		sessionIcon.className = 'agent-session-icon needs-input';
		sessionItem.appendChild(sessionIcon);
		sessionRow.appendChild(sessionItem);
		container.appendChild(sessionRow);

		const chatRow = mainWindow.document.createElement('div');
		chatRow.className = 'monaco-list-row';
		const chatItem = mainWindow.document.createElement('div');
		chatItem.className = 'agent-session-chat-item needs-input';
		const chatIcon = mainWindow.document.createElement('div');
		chatIcon.className = 'agent-session-chat-icon needs-input';
		chatItem.appendChild(chatIcon);
		chatRow.appendChild(chatItem);
		container.appendChild(chatRow);

		mainWindow.document.body.appendChild(container);
		try {
			assert.deepStrictEqual([
				{ background: sessionRow, icon: sessionIcon },
				{ background: chatItem, icon: chatIcon },
			].map(({ background, icon }) => ({
				hasWarningBackground: ['color(srgb 1 0 0 / 0.08)', 'rgba(255, 0, 0, 0.08)'].includes(mainWindow.getComputedStyle(background).backgroundColor),
				backgroundAnimation: mainWindow.getComputedStyle(background).animationName,
				iconAnimation: mainWindow.getComputedStyle(icon).animationName,
			})), [
				{
					hasWarningBackground: true,
					backgroundAnimation: 'none',
					iconAnimation: 'none',
				},
				{
					hasWarningBackground: true,
					backgroundAnimation: 'none',
					iconAnimation: 'none',
				},
			]);
		} finally {
			container.remove();
		}
	});
});
