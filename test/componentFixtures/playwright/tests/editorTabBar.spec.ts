/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('Dark Modern keeps legacy, connected, and pill tab surfaces distinct', async ({ page }) => {
	test.setTimeout(60_000);

	const surfaceColors = async (style: 'Legacy' | 'Connected' | 'Pill') => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/TabStyleCompatibility/${style}/DarkModern`, '.tabs-container > .tab.active');
		return page.locator('.editor-group-container > .title.tabs').evaluate(title => {
			if (!(title instanceof HTMLElement)) {
				throw new Error('Expected an editor title element');
			}

			const inactiveTab = title.querySelector<HTMLElement>('.tabs-container > .tab:not(.active) > .tab-fill');
			const header = title.querySelector<HTMLElement>('.tabs-and-actions-container');
			if (!inactiveTab || !header) {
				throw new Error('Expected an editor group header and an inactive editor tab');
			}

			const effectiveBackground = (...elements: HTMLElement[]) => elements
				.map(element => getComputedStyle(element).backgroundColor)
				.find(color => color !== 'rgba(0, 0, 0, 0)');

			return {
				header: effectiveBackground(title, header) ?? 'transparent',
				inactiveTab: effectiveBackground(inactiveTab, inactiveTab.parentElement!, title, header) ?? 'transparent',
			};
		});
	};

	expect({
		legacy: await surfaceColors('Legacy'),
		connected: await surfaceColors('Connected'),
		pill: await surfaceColors('Pill'),
	}).toEqual({
		legacy: { header: 'rgb(24, 24, 24)', inactiveTab: 'rgb(24, 24, 24)' },
		connected: { header: 'rgb(43, 43, 43)', inactiveTab: 'rgb(43, 43, 43)' },
		pill: { header: 'transparent', inactiveTab: 'transparent' },
	});
});

for (const [group, expected] of [
	['ActiveGroup', {
		activeTop: { indicator: 'none', color: 'rgb(34, 211, 238)' },
		activeBottom: { display: 'block', color: 'rgb(244, 63, 94)' },
		activeSide: 'rgb(250, 204, 21)',
		selectedTop: { display: 'block', color: 'rgb(163, 230, 53)' },
	}],
	['InactiveGroup', {
		activeTop: { indicator: 'none', color: 'rgb(192, 132, 252)' },
		activeBottom: { display: 'block', color: 'rgb(251, 146, 60)' },
		activeSide: 'rgb(250, 204, 21)',
		selectedTop: { display: 'block', color: 'rgb(163, 230, 53)' },
	}],
] as const) {
	test(`connected tabs show legacy border customizations in ${group}`, async ({ page }) => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/ConnectedLegacyBorders/${group}/Dark`, '.tabs-container > .tab.active');

		const colors = await page.locator('.tabs-container').evaluate(tabs => {
			const active = tabs.querySelector<HTMLElement>('.tab.active');
			const selected = tabs.querySelector<HTMLElement>('.tab.selected:not(.active)');
			const activeTop = active?.querySelector<HTMLElement>('.tab-border-top-container');
			const activeBottom = active?.querySelector<HTMLElement>('.tab-border-bottom-container');
			const activeFill = active?.querySelector<HTMLElement>('.tab-fill');
			const selectedTop = selected?.querySelector<HTMLElement>('.tab-border-top-container');
			if (!activeTop || !activeBottom || !activeFill || !selectedTop) {
				throw new Error('Expected active and selected connected-tab border indicators');
			}
			const style = (element: HTMLElement) => {
				const computedStyle = getComputedStyle(element);
				return { display: computedStyle.display, color: computedStyle.backgroundColor };
			};
			return {
				activeTop: {
					indicator: getComputedStyle(activeTop).display,
					color: getComputedStyle(activeFill).borderTopColor,
				},
				activeBottom: style(activeBottom),
				activeSide: getComputedStyle(activeFill).borderRightColor,
				selectedTop: style(selectedTop),
			};
		});

		expect(colors).toEqual(expected);
	});
}

for (const theme of ['DarkHighContrast', 'LightHighContrast']) {
	test(`connected tab actions respect disabled hover state in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/ConnectedSurface/SingleTab/${theme}`, '.tabs-container > .tab');
		const action = page.locator('.tab-actions .action-label');

		await action.hover();
		await expect(action).toHaveCSS('outline-style', 'dashed');

		await page.keyboard.down('Alt');
		try {
			await expect(action).toHaveAttribute('aria-disabled', 'true');
			await expect(action).toHaveCSS('outline-style', 'none');
		} finally {
			await page.keyboard.up('Alt');
		}

		await expect(action).not.toHaveClass(/\bdisabled\b/);
		await action.hover();
		await expect(action).toHaveCSS('outline-style', 'dashed');
		await action.focus();
		await expect(action).toHaveCSS('outline-style', 'solid');
		await expect(action).toHaveCSS('outline-width', '1px');
	});
}
