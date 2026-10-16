/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('Connected defaults do not surface the theme active-top accent', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Styles/Connected/Dark', '.tabs-container > .tab.active');
	const colors = await page.locator('.editor-group-container').evaluate(group => {
		const activeFill = group.querySelector<HTMLElement>('.tab.active > .tab-fill');
		const activeEdge = group.querySelector<HTMLElement>('.tab.active > .tab-connected-edge');
		if (!activeFill || !activeEdge) {
			throw new Error('Expected an active connected tab fill and edge');
		}
		const groupStyle = getComputedStyle(group);
		const leftShoulder = getComputedStyle(activeFill, '::before');
		return {
			capTop: getComputedStyle(activeEdge).borderTopColor,
			capRadius: getComputedStyle(activeEdge).borderTopLeftRadius,
			structuralBoundary: groupStyle.getPropertyValue('--modern-ui-connected-tab-border').trim(),
			themeActiveTop: getComputedStyle(group.closest('.monaco-workbench')!).getPropertyValue('--vscode-tab-activeBorderTop').trim(),
			shoulder: {
				bottom: leftShoulder.bottom,
				height: leftShoulder.height,
				radius: leftShoulder.borderBottomRightRadius,
				color: leftShoulder.borderBottomColor,
			},
		};
	});
	expect(colors).toEqual({
		capTop: 'rgb(42, 43, 44)',
		capRadius: '7px',
		structuralBoundary: '#2a2b2c',
		themeActiveTop: '#3994bc',
		shoulder: {
			bottom: '0px',
			height: '7px',
			radius: '7px',
			color: 'rgb(42, 43, 44)',
		},
	});
});

for (const [theme, expected] of [
	['DarkHighContrast', { activeTop: 'rgb(243, 133, 24)', accent: 'rgb(243, 133, 24)', tabBorder: 'rgb(111, 195, 223)' }],
	['LightHighContrast', { activeTop: 'rgb(0, 107, 189)', accent: 'rgb(0, 107, 189)', tabBorder: 'rgb(15, 74, 133)' }],
] as const) {
	test(`pill borders retain high contrast ownership in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Styles/Pill/${theme}`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.tabs-container').evaluate(tabs => {
			const activeFill = tabs.querySelector<HTMLElement>('.tab.active > .tab-fill');
			const inactiveFill = tabs.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill');
			if (!activeFill || !inactiveFill) {
				throw new Error('Expected active and inactive pill tab fills');
			}
			return {
				active: {
					top: getComputedStyle(activeFill).borderTopColor,
					side: getComputedStyle(activeFill).borderRightColor,
				},
				inactive: {
					top: getComputedStyle(inactiveFill).borderTopColor,
					side: getComputedStyle(inactiveFill).borderRightColor,
				},
				visibleDividers: [...tabs.querySelectorAll<HTMLElement>('.tab-divider')]
					.filter(element => getComputedStyle(element).display !== 'none').length,
			};
		});
		expect(ownership).toEqual({
			active: { top: expected.accent, side: expected.accent },
			inactive: { top: expected.tabBorder, side: expected.tabBorder },
			visibleDividers: 0,
		});
	});

	test(`connected borders retain high contrast ownership in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Styles/Connected/${theme}`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.editor-group-container').evaluate(group => {
			const activeFill = group.querySelector<HTMLElement>('.tab.active > .tab-fill');
			const activeEdge = group.querySelector<HTMLElement>('.tab.active > .tab-connected-edge');
			const inactiveFill = group.querySelector<HTMLElement>('.tab:not(.active):not(:first-child) > .tab-fill');
			const firstFill = group.querySelector<HTMLElement>('.tab:first-child > .tab-fill');
			if (!activeFill || !activeEdge || !inactiveFill || !firstFill) {
				throw new Error('Expected active connected tab edge and inactive tab fills');
			}

			const activeStyle = getComputedStyle(activeEdge);
			const inactiveStyle = getComputedStyle(inactiveFill);
			const visibleDividers = [...group.querySelectorAll<HTMLElement>('.tab-divider')]
				.filter(element => getComputedStyle(element).display !== 'none')
				.map(element => getComputedStyle(element).backgroundColor);
			return {
				active: {
					top: activeStyle.borderTopColor,
					side: activeStyle.borderRightColor,
					bottom: getComputedStyle(activeFill).borderBottomColor,
					edgeBottomWidth: activeStyle.borderBottomWidth,
				},
				inactive: {
					top: inactiveStyle.borderTopColor,
					side: inactiveStyle.borderRightColor,
				},
				firstLeft: getComputedStyle(firstFill).borderLeftColor,
				frame: getComputedStyle(group.closest('.part.editor')!).borderTopColor,
				groupFrame: getComputedStyle(group, '::after').content,
				visibleDividers,
			};
		});
		expect(ownership).toEqual({
			active: {
				top: expected.activeTop,
				side: expected.accent,
				bottom: 'rgba(0, 0, 0, 0)',
				edgeBottomWidth: '0px',
			},
			inactive: {
				top: 'rgba(0, 0, 0, 0)',
				side: 'rgba(0, 0, 0, 0)',
			},
			firstLeft: 'rgba(0, 0, 0, 0)',
			frame: expected.tabBorder,
			groupFrame: 'none',
			visibleDividers: Array(5).fill(expected.tabBorder),
		});
	});
}

