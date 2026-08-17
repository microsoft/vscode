/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, EventType, ModifierKeyEmitter } from '../../../../browser/dom.js';
import { HorizontalDirection, unthemedMenuStyles, VerticalDirection } from '../../../../browser/ui/menu/menu.js';
import { MenuBar } from '../../../../browser/ui/menu/menubar.js';
import { Action, IAction, SubmenuAction } from '../../../../common/actions.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

function getButtonElementByAriaLabel(menubarElement: HTMLElement, ariaLabel: string): HTMLElement | null {
	let i;
	for (i = 0; i < menubarElement.childElementCount; i++) {

		if (menubarElement.children[i].getAttribute('aria-label') === ariaLabel) {
			return menubarElement.children[i] as HTMLElement;
		}
	}

	return null;
}

function getTitleDivFromButtonDiv(menuButtonElement: HTMLElement): HTMLElement | null {
	let i;
	for (i = 0; i < menuButtonElement.childElementCount; i++) {
		if (menuButtonElement.children[i].classList.contains('menubar-menu-title')) {
			return menuButtonElement.children[i] as HTMLElement;
		}
	}

	return null;
}

function getMnemonicFromTitleDiv(menuTitleDiv: HTMLElement): string | null {
	let i;
	for (i = 0; i < menuTitleDiv.childElementCount; i++) {
		if (menuTitleDiv.children[i].tagName.toLocaleLowerCase() === 'mnemonic') {
			return menuTitleDiv.children[i].textContent;
		}
	}

	return null;
}

function validateMenuBarItem(menubar: MenuBar, menubarContainer: HTMLElement, label: string, readableLabel: string, mnemonic: string) {
	menubar.push([
		{
			actions: [],
			label: label
		}
	]);

	const buttonElement = getButtonElementByAriaLabel(menubarContainer, readableLabel);
	assert(buttonElement !== null, `Button element not found for ${readableLabel} button.`);

	const titleDiv = getTitleDivFromButtonDiv(buttonElement);
	assert(titleDiv !== null, `Title div not found for ${readableLabel} button.`);

	const mnem = getMnemonicFromTitleDiv(titleDiv);
	assert.strictEqual(mnem, mnemonic, 'Mnemonic not correct');
}

