/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('streams mounted display math without a ResizeObserver loop warning', async ({ page }) => {
	const resizeObserverErrors: string[] = [];
	page.on('pageerror', error => {
		if (error.message.includes('ResizeObserver loop')) {
			resizeObserverErrors.push(error.message);
		}
	});

	await openFixture(page, 'chat/widget/chatWidget/MathResizeObserverHarness/Dark', '.math-resize-observer-harness');
	await expect(page.locator('.katex-display').first()).toBeVisible({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Run math stream stress' }).click();
	await expect(page.getByRole('status')).toContainText(/Completed/, { timeout: 30_000 });

	const warningElement = page.locator('.math-resize-observer-warnings');
	const warningText = await warningElement.textContent();
	const observerContext = await warningElement.getAttribute('data-observer-context');
	const mathBlocks = Number(await warningElement.getAttribute('data-math-blocks'));
	const mathScrollables = Number(await warningElement.getAttribute('data-math-scrollables'));
	console.log(`[chat-math-resize-harness] ${warningText}; page errors: ${resizeObserverErrors.length}; observer context: ${observerContext}; math blocks: ${mathBlocks}; math scrollables: ${mathScrollables}`);
	const overflowMetrics = await page.locator('.monaco-scrollable-element').evaluateAll(elements => elements
		.filter(element => element.querySelector('.katex-display'))
		.map(element => {
			const content = element.querySelector<HTMLElement>('.katex-display')!;
			const horizontalSlider = element.querySelector<HTMLElement>('.scrollbar.horizontal .slider');
			return {
				viewportWidth: (element as HTMLElement).clientWidth,
				contentWidth: content.scrollWidth,
				sliderWidth: Number.parseFloat(horizontalSlider?.style.width ?? '0'),
			};
		}));

	expect(mathBlocks).toBeGreaterThan(0);
	expect(mathScrollables).toBeGreaterThanOrEqual(mathBlocks);
	expect(overflowMetrics.some(metric => metric.contentWidth > metric.viewportWidth && metric.sliderWidth > 0)).toBe(true);
	expect(Number(warningText?.replace('Warnings: ', ''))).toBe(0);
	expect(resizeObserverErrors).toEqual([]);
});
