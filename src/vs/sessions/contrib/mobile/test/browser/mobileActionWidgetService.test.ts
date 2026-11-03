/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { MobileActionWidgetService } from '../../browser/mobileActionWidgetService.js';

suite('MobileActionWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('updates an open filter and focuses the requested model without reopening', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			store.add(toDisposable(() => container.remove()));
			const service = store.add(new MobileActionWidgetService(upcastPartial<ILayoutService>({ mainContainer: container })));
			const items: IActionListItem<{ id: string }>[] = [
				{ kind: ActionListItemKind.Action, label: 'Model A', item: { id: 'model-a' } },
				{ kind: ActionListItemKind.Action, label: 'Model B', item: { id: 'model-b' } },
			];
			const hidden: (boolean | undefined)[] = [];
			service.show('test', false, items, {
				onHide: cancelled => hidden.push(cancelled),
				onSelect: () => { },
				onFilter: async query => items.filter(item => item.label?.includes(query)),
			}, container, undefined, undefined, undefined, { showFilter: true, initialFilterValue: 'Model A' });
			await timeout(0);
			const sheet = container.querySelector('.mobile-picker-sheet');
			const initial = container.querySelector('.mobile-picker-sheet-search-results')?.textContent;
			service.setFilter('Model B', 'model-b');
			await timeout(0);
			const updated = {
				query: container.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input')?.value,
				label: container.querySelector('.mobile-picker-sheet-search-results')?.textContent,
				focused: mainWindow.document.activeElement?.textContent,
				sameSheet: container.querySelector('.mobile-picker-sheet') === sheet,
			};
			service.setFilter('');
			await timeout(0);
			const restored = container.querySelector('.mobile-picker-sheet-search-results')?.textContent;
			service.dispose();
			service.setFilter('Model B');
			await timeout(500);
			assert.deepStrictEqual({ initial, updated, restored, hidden, remaining: container.childElementCount }, {
				initial: 'Model A',
				updated: { query: 'Model B', label: 'Model B', focused: 'Model B', sameSheet: true },
				restored: 'Model AModel B',
				hidden: [true],
				remaining: 0,
			});
		});
	});
});
