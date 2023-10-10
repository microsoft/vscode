/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { EventType, Gesture, GestureEvent } from 'vs/base/browser/touch';
import { cleanMnemonic, Direction, IMenuOptions, IMenuStyles, Menu, MENU_ESCAPED_MNEMONIC_REGEX, MENU_MNEMONIC_REGEX } from 'vs/base/browser/ui/menu/menu';
import { ActionRunner, IAction, IActionRunner, Separator, SubmenuAction } from 'vs/base/common/actions';
import { asArray } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod, ScanCode, ScanCodeUtils } from 'vs/base/common/keyCodes';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Disposable, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import * as strings from 'vs/base/common/strings';
import 'vs/css!./menubar';
import * as nls from 'vs/nls';

const $ = DOM.$;

export interface IMenuBarOptions {
	enableMnemonics?: boolean;
	disableAltFocus?: boolean;
	visibility?: string;
	getKeybinding?: (action: IAction) => ResolvedKeybinding | undefined;
	alwaysOnMnemonics?: boolean;
	compactMode?: Direction;
	actionRunner?: IActionRunner;
	getCompactMenuActions?: () => IAction[];
}

export interface MenuBarMenu {
	actions: IAction[];
	label: string;
}

interface MenuBarMenuWithElements extends MenuBarMenu {
	titleElement?: HTMLElement;
	buttonElement?: HTMLElement;
}

enum MenubarState {
	HIDDEN,
	VISIBLE,
	FOCUSED,
	OPEN
}

export class MenuBar extends Disposable {

	static readonly OVERFLOW_INDEX: number = -1;

	private menus: MenuBarMenuWithElements[];

	private overflowMenu!: MenuBarMenuWithElements & { titleElement: HTMLElement; buttonElement: HTMLElement };

	private focusedMenu: {
		index: number;
		holder?: HTMLElement;
		widget?: Menu;
	} | undefined;

	private focusToReturn: HTMLElement | undefined;
	private menuUpdater: RunOnceScheduler;

	// Input-related
	private _mnemonicsInUse: boolean = false;
	private openedViaKeyboard: boolean = false;
	private awaitingAltRelease: boolean = false;
	private ignoreNextMouseUp: boolean = false;
	private mnemonics: Map<string, number>;

	private updatePending: boolean = false;
	private _focusState: MenubarState;
	private actionRunner: IActionRunner;

	private readonly _onVisibilityChange: Emitter<boolean>;
	private readonly _onFocusStateChange: Emitter<boolean>;

	private numMenusShown: number = 0;
	private overflowLayoutScheduled: IDisposable | undefined = undefined;

	constructor(private container: HTMLElement, private options: IMenuBarOptions, private menuStyle: IMenuStyles) {
		super();

		this.container.setAttribute('role', 'menubar');
		if (this.isCompact) {
			this.container.classList.add('compact');
		}

		this.menus = [];
		this.mnemonics = new Map<string, number>();

		this._focusState = MenubarState.VISIBLE;

		this._onVisibilityChange = this._register(new Emitter<boolean>());
		this._onFocusStateChange = this._register(new Emitter<boolean>());

		this.createOverflowMenu();

		this.menuUpdater = this._register(new RunOnceScheduler(() => this.update(), 200));

		this.actionRunner = this.options.actionRunner ?? this._register(new ActionRunner());
		this._register(this.actionRunner.onWillRun(() => {
			this.setUnfocusedState();
		}));

		this._register(DOM.ModifierKeyEmitter.getInstance().event(this.onModifierKeyToggled, this));

		this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e as KeyboardEvent);
			let eventHandled = true;
			const key = !!e.key ? e.key.toLocaleLowerCase() : '';

			const tabNav = isMacintosh && !this.isCompact;

			if (event.equals(KeyCode.LeftArrow) || (tabNav && event.equals(KeyCode.Tab | KeyMod.Shift))) {
				this.focusPrevious();
			} else if (event.equals(KeyCode.RightArrow) || (tabNav && event.equals(KeyCode.Tab))) {
				this.focusNext();
			} else if (event.equals(KeyCode.Escape) && this.isFocused && !this.isOpen) {
				this.setUnfocusedState();
			} else if (!this.isOpen && !event.ctrlKey && this.options.enableMnemonics && this.mnemonicsInUse && this.mnemonics.has(key)) {
				const menuIndex = this.mnemonics.get(key)!;
				this.onMenuTriggered(menuIndex, false);
			} else {
				eventHandled = false;
			}

