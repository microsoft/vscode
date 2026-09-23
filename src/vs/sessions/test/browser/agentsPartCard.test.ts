/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/workbench.css';
import '../../browser/parts/mobile/mobileChatShell.css';
import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getAgentsPartCardContentSize } from '../../browser/parts/agentsPartCard.js';

suite('Sessions - Agents Part Card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCard(sidebarVisible: boolean, editorPaneVisible: boolean, phone: boolean = false) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '800px';
		container.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
		container.classList.toggle('nosidebar', !sidebarVisible);
		container.classList.toggle('noeditorpane', !editorPaneVisible);
		container.classList.toggle('phone-layout', phone);

		const card = append(container, $('.agents-part-card'));
		card.style.transition = 'none';

		return { container, card };
	}

	for (const { sidebarVisible, editorPaneVisible, contentWidth } of [
		{ sidebarVisible: true, editorPaneVisible: true, contentWidth: 794 },
		{ sidebarVisible: true, editorPaneVisible: false, contentWidth: 798 },
		{ sidebarVisible: false, editorPaneVisible: true, contentWidth: 790 },
		{ sidebarVisible: false, editorPaneVisible: false, contentWidth: 794 },
	]) {
		test(`matches card margins with sidebar ${sidebarVisible ? 'visible' : 'hidden'} and editor pane ${editorPaneVisible ? 'visible' : 'hidden'}`, () => {
			const { container, card } = createCard(sidebarVisible, editorPaneVisible);
			const containerBounds = container.getBoundingClientRect();
			const cardBounds = card.getBoundingClientRect();

			assert.deepStrictEqual({
				leftGap: cardBounds.left - containerBounds.left,
				rightGap: containerBounds.right - cardBounds.right,
				renderedContentWidth: card.clientWidth,
				contentSize: getAgentsPartCardContentSize(800, 600, editorPaneVisible, sidebarVisible),
			}, {
				leftGap: sidebarVisible ? 0 : 4,
				rightGap: editorPaneVisible ? 4 : 0,
				renderedContentWidth: contentWidth,
				contentSize: { width: contentWidth, height: 598 },
			});
		});
	}

	test('keeps phone cards edge-to-edge when the sidebar is hidden', () => {
		const { container, card } = createCard(false, false, true);
		const containerBounds = container.getBoundingClientRect();
		const cardBounds = card.getBoundingClientRect();

		assert.deepStrictEqual({
			leftGap: cardBounds.left - containerBounds.left,
			rightGap: containerBounds.right - cardBounds.right,
			contentWidth: card.clientWidth,
		}, {
			leftGap: 0,
			rightGap: 0,
			contentWidth: 800,
		});
	});
});
