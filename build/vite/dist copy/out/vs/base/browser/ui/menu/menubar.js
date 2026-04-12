/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as browser from '../../browser.js';
import * as DOM from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { StandardMouseEvent } from '../../mouseEvent.js';
import { EventType, Gesture } from '../../touch.js';
import { cleanMnemonic, HorizontalDirection, Menu, MENU_ESCAPED_MNEMONIC_REGEX, MENU_MNEMONIC_REGEX, VerticalDirection } from './menu.js';
import { ActionRunner, Separator, SubmenuAction } from '../../../common/actions.js';
import { asArray } from '../../../common/arrays.js';
import { RunOnceScheduler } from '../../../common/async.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { Emitter } from '../../../common/event.js';
import { ScanCodeUtils } from '../../../common/keyCodes.js';
import { Disposable, DisposableStore, dispose } from '../../../common/lifecycle.js';
import { isMacintosh } from '../../../common/platform.js';
import * as strings from '../../../common/strings.js';
import './menubar.css';
import * as nls from '../../../../nls.js';
import { mainWindow } from '../../window.js';
const $ = DOM.$;
var MenubarState;
(function (MenubarState) {
    MenubarState[MenubarState["HIDDEN"] = 0] = "HIDDEN";
    MenubarState[MenubarState["VISIBLE"] = 1] = "VISIBLE";
    MenubarState[MenubarState["FOCUSED"] = 2] = "FOCUSED";
    MenubarState[MenubarState["OPEN"] = 3] = "OPEN";
})(MenubarState || (MenubarState = {}));
export class MenuBar extends Disposable {
    static { this.OVERFLOW_INDEX = -1; }
    constructor(container, options, menuStyle) {
        super();
        this.container = container;
        this.options = options;
        this.menuStyle = menuStyle;
        // Input-related
        this._mnemonicsInUse = false;
        this.openedViaKeyboard = false;
        this.awaitingAltRelease = false;
        this.ignoreNextMouseUp = false;
        this.updatePending = false;
        this.numMenusShown = 0;
        this.overflowLayoutScheduled = undefined;
        this.menuDisposables = this._register(new DisposableStore());
        this.container.setAttribute('role', 'menubar');
        if (this.isCompact) {
            this.container.classList.add('compact');
        }
        this.menus = [];
        this.mnemonics = new Map();
        this._focusState = MenubarState.VISIBLE;
        this._onVisibilityChange = this._register(new Emitter());
        this._onFocusStateChange = this._register(new Emitter());
        this.createOverflowMenu();
        this.menuUpdater = this._register(new RunOnceScheduler(() => this.update(), 200));
        this.actionRunner = this.options.actionRunner ?? this._register(new ActionRunner());
        this._register(this.actionRunner.onWillRun(() => {
            this.setUnfocusedState();
        }));
        this._register(DOM.ModifierKeyEmitter.getInstance().event(this.onModifierKeyToggled, this));
        this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            let eventHandled = true;
            const key = !!e.key ? e.key.toLocaleLowerCase() : '';
            const tabNav = isMacintosh && !this.isCompact;
            if (event.equals(15 /* KeyCode.LeftArrow */) || (tabNav && event.equals(2 /* KeyCode.Tab */ | 1024 /* KeyMod.Shift */))) {
                this.focusPrevious();
            }
            else if (event.equals(17 /* KeyCode.RightArrow */) || (tabNav && event.equals(2 /* KeyCode.Tab */))) {
                this.focusNext();
            }
            else if (event.equals(9 /* KeyCode.Escape */) && this.isFocused && !this.isOpen) {
                this.setUnfocusedState();
            }
            else if (!this.isOpen && !event.ctrlKey && this.options.enableMnemonics && this.mnemonicsInUse && this.mnemonics.has(key)) {
                const menuIndex = this.mnemonics.get(key);
                this.onMenuTriggered(menuIndex, false);
            }
            else {
                eventHandled = false;
            }
            // Never allow default tab behavior when not compact
            if (!this.isCompact && (event.equals(2 /* KeyCode.Tab */ | 1024 /* KeyMod.Shift */) || event.equals(2 /* KeyCode.Tab */))) {
                event.preventDefault();
            }
            if (eventHandled) {
                event.preventDefault();
                event.stopPropagation();
            }
        }));
        const window = DOM.getWindow(this.container);
        this._register(DOM.addDisposableListener(window, DOM.EventType.MOUSE_DOWN, () => {
            // This mouse event is outside the menubar so it counts as a focus out
            if (this.isFocused) {
                this.setUnfocusedState();
            }
        }));
        this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_IN, (e) => {
            const event = e;
            if (event.relatedTarget) {
                if (!this.container.contains(event.relatedTarget)) {
                    this.focusToReturn = event.relatedTarget;
                }
            }
        }));
        this._register(DOM.addDisposableListener(this.container, DOM.EventType.FOCUS_OUT, (e) => {
            const event = e;
            // We are losing focus and there is no related target, e.g. webview case
            if (!event.relatedTarget) {
                this.setUnfocusedState();
            }
            // We are losing focus and there is a target, reset focusToReturn value as not to redirect
            else if (event.relatedTarget && !this.container.contains(event.relatedTarget)) {
                this.focusToReturn = undefined;
                this.setUnfocusedState();
            }
        }));
        this._register(DOM.addDisposableListener(window, DOM.EventType.KEY_DOWN, (e) => {
            if (!this.options.enableMnemonics || !e.altKey || e.ctrlKey || e.defaultPrevented) {
                return;
            }
            const key = e.key.toLocaleLowerCase();
            if (!this.mnemonics.has(key)) {
                return;
            }
            this.mnemonicsInUse = true;
            this.updateMnemonicVisibility(true);
            const menuIndex = this.mnemonics.get(key);
            this.onMenuTriggered(menuIndex, false);
        }));
        this.setUnfocusedState();
    }
    push(arg) {
        const menus = asArray(arg);
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
            }
            else {
                const buttonElement = $('div.menubar-menu-button', { 'role': 'menuitem', 'tabindex': -1, 'aria-label': cleanMenuLabel, 'aria-haspopup': true });
                const titleElement = $('div.menubar-menu-title', { 'role': 'none', 'aria-hidden': true });
                buttonElement.appendChild(titleElement);
                this.container.insertBefore(buttonElement, this.overflowMenu.buttonElement);
                this.updateLabels(titleElement, buttonElement, menuBarMenu.label);
                this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
                    const event = new StandardKeyboardEvent(e);
                    let eventHandled = true;
                    if ((event.equals(18 /* KeyCode.DownArrow */) || event.equals(3 /* KeyCode.Enter */)) && !this.isOpen) {
                        this.focusedMenu = { index: menuIndex };
                        this.openedViaKeyboard = true;
                        this.focusState = MenubarState.OPEN;
                    }
                    else {
                        eventHandled = false;
                    }
                    if (eventHandled) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }));
                this._register(Gesture.addTarget(buttonElement));
                this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e) => {
                    // Ignore this touch if the menu is touched
                    if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget, this.focusedMenu.holder)) {
                        return;
                    }
                    this.ignoreNextMouseUp = false;
                    this.onMenuTriggered(menuIndex, true);
                    e.preventDefault();
                    e.stopPropagation();
                }));
                this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
                    // Ignore non-left-click
                    const mouseEvent = new StandardMouseEvent(DOM.getWindow(buttonElement), e);
                    if (!mouseEvent.leftButton) {
                        e.preventDefault();
                        return;
                    }
                    if (!this.isOpen) {
                        // Open the menu with mouse down and ignore the following mouse up event
                        this.ignoreNextMouseUp = true;
                        this.onMenuTriggered(menuIndex, true);
                    }
                    else {
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
                    }
                    else {
                        this.ignoreNextMouseUp = false;
                    }
                }));
                this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
                    if (this.isOpen && !this.isCurrentMenu(menuIndex)) {
                        buttonElement.focus();
                        this.cleanupCustomMenu();
                        this.showCustomMenu(menuIndex, false);
                    }
                    else if (this.isFocused && !this.isOpen) {
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
    createOverflowMenu() {
        const label = this.isCompact ? nls.localize('mAppMenu', 'Application Menu') : nls.localize('mMore', 'More');
        const buttonElement = $('div.menubar-menu-button', { 'role': 'menuitem', 'tabindex': this.isCompact ? 0 : -1, 'aria-label': label, 'aria-haspopup': true });
        const titleElement = $('div.menubar-menu-title.toolbar-toggle-more' + ThemeIcon.asCSSSelector(Codicon.menuBarMore), { 'role': 'none', 'aria-hidden': true });
        buttonElement.appendChild(titleElement);
        this.container.appendChild(buttonElement);
        buttonElement.style.visibility = 'hidden';
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.KEY_UP, (e) => {
            const event = new StandardKeyboardEvent(e);
            let eventHandled = true;
            const triggerKeys = [3 /* KeyCode.Enter */];
            if (!this.isCompact) {
                triggerKeys.push(18 /* KeyCode.DownArrow */);
            }
            else {
                triggerKeys.push(10 /* KeyCode.Space */);
                if (this.options.compactMode?.horizontal === HorizontalDirection.Right) {
                    triggerKeys.push(17 /* KeyCode.RightArrow */);
                }
                else if (this.options.compactMode?.horizontal === HorizontalDirection.Left) {
                    triggerKeys.push(15 /* KeyCode.LeftArrow */);
                }
            }
            if ((triggerKeys.some(k => event.equals(k)) && !this.isOpen)) {
                this.focusedMenu = { index: MenuBar.OVERFLOW_INDEX };
                this.openedViaKeyboard = true;
                this.focusState = MenubarState.OPEN;
            }
            else {
                eventHandled = false;
            }
            if (eventHandled) {
                event.preventDefault();
                event.stopPropagation();
            }
        }));
        this._register(Gesture.addTarget(buttonElement));
        this._register(DOM.addDisposableListener(buttonElement, EventType.Tap, (e) => {
            // Ignore this touch if the menu is touched
            if (this.isOpen && this.focusedMenu && this.focusedMenu.holder && DOM.isAncestor(e.initialTarget, this.focusedMenu.holder)) {
                return;
            }
            this.ignoreNextMouseUp = false;
            this.onMenuTriggered(MenuBar.OVERFLOW_INDEX, true);
            e.preventDefault();
            e.stopPropagation();
        }));
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_DOWN, (e) => {
            // Ignore non-left-click
            const mouseEvent = new StandardMouseEvent(DOM.getWindow(buttonElement), e);
            if (!mouseEvent.leftButton) {
                e.preventDefault();
                return;
            }
            if (!this.isOpen) {
                // Open the menu with mouse down and ignore the following mouse up event
                this.ignoreNextMouseUp = true;
                this.onMenuTriggered(MenuBar.OVERFLOW_INDEX, true);
            }
            else {
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
            }
            else {
                this.ignoreNextMouseUp = false;
            }
        }));
        this._register(DOM.addDisposableListener(buttonElement, DOM.EventType.MOUSE_ENTER, () => {
            if (this.isOpen && !this.isCurrentMenu(MenuBar.OVERFLOW_INDEX)) {
                this.overflowMenu.buttonElement.focus();
                this.cleanupCustomMenu();
                this.showCustomMenu(MenuBar.OVERFLOW_INDEX, false);
            }
            else if (this.isFocused && !this.isOpen) {
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
    updateMenu(menu) {
        const menuToUpdate = this.menus.filter(menuBarMenu => menuBarMenu.label === menu.label);
        if (menuToUpdate && menuToUpdate.length) {
            menuToUpdate[0].actions = menu.actions;
        }
    }
    dispose() {
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
    blur() {
        this.setUnfocusedState();
    }
    getWidth() {
        if (!this.isCompact && this.menus) {
            const left = this.menus[0].buttonElement.getBoundingClientRect().left;
            const right = this.hasOverflow ? this.overflowMenu.buttonElement.getBoundingClientRect().right : this.menus[this.menus.length - 1].buttonElement.getBoundingClientRect().right;
            return right - left;
        }
        return 0;
    }
    getHeight() {
        return this.container.clientHeight;
    }
    toggleFocus() {
        if (!this.isFocused && this.options.visibility !== 'hidden') {
            this.mnemonicsInUse = true;
            this.focusedMenu = { index: this.numMenusShown > 0 ? 0 : MenuBar.OVERFLOW_INDEX };
            this.focusState = MenubarState.FOCUSED;
        }
        else if (!this.isOpen) {
            this.setUnfocusedState();
        }
    }
    updateOverflowAction() {
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
        const showableMenus = this.menus.filter(menu => menu.buttonElement !== undefined && menu.titleElement !== undefined);
        for (const menuBarMenu of showableMenus) {
            if (!full) {
                const size = menuBarMenu.buttonElement.offsetWidth;
                if (currentSize + size > sizeAvailable) {
                    full = true;
                }
                else {
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
        }
        else if (full) {
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
        }
        else {
            this.overflowMenu.buttonElement.remove();
            this.container.appendChild(this.overflowMenu.buttonElement);
            this.overflowMenu.buttonElement.style.visibility = 'hidden';
        }
        // If we are only showing the overflow, add this class to avoid taking up space
        this.container.classList.toggle(overflowMenuOnlyClass, this.numMenusShown === 0);
    }
    updateLabels(titleElement, buttonElement, label) {
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
            const replaceDoubleEscapes = (str) => str.replace(/&amp;&amp;/g, '&amp;');
            if (escMatch) {
                titleElement.textContent = '';
                titleElement.append(strings.ltrim(replaceDoubleEscapes(cleanLabel.substr(0, escMatch.index)), ' '), $('mnemonic', { 'aria-hidden': 'true' }, escMatch[3]), strings.rtrim(replaceDoubleEscapes(cleanLabel.substr(escMatch.index + escMatch[0].length)), ' '));
            }
            else {
                titleElement.textContent = replaceDoubleEscapes(cleanLabel).trim();
            }
        }
        else {
            titleElement.textContent = cleanMenuLabel.replace(/&&/g, '&');
        }
        const mnemonicMatches = MENU_MNEMONIC_REGEX.exec(label);
        // Register mnemonics
        if (mnemonicMatches) {
            const mnemonic = !!mnemonicMatches[1] ? mnemonicMatches[1] : mnemonicMatches[3];
            if (this.options.enableMnemonics) {
                buttonElement.setAttribute('aria-keyshortcuts', 'Alt+' + mnemonic.toLocaleLowerCase());
            }
            else {
                buttonElement.removeAttribute('aria-keyshortcuts');
            }
        }
    }
    update(options) {
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
            this.overflowLayoutScheduled = DOM.scheduleAtNextAnimationFrame(DOM.getWindow(this.container), () => {
                this.updateOverflowAction();
                this.overflowLayoutScheduled = undefined;
            });
        }
        this.setUnfocusedState();
    }
    registerMnemonic(menuIndex, mnemonic) {
        this.mnemonics.set(mnemonic.toLocaleLowerCase(), menuIndex);
    }
    hideMenubar() {
        if (this.container.style.display !== 'none') {
            this.container.style.display = 'none';
            this._onVisibilityChange.fire(false);
        }
    }
    showMenubar() {
        if (this.container.style.display !== 'flex') {
            this.container.style.display = 'flex';
            this._onVisibilityChange.fire(true);
            this.updateOverflowAction();
        }
    }
    get focusState() {
        return this._focusState;
    }
    set focusState(value) {
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
                        }
                        else {
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
                    // When the menu is toggled on, it may be in compact state and trying to
                    // focus the first menu. In this case we should focus the overflow instead.
                    if (this.focusedMenu.index === 0 && this.numMenusShown === 0) {
                        this.focusedMenu.index = MenuBar.OVERFLOW_INDEX;
                    }
                    if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
                        this.overflowMenu.buttonElement.focus();
                    }
                    else {
                        this.menus[this.focusedMenu.index].buttonElement?.focus();
                    }
                }
                break;
            case MenubarState.OPEN:
                if (!isVisible) {
                    this.showMenubar();
                }
                if (this.focusedMenu) {
                    this.cleanupCustomMenu();
                    this.showCustomMenu(this.focusedMenu.index, this.openedViaKeyboard);
                }
                break;
        }
        this._focusState = value;
        this._onFocusStateChange.fire(this.focusState >= MenubarState.FOCUSED);
    }
    get isVisible() {
        return this.focusState >= MenubarState.VISIBLE;
    }
    get isFocused() {
        return this.focusState >= MenubarState.FOCUSED;
    }
    get isOpen() {
        return this.focusState >= MenubarState.OPEN;
    }
    get hasOverflow() {
        return this.isCompact || this.numMenusShown < this.menus.length;
    }
    get isCompact() {
        return this.options.compactMode !== undefined;
    }
    setUnfocusedState() {
        if (this.options.visibility === 'toggle' || this.options.visibility === 'hidden') {
            this.focusState = MenubarState.HIDDEN;
        }
        else if (this.options.visibility === 'classic' && browser.isFullscreen(mainWindow)) {
            this.focusState = MenubarState.HIDDEN;
        }
        else {
            this.focusState = MenubarState.VISIBLE;
        }
        this.ignoreNextMouseUp = false;
        this.mnemonicsInUse = false;
        this.updateMnemonicVisibility(false);
    }
    focusPrevious() {
        if (!this.focusedMenu || this.numMenusShown === 0) {
            return;
        }
        let newFocusedIndex = (this.focusedMenu.index - 1 + this.numMenusShown) % this.numMenusShown;
        if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
            newFocusedIndex = this.numMenusShown - 1;
        }
        else if (this.focusedMenu.index === 0 && this.hasOverflow) {
            newFocusedIndex = MenuBar.OVERFLOW_INDEX;
        }
        if (newFocusedIndex === this.focusedMenu.index) {
            return;
        }
        if (this.isOpen) {
            this.cleanupCustomMenu();
            this.showCustomMenu(newFocusedIndex);
        }
        else if (this.isFocused) {
            this.focusedMenu.index = newFocusedIndex;
            if (newFocusedIndex === MenuBar.OVERFLOW_INDEX) {
                this.overflowMenu.buttonElement.focus();
            }
            else {
                this.menus[newFocusedIndex].buttonElement?.focus();
            }
        }
    }
    focusNext() {
        if (!this.focusedMenu || this.numMenusShown === 0) {
            return;
        }
        let newFocusedIndex = (this.focusedMenu.index + 1) % this.numMenusShown;
        if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
            newFocusedIndex = 0;
        }
        else if (this.focusedMenu.index === this.numMenusShown - 1) {
            newFocusedIndex = MenuBar.OVERFLOW_INDEX;
        }
        if (newFocusedIndex === this.focusedMenu.index) {
            return;
        }
        if (this.isOpen) {
            this.cleanupCustomMenu();
            this.showCustomMenu(newFocusedIndex);
        }
        else if (this.isFocused) {
            this.focusedMenu.index = newFocusedIndex;
            if (newFocusedIndex === MenuBar.OVERFLOW_INDEX) {
                this.overflowMenu.buttonElement.focus();
            }
            else {
                this.menus[newFocusedIndex].buttonElement?.focus();
            }
        }
    }
    updateMnemonicVisibility(visible) {
        if (this.menus) {
            this.menus.forEach(menuBarMenu => {
                if (menuBarMenu.titleElement && menuBarMenu.titleElement.children.length) {
                    const child = menuBarMenu.titleElement.children.item(0);
                    if (child) {
                        child.style.textDecoration = (this.options.alwaysOnMnemonics || visible) ? 'underline' : '';
                    }
                }
            });
        }
    }
    get mnemonicsInUse() {
        return this._mnemonicsInUse;
    }
    set mnemonicsInUse(value) {
        this._mnemonicsInUse = value;
    }
    get shouldAltKeyFocus() {
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
    get onVisibilityChange() {
        return this._onVisibilityChange.event;
    }
    get onFocusStateChange() {
        return this._onFocusStateChange.event;
    }
    onMenuTriggered(menuIndex, clicked) {
        if (this.isOpen) {
            if (this.isCurrentMenu(menuIndex)) {
                this.setUnfocusedState();
            }
            else {
                this.cleanupCustomMenu();
                this.showCustomMenu(menuIndex, this.openedViaKeyboard);
            }
        }
        else {
            this.focusedMenu = { index: menuIndex };
            this.openedViaKeyboard = !clicked;
            this.focusState = MenubarState.OPEN;
        }
    }
    onModifierKeyToggled(modifierKeyStatus) {
        const allModifiersReleased = !modifierKeyStatus.altKey && !modifierKeyStatus.ctrlKey && !modifierKeyStatus.shiftKey && !modifierKeyStatus.metaKey;
        if (this.options.visibility === 'hidden') {
            return;
        }
        // Prevent alt-key default if the menu is not hidden and we use alt to focus
        if (modifierKeyStatus.event && this.shouldAltKeyFocus) {
            if (ScanCodeUtils.toEnum(modifierKeyStatus.event.code) === 159 /* ScanCode.AltLeft */) {
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
                }
                else if (!this.isOpen) {
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
    isCurrentMenu(menuIndex) {
        if (!this.focusedMenu) {
            return false;
        }
        return this.focusedMenu.index === menuIndex;
    }
    cleanupCustomMenu() {
        if (this.focusedMenu) {
            // Remove focus from the menus first
            if (this.focusedMenu.index === MenuBar.OVERFLOW_INDEX) {
                this.overflowMenu.buttonElement.focus();
            }
            else {
                this.menus[this.focusedMenu.index].buttonElement?.focus();
            }
            if (this.focusedMenu.holder) {
                this.focusedMenu.holder.parentElement?.classList.remove('open');
                this.focusedMenu.holder.remove();
            }
            this.focusedMenu.widget?.dispose();
            this.focusedMenu = { index: this.focusedMenu.index };
        }
        this.menuDisposables.clear();
    }
    showCustomMenu(menuIndex, selectFirst = true) {
        const actualMenuIndex = menuIndex >= this.numMenusShown ? MenuBar.OVERFLOW_INDEX : menuIndex;
        const customMenu = actualMenuIndex === MenuBar.OVERFLOW_INDEX ? this.overflowMenu : this.menus[actualMenuIndex];
        if (!customMenu.actions || !customMenu.buttonElement || !customMenu.titleElement) {
            return;
        }
        const menuHolder = $('div.menubar-menu-items-holder', { 'title': '' });
        customMenu.buttonElement.classList.add('open');
        const titleBoundingRect = customMenu.titleElement.getBoundingClientRect();
        const titleBoundingRectZoom = DOM.getDomNodeZoomLevel(customMenu.titleElement);
        if (this.options.compactMode?.horizontal === HorizontalDirection.Right) {
            menuHolder.style.left = `${titleBoundingRect.left + this.container.clientWidth}px`;
        }
        else if (this.options.compactMode?.horizontal === HorizontalDirection.Left) {
            const windowWidth = DOM.getWindow(this.container).innerWidth;
            menuHolder.style.right = `${windowWidth - titleBoundingRect.left}px`;
            menuHolder.style.left = 'auto';
        }
        else {
            menuHolder.style.left = `${titleBoundingRect.left * titleBoundingRectZoom}px`;
        }
        if (this.options.compactMode?.vertical === VerticalDirection.Above) {
            // TODO@benibenj Do not hardcode the height of the menu holder
            menuHolder.style.top = `${titleBoundingRect.top - this.menus.length * 30 + this.container.clientHeight}px`;
        }
        else if (this.options.compactMode?.vertical === VerticalDirection.Below) {
            menuHolder.style.top = `${titleBoundingRect.top}px`;
        }
        else {
            menuHolder.style.top = `${titleBoundingRect.bottom * titleBoundingRectZoom}px`;
        }
        customMenu.buttonElement.appendChild(menuHolder);
        const menuOptions = {
            getKeyBinding: this.options.getKeybinding,
            actionRunner: this.actionRunner,
            enableMnemonics: this.options.alwaysOnMnemonics || (this.mnemonicsInUse && this.options.enableMnemonics),
            ariaLabel: customMenu.buttonElement.getAttribute('aria-label') ?? undefined,
            expandDirection: this.isCompact ? this.options.compactMode : { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below },
            useEventAsContext: true
        };
        const menuWidget = this.menuDisposables.add(new Menu(menuHolder, customMenu.actions, menuOptions, this.menuStyle));
        this.menuDisposables.add(menuWidget.onDidCancel(() => {
            this.focusState = MenubarState.FOCUSED;
        }));
        if (actualMenuIndex !== menuIndex) {
            menuWidget.trigger(menuIndex - this.numMenusShown);
        }
        else {
            menuWidget.focus(selectFirst);
        }
        this.focusedMenu = {
            index: actualMenuIndex,
            holder: menuHolder,
            widget: menuWidget
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudWJhci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci91aS9tZW51L21lbnViYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLE9BQU8sTUFBTSxrQkFBa0IsQ0FBQztBQUM1QyxPQUFPLEtBQUssR0FBRyxNQUFNLGNBQWMsQ0FBQztBQUNwQyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBZ0IsTUFBTSxnQkFBZ0IsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUE2QyxJQUFJLEVBQUUsMkJBQTJCLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDckwsT0FBTyxFQUFFLFlBQVksRUFBMEIsU0FBUyxFQUFFLGFBQWEsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwwQkFBMEIsQ0FBQztBQUMxRCxPQUFPLEVBQTZCLGFBQWEsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXZGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLDhCQUE4QixDQUFDO0FBQ2pHLE9BQU8sRUFBRSxXQUFX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