			// Never allow default tab behavior when not compact
			if (!this.isCompact && (event.equals(KeyCode.Tab | KeyMod.Shift) || event.equals(KeyCode.Tab))) {
				event.preventDefault();
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this._register(DOM.addDisposableListener(window, DOM.EventType.MOUSE_DOWN, () => {
			// This mouse event is outside the menubar so it counts as a focus out
			if (this.isFocused) {
				this.setUnfocusedState();
			}
		}));

		this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_IN, (e) => {
			const event = e as FocusEvent;

			if (event.relatedTarget) {
				if (!this.container.contains(event.relatedTarget as HTMLElement)) {
					this.focusToReturn = event.relatedTarget as HTMLElement;
				}
			}
		}));

		this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_OUT, (e) => {
			const event = e as FocusEvent;

			// We are losing focus and there is no related target, e.g. webview case
			if (!event.relatedTarget) {
				this.setUnfocusedState();
			}
			// We are losing focus and there is a target, reset focusToReturn value as not to redirect
			else if (event.relatedTarget && !this.container.contains(event.relatedTarget as HTMLElement)) {
				this.focusToReturn = undefined;
				this.setUnfocusedState();
			}
		}));

		this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (!this.options.enableMnemonics || !e.altKey || e.ctrlKey || e.defaultPrevented) {
				return;
			}

			const key = e.key.toLocaleLowerCase();
			if (!this.mnemonics.has(key)) {
				return;
			}

			this.mnemonicsInUse = true;
			this.updateMnemonicVisibility(true);

			const menuIndex = this.mnemonics.get(key)!;
			this.onMenuTriggered(menuIndex, false);
		}));

		this.setUnfocusedState();
	}

	push(arg: MenuBarMenu | MenuBarMenu[]): void {
		const menus: MenuBarMenu[] = asArray(arg);

		menus.forEach((menuBarMenu) => {
			const menuIndex = this.menus.length;
			const cleanMenuLabel = cleanMnemonic(menuBarMenu.label);

			const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(menuBarMenu.label);

			// Register mnemonics
			if (mnemonicMatches) {
				const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];

				this.registerMnemonic(this.menus.length, mnemonic);
			}

			if (this.isCompact) {
				this.menus.push(menuBarMenu);
			} else {
				const buttonElement = $('div.menubar-menu-button', { 'role': 'menuitem', 'tabindex': -1, 'aria-label': cleanMenuLabel, 'aria-haspopup': true });
				const titleElement = $('div.menubar-menu-title', { 'role': 'none', 'aria-hidden': true });

				buttonElement.appendChild(titleElement);
				this.container.insertBefore(buttonElement, this.overflowMenu.buttonElement);

				this.updateLabels(titleElement, buttonElement, menuBarMenu.label);

				this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
					const event = new StandardKeyboardEvent(e as KeyboardEvent);
					let eventHandled = true;

					if ((event.equals(KeyCode.DownArrow) || event.equals(KeyCode.Enter)) && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						this.openedViaKeyboard = true;
						this.focusState = MenubarState.OPEN;
					} else {
						eventHandled = false;
					}

					if (eventHandled) {
						event.preventDefault();
						event.stopPropagation();
					}
				}));

				this._register(Gesture.addTarget(buttonElement));
				this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e: GestureEvent) => {
					// Ignore this touch if the menu is touched
					if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget as HTMLElement, this.focusedMenu.holder)) {
						return;
					}

					this.ignoreNextMouseUp = false;
					this.onMenuTriggered(menuIndex, true);

					e.preventDefault();
					e.stopPropagation();
				}));

				this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e: MouseEvent) => {
					// Ignore non-left-click
					const mouseEvent = new StandardMouseEvent(e);
					if (!mouseEvent.leftButton) {
						e.preventDefault();
						return;
					}

					if (!this.isOpen) {
						// Open the menu with mouse down and ignore the following mouse up event
						this.ignoreNextMouseUp = true;
						this.onMenuTriggered(menuIndex, true);
					} else {
						this.ignoreNextMouseUp = false;
					}

					e.preventDefault();
					e.stopPropagation();
				}));

				this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_UP, (e) => {
					if (e.defaultPrevented) {
						return;
					}

					if (!this.ignoreNextMouseUp) {
						if (this.isFocused) {
							this.onMenuTriggered(menuIndex, true);
						}
					} else {
						this.ignoreNextMouseUp = false;
					}
				}));

				this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
					if (this.isOpen && !this.isCurrentMenu(menuIndex)) {
						buttonElement.focus();
						this.cleanupCustomMenu();
						this.showCustomMenu(menuIndex, false);
					} else if (this.isFocused && !this.isOpen) {
						this.focusedMenu = { index: menuIndex };
						buttonElement.focus();
					}
				}));

				this.menus.push({
					label: menuBarMenu.label,
					actions: menuBarMenu.actions,
					buttonElement: buttonElement,
					titleElement: titleElement
				});
			}
		});
	}

	createOverflowMenu(): void {
		const label = this.isCompact ? nls.localize('mAppMenu', 'Application Menu') : nls.localize('mMore', 'More');
		const buttonElement = $('div.menubar-menu-button', { 'role': 'menuitem', 'tabindex': this.isCompact ? 0 : -1, 'aria-label': label, 'aria-haspopup': true });
		const titleElement = $('div.menubar-menu-title.toolbar-toggle-more' + ThemeIcon.asCSSSelector(Codicon.menuBarMore), { 'role': 'none', 'aria-hidden': true });

		buttonElement.appendChild(titleElement);
		this.container.appendChild(buttonElement);
		buttonElement.style.visibility = 'hidden';

		this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
			const event = new StandardKeyboardEvent(e as KeyboardEvent);
			let eventHandled = true;

			const triggerKeys = [KeyCode.Enter];
			if (!this.isCompact) {
				triggerKeys.push(KeyCode.DownArrow);
			} else {
				triggerKeys.push(KeyCode.Space);

				if (this.options.compactMode === Direction.Right) {
					triggerKeys.push(KeyCode.RightArrow);
				} else if (this.options.compactMode === Direction.Left) {
					triggerKeys.push(KeyCode.LeftArrow);
				}
			}

			if ((triggerKeys.some(k => event.equals(k)) && !this.isOpen)) {
				this.focusedMenu = { index: MenuBar.OVERFLOW_INDEX };
				this.openedViaKeyboard = true;
				this.focusState = MenubarState.OPEN;
			} else {
				eventHandled = false;
			}

			if (eventHandled) {
				event.preventDefault();
				event.stopPropagation();
			}
		}));

		this._register(Gesture.addTarget(buttonElement));
		this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e: GestureEvent) => {
			// Ignore this touch if the menu is touched
			if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget as HTMLElement, this.focusedMenu.holder)) {
				return;
			}

			this.ignoreNextMouseUp = false;
			this.onMenuTriggered(MenuBar.OVERFLOW_INDEX, true);

			e.preventDefault();
			e.stopPropagation();
		}));

		this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
			// Ignore non-left-click
			const mouseEvent = new StandardMouseEvent(e);
			if (!mouseEvent.leftButton) {
				e.preventDefault();
				return;
			}

			if (!this.isOpen) {
				// Open the menu with mouse down and ignore the following mouse up event
				this.ignoreNextMouseUp = true;
				this.onMenuTriggered(MenuBar.OVERFLOW_INDEX, true);
			} else {
				this.ignoreNextMouseUp = false;
			}

			e.preventDefault();
			e.stopPropagation();
		}));

		this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_UP, (e) => {
			if (e.defaultPrevented) {
				return;
			}

			if (!this.ignoreNextMouseUp) {
				if (this.isFocused) {
					this.onMenuTriggered(MenuBar.OVERFLOW_INDEX, true);
				}
			} else {
				this.ignoreNextMouseUp = false;
			}
		}));

		this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
			if (this.isOpen && !this.isCurrentMenu(MenuBar.OVERFLOW_INDEX)) {
				this.overflowMenu.buttonElement.focus();
				this.cleanupCustomMenu();
				this.showCustomMenu(MenuBar.OVERFLOW_INDEX, false);
			} else if (this.isFocused && !this.isOpen) {
				this.focusedMenu = { index: MenuBar.OVERFLOW_INDEX };
				buttonElement.focus();
			}
		}));

		this.overflowMenu = {
			buttonElement: buttonElement,
			titleElement: titleElement,
			label: 'More',
			actions: []
		};
	}

	updateMenu(menu: MenuBarMenu): void {
		const menuToUpdate = this.menus.filter(menuBarMenu => menuBarMenu.label === menu.label);
		if (menuToUpdate && menuToUpdate.length) {
			menuToUpdate[0].actions = menu.actions;
		}
	}

	override dispose(): void {
		super.dispose();

		this.menus.forEach(menuBarMenu => {
			menuBarMenu.titleElement?.remove();
			menuBarMenu.buttonElement?.remove();
		});

		this.overflowMenu.titleElement.remove();
		this.overflowMenu.buttonElement.remove();

		dispose(this.overflowLayoutScheduled);
		this.overflowLayoutScheduled = undefined;
	}

	blur(): void {
		this.setUnfocusedState();
	}

	getWidth(): number {
		if (!this.isCompact && this.menus) {
			const left = this.menus[0].buttonElement!.getBoundingClientRect().left;
			const right = this.hasOverflow ? this.overflowMenu.buttonElement.getBoundingClientRect().right : this.menus[this.menus.length - 1].buttonElement!.getBoundingClientRect().right;
			return right - left;
		}

		return 0;
	}

	getHeight(): number {
		return this.container.clientHeight;
	}

	toggleFocus(): void {
		if (!this.isFocused && this.options.visibility !== 'hidden') {
			this.mnemonicsInUse = true;
			this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : MenuBar.OVERFLOW_INDEX };
			this.focusState = MenubarState.FOCUSED;
		} else if (!this.isOpen) {
			this.setUnfocusedState();
		}
	}

	private updateOverflowAction(): void {
		if (!this.menus || !this.menus.length) {
			return;
		}

		const overflowMenuOnlyClass = 'overflow-menu-only';

		// Remove overflow only restriction to allow the most space
		this.container.classList.toggle(overflowMenuOnlyClass, false);

		const sizeAvailable = this.container.offsetWidth;
		let currentSize = 0;
		let full = this.isCompact;
		const prevNumMenusShown = this.numMenusShown;
		this.numMenusShown = 0;

		const showableMenus = this.menus.filter(menu => menu.buttonElement !== undefined && menu.titleElement !== undefined) as (MenuBarMenuWithElements & { titleElement: HTMLElement; buttonElement: HTMLElement })[];
		for (const menuBarMenu of showableMenus) {
			if (!full) {
				const size = menuBarMenu.buttonElement.offsetWidth;
				if (currentSize + size > sizeAvailable) {
					full = true;
				} else {
					currentSize += size;
					this.numMenusShown++;
					if (this.numMenusShown > prevNumMenusShown) {
						menuBarMenu.buttonElement.style.visibility = 'visible';
					}
				}
			}

			if (full) {
				menuBarMenu.buttonElement.style.visibility = 'hidden';
			}
		}


		// If below minimium menu threshold, show the overflow menu only as hamburger menu
		if (this.numMenusShown - 1 <= showableMenus.length / 4) {
			for (const menuBarMenu of showableMenus) {
				menuBarMenu.buttonElement.style.visibility = 'hidden';
			}

			full = true;
			this.numMenusShown = 0;
			currentSize = 0;
		}

		// Overflow
		if (this.isCompact) {
			this.overflowMenu.actions = [];
			for (let idx = this.numMenusShown; idx < this.menus.length; idx++) {
				this.overflowMenu.actions.push(new SubmenuAction(`menubar.submenu.${this.menus[idx].label}`, this.menus[idx].label, this.menus[idx].actions || []));
			}

			const compactMenuActions = this.options.getCompactMenuActions?.();
			if (compactMenuActions && compactMenuActions.length) {
				this.overflowMenu.actions.push(new Separator());
				this.overflowMenu.actions.push(...compactMenuActions);
			}

			this.overflowMenu.buttonElement.style.visibility = 'visible';
		} else if (full) {
			// Can't fit the more button, need to remove more menus
			while (currentSize + this.overflowMenu.buttonElement.offsetWidth > sizeAvailable && this.numMenusShown > 0) {
				this.numMenusShown--;
				const size = showableMenus[this.numMenusShown].buttonElement.offsetWidth;
				showableMenus[this.numMenusShown].buttonElement.style.visibility = 'hidden';
				currentSize -= size;
			}

			this.overflowMenu.actions = [];
			for (let idx = this.numMenusShown; idx < showableMenus.length; idx++) {
				this.overflowMenu.actions.push(new SubmenuAction(`menubar.submenu.${showableMenus[idx].label}`, showableMenus[idx].label, showableMenus[idx].actions || []));
			}

			if (this.overflowMenu.buttonElement.nextElementSibling !== showableMenus[this.numMenusShown].buttonElement) {
				this.overflowMenu.buttonElement.remove();
				this.container.insertBefore(this.overflowMenu.buttonElement, showableMenus[this.numMenusShown].buttonElement);
			}

			this.overflowMenu.buttonElement.style.visibility = 'visible';
		} else {
			this.overflowMenu.buttonElement.remove();
			this.container.appendChild(this.overflowMenu.buttonElement);
			this.overflowMenu.buttonElement.style.visibility = 'hidden';
		}

		// If we are only showing the overflow, add this class to avoid taking up space
		this.container.classList.toggle(overflowMenuOnlyClass, this.numMenusShown === 0);
	}

	private updateLabels(titleElement: HTMLElement, buttonElement: HTMLElement, label: string): void {
		const cleanMenuLabel = cleanMnemonic(label);

		// Update the button label to reflect mnemonics

		if (this.options.enableMnemonics) {
			const cleanLabel = strings.escape(label);

			// This is global so reset it
			MENU_ESCAPED_MNEMONIC_REGEX.lastIndex = 0;
			let escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);

			// We can't use negative lookbehind so we match our negative and skip
			while (escMatch && escMatch[1]) {
				escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(cleanLabel);
			}

			const replaceDoubleEscapes = (str: string) => str.replace(/&amp;&amp;/g, '&amp;');

			if (escMatch) {
				titleElement.innerText = '';
				titleElement.append(
					strings.ltrim(replaceDoubleEscapes(cleanLabel.substr(0, escMatch.index)), ' '),
					$('mnemonic', { 'aria-hidden': 'true' }, escMatch[3]),
					strings.rtrim(replaceDoubleEscapes(cleanLabel.substr(escMatch.index + escMatch[0].length)), ' ')
				);
			} else {
				titleElement.innerText = replaceDoubleEscapes(cleanLabel).trim();
			}
		} else {
			titleElement.innerText = cleanMenuLabel.replace(/&&/g, '&');
		}

		const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(label);

		// Register mnemonics
		if (mnemonicMatches) {
			const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];

			if (this.options.enableMnemonics) {
				buttonElement.setAttribute('aria-keyshortcuts', 'Alt+' + mnemonic.toLocaleLowerCase());
			} else {
				buttonElement.removeAttribute('aria-keyshortcuts');
			}
		}
	}

	update(options?: IMenuBarOptions): void {
		if (options) {
			this.options = options;
		}

		// Don't update while using the menu
		if (this.isFocused) {
			this.updatePending = true;
			return;
		}

		this.menus.forEach(menuBarMenu => {
			if (!menuBarMenu.buttonElement || !menuBarMenu.titleElement) {
				return;
			}

			this.updateLabels(menuBarMenu.titleElement, menuBarMenu.buttonElement, menuBarMenu.label);
		});

		if (!this.overflowLayoutScheduled) {
			this.overflowLayoutScheduled = DOM.scheduleAtNextAnimationFrame(() => {
				this.updateOverflowAction();
				this.overflowLayoutScheduled = undefined;
			});
		}

		this.setUnfocusedState();
	}

	private registerMnemonic(menuIndex: number, mnemonic: string): void {
		this.mnemonics.set(mnemonic.toLocaleLowerCase(), menuIndex);
	}

	private hideMenubar(): void {
		if (this.container.style.display !== 'none') {
			this.container.style.display = 'none';
			this._onVisibilityChange.fire(false);
		}
	}

	private showMenubar(): void {
		if (this.container.style.display !== 'flex') {
			this.container.style.display = 'flex';
			this._onVisibilityChange.fire(true);

			this.updateOverflowAction();
		}
	}

	private get focusState(): MenubarState {
		return this._focusState;
	}

	private set focusState(value: MenubarState) {
		if (this._focusState >= MenubarState.FOCUSED && value < MenubarState.FOCUSED) {
			// Losing focus, update the menu if needed

			if (this.updatePending) {
				this.menuUpdater.schedule();
				this.updatePending = false;
			}
		}

		if (value === this._focusState) {
			return;
		}

		const isVisible = this.isVisible;
		const isOpen = this.isOpen;
		const isFocused = this.isFocused;

		this._focusState = value;

		switch (value) {
			case MenubarState.HIDDEN:
				if (isVisible) {
					this.hideMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (isFocused) {
					this.focusedMenu = undefined;

					if (this.focusToReturn) {
						this.focusToReturn.focus();
						this.focusToReturn = undefined;
					}
				}


				break;
			case MenubarState.VISIBLE:
				if (!isVisible) {
					this.showMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (isFocused) {
					if (this.focusedMenu) {
						if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
							this.overflowMenu.buttonElement.blur();
						} else {
							this.menus[this.focusedMenu.index].buttonElement?.blur();
						}
					}

					this.focusedMenu = undefined;

					if (this.focusToReturn) {
						this.focusToReturn.focus();
						this.focusToReturn = undefined;
					}
				}

				break;
			case MenubarState.FOCUSED:
				if (!isVisible) {
					this.showMenubar();
				}

				if (isOpen) {
					this.cleanupCustomMenu();
				}

				if (this.focusedMenu) {
					if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
						this.overflowMenu.buttonElement.focus();
					} else {
						this.menus[this.focusedMenu.index].buttonElement?.focus();
					}
				}
				break;
			case MenubarState.OPEN:
				if (!isVisible) {
					this.showMenubar();
				}

				if (this.focusedMenu) {
					this.showCustomMenu(this.focusedMenu.index, this.openedViaKeyboard);
				}
				break;
		}

		this._focusState = value;
		this._onFocusStateChange.fire(this.focusState >= MenubarState.FOCUSED);
	}

	get isVisible(): boolean {
		return this.focusState >= MenubarState.VISIBLE;
	}

	private get isFocused(): boolean {
		return this.focusState >= MenubarState.FOCUSED;
	}

	private get isOpen(): boolean {
		return this.focusState >= MenubarState.OPEN;
	}

	private get hasOverflow(): boolean {
		return this.isCompact || this.numMenusShown < this.menus.length;
	}

	private get isCompact(): boolean {
		return this.options.compactMode !== undefined;
	}

	private setUnfocusedState(): void {
		if (this.options.visibility === 'toggle' || this.options.visibility === 'hidden') {
			this.focusState = MenubarState.HIDDEN;
		} else if (this.options.visibility === 'classic' && browser.isFullscreen()) {
			this.focusState = MenubarState.HIDDEN;
		} else {
			this.focusState = MenubarState.VISIBLE;
		}

		this.ignoreNextMouseUp = false;
		this.mnemonicsInUse = false;
		this.updateMnemonicVisibility(false);
	}

	private focusPrevious(): void {

		if (!this.focusedMenu || this.numMenusShown === 0) {
			return;
		}


		let newFocusedIndex = (this.focusedMenu.index - 1 + this.numMenusShown) % this.numMenusShown;
		if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
			newFocusedIndex = this.numMenusShown - 1;
		} else if (this.focusedMenu.index === 0 && this.hasOverflow) {
			newFocusedIndex = MenuBar.OVERFLOW_INDEX;
		}

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		if (this.isOpen) {
			this.cleanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} else if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			if (newFocusedIndex === MenuBar.OVERFLOW_INDEX) {
				this.overflowMenu.buttonElement.focus();
			} else {
				this.menus[newFocusedIndex].buttonElement?.focus();
			}
		}
	}

	private focusNext(): void {
		if (!this.focusedMenu || this.numMenusShown === 0) {
			return;
		}

		let newFocusedIndex = (this.focusedMenu.index + 1) % this.numMenusShown;
		if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
			newFocusedIndex = 0;
		} else if (this.focusedMenu.index === this.numMenusShown - 1) {
			newFocusedIndex = MenuBar.OVERFLOW_INDEX;
		}

		if (newFocusedIndex === this.focusedMenu.index) {
			return;
		}

		if (this.isOpen) {
			this.cleanupCustomMenu();
			this.showCustomMenu(newFocusedIndex);
		} else if (this.isFocused) {
			this.focusedMenu.index = newFocusedIndex;
			if (newFocusedIndex === MenuBar.OVERFLOW_INDEX) {
				this.overflowMenu.buttonElement.focus();
			} else {
				this.menus[newFocusedIndex].buttonElement?.focus();
			}
		}
	}

	private updateMnemonicVisibility(visible: boolean): void {
		if (this.menus) {
			this.menus.forEach(menuBarMenu => {
				if (menuBarMenu.titleElement && menuBarMenu.titleElement.children.length) {
					const child = menuBarMenu.titleElement.children.item(0) as HTMLElement;
					if (child) {
						child.style.textDecoration = (this.options.alwaysOnMnemonics || visible) ? 'underline' : '';
					}
				}
			});
		}
	}

	private get mnemonicsInUse(): boolean {
		return this._mnemonicsInUse;
	}

	private set mnemonicsInUse(value: boolean) {
		this._mnemonicsInUse = value;
	}

	private get shouldAltKeyFocus(): boolean {
		if (isMacintosh) {
			return false;
		}

		if (!this.options.disableAltFocus) {
			return true;
		}

		if (this.options.visibility === 'toggle') {
			return true;
		}

		return false;
	}

	public get onVisibilityChange(): Event<boolean> {
		return this._onVisibilityChange.event;
	}

	public get onFocusStateChange(): Event<boolean> {
		return this._onFocusStateChange.event;
	}

	private onMenuTriggered(menuIndex: number, clicked: boolean) {
		if (this.isOpen) {
			if (this.isCurrentMenu(menuIndex)) {
				this.setUnfocusedState();
			} else {
				this.cleanupCustomMenu();
				this.showCustomMenu(menuIndex, this.openedViaKeyboard);
			}
		} else {
			this.focusedMenu = { index: menuIndex };
			this.openedViaKeyboard = !clicked;
			this.focusState = MenubarState.OPEN;
		}
	}

	private onModifierKeyToggled(modifierKeyStatus: DOM.IModifierKeyStatus): void {
		const allModifiersReleased = !modifierKeyStatus.altKey && !modifierKeyStatus.ctrlKey && !modifierKeyStatus.shiftKey && !modifierKeyStatus.metaKey;

		if (this.options.visibility === 'hidden') {
			return;
		}

		// Prevent alt-key default if the menu is not hidden and we use alt to focus
		if (modifierKeyStatus.event && this.shouldAltKeyFocus) {
			if (ScanCodeUtils.toEnum(modifierKeyStatus.event.code) === ScanCode.AltLeft) {
				modifierKeyStatus.event.preventDefault();
			}
		}

		// Alt key pressed while menu is focused. This should return focus away from the menubar
		if (this.isFocused && modifierKeyStatus.lastKeyPressed === 'alt' && modifierKeyStatus.altKey) {
			this.setUnfocusedState();
			this.mnemonicsInUse = false;
			this.awaitingAltRelease = true;
		}

		// Clean alt key press and release
		if (allModifiersReleased && modifierKeyStatus.lastKeyPressed === 'alt' && modifierKeyStatus.lastKeyReleased === 'alt') {
			if (!this.awaitingAltRelease) {
				if (!this.isFocused && this.shouldAltKeyFocus) {
					this.mnemonicsInUse = true;
					this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : MenuBar.OVERFLOW_INDEX };
					this.focusState = MenubarState.FOCUSED;
				} else if (!this.isOpen) {
					this.setUnfocusedState();
				}
			}
		}

		// Alt key released
		if (!modifierKeyStatus.altKey && modifierKeyStatus.lastKeyReleased === 'alt') {
			this.awaitingAltRelease = false;
		}

		if (this.options.enableMnemonics && this.menus && !this.isOpen) {
			this.updateMnemonicVisibility((!this.awaitingAltRelease && modifierKeyStatus.altKey) || this.mnemonicsInUse);
		}
	}

	private isCurrentMenu(menuIndex: number): boolean {
		if (!this.focusedMenu) {
			return false;
		}

		return this.focusedMenu.index === menuIndex;
	}

	private cleanupCustomMenu(): void {
		if (this.focusedMenu) {
			// Remove focus from the menus first
			if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
				this.overflowMenu.buttonElement.focus();
			} else {
				this.menus[this.focusedMenu.index].buttonElement?.focus();
			}

			if (this.focusedMenu.holder) {
				this.focusedMenu.holder.parentElement?.classList.remove('open');

				this.focusedMenu.holder.remove();
			}

			this.focusedMenu.widget?.dispose();

			this.focusedMenu = { index: this.focusedMenu.index };
		}
	}

	private showCustomMenu(menuIndex: number, selectFirst = true): void {
		const actualMenuIndex = menuIndex >= this.numMenusShown ? MenuBar.OVERFLOW_INDEX : menuIndex;
		const customMenu = actualMenuIndex === MenuBar.OVERFLOW_INDEX ? this.overflowMenu : this.menus[actualMenuIndex];

		if (!customMenu.actions || !customMenu.buttonElement || !customMenu.titleElement) {
			return;
		}

		const menuHolder = $('div.menubar-menu-items-holder', { 'title': '' });

		customMenu.buttonElement.classList.add('open');

		const titleBoundingRect = customMenu.titleElement.getBoundingClientRect();
		const titleBoundingRectZoom = DOM.getDomNodeZoomLevel(customMenu.titleElement);

		if (this.options.compactMode === Direction.Right) {
			menuHolder.style.top = `${titleBoundingRect.top}px`;
			menuHolder.style.left = `${titleBoundingRect.left + this.container.clientWidth}px`;
		} else if (this.options.compactMode === Direction.Left) {
			menuHolder.style.top = `${titleBoundingRect.top}px`;
			menuHolder.style.right = `${this.container.clientWidth}px`;
			menuHolder.style.left = 'auto';
		} else {
			menuHolder.style.top = `${titleBoundingRect.bottom * titleBoundingRectZoom}px`;
			menuHolder.style.left = `${titleBoundingRect.left * titleBoundingRectZoom}px`;
		}

		customMenu.buttonElement.appendChild(menuHolder);

		const menuOptions: IMenuOptions = {
			getKeyBinding: this.options.getKeybinding,
			actionRunner: this.actionRunner,
			enableMnemonics: this.options.alwaysOnMnemonics || (this.mnemonicsInUse && this.options.enableMnemonics),
			ariaLabel: customMenu.buttonElement.getAttribute('aria-label') ?? undefined,
			expandDirection: this.isCompact ? this.options.compactMode : Direction.Right,
			useEventAsContext: true
		};

		const menuWidget = this._register(new Menu(menuHolder, customMenu.actions, menuOptions, this.menuStyle));

		this._register(menuWidget.onDidCancel(() => {
			this.focusState = MenubarState.FOCUSED;
		}));

		if (actualMenuIndex !== menuIndex) {
			menuWidget.trigger(menuIndex - this.numMenusShown);
		} else {
			menuWidget.focus(selectFirst);
		}

		this.focusedMenu = {
			index: actualMenuIndex,
			holder: menuHolder,
			widget: menuWidget
		};
	}
}
