/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, addDisposableListener, append, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PART_GRID_TOP_EDGE_CLASS, PART_GRID_TOP_EDGE_GROUP_CLASS } from '../../../../../workbench/browser/parts/partGrid/partGrid.js';
import { AGENTS_CHAT_WINDOW_CLASS, registerChatWindowTitleDoubleClick } from '../../browser/chatWindowTitleDoubleClick.js';

suite('Chat window title double-click', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a double-click on the empty space of a tab row at the top edge of a chat window does what one on the title bar does, and not elsewhere', () => {
		const events: string[] = [];
		const chatWindow = append(mainWindow.document.body, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
		disposables.add(toDisposable(() => chatWindow.remove()));
		const createGroup = (name: string, cellClasses: string, groupClasses: string) => {
			const group = append(append(chatWindow, $(`.part-grid-cell${cellClasses}`)), $(`.editor-group-container${groupClasses}`));
			const title = append(group, $('.title'));
			const tabsContainer = append(append(title, $('.tabs-and-actions-container')), $('.tabs-container'));
			const tab = append(tabsContainer, $('.tab'));
			// As the tab row does: a double-click on its empty space opens an untitled editor, one on a tab pins it.
			disposables.add(addDisposableListener(tabsContainer, EventType.DBLCLICK, e => events.push(e.target === tabsContainer ? `untitled in ${name}` : `pin in ${name}`)));
			return { tabsContainer, tab };
		};
		const top = createGroup('top', `.${PART_GRID_TOP_EDGE_CLASS}`, `.${PART_GRID_TOP_EDGE_GROUP_CLASS}`);
		// A group below another in a part at the top edge, and a part below the top edge.
		const lowerGroup = createGroup('lower group', `.${PART_GRID_TOP_EDGE_CLASS}`, '');
		const lowerPart = createGroup('lower part', '', `.${PART_GRID_TOP_EDGE_GROUP_CLASS}`);
		disposables.add(registerChatWindowTitleDoubleClick(mainWindow, () => events.push('title bar')));

		const doubleClick = (target: HTMLElement) => target.dispatchEvent(new MouseEvent(EventType.DBLCLICK, { bubbles: true }));
		doubleClick(top.tabsContainer);
		doubleClick(top.tab);
		doubleClick(lowerGroup.tabsContainer);
		doubleClick(lowerPart.tabsContainer);
		// Once the part moved to the top edge of the window, as by Move Part.
		lowerPart.tabsContainer.closest('.part-grid-cell')!.classList.add(PART_GRID_TOP_EDGE_CLASS);
		doubleClick(lowerPart.tabsContainer);

		assert.deepStrictEqual(events, ['title bar', 'pin in top', 'untitled in lower group', 'untitled in lower part', 'title bar']);
	});
});
