/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, Page, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { getBaseURL } from './utils.js';

// DOM trace snapshots can exhaust native-time fixture deadlines; exact PNG checks below cover visuals.
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

// Supplied by the Component Explorer headless page.
declare const __componentExplorer__: {
	renderFixture(fixtureId: string): Promise<{ hasError: boolean; previousDispose?: { hasError: boolean } }>;
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

const sessionGridScenarios = [
	{ name: 'NestedSplits', visibleSessions: 3, visibleChats: 3 },
	{ name: 'Maximized', visibleSessions: 1, visibleChats: 1 },
	{ name: 'MultipleChats', visibleSessions: 3, visibleChats: 4 },
];

for (const theme of ['Dark', 'Light', 'DarkHighContrast', 'LightHighContrast']) {
	const scenarios = theme.endsWith('HighContrast') ? sessionGridScenarios.slice(0, 1) : sessionGridScenarios;
	for (const scenario of scenarios) {
		test(`sessions grid ${scenario.name}/${theme} has production actions and is stable when ready`, async ({ page }) => {
			await page.setViewportSize({ width: 1500, height: 950 });
			const fixtureId = `sessions/grid/sessionsGrid/${scenario.name}/${theme}`;
			await renderFixture(page, fixtureId);

			const titlebar = page.locator('.part.titlebar');
			expect(await titlebar.locator('[aria-label]').evaluateAll(elements => elements.map(element => ({
				label: element.getAttribute('aria-label'),
				disabled: element.getAttribute('aria-disabled') === 'true',
			})))).toEqual([
				{ label: 'Toggle Side Bar', disabled: false },
				{ label: 'New Session', disabled: false },
				{ label: 'Go Back One Session', disabled: false },
				{ label: 'Go Forward One Session', disabled: true },
				{ label: 'Show Sessions: microsoft/vscode', disabled: false },
				{ label: 'Run Task is not available for this session type', disabled: true },
				{ label: 'Open in VS Code Editor Window', disabled: false },
				{ label: 'Show Panel', disabled: false },
				{ label: 'Toggle Side Panel', disabled: false },
				{ label: 'Signed in as Developer with GitHub', disabled: false },
			]);
			await expect(page.locator('.session-view:visible')).toHaveCount(scenario.visibleSessions);
			await expect(page.locator('.chat-group-view:visible')).toHaveCount(scenario.visibleChats);
			await expect(page.locator('.session-view:visible').first().getByRole('button', { name: 'Unpin', exact: true })).toHaveCount(1);
			await expect(page.locator('.session-view:visible').getByRole('button', { name: 'More Actions...', exact: true })).toHaveCount(scenario.visibleSessions);

			const border = await page.locator('.part.sessionspart').evaluate(element => {
				const style = getComputedStyle(element);
				return { width: style.borderTopWidth, style: style.borderTopStyle, transparent: style.borderTopColor === 'rgba(0, 0, 0, 0)' };
			});
			// The bundled dark theme deliberately overrides agentsCard.border with a transparent color.
			expect(border).toEqual({ width: '1px', style: 'solid', transparent: theme === 'Dark' });
			await expectStableScreenshot(page, fixtureId, `sessions/grid/sessionsGrid/${scenario.name === 'Maximized' ? 'NestedSplits' : 'Maximized'}/Light`);
		});
	}
}

test('sessions grid header actions update their owning state', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', error => errors.push(error.message));
	await page.setViewportSize({ width: 1500, height: 950 });
	await renderFixture(page, 'sessions/grid/sessionsGrid/NestedSplits/Dark');
	const session = page.locator('.session-view').filter({ has: page.locator('.chat-composite-bar-session-title', { hasText: /^Grid layout$/ }) });
	const overflow = () => session.getByRole('button', { name: 'More Actions...', exact: true });
	const openOverflow = async (expectedAction: string) => {
		// Overflow menus snapshot actions; reopen if a debounced toolbar update is still pending.
		await expect.poll(async () => {
			await page.keyboard.press('Escape');
			await overflow().click();
			return page.getByRole('menuitemcheckbox', { name: new RegExp(`${expectedAction}$`) }).count();
		}, { timeout: 5000 }).toBe(1);
	};
	const activate = async (role: 'menuitem' | 'menuitemcheckbox', name: string) => {
		const item = page.getByRole(role, { name: new RegExp(`${name}$`) });
		await item.hover();
		// Keyboard activation avoids the menu's deliberate mouse-up guard delay.
		await item.press('Enter');
	};
	await overflow().click();
	await expect(page.locator('.context-view .action-label:not(.separator)')).toHaveText([
		'Archive', 'Show Chat Tabs', 'Unpin', 'Maximize', 'Close', 'Session Layout',
	]);
	await activate('menuitemcheckbox', 'Maximize');
	await expect(page.locator('.session-view:visible')).toHaveCount(1);
	await openOverflow('Restore');
	await activate('menuitemcheckbox', 'Restore');
	await expect(page.locator('.session-view:visible')).toHaveCount(3);
	await session.getByRole('button', { name: 'Unpin', exact: true }).click();
	await expect(session.getByRole('button', { name: 'Unpin', exact: true })).toHaveCount(0);
	await openOverflow('Pin');
	await activate('menuitemcheckbox', 'Pin');
	await expect(session.getByRole('button', { name: 'Unpin', exact: true })).toHaveCount(1);
	await overflow().click();
	await activate('menuitem', 'Close');
	await expect(page.locator('.session-view:visible')).toHaveCount(2);
	expect(errors).toEqual([]);
});

test('sessions grid gallery mounts all variants without shared-registration conflicts', async ({ context }) => {
	const gallery = await context.newPage();
	const errors: string[] = [];
	gallery.on('pageerror', error => errors.push(error.message));
	gallery.on('console', message => {
		if (message.type() === 'error' || message.type() === 'warning') {
			errors.push(message.text());
		}
	});
	try {
		await gallery.setViewportSize({ width: 3400, height: 6400 });
		await gallery.goto(`${getBaseURL()}/___explorer?fixture=sessions%2Fgrid%2FsessionsGrid`, { waitUntil: 'networkidle' });
		await expect(gallery.locator('.part.titlebar')).toHaveCount(12, { timeout: 20_000 });
		await expect(gallery.locator('.session-view:visible')).toHaveCount(28);
		await expect(gallery.locator('.part.titlebar').getByRole('button', { name: 'New Session', exact: true })).toHaveCount(12);
		await expect(gallery.locator('.sessions-account-titlebar-widget')).toHaveCount(12);
		expect(errors).toEqual([]);
	} finally {
		await gallery.close();
	}
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
