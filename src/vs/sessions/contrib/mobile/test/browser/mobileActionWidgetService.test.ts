/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { MobileActionWidgetService } from '../../browser/mobileActionWidgetService.js';

suite('MobileActionWidgetService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness() {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const service = store.add(new MobileActionWidgetService(upcastPartial<ILayoutService>({ mainContainer: container })));
		return { container, service };
	}

	for (const selectFooter of [false, true]) {
		test(`updates a loading sheet in place and runs the latest ${selectFooter ? 'footer action' : 'item'}`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const { container, service } = createHarness();
				const selected: { id: string; version: number }[] = [];
				const hidden: (boolean | undefined)[] = [];
				let footerRuns = 0;
				const loading: IActionListItem<{ id: string; version: number }>[] = [
					{ kind: ActionListItemKind.Action, label: 'Loading branches...', disabled: true },
				];
				service.show('test', false, loading, {
					onHide: cancelled => hidden.push(cancelled),
					onSelect: item => selected.push(item),
				}, container, undefined, [toAction({ id: 'manage', label: 'Manage branches', run: () => { footerRuns++; } })]);
				const sheet = container.querySelector('.mobile-picker-sheet');
				service.updateItems([
					{ kind: ActionListItemKind.Action, label: 'Main', item: { id: 'main', version: 1 } },
					{ kind: ActionListItemKind.Action, label: 'Feature', item: { id: 'feature', version: 1 } },
				], 'feature');
				const initialFocus = mainWindow.document.activeElement?.textContent;
				service.updateItems([
					{ kind: ActionListItemKind.Action, label: 'Main', item: { id: 'main', version: 2 } },
					{ kind: ActionListItemKind.Action, label: 'Updated feature', item: { id: 'feature', version: 2 } },
				]);
				const rows = container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-item');
				const updated = {
					sameSheet: container.querySelector('.mobile-picker-sheet') === sheet,
					labels: [...rows].map(row => row.textContent),
					focus: mainWindow.document.activeElement?.textContent,
				};
				rows[selectFooter ? 2 : 1].click();
				await timeout(500);
				service.dispose();
				service.updateItems([]);
				assert.deepStrictEqual({ initialFocus, updated, selected, footerRuns, hidden, remaining: container.childElementCount }, {
					initialFocus: 'Feature',
					updated: { sameSheet: true, labels: ['Main', 'Updated feature', 'Manage branches'], focus: 'Updated feature' },
					selected: selectFooter ? [] : [{ id: 'feature', version: 2 }],
					footerRuns: selectFooter ? 1 : 0,
					hidden: [false],
					remaining: 0,
				});
			});
		});
	}

	test('preserves the filter and rejects stale search results when items update', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { container, service } = createHarness();
			const oldItem: IActionListItem<{ id: string; version: number }> = {
				kind: ActionListItemKind.Action, label: 'Model B', item: { id: 'b', version: 1 },
			};
			let items = [oldItem];
			const pending = new DeferredPromise<readonly IActionListItem<{ id: string; version: number }>[]>();
			let firstQuery = true;
			const selected: { id: string; version: number }[] = [];
			const hidden: (boolean | undefined)[] = [];
			service.show('test', false, items, {
				onHide: cancelled => hidden.push(cancelled),
				onSelect: item => selected.push(item),
				onFilter: async query => {
					if (firstQuery) {
						firstQuery = false;
						return pending.p;
					}
					return items.filter(item => item.label?.includes(query));
				},
			}, container, undefined, undefined, undefined, { showFilter: true, initialFilterValue: 'Model B' });
			const sheet = container.querySelector('.mobile-picker-sheet');
			items = [
				{ kind: ActionListItemKind.Action, label: 'Model A updated', item: { id: 'a', version: 2 } },
				{ kind: ActionListItemKind.Action, label: 'Model B updated', item: { id: 'b', version: 2 } },
			];
			service.updateItems(items, 'b', { focusFilter: true, preserveScrollPosition: true });
			await timeout(0);
			const filter = container.querySelector<HTMLInputElement>('.mobile-picker-sheet-search-input')!;
			const updated = {
				query: filter.value,
				label: container.querySelector('.mobile-picker-sheet-search-results')?.textContent,
				filterFocused: mainWindow.document.activeElement === filter,
				sameSheet: container.querySelector('.mobile-picker-sheet') === sheet,
			};
			await pending.complete([oldItem]);
			await timeout(0);
			const afterStaleResult = container.querySelector('.mobile-picker-sheet-search-results')?.textContent;
			service.setFilter('');
			await timeout(0);
			const restored = container.querySelector('.mobile-picker-sheet-search-results')?.textContent;
			container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-search-results .mobile-picker-sheet-item')[1].click();
			await timeout(500);
			assert.deepStrictEqual({ updated, afterStaleResult, restored, selected, hidden, remaining: container.childElementCount }, {
				updated: { query: 'Model B', label: 'Model B updated', filterFocused: true, sameSheet: true },
				afterStaleResult: 'Model B updated',
				restored: 'Model A updatedModel B updated',
				selected: [{ id: 'b', version: 2 }],
				hidden: [false],
				remaining: 0,
			});
		});
	});

	test('updates an open filter and focuses the requested model without reopening', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { container, service } = createHarness();
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
