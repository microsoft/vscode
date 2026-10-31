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

suite('MobileQuickInputService cancellation', () => {
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
