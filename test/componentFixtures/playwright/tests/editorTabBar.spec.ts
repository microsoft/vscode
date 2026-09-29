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
