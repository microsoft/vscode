/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('Dark Modern keeps legacy, connected, and pill tab surfaces distinct', async ({ page }) => {
	test.setTimeout(60_000);

	const surfaceColors = async (style: 'Legacy' | 'Connected' | 'Pill') => {
		await openFixture(page, `editor/tabs/TabStyles/${style}/DarkModern`, '.tabs-container > .tab.active');
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

test('Connected defaults do not surface the theme active-top accent', async ({ page }) => {
	await openFixture(page, 'editor/tabs/TabStyles/Connected/Dark', '.tabs-container > .tab.active');
	const colors = await page.locator('.editor-group-container').evaluate(group => {
		const activeFill = group.querySelector<HTMLElement>('.tab.active > .tab-fill');
		if (!activeFill) {
			throw new Error('Expected an active connected tab fill');
		}
		const groupStyle = getComputedStyle(group);
		return {
			capTop: getComputedStyle(activeFill).borderTopColor,
			structuralBoundary: groupStyle.getPropertyValue('--modern-ui-connected-tab-border').trim(),
			themeActiveTop: getComputedStyle(group.closest('.monaco-workbench')!).getPropertyValue('--vscode-tab-activeBorderTop').trim(),
		};
	});
	expect(colors).toEqual({
		capTop: 'rgb(42, 43, 44)',
		structuralBoundary: '#2a2b2c',
		themeActiveTop: '#3994bc',
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
		await openFixture(page, `editor/tabs/Colors/ConnectedLegacyBorders/${group}/Dark`, '.tabs-container > .tab.active');

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
		visibleDividers: [],
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
		await openFixture(page, `editor/tabs/Colors/BorderOwnership/${style}/Dark`, '.tabs-container > .tab.active');
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
			const tabsAndActions = active.closest<HTMLElement>('.tabs-and-actions-container');
			if (!tabsAndActions) {
				throw new Error('Expected tabs and actions container');
			}
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
				bottomBoundaryOffset: bottom.getBoundingClientRect().bottom - tabsAndActions.getBoundingClientRect().bottom,
				visibleDividers,
			};
		});
		expect(ownership).toMatchObject(expected);
		if (style === 'Connected') {
			expect(ownership.bottomBoundaryOffset).toBe(0);
		}
	});
}

for (const [theme, expected] of [
	['DarkHighContrast', { activeTop: 'rgb(243, 133, 24)', accent: 'rgb(243, 133, 24)', tabBorder: 'rgb(111, 195, 223)' }],
	['LightHighContrast', { activeTop: 'rgb(0, 107, 189)', accent: 'rgb(0, 107, 189)', tabBorder: 'rgb(15, 74, 133)' }],
] as const) {
	test(`pill borders retain high contrast ownership in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Colors/BorderOwnership/Pill/${theme}`, '.tabs-container > .tab.active');
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
		await openFixture(page, `editor/tabs/Colors/BorderOwnership/Connected/${theme}`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.editor-group-container').evaluate(group => {
			const activeFill = group.querySelector<HTMLElement>('.tab.active > .tab-fill');
			const inactiveFill = group.querySelector<HTMLElement>('.tab:not(.active):not(:first-child) > .tab-fill');
			const firstFill = group.querySelector<HTMLElement>('.tab:first-child > .tab-fill');
			if (!activeFill || !inactiveFill || !firstFill) {
				throw new Error('Expected active and inactive connected tab fills');
			}

			const activeStyle = getComputedStyle(activeFill);
			const inactiveStyle = getComputedStyle(inactiveFill);
			const visibleDividers = [...group.querySelectorAll<HTMLElement>('.tab-divider')]
				.filter(element => getComputedStyle(element).display !== 'none')
				.map(element => getComputedStyle(element).backgroundColor);
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
				firstLeft: getComputedStyle(firstFill).borderLeftColor,
				frame: getComputedStyle(group, '::after').borderColor,
				visibleDividers,
			};
		});
		expect(ownership).toEqual({
			active: {
				top: expected.activeTop,
				side: expected.accent,
				bottom: 'rgba(0, 0, 0, 0)',
			},
			inactive: {
				top: expected.tabBorder,
				side: expected.tabBorder,
			},
			firstLeft: expected.tabBorder,
			frame: expected.accent,
			visibleDividers: [],
		});
	});
}

test('wrapped upper connected tabs inset customized border accents', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/BorderOwnership/ConnectedWrapped/Dark', '.tabs-container > .tab.active.connected-tab-upper-row');
	const ownership = await page.locator('.tab.active.connected-tab-upper-row').evaluate(active => {
		const fill = active.querySelector<HTMLElement>('.tab-fill');
		const top = active.querySelector<HTMLElement>('.tab-border-top-container');
		const bottom = active.querySelector<HTMLElement>('.tab-border-bottom-container');
		if (!fill || !top || !bottom) {
			throw new Error('Expected wrapped active tab border elements');
		}
		const bottomAccent = getComputedStyle(fill, '::after');
		return {
			topIndicator: getComputedStyle(top).display,
			topColor: getComputedStyle(fill).borderTopColor,
			bottomIndicator: getComputedStyle(bottom).display,
			bottomAccent: {
				color: bottomAccent.backgroundColor,
				left: bottomAccent.left,
				right: bottomAccent.right,
				height: bottomAccent.height,
			},
		};
	});
	expect(ownership).toEqual({
		topIndicator: 'none',
		topColor: 'rgb(34, 211, 238)',
		bottomIndicator: 'none',
		bottomAccent: {
			color: 'rgb(244, 63, 94)',
			left: '4px',
			right: '4px',
			height: '1px',
		},
	});
});

