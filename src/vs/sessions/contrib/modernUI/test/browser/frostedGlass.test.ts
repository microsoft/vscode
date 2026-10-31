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
import '../../../agentFeedback/browser/media/agentFeedbackEditorWidget.css';

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

	function createCommentCard(root: HTMLElement) {
		const widget = append(root, 'agent-feedback-widget visible');
		const body = append(widget, 'agent-feedback-widget-body');
		const card = append(body, 'agent-feedback-widget-item');
		const content = append(card, 'agent-feedback-widget-text');
		content.textContent = 'A review comment above the editor.';
		return { card, content };
	}

	for (const customBackground of [undefined, '#304050']) {
		test(`frosts comment cards using their ${customBackground ? 'custom' : 'menu'} background and configured opacity`, () => {
			const { root } = createOverlays();
			if (customBackground) {
				root.style.setProperty('--vscode-agentFeedbackEditorWidget-background', customBackground);
			}
			const { card, content } = createCommentCard(root);
			const solid = readColor(card).rgba;
			const supported = supportsGlass(root);
			root.classList.add('modern-ui-frosted-glass');
			const percentages = [50, 75, 100];

			assert.deepStrictEqual(percentages.map(percentage => {
				root.style.setProperty('--modern-ui-glass-opacity', `${percentage}%`);
				const paint = readColor(card, '::before').rgba;
				return {
					background: readColor(card).rgba,
					tint: Math.round(paint.a * 100),
					matchesTheme: !supported || Math.abs(paint.r - solid.r) <= 1 && Math.abs(paint.g - solid.g) <= 1 && Math.abs(paint.b - solid.b) <= 1,
					filter: getWindow(card).getComputedStyle(card).backdropFilter,
					paintFilter: getWindow(card).getComputedStyle(card, '::before').backdropFilter,
					cardOpacity: getWindow(card).getComputedStyle(card).opacity,
					contentOpacity: getWindow(content).getComputedStyle(content).opacity,
				};
			}), percentages.map(percentage => ({
				background: supported ? new RGBA(0, 0, 0, 0) : solid,
				tint: supported ? percentage : 0,
				matchesTheme: true,
				filter: 'none',
				paintFilter: supported ? 'blur(12px)' : 'none',
				cardOpacity: '1',
				contentOpacity: '1',
			})));
		});
	}

	test('restores solid comment cards when frosted glass is disabled', () => {
		const { root } = createOverlays();
		const { card } = createCommentCard(root);
		const state = () => ({
			background: readColor(card).rgba,
			paintFilter: getWindow(card).getComputedStyle(card, '::before').backdropFilter,
		});
		const before = state();
		root.classList.add('modern-ui-frosted-glass');
		root.classList.remove('modern-ui-frosted-glass');

		assert.deepStrictEqual(state(), before);
	});

	for (const themeClass of ['hc-black', 'hc-light']) {
		test(`keeps comment cards solid in ${themeClass}`, () => {
			const { root } = createOverlays();
			root.classList.add(themeClass);
			const { card } = createCommentCard(root);
			const before = readColor(card).rgba;
			root.classList.add('modern-ui-frosted-glass');

			assert.deepStrictEqual({
				background: readColor(card).rgba,
				paintFilter: getWindow(card).getComputedStyle(card, '::before').backdropFilter,
			}, { background: before, paintFilter: 'none' });
		});
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

	test('uses the solid Agents panel color for the automation dialog with glass enabled', () => {
		const { root, quickInput, dialog } = createOverlays();
		dialog.classList.add('automation-dialog');
		const titlebar = append(dialog, 'automation-titlebar');
		const sticky = append(quickInput, 'monaco-tree-sticky-container');
		sticky.style.backgroundColor = 'var(--vscode-quickInput-background)';
		root.classList.add('automation-dialog-open');
		const panel = new RGBA(32, 48, 64, 1);
		const solidDialog = readColor(dialog).rgba;
		const originalSticky = readColor(sticky).rgba;
		root.classList.add('modern-ui-frosted-glass');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		const supported = supportsGlass(root);
		assert.deepStrictEqual({
			solidDialog,
			titlebar: readColor(titlebar).rgba,
			sticky: readColor(sticky).rgba,
			dialog: readColor(dialog).rgba,
			dialogTint: readColor(dialog, '::before').rgba,
		}, {
			solidDialog: panel,
			titlebar: new RGBA(0, 0, 0, 0),
			sticky: originalSticky,
			dialog: supported ? new RGBA(0, 0, 0, 0) : panel,
			dialogTint: supported ? panel : new RGBA(0, 0, 0, 0),
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