for (const theme of ['DarkHighContrast', 'LightHighContrast']) {
	test(`pill hover and focus strokes have a single owner in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Styles/Pill/${theme}`, '.tabs-container > .tab.active');
		const tab = page.locator('.tabs-container > .tab:not(.active):not(.selected):not(.sticky)').first();
		const fill = tab.locator('.tab-fill');
		const action = tab.locator('.tab-actions .action-label');
		const overlay = tab.locator('.tab-actions');
		const initialBounds = await tab.boundingBox();

		await tab.hover({ position: { x: 30, y: 12 } });
		await expect(fill).toHaveCSS('border-top-style', 'dashed');
		await action.hover();
		await expect(action).toHaveCSS('outline-style', 'dashed');
		await expect(overlay).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
		await expect(overlay).toHaveCSS('border-right-color', 'rgba(0, 0, 0, 0)');
		await expect(overlay).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');

		await page.mouse.move(0, 0);
		await tab.focus();
		await expect(fill).toHaveCSS('border-top-style', 'solid');
		const focusColor = await fill.evaluate(element => getComputedStyle(element).borderTopColor);
		expect(await tab.evaluate(element => element.matches(':focus-visible'))).toBe(true);
		await action.focus();
		await expect(fill).toHaveCSS('border-top-style', 'solid');
		await expect(fill).toHaveCSS('border-top-color', focusColor);
		await expect(action).toHaveCSS('outline-style', 'solid');
		await expect(action).toHaveCSS('outline-width', '1px');
		await expect(overlay).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
		await action.hover();
		await expect(fill).toHaveCSS('border-top-style', 'solid');
		await expect(fill).toHaveCSS('border-top-color', focusColor);
		expect(await tab.boundingBox()).toEqual(initialBounds);

		const activeTab = page.locator('.tabs-container > .tab.active');
		await activeTab.hover();
		await expect(activeTab.locator('.tab-fill')).toHaveCSS('border-top-style', 'solid');
		await expect(activeTab.locator('.tab-actions')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
	});

	for (const actionLocation of ['left', 'right']) {
		test(`multi-selected pill overlays do not repaint HC borders with ${actionLocation} actions in ${theme}`, async ({ page }) => {
			const fixture = actionLocation === 'left' ? 'PillMultiSelectedActionsOnLeft' : 'PillMultiSelected';
			await openFixture(page, `editor/tabs/Styles/${fixture}/${theme}`, '.tabs-container > .tab.active.multi-selected');
			for (const selector of ['.tab.active.multi-selected', '.tab.selected:not(.active)']) {
				const tab = page.locator(`.tabs-container > ${selector}`).first();
				const overlay = tab.locator('.tab-actions');
				const action = overlay.locator('.action-label');
				const readBorders = () => overlay.evaluate((element, location) => {
					const style = getComputedStyle(element);
					return [style.borderTopColor, location === 'left' ? style.borderLeftColor : style.borderRightColor, style.borderBottomColor];
				}, actionLocation);
				const transparentBorders = Array(3).fill('rgba(0, 0, 0, 0)');

				await tab.hover({ position: { x: 30, y: 12 } });
				expect(await readBorders()).toEqual(transparentBorders);
				await action.hover();
				expect(await readBorders()).toEqual(transparentBorders);
				await page.mouse.move(0, 0);
				await tab.focus();
				const focusColor = await tab.locator('.tab-fill').evaluate(element => getComputedStyle(element).borderTopColor);
				await action.focus();
				await expect(tab.locator('.tab-fill')).toHaveCSS('border-top-color', focusColor);
				await expect(action).toHaveCSS('outline-style', 'solid');
				expect(await readBorders()).toEqual(transparentBorders);
			}
		});
	}

	for (const style of ['Connected', 'Legacy']) {
		test(`${style} tab actions retain hover and focus outlines in ${theme}`, async ({ page }) => {
			await openFixture(page, `editor/tabs/Styles/${style}/${theme}`, '.tabs-container > .tab.active');
			const action = page.locator('.tab.active .tab-actions .action-label');

			await action.hover();
			await expect(action).toHaveCSS('outline-style', 'dashed');

			await expect(action).not.toHaveClass(/\bdisabled\b/);
			await page.mouse.move(0, 0);
			await action.focus();
			await expect(action).toHaveCSS('outline-style', 'solid');
			await expect(action).toHaveCSS('outline-width', '1px');
		});
	}
}