test('wrapped upper connected hover borders use focused and unfocused inset accents', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/BorderOwnership/ConnectedWrapped/Dark', '.tabs-container > .tab.active.connected-tab-upper-row');
	const hovered = page.locator('.tabs-container > .tab.connected-tab-upper-row:not(.active)').first();
	await hovered.hover();
	const readOwnership = () => hovered.evaluate(tab => {
		const fill = tab.querySelector<HTMLElement>('.tab-fill');
		const bottom = tab.querySelector<HTMLElement>('.tab-border-bottom-container');
		if (!fill || !bottom) {
			throw new Error('Expected hovered wrapped tab border elements');
		}
		const accent = getComputedStyle(fill, '::after');
		return {
			fillBottom: getComputedStyle(fill).borderBottomColor,
			indicator: getComputedStyle(bottom).display,
			accent: {
				color: accent.backgroundColor,
				left: accent.left,
				right: accent.right,
				height: accent.height,
			},
		};
	});
	expect(await readOwnership()).toEqual({
		fillBottom: 'rgba(0, 0, 0, 0)',
		indicator: 'none',
		accent: {
			color: 'rgb(249, 115, 22)',
			left: '4px',
			right: '4px',
			height: '1px',
		},
	});
	await page.locator('.editor-group-container').evaluate(group => group.classList.remove('active'));
	expect(await readOwnership()).toEqual({
		fillBottom: 'rgba(0, 0, 0, 0)',
		indicator: 'none',
		accent: {
			color: 'rgb(168, 85, 247)',
			left: '4px',
			right: '4px',
			height: '1px',
		},
	});
});

test('connected tabs honor all modern editor tab customizations', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/BorderOwnership/ConnectedModernEditorTokens/Dark', '.tabs-container > .tab.active');
	const tabs = page.locator('.tabs-container');
	const active = tabs.locator('> .tab.active');
	const inactive = tabs.locator('> .tab:not(.active):not(.selected)').first();
	const selected = tabs.locator('> .tab.selected:not(.active)').first();
	const readTab = (tab: typeof active) => tab.evaluate(element => {
		const fill = element.querySelector<HTMLElement>('.tab-fill');
		const label = element.querySelector<HTMLElement>('.tab-label a');
		const actions = element.querySelector<HTMLElement>('.tab-actions');
		if (!fill || !label || !actions) {
			throw new Error('Expected tab fill, label, and actions');
		}
		return {
			background: getComputedStyle(fill).backgroundColor,
			foreground: getComputedStyle(label).color,
			actionBackground: getComputedStyle(actions).backgroundColor,
		};
	});

	await page.locator('.editor-container').hover();
	await active.locator('.action-label').focus();
	expect(await readTab(active)).toEqual({
		background: 'rgb(22, 78, 99)',
		foreground: 'rgb(207, 250, 254)',
		actionBackground: 'rgb(14, 55, 71)',
	});

	await active.hover();
	expect(await readTab(active)).toEqual({
		background: 'rgb(107, 33, 168)',
		foreground: 'rgb(207, 250, 254)',
		actionBackground: 'rgb(76, 22, 120)',
	});

	await inactive.hover();
	expect(await readTab(inactive)).toEqual({
		background: 'rgb(124, 45, 18)',
		foreground: 'rgb(255, 237, 213)',
		actionBackground: 'rgb(90, 31, 12)',
	});

	await selected.hover();
	expect((await readTab(selected)).actionBackground).toBe('rgb(22, 101, 52)');

	await page.locator('.editor-group-container').evaluate(group => group.classList.remove('active'));
	await active.hover();
	expect(await readTab(active)).toEqual({
		background: 'rgb(107, 33, 168)',
		foreground: 'rgb(207, 250, 254)',
		actionBackground: 'rgb(76, 22, 120)',
	});
	await inactive.hover();
	expect(await readTab(inactive)).toEqual({
		background: 'rgb(124, 45, 18)',
		foreground: 'rgb(255, 237, 213)',
		actionBackground: 'rgb(90, 31, 12)',
	});
});

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
		await openFixture(page, `editor/tabs/Colors/Continuity/${fixture}/Dark`, '.tabs-container > .tab.active');
		const state = await page.locator('.part.editor').evaluate(editor => {
			const group = editor.querySelector<HTMLElement>('.editor-group-container.active');
			const active = group?.querySelector<HTMLElement>('.tab.active');
			const fill = active?.querySelector<HTMLElement>('.tab-fill');
			const indicator = active?.querySelector<HTMLElement>('.tab-border-top-container');
			const strip = group?.querySelector<HTMLElement>('.tabs-and-actions-container');
			const body = group?.querySelector<HTMLElement>('.editor-container');
			if (!group || !active || !fill || !indicator || !strip || !body) {
				throw new Error('Expected connected editor frame and active tab');
			}
			const editorRect = editor.getBoundingClientRect();
			const fillRect = fill.getBoundingClientRect();
			const bodyRect = body.getBoundingClientRect();
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
				topAligned: editorRect.top === fillRect.top,
				bodyOverlap: fillRect.bottom - bodyRect.top,
				frameInsets: [bodyRect.left - editorRect.left, editorRect.right - bodyRect.right],
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
			bodyOverlap: 1,
			frameInsets: [1, 1],
			visibleDividers: expected.dividers,
		});
	});
}

for (const theme of ['DarkHighContrast', 'LightHighContrast']) {
	test(`connected tab actions respect disabled hover state in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Layout/SingleEditor/${theme}`, '.tabs-container > .tab');
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
