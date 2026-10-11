/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('Dark Modern keeps legacy, connected, and pill tab surfaces distinct', async ({ page }) => {
	test.setTimeout(60_000);

	const surfaceColors = async (style: 'Legacy' | 'Connected' | 'Pill') => {
		await openFixture(page, `editor/tabs/Styles/${style}/DarkModern`, '.tabs-container > .tab.active');
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
		capRadius: '4px',
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

for (const [group, expected] of [
	['FocusedEditorGroup', {
		activeTop: { indicator: 'none', color: 'rgb(34, 211, 238)' },
		activeBottom: { display: 'block', color: 'rgb(244, 63, 94)' },
		activeSide: 'rgb(34, 211, 238)',
		selectedTop: { indicator: 'none', color: 'rgb(163, 230, 53)', width: 1, leftInset: 2, rightInset: 2 },
		selectedBorder: 'rgb(163, 230, 53)',
	}],
	['UnfocusedEditorGroup', {
		activeTop: { indicator: 'none', color: 'rgb(192, 132, 252)' },
		activeBottom: { display: 'block', color: 'rgb(251, 146, 60)' },
		activeSide: 'rgb(192, 132, 252)',
		selectedTop: { indicator: 'none', color: 'rgb(163, 230, 53)', width: 1, leftInset: 2, rightInset: 2 },
		selectedBorder: 'rgb(163, 230, 53)',
	}],
] as const) {
	test(`connected tabs show border customizations in ${group}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Colors/BorderCustomizations/ConnectedMultiSelection/${group}/Dark`, '.tabs-container > .tab.active');

		const colors = await page.locator('.tabs-container').evaluate(tabs => {
			const active = tabs.querySelector<HTMLElement>('.tab.active');
			const selected = tabs.querySelector<HTMLElement>('.tab.selected:not(.active)');
			const activeTop = active?.querySelector<HTMLElement>('.tab-border-top-container');
			const activeBottom = active?.querySelector<HTMLElement>('.tab-border-bottom-container');
			const activeFill = active?.querySelector<HTMLElement>('.tab-fill');
			const activeEdge = active?.querySelector<HTMLElement>('.tab-connected-edge');
			const selectedTop = selected?.querySelector<HTMLElement>('.tab-border-top-container');
			const selectedFill = selected?.querySelector<HTMLElement>('.tab-fill');
			if (!activeTop || !activeBottom || !activeFill || !activeEdge || !selected || !selectedTop || !selectedFill) {
				throw new Error('Expected active and selected connected-tab border indicators');
			}
			const style = (element: HTMLElement) => {
				const computedStyle = getComputedStyle(element);
				return { display: computedStyle.display, color: computedStyle.backgroundColor };
			};
			return {
				activeTop: {
					indicator: getComputedStyle(activeTop).display,
					color: getComputedStyle(activeEdge).borderTopColor,
				},
				activeBottom: style(activeBottom),
				activeSide: getComputedStyle(activeEdge).borderRightColor,
				selectedTop: {
					indicator: getComputedStyle(selectedTop).display,
					color: getComputedStyle(selectedFill).borderTopColor,
					width: Number.parseFloat(getComputedStyle(selectedFill).borderTopWidth),
					leftInset: selectedFill.getBoundingClientRect().left - selected.getBoundingClientRect().left,
					rightInset: selected.getBoundingClientRect().right - selectedFill.getBoundingClientRect().right,
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
		edgeTop: 'rgb(34, 211, 238)',
		edgeSide: 'rgb(250, 204, 21)',
		fillTop: 'rgba(0, 0, 0, 0)',
		fillBottom: 'rgba(0, 0, 0, 0)',
		fillSide: 'rgba(0, 0, 0, 0)',
		inactiveBorder: 'rgba(0, 0, 0, 0)',
		visibleDividers: Array(5).fill('rgb(255, 255, 255)'),
	}],
] as const) {
	test(`${style} tabs retain their border ownership`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Colors/BorderCustomizations/AcrossTabStyles/${style}/Dark`, '.tabs-container > .tab.active');
		const ownership = await page.locator('.tabs-container > .tab.active').evaluate(active => {
			const top = active.querySelector<HTMLElement>('.tab-border-top-container');
			const bottom = active.querySelector<HTMLElement>('.tab-border-bottom-container');
			const fill = active.querySelector<HTMLElement>('.tab-fill');
			if (!top || !bottom || !fill) {
				throw new Error('Expected active tab border elements');
			}
			const fillStyle = getComputedStyle(fill);
			const edge = active.querySelector<HTMLElement>('.tab-connected-edge');
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
				edgeTop: edge ? getComputedStyle(edge).borderTopColor : undefined,
				edgeSide: edge ? getComputedStyle(edge).borderRightColor : undefined,
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

test('default and customized connected tabs share identical geometry', async ({ page }) => {
	const readGeometry = async (fixture: string) => {
		await openFixture(page, `editor/tabs/Colors/${fixture}/Dark`, '.tabs-container > .tab.active');
		return page.locator('.tabs-container > .tab.active').evaluate(active => {
			const fill = active.querySelector<HTMLElement>('.tab-fill');
			const edge = active.querySelector<HTMLElement>('.tab-connected-edge');
			const strip = active.closest<HTMLElement>('.tabs-and-actions-container');
			if (!fill || !edge || !strip) {
				throw new Error('Expected connected cap geometry');
			}
			const activeRect = active.getBoundingClientRect();
			const fillRect = fill.getBoundingClientRect();
			const edgeRect = edge.getBoundingClientRect();
			const edgeStyle = getComputedStyle(edge);
			const leftShoulder = getComputedStyle(fill, '::before');
			const rightShoulder = getComputedStyle(fill, '::after');
			const leftMask = getComputedStyle(edge, '::before');
			return {
				fillInsets: [
					fillRect.left - activeRect.left,
					fillRect.top - activeRect.top,
					activeRect.right - fillRect.right,
					fillRect.bottom - activeRect.bottom,
				],
				edgeInsets: [
					edgeRect.left - activeRect.left,
					edgeRect.top - activeRect.top,
					activeRect.right - edgeRect.right,
					edgeRect.bottom - activeRect.bottom,
				],
				capRadius: [edgeStyle.borderTopLeftRadius, edgeStyle.borderTopRightRadius],
				shoulders: [
					[leftShoulder.bottom, leftShoulder.width, leftShoulder.height, leftShoulder.borderBottomRightRadius],
					[rightShoulder.bottom, rightShoulder.width, rightShoulder.height, rightShoulder.borderBottomLeftRadius],
				],
				mask: [leftMask.bottom, leftMask.width, leftMask.height],
				separator: [getComputedStyle(strip, '::after').bottom, getComputedStyle(strip, '::after').height],
			};
		});
	};

	expect(await readGeometry('BorderCustomizations/AcrossTabStyles/Connected')).toEqual(await readGeometry('Continuity/DefaultBorders'));
});

for (const [theme, expected] of [
	['DarkHighContrast', { activeTop: 'rgb(243, 133, 24)', accent: 'rgb(243, 133, 24)', tabBorder: 'rgb(111, 195, 223)' }],
	['LightHighContrast', { activeTop: 'rgb(0, 107, 189)', accent: 'rgb(0, 107, 189)', tabBorder: 'rgb(15, 74, 133)' }],
] as const) {
	test(`pill borders retain high contrast ownership in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Colors/BorderCustomizations/AcrossTabStyles/Pill/${theme}`, '.tabs-container > .tab.active');
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
		await openFixture(page, `editor/tabs/Colors/BorderCustomizations/AcrossTabStyles/Connected/${theme}`, '.tabs-container > .tab.active');
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
				top: expected.tabBorder,
				side: expected.tabBorder,
			},
			firstLeft: expected.tabBorder,
			frame: expected.tabBorder,
			groupFrame: 'none',
			visibleDividers: [],
		});
	});
}

test('wrapped upper connected tabs inset customized border accents', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/BorderCustomizations/WrappedConnectedRows/Dark', '.tabs-container > .tab.active.connected-tab-upper-row');
	const ownership = await page.locator('.tab.active.connected-tab-upper-row').evaluate(active => {
		const fill = active.querySelector<HTMLElement>('.tab-fill');
		const top = active.querySelector<HTMLElement>('.tab-border-top-container');
		const bottom = active.querySelector<HTMLElement>('.tab-border-bottom-container');
		if (!fill || !top || !bottom) {
			throw new Error('Expected wrapped active tab border elements');
		}
		const bottomAccent = getComputedStyle(fill, '::after');
		const fillStyle = getComputedStyle(fill);
		const availableWidth = fill.getBoundingClientRect().width
			- Number.parseFloat(fillStyle.borderLeftWidth)
			- Number.parseFloat(fillStyle.borderRightWidth)
			- Number.parseFloat(bottomAccent.left)
			- Number.parseFloat(bottomAccent.right);
		return {
			topIndicator: getComputedStyle(top).display,
			topColor: getComputedStyle(fill).borderTopColor,
			bottomIndicator: getComputedStyle(bottom).display,
			bottomAccent: {
				color: bottomAccent.backgroundColor,
				left: bottomAccent.left,
				right: bottomAccent.right,
				height: bottomAccent.height,
				spansAvailableWidth: Math.abs(Number.parseFloat(bottomAccent.width) - availableWidth) < 0.1,
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
			spansAvailableWidth: true,
		},
	});
});

test('wrapped upper connected hover borders use focused and unfocused inset accents', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/BorderCustomizations/WrappedConnectedRows/Dark', '.tabs-container > .tab.active.connected-tab-upper-row');
	const hovered = page.locator('.tabs-container > .tab.connected-tab-upper-row:not(.active)').first();
	await hovered.hover();
	const readOwnership = () => hovered.evaluate(tab => {
		const fill = tab.querySelector<HTMLElement>('.tab-fill');
		const bottom = tab.querySelector<HTMLElement>('.tab-border-bottom-container');
		if (!fill || !bottom) {
			throw new Error('Expected hovered wrapped tab border elements');
		}
		const accent = getComputedStyle(fill, '::after');
		const fillStyle = getComputedStyle(fill);
		const availableWidth = fill.getBoundingClientRect().width
			- Number.parseFloat(fillStyle.borderLeftWidth)
			- Number.parseFloat(fillStyle.borderRightWidth)
			- Number.parseFloat(accent.left)
			- Number.parseFloat(accent.right);
		return {
			fillBottom: getComputedStyle(fill).borderBottomColor,
			indicator: getComputedStyle(bottom).display,
			accent: {
				color: accent.backgroundColor,
				left: accent.left,
				right: accent.right,
				height: accent.height,
				spansAvailableWidth: Math.abs(Number.parseFloat(accent.width) - availableWidth) < 0.1,
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
			spansAvailableWidth: true,
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
			spansAvailableWidth: true,
		},
	});
});

test('connected tabs honor all modern editor tab customizations', async ({ page }) => {
	await openFixture(page, 'editor/tabs/Colors/TabAndActionCustomizations/SingleRow/Dark', '.tabs-container > .tab.active');
	const tabs = page.locator('.tabs-container');
	const active = tabs.locator('> .tab.active');
	const inactive = tabs.locator('> .tab:not(.active):not(.selected)').first();
	const selected = tabs.locator('> .tab.selected:not(.active)').first();
	const readTab = (tab: typeof active) => tab.evaluate(element => {
		const fill = element.querySelector<HTMLElement>('.tab-fill');
		const label = element.querySelector<HTMLElement>('.tab-label a');
		const actions = element.querySelector<HTMLElement>('.tab-actions');
		const actionButton = actions?.querySelector<HTMLElement>('.action-label');
		if (!fill || !label || !actions || !actionButton) {
			throw new Error('Expected tab fill, label, and actions');
		}
		return {
			background: getComputedStyle(fill).backgroundColor,
			foreground: getComputedStyle(label).color,
			actionOverlayBackground: getComputedStyle(actions).backgroundColor,
			actionButtonBackground: getComputedStyle(actionButton).backgroundColor,
		};
	});

	await page.locator('.editor-container').hover();
	await active.locator('.action-label').focus();
	expect(await readTab(active)).toEqual({
		background: 'rgb(22, 78, 99)',
		foreground: 'rgb(207, 250, 254)',
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(14, 55, 71)',
	});

	await active.hover();
	expect(await readTab(active)).toEqual({
		background: 'rgb(107, 33, 168)',
		foreground: 'rgb(207, 250, 254)',
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(76, 22, 120)',
	});

	await inactive.hover();
	await inactive.locator('.action-label').hover();
	expect(await readTab(inactive)).toEqual({
		background: 'rgb(124, 45, 18)',
		foreground: 'rgb(255, 237, 213)',
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(90, 31, 12)',
	});

	await selected.hover();
	await selected.locator('.action-label').hover();
	expect(await readTab(selected)).toMatchObject({
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(22, 101, 52)',
	});

	await page.locator('.editor-group-container').evaluate(group => group.classList.remove('active'));
	await active.hover();
	expect(await readTab(active)).toEqual({
		background: 'rgb(107, 33, 168)',
		foreground: 'rgb(207, 250, 254)',
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(76, 22, 120)',
	});
	await inactive.hover();
	await inactive.locator('.action-label').hover();
	expect(await readTab(inactive)).toEqual({
		background: 'rgb(124, 45, 18)',
		foreground: 'rgb(255, 237, 213)',
		actionOverlayBackground: 'rgba(0, 0, 0, 0)',
		actionButtonBackground: 'rgb(90, 31, 12)',
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
			const edge = active?.querySelector<HTMLElement>('.tab-connected-edge');
			const indicator = active?.querySelector<HTMLElement>('.tab-border-top-container');
			const strip = group?.querySelector<HTMLElement>('.tabs-and-actions-container');
			const body = group?.querySelector<HTMLElement>('.editor-container');
			if (!group || !active || !fill || !edge || !indicator || !strip || !body) {
				throw new Error('Expected connected editor frame and active tab');
			}
			const editorRect = editor.getBoundingClientRect();
			const fillRect = fill.getBoundingClientRect();
			const bodyRect = body.getBoundingClientRect();
			const edgeStyle = getComputedStyle(edge);
			const leftShoulder = getComputedStyle(fill, '::before');
			const rightShoulder = getComputedStyle(fill, '::after');
			const visibleDividers = [...group.querySelectorAll<HTMLElement>('.tab-divider')]
				.filter(element => getComputedStyle(element).display !== 'none')
				.map(element => getComputedStyle(element).backgroundColor);
			return {
				editorBorder: getComputedStyle(editor).borderTopColor,
				capTop: edgeStyle.borderTopColor,
				capLeft: edgeStyle.borderLeftColor,
				capLeftWidth: edgeStyle.borderLeftWidth,
				capSide: edgeStyle.borderRightColor,
				capRadius: edgeStyle.borderTopRightRadius,
				separator: getComputedStyle(strip, '::after').backgroundColor,
				indicator: getComputedStyle(indicator).display,
				capTopInset: edge.getBoundingClientRect().top - editorRect.top,
				bodyOverlap: fillRect.bottom - bodyRect.top,
				frameInsets: [bodyRect.left - editorRect.left, editorRect.right - bodyRect.right],
				shoulderTangents: {
					left: [leftShoulder.bottom, leftShoulder.height, leftShoulder.borderBottomRightRadius, leftShoulder.borderBottomColor],
					right: [rightShoulder.bottom, rightShoulder.height, rightShoulder.borderBottomLeftRadius, rightShoulder.borderBottomColor],
				},
				visibleDividers,
			};
		});
		expect(state).toEqual({
			editorBorder: 'rgb(34, 211, 238)',
			capTop: 'rgb(34, 211, 238)',
			capLeft: expected.capLeft,
			capLeftWidth: expected.capLeftWidth,
			capSide: 'rgb(34, 211, 238)',
			capRadius: '4px',
			separator: 'rgb(34, 211, 238)',
			indicator: 'none',
			capTopInset: 3,
			bodyOverlap: 0,
			frameInsets: [1, 1],
			shoulderTangents: {
				left: ['0px', '7px', '7px', 'rgb(34, 211, 238)'],
				right: ['0px', '7px', '7px', 'rgb(34, 211, 238)'],
			},
			visibleDividers: expected.dividers,
		});
	});
}

for (const theme of ['DarkHighContrast', 'LightHighContrast']) {
	test(`connected tab actions respect disabled hover state in ${theme}`, async ({ page }) => {
		await openFixture(page, `editor/tabs/Density/Default/SingleTab/${theme}`, '.tabs-container > .tab');
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
