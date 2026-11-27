/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toAction } from '../../../../../../base/common/actions.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SessionsFilterChips } from '../../../browser/views/sessionsFilterChips.js';

suite('SessionsFilterChips', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a narrow row reserves room for the controls and the overflow count', () => {
		const fit = (width: number) => SessionsFilterChips.visibleChipCount(width, [60, 54, 46], 58, 20, 4);
		assert.deepStrictEqual([230, 229, 204, 203, 146, 145, 82].map(fit), [3, 2, 2, 1, 1, 0, 0]);
	});

	test('a narrow row keeps both scope pickers before overflowing optional filters', () => {
		const fit = (width: number) => SessionsFilterChips.visibleChipCount(width, [90, 110, 50], 44, 24, 4, 2);
		assert.deepStrictEqual([320, 260, 220].map(fit), [3, 2, 2]);
	});

	test('the funnel opens its menu with Enter and a clear control removes only its own choice', async () => {
		const container = append(mainWindow.document.body, $('div'));
		container.style.width = '800px';
		store.add(toDisposable(() => container.remove()));
		let delegate: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;
		const menu = upcastPartial<IContextMenuService>({ showContextMenu: value => delegate = value });
		const selected = new Set(['Workspace', 'Harness']);
		const row = store.add(new SessionsFilterChips(container, () => [toAction({
			id: 'scheduled', label: 'Scheduled Only', run: () => { selected.add('Scheduled Only'); render(); },
		})], () => { }, menu, NullHoverService, new MockKeybindingService()));
		const render = () => row.setChips([...selected].map(label => ({
			id: label, label, edit: () => { }, clear: () => { selected.delete(label); render(); },
		})));
		render();
		const before = row.filterCount;
		container.querySelector<HTMLElement>('[aria-label="Filter Sessions"]')!.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const addFilter = delegate?.getActions?.()[0];
		assert.ok(addFilter, 'Expected the funnel to open a menu');
		await addFilter.run();
		container.querySelector<HTMLElement>('[aria-label="Clear Workspace"]')!.click();
		assert.deepStrictEqual({ before, after: [...selected], count: row.filterCount }, {
			before: 2, after: ['Harness', 'Scheduled Only'], count: 2,
		});
	});
});
