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
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { MobileQuickInputService } from '../../browser/mobileQuickInputService.js';

suite('MobileQuickInputService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const item: IQuickPickItem = { label: 'Choice' };

	function createHarness() {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store.add(new DisposableStore()));
		instantiationService.stub(ILayoutService, upcastPartial<ILayoutService>({ mainContainer: container }));
		return { container, service: store.add(instantiationService.createInstance(MobileQuickInputService)) };
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
