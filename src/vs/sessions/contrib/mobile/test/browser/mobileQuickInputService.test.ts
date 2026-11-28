/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IQuickPickItem, IQuickTreeItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { QuickInputService } from '../../../../../workbench/services/quickinput/browser/quickInputService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { MobileQuickInputService } from '../../browser/mobileQuickInputService.js';
import '../../../../browser/media/phoneLayout.css';
import '../../../../browser/mobile/media/mobileWorkbench.css';

suite('MobileQuickInputService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const item: IQuickPickItem = { label: 'Choice' };

	function createHarness(mobile = true) {
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-workbench'));
		container.classList.toggle('agent-sessions-workbench', mobile);
		container.classList.toggle('phone-layout', mobile);
		container.classList.toggle('mobile-workbench', mobile);
		container.style.cssText = 'position: relative; width: 390px; height: 600px;';
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store.add(new DisposableStore()));
		const layoutService = Object.assign(new TestLayoutService(), {
			mainContainer: container,
			activeContainer: container,
			containers: [container],
			mainContainerDimension: { width: 390, height: 600 },
			activeContainerDimension: { width: 390, height: 600 },
		});
		instantiationService.stub(ILayoutService, layoutService);
		const service = mobile
			? store.add(instantiationService.createInstance(MobileQuickInputService))
			: store.add(instantiationService.createInstance(QuickInputService));
		return { container, service };
	}

	for (const mobile of [false, true]) {
		test(`${mobile ? 'mobile' : 'desktop'} advanced picker metrics preserve scrolling, filtering and actions`, async () => {
			const { service, container } = createHarness(mobile);
			const picker = store.add(service.createQuickPick());
			const items: IQuickPickItem[] = Array.from({ length: 30 }, (_, index) => ({
				label: `Entry ${index}`,
				detail: index === 1 ? 'Additional detail' : undefined,
				buttons: index === 0 ? [{ iconClass: 'codicon codicon-close', tooltip: 'Remove', alwaysVisible: true }] : undefined,
			}));
			const triggered: string[] = [];
			let backCount = 0;
			let accepted: readonly IQuickPickItem[] = [];
			store.add(picker.onDidTriggerItemButton(e => triggered.push(e.item.label)));
			store.add(picker.onDidTriggerButton(() => backCount++));
			store.add(picker.onDidAccept(() => {
				accepted = picker.selectedItems;
				picker.hide();
			}));
			picker.canSelectMany = true;
			picker.items = items;
			picker.buttons = [service.backButton];
			picker.show();
			picker.activeItems = [items[0]];

			const row = (index: number) => container.querySelector<HTMLElement>(`.quick-input-list .monaco-list-row[data-index="${index}"]`)!;
			const first = row(0).getBoundingClientRect();
			const second = row(1).getBoundingClientRect();
			const input = container.querySelector<HTMLInputElement>('.quick-input-box input')!;
			const action = row(0).querySelector<HTMLElement>('.action-label')!;
			const actionBounds = action.getBoundingClientRect();
			const initial = {
				heights: [first.height, second.height],
				virtualHeights: [row(0).style.height, row(1).style.height],
				separated: first.bottom <= second.top,
				inputTouchSized: input.getBoundingClientRect().height >= 44,
				inputPhoneFont: parseFloat(mainWindow.getComputedStyle(input).fontSize) >= 16,
				actionInsideRow: actionBounds.top >= first.top && actionBounds.bottom <= first.bottom,
			};
			action.click();
			container.querySelector<HTMLElement>('.quick-input-left-action-bar .action-label')!.click();

			picker.activeItems = [items[29]];
			const last = row(29).getBoundingClientRect();
			const viewport = container.querySelector<HTMLElement>('.quick-input-list .monaco-list')!.getBoundingClientRect();
			const lastVisible = last.top >= viewport.top && last.bottom <= viewport.bottom;
			picker.value = 'Entry 29';
			await timeout(0);
			const filteredRows = container.querySelectorAll<HTMLElement>('.quick-input-list .monaco-list-row');
			filteredRows[0].querySelector<HTMLElement>('.monaco-checkbox')!.click();
			await service.accept();

			assert.deepStrictEqual({ initial, lastVisible, filteredCount: filteredRows.length, accepted: accepted.map(item => item.label), triggered, backCount }, {
				initial: {
					heights: [mobile ? 44 : 22, 44],
					virtualHeights: [`${mobile ? 44 : 22}px`, '44px'],
					separated: true,
					inputTouchSized: mobile,
					inputPhoneFont: mobile,
					actionInsideRow: true,
				},
				lastVisible: true,
				filteredCount: 1,
				accepted: ['Entry 29'],
				triggered: ['Entry 0'],
				backCount: 1,
			});
		});

		test(`${mobile ? 'mobile' : 'desktop'} separator rows do not overlap their items`, () => {
			const { service, container } = createHarness(mobile);
			const picker = store.add(service.createQuickPick({ useSeparators: true }));
			picker.items = [
				{ type: 'separator', label: 'Group', buttons: [{ iconClass: 'codicon codicon-close', tooltip: 'Remove Group', alwaysVisible: true }] },
				{ label: 'First' },
				{ label: 'Second', detail: 'Additional detail' },
			];
			picker.show();
			const rows = Array.from(container.querySelectorAll<HTMLElement>('.quick-input-list .monaco-list-row'));
			const bounds = rows.map(row => row.getBoundingClientRect());
			const result = {
				virtualHeights: rows.map(row => row.style.height),
				heights: bounds.map(row => row.height),
				separated: bounds.every((row, index) => !index || bounds[index - 1].bottom <= row.top),
			};
			picker.hide();
			assert.deepStrictEqual(result, {
				virtualHeights: mobile ? ['44px', '44px', '44px'] : ['30px', '22px', '44px'],
				heights: mobile ? [44, 44, 44] : [30, 22, 44],
				separated: true,
			});
		});

		test(`${mobile ? 'mobile' : 'desktop'} quick tree metrics preserve reveal and selection`, () => {
			const { service, container } = createHarness(mobile);
			const tree = store.add(service.createQuickTree<IQuickTreeItem>());
			const items: IQuickTreeItem[] = Array.from({ length: 30 }, (_, index) => ({ label: `File ${index}` }));
			tree.sortByLabel = false;
			tree.setItemTree(items);
			tree.show();
			const rows = container.querySelectorAll<HTMLElement>('.quick-input-tree .monaco-list-row');
			const first = rows[0].getBoundingClientRect();
			const second = rows[1].getBoundingClientRect();
			const virtualHeights = [rows[0].style.height, rows[1].style.height];
			tree.reveal(items[29]);
			const last = container.querySelector<HTMLElement>('.quick-input-tree .monaco-list-row[data-index="29"]')!;
			const lastBounds = last.getBoundingClientRect();
			const viewport = container.querySelector<HTMLElement>('.quick-input-tree .monaco-list')!.getBoundingClientRect();
			last.querySelector<HTMLElement>('.monaco-checkbox')!.click();
			const result = {
				heights: [first.height, second.height, lastBounds.height],
				virtualHeights,
				separated: first.bottom <= second.top,
				lastVisible: lastBounds.top >= viewport.top && lastBounds.bottom <= viewport.bottom,
				checked: tree.checkedLeafItems.map(item => item.label),
			};
			tree.hide();
			assert.deepStrictEqual(result, {
				heights: Array(3).fill(mobile ? 44 : 22),
				virtualHeights: Array(2).fill(mobile ? '44px' : '22px'),
				separated: true,
				lastVisible: true,
				checked: ['File 29'],
			});
		});
	}

	test('cancellation closes an open sheet and resolves the pending pick', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { service, container } = createHarness();
			const token = store.add(new CancellationTokenSource());
			const picked = service.pick([item], undefined, token.token);
			await timeout(0);
			const wasOpen = !!container.querySelector('.mobile-picker-sheet');
			token.cancel();
			await timeout(500);
			assert.deepStrictEqual({ wasOpen, result: await picked, open: !!container.querySelector('.mobile-picker-sheet') }, {
				wasOpen: true, result: undefined, open: false,
			});
		});
	});

	for (const waitingFor of ['items', 'active item'] as const) {
		test(`cancellation does not wait for unresolved ${waitingFor}`, async () => {
			const { service, container } = createHarness();
			const token = store.add(new CancellationTokenSource());
			const items = new DeferredPromise<IQuickPickItem[]>();
			const activeItem = new DeferredPromise<IQuickPickItem>();
			const result = service.pick(waitingFor === 'items' ? items.p : [item], waitingFor === 'active item' ? { activeItem: activeItem.p } : undefined, token.token);
			token.cancel();
			assert.deepStrictEqual({ result: await result, children: container.childElementCount }, { result: undefined, children: 0 });
		});
	}

	test('an already-cancelled input never opens a sheet', async () => {
		const { service, container } = createHarness();
		const token = store.add(new CancellationTokenSource());
		token.cancel();
		assert.deepStrictEqual({ result: await service.input({}, token.token), children: container.childElementCount }, { result: undefined, children: 0 });
	});

	test('accepts the submitted value rather than an edit made during validation', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { service, container } = createHarness();
			const validation = new DeferredPromise<string | undefined>();
			const values: string[] = [];
			const result = service.input({
				value: 'Submitted',
				validateInput: value => {
					values.push(value);
					return value === 'Submitted' ? validation.p : Promise.resolve('Invalid edit');
				},
			});
			container.querySelector<HTMLButtonElement>('.mobile-quick-input-submit')!.click();
			const input = container.querySelector<HTMLInputElement>('.mobile-quick-input-field')!;
			input.value = 'Edited';
			input.dispatchEvent(new Event('input'));
			await timeout(0);
			await validation.complete(undefined);
			await timeout(500);
			assert.deepStrictEqual({ values, result: await result, open: !!container.querySelector('.mobile-picker-sheet') }, {
				values: ['Submitted', 'Edited'], result: 'Submitted', open: false,
			});
		});
	});

	test('only the latest validation result updates the message, even after returning to an earlier value', async () => {
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { service, container } = createHarness();
			const validations: DeferredPromise<string | undefined>[] = [];
			const result = service.input({
				validateInput: () => {
					const validation = new DeferredPromise<string | undefined>();
					validations.push(validation);
					return validation.p;
				},
			});
			const input = container.querySelector<HTMLInputElement>('.mobile-quick-input-field')!;
			for (const value of ['First', 'Second', 'First']) {
				input.value = value;
				input.dispatchEvent(new Event('input'));
			}
			await validations[2].complete(undefined);
			await validations[1].complete('Stale second value');
			await validations[0].complete('Stale first value');
			await timeout(0);
			const message = container.querySelector<HTMLElement>('.mobile-quick-input-validation')!;
			const displayed = { text: message.textContent, visible: message.classList.contains('visible') };
			container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
			await timeout(500);
			assert.deepStrictEqual({ displayed, result: await result }, {
				displayed: { text: '', visible: false }, result: undefined,
			});
		});
	});

	for (const cancelWithToken of [false, true]) {
		test(`${cancelWithToken ? 'cancellation' : 'dismissal'} during validation cannot accept an input later`, async () => {
			await runWithFakedTimers({ useFakeTimers: true }, async () => {
				const { service, container } = createHarness();
				const token = store.add(new CancellationTokenSource());
				const validation = new DeferredPromise<undefined>();
				const result = service.input({ value: 'Renamed', validateInput: () => validation.p }, token.token);
				container.querySelector<HTMLButtonElement>('.mobile-quick-input-submit')!.click();
				if (cancelWithToken) {
					token.cancel();
				} else {
					container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
				}
				await validation.complete(undefined);
				await timeout(500);
				assert.deepStrictEqual({ result: await result, children: container.childElementCount }, { result: undefined, children: 0 });
			});
		});
	}
});
