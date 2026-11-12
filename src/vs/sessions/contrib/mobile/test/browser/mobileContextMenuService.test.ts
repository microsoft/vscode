/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { MobileContextMenuService } from '../../browser/mobileContextMenuService.js';

suite('MobileContextMenuService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('runs the selected action when command IDs repeat across nested submenus', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const service = store.add(new MobileContextMenuService(
				upcastPartial<ILayoutService>({ mainContainer: container }),
				upcastPartial<IMenuService>({}),
				upcastPartial<IContextKeyService>({}),
			));
			const selected: string[] = [];
			const actions = ['First', 'Second', 'Third'].map(label => toAction({
				id: 'repeated-command', label, run: () => { selected.push(label); },
			}));
			const menu = [
				new SubmenuAction('first', 'First section', [actions[0]]),
				new SubmenuAction('second', 'Second section', [new SubmenuAction('nested', 'Nested section', [actions[1]])]),
				actions[2],
			];
			const hidden: boolean[] = [];
			for (let index = 0; index < actions.length; index++) {
				service.showContextMenu({
					getAnchor: () => container,
					getActions: () => menu,
					onHide: cancelled => hidden.push(!!cancelled),
				});
				container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-item')[index].click();
				await timeout(500);
			}
			assert.deepStrictEqual({ selected, hidden, remaining: container.childElementCount }, {
				selected: ['First', 'Second', 'Third'], hidden: [false, false, false], remaining: 0,
			});
		});
	});
});