suite('Menubar', () => {
	let container: HTMLElement;

	teardown(() => {
		ModifierKeyEmitter.disposeInstance();
		sinon.restore();
	});

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const withMenuMenubar = (callback: (menubar: MenuBar) => void) => {
		const menubar = new MenuBar(container, {
			enableMnemonics: true,
			visibility: 'visible'
		}, unthemedMenuStyles);

		callback(menubar);

		menubar.dispose();
	};

	function createCompactMenubar(actions: IAction[], getCompactMenuActions?: () => IAction[]): MenuBar {
		const menubar = disposables.add(new MenuBar(container, {
			enableMnemonics: true,
			visibility: 'compact',
			compactMode: {
				horizontal: HorizontalDirection.Right,
				vertical: VerticalDirection.Below
			},
			getCompactMenuActions
		}, unthemedMenuStyles));
		menubar.push({ label: '&View', actions });
		menubar.update();

		return menubar;
	}

	function dispatchKeyboardEvent(element: HTMLElement, type: string, keyCode: number): void {
		const event = new KeyboardEvent(type, { bubbles: true });
		Object.defineProperty(event, 'keyCode', { get: () => keyCode });
		element.dispatchEvent(event);
	}

	function openSubmenuWithPointer(actionItem: HTMLElement, clock: sinon.SinonFakeTimers): void {
		actionItem.dispatchEvent(new MouseEvent(EventType.MOUSE_MOVE, { bubbles: true, movementX: 1 }));
		clock.tick(250);
	}

	setup(() => {
		container = append(document.body, $('.container'));
		disposables.add(toDisposable(() => container.remove()));
	});

	test('English File menu renders mnemonics', function () {
		withMenuMenubar(menubar => {
			validateMenuBarItem(menubar, container, '&File', 'File', 'F');
		});
	});

	test('Russian File menu renders mnemonics', function () {
		withMenuMenubar(menubar => {
			validateMenuBarItem(menubar, container, '&Файл', 'Файл', 'Ф');
		});
	});

	test('Chinese File menu renders mnemonics', function () {
		withMenuMenubar(menubar => {
			validateMenuBarItem(menubar, container, '文件(&F)', '文件', 'F');
		});
	});

	test('compact menu uses updated action state on first open (#273020)', () => {
		const clock = sinon.useFakeTimers();
		const initialAction = disposables.add(new Action('wordWrap', 'Word Wrap', undefined, true));
		initialAction.checked = false;
		const callerActions = [initialAction];
		const menubar = createCompactMenubar(callerActions);
		clock.tick(20);

		const updatedAction = disposables.add(new Action('wordWrap', 'Word Wrap', undefined, false));
		updatedAction.checked = true;
		menubar.updateMenu({ label: '&View', actions: [updatedAction] });

		const applicationMenuButton = getButtonElementByAriaLabel(container, 'Application Menu')!;
		applicationMenuButton.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
		openSubmenuWithPointer(container.querySelector<HTMLElement>('.action-item')!, clock);

		const wordWrapItem = container.querySelector<HTMLElement>('.monaco-submenu .action-menu-item')!;
		assert.deepStrictEqual({
			role: wordWrapItem.getAttribute('role'),
			checked: wordWrapItem.getAttribute('aria-checked'),
			disabled: wordWrapItem.getAttribute('aria-disabled'),
			callerActionsUnchanged: callerActions.length === 1 && callerActions[0] === initialAction
		}, {
			role: 'menuitemcheckbox',
			checked: 'true',
			disabled: 'true',
			callerActionsUnchanged: true
		});
	});

	test('compact menu uses updated extra action state on first open', () => {
		const clock = sinon.useFakeTimers();
		const staleAction = disposables.add(new Action('back', 'Back', undefined, false));
		let compactMenuActions: IAction[] = [staleAction];
		const menubar = createCompactMenubar([], () => compactMenuActions);
		clock.tick(20);

		const updatedAction = disposables.add(new Action('back', 'Back', undefined, true));
		updatedAction.checked = true;
		compactMenuActions = [updatedAction];
		menubar.updateMenu({ label: '&View', actions: [] });

		const applicationMenuButton = getButtonElementByAriaLabel(container, 'Application Menu')!;
		applicationMenuButton.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));

		const backLabel = container.querySelector<HTMLElement>('.action-label[aria-label="Back"]')!;
		const backItem = backLabel.closest<HTMLElement>('.action-menu-item')!;
		assert.deepStrictEqual({
			role: backItem.getAttribute('role'),
			checked: backItem.getAttribute('aria-checked'),
			disabled: backItem.getAttribute('aria-disabled')
		}, {
			role: 'menuitemcheckbox',
			checked: 'true',
			disabled: null
		});
	});

	test('non-compact overflow uses updated action state on first open', () => {
		const clock = sinon.useFakeTimers();
		const staleAction = disposables.add(new Action('wordWrap', 'Word Wrap', undefined, true));
		staleAction.checked = false;
		const menubar = disposables.add(new MenuBar(container, {
			enableMnemonics: true,
			visibility: 'visible'
		}, unthemedMenuStyles));
		menubar.push([
			{ label: '&File', actions: [] },
			{ label: '&View', actions: [staleAction] }
		]);

		Object.defineProperty(container, 'offsetWidth', { get: () => 10 });
		Object.defineProperty(getButtonElementByAriaLabel(container, 'File')!, 'offsetWidth', { get: () => 20 });
		Object.defineProperty(getButtonElementByAriaLabel(container, 'View')!, 'offsetWidth', { get: () => 20 });
		menubar.update();
		clock.tick(20);

		const updatedAction = disposables.add(new Action('wordWrap', 'Word Wrap', undefined, false));
		updatedAction.checked = true;
		menubar.updateMenu({ label: '&View', actions: [updatedAction] });

		const moreButton = getButtonElementByAriaLabel(container, 'More')!;
		moreButton.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
		const viewLabel = container.querySelector<HTMLElement>('.action-label[aria-label="View"]')!;
		openSubmenuWithPointer(viewLabel.closest<HTMLElement>('.action-item')!, clock);

		const wordWrapItem = container.querySelector<HTMLElement>('.monaco-submenu .action-menu-item')!;
		assert.deepStrictEqual({
			role: wordWrapItem.getAttribute('role'),
			checked: wordWrapItem.getAttribute('aria-checked'),
			disabled: wordWrapItem.getAttribute('aria-disabled')
		}, {
			role: 'menuitemcheckbox',
			checked: 'true',
			disabled: 'true'
		});
	});

	test('compact menu dismisses updated nested leaf action with pointer', () => {
		const clock = sinon.useFakeTimers();
		let runCount = 0;
		const staleMinimapAction = disposables.add(new Action('minimap', 'Minimap', undefined, false));
		const menubar = createCompactMenubar([
			new SubmenuAction('appearance', 'Appearance', [staleMinimapAction])
		]);
		clock.tick(20);

		const minimapAction = disposables.add(new Action('minimap', 'Minimap', undefined, true, () => runCount++));
		menubar.updateMenu({ label: '&View', actions: [
			new SubmenuAction('appearance', 'Appearance', [minimapAction])
		] });

		const applicationMenuButton = getButtonElementByAriaLabel(container, 'Application Menu')!;
		applicationMenuButton.dispatchEvent(new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
		openSubmenuWithPointer(container.querySelector<HTMLElement>('.action-item')!, clock);
		openSubmenuWithPointer(container.querySelector<HTMLElement>('.monaco-submenu .action-item')!, clock);
		clock.tick(100);

		const minimapItem = container.querySelector<HTMLElement>('.monaco-submenu .monaco-submenu .action-item')!;
		minimapItem.dispatchEvent(new MouseEvent(EventType.MOUSE_UP, { bubbles: true, button: 0 }));
		clock.tick(0);

		assert.deepStrictEqual({
			runCount,
			menuVisible: !!container.querySelector('.menubar-menu-items-holder')
		}, {
			runCount: 1,
			menuVisible: false
		});
	});

	test('compact menu dismisses nested leaf action with keyboard and restores focus', () => {
		const clock = sinon.useFakeTimers();
		let runCount = 0;
		const staleMinimapAction = disposables.add(new Action('minimap', 'Minimap', undefined, false));
		const menubar = createCompactMenubar([
			new SubmenuAction('appearance', 'Appearance', [staleMinimapAction])
		]);
		clock.tick(20);

		const minimapAction = disposables.add(new Action('minimap', 'Minimap', undefined, true, () => runCount++));
		menubar.updateMenu({ label: '&View', actions: [
			new SubmenuAction('appearance', 'Appearance', [minimapAction])
		] });

		const focusTarget = append(document.body, $('button'));
		disposables.add(toDisposable(() => focusTarget.remove()));
		focusTarget.focus();
		menubar.toggleFocus();

		const applicationMenuButton = getButtonElementByAriaLabel(container, 'Application Menu')!;
		applicationMenuButton.dispatchEvent(new FocusEvent(EventType.FOCUS_IN, { bubbles: true, relatedTarget: focusTarget }));
		dispatchKeyboardEvent(applicationMenuButton, EventType.KEY_UP, 13);
		dispatchKeyboardEvent(document.activeElement as HTMLElement, EventType.KEY_UP, 13);
		dispatchKeyboardEvent(document.activeElement as HTMLElement, EventType.KEY_UP, 13);
		dispatchKeyboardEvent(document.activeElement as HTMLElement, EventType.KEY_DOWN, 13);

		assert.deepStrictEqual({
			runCount,
			menuVisible: !!container.querySelector('.menubar-menu-items-holder'),
			activeElement: document.activeElement
		}, {
			runCount: 1,
			menuVisible: false,
			activeElement: focusTarget
		});
	});
});
