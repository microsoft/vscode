/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell, IChatWindowGridChrome } from '../../browser/chatWindowGrid.js';
import { ChatWindowLayoutMode } from '../../common/chatWindowLayout.js';

suite('Chat window grid', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(name: string): IContentPart {
		const group = new class extends mock<IEditorGroup>() {
			override readonly isEmpty = false;
			override readonly onDidModelChange = Event.None;
		}();
		return new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [group];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
		}();
	}

	function createChrome(size: number): IChatWindowGridChrome {
		return { element: $('div'), visible: constObservable(true), size: constObservable(size), layout: () => { } };
	}

	function setup() {
		const mode = observableValue<ChatWindowLayoutMode>('mode', ChatWindowLayoutMode.SideBySide);
		const container = $('div');
		const grid = disposables.add(new ChatWindowGrid(container, { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, mode, constObservable(0), undefined));
		grid.layout(1000, 800);
		const visible = () => [ChatWindowGridCell.TitleRow, ChatWindowGridCell.Chat, ChatWindowGridCell.Main, ChatWindowGridCell.Strip].filter(cell => grid.partGrid!.isCellVisible(cell));
		return { mode, grid, visible };
	}

	test('the title row is above the chat while the main part is beside it, else across the window; the strip has a column of its own while the chat is below the main part or hidden', () => {
		const { mode, grid, visible } = setup();
		const layouts: Record<string, { topology: string; visible: string[] }> = {};
		for (const candidate of [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.ChatOnly, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.EditorOnly]) {
			mode.set(candidate, undefined);
			layouts[candidate] = { topology: grid.partGrid!.describe(), visible: visible() };
		}

		assert.deepStrictEqual(layouts, {
			[ChatWindowLayoutMode.SideBySide]: { topology: 'row(column(titleRow, chat), main)', visible: ['titleRow', 'chat', 'main'] },
			[ChatWindowLayoutMode.ChatOnly]: { topology: 'row(column(titleRow, chat), main)', visible: ['titleRow', 'chat'] },
			[ChatWindowLayoutMode.Stacked]: { topology: 'column(titleRow, row(column(main, chat), strip))', visible: ['titleRow', 'chat', 'main', 'strip'] },
			[ChatWindowLayoutMode.EditorOnly]: { topology: 'column(titleRow, row(column(main, chat), strip))', visible: ['titleRow', 'main', 'strip'] },
		});
	});

	test('opens with the main part wider and taller than the chat, and the title row and strip as large as they say', () => {
		const { mode, grid } = setup();
		const sideBySide = { chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).width, titleRow: grid.partGrid!.getCellSize(ChatWindowGridCell.TitleRow).height };
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		const stacked = { chat: grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).height, main: grid.partGrid!.getCellSize(ChatWindowGridCell.Main).height, strip: grid.partGrid!.getCellSize(ChatWindowGridCell.Strip).width };

		assert.deepStrictEqual({ sideBySide, stacked }, {
			sideBySide: { chat: 400, main: 600, titleRow: 30 },
			stacked: { chat: 346, main: 424, strip: 34 },
		});
	});

	test('a part keeps the size the user gave it in each arrangement, and the sizes come back for the chat in a new window', () => {
		const { mode, grid } = setup();
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 300, height: 770 });
		mode.set(ChatWindowLayoutMode.Stacked, undefined);
		grid.partGrid!.resizeCell(ChatWindowGridCell.Chat, { width: 966, height: 200 });
		mode.set(ChatWindowLayoutMode.SideBySide, undefined);
		const backSideBySide = grid.partGrid!.getCellSize(ChatWindowGridCell.Chat).width;
		const sizes = grid.exportSizes();

		const restored = disposables.add(new ChatWindowGrid($('div'), { main: createPart('main'), chat: createPart('chat'), titleRow: createChrome(30), strip: createChrome(34) }, constObservable(ChatWindowLayoutMode.Stacked), constObservable(0), sizes));
		restored.layout(1000, 800);

		assert.deepStrictEqual({ backSideBySide, restoredStacked: restored.partGrid!.getCellSize(ChatWindowGridCell.Chat).height }, { backSideBySide: 300, restoredStacked: 200 });
	});
});
