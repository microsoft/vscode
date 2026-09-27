/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, Page, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { getBaseURL } from './utils.js';

// Supplied by the Component Explorer headless page.
declare const __componentExplorer__: {
	renderFixture(fixtureId: string): Promise<{
		hasError: boolean;
		error?: { message: string; stack?: string };
		previousDispose?: { hasError: boolean };
	}>;
	disposeCurrentFixture(): Promise<{ hasError: boolean }>;
};

test.beforeEach(async ({ page }) => {
	await page.goto(`${getBaseURL()}/___explorer?mode=headless`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => typeof __componentExplorer__ !== 'undefined');
});

test.afterEach(async ({ page }) => {
	expect(await page.evaluate(() => __componentExplorer__.disposeCurrentFixture())).toMatchObject({ hasError: false });
});

async function renderFixture(page: Page, fixtureId: string): Promise<void> {
	const report = await page.evaluate(id => __componentExplorer__.renderFixture(id), fixtureId);
	expect({
		renderError: report.hasError,
		disposeError: report.previousDispose?.hasError ?? false,
	}, JSON.stringify(report)).toEqual({ renderError: false, disposeError: false });
}

test('successful cold renders do not eagerly load diagnostic source maps', async ({ page }) => {
	const sourceMapRequests: string[] = [];
	page.on('request', request => {
		if (new URL(request.url()).pathname.endsWith('.js.map')) {
			sourceMapRequests.push(request.url());
		}
	});

	await renderFixture(page, 'imageCarousel/imageCarousel/SingleImage/Dark');

	expect(sourceMapRequests).toEqual([]);
});

test('fixture setup failures still report their original error with a mapped stack', async ({ page }) => {
	await page.route('**/extensions/theme-seti/icons/vs-seti-icon-theme.json', route => route.fulfill({
		status: 503,
		body: 'Fixture resource unavailable',
	}));

	const report = await page.evaluate(() => __componentExplorer__.renderFixture('imageCarousel/imageCarousel/SingleImage/Dark'));

	expect(report).toMatchObject({
		hasError: true,
		error: {
			message: expect.stringMatching(/^Failed to load fixture file icon theme .*: 503/),
			stack: expect.stringContaining('fixtureUtils.ts:'),
		},
	});
});

async function expectStableScreenshot(page: Page, fixtureId: string, precedingFixtureId: string): Promise<void> {
	const container = page.locator('#root > div').last();
	const initial = await container.screenshot();

	// Sample after the scrollbar's idle timeout, rather than using a delay to declare readiness.
	await page.waitForTimeout(750);
	const idle = await container.screenshot();
	await renderFixture(page, precedingFixtureId);
	await renderFixture(page, fixtureId);
	const remounted = await container.screenshot();

	const hash = (image: Buffer) => createHash('sha256').update(image).digest('hex');
	const expected = hash(initial);
	const actual = [hash(idle), hash(remounted)];
	if (actual.some(value => value !== expected)) {
		for (const [name, body] of [['initial', initial], ['idle', idle], ['remounted', remounted]] as const) {
			await test.info().attach(`${name}.png`, { body, contentType: 'image/png' });
		}
	}
	expect(actual).toEqual([expected, expected]);
}

const scrollScenarios = [
	{ name: 'StreamingVisibleHeader', header: '.chat-tool-chain-collapsible > .chat-used-context-label', offscreen: false },
	{ name: 'StreamingOffscreenHeader', header: '.chat-tool-chain-collapsible > .chat-used-context-label', offscreen: true },
	{ name: 'CompletedVisibleHeader', header: '.completed-response-summary', offscreen: false },
	{ name: 'CompletedOffscreenHeader', header: '.completed-response-summary', offscreen: true },
	{ name: 'StreamingReasoningHeader', header: '.chat-persistent-reasoning > .chat-used-context-label', offscreen: false },
];

const carouselScenarios = [
	{ name: 'SingleSection', imageCount: 5, selectedIndex: 0 },
	{ name: 'SingleSectionMiddleImage', imageCount: 5, selectedIndex: 2 },
	{ name: 'MultipleSections', imageCount: 5, selectedIndex: 0 },
	{ name: 'SingleImage', imageCount: 1, selectedIndex: 0 },
];

