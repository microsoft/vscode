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

	test('opens title bar menus below the title on whole device pixels, including when counter-zoomed (#347796)', async () => {
		const result: Record<string, unknown> = {};
		for (const [name, titleZoom] of [['plain', 1], ['counterZoomed', 1 / 1.25]] as const) {
			const titlebar = mainWindow.document.body.appendChild($('.titlebar'));
			// Mirrors the menubar layout in menubar.css and the title bar's counter-zoom in titlebarpart.css, whose selectors
			// need a `.menubar` inside the workbench title bar, which this fixture does not build. The counter-zoomed holder
			// renders at zoom 1, like menus in a counter-zoomed title bar.
			titlebar.appendChild($('style')).textContent = `
				.titlebar .menubar-container { display: flex; }
				.titlebar .menubar-menu-title { height: 30px; padding: 0 8px; }
				.titlebar .menubar-menu-items-holder { position: fixed; zoom: ${1 / titleZoom}; }`;
			titlebar.style.position = 'fixed';
			titlebar.style.width = '400px';
			titlebar.style.zoom = `${titleZoom}`;
			// The 30px title ends at y.125, where rounding away from the title would leave a device pixel gap below at DPR 1
			// and 2. Whole 1/64 pixels keep it at least an eighth of a device pixel from a rounding tie at common DPRs.
			titlebar.style.left = '10.125px';
			titlebar.style.top = '20.125px';
			const menubarContainer = titlebar.appendChild($('.menubar-container'));
			const menubar = new MenuBar(menubarContainer, { enableMnemonics: true, visibility: 'visible' }, unthemedMenuStyles);
			try {
				// A single menu would only be shown in the overflow menu
				menubar.push([
					{ label: '&File', actions: [toAction({ id: 'save', label: 'Save', run: () => { } })] },
					{ label: '&View', actions: [toAction({ id: 'zoomIn', label: 'Zoom In', run: () => { } })] }
				]);
				menubar.update();
				await new Promise<void>(resolve => getWindow(titlebar).requestAnimationFrame(() => resolve()));

				const button = getButtonElementByAriaLabel(menubarContainer, 'View');
				assert.ok(button);
				button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
				const holder = button.querySelector<HTMLElement>('.menubar-menu-items-holder');
				assert.ok(holder);
				const dpr = getWindow(holder).devicePixelRatio;
				const misalignment = (value: number) => Math.abs(value * dpr - Math.round(value * dpr));
				const rect = holder.getBoundingClientRect();
				// Where the menubar placed the holder before alignment: the title's rendered bottom.
				// Aligning must keep the holder's top at the device pixel the title's bottom is painted at, neither covering the title nor leaving a gap.
				const unalignedTop = getTitleDivFromButtonDiv(button)!.getBoundingClientRect().bottom;
				// Chromium lays out in 1/64 device pixels, so an aligned edge is only on a device pixel to within that
				const precision = Math.max(dpr, 1) / 64 * 1.05;
				result[name] = {
					aligned: misalignment(rect.left) <= precision && misalignment(rect.top) <= precision,
					horizontalInset: holder.style.left.endsWith('px') ? 'left' : 'right',
					meetsTitle: Math.round(rect.top * dpr) === Math.round(unalignedTop * dpr)
				};
				menubar.blur();
			} finally {
				menubar.dispose();
				titlebar.remove();
				ModifierKeyEmitter.disposeInstance();
			}
		}

		assert.deepStrictEqual(result, {
			plain: { aligned: true, horizontalInset: 'left', meetsTitle: true },
			counterZoomed: { aligned: true, horizontalInset: 'left', meetsTitle: true }
		});
	});

	test('marks its container while a menu is open (#154258)', async () => {
		const host = mainWindow.document.body.appendChild($('.menubar'));
		host.style.cssText = 'position: fixed; width: 400px; height: 30px;';
		const menubar = new MenuBar(host, { enableMnemonics: true, visibility: 'classic' }, unthemedMenuStyles);
		const states: { open: string | null; marked: boolean }[] = [];
		const record = () => states.push({
			open: host.querySelector('.menubar-menu-button.open')?.getAttribute('aria-label') ?? null,
			marked: host.classList.contains('menu-open')
		});
		// Hosts must not be notified while the menubar is disposed, or they could re-create it
		const eventsDuringDispose: string[] = [];
		try {
			// A single menu would only be shown in the overflow menu
			menubar.push([
				{ label: '&File', actions: [toAction({ id: 'save', label: 'Save', run: () => { } })] },
				{ label: '&View', actions: [toAction({ id: 'zoomIn', label: 'Zoom In', run: () => { } })] }
			]);
			menubar.update();
			await new Promise<void>(resolve => getWindow(host).requestAnimationFrame(() => resolve()));
			const fileButton = getButtonElementByAriaLabel(host, 'File');
			const viewButton = getButtonElementByAriaLabel(host, 'View');
			assert.ok(fileButton && viewButton);
			const openFile = () => fileButton.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

			openFile();
			record();
			viewButton.dispatchEvent(new MouseEvent('mouseenter'));
			record();
			menubar.blur();
			record();
			openFile();
			record();
		} finally {
			store.add(menubar.onFocusStateChange(focused => eventsDuringDispose.push(`focus:${focused}`)));
			store.add(menubar.onVisibilityChange(visible => eventsDuringDispose.push(`visible:${visible}`)));
			menubar.dispose();
			record();
			host.remove();
			ModifierKeyEmitter.disposeInstance();
		}

		assert.deepStrictEqual({ states, eventsDuringDispose }, {
			states: [
				{ open: 'File', marked: true },
				{ open: 'View', marked: true },
				{ open: null, marked: false },
				{ open: 'File', marked: true },
				{ open: null, marked: false }
			],
			eventsDuringDispose: []
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
			// Mirrors menubar.css, whose holder rules need a `.menubar` container, which this fixture does not use. The fractional
			// padding gives the menu a fractional height, so where its far edge is painted depends on which edge is rounded. With the
			// title's fractional top, rounding the top edge of a menu opening upwards would move its bottom edge at DPR 1 and 2.
			const style = compactContainer.appendChild($('style'));
			style.textContent = '.compact-container .menubar-menu-items-holder { position: fixed; padding-bottom: 0.6875px; }';
			compactContainer.style.position = 'fixed';
			// Rounding away from the menu button would leave a device pixel gap from it at DPR 1 and 2. Whole 1/64 pixels keep
			// both edges of the 16px button at least an eighth of a device pixel from a rounding tie at common DPRs.
			compactContainer.style.left = '10.6875px';
			compactContainer.style.top = '20.7px';
			const dpr = getWindow(compactContainer).devicePixelRatio;
			const misalignment = (value: number) => Math.abs(value * dpr - Math.round(value * dpr));
			// Chromium lays out in 1/64 device pixels, so an aligned edge is only on a device pixel to within that
			const precision = Math.max(dpr, 1) / 64 * 1.05;
			const result: Record<string, unknown> = {};
			for (const [name, horizontal, vertical] of [
				['expandsRight', HorizontalDirection.Right, VerticalDirection.Below],
				['expandsLeft', HorizontalDirection.Left, VerticalDirection.Below],
				['expandsAbove', HorizontalDirection.Right, VerticalDirection.Above]
			] as const) {
				const menubar = new MenuBar(compactContainer, {
					enableMnemonics: true,
					visibility: 'classic',
					compactMode: { horizontal, vertical },
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
				// Where the menubar placed the holder's edge facing the title before alignment. Left-expanding menus use the
				// integer innerWidth, which at fractional DPRs can already overlap the title by less than a pixel. Aligning must
				// keep that edge at the device pixel it was painted at, neither covering the title further nor leaving a gap.
				const unaligned = horizontal === HorizontalDirection.Right
					? button.left + compactContainer.clientWidth
					: getWindow(holder).visualViewport!.width - getWindow(holder).innerWidth + button.left;
				const paintedFacingEdge = horizontal === HorizontalDirection.Right ? Math.round(rect.left * dpr) : Math.round(rect.left * dpr) + Math.round(rect.width * dpr);
				let upward = {};
				if (vertical === VerticalDirection.Above) {
					// Menus opening upwards line their bottom edge up with the title, so it must stay where it was painted before alignment
					const title = overflowButton.querySelector<HTMLElement>('.menubar-menu-title');
					assert.ok(title);
					// The menubar places an upward menu's top `menus.length * 30` pixels above the title's top plus the menubar's
					// height, and this menubar has one menu
					const unalignedBottom = title.getBoundingClientRect().top - 30 + compactContainer.getBoundingClientRect().height + rect.height;
					upward = { bottomKept: Math.round(rect.top * dpr) + Math.round(rect.height * dpr) === Math.round(unalignedBottom * dpr) };
				}
				result[name] = {
					aligned: misalignment(rect.left) <= precision && misalignment(rect.top) <= precision,
					horizontalInset: holder.style.left.endsWith('px') ? 'left' : 'right',
					meetsTitle: paintedFacingEdge === Math.round(unaligned * dpr),
					...upward
				};
				menubar.blur();
				menubar.dispose();
			}

			assert.deepStrictEqual(result, {
				expandsRight: { aligned: true, horizontalInset: 'left', meetsTitle: true },
				expandsLeft: { aligned: true, horizontalInset: 'right', meetsTitle: true },
				expandsAbove: { aligned: true, horizontalInset: 'left', meetsTitle: true, bottomKept: true }
			});
		});

		test('aligns classic and compact menus inside a counter-zoomed container', async () => {
			const style = mainWindow.document.head.appendChild($('style'));
			store.add(toDisposable(() => style.remove()));
			style.textContent = '.test-counter-zoom { zoom: 1.25; } .test-counter-zoom .menubar-menu-items-holder.monaco-menu-container { zoom: 0.8; }';
			const zoomedWrapper = mainWindow.document.body.appendChild($('.test-counter-zoom'));
			store.add(toDisposable(() => zoomedWrapper.remove()));
			zoomedWrapper.style.cssText = 'position: fixed; top: 20px; left: 40px;';

			const classicHost = zoomedWrapper.appendChild($('.menubar'));
			classicHost.style.cssText = 'width: 200px; height: 32px;';
			const classic = store.add(new MenuBar(classicHost, { enableMnemonics: true, visibility: 'classic' }, unthemedMenuStyles));
			classic.push([{ label: '&File', actions: [toAction({ id: 'open', label: 'Open', run: () => { } })] }]);
			classic.update();
			await nextAnimationFrame();

			const classicButton = classicHost.querySelector<HTMLElement>('.menubar-menu-button');
			const classicTitle = classicButton?.querySelector<HTMLElement>('.menubar-menu-title');
			assert.ok(classicButton && classicTitle);
			dispatchKeyUp(classicButton);
			const classicHolder = classicButton.querySelector<HTMLElement>('.menubar-menu-items-holder');
			assert.ok(classicHolder);
			const classicHolderRect = classicHolder.getBoundingClientRect();
			const classicTitleRect = classicTitle.getBoundingClientRect();
			classic.blur();

			const compactHost = zoomedWrapper.appendChild($('.menubar'));
			compactHost.style.cssText = 'width: 36px; height: 32px;';
			const compact = store.add(new MenuBar(compactHost, {
				enableMnemonics: true,
				visibility: 'classic',
				compactMode: { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below },
			}, unthemedMenuStyles));
			compact.push([{ label: '&File', actions: [toAction({ id: 'open', label: 'Open', run: () => { } })] }]);
			compact.update();
			await nextAnimationFrame();

			const compactButton = compactHost.querySelector<HTMLElement>('.menubar-menu-button[aria-label="Application Menu"]');
			const compactTitle = compactButton?.querySelector<HTMLElement>('.menubar-menu-title');
			assert.ok(compactButton && compactTitle);
			dispatchKeyUp(compactButton);
			const compactHolder = compactButton.querySelector<HTMLElement>('.menubar-menu-items-holder');
			assert.ok(compactHolder);
			const compactHolderRect = compactHolder.getBoundingClientRect();
			const compactTitleRect = compactTitle.getBoundingClientRect();
			const compactHostRect = compactHost.getBoundingClientRect();
			compact.blur();

			// Aligning menus to device pixels can move them by up to half a device pixel
			const tolerance = Math.max(0.5, 0.5 / mainWindow.devicePixelRatio) + 0.01;
			assert.deepStrictEqual({
				classicAlignedLeft: Math.abs(classicHolderRect.left - classicTitleRect.left) < tolerance,
				classicAlignedTop: Math.abs(classicHolderRect.top - classicTitleRect.bottom) < tolerance,
				compactAlignedLeft: Math.abs(compactHolderRect.left - (compactTitleRect.left + compactHostRect.width)) < tolerance,
				compactAlignedTop: Math.abs(compactHolderRect.top - compactTitleRect.top) < tolerance,
			}, {
				classicAlignedLeft: true,
				classicAlignedTop: true,
				compactAlignedLeft: true,
				compactAlignedTop: true,
			});
		});
	});
});
