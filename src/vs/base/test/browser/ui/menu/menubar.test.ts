/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow, ModifierKeyEmitter } from '../../../../browser/dom.js';
import { HorizontalDirection, unthemedMenuStyles, VerticalDirection } from '../../../../browser/ui/menu/menu.js';
import { MenuBar } from '../../../../browser/ui/menu/menubar.js';
import { mainWindow } from '../../../../browser/window.js';
import { toAction } from '../../../../common/actions.js';
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
	ensureNoDisposablesAreLeakedInTestSuite();
	const container = $('.container');

	const withMenuMenubar = (callback: (menubar: MenuBar) => void) => {
		const menubar = new MenuBar(container, {
			enableMnemonics: true,
			visibility: 'visible'
		}, unthemedMenuStyles);

		callback(menubar);

		menubar.dispose();
		ModifierKeyEmitter.disposeInstance();
	};

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

	suite('compact mode', () => {
		let compactContainer: HTMLElement;

		setup(() => {
			compactContainer = mainWindow.document.body.appendChild($('.compact-container'));
		});

		teardown(() => {
			compactContainer.remove();
			ModifierKeyEmitter.disposeInstance();
		});

		function createCompactMenubar(): MenuBar {
			return new MenuBar(compactContainer, {
				enableMnemonics: true,
				visibility: 'classic',
				compactMode: { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below },
				getCompactMenuActions: () => [toAction({ id: 'web.nav', label: 'Go Home', run: () => { } })]
			}, unthemedMenuStyles);
		}

		function nextAnimationFrame(): Promise<void> {
			return new Promise(resolve => getWindow(compactContainer).requestAnimationFrame(() => resolve()));
		}

		function dispatchKeyUp(target: HTMLElement): void {
			target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
		}

		function getItemLabels(menuElement: Element): string[] {
			const actionsContainer = menuElement.querySelector('.actions-container');
			return [...actionsContainer?.querySelectorAll(':scope > .action-item') ?? []].map(item => item.querySelector('.action-label')?.textContent?.trim() ?? '');
		}

		/**
		 * Opens the compact (overflow) menu, then the submenu with the given label,
		 * and returns the rendered top-level labels and submenu items.
		 */
		function readOverflowMenu(menubar: MenuBar, submenuLabel: string): { topLevel: string[]; submenu: { label: string; checked: string | null }[] } {
			const overflowButton = compactContainer.querySelector<HTMLElement>('.menubar-menu-button[aria-label="Application Menu"]');
			assert.ok(overflowButton);
			dispatchKeyUp(overflowButton);

			const overflowMenu = overflowButton.querySelector('.monaco-menu');
			assert.ok(overflowMenu);
			const submenuItem = [...overflowMenu.querySelectorAll<HTMLElement>('.action-item')].find(item => item.querySelector('.action-label')?.textContent?.trim() === submenuLabel);
			assert.ok(submenuItem);
			dispatchKeyUp(submenuItem);

			const submenu = submenuItem.querySelector('.monaco-submenu .monaco-menu');
			assert.ok(submenu);
			const result = {
				topLevel: getItemLabels(overflowMenu),
				submenu: [...submenu.querySelectorAll('.action-menu-item')].map(item => ({
					label: item.querySelector('.action-label')?.textContent?.trim() ?? '',
					checked: item.getAttribute('aria-checked')
				}))
			};

			menubar.blur();
			return result;
		}

		test('updateMenu refreshes menus already placed in the overflow menu (#160894)', async () => {
			const menubar = createCompactMenubar();
			try {
				menubar.push([
					{ label: '&File', actions: [toAction({ id: 'autoSave', label: 'Auto Save', checked: true, run: () => { } })] },
					{ label: '&Edit', actions: [toAction({ id: 'undo', label: 'Undo', run: () => { } })] }
				]);

				// Lay out first so the overflow menu captures the initial actions
				menubar.update();
				await nextAnimationFrame();

				const states: ReturnType<typeof readOverflowMenu>[] = [];
				for (const checked of [false, true]) {
					menubar.updateMenu({ label: '&File', actions: [toAction({ id: 'autoSave', label: 'Auto Save', checked, run: () => { } })] });
					states.push(readOverflowMenu(menubar, 'File'));
					states.push(readOverflowMenu(menubar, 'Edit'));
				}

				const topLevel = ['File', 'Edit', '', 'Go Home'];
				assert.deepStrictEqual(states, [
					{ topLevel, submenu: [{ label: 'Auto Save', checked: 'false' }] },
					{ topLevel, submenu: [{ label: 'Undo', checked: '' }] },
					{ topLevel, submenu: [{ label: 'Auto Save', checked: 'true' }] },
					{ topLevel, submenu: [{ label: 'Undo', checked: '' }] },
				]);
			} finally {
				menubar.dispose();
			}
		});
	});
});
