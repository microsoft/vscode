/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('retains wrapped observer context until the browser dispatches the loop warning', async ({ page }) => {
	await openFixture(page, 'base/resizeObserver/resizeObserver/LoopContext/Dark', '.resize-observer-context-status');

	const status = page.locator('.resize-observer-context-status');
	await expect(status).toHaveAttribute('data-warning-count', '1');
	await expect(status).toHaveAttribute(
		'data-observer-context',
		'[ResizeObserverLoopContext(ResizeObserverContextFixture.selfResizer)] ResizeObserver loop completed with undelivered notifications.',
	);
});
