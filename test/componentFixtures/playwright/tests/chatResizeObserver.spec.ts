/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

const scenarios = [
	{ name: 'no host layout', fixture: 'ResizeObserverLoopNoHostLayout', expectedWarnings: 0 },
	{ name: 'list-only layout', fixture: 'ResizeObserverLoopListOnly', expectedWarnings: 0 },
	{ name: 'stacked full layout', fixture: 'ResizeObserverLoopHarness', expectedWarnings: 0 },
	{ name: 'stacked targeted layout', fixture: 'ResizeObserverLoopStackedTargeted', expectedWarnings: 0 },
] as const;

for (const scenario of scenarios) {
	test(`runs the mocked chat resize-observer burst harness with ${scenario.name}`, async ({ page }) => {
		const resizeObserverErrors: string[] = [];
		page.on('pageerror', error => {
			if (error.message.includes('ResizeObserver loop')) {
				resizeObserverErrors.push(error.message);
			}
		});

		await openFixture(page, `chat/widget/chatWidget/${scenario.fixture}/Dark`, '.resize-observer-loop-harness');
		await page.getByRole('button', { name: 'Run 20-turn burst' }).click();
		await expect(page.getByRole('status')).toContainText(/Completed/, { timeout: 30_000 });
		const warningText = await page.locator('.resize-observer-loop-warnings').textContent();
		const lastAttribution = await page.locator('.resize-observer-loop-warnings').getAttribute('data-last-attribution');
		console.log(`[chat-resize-harness:${scenario.name}] ${warningText}; page errors: ${resizeObserverErrors.length}; last attribution: ${lastAttribution}`);
		const warningCount = Number(warningText?.replace('Warnings: ', ''));
		expect(warningCount).toBe(scenario.expectedWarnings);
		if (scenario.name === 'stacked targeted layout') {
			const geometry = await page.locator('.interactive-list').evaluate(element => {
				const list = element.querySelector<HTMLElement>('.monaco-list');
				return {
					expectedHeight: Number((element as HTMLElement).dataset['expectedHeight']),
					containerHeight: element.getBoundingClientRect().height,
					listHeight: list?.getBoundingClientRect().height,
				};
			});
			expect(geometry.containerHeight).toBeCloseTo(geometry.expectedHeight);
			expect(geometry.listHeight).toBeCloseTo(geometry.expectedHeight);
		}

		await test.info().attach('resize-observer-errors.json', {
			body: Buffer.from(JSON.stringify(resizeObserverErrors, null, 2)),
			contentType: 'application/json',
		});
	});
}
