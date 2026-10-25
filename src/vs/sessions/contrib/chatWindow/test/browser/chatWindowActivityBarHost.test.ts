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
		test(`stacked, keeps the strip below the editor's tabs, also once they show after the part laid out (${density} density)`, async () => {
			const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
			instantiationService.stub(IWorkbenchLayoutService, new TestHostLayoutService());
			const part = await createEditorPart(instantiationService, disposables);
			const editor = part.activeGroup as EditorGroupView;
			// The test DOM does not measure tabs: their height is set as the group lays them out.
			let titleOffset = 0;
			Object.defineProperty(editor, 'titleHeight', { get: () => ({ offset: titleOffset, total: titleOffset }) });
			// A chat window opening stacked lays the part out before the editor's tabs show.
			disposables.add(registerChatWindowActivityBarHost(part, part.element, constObservable(SessionLayoutMode.Stacked), () => editor));
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
});
