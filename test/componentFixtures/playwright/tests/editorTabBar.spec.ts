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
		selectedTop: { display: 'block', color: 'rgb(163, 230, 53)', height: 2, leftInset: 2, rightInset: 2 },
		selectedBorder: 'rgba(0, 0, 0, 0)',
	}],
	['InactiveGroup', {
		activeTop: { indicator: 'none', color: 'rgb(192, 132, 252)' },
		activeBottom: { display: 'block', color: 'rgb(251, 146, 60)' },
		activeSide: 'rgb(250, 204, 21)',
		selectedTop: { display: 'block', color: 'rgb(163, 230, 53)', height: 2, leftInset: 2, rightInset: 2 },
		selectedBorder: 'rgba(0, 0, 0, 0)',
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
			const selectedFill = selected?.querySelector<HTMLElement>('.tab-fill');
			if (!activeTop || !activeBottom || !activeFill || !selectedTop || !selectedFill) {
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
				selectedTop: {
					...style(selectedTop),
					height: selectedTop.getBoundingClientRect().height,
					leftInset: selectedTop.getBoundingClientRect().left - selectedFill.getBoundingClientRect().left,
					rightInset: selectedFill.getBoundingClientRect().right - selectedTop.getBoundingClientRect().right,
				},
				selectedBorder: getComputedStyle(selectedFill).borderRightColor,
			};
		});

		expect(colors).toEqual(expected);
	});
}

