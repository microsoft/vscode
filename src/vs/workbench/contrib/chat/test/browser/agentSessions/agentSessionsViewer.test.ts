/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../../browser/agentSessions/media/agentsessionsviewer.css';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mainWindow } from '../../../../../../base/browser/window.js';

suite('AgentSessionsViewer styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const themeClass of ['', 'hc-black', 'hc-light']) {
		test(`input-needed rows use static icons and ${themeClass ? `left-edge markers in ${themeClass}` : 'warning backgrounds'}`, () => {
			const container = mainWindow.document.createElement('div');
			container.className = 'agent-sessions-viewer';
			container.style.setProperty('--vscode-spacing-size20', '2px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			container.style.setProperty('--vscode-list-warningForeground', 'rgb(0, 0, 255)');
			container.style.setProperty('--vscode-agentSessionNeedsInput-foreground', 'rgb(255, 0, 0)');

			const sessionRow = mainWindow.document.createElement('div');
			sessionRow.className = 'monaco-list-row';
			const sessionItem = mainWindow.document.createElement('div');
			sessionItem.className = 'agent-session-item';
			const sessionMarker = mainWindow.document.createElement('span');
			sessionMarker.className = 'agent-session-attention-indicator';
			sessionMarker.setAttribute('aria-hidden', 'true');
			sessionItem.appendChild(sessionMarker);
			const sessionIcon = mainWindow.document.createElement('div');
			sessionIcon.className = 'agent-session-icon needs-input';
			sessionItem.appendChild(sessionIcon);
			sessionRow.appendChild(sessionItem);
			container.appendChild(sessionRow);

			const chatRow = mainWindow.document.createElement('div');
			chatRow.className = 'monaco-list-row';
			const chatItem = mainWindow.document.createElement('div');
			chatItem.className = 'agent-session-chat-item needs-input';
			const chatMarker = mainWindow.document.createElement('span');
			chatMarker.className = 'agent-session-attention-indicator';
			chatMarker.setAttribute('aria-hidden', 'true');
			chatItem.appendChild(chatMarker);
			const chatIcon = mainWindow.document.createElement('div');
			chatIcon.className = 'agent-session-chat-icon needs-input';
			chatItem.appendChild(chatIcon);
			chatRow.appendChild(chatItem);
			container.appendChild(chatRow);

			const wrapper = mainWindow.document.createElement('div');
			wrapper.className = themeClass;
			wrapper.appendChild(container);
			mainWindow.document.body.appendChild(wrapper);
			store.add(toDisposable(() => wrapper.remove()));
			assert.deepStrictEqual([
				{ background: sessionRow, icon: sessionIcon, marker: sessionMarker },
				{ background: chatItem, icon: chatIcon, marker: chatMarker },
			].map(({ background, icon, marker }) => ({
				hasWarningBackground: ['color(srgb 1 0 0 / 0.08)', 'rgba(255, 0, 0, 0.08)'].includes(mainWindow.getComputedStyle(background).backgroundColor),
				borderWidth: mainWindow.getComputedStyle(background).borderLeftWidth,
				markerDisplay: mainWindow.getComputedStyle(marker).display,
				markerCornerRadius: mainWindow.getComputedStyle(marker).borderRadius,
				markerWidth: mainWindow.getComputedStyle(marker).width,
				markerInsets: [mainWindow.getComputedStyle(marker).top, mainWindow.getComputedStyle(marker).bottom],
				markerAriaHidden: marker.getAttribute('aria-hidden'),
				backgroundAnimation: mainWindow.getComputedStyle(background).animationName,
				iconAnimation: mainWindow.getComputedStyle(icon).animationName,
			})), [
				{
					hasWarningBackground: !themeClass,
					borderWidth: '0px',
					markerDisplay: themeClass ? 'block' : 'none',
					markerCornerRadius: '0px',
					markerWidth: '2px',
					markerInsets: ['4px', '4px'],
					markerAriaHidden: 'true',
					backgroundAnimation: 'none',
					iconAnimation: 'none',
				},
				{
					hasWarningBackground: !themeClass,
					borderWidth: '0px',
					markerDisplay: themeClass ? 'block' : 'none',
					markerCornerRadius: '0px',
					markerWidth: '2px',
					markerInsets: ['4px', '4px'],
					markerAriaHidden: 'true',
					backgroundAnimation: 'none',
					iconAnimation: 'none',
				},
			]);
		});
	}
});
