/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { BrowserDialogHandler } from '../../../workbench/browser/parts/dialogs/dialogHandler.js';
import { IWorkbenchLayoutService } from '../../../workbench/services/layout/browser/layoutService.js';
import { MobileAwareDialogHandler } from '../../browser/parts/dialogs/mobileAwareDialogHandler.js';

suite('MobileAwareDialogHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture() {
		const container = dom.append(mainWindow.document.body, dom.$('div.phone-layout'));
		store.add(toDisposable(() => container.remove()));
		const trigger = dom.append(container, dom.$('button', { type: 'button' }, 'Open'));
		trigger.focus();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IWorkbenchLayoutService, { mainContainer: container });
		instantiation.stubInstance(BrowserDialogHandler, {
			confirm: async () => { throw new Error('Phone confirmations must retain their mobile presentation'); },
		});
		const handler = instantiation.createInstance(MobileAwareDialogHandler);
		return { container, trigger, handler };
	}

	for (const alreadyCancelled of [false, true]) {
		test(`cancelled confirmation ${alreadyCancelled ? 'never opens a queued sheet' : 'dismisses an open sheet'}`, async () => {
			const { container, trigger, handler } = fixture();
			const cancellation = store.add(new CancellationTokenSource());
			if (alreadyCancelled) {
				cancellation.cancel();
			}
			const closed = handler.confirm({ message: 'Confirm connection', custom: true, token: cancellation.token });
			const sheet = container.querySelector('[role="dialog"]');
			cancellation.cancel();
			const dismissed = !sheet || sheet.classList.contains('closing');
			if (!dismissed) {
				container.querySelectorAll<HTMLElement>('.mobile-content-sheet-actions .monaco-button')[1]?.click();
			}
			const result = await closed;
			assert.deepStrictEqual({ shown: !!sheet, dismissed, confirmed: result.confirmed, remaining: container.querySelectorAll('[role="dialog"]').length, focusRestored: mainWindow.document.activeElement === trigger }, {
				shown: !alreadyCancelled, dismissed: true, confirmed: false, remaining: 0, focusRestored: true,
			});
		});
	}

	test('cancelling while the accepted sheet closes still rejects confirmation', async () => {
		const { container, handler } = fixture();
		const cancellation = store.add(new CancellationTokenSource());
		const closed = handler.confirm({ message: 'Confirm connection', custom: true, token: cancellation.token });
		container.querySelector<HTMLElement>('.mobile-content-sheet-actions .monaco-button')!.click();
		cancellation.cancel();
		assert.strictEqual((await closed).confirmed, false);
	});
});
