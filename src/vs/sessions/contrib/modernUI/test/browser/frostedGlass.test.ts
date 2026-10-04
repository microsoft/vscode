/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { append, createFrostedGlassOverlays, readColor, supportsGlass } from '../../../../../workbench/contrib/modernUI/test/browser/frostedGlassTestUtils.js';
import '../../../../browser/media/style.css';
import '../../../automations/browser/media/automationDialog.css';

suite('Agents frosted glass styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOverlays(panelBackground = '#203040') {
		const overlays = createFrostedGlassOverlays(store, '#242424', 'monaco-workbench agent-sessions-workbench');
		overlays.root.style.setProperty('--vscode-agentsPanel-background', panelBackground);
		const titlebar = append(overlays.quickInput, 'quick-input-titlebar');
		const header = append(overlays.quickInput, 'quick-input-header');
		const html = append(overlays.quickInput, 'quick-input-html-widget');
		const listRows = append(append(append(overlays.quickInput, 'quick-input-list'), 'monaco-scrollable-element'), 'monaco-list-rows');
		const treeRows = append(append(append(overlays.quickInput, 'quick-input-tree'), 'monaco-scrollable-element'), 'monaco-list-rows');
		return {
			...overlays,
			backgrounds: [...overlays.backgrounds, overlays.pickerFilter, overlays.pickerFooter, titlebar, header, html, listRows, treeRows],
		};
	}

	for (const background of ['#203040', '#ffffff']) {
		test(`uses the Agents overlay color at every opacity over ${background}`, () => {
			const overlays = createOverlays(background);
			overlays.root.classList.add('modern-ui-frosted-glass');
			overlays.surfaces.flatMap(surface => surface.getAnimations()).forEach(animation => animation.finish());
			const surfaces = [overlays.quickInput, overlays.menuContainer, overlays.shadowMenuContainer, overlays.picker];
			const expected = Color.fromHex(background).rgba;
			const supported = supportsGlass(overlays.root);
			const percentages = [50, 75, 100];
			assert.deepStrictEqual(percentages.map(percentage => {
				overlays.root.style.setProperty('--modern-ui-glass-opacity', `${percentage}%`);
				return surfaces.map(surface => {
					const color = readColor(surface, '::before').rgba;
					return {
						tint: Math.round(color.a * 100),
						// Canvas premultiplication can round a color channel by one.
						matchesPanelColor: !supported || Math.abs(color.r - expected.r) <= 1 && Math.abs(color.g - expected.g) <= 1 && Math.abs(color.b - expected.b) <= 1,
						contentOpacity: getWindow(surface).getComputedStyle(surface).opacity,
					};
				});
			}), percentages.map(percentage => surfaces.map(() => ({
				tint: supported ? percentage : 0,
				matchesPanelColor: true,
				contentOpacity: '1',
			}))));
		});
	}

	test('clears all Agents overlay fills together and restores their original colors', () => {
		const overlays = createOverlays();
		const backgrounds = () => overlays.backgrounds.map(element => readColor(element).rgba);
		const before = backgrounds();
		overlays.root.classList.add('modern-ui-frosted-glass');
		const glass = backgrounds();
		overlays.root.classList.remove('modern-ui-frosted-glass');
		assert.deepStrictEqual({ glass, restored: backgrounds() }, {
			glass: supportsGlass(overlays.root) ? overlays.backgrounds.map(() => new RGBA(0, 0, 0, 0)) : before,
			restored: before,
		});
	});

	test('does not frost panels, session cards, chat inputs, or editor backgrounds', () => {
		const { root } = createOverlays();
		const surfaces = ['part sidebar', 'part panel', 'part sessions', 'session-item', 'chat-input-container', 'monaco-editor-background'].map(className => {
			const surface = append(root, className);
			surface.style.backgroundColor = 'var(--vscode-agentsPanel-background)';
			return surface;
		});
		const state = () => surfaces.map(surface => ({
			background: readColor(surface).rgba,
			filter: getWindow(surface).getComputedStyle(surface).backdropFilter,
			paintFilter: getWindow(surface).getComputedStyle(surface, '::before').backdropFilter,
		}));
		const before = state();
		root.classList.add('modern-ui-frosted-glass');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		assert.deepStrictEqual(state(), before);
	});

	test('keeps sticky picker headings and the automation titlebar solid', () => {
		const { root, quickInput, dialog } = createOverlays();
		dialog.classList.add('automation-dialog');
		const titlebar = append(dialog, 'automation-titlebar');
		const sticky = append(quickInput, 'monaco-tree-sticky-container');
		sticky.style.backgroundColor = 'var(--vscode-quickInput-background)';
		const original = [titlebar, sticky].map(element => readColor(element).rgba);
		root.classList.add('modern-ui-frosted-glass');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		assert.deepStrictEqual({
			headings: [titlebar, sticky].map(element => readColor(element).rgba),
			dialogTint: Math.round(readColor(dialog, '::before').rgba.a * 100),
		}, {
			headings: original,
			dialogTint: supportsGlass(root) ? 50 : 0,
		});
	});

	for (const themeClass of ['hc-black', 'hc-light']) {
		test(`retains every Agents overlay background in ${themeClass}`, () => {
			const overlays = createOverlays();
			const before = overlays.backgrounds.map(element => readColor(element).rgba);
			overlays.root.classList.add('modern-ui-frosted-glass', themeClass);
			assert.deepStrictEqual({
				backgrounds: overlays.backgrounds.map(element => readColor(element).rgba),
				filters: overlays.surfaces.map(surface => getWindow(surface).getComputedStyle(surface, '::before').backdropFilter),
			}, {
				backgrounds: before,
				filters: overlays.surfaces.map(() => 'none'),
			});
		});
	}
});
