/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomViewDescriptor } from '../../../../services/customView/browser/customView.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasState } from '../../../canvases/browser/pinnedCanvases.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness } from '../browser/sessionsListTestUtils.js';

/** Focus styles only match while the document has focus, so give the test's web contents real focus. */
async function setWebContentsFocus(focused: boolean): Promise<void> {
	const changed = mainWindow.document.hasFocus() === focused
		? undefined
		: new Promise<void>(resolve => mainWindow.addEventListener(focused ? dom.EventType.FOCUS : dom.EventType.BLUR, () => resolve(), { once: true }));
	await ipcRenderer.invoke('vscode:test-set-web-contents-focus', focused);
	await changed;
}

suite('SessionsList - pinned canvas focus ring', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setWebContentsFocus(true));

	test('a press does not ring the pinned canvas row the page shows, while keyboard focus does, in both sidebar layouts', async () => {
		const plan = upcastPartial<IPinnedCanvas>({
			id: 'plan',
			title: constObservable('Agent Plan'),
			chatTitle: constObservable('Fix login bug'),
			state: constObservable(PinnedCanvasState.Live),
			canvas: constObservable(undefined),
		});
		const results = [];
		for (const separateNavigation of [true, false]) {
			const activeCustomView = observableValue<ICustomViewDescriptor | undefined>(disposables, undefined);
			const harness = createListHarness(disposables, [], instantiationService => {
				ChatContextKeys.enabled.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = activeCustomView;
				});
			});
			const container = harness.createContainer();
			// The list draws its focus ring with this theme color.
			container.style.setProperty('--vscode-list-focusOutline', 'rgb(0, 120, 212)');
			const navigationContainer = dom.$('.agent-sessions-navigation-container');
			const listContainer = dom.$('div');
			container.append(navigationContainer, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => separateNavigation,
				navigationContainer,
				pinnedCanvases: upcastPartial<IPinnedCanvasService>({
					entries: constObservable([plan]),
					selected: constObservable(plan),
					show: async () => { },
				}),
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const pressTarget = separateNavigation ? navigationContainer : listContainer.querySelector<HTMLElement>('.sessions-list-control');
			const row = (separateNavigation ? navigationContainer : listContainer).querySelector('.session-section-pinned-canvas')?.closest<HTMLElement>('.monaco-list-row');
			const listElement = row?.closest<HTMLElement>('.monaco-list');
			assert.ok(pressTarget && row && listElement);
			// The user chose the pin, so its list focuses its row, and the page shows it.
			row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			await Promise.resolve();
			activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: PINNED_CANVAS_PAGE_ID }), undefined);
			const ring = () => mainWindow.getComputedStyle(row).outlineStyle;
			// Pressing another row focuses the list before its focused row moves.
			pressTarget.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
			listElement.focus();
			const whilePressed = ring();
			mainWindow.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			const withKeyboardFocus = ring();
			listElement.blur();
			results.push({ separateNavigation, focused: row.classList.contains('focused'), whilePressed, withKeyboardFocus });
		}

		assert.deepStrictEqual(results, [true, false].map(separateNavigation => ({
			separateNavigation,
			focused: true,
			whilePressed: 'none',
			withKeyboardFocus: 'solid',
		})));
	});
});
