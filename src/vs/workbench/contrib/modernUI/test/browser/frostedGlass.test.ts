/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType, getWindow } from '../../../../../base/browser/dom.js';
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS, ContextView, ContextViewDOMPosition, contextViewMenuCloseAnimation } from '../../../../../base/browser/ui/contextview/contextview.js';
import { Menu } from '../../../../../base/browser/ui/menu/menu.js';
import { Action, SubmenuAction } from '../../../../../base/common/actions.js';
import { Color, RGBA } from '../../../../../base/common/color.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultMenuStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { append, createFrostedGlassOverlays, readColor, supportsGlass } from './frostedGlassTestUtils.js';

suite('Frosted glass styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createOverlays(background = '#242424') {
		return createFrostedGlassOverlays(store, background);
	}

	function createNestedMenu(domPosition: ContextViewDOMPosition, windowClass = 'modern-ui') {
		const root = append(document.body, `monaco-workbench ${windowClass} modern-ui-frosted-glass monaco-enable-motion`);
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-menu-background', '#242424');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		const contextView = store.add(new ContextView(root, domPosition));
		const action = store.add(new Action('test.nestedAction', 'Nested action'));
		contextView.show({
			getAnchor: () => ({ x: 100, y: 100 }),
			closeAnimation: contextViewMenuCloseAnimation,
			render: container => {
				container.classList.add(CONTEXT_VIEW_MENU_MOTION_CLASS);
				return new Menu(container, [
					new SubmenuAction('test.submenu', 'Submenu', [
						new SubmenuAction('test.nestedSubmenu', 'Nested submenu', [action]),
					]),
				], {}, defaultMenuStyles);
			},
		});
		const container = contextView.getViewElement();
		const surface = container.querySelector<HTMLElement>('.monaco-scrollable-element')!;
		const animation = surface.getAnimations()[0];
		assert.ok(animation, 'The parent menu must have a real opening animation');
		const openingAnimations = container.getAnimations({ subtree: true });
		openingAnimations.forEach(animation => {
			animation.pause();
			animation.currentTime = 125;
		});
		const finishOpening = () => openingAnimations.forEach(animation => animation.finish());
		return { root, container, surface, animation, contextView, finishOpening };
	}

	function openSubmenu(container: HTMLElement): HTMLElement {
		const item = container.querySelector<HTMLElement>('.monaco-submenu-item')!;
		item.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		return container.querySelector<HTMLElement>('.monaco-submenu')!;
	}

	for (const windowClass of ['modern-ui', 'agent-sessions-workbench']) {
		for (const kind of ['plain', 'dropdown', 'tabbed', 'submenu']) {
			(supportsGlass(document.body) ? test : test.skip)(`scales every ${kind} picker in ${windowClass} without an opacity or tint transition`, () => {
				const { root, picker } = createFrostedGlassOverlays(store, '#242424', `monaco-workbench ${windowClass}`);
				root.style.setProperty('--vscode-agentsPanel-background', '#242424');
				picker.style.width = '200px';
				picker.style.height = '100px';
				if (kind === 'dropdown') {
					picker.classList.add('action-widget-dropdown');
				} else if (kind === 'tabbed') {
					append(picker, 'tabbed-action-list-tabbar');
				} else if (kind === 'submenu') {
					picker.classList.add('action-list-submenu-panel');
					picker.style.position = 'absolute';
				}
				root.style.setProperty('--modern-ui-glass-opacity', '50%');
				root.classList.add('modern-ui-frosted-glass', 'monaco-enable-motion');
				const [animation] = picker.getAnimations();
				assert.ok(animation, 'Every popup renderer must opt in to the shared glass scale');
				const read = () => {
					const style = getWindow(picker).getComputedStyle(picker);
					return {
						scale: style.transform === 'none' ? 1 : new DOMMatrixReadOnly(style.transform).a,
						opacity: style.opacity,
						tint: Math.round(readColor(picker, '::before').rgba.a * 100),
						blur: getWindow(picker).getComputedStyle(picker, '::before').backdropFilter,
					};
				};
				animation.pause();
				animation.currentTime = 0;
				const opening = read();
				animation.finish();
				assert.deepStrictEqual({ opening, settled: read() }, {
					opening: { scale: 0.97, opacity: '1', tint: 50, blur: 'blur(12px)' },
					settled: { scale: 1, opacity: '1', tint: 50, blur: 'blur(12px)' },
				});
			});
		}
	}

	for (const domPosition of [ContextViewDOMPosition.ABSOLUTE, ContextViewDOMPosition.FIXED_SHADOW]) {
		const name = domPosition === ContextViewDOMPosition.FIXED_SHADOW ? 'shadow-root' : 'ordinary';
		const supportsShadowSelectors = CSS.supports('selector(:host-context(.modern-ui))');
		const glassMotionTest = supportsGlass(document.body) && (domPosition !== ContextViewDOMPosition.FIXED_SHADOW || supportsShadowSelectors) ? test : test.skip;

		for (const windowClass of ['modern-ui', 'agent-sessions-workbench']) {
			glassMotionTest(`closing motion scales ${name} menu contents and glass together in ${windowClass}`, () => {
				const { root, container, surface, contextView, finishOpening } = createNestedMenu(domPosition, windowClass);
				finishOpening();
				contextView.hide();
				container.getAnimations({ subtree: true }).forEach(animation => {
					animation.pause();
					animation.currentTime = 75;
				});
				const targetWindow = getWindow(container);
				const paint = targetWindow.getComputedStyle(container, '::before');
				const contents = targetWindow.getComputedStyle(surface);
				const scale = (transform: string) => transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
				const state = {
					hasEditorMarker: root.classList.contains('modern-ui'),
					closing: container.classList.contains(CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS),
					inert: container.inert,
					paintAnimation: paint.animationName,
					contentAnimation: contents.animationName,
					scalesTogether: scale(paint.transform) === scale(contents.transform),
					shrinking: scale(contents.transform) < 1 && scale(contents.transform) > 0.99,
					paintOpacity: paint.opacity,
				};
				contextView.hide(undefined, true);
				assert.deepStrictEqual(state, {
					hasEditorMarker: windowClass === 'modern-ui',
					closing: true,
					inert: true,
					paintAnimation: 'frosted-glass-menu-motion-close',
					contentAnimation: 'context-view-menu-motion-close',
					scalesTogether: true,
					shrinking: true,
					paintOpacity: '1',
				});
			});
		}

		for (const useMenuMotionClass of [false, true]) {
			glassMotionTest(`scales the complete ${name} ${useMenuMotionClass ? 'dropdown' : 'context'} menu without fading`, () => {
				const { container, surface } = createNestedMenu(domPosition);
				container.classList.toggle(CONTEXT_VIEW_MENU_MOTION_CLASS, useMenuMotionClass);
				const animations = container.getAnimations({ subtree: true });
				const read = () => {
					const targetWindow = getWindow(container);
					const paint = targetWindow.getComputedStyle(container, '::before');
					const contents = targetWindow.getComputedStyle(surface);
					const scale = (transform: string) => transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
					return {
						paintScale: scale(paint.transform),
						contentScale: scale(contents.transform),
						contentWidthRatio: Math.round(surface.getBoundingClientRect().width / container.getBoundingClientRect().width * 1000) / 1000,
						containerTransform: targetWindow.getComputedStyle(container).transform,
						opacity: [targetWindow.getComputedStyle(container).opacity, paint.opacity, contents.opacity],
						tint: Math.round(readColor(container, '::before').rgba.a * 100),
					};
				};
				animations.forEach(animation => {
					animation.pause();
					animation.currentTime = 0;
				});
				const initial = read();
				animations.forEach(animation => animation.currentTime = 125);
				const middle = read();
				animations.forEach(animation => animation.finish());

				assert.deepStrictEqual({
					initial,
					grows: middle.paintScale > 0.97 && middle.paintScale < 1,
					synchronized: middle.paintScale === middle.contentScale,
					finished: read(),
				}, {
					initial: { paintScale: 0.97, contentScale: 0.97, contentWidthRatio: 0.97, containerTransform: 'none', opacity: ['1', '1', '1'], tint: 50 },
					grows: true,
					synchronized: true,
					finished: { paintScale: 1, contentScale: 1, contentWidthRatio: 1, containerTransform: 'none', opacity: ['1', '1', '1'], tint: 50 },
				});
			});
		}

		glassMotionTest(`shares the ${name} menu anchor across the glass and content scale`, () => {
			const { container, surface } = createNestedMenu(domPosition);
			const corners = ['bottom left', 'bottom right', 'top left', 'top right'];
			const actual = corners.map(corner => {
				container.classList.remove('top', 'bottom', 'left', 'right');
				container.classList.add(...corner.split(' '));
				const targetWindow = getWindow(container);
				const origin = targetWindow.getComputedStyle(container).transformOrigin;
				const [x, y] = origin.split(' ').map(value => parseFloat(value));
				const bounds = container.getBoundingClientRect();
				return {
					corner,
					correctAnchor: Math.abs(x - (corner.includes('right') ? bounds.width : 0)) < 0.01
						&& Math.abs(y - (corner.includes('top') ? bounds.height : 0)) < 0.01,
					paintOrigin: targetWindow.getComputedStyle(container, '::before').transformOrigin === origin,
					contentOrigin: targetWindow.getComputedStyle(surface).transformOrigin === origin,
				};
			});
			assert.deepStrictEqual(actual, corners.map(corner => ({ corner, correctAnchor: true, paintOrigin: true, contentOrigin: true })));
		});

		glassMotionTest(`closes the ${name} glass and content from the same in-flight scale`, () => {
			const { container, surface, contextView } = createNestedMenu(domPosition);
			const targetWindow = getWindow(container);
			const openingTransform = targetWindow.getComputedStyle(surface).transform;
			contextView.hide();
			container.getAnimations({ subtree: true }).forEach(animation => {
				animation.pause();
				animation.currentTime = 0;
			});
			assert.deepStrictEqual({
				paintTransform: targetWindow.getComputedStyle(container, '::before').transform,
				contentTransform: targetWindow.getComputedStyle(surface).transform,
				tint: Math.round(readColor(container, '::before').rgba.a * 100),
			}, {
				paintTransform: openingTransform,
				contentTransform: openingTransform,
				tint: 50,
			});
		});

		glassMotionTest(`stops both ${name} scale animations when motion is reduced`, () => {
			const { root, container, surface } = createNestedMenu(domPosition);
			root.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
			const targetWindow = getWindow(container);
			assert.deepStrictEqual({
				animations: container.getAnimations({ subtree: true }).length,
				paintTransform: targetWindow.getComputedStyle(container, '::before').transform,
				contentTransform: targetWindow.getComputedStyle(surface).transform,
				tint: Math.round(readColor(container, '::before').rgba.a * 100),
			}, {
				animations: 0,
				paintTransform: 'none',
				contentTransform: 'none',
				tint: 50,
			});
		});

		glassMotionTest(`keeps ${name} nested menu glass stable during the parent opening animation`, () => {
			const { root, container, surface, finishOpening } = createNestedMenu(domPosition);
			const openingStyle = getWindow(surface).getComputedStyle(surface);
			const entrance = {
				opaqueContents: openingStyle.opacity === '1',
				transforming: openingStyle.transform !== 'none',
			};
			const submenu = openSubmenu(container);
			const nestedSubmenu = openSubmenu(submenu);
			const submenus = [submenu, nestedSubmenu];
			for (const menu of submenus) {
				menu.getAnimations({ subtree: true }).forEach(animation => animation.finish());
			}
			const tint = () => submenus.map(menu => Math.round(readColor(menu, '::before').rgba.a * 100));
			const opening = {
				tint: tint(),
				...entrance,
			};
			finishOpening();
			const settled = {
				tint: tint(),
				willChange: getWindow(surface).getComputedStyle(surface).willChange,
				transform: getWindow(surface).getComputedStyle(surface).transform,
			};
			root.classList.remove('modern-ui-frosted-glass');
			const supported = supportsGlass(root);
			assert.deepStrictEqual({
				opening,
				settled,
				fallback: submenus.map(menu => readColor(menu.querySelector<HTMLElement>('.monaco-scrollable-element')!).rgba),
				fallbackWillChange: getWindow(surface).getComputedStyle(surface).willChange,
			}, {
				opening: { tint: submenus.map(() => supported ? 50 : 0), opaqueContents: supported, transforming: true },
				settled: { tint: submenus.map(() => supported ? 50 : 0), willChange: supported ? 'auto' : 'opacity', transform: 'none' },
				fallback: submenus.map(() => new RGBA(36, 36, 36, 1)),
				fallbackWillChange: 'opacity',
			});
		});

		glassMotionTest(`finishes the ${name} glass entrance before positioning a submenu`, () => {
			const { root, container, animation, finishOpening } = createNestedMenu(domPosition);
			const submenu = openSubmenu(container);
			const initialBounds = submenu.getBoundingClientRect();
			const interrupted = animation.playState === 'finished';
			const paintTransform = getWindow(container).getComputedStyle(container, '::before').transform;
			finishOpening();
			const finalBounds = submenu.getBoundingClientRect();
			const supported = supportsGlass(root);
			assert.deepStrictEqual({
				interrupted,
				paintTransform,
				position: supported ? [initialBounds.x, initialBounds.y] : undefined,
			}, {
				interrupted: supported,
				paintTransform: 'none',
				position: supported ? [finalBounds.x, finalBounds.y] : undefined,
			});
		});

		glassMotionTest(`keeps ${name} submenus tinted during closing and releases the tint when motion is disabled`, () => {
			const { root, container, surface, finishOpening } = createNestedMenu(domPosition);
			finishOpening();
			const submenu = openSubmenu(container);
			submenu.getAnimations({ subtree: true }).forEach(animation => animation.finish());
			container.style.setProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, '150ms');
			container.classList.add(CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS);
			const closingAnimation = surface.getAnimations()[0];
			assert.ok(closingAnimation, 'The parent menu must have a real closing animation');
			closingAnimation.pause();
			closingAnimation.currentTime = 75;
			const closing = Math.round(readColor(submenu, '::before').rgba.a * 100);
			root.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
			const supported = supportsGlass(root);
			assert.deepStrictEqual({
				closing,
				reducedMotion: Math.round(readColor(submenu, '::before').rgba.a * 100),
				animation: getWindow(surface).getComputedStyle(surface).animationName,
			}, {
				closing: supported ? 100 : 0,
				reducedMotion: supported ? 50 : 0,
				animation: 'none',
			});
		});

		glassMotionTest(`opens ${name} submenus without changing their glass tint`, () => {
			const { root, container, finishOpening } = createNestedMenu(domPosition);
			finishOpening();
			const submenu = openSubmenu(container);
			const animations = submenu.getAnimations({ subtree: true });
			animations.forEach(animation => {
				animation.pause();
				animation.currentTime = 40;
			});
			const nestedSubmenu = openSubmenu(submenu);
			nestedSubmenu.getAnimations({ subtree: true }).forEach(animation => animation.finish());
			const submenus = [submenu, nestedSubmenu];
			const tint = () => submenus.map(menu => Math.round(readColor(menu, '::before').rgba.a * 100));
			const opening = tint();
			animations.forEach(animation => animation.finish());
			const supported = supportsGlass(root);
			assert.deepStrictEqual({
				opening,
				settled: tint(),
				animationCount: animations.length,
			}, {
				opening: submenus.map(() => supported ? 50 : 0),
				settled: submenus.map(() => supported ? 50 : 0),
				animationCount: supported ? 2 : 1,
			});
		});
	}

	test('scales glass menus when the editor Modern UI motion styles are unavailable', () => {
		const { root, menuContainer, shadowMenuContainer } = createOverlays();
		root.classList.remove('modern-ui');
		root.classList.add('monaco-enable-motion');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		const menus = [menuContainer, shadowMenuContainer];
		menus.forEach(menu => menu.classList.add(CONTEXT_VIEW_MENU_MOTION_CLASS));
		const originalAnimations = menus.map(menu => menu.getAnimations({ subtree: true }));
		originalAnimations.flat().forEach(animation => animation.pause());
		root.classList.add('modern-ui-frosted-glass');
		const animations = menus.flatMap(menu => menu.getAnimations({ subtree: true }));
		animations.forEach(animation => {
			animation.pause();
			animation.currentTime = 40;
		});
		const opening = menus.map(menu => Math.round(readColor(menu, '::before').rgba.a * 100));
		animations.forEach(animation => animation.finish());
		const supported = [supportsGlass(root), supportsGlass(root) && CSS.supports('selector(:host-context(.modern-ui))')];
		assert.deepStrictEqual({
			opening,
			settled: menus.map(menu => Math.round(readColor(menu, '::before').rgba.a * 100)),
			animationCount: animations.length,
		}, {
			opening: supported.map(supported => supported ? 50 : 0),
			settled: supported.map(supported => supported ? 50 : 0),
			animationCount: supported.reduce((count, supported, index) => count + (supported ? 2 : originalAnimations[index].length), 0),
		});
	});

	test('keeps picker and nested picker tint steady while opening and uses a solid closing fallback', () => {
		const { root, picker } = createOverlays();
		root.classList.add('modern-ui-frosted-glass', 'monaco-enable-motion');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		picker.classList.add('action-widget-dropdown');
		const submenu = append(picker.querySelector<HTMLElement>('.actionList')!, 'action-list-submenu-panel action-widget');
		submenu.style.position = 'absolute';
		const surfaces = [picker, submenu];
		const tint = () => surfaces.map(surface => Math.round(readColor(surface, '::before').rgba.a * 100));
		const animation = picker.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 125;
		const opening = tint();
		animation.finish();
		const settled = {
			tint: tint(),
			willChange: getWindow(picker).getComputedStyle(picker).willChange,
			submenuPosition: getWindow(submenu).getComputedStyle(submenu).position,
		};
		picker.classList.add('action-widget-dropdown-closing');
		const closeAnimation = picker.getAnimations()[0];
		assert.ok(closeAnimation);
		closeAnimation.pause();
		closeAnimation.currentTime = 75;
		const closing = tint();
		closeAnimation.finish();
		const supported = supportsGlass(root);
		assert.deepStrictEqual({ opening, settled, closing, closed: tint() }, {
			opening: surfaces.map(() => supported ? 50 : 0),
			settled: { tint: surfaces.map(() => supported ? 50 : 0), willChange: supported ? 'transform' : 'transform, opacity', submenuPosition: 'absolute' },
			closing: surfaces.map(() => supported ? 100 : 0),
			closed: surfaces.map(() => supported ? 100 : 0),
		});
	});

	test('cancelling picker motion restores tint without adding a transform containing block', () => {
		const { root, picker } = createOverlays();
		root.classList.add('modern-ui-frosted-glass', 'monaco-enable-motion');
		root.style.setProperty('--modern-ui-glass-opacity', '50%');
		picker.classList.add('action-widget-dropdown');
		const animation = picker.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 125;
		root.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		assert.deepStrictEqual({
			tint: Math.round(readColor(picker, '::before').rgba.a * 100),
			willChange: getWindow(picker).getComputedStyle(picker).willChange,
			transform: getWindow(picker).getComputedStyle(picker).transform,
		}, {
			tint: supportsGlass(root) ? 50 : 0,
			willChange: 'auto',
			transform: 'none',
		});
	});

	test('suppresses quick input motion without retaining backdrop isolation', () => {
		const { root, quickInput } = createOverlays();
		root.classList.add('modern-ui-frosted-glass', 'monaco-enable-motion');
		const supported = supportsGlass(root);
		const state = () => {
			const style = getWindow(quickInput).getComputedStyle(quickInput);
			return {
				animation: style.animationName,
				willChange: style.willChange,
				filter: style.backdropFilter,
				paintFilter: getWindow(quickInput).getComputedStyle(quickInput, '::before').backdropFilter,
			};
		};
		const opening = state();
		quickInput.classList.add('quick-input-widget-closing');
		const closing = state();
		root.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');

		assert.deepStrictEqual({ opening, closing, reducedMotion: state() }, {
			opening: {
				animation: supported ? 'none' : 'quick-input-widget-open',
				willChange: supported ? 'auto' : 'transform, opacity',
				filter: 'none',
				paintFilter: supported ? 'blur(12px)' : 'none',
			},
			closing: {
				animation: supported ? 'none' : 'quick-input-widget-close',
				willChange: supported ? 'auto' : 'transform, opacity',
				filter: 'none',
				paintFilter: supported ? 'blur(12px)' : 'none',
			},
			reducedMotion: {
				animation: 'none',
				willChange: 'auto',
				filter: 'none',
				paintFilter: supported ? 'blur(12px)' : 'none',
			},
		});
	});

	for (const { background, foreground, backdrop } of [
		{ background: '#242424', foreground: '#cccccc', backdrop: Color.white },
		{ background: '#f8f8f8', foreground: '#333333', backdrop: Color.black },
	]) {
		test(`paints one non-interactive material layer per overlay over ${background}`, () => {
			const overlays = createOverlays(background);
			overlays.root.classList.add('modern-ui-frosted-glass');
			const supported = supportsGlass(overlays.root);
			assert.deepStrictEqual(overlays.surfaces.map(surface => {
				const targetWindow = getWindow(surface);
				const paint = targetWindow.getComputedStyle(surface, '::before');
				const color = readColor(surface, '::before');
				return {
					filter: targetWindow.getComputedStyle(surface).backdropFilter,
					paintFilter: paint.backdropFilter,
					pointerEvents: paint.pointerEvents,
					tintIsReadable: !supported || color.rgba.a >= 0.9 && Color.fromHex(foreground).getContrastRatio(color.makeOpaque(backdrop)) >= 4.5,
				};
			}), overlays.surfaces.map(() => ({
				filter: 'none',
				paintFilter: supported ? 'blur(12px)' : 'none',
				pointerEvents: supported ? 'none' : 'auto',
				tintIsReadable: true,
			})));
		});
	}

	test('updates the tint across overlays and shadow menus without fading content', async () => {
		const overlays = createOverlays();
		const contents = overlays.surfaces.map(surface => append(surface, 'test-content'));
		overlays.root.classList.add('modern-ui-frosted-glass');
		await Promise.all(overlays.surfaces.flatMap(surface => surface.getAnimations()).map(animation => animation.finished));
		const supported = supportsGlass(overlays.root);
		const percentages = [50, 75, 100];
		const actual = percentages.map(percentage => {
			overlays.root.style.setProperty('--modern-ui-glass-opacity', `${percentage}%`);
			return {
				tint: overlays.surfaces.map(surface => Math.round(readColor(surface, '::before').rgba.a * 100)),
				opacity: [...overlays.surfaces, ...contents].map(element => getWindow(element).getComputedStyle(element).opacity),
			};
		});
		assert.deepStrictEqual(actual, percentages.map(percentage => ({
			tint: overlays.surfaces.map(() => supported ? percentage : 0),
			opacity: [...overlays.surfaces, ...contents].map(() => '1'),
		})));
	});

	test('replaces all background layers together and restores the exact theme backgrounds', () => {
		const overlays = createOverlays();
		overlays.root.style.setProperty('--modern-ui-glass-opacity', '50%');
		const backgrounds = () => overlays.backgrounds.map(element => readColor(element).rgba);
		const original = backgrounds();
		overlays.root.classList.add('modern-ui-frosted-glass');
		const glass = backgrounds();
		overlays.root.classList.remove('modern-ui-frosted-glass');
		assert.deepStrictEqual({ glass, restored: backgrounds() }, {
			glass: supportsGlass(overlays.root) ? overlays.backgrounds.map(() => new RGBA(0, 0, 0, 0)) : original,
			restored: original,
		});
	});

	test('does not move fixed-position children when glass is enabled', () => {
		const overlays = createOverlays();
		const children = [overlays.quickInput, overlays.menuContainer, overlays.shadowMenuContainer, overlays.picker].map(container => {
			const fixed = append(container, 'fixed-child');
			fixed.style.cssText = 'position: fixed; top: 17px; left: 19px; width: 10px; height: 10px;';
			return fixed;
		});
		const positions = () => children.map(child => {
			const { top, left } = child.getBoundingClientRect();
			return [top, left];
		});
		const before = positions();
		overlays.root.classList.add('modern-ui-frosted-glass');
		assert.deepStrictEqual({ before, after: positions() }, {
			before: children.map(() => [17, 19]), after: children.map(() => [17, 19]),
		});
	});

	test('preserves solid sticky headings, embedded editor backgrounds, and menu selection', () => {
		const overlays = createOverlays();
		overlays.root.style.setProperty('--modern-ui-glass-opacity', '50%');
		const sticky = append(overlays.quickInput, 'monaco-tree-sticky-container');
		sticky.style.backgroundColor = 'var(--vscode-quickInput-background)';
		const editor = append(overlays.dialog, 'monaco-editor-background');
		editor.style.backgroundColor = 'var(--vscode-editor-background)';
		overlays.menu.focus(true);
		const selection = overlays.menuContainer.querySelector<HTMLElement>('.action-item.focused > .action-menu-item')!;
		const before = [sticky, editor, selection].map(element => readColor(element).rgba);
		overlays.root.classList.add('modern-ui-frosted-glass');
		assert.deepStrictEqual([sticky, editor, selection].map(element => readColor(element).rgba), before);
	});

	test('keeps rich quick widgets and animating toasts on their original backgrounds', () => {
		const overlays = createOverlays();
		overlays.quickInput.classList.add('quick-input-widget-overlay');
		overlays.toast.classList.replace('notification-fade-in-done', 'notification-fade-in');
		overlays.root.classList.add('modern-ui-frosted-glass');
		assert.deepStrictEqual([overlays.quickInput, overlays.toast].map(surface => ({
			color: readColor(surface).rgba,
			filter: getWindow(surface).getComputedStyle(surface, '::before').backdropFilter,
		})), [
			{ color: new RGBA(36, 36, 36, 1), filter: 'none' },
			{ color: new RGBA(36, 36, 36, 1), filter: 'none' },
		]);
	});

	test('paints motion-free toasts without waiting for a transition event', () => {
		const overlays = createOverlays();
		overlays.toast.classList.replace('notification-fade-in-done', 'notification-fade-in');
		overlays.root.classList.add('modern-ui-frosted-glass', 'monaco-reduce-motion');
		const supported = supportsGlass(overlays.root);
		assert.deepStrictEqual({
			filter: getWindow(overlays.toast).getComputedStyle(overlays.toast).backdropFilter,
			paintFilter: getWindow(overlays.toast).getComputedStyle(overlays.toast, '::before').backdropFilter,
			backgroundAlpha: readColor(overlays.toast).rgba.a,
		}, {
			filter: 'none',
			paintFilter: supported ? 'blur(12px)' : 'none',
			backgroundAlpha: supported ? 0 : 1,
		});
	});

	for (const themeClass of ['hc-black', 'hc-light']) {
		test(`retains every original background in ${themeClass}`, () => {
			const overlays = createOverlays();
			overlays.root.style.setProperty('--modern-ui-glass-opacity', '50%');
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

	test('updates the material when theme tokens change without changing text opacity', () => {
		const overlays = createOverlays();
		overlays.root.style.setProperty('--modern-ui-glass-opacity', '75%');
		overlays.root.classList.add('modern-ui-frosted-glass');
		overlays.root.style.setProperty('--vscode-quickInput-background', '#ffffff');
		const paint = readColor(overlays.quickInput, '::before');
		assert.deepStrictEqual({
			paint: supportsGlass(overlays.root) ? [paint.rgba.r, paint.rgba.g, paint.rgba.b, Math.round(paint.rgba.a * 100)] : undefined,
			opacity: getWindow(overlays.quickInput).getComputedStyle(overlays.quickInput).opacity,
		}, {
			paint: supportsGlass(overlays.root) ? [255, 255, 255, 75] : undefined,
			opacity: '1',
		});
	});
});