for (const [style, expected] of [
	['Legacy', {
		topIndicator: { display: 'block', color: 'rgb(34, 211, 238)' },
		bottomIndicator: { display: 'block', color: 'rgb(244, 63, 94)' },
		visibleDividers: Array(7).fill('rgb(255, 255, 255)'),
	}],
	['Pill', {
		topIndicator: { display: 'none' },
		bottomIndicator: { display: 'none' },
		fillTop: 'rgb(250, 204, 21)',
		fillBottom: 'rgb(250, 204, 21)',
		fillSide: 'rgb(250, 204, 21)',
		topAccent: 'rgb(34, 211, 238)',
		bottomAccent: 'rgb(244, 63, 94)',
		visibleDividers: Array(7).fill('rgb(255, 255, 255)'),
	}],
	['Connected', {
		topIndicator: { display: 'none' },
		bottomIndicator: { display: 'block', color: 'rgb(244, 63, 94)' },
		fillTop: 'rgb(34, 211, 238)',
		fillBottom: 'rgba(0, 0, 0, 0)',
		fillSide: 'rgb(250, 204, 21)',
		inactiveBorder: 'rgba(0, 0, 0, 0)',
		visibleDividers: Array(5).fill('rgb(255, 255, 255)'),
	}],
] as const) {
	test(`${style} tabs retain their border ownership`, async ({ page }) => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/BorderOwnership/${style}/Dark`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.tabs-container > .tab.active').evaluate(active => {
			const top = active.querySelector<HTMLElement>('.tab-border-top-container');
			const bottom = active.querySelector<HTMLElement>('.tab-border-bottom-container');
			const fill = active.querySelector<HTMLElement>('.tab-fill');
			if (!top || !bottom || !fill) {
				throw new Error('Expected active tab border elements');
			}
			const fillStyle = getComputedStyle(fill);
			const inactiveFill = active.parentElement!.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill');
			if (!inactiveFill) {
				throw new Error('Expected an inactive tab fill');
			}
			const visibleDividers = [...active.parentElement!.querySelectorAll<HTMLElement>('.tab-divider')]
				.filter(element => getComputedStyle(element).display !== 'none')
				.map(element => getComputedStyle(element).backgroundColor);
			const indicatorStyle = (element: HTMLElement) => {
				const style = getComputedStyle(element);
				return { display: style.display, color: style.backgroundColor };
			};
			return {
				topIndicator: indicatorStyle(top),
				bottomIndicator: indicatorStyle(bottom),
				fillTop: fillStyle.borderTopColor,
				fillBottom: fillStyle.borderBottomColor,
				fillSide: fillStyle.borderRightColor,
				inactiveBorder: getComputedStyle(inactiveFill).borderRightColor,
				topAccent: getComputedStyle(fill, '::before').backgroundColor,
				bottomAccent: getComputedStyle(fill, '::after').backgroundColor,
				visibleDividers,
			};
		});
		expect(ownership).toMatchObject(expected);
	});
}

for (const [theme, expectedFocusBorder] of [
	['DarkHighContrast', 'rgb(243, 133, 24)'],
	['LightHighContrast', 'rgb(0, 107, 189)'],
] as const) {
	test(`connected borders retain high contrast ownership in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/BorderOwnership/Connected/${theme}`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.editor-group-container').evaluate(group => {
			const activeFill = group.querySelector<HTMLElement>('.tab.active > .tab-fill');
			const inactiveFill = group.querySelector<HTMLElement>('.tab:not(.active) > .tab-fill');
			if (!activeFill || !inactiveFill) {
				throw new Error('Expected active and inactive connected tab fills');
			}

			const activeStyle = getComputedStyle(activeFill);
			const inactiveStyle = getComputedStyle(inactiveFill);
			return {
				active: {
					top: activeStyle.borderTopColor,
					side: activeStyle.borderRightColor,
					bottom: activeStyle.borderBottomColor,
				},
				inactive: {
					top: inactiveStyle.borderTopColor,
					side: inactiveStyle.borderRightColor,
				},
				frame: getComputedStyle(group, '::after').borderColor,
			};
		});
		expect(ownership).toEqual({
			active: {
				top: 'rgb(34, 211, 238)',
				side: expectedFocusBorder,
				bottom: 'rgba(0, 0, 0, 0)',
			},
			inactive: {
				top: 'rgb(250, 204, 21)',
				side: 'rgb(250, 204, 21)',
			},
			frame: expectedFocusBorder,
		});
	});
}

for (const [fixture, expected] of [
	['FirstActive', {
		capLeft: 'rgba(0, 0, 0, 0)',
		capLeftWidth: '0px',
		dividers: ['rgba(0, 0, 0, 0)'],
	}],
	['MiddleActive', {
		capLeft: 'rgb(34, 211, 238)',
		capLeftWidth: '1px',
		dividers: [],
	}],
] as const) {
	test(`connected border continuity stays aligned for ${fixture}`, async ({ page }) => {
		await openFixture(page, `editor/editorTabBar/editorTabBar/ConnectedBorderContinuity/${fixture}/Dark`, '.tabs-container > .tab.active');
		const state = await page.locator('.part.editor').evaluate(editor => {
			const group = editor.querySelector<HTMLElement>('.editor-group-container.active');
			const active = group?.querySelector<HTMLElement>('.tab.active');
			const fill = active?.querySelector<HTMLElement>('.tab-fill');
			const indicator = active?.querySelector<HTMLElement>('.tab-border-top-container');
			const strip = group?.querySelector<HTMLElement>('.tabs-and-actions-container');
			if (!group || !active || !fill || !indicator || !strip) {
				throw new Error('Expected connected editor frame and active tab');
			}
			const editorRect = editor.getBoundingClientRect();
			const fillRect = fill.getBoundingClientRect();
			const fillStyle = getComputedStyle(fill);
			const visibleDividers = [...group.querySelectorAll<HTMLElement>('.tab-divider')]
				.filter(element => getComputedStyle(element).display !== 'none')
				.map(element => getComputedStyle(element).backgroundColor);
			return {
				editorBorder: getComputedStyle(editor).borderTopColor,
				capTop: getComputedStyle(fill).borderTopColor,
				capLeft: fillStyle.borderLeftColor,
				capLeftWidth: fillStyle.borderLeftWidth,
				capSide: getComputedStyle(fill).borderRightColor,
				separator: getComputedStyle(strip, '::after').backgroundColor,
				indicator: getComputedStyle(indicator).display,
				topAligned: Math.abs(editorRect.top - fillRect.top) <= 1,
				visibleDividers,
			};
		});
		expect(state).toEqual({
			editorBorder: 'rgb(34, 211, 238)',
			capTop: 'rgb(34, 211, 238)',
			capLeft: expected.capLeft,
			capLeftWidth: expected.capLeftWidth,
			capSide: 'rgb(34, 211, 238)',
			separator: 'rgb(34, 211, 238)',
			indicator: 'none',
			topAligned: true,
			visibleDividers: expected.dividers,
		});
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
