/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDimension } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { EditorGroupView } from '../../../../../workbench/browser/parts/editor/editorGroupView.js';
import { createEditorPart, TestLayoutService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { GroupDirection } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { findSessionActivityBarExternalHost, SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../../browser/parts/sessionActivityBar.js';
import { SessionLayoutMode } from '../../../../common/sessionLayoutMode.js';
import { registerChatWindowActivityBarHost } from '../../browser/chatWindowActivityBarHost.js';

class TestHostLayoutService extends TestLayoutService {
	override getMaximumEditorDimensions(): IDimension { return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }; }
}

suite('Chat window - Session Activity Bar host', () => {

	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [density, tabHeight] of [['default', 35], ['compact', 22]] as const) {
		test(`with the chat hidden, keeps the strip below the editor's tabs, also once they show after the part laid out (${density} density)`, async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.stub(IWorkbenchLayoutService, new TestHostLayoutService());
			const part = await createEditorPart(instantiationService, disposables);
			const editor = part.activeGroup as EditorGroupView;
			// The test DOM does not measure tabs: their height is set as the group lays them out.
			let titleOffset = 0;
			Object.defineProperty(editor, 'titleHeight', { get: () => ({ offset: titleOffset, total: titleOffset }) });
			// A chat window opening with the chat hidden lays the part out before the editor's tabs show.
			disposables.add(registerChatWindowActivityBarHost(part, part.element, constObservable(SessionLayoutMode.EditorOnly), () => editor));
			const host = part.element.querySelector<HTMLElement>('.session-activity-bar-editor-host')!;
			const beforeTabs = parseInt(host.style.top);
			titleOffset = tabHeight;
			editor.relayout();

			assert.deepStrictEqual({ beforeTabs, top: parseInt(host.style.top), height: parseInt(host.style.height) }, {
				beforeTabs: 0,
				// The strip starts below the tabs, so it does not cover the editor's title actions at their right end.
				top: tabHeight,
				height: part.contentDimension.height - tabHeight,
			});
		});
	}

	test('stacked, splits the window into the groups and a column of its own the full height of the window; with the chat hidden, the editor makes room for the strip below its tabs', async () => {
		const results: Record<string, unknown> = {};
		for (const mode of [SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly]) {
			const store = disposables.add(new DisposableStore());
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, store);
			instantiationService.stub(IWorkbenchLayoutService, new TestHostLayoutService());
			const part = await createEditorPart(instantiationService, store);
			const editor = part.activeGroup as EditorGroupView;
			const chat = part.addGroup(editor, GroupDirection.DOWN) as EditorGroupView;
			// The test DOM does not measure tabs.
			Object.defineProperty(editor, 'titleHeight', { get: () => ({ offset: 35, total: 35 }) });
			store.add(registerChatWindowActivityBarHost(part, part.element, constObservable(mode), () => editor));
			// As the strip does once it shows in the host.
			findSessionActivityBarExternalHost(part.element)!.setOccupied(store, true);
			const widths = (group: EditorGroupView) => ({ group: part.getSize(group).width, content: parseInt(group.element.querySelector<HTMLElement>('.editor-container')!.style.width) });
			const host = part.element.querySelector<HTMLElement>('.session-activity-bar-editor-host')!;
			// The grid's views take the width of its container, not the one it is laid out at: the container ends with the grid.
			const groupsContainer = part.element.querySelector<HTMLElement>(':scope > .content')!;
			results[mode] = { groupsContainer: groupsContainer.style.width, editor: widths(editor), chat: widths(chat), host: { top: host.style.top, bottom: parseInt(host.style.top) + parseInt(host.style.height) === part.contentDimension.height, column: host.classList.contains('stacked-column') } };
			store.dispose();
		}

		const width = 1080;
		const column = SESSION_ACTIVITY_BAR_COLUMN_WIDTH;
		assert.deepStrictEqual(results, {
			// Both groups, tabs included, end before the column, which runs from the top of the window to its bottom.
			[SessionLayoutMode.Stacked]: { groupsContainer: `${width - column}px`, editor: { group: width - column, content: width - column }, chat: { group: width - column, content: width - column }, host: { top: '0px', bottom: true, column: true } },
			// Below the editor's full-width tabs, the content of the groups at the right edge leaves the column.
			[SessionLayoutMode.EditorOnly]: { groupsContainer: '', editor: { group: width, content: width - column }, chat: { group: width, content: width - column }, host: { top: '35px', bottom: true, column: false } },
		});
	});
});
