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

/**
 * Regression probe for the `ChatInputPart.containerHeight` loop warning.
 *
 * The carousel's max-height is a descendant of the observed input container.
 * Writing it from that container's ResizeObserver callback resizes the
 * observed subtree during delivery, which forces the browser to schedule
 * another notification pass — the "ResizeObserver loop completed with
 * undelivered notifications" warning. Note that this is *not* an oscillation:
 * the allocation converges in a single extra pass. Convergence and the warning
 * are orthogonal, so asserting only that the value settles would miss the bug.
 *
 * Allocating from `_layout()` instead keeps the write outside delivery. This
 * probe sweeps a band of budgets and requires both that no warning is emitted
 * and that each budget still reaches its final allocation immediately, so a
 * fix cannot trade the warning away for a slower or different allocation.
 */
test('allocates the tool-confirmation carousel and input editor without oscillating', async ({ page }) => {
	const resizeObserverErrors: string[] = [];
	page.on('pageerror', error => {
		if (error.message.includes('ResizeObserver loop')) {
			resizeObserverErrors.push(error.message);
		}
	});

	await openFixture(page, 'chat/widget/chatWidget/ResizeObserverLoopCarouselBudget/Dark', '.carousel-budget-probe');
	await page.getByRole('button', { name: 'Run carousel budget probe' }).click();
	await expect(page.getByRole('status')).toContainText(/Completed/, { timeout: 30_000 });

	const samples = page.locator('.carousel-budget-samples');
	const carouselFound = await samples.getAttribute('data-carousel-found');
	const settled = await samples.getAttribute('data-settled');
	const distinct = await samples.getAttribute('data-distinct');
	const framesToSettle = await samples.getAttribute('data-frames-to-settle');
	const series = await samples.getAttribute('data-series');
	const warningText = await page.locator('.carousel-budget-warnings').textContent();
	const lastAttribution = await page.locator('.carousel-budget-warnings').getAttribute('data-last-attribution');
	console.log(`[carousel-budget] carouselFound: ${carouselFound}; settled: ${settled}; distinct: ${distinct}; framesToSettle: ${framesToSettle}; ${warningText}; last attribution: ${lastAttribution}`);
	console.log(`[carousel-budget] series: ${series}`);

	await test.info().attach('carousel-budget-samples.json', {
		body: Buffer.from(JSON.stringify({ carouselFound, settled, distinct, framesToSettle, series, warningText, lastAttribution, resizeObserverErrors }, null, 2)),
		contentType: 'application/json',
	});

	// Without a rendered carousel nothing contends for the budget, so every
	// assertion below would pass for the wrong reason.
	expect(carouselFound).toBe('true');
	// The allocation must not emit ResizeObserver loop warnings.
	expect(Number(warningText?.replace('Warnings: ', ''))).toBe(0);
	// A one-shot allocation reaches its final value immediately, rather than
	// converging over successive frames.
	expect(settled).toBe('true');
});