for (const theme of ['Dark', 'Light']) {
	for (const [index, scenario] of scrollScenarios.entries()) {
		test(`scroll anchoring ${scenario.name}/${theme} is positioned and stable when ready`, async ({ page }) => {
			const fixtureId = `chat/scrollAnchoring/chatScrollAnchoring/${scenario.name}/${theme}`;
			await renderFixture(page, fixtureId);

			const geometry = await page.locator('.interactive-list').evaluate((element, selector) => {
				const header = element.querySelector(selector);
				const list = element.querySelector('.monaco-list');
				if (!header || !list) {
					throw new Error('Missing scroll anchoring header or list');
				}
				const viewport = list.getBoundingClientRect();
				const bounds = header.getBoundingClientRect();
				const sticky = list.querySelector('.monaco-tree-sticky-container-shadow')?.getBoundingClientRect();
				return {
					viewportMatchesLayout: document.querySelector('.scroll-anchoring-measurements')?.textContent?.endsWith(`Viewport: ${viewport.height}px`),
					aboveViewport: bounds.bottom < viewport.top,
					fullyVisible: bounds.top >= Math.max(viewport.top, sticky?.bottom ?? viewport.top) && bounds.bottom <= viewport.bottom,
				};
			}, scenario.header);
			expect(geometry).toEqual({
				viewportMatchesLayout: true,
				aboveViewport: scenario.offscreen,
				fullyVisible: !scenario.offscreen,
			});
			await expect(page.locator('.scroll-anchoring-measurements')).toContainText('Extra collapse padding: 0px');

			const preceding = scrollScenarios[(index + 1) % scrollScenarios.length];
			await expectStableScreenshot(page, fixtureId, `chat/scrollAnchoring/chatScrollAnchoring/${preceding.name}/${theme}`);
		});
	}

	test(`scroll anchoring ReasoningExpansion/${theme} is stable when ready`, async ({ page }) => {
		const fixtureId = `chat/scrollAnchoring/chatScrollAnchoring/ReasoningExpansion/${theme}`;
		await renderFixture(page, fixtureId);
		await expectStableScreenshot(page, fixtureId, `chat/scrollAnchoring/chatScrollAnchoring/CompletedOffscreenHeader/${theme}`);
	});

	test(`scroll anchoring controls remain interactive in ${theme}`, async ({ page }) => {
		await renderFixture(page, `chat/scrollAnchoring/chatScrollAnchoring/StreamingVisibleHeader/${theme}`);
		const measurements = page.locator('.scroll-anchoring-measurements');
		for (const [index, label] of ['Toggle Tool Calls', 'Toggle Tool Calls', 'Resume Response', 'Complete Response'].entries()) {
			await page.getByRole('button', { name: label, exact: true }).click();
			await expect(measurements).toHaveAttribute('data-step', String(index + 1));
		}
		await expect(measurements).toContainText('Completed | Extra collapse padding: 0px');
		await expect(page.getByRole('button', { name: 'Complete Response', exact: true })).toBeDisabled();

		await renderFixture(page, `chat/scrollAnchoring/chatScrollAnchoring/StreamingOffscreenHeader/${theme}`);
		await page.getByRole('button', { name: 'Stop Response', exact: true }).click();
		await expect(measurements).toHaveAttribute('data-step', '1');
		await expect(measurements).toContainText('Stopped | Extra collapse padding: 0px');
	});

	for (const [index, scenario] of carouselScenarios.entries()) {
		test(`image carousel ${scenario.name}/${theme} is decoded and stable when ready`, async ({ page }) => {
			const fixtureId = `imageCarousel/imageCarousel/${scenario.name}/${theme}`;
			await renderFixture(page, fixtureId);

			const state = await page.locator('.image-carousel-editor').evaluate(element => {
				const images = Array.from(element.querySelectorAll('img'));
				const thumbnails = Array.from(element.querySelectorAll('.thumbnail'));
				return {
					imageCount: images.length,
					decoded: images.every(image => image.complete && image.naturalWidth === 64 && image.naturalHeight === 64),
					thumbnailCount: thumbnails.length,
					selectedIndex: thumbnails.findIndex(thumbnail => thumbnail.getAttribute('aria-current') === 'page'),
					counter: element.querySelector('.image-counter')?.textContent,
				};
			});
			expect(state).toEqual({
				imageCount: scenario.imageCount + 1,
				decoded: true,
				thumbnailCount: scenario.imageCount,
				selectedIndex: scenario.selectedIndex,
				counter: `${scenario.selectedIndex + 1} / ${scenario.imageCount}`,
			});

			const preceding = carouselScenarios[(index + 1) % carouselScenarios.length];
			await expectStableScreenshot(page, fixtureId, `imageCarousel/imageCarousel/${preceding.name}/${theme}`);
		});
	}
}
