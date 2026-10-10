/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, EventType, getWindow } from '../../../../browser/dom.js';
import { getMenuWidgetCSS, Menu, unthemedMenuStyles } from '../../../../browser/ui/menu/menu.js';
import { Action, SubmenuAction } from '../../../../common/actions.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Menu', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		sinon.restore();
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
