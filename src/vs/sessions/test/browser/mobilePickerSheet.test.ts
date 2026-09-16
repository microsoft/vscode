/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Codicon } from '../../../base/common/codicons.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IMobileContentSheetOptions, showMobileContentSheet } from '../../browser/parts/mobile/mobilePickerSheet.js';

suite('MobileContentSheet', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function open(options?: IMobileContentSheetOptions) {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		let disposeCount = 0;
		const closed = showMobileContentSheet(container, 'Test sheet', (_body, api) => {
			store.add(toDisposable(() => api.close()));
			return toDisposable(() => disposeCount++);
		}, options);
		return { container, closed, getDisposeCount: () => disposeCount };
	}

	test('default header actions still dismiss and Done remains a text button', async () => {
		const { container, closed, getDisposeCount } = open({
			headerActions: [{ id: 'copy', label: 'Copy', icon: Codicon.copy }],
		});
		assert.strictEqual(container.querySelector('.mobile-picker-sheet-done')?.textContent, 'Done');
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-header-action')!.click();
		await closed;
		assert.deepStrictEqual({ disposed: getDisposeCount(), remaining: container.childElementCount }, { disposed: 1, remaining: 0 });
	});

	test('non-dismissing action failures are reported and the control is re-enabled', async () => {
		const errors: unknown[] = [];
		const failure = new Error('Test failure');
		const { container, closed } = open({
			iconClose: true,
			headerActions: [{ id: 'copy', label: 'Copy', icon: Codicon.copy }],
			onHeaderAction: async () => { throw failure; },
			onHeaderActionError: error => errors.push(error),
		});
		const button = container.querySelector<HTMLButtonElement>('[aria-label="Copy"]')!;
		button.click();
		await Promise.resolve();
		assert.deepStrictEqual({
			errors,
			disabled: button.getAttribute('aria-disabled'),
			open: !!container.querySelector('[role="dialog"]'),
			closeIcon: !!container.querySelector('.mobile-picker-sheet-done .codicon-close'),
		}, { errors: [failure], disabled: 'false', open: true, closeIcon: true });
		container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')!.click();
		await closed;
	});

	for (const dismiss of ['escape', 'backdrop'] as const) {
		test(`${dismiss} dismisses once and removes handlers`, async () => {
			const { container, closed, getDisposeCount } = open({ iconClose: true });
			const trigger = () => {
				if (dismiss === 'escape') {
					mainWindow.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape' }));
				} else {
					container.querySelector<HTMLElement>('.mobile-picker-sheet-backdrop')?.click();
				}
			};
			trigger();
			trigger();
			await closed;
			assert.deepStrictEqual({ disposed: getDisposeCount(), remaining: container.childElementCount }, { disposed: 1, remaining: 0 });
		});
	}
});
