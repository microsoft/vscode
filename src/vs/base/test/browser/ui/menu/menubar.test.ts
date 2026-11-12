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
	const store = ensureNoDisposablesAreLeakedInTestSuite();
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
			const menubar = store.add(createCompactMenubar());
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
		});

		test('opens menus on whole device pixels from a fractional title position (#347796)', async () => {
			// Mirrors menubar.css, which unit tests do not load
			const style = compactContainer.appendChild($('style'));
			style.textContent = '.compact-container .menubar-menu-items-holder { position: fixed; }';
			compactContainer.style.position = 'fixed';
			// x.2 rounds toward the menu button when rounded to the nearest device pixel at DPR 1 or 2
			compactContainer.style.left = '10.2px';
			compactContainer.style.top = '20.7px';
			const dpr = getWindow(compactContainer).devicePixelRatio;
			const misalignment = (value: number) => Math.abs(value * dpr - Math.round(value * dpr));
			const result: Record<string, unknown> = {};
			for (const [name, horizontal] of [['expandsRight', HorizontalDirection.Right], ['expandsLeft', HorizontalDirection.Left]] as const) {
				const menubar = new MenuBar(compactContainer, {
					enableMnemonics: true,
					visibility: 'classic',
					compactMode: { horizontal, vertical: VerticalDirection.Below },
					getCompactMenuActions: () => [toAction({ id: 'web.nav', label: 'Go Home', run: () => { } })]
				}, unthemedMenuStyles);
				menubar.push([{ label: '&File', actions: [toAction({ id: 'undo', label: 'Undo', run: () => { } })] }]);
				menubar.update();
				await nextAnimationFrame();

				const overflowButton = compactContainer.querySelector<HTMLElement>('.menubar-menu-button[aria-label="Application Menu"]');
				assert.ok(overflowButton);
				dispatchKeyUp(overflowButton);
				const holder = overflowButton.querySelector<HTMLElement>('.menubar-menu-items-holder');
				assert.ok(holder);
				const rect = holder.getBoundingClientRect();
				const button = compactContainer.getBoundingClientRect();
				// Where the menubar placed the holder before alignment. Left-expanding menus use the integer innerWidth, which
				// at fractional DPRs can already overlap the title by less than a pixel; aligning must not move it further.
				const unaligned = horizontal === HorizontalDirection.Right
					? button.left + compactContainer.clientWidth
					: getWindow(holder).visualViewport!.width - getWindow(holder).innerWidth + button.left;
				result[name] = {
					aligned: misalignment(rect.left) <= dpr / 64 && misalignment(rect.top) <= dpr / 64,
					horizontalInset: holder.style.left.endsWith('px') ? 'left' : 'right',
					notMovedTowardTitle: horizontal === HorizontalDirection.Right ? rect.left >= unaligned - 0.01 : rect.right <= unaligned + 0.01
				};
				menubar.blur();
				menubar.dispose();
			}

			assert.deepStrictEqual(result, {
				expandsRight: { aligned: true, horizontalInset: 'left', notMovedTowardTitle: true },
				expandsLeft: { aligned: true, horizontalInset: 'right', notMovedTowardTitle: true }
			});
		});
	});
});
