/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { timeout } from '../../../../../base/common/async.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { HoverWidget } from '../../../../../platform/hover/browser/hoverWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { append, createFrostedGlassOverlays, readColor, supportsGlass } from '../../../../../workbench/contrib/modernUI/test/browser/frostedGlassTestUtils.js';
import '../../../../../workbench/contrib/sessions/browser/media/sessionsList.css';
import '../../../../browser/media/style.css';
import '../../../automations/browser/media/automationDialog.css';
import '../../../agentFeedback/browser/media/agentFeedbackEditorWidget.css';
import '../../../../browser/media/workbench.css';
import '../../../../browser/media/floatingAuxiliaryBar.css';

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

	function createSessionHover(content: HTMLElement) {
		const root = append(document.body, 'monaco-workbench agent-sessions-workbench');
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-editorHoverWidget-background', '#242424');
		root.style.setProperty('--vscode-editorHoverWidget-border', '#5a7b9d');
		root.style.setProperty('--vscode-cornerRadius-large', '8px');

		const target = append(root, 'target');
		target.style.cssText = 'position: fixed; top: 100px; left: 100px; width: 50px; height: 20px;';
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, new TestConfigurationService());
		services.stub(IAccessibilityService, new TestAccessibilityService());
		services.stub(IKeybindingService, { lookupKeybinding: () => undefined });
		services.stub(IMarkdownRendererService, {});
		const hover = store.add(services.createInstance(HoverWidget, {
			target,
			content,
			additionalClasses: ['sessions-list-hover'],
			appearance: { showPointer: true },
			position: { hoverPosition: HoverPosition.RIGHT, forcePosition: true },
			persistence: { hideOnHover: false }
		}));
		hover.render(root);
		const container = hover.domNode.parentElement!;
		container.style.cssText += `position: fixed; left: ${hover.x}px; top: ${hover.y}px;`;
		const scrollable = hover.domNode.querySelector<HTMLElement>('.monaco-scrollable-element')!;
		return { root, hover, scrollable, container };
	}

	test('aligns the frosted session hover with shared bordered and borderless geometry', () => {
		const content = document.createElement('div');
		content.textContent = 'Session details';
		const { root, hover, scrollable } = createSessionHover(content);
		const state = () => {
			const targetWindow = getWindow(hover.domNode);
			const outer = targetWindow.getComputedStyle(hover.domNode);
			const glass = targetWindow.getComputedStyle(hover.domNode, '::before');
			const bounds = hover.domNode.getBoundingClientRect();
			const glassWidth = parseFloat(glass.width) + parseFloat(glass.borderLeftWidth) + parseFloat(glass.borderRightWidth);
			const glassHeight = parseFloat(glass.height) + parseFloat(glass.borderTopWidth) + parseFloat(glass.borderBottomWidth);
			return {
				outerRadius: outer.borderTopLeftRadius,
				outerBorder: outer.borderTopStyle === 'none' ? undefined : outer.borderTopColor,
				outerBorderStyle: outer.borderTopStyle,
				outerBorderWidth: outer.borderTopWidth,
				outerOverflow: outer.overflow,
				glassRadius: glass.borderTopLeftRadius,
				glassBorder: glass.borderTopColor,
				glassBorderStyle: glass.borderTopStyle,
				glassBorderWidth: glass.borderTopWidth,
				glassClip: glass.clipPath,
				glassBackgroundClip: glass.backgroundClip,
				glassFilter: glass.backdropFilter,
				sharesBorderBox: Math.abs(glassWidth - bounds.width) < 0.01 && Math.abs(glassHeight - bounds.height) < 0.01,
			};
		};
		const original = {
			outerBorder: getWindow(hover.domNode).getComputedStyle(hover.domNode).borderTopColor,
			outerOverflow: getWindow(hover.domNode).getComputedStyle(hover.domNode).overflow,
			innerRadius: getWindow(scrollable).getComputedStyle(scrollable).borderTopLeftRadius,
		};
		root.classList.add('modern-ui-frosted-glass');

		if (supportsGlass(root)) {
			const radii = [0, 8, 12];
			const modes = [false, true];
			assert.deepStrictEqual(modes.flatMap(modernUI => {
				root.classList.toggle('modern-ui', modernUI);
				return radii.map(radius => {
					root.style.setProperty('--vscode-cornerRadius-large', `${radius}px`);
					return state();
				});
			}), modes.flatMap(() => radii.map(radius => ({
				outerRadius: `${radius}px`,
				outerBorder: 'rgb(90, 123, 157)',
				outerBorderStyle: 'solid',
				outerBorderWidth: '1px',
				outerOverflow: 'hidden',
				glassRadius: `${radius}px`,
				glassBorder: 'rgba(0, 0, 0, 0)',
				glassBorderStyle: 'solid',
				glassBorderWidth: '1px',
				glassClip: 'padding-box',
				glassBackgroundClip: 'padding-box',
				glassFilter: 'blur(12px)',
				sharesBorderBox: true,
			}))));
			root.style.setProperty('--vscode-editorHoverWidget-border', 'initial');
			assert.deepStrictEqual(state(), {
				outerRadius: '12px',
				outerBorder: undefined,
				outerBorderStyle: 'none',
				outerBorderWidth: '0px',
				outerOverflow: 'hidden',
				glassRadius: '12px',
				glassBorder: 'rgba(0, 0, 0, 0)',
				glassBorderStyle: 'none',
				glassBorderWidth: '0px',
				glassClip: 'padding-box',
				glassBackgroundClip: 'padding-box',
				glassFilter: 'blur(12px)',
				sharesBorderBox: true,
			});
		}

		root.style.setProperty('--vscode-cornerRadius-large', '8px');
		root.style.setProperty('--vscode-editorHoverWidget-border', '#5a7b9d');
		root.classList.remove('modern-ui-frosted-glass', 'modern-ui');
		assert.deepStrictEqual({
			outerBorder: getWindow(hover.domNode).getComputedStyle(hover.domNode).borderTopColor,
			outerOverflow: getWindow(hover.domNode).getComputedStyle(hover.domNode).overflow,
			innerRadius: getWindow(scrollable).getComputedStyle(scrollable).borderTopLeftRadius,
		}, original);
	});

	for (const themeClass of ['hc-black', 'hc-light']) {
		test(`keeps the session hover unchanged in ${themeClass}`, () => {
			const { root, hover, scrollable } = createSessionHover(document.createElement('div'));
			root.classList.add(themeClass);
			const state = () => ({
				overflow: getWindow(hover.domNode).getComputedStyle(hover.domNode).overflow,
				border: getWindow(hover.domNode).getComputedStyle(hover.domNode).borderTopColor,
				innerRadius: getWindow(scrollable).getComputedStyle(scrollable).borderTopLeftRadius,
				glassFilter: getWindow(hover.domNode).getComputedStyle(hover.domNode, '::before').backdropFilter,
			});
			const original = state();
			root.classList.add('modern-ui-frosted-glass');
			assert.deepStrictEqual(state(), original);
		});
	}

	test('keeps session hover links, scrolling, pointer, and fixed descendants usable with glass', async () => {
		const content = document.createElement('div');
		content.style.cssText = 'width: 220px; height: 1200px;';
		const link = document.createElement('a');
		link.href = '#session-link';
		link.textContent = 'Open session';
		content.appendChild(link);
		const fixed = append(content, 'fixed-descendant');
		fixed.style.cssText = 'position: fixed; left: 15px; top: 20px;';
		const { root, hover, scrollable, container } = createSessionHover(content);
		const pointer = container.querySelector<HTMLElement>('.workbench-hover-pointer')!;
		const pointerPosition = { className: pointer.className, top: pointer.style.top, left: pointer.style.left };
		const focusOutline = () => {
			const style = getWindow(link).getComputedStyle(link);
			return {
				color: style.outlineColor,
				style: style.outlineStyle,
				width: style.outlineWidth,
				offset: style.outlineOffset,
			};
		};
		link.focus();
		const originalFocusOutline = focusOutline();
		root.classList.add('modern-ui-frosted-glass');
		const rect = link.getBoundingClientRect();
		const linkHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === link;
		let clicked = false;
		link.addEventListener('click', event => { event.preventDefault(); clicked = true; }, { once: true });
		link.focus();
		link.click();
		const contents = hover.domNode.querySelector<HTMLElement>('.monaco-hover-content')!;
		const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
		// Chromium's synthetic wheel event reports the legacy delta with the opposite sign.
		Object.defineProperty(wheel, 'wheelDeltaY', { value: -120 });
		contents.dispatchEvent(wheel);
		const scrollAfterWheel = contents.scrollTop;
		scrollable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await timeout(0);
		const slider = hover.domNode.querySelector<HTMLElement>('.scrollbar.vertical .slider')!;
		const sliderRect = slider.getBoundingClientRect();
		const sliderX = sliderRect.left + sliderRect.width / 2;
		const sliderY = sliderRect.top + sliderRect.height / 2;
		const scrollbarHit = document.elementFromPoint(sliderX, sliderY) === slider;
		const pointerEvent = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: sliderX };
		slider.dispatchEvent(new PointerEvent('pointerdown', { ...pointerEvent, clientY: sliderY }));
		slider.dispatchEvent(new PointerEvent('pointermove', { ...pointerEvent, clientY: sliderY + 20 }));
		slider.dispatchEvent(new PointerEvent('pointerup', { ...pointerEvent, clientY: sliderY + 20, buttons: 0 }));

		assert.deepStrictEqual({
			linkHit,
			linkFocused: document.activeElement === link,
			focusOutline: focusOutline(),
			clicked,
			scrolled: scrollAfterWheel > 0,
			scrollbarHit,
			dragged: contents.scrollTop > scrollAfterWheel,
			pointerPosition: { className: pointer.className, top: pointer.style.top, left: pointer.style.left },
			fixedPosition: { left: fixed.getBoundingClientRect().left, top: fixed.getBoundingClientRect().top },
		}, {
			linkHit: true,
			linkFocused: true,
			focusOutline: originalFocusOutline,
			clicked: true,
			scrolled: true,
			scrollbarHit: true,
			dragged: true,
			pointerPosition,
			fixedPosition: { left: 15, top: 20 },
		});
	});

	(supportsGlass(document.body) ? test : test.skip)('aligns feedback card glass with its default, focused, and borderless curves', () => {
		const { root } = createOverlays();
		root.style.setProperty('--vscode-focusBorder', '#ffdd11');
		const { card } = createCommentCard(root);
		card.style.width = '120px';
		card.style.height = '60px';
		root.classList.add('modern-ui-frosted-glass');

		const state = () => {
			const targetWindow = getWindow(card);
			const host = targetWindow.getComputedStyle(card);
			const paint = targetWindow.getComputedStyle(card, '::before');
			const bounds = card.getBoundingClientRect();
			const paintWidth = parseFloat(paint.width) + parseFloat(paint.borderLeftWidth) + parseFloat(paint.borderRightWidth);
			const paintHeight = parseFloat(paint.height) + parseFloat(paint.borderTopWidth) + parseFloat(paint.borderBottomWidth);
			return {
				hostRadius: host.borderTopLeftRadius,
				hostBorder: `${host.borderTopStyle} ${host.borderTopWidth}`,
				hostBorderColor: host.borderTopStyle === 'none' ? undefined : host.borderTopColor,
				paintRadius: paint.borderTopLeftRadius,
				paintBorder: `${paint.borderTopStyle} ${paint.borderTopWidth}`,
				paintBorderColor: paint.borderTopColor,
				paintClip: paint.clipPath,
				paintBackgroundClip: paint.backgroundClip,
				sharesBorderBox: Math.abs(paintWidth - bounds.width) < 0.01 && Math.abs(paintHeight - bounds.height) < 0.01,
			};
		};
		const regular = state();
		card.classList.add('focused');
		const focused = state();
		card.classList.remove('focused');
		root.style.setProperty('--vscode-editorWidget-border', 'initial');

		assert.deepStrictEqual({ regular, focused, borderless: state() }, {
			regular: {
				hostRadius: '8px',
				hostBorder: 'solid 1px',
				hostBorderColor: 'rgb(90, 123, 157)',
				paintRadius: '8px',
				paintBorder: 'solid 1px',
				paintBorderColor: 'rgba(0, 0, 0, 0)',
				paintClip: 'padding-box',
				paintBackgroundClip: 'padding-box',
				sharesBorderBox: true,
			},
			focused: {
				hostRadius: '8px',
				hostBorder: 'solid 1px',
				hostBorderColor: 'rgb(255, 221, 17)',
				paintRadius: '8px',
				paintBorder: 'solid 1px',
				paintBorderColor: 'rgba(0, 0, 0, 0)',
				paintClip: 'padding-box',
				paintBackgroundClip: 'padding-box',
				sharesBorderBox: true,
			},
			borderless: {
				hostRadius: '8px',
				hostBorder: 'none 0px',
				hostBorderColor: undefined,
				paintRadius: '8px',
				paintBorder: 'none 0px',
				paintBorderColor: 'rgba(0, 0, 0, 0)',
				paintClip: 'padding-box',
				paintBackgroundClip: 'padding-box',
				sharesBorderBox: true,
			},
		});
	});

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

	function createFloatingPanel() {
		const { root } = createOverlays();
		root.classList.add('dock-detail-panel');
		root.style.setProperty('--vscode-editorWidget-background', '#203040');
		const widget = append(root, 'floating-details');
		const surface = append(widget, 'floating-details-surface');
		const header = append(surface, 'floating-details-header');
		const part = append(surface, 'part auxiliarybar floating-auxiliarybar');
		part.style.backgroundColor = 'var(--vscode-agentsDetail-background)';
		const body = append(append(part, 'content'), 'pane-body');
		const list = append(body, 'monaco-list');
		const rows = append(list, 'monaco-list-rows');
		return { root, widget, surface, backgrounds: [surface, header, part, body, list, rows] };
	}

	test('frosts the floating panel at the configured opacity without opaque tree fills', () => {
		const { root, surface, backgrounds } = createFloatingPanel();
		const solid = backgrounds.map(element => readColor(element).rgba);
		root.classList.add('modern-ui-frosted-glass');
		const supported = supportsGlass(root);
		const glass = [50, 75, 100].map(percentage => {
			root.style.setProperty('--modern-ui-glass-opacity', `${percentage}%`);
			return {
				backgrounds: backgrounds.map(element => readColor(element).rgba),
				tint: Math.round(readColor(surface, '::before').rgba.a * 100),
				filter: getWindow(surface).getComputedStyle(surface, '::before').backdropFilter,
				opacity: getWindow(surface).getComputedStyle(surface).opacity,
			};
		});
		root.classList.remove('modern-ui-frosted-glass');
		assert.deepStrictEqual({ glass, restored: backgrounds.map(element => readColor(element).rgba) }, {
			glass: [50, 75, 100].map(percentage => ({
				backgrounds: supported ? backgrounds.map(() => new RGBA(0, 0, 0, 0)) : solid,
				tint: supported ? percentage : 0,
				filter: supported ? 'blur(12px)' : 'none',
				opacity: '1',
			})),
			restored: solid,
		});
	});

	(supportsGlass(document.body) ? test : test.skip)('keeps the floating Changes panel opaque and restores glass for other views', () => {
		const { root, widget, surface } = createFloatingPanel();
		root.style.setProperty('--vscode-editor-background', '#101010');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		root.classList.add('modern-ui-frosted-glass');
		const state = () => ({
			background: readColor(surface).rgba,
			paintDisplay: getWindow(surface).getComputedStyle(surface, '::before').display,
			tint: Math.round(readColor(surface, '::before').rgba.a * 100),
		});
		const frosted = state();
		widget.classList.add('changes-view-active');
		const changes = state();
		widget.classList.remove('changes-view-active');
		const restored = state();
		const opaqueBackground = getWindow(root).CSS.supports('color', 'rgb(from red r g b / 1)') ? new RGBA(32, 48, 64, 1) : new RGBA(16, 16, 16, 1);

		assert.deepStrictEqual({ frosted, changes, restored }, {
			frosted: { background: new RGBA(0, 0, 0, 0), paintDisplay: 'block', tint: 50 },
			changes: { background: opaqueBackground, paintDisplay: 'none', tint: 50 },
			restored: { background: new RGBA(0, 0, 0, 0), paintDisplay: 'block', tint: 50 },
		});
	});

	for (const themeClass of ['hc-black', 'hc-light']) {
		test(`keeps floating panel fills solid in ${themeClass}`, () => {
			const { root, surface, backgrounds } = createFloatingPanel();
			const solid = backgrounds.map(element => readColor(element).rgba);
			root.classList.add('modern-ui-frosted-glass', themeClass);
			assert.deepStrictEqual({
				backgrounds: backgrounds.map(element => readColor(element).rgba),
				filter: getWindow(surface).getComputedStyle(surface, '::before').backdropFilter,
				shadow: getWindow(surface).getComputedStyle(surface).boxShadow,
			}, { backgrounds: solid, filter: 'none', shadow: 'none' });
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
