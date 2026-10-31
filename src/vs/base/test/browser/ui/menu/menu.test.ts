/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, EventType, getWindow, ModifierKeyEmitter } from '../../../../browser/dom.js';
import { getMenuWidgetCSS, Menu, unthemedMenuStyles } from '../../../../browser/ui/menu/menu.js';
import { Action, ActionRunner, SubmenuAction, toAction } from '../../../../common/actions.js';
import { EventType as TouchEventType } from '../../../../browser/touch.js';
import { DisposableStore, toDisposable } from '../../../../common/lifecycle.js';
import { isLinux, isWindows } from '../../../../common/platform.js';
import { ResolvedKeybinding } from '../../../../common/keybindings.js';
import { upcastPartial } from '../../../common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Menu', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
		ModifierKeyEmitter.getInstance().resetKeyStatus();
	});

	for (const submenu of [false, true]) {
		for (const keyboard of [false, true]) {
			test(`selects alternatives at ${keyboard ? 'keyboard' : 'mouse'} activation time in a ${submenu ? 'submenu' : 'menu'}`, async () => {
				const clock = sinon.useFakeTimers();
				const host = append(document.body, $('div'));
				disposables.add(toDisposable(() => host.remove()));
				const context = { source: 'test' };
				const runs: unknown[] = [];
				const runner = disposables.add(new ActionRunner());
				disposables.add(runner.onWillRun(e => runs.push(e.action.id)));
				const alternative = toAction({ id: 'alternative', label: 'Alternative', run: (value: unknown) => runs.push(value) });
				const action = toAction({ id: 'primary', label: 'Primary', alt: alternative, run: (value: unknown) => runs.push(value) });
				const menu = disposables.add(new Menu(host, submenu ? [new SubmenuAction('submenu', 'Submenu', [action])] : [action], {
					context, actionRunner: runner
				}, unthemedMenuStyles));
				menu.focus(true);
				if (submenu) {
					menu.trigger(0);
				}
				await clock.tickAsync(100);
				const item = host.querySelector<HTMLElement>(submenu ? '.monaco-submenu .action-item' : '.action-item')!;

				for (const modifiers of [{}, { altKey: true }, { shiftKey: true }, { altKey: true, shiftKey: true }, {}]) {
					if (keyboard) {
						item.dispatchEvent(new KeyboardEvent(EventType.KEY_DOWN, { key: 'Enter', keyCode: 13, ...modifiers, bubbles: true }));
						item.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'Enter', keyCode: 13, ...modifiers, bubbles: true }));
					} else {
						item.dispatchEvent(new MouseEvent(EventType.MOUSE_UP, { ...modifiers, bubbles: true }));
					}
					await clock.tickAsync(1);
				}
				const shiftRuns = isWindows || isLinux ? ['alternative', context] : keyboard ? [] : ['primary', context];
				assert.deepStrictEqual(runs, ['primary', context, 'alternative', context, ...shiftRuns, 'alternative', context, 'primary', context]);
			});
		}
	}

	for (const modifier of ['Alt', 'Shift'] as const) {
		for (const submenu of [false, true]) {
			test(`${modifier} updates menu labels, mnemonics and state without hover in a ${submenu ? 'submenu' : 'menu'}`, () => {
				const window = getWindow(document.body);
				const modifiers = ModifierKeyEmitter.getInstance();
				modifiers.resetKeyStatus();
				const press = () => window.dispatchEvent(new KeyboardEvent('keydown', {
					key: modifier, keyCode: modifier === 'Alt' ? 18 : 16, altKey: modifier === 'Alt', shiftKey: modifier === 'Shift'
				}));
				const release = () => window.dispatchEvent(new KeyboardEvent('keyup', { key: modifier, keyCode: modifier === 'Alt' ? 18 : 16 }));
				const runs: string[] = [];
				const action = toAction({
					id: 'primary', label: '&Primary', class: 'primary-icon', checked: true, run: () => runs.push('primary'),
					alt: toAction({ id: 'alternative', label: '&Alternative', class: 'alternative-icon', run: () => runs.push('alternative') })
				});
				press();
				const host = append(document.body, $('div'));
				disposables.add(toDisposable(() => host.remove()));
				const menu = disposables.add(new Menu(host, submenu ? [new SubmenuAction('submenu', 'Submenu', [action, action])] : [action, action], {
					enableMnemonics: true,
					getKeyBinding: action => upcastPartial<ResolvedKeybinding>({ getLabel: () => `${action.id}-key` })
				}, unthemedMenuStyles));
				menu.focus(true);
				if (submenu) {
					menu.trigger(0);
				}
				const selector = submenu ? '.monaco-submenu .action-menu-item' : '.action-menu-item';
				const readItems = () => Array.from(host.querySelectorAll<HTMLElement>(selector), item => ({
					label: item.querySelector('.action-label')?.textContent,
					ariaLabel: item.querySelector('.action-label')?.getAttribute('aria-label'),
					mnemonic: item.getAttribute('aria-keyshortcuts'),
					keybinding: item.querySelector('.keybinding')?.textContent,
					role: item.getAttribute('role'),
					checked: item.getAttribute('aria-checked'),
					icons: Array.from(item.querySelector('.action-label')!.classList)
				}));
				const states = [readItems()];
				release();
				states.push(readItems());
				press();
				states.push(readItems());
				const useAlternative = modifier === 'Alt' || isWindows || isLinux;
				const primary = { label: 'Primary', ariaLabel: 'Primary', mnemonic: 'p', keybinding: 'primary-key', role: 'menuitemcheckbox', checked: 'true', icons: ['action-label'] };
				const alternative = { label: 'Alternative', ariaLabel: 'Alternative', mnemonic: 'a', keybinding: 'alternative-key', role: 'menuitem', checked: '', icons: ['action-label'] };
				const selected = useAlternative ? alternative : primary;
				assert.deepStrictEqual(states, [[selected, selected], [primary, primary], [selected, selected]]);

				const item = host.querySelector<HTMLElement>(selector)!;
				item.dispatchEvent(new KeyboardEvent('keydown', { key: useAlternative ? 'a' : 'p', bubbles: true }));
				item.dispatchEvent(new KeyboardEvent('keydown', { key: useAlternative ? 'a' : 'p', bubbles: true }));
				const mnemonicFocus = document.activeElement === host.querySelectorAll(selector)[1];
				item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, altKey: modifier === 'Alt', shiftKey: useAlternative && modifier === 'Shift', bubbles: true }));
				assert.deepStrictEqual({ runs, mnemonicFocus }, { runs: [useAlternative ? 'alternative' : 'primary'], mnemonicFocus: true });
			});
		}
	}

	test('disabled alternatives fall back to the primary action', async () => {
		const clock = sinon.useFakeTimers();
		const host = append(document.body, $('div'));
		disposables.add(toDisposable(() => host.remove()));
		const runs: string[] = [];
		const action = toAction({
			id: 'primary', label: 'Primary', run: () => runs.push('primary'),
			alt: toAction({ id: 'alternative', label: 'Alternative', enabled: false, run: () => runs.push('alternative') })
		});
		disposables.add(new Menu(host, [action], {}, unthemedMenuStyles));
		await clock.tickAsync(100);
		host.querySelector<HTMLElement>('.action-item')!.dispatchEvent(new MouseEvent(EventType.MOUSE_UP, { altKey: true, bubbles: true }));
		await clock.tickAsync(1);
		assert.deepStrictEqual(runs, ['primary']);
	});

	// A menu positioned under a resting pointer can receive synthetic pointer events,
	// so hover must react only when the pointer coordinates actually change.
	test('stationary mouse does not change focus (#110594, #148158)', () => {
		const host = append(document.body, $('div'));
		disposables.add(toDisposable(() => host.remove()));
		const menu = disposables.add(new Menu(host, [
			disposables.add(new Action('first', 'First')),
			disposables.add(new Action('second', 'Second'))
		], {}, unthemedMenuStyles));
		const actionItems = Array.from(host.querySelectorAll<HTMLElement>('.action-item'));
		const getFocusedActions = () => actionItems.map((_, index) => menu.isFocused(index));

		menu.focus(true);
		const focusStates = [getFocusedActions()];

		actionItems[1].dispatchEvent(new MouseEvent(EventType.MOUSE_OVER, { bubbles: true }));
		focusStates.push(getFocusedActions());

		actionItems[1].dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true }));
		focusStates.push(getFocusedActions());

		actionItems[1].dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true, movementX: 1 }));
		focusStates.push(getFocusedActions());

		actionItems[1].dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true, movementX: 1 }));
		focusStates.push(getFocusedActions());

		actionItems[0].dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true, movementX: -1 }));
		focusStates.push(getFocusedActions());

		assert.deepStrictEqual(focusStates, [
			[true, false],
			[true, false],
			[true, false],
			[false, true],
			[false, true],
			[true, false]
		]);
	});

	test('stationary mouse does not open submenu (#110594, #148158)', () => {
		const clock = sinon.useFakeTimers();
		const host = append(document.body, $('div'));
		disposables.add(toDisposable(() => host.remove()));
		const submenu = new SubmenuAction('submenu', 'Submenu', [
			disposables.add(new Action('child', 'Child'))
		]);
		disposables.add(new Menu(host, [submenu], {}, unthemedMenuStyles));
		const submenuAction = host.querySelector<HTMLElement>('.action-item')!;
		const submenuItem = submenuAction.querySelector<HTMLElement>('.action-menu-item')!;

		submenuAction.dispatchEvent(new MouseEvent(EventType.MOUSE_OVER, { bubbles: true }));
		clock.tick(250);
		const expandedAfterMouseOver = submenuItem.getAttribute('aria-expanded');

		submenuAction.dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true }));
		clock.tick(250);
		const expandedAfterStationaryMouseMove = submenuItem.getAttribute('aria-expanded');

		submenuAction.dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true, movementY: 1 }));
		clock.tick(250);

		assert.deepStrictEqual({
			expandedAfterMouseOver,
			expandedAfterStationaryMouseMove,
			expandedAfterMouseMove: submenuItem.getAttribute('aria-expanded')
		}, {
			expandedAfterMouseOver: 'false',
			expandedAfterStationaryMouseMove: 'false',
			expandedAfterMouseMove: 'true'
		});
	});

	suite('touch drag in a submenu (#331838)', () => {
		async function setup() {
			const clock = sinon.useFakeTimers();
			disposables.add(toDisposable(() => clock.restore()));
			const host = append(document.body, $('div'));
			host.style.position = 'absolute';
			host.style.top = `${getWindow(host).innerHeight - 120}px`;
			disposables.add(toDisposable(() => host.remove()));
			const child = toAction({ id: 'child', label: 'Child', run: () => { } });
			const items = [
				...Array.from({ length: 12 }, (_, i) => toAction({ id: `item${i}`, label: `Item ${i}`, run: () => { } })),
				new SubmenuAction('submenu', 'Submenu', [child, toAction({ id: 'child2', label: 'Child 2', run: () => { } })])
			];
			const menu = disposables.add(new Menu(host, items, {}, unthemedMenuStyles));
			const scrolls: { scrollTopChanged: boolean; scrollLeftChanged: boolean }[] = [];
			disposables.add(menu.onScroll(e => scrolls.push({ scrollTopChanged: e.scrollTopChanged, scrollLeftChanged: e.scrollLeftChanged })));
			const parentElement = host.querySelector<HTMLElement>('.monaco-menu')!;
			const submenuItem = host.querySelectorAll<HTMLElement>('.action-menu-item')[12];
			// Clamp the parent to its bottom before opening the submenu so scroll state is deterministic across engines.
			drag(parentElement, -1000);
			menu.focus(13);
			menu.trigger(12);
			await clock.tickAsync(100);
			return { host, menu, scrolls, submenuItem, parentElement, clock };
		}

		function drag(target: HTMLElement, translationY: number) {
			// Synthetic changes exercise the menu handler directly, not the browser's Gesture routing.
			const event = new Event(TouchEventType.Change, { bubbles: true, cancelable: true }) as Event & { translationY: number; translationX: number };
			event.translationX = 0;
			event.translationY = translationY;
			target.dispatchEvent(event);
		}

		function snapshot(host: HTMLElement, submenuItem: HTMLElement, scrolls: unknown[]) {
			return {
				expanded: submenuItem.getAttribute('aria-expanded'),
				parentFocused: host.querySelector('.monaco-menu')!.contains(host.ownerDocument.activeElement) && !host.querySelector('.monaco-submenu')?.contains(host.ownerDocument.activeElement),
				scrolls
			};
		}

		test('touch drag that does not change the parent scroll position keeps the submenu open', async () => {
			const { host, scrolls, submenuItem, parentElement } = await setup();
			scrolls.length = 0;
			// The parent is already scrolled to the bottom, so this drag is clamped and only re-lays out the submenu.
			drag(parentElement, -30);
			assert.deepStrictEqual(snapshot(host, submenuItem, scrolls), {
				expanded: 'true',
				parentFocused: false,
				scrolls: [{ scrollTopChanged: false, scrollLeftChanged: false }]
			});
		});

		test('touch drag that scrolls the parent dismisses the submenu', async () => {
			const { host, scrolls, submenuItem, parentElement, clock } = await setup();
			scrolls.length = 0;
			drag(parentElement, 30);
			await clock.tickAsync(500);
			// The number of scroll events differs between engines, so only record whether the parent scrolled vertically.
			assert.deepStrictEqual({ ...snapshot(host, submenuItem, []), scrolledVertically: scrolls.length > 0 && scrolls.every(e => e.scrollTopChanged && !e.scrollLeftChanged) }, {
				expanded: 'false',
				parentFocused: true,
				scrolls: [],
				scrolledVertically: true
			});
		});
	});

	for (const { name, classes } of [
		{ name: 'standard menus', classes: [] },
		{ name: 'frosted glass motion', classes: ['modern-ui-frosted-glass', 'monaco-enable-motion'] },
		{ name: 'reduced motion', classes: ['modern-ui-frosted-glass', 'monaco-reduce-motion'] },
		{ name: 'high contrast', classes: ['modern-ui-frosted-glass', 'monaco-enable-motion', 'hc-black'] },
	]) {
		for (const shadowDom of [false, true]) {
			test(`submenus open without animation with ${name} in ${shadowDom ? 'shadow' : 'regular'} DOM`, () => {
				const host = append(document.body, $('.monaco-workbench'));
				host.classList.add(...classes);
				disposables.add(toDisposable(() => host.remove()));
				const root = (shadowDom ? host.attachShadow({ mode: 'open' }) : host).appendChild($('.context-view'));
				const child = disposables.add(new Action('child', 'Child'));
				const nested = new SubmenuAction('nested', 'Nested', [child]);
				const submenu = new SubmenuAction('submenu', 'Submenu', [nested]);
				disposables.add(new Menu(root, [submenu], {}, unthemedMenuStyles));
				const window = getWindow(host);
				const motion = (container: HTMLElement) => ({
					container: window.getComputedStyle(container).animationName,
					content: window.getComputedStyle(container.querySelector<HTMLElement>(':scope > .monaco-scrollable-element')!).animationName,
					backdrop: window.getComputedStyle(container, '::before').animationName,
				});
				const rootMotion = motion(root);

				root.querySelector<HTMLElement>('.monaco-submenu-item')!.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'ArrowRight', keyCode: 39, bubbles: true }));
				const first = root.querySelector<HTMLElement>('.monaco-submenu')!;
				first.querySelector<HTMLElement>('.monaco-submenu-item')!.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'ArrowRight', keyCode: 39, bubbles: true }));
				const second = first.querySelector<HTMLElement>('.monaco-submenu')!;
				const noMotion = { container: 'none', content: 'none', backdrop: 'none' };

				assert.deepStrictEqual({
					rootMotion: motion(root),
					submenus: [motion(first), motion(second)],
					activeAnimations: first.getAnimations({ subtree: true }).length,
				}, {
					rootMotion,
					submenus: [noMotion, noMotion],
					activeAnimations: 0,
				});
			});
		}
	}

	suite('window controls overlay (#165454)', () => {
		interface IOpenOptions {
			readonly overlay: DOMRect | undefined;
			readonly left: number;
			readonly top: number;
			readonly nested?: boolean;
			readonly childCount?: number;
		}

		/**
		 * Opens a submenu (and optionally a nested submenu) and returns the
		 * client rects of every opened submenu level, outermost first.
		 */
		const openSubmenus = ({ overlay, left, top, nested, childCount = 2 }: IOpenOptions) => {
			const host = append(document.body, $('div'));
			host.style.position = 'fixed';
			host.style.top = `${top}px`;
			host.style.left = `${left}px`;
			const store = disposables.add(new DisposableStore());
			store.add(toDisposable(() => host.remove()));
			const root = append(host, $('.context-view'));
			const children = Array.from({ length: childCount }, (_, i) => store.add(new Action(`child${i}`, `Child ${i}`)));
			const leaf = new SubmenuAction('nested', 'Nested', children);
			const submenu = new SubmenuAction('submenu', 'Submenu', nested ? [leaf] : children);
			store.add(new Menu(root, [submenu], { getWindowControlsOverlayRect: () => overlay }, unthemedMenuStyles));
			const open = (parent: HTMLElement) => {
				parent.querySelector<HTMLElement>('.monaco-submenu-item')!.dispatchEvent(new KeyboardEvent(EventType.KEY_UP, { key: 'ArrowRight', keyCode: 39, bubbles: true }));
				return parent.querySelector<HTMLElement>('.monaco-submenu')!;
			};
			const containers = [open(root)];
			if (nested) {
				containers.push(open(containers[0]));
			}
			const rects = containers.map(container => container.getBoundingClientRect());
			store.dispose();
			return rects;
		};

		const openSubmenu = (options: IOpenOptions) => openSubmenus(options).at(-1)!;

		const window = getWindow(document.body);
		const overlay = () => new DOMRect(80, 0, window.innerWidth - 200, 30);

		/**
		 * An overlay whose left or right window-control strip covers the given
		 * unadjusted submenu box, so that the box genuinely needs to move.
		 */
		const overlayCovering = (box: DOMRect, side: 'left' | 'right') => {
			const x = side === 'left' ? box.right + 10 : 40;
			const right = side === 'left' ? window.innerWidth - 40 : box.left - 10;
			return new DOMRect(x, 0, right - x, 30);
		};

		const intersects = (box: DOMRect, left: number, right: number, bottom: number) =>
			right > left && box.left < right && box.right > left && box.top < bottom && box.bottom > 0;

		const describe = (box: DOMRect, wco: DOMRect) => ({
			clearOfLeftButtons: !intersects(box, 0, wco.x, wco.height),
			clearOfRightButtons: !intersects(box, wco.x + wco.width, window.innerWidth, wco.height),
			inViewport: box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight,
			hasSize: box.width > 0 && box.height > 0,
		});

		const clear = { clearOfLeftButtons: true, clearOfRightButtons: true, inViewport: true, hasSize: true };

		for (const { side, position } of [
			{ side: 'left', position: () => ({ left: 0, top: 0 }) },
			{ side: 'right', position: () => ({ left: window.innerWidth - 150, top: 0 }) },
		] as const) {
			test(`submenus at the ${side} corner move clear of the buttons`, () => {
				const without = openSubmenu({ overlay: undefined, ...position() });
				const wco = overlayCovering(without, side);
				const withOverlay = openSubmenu({ overlay: wco, ...position() });
				assert.deepStrictEqual({
					withoutOverlay: describe(without, wco),
					withOverlay: describe(withOverlay, wco),
					movedDown: withOverlay.top >= wco.height,
					left: withOverlay.left,
				}, {
					withoutOverlay: { ...clear, [side === 'left' ? 'clearOfLeftButtons' : 'clearOfRightButtons']: false },
					withOverlay: clear,
					movedDown: true,
					left: without.left,
				});
			});
		}

		test('tall submenus placed upward into the titlebar band move clear of the buttons', () => {
			// A tall submenu opened near the bottom of the window does not fit below its
			// entry, so the layout places it upward near the top of the window. The band
			// is sized from that unadjusted placement so the submenu genuinely starts
			// inside it and overlaps the left buttons.
			const position = { left: 0, top: window.innerHeight - 40 };
			const childCount = 200;
			const without = openSubmenu({ overlay: undefined, ...position, childCount });
			const covering = overlayCovering(without, 'left');
			const wco = new DOMRect(covering.x, 0, covering.width, Math.max(without.top, 0) + 10);
			const withOverlay = openSubmenu({ overlay: wco, ...position, childCount });
			assert.deepStrictEqual({
				startsInBand: without.top < wco.height && without.bottom > wco.height,
				withoutOverlay: describe(without, wco),
				withOverlay: describe(withOverlay, wco),
			}, {
				startsInBand: true,
				withoutOverlay: { ...clear, clearOfLeftButtons: false },
				withOverlay: clear,
			});
		});

		test('submenus already clear of the buttons are not moved', () => {
			const wco = overlay();
			const position = { left: 200, top: 100 };
			const without = openSubmenu({ overlay: undefined, ...position });
			const withOverlay = openSubmenu({ overlay: wco, ...position });
			assert.deepStrictEqual({
				withOverlay: describe(withOverlay, wco),
				position: [withOverlay.left, withOverlay.top],
			}, {
				withOverlay: clear,
				position: [without.left, without.top],
			});
		});

		test('nested submenus inherit the overlay option', () => {
			// The first-level submenu sits in the usable titlebar area, clear of both
			// strips, while the nested submenu expands into the right strip. Only
			// overlay handling at the nested level can move the nested submenu.
			const [parent, nested] = openSubmenus({ overlay: undefined, left: 0, top: 0, nested: true });
			const x = parent.left - 10;
			const wco = new DOMRect(x, 0, nested.left + 10 - x, 30);
			const [parentWithOverlay, nestedWithOverlay] = openSubmenus({ overlay: wco, left: 0, top: 0, nested: true });
			assert.deepStrictEqual({
				parent: describe(parent, wco),
				parentPosition: [parentWithOverlay.left, parentWithOverlay.top],
				nestedWithoutOverlay: describe(nested, wco),
				nestedWithOverlay: describe(nestedWithOverlay, wco),
			}, {
				parent: clear,
				parentPosition: [parent.left, parent.top],
				nestedWithoutOverlay: { ...clear, clearOfRightButtons: false },
				nestedWithOverlay: clear,
			});
		});
	});

	test('high contrast selection outline does not apply to nested submenu items (#327543)', () => {
		const host = append(document.body, $('div'));
		disposables.add(toDisposable(() => host.remove()));
		const shadowRoot = host.attachShadow({ mode: 'open' });

		const style = shadowRoot.appendChild($('style'));
		style.textContent = getMenuWidgetCSS(unthemedMenuStyles, true);

		const themeRoot = shadowRoot.appendChild($('.hc-black'));
		themeRoot.style.setProperty('--vscode-menu-selectionBorder', 'yellow');
		const actionBar = append(append(themeRoot, $('.monaco-menu')), $('.monaco-action-bar.vertical'));
		const focusedAction = append(actionBar, $('.action-item.focused'));
		const focusedMenuItem = append(focusedAction, $('a.action-menu-item'));

		const submenuActionBar = append(append(append(focusedAction, $('.monaco-submenu')), $('.monaco-menu')), $('.monaco-action-bar.vertical'));
		const nestedMenuItem = append(append(submenuActionBar, $('.action-item')), $('a.action-menu-item'));

		const window = getWindow(host);
		assert.deepStrictEqual({
			focused: window.getComputedStyle(focusedMenuItem).outlineStyle,
			nested: window.getComputedStyle(nestedMenuItem).outlineStyle,
		}, {
			focused: 'solid',
			nested: 'none',
		});
	});
});
