/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('does not observe chat layout while the pet is disabled', async ({ page }) => {
	const resizeObserverErrors: string[] = [];
	page.on('pageerror', error => {
		if (error.message.includes('ResizeObserver loop')) {
			resizeObserverErrors.push(error.message);
		}
	});

	await openFixture(page, 'chat/widget/chatWidget/DisabledPetResizeObserverProbe/Dark', '.disabled-pet-resize-observer-status');
	await expect(page.getByRole('status')).toContainText('Completed');
	const status = page.locator('.disabled-pet-resize-observer-status');
	const warningCount = Number(await status.getAttribute('data-warning-count'));
	const observerContext = await status.getAttribute('data-observer-context');
	console.log(`[disabled-pet-resize-observer] warnings: ${warningCount}; page errors: ${resizeObserverErrors.length}; observer context: ${observerContext}`);

	expect(warningCount).toBe(0);
	expect(resizeObserverErrors).toEqual([]);
});
