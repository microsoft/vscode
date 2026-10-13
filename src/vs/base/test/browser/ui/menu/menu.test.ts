/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, EventType, getWindow, ModifierKeyEmitter } from '../../../../browser/dom.js';
import { getMenuWidgetCSS, Menu, unthemedMenuStyles } from '../../../../browser/ui/menu/menu.js';
import { Action, ActionRunner, SubmenuAction, toAction } from '../../../../common/actions.js';
import { toDisposable } from '../../../../common/lifecycle.js';
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
