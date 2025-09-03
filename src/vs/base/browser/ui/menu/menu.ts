/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFirefox } from '../../browser.js';
import { EventType as TouchEventType, Gesture } from '../../touch.js';
import { $, addDisposableListener, append, clearNode, Dimension, EventHelper, EventLike, EventType, getActiveElement, getWindow, IDomNodePagePosition, isAncestor, isInShadowDOM } from '../../dom.js';
import { createStyleSheet } from '../../domStylesheets.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { StandardMouseEvent } from '../../mouseEvent.js';
import { ActionBar, ActionsOrientation, IActionViewItemProvider } from '../actionbar/actionbar.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from '../actionbar/actionViewItems.js';
import { AnchorAlignment, layout, LayoutAnchorPosition } from '../contextview/contextview.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';
import { EmptySubmenuAction, IAction, IActionRunner, Separator, SubmenuAction } from '../../../common/actions.js';
import { RunOnceScheduler } from '../../../common/async.js';
import { Codicon } from '../../../common/codicons.js';
import { getCodiconFontCharacters } from '../../../common/codiconsUtil.js';
import { ThemeIcon } from '../../../common/themables.js';
import { Event } from '../../../common/event.js';
import { stripIcons } from '../../../common/iconLabels.js';
import { KeyCode } from '../../../common/keyCodes.js';
import { ResolvedKeybinding } from '../../../common/keybindings.js';
import { DisposableStore } from '../../../common/lifecycle.js';
import { isLinux, isMacintosh } from '../../../common/platform.js';
import { ScrollbarVisibility, ScrollEvent } from '../../../common/scrollable.js';
import * as strings from '../../../common/strings.js';

export const MENU_MNEMONIC_REGEX = /\(&([^\s&])\)|(^|[^&])&([^\s&])/;
export const MENU_ESCAPED_MNEMONIC_REGEX = /(&amp;)?(&amp;)([^\s&])/g;



export enum HorizontalDirection {
	Right,
	Left
}

export enum VerticalDirection {
	Above,
	Below
}

export interface IMenuDirection {
	horizontal: HorizontalDirection;
	vertical: VerticalDirection;
}

export interface IMenuOptions {
	context?: unknown;
	actionViewItemProvider?: IActionViewItemProvider;
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding | undefined;
	ariaLabel?: string;
	enableMnemonics?: boolean;
	anchorAlignment?: AnchorAlignment;
	expandDirection?: IMenuDirection;
	useEventAsContext?: boolean;
	submenuIds?: Set<string>;
}

export interface IMenuStyles {
	shadowColor: string | undefined;
	borderColor: string | undefined;
	foregroundColor: string | undefined;
	backgroundColor: string | undefined;
	selectionForegroundColor: string | undefined;
	selectionBackgroundColor: string | undefined;
	selectionBorderColor: string | undefined;
	separatorColor: string | undefined;
	scrollbarShadow: string | undefined;
	scrollbarSliderBackground: string | undefined;
	scrollbarSliderHoverBackground: string | undefined;
	scrollbarSliderActiveBackground: string | undefined;
}

export const unthemedMenuStyles: IMenuStyles = {
	shadowColor: undefined,
	borderColor: undefined,
	foregroundColor: undefined,
	backgroundColor: undefined,
	selectionForegroundColor: undefined,
	selectionBackgroundColor: undefined,
	selectionBorderColor: undefined,
	separatorColor: undefined,
	scrollbarShadow: undefined,
	scrollbarSliderBackground: undefined,
	scrollbarSliderHoverBackground: undefined,
	scrollbarSliderActiveBackground: undefined
};

interface ISubMenuData {
	parent: Menu;
	submenu?: Menu;
}

export class Menu extends ActionBar {
	private mnemonics: Map<string, Array<BaseMenuActionViewItem>>;
	private scrollableElement: DomScrollableElement;
	private menuElement: HTMLElement;
	static globalStyleSheet: HTMLStyleElement;
	protected styleSheet: HTMLStyleElement | undefined;

	constructor(container: HTMLElement, actions: ReadonlyArray<IAction>, options: IMenuOptions, private readonly menuStyles: IMenuStyles) {
		container.classList.add('monaco-menu-container');
		container.setAttribute('role', 'presentation');
		const menuElement = document.createElement('div');
		menuElement.classList.add('monaco-menu');
		menuElement.setAttribute('role', 'presentation');

		super(menuElement, {
			orientation: ActionsOrientation.VERTICAL,
			actionViewItemProvider: action => this.doGetActionViewItem(action, options, parentData),
			context: options.context,
			actionRunner: options.actionRunner,
			ariaLabel: options.ariaLabel,
			ariaRole: 'menu',
			focusOnlyEnabledItems: true,
			triggerKeys: { keys: [KeyCode.Enter, ...(isMacintosh || isLinux ? [KeyCode.Space] : [])], keyDown: true }
		});

		this.menuElement = menuElement;

		this.actionsList.tabIndex = 0;

		this.initializeOrUpdateStyleSheet(container, menuStyles);

		this._register(Gesture.addTarget(menuElement));

		this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, (e) => {
			const event = new StandardKeyboardEvent(e);

			// Stop tab navigation of menus
			if (event.equals(KeyCode.Tab)) {
				e.preventDefault();
			}
		}));

		if (options.enableMnemonics) {
			this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, (e) => {
				const key = e.key.toLocaleLowerCase();
				if (this.mnemonics.has(key)) {
					EventHelper.stop(e, true);
					const actions = this.mnemonics.get(key)!;

					if (actions.length === 1) {
						if (actions[0] instanceof SubmenuMenuActionViewItem && actions[0].container) {
							this.focusItemByElement(actions[0].container);
						}

						actions[0].onClick(e);
					}

					if (actions.length > 1) {
						const action = actions.shift();
						if (action && action.container) {
							this.focusItemByElement(action.container);
							actions.push(action);
						}

						this.mnemonics.set(key, actions);
					}
				}
			}));
		}

		if (isLinux) {
			this._register(addDisposableListener(menuElement, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);

				if (event.equals(KeyCode.Home) || event.equals(KeyCode.PageUp)) {
					this.focusedItem = this.viewItems.length - 1;
					this.focusNext();
					EventHelper.stop(e, true);
				} else if (event.equals(KeyCode.End) || event.equals(KeyCode.PageDown)) {
					this.focusedItem = 0;
					this.focusPrevious();
					EventHelper.stop(e, true);
				}
			}));
		}

		this._register(addDisposableListener(this.domNode, EventType.MOUSE_OUT, e => {
			const relatedTarget = e.relatedTarget as HTMLElement;
			if (!isAncestor(relatedTarget, this.domNode)) {
				this.focusedItem = undefined;
				this.updateFocus();
				e.stopPropagation();
			}
		}));

		this._register(addDisposableListener(this.actionsList, EventType.MOUSE_OVER, e => {
			let target = e.target as HTMLElement;
			if (!target || !isAncestor(target, this.actionsList) || target === this.actionsList) {
				return;
			}

			while (target.parentElement !== this.actionsList && target.parentElement !== null) {
				target = target.parentElement;
			}

			if (target.classList.contains('action-item')) {
				const lastFocusedItem = this.focusedItem;
				this.setFocusedItem(target);

				if (lastFocusedItem !== this.focusedItem) {
					this.updateFocus();
				}
			}
		}));

		// Support touch on actions list to focus items (needed for submenus)
		this._register(Gesture.addTarget(this.actionsList));
		this._register(addDisposableListener(this.actionsList, TouchEventType.Tap, e => {
			let target = e.initialTarget as HTMLElement;
			if (!target || !isAncestor(target, this.actionsList) || target === this.actionsList) {
				return;
			}

			while (target.parentElement !== this.actionsList && target.parentElement !== null) {
				target = target.parentElement;
			}

			if (target.classList.contains('action-item')) {
				const lastFocusedItem = this.focusedItem;
				this.setFocusedItem(target);

				if (lastFocusedItem !== this.focusedItem) {
					this.updateFocus();
				}
			}
		}));


		const parentData: ISubMenuData = {
			parent: this
		};

		this.mnemonics = new Map<string, Array<BaseMenuActionViewItem>>();

		// Scroll Logic
		this.scrollableElement = this._register(new DomScrollableElement(menuElement, {
			alwaysConsumeMouseWheel: true,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Visible,
			verticalScrollbarSize: 7,
			handleMouseWheel: true,
			useShadows: true
		}));

		const scrollElement = this.scrollableElement.getDomNode();
		scrollElement.style.position = '';

		this.styleScrollElement(scrollElement, menuStyles);

		// Support scroll on menu drag
		this._register(addDisposableListener(menuElement, TouchEventType.Change, e => {
			EventHelper.stop(e, true);

			const scrollTop = this.scrollableElement.getScrollPosition().scrollTop;
			this.scrollableElement.setScrollPosition({ scrollTop: scrollTop - e.translationY });
		}));

		this._register(addDisposableListener(scrollElement, EventType.MOUSE_UP, e => {
			// Absorb clicks in menu dead space https://github.com/microsoft/vscode/issues/63575
			// We do this on the scroll element so the scroll bar doesn't dismiss the menu either
			e.preventDefault();
		}));

		const window = getWindow(container);
		menuElement.style.maxHeight = `${Math.max(10, window.innerHeight - container.getBoundingClientRect().top - 35)}px`;

		actions = actions.filter((a, idx) => {
			if (options.submenuIds?.has(a.id)) {
				console.warn(`Found submenu cycle: ${a.id}`);
				return false;
			}

			// Filter out consecutive or useless separators
			if (a instanceof Separator) {
				if (idx === actions.length - 1 || idx === 0) {
					return false;
				}

				const prevAction = actions[idx - 1];
				if (prevAction instanceof Separator) {
					return false;
				}
			}

			return true;
		});

		this.push(actions, { icon: true, label: true, isMenu: true });

		container.appendChild(this.scrollableElement.getDomNode());
		this.scrollableElement.scanDomNode();

		this.viewItems.filter(item => !(item instanceof MenuSeparatorActionViewItem)).forEach((item, index, array) => {
			(item as BaseMenuActionViewItem).updatePositionInSet(index + 1, array.length);
		});
	}

	private initializeOrUpdateStyleSheet(container: HTMLElement, style: IMenuStyles): void {
		if (!this.styleSheet) {
			if (isInShadowDOM(container)) {
				this.styleSheet = createStyleSheet(container);
			} else {
				if (!Menu.globalStyleSheet) {
					Menu.globalStyleSheet = createStyleSheet();
				}
				this.styleSheet = Menu.globalStyleSheet;
			}
		}
		this.styleSheet.textContent = getMenuWidgetCSS(style, isInShadowDOM(container));
	}

	private styleScrollElement(scrollElement: HTMLElement, style: IMenuStyles): void {

		const fgColor = style.foregroundColor ?? '';
		const bgColor = style.backgroundColor ?? '';
		const border = style.borderColor ? `1px solid ${style.borderColor}` : '';
		const borderRadius = '5px';
		const shadow = style.shadowColor ? `0 2px 8px ${style.shadowColor}` : '';

		scrollElement.style.outline = border;
		scrollElement.style.borderRadius = borderRadius;
		scrollElement.style.color = fgColor;
		scrollElement.style.backgroundColor = bgColor;
		scrollElement.style.boxShadow = shadow;
	}

	override getContainer(): HTMLElement {
		return this.scrollableElement.getDomNode();
	}

	get onScroll(): Event<ScrollEvent> {
		return this.scrollableElement.onScroll;
	}

	get scrollOffset(): number {
		return this.menuElement.scrollTop;
	}

	trigger(index: number): void {
		if (index <= this.viewItems.length && index >= 0) {
			const item = this.viewItems[index];
			if (item instanceof SubmenuMenuActionViewItem) {
				super.focus(index);
				item.open(true);
			} else if (item instanceof BaseMenuActionViewItem) {
				super.run(item._action, item._context);
			} else {
				return;
			}
		}
	}

	private focusItemByElement(element: HTMLElement) {
		const lastFocusedItem = this.focusedItem;
		this.setFocusedItem(element);

		if (lastFocusedItem !== this.focusedItem) {
			this.updateFocus();
		}
	}

	private setFocusedItem(element: HTMLElement): void {
		for (let i = 0; i < this.actionsList.children.length; i++) {
			const elem = this.actionsList.children[i];
			if (element === elem) {
				this.focusedItem = i;
				break;
			}
		}
	}

	protected override updateFocus(fromRight?: boolean): void {
		super.updateFocus(fromRight, true, true);

		if (typeof this.focusedItem !== 'undefined') {
			// Workaround for #80047 caused by an issue in chromium
			// https://bugs.chromium.org/p/chromium/issues/detail?id=414283
			// When that's fixed, just call this.scrollableElement.scanDomNode()
			this.scrollableElement.setScrollPosition({
				scrollTop: Math.round(this.menuElement.scrollTop)
			});
		}
	}

	private doGetActionViewItem(action: IAction, options: IMenuOptions, parentData: ISubMenuData): BaseActionViewItem {
		if (action instanceof Separator) {
			return new MenuSeparatorActionViewItem(options.context, action, { icon: true }, this.menuStyles);
		} else if (action instanceof SubmenuAction) {
			const menuActionViewItem = new SubmenuMenuActionViewItem(action, action.actions, parentData, { ...options, submenuIds: new Set([...(options.submenuIds || []), action.id]) }, this.menuStyles);

			if (options.enableMnemonics) {
				const mnemonic = menuActionViewItem.getMnemonic();
				if (mnemonic && menuActionViewItem.isEnabled()) {
					let actionViewItems: BaseMenuActionViewItem[] = [];
					if (this.mnemonics.has(mnemonic)) {
						actionViewItems = this.mnemonics.get(mnemonic)!;
					}

					actionViewItems.push(menuActionViewItem);

					this.mnemonics.set(mnemonic, actionViewItems);
				}
			}

			return menuActionViewItem;
		} else {
			const keybindingLabel = options.getKeyBinding?.(action)?.getLabel();
			const menuItemOptions: IMenuItemOptions = {
				enableMnemonics: options.enableMnemonics,
				useEventAsContext: options.useEventAsContext,
				keybinding: keybindingLabel,
			};

			const menuActionViewItem = new BaseMenuActionViewItem(options.context, action, menuItemOptions, this.menuStyles);

			if (options.enableMnemonics) {
				const mnemonic = menuActionViewItem.getMnemonic();
				if (mnemonic && menuActionViewItem.isEnabled()) {
					let actionViewItems: BaseMenuActionViewItem[] = [];
					if (this.mnemonics.has(mnemonic)) {
						actionViewItems = this.mnemonics.get(mnemonic)!;
					}

					actionViewItems.push(menuActionViewItem);

					this.mnemonics.set(mnemonic, actionViewItems);
				}
			}

			return menuActionViewItem;
		}
	}
}

interface IMenuItemOptions extends IActionViewItemOptions {
	readonly enableMnemonics?: boolean;
}

class BaseMenuActionViewItem extends BaseActionViewItem {

	public container: HTMLElement | undefined;

	protected override options: IMenuItemOptions;
	protected item: HTMLElement | undefined;

	private runOnceToEnableMouseUp: RunOnceScheduler;
	private label: HTMLElement | undefined;
	private check: HTMLElement | undefined;
	private mnemonic: string | undefined;
	private cssClass: string;

	constructor(ctx: unknown, action: IAction, options: IMenuItemOptions, protected readonly menuStyle: IMenuStyles) {
		options = {
			...options,
			isMenu: true,
			icon: options.icon !== undefined ? options.icon : false,
			label: options.label !== undefined ? options.label : true,
		};
		super(action, action, options);

		this.options = options;
		this.cssClass = '';

		// Set mnemonic
		if (this.options.label && options.enableMnemonics) {
			const label = this.action.label;
			if (label) {
				const matches = MENU_MNEMONIC_REGEX.exec(label);
				if (matches) {
					this.mnemonic = (!!matches[1] ? matches[1] : matches[3]).toLocaleLowerCase();
				}
			}
		}

		// Add mouse up listener later to avoid accidental clicks
		this.runOnceToEnableMouseUp = new RunOnceScheduler(() => {
			if (!this.element) {
				return;
			}

			this._register(addDisposableListener(this.element, EventType.MOUSE_UP, e => {
				// removed default prevention as it conflicts
				// with BaseActionViewItem #101537
				// add back if issues arise and link new issue
				EventHelper.stop(e, true);

				// See https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Interact_with_the_clipboard
				// > Writing to the clipboard
				// > You can use the "cut" and "copy" commands without any special
				// permission if you are using them in a short-lived event handler
				// for a user action (for example, a click handler).

				// => to get the Copy and Paste context menu actions working on Firefox,
				// there should be no timeout here
				if (isFirefox) {
					const mouseEvent = new StandardMouseEvent(getWindow(this.element), e);

					// Allowing right click to trigger the event causes the issue described below,
					// but since the solution below does not work in FF, we must disable right click
					if (mouseEvent.rightButton) {
						return;
					}

					this.onClick(e);
				}

				// In all other cases, set timeout to allow context menu cancellation to trigger
				// otherwise the action will destroy the menu and a second context menu
				// will still trigger for right click.
				else {
					setTimeout(() => {
						this.onClick(e);
					}, 0);
				}
			}));

			this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, e => {
				EventHelper.stop(e, true);
			}));
		}, 100);

		this._register(this.runOnceToEnableMouseUp);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		this.container = container;

		this.item = append(this.element, $('a.action-menu-item'));
		if (this._action.id === Separator.ID) {
			// A separator is a presentation item
			this.item.setAttribute('role', 'presentation');
		} else {
			this.item.setAttribute('role', 'menuitem');
			if (this.mnemonic) {
				this.item.setAttribute('aria-keyshortcuts', `${this.mnemonic}`);
			}
		}

		this.check = append(this.item, $('span.menu-item-check' + ThemeIcon.asCSSSelector(Codicon.menuSelection)));
		this.check.setAttribute('role', 'none');

		this.label = append(this.item, $('span.action-label'));

		if (this.options.label && this.options.keybinding) {
			append(this.item, $('span.keybinding')).textContent = this.options.keybinding;
		}

		// Adds mouse up listener to actually run the action
		this.runOnceToEnableMouseUp.schedule();

		this.updateClass();
		this.updateLabel();
		this.updateTooltip();
		this.updateEnabled();
		this.updateChecked();

		this.applyStyle();
	}

	override blur(): void {
		super.blur();
		this.applyStyle();
	}

	override focus(): void {
		super.focus();

		this.item?.focus();

		this.applyStyle();
	}

	updatePositionInSet(pos: number, setSize: number): void {
		if (this.item) {
			this.item.setAttribute('aria-posinset', `${pos}`);
			this.item.setAttribute('aria-setsize', `${setSize}`);
		}
	}

	protected override updateLabel(): void {
		if (!this.label) {
			return;
		}

		if (this.options.label) {
			clearNode(this.label);

			let label = stripIcons(this.action.label);
			if (label) {
				const cleanLabel = cleanMnemonic(label);
				if (!this.options.enableMnemonics) {
					label = cleanLabel;
				}

				this.label.setAttribute('aria-label', cleanLabel.replace(/&&/g, '&'));

				const matches = MENU_MNEMONIC_REGEX.exec(label);

				if (matches) {
					label = strings.escape(label);

					// This is global, reset it
					MENU_ESCAPED_MNEMONIC_REGEX.lastIndex = 0;
					let escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(label);

					// We can't use negative lookbehind so if we match our negative and skip
					while (escMatch && escMatch[1]) {
						escMatch = MENU_ESCAPED_MNEMONIC_REGEX.exec(label);
					}

					const replaceDoubleEscapes = (str: string) => str.replace(/&amp;&amp;/g, '&amp;');

					if (escMatch) {
						this.label.append(
							strings.ltrim(replaceDoubleEscapes(label.substr(0, escMatch.index)), ' '),
							$('u', { 'aria-hidden': 'true' },
								escMatch[3]),
							strings.rtrim(replaceDoubleEscapes(label.substr(escMatch.index + escMatch[0].length)), ' '));
					} else {
						this.label.textContent = replaceDoubleEscapes(label).trim();
					}

					this.item?.setAttribute('aria-keyshortcuts', (!!matches[1] ? matches[1] : matches[3]).toLocaleLowerCase());
				} else {
					this.label.textContent = label.replace(/&&/g, '&').trim();
				}
			}
		}
	}

	protected override updateTooltip(): void {
		// menus should function like native menus and they do not have tooltips
	}

	protected override updateClass(): void {
		if (this.cssClass && this.item) {
			this.item.classList.remove(...this.cssClass.split(' '));
		}
		if (this.options.icon && this.label) {
			this.cssClass = this.action.class || '';
			this.label.classList.add('icon');
			if (this.cssClass) {
				this.label.classList.add(...this.cssClass.split(' '));
			}
			this.updateEnabled();
		} else if (this.label) {
			this.label.classList.remove('icon');
		}
	}

	protected override updateEnabled(): void {
		if (this.action.enabled) {
			if (this.element) {
				this.element.classList.remove('disabled');
				this.element.removeAttribute('aria-disabled');
			}

			if (this.item) {
				this.item.classList.remove('disabled');
				this.item.removeAttribute('aria-disabled');
				this.item.tabIndex = 0;
			}
		} else {
			if (this.element) {
				this.element.classList.add('disabled');
				this.element.setAttribute('aria-disabled', 'true');
			}

			if (this.item) {
				this.item.classList.add('disabled');
				this.item.setAttribute('aria-disabled', 'true');
			}
		}
	}

	protected override updateChecked(): void {
		if (!this.item) {
			return;
		}

		const checked = this.action.checked;
		this.item.classList.toggle('checked', !!checked);
		if (checked !== undefined) {
			this.item.setAttribute('role', 'menuitemcheckbox');
			this.item.setAttribute('aria-checked', checked ? 'true' : 'false');
		} else {
			this.item.setAttribute('role', 'menuitem');
			this.item.setAttribute('aria-checked', '');
		}
	}

	getMnemonic(): string | undefined {
		return this.mnemonic;
	}

	protected applyStyle(): void {
		const isSelected = this.element && this.element.classList.contains('focused');
		const fgColor = isSelected && this.menuStyle.selectionForegroundColor ? this.menuStyle.selectionForegroundColor : this.menuStyle.foregroundColor;
		const bgColor = isSelected && this.menuStyle.selectionBackgroundColor ? this.menuStyle.selectionBackgroundColor : undefined;
		const outline = isSelected && this.menuStyle.selectionBorderColor ? `1px solid ${this.menuStyle.selectionBorderColor}` : '';
		const outlineOffset = isSelected && this.menuStyle.selectionBorderColor ? `-1px` : '';

		if (this.item) {
			this.item.style.color = fgColor ?? '';
			this.item.style.backgroundColor = bgColor ?? '';
			this.item.style.outline = outline;
			this.item.style.outlineOffset = outlineOffset;
		}

		if (this.check) {
			this.check.style.color = fgColor ?? '';
		}
	}
}

class SubmenuMenuActionViewItem extends BaseMenuActionViewItem {
	private mysubmenu: Menu | null = null;
	private submenuContainer: HTMLElement | undefined;
	private submenuIndicator: HTMLElement | undefined;
	private readonly submenuDisposables = this._register(new DisposableStore());
	private mouseOver: boolean = false;
	private showScheduler: RunOnceScheduler;
	private hideScheduler: RunOnceScheduler;
	private expandDirection: IMenuDirection;

	constructor(
		action: IAction,
		private submenuActions: ReadonlyArray<IAction>,
		private parentData: ISubMenuData,
		private submenuOptions: IMenuOptions,
		menuStyles: IMenuStyles
	) {
		super(action, action, submenuOptions, menuStyles);

		this.expandDirection = submenuOptions && submenuOptions.expandDirection !== undefined ? submenuOptions.expandDirection : { horizontal: HorizontalDirection.Right, vertical: VerticalDirection.Below };

		this.showScheduler = new RunOnceScheduler(() => {
			if (this.mouseOver) {
				this.cleanupExistingSubmenu(false);
				this.createSubmenu(false);
			}
		}, 250);

		this.hideScheduler = new RunOnceScheduler(() => {
			if (this.element && (!isAncestor(getActiveElement(), this.element) && this.parentData.submenu === this.mysubmenu)) {
				this.parentData.parent.focus(false);
				this.cleanupExistingSubmenu(true);
			}
		}, 750);
	}

	override render(container: HTMLElement): void {
		super.render(container);

		if (!this.element) {
			return;
		}

		if (this.item) {
			this.item.classList.add('monaco-submenu-item');
			this.item.tabIndex = 0;
			this.item.setAttribute('aria-haspopup', 'true');
			this.updateAriaExpanded('false');
			this.submenuIndicator = append(this.item, $('span.submenu-indicator' + ThemeIcon.asCSSSelector(Codicon.menuSubmenu)));
			this.submenuIndicator.setAttribute('aria-hidden', 'true');
		}

		this._register(addDisposableListener(this.element, EventType.KEY_UP, e => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
				EventHelper.stop(e, true);

				this.createSubmenu(true);
			}
		}));

		this._register(addDisposableListener(this.element, EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);

			if (getActiveElement() === this.item) {
				if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
					EventHelper.stop(e, true);
				}
			}
		}));

		this._register(addDisposableListener(this.element, EventType.MOUSE_OVER, e => {
			if (!this.mouseOver) {
				this.mouseOver = true;

				this.showScheduler.schedule();
			}
		}));

		this._register(addDisposableListener(this.element, EventType.MOUSE_LEAVE, e => {
			this.mouseOver = false;
		}));

		this._register(addDisposableListener(this.element, EventType.FOCUS_OUT, e => {
			if (this.element && !isAncestor(getActiveElement(), this.element)) {
				this.hideScheduler.schedule();
			}
		}));

		this._register(this.parentData.parent.onScroll(() => {
			if (this.parentData.submenu === this.mysubmenu) {
				this.parentData.parent.focus(false);
				this.cleanupExistingSubmenu(true);
			}
		}));
	}

	protected override updateEnabled(): void {
		// override on submenu entry
		// native menus do not observe enablement on sumbenus
		// we mimic that behavior
	}

	open(selectFirst?: boolean): void {
		this.cleanupExistingSubmenu(false);
		this.createSubmenu(selectFirst);
	}

	override onClick(e: EventLike): void {
		// stop clicking from trying to run an action
		EventHelper.stop(e, true);

		this.cleanupExistingSubmenu(false);
		this.createSubmenu(true);
	}

	private cleanupExistingSubmenu(force: boolean): void {
		if (this.parentData.submenu && (force || (this.parentData.submenu !== this.mysubmenu))) {

			// disposal may throw if the submenu has already been removed
			try {
				this.parentData.submenu.dispose();
			} catch { }

			this.parentData.submenu = undefined;
			this.updateAriaExpanded('false');
			if (this.submenuContainer) {
				this.submenuDisposables.clear();
				this.submenuContainer = undefined;
			}
		}
	}

	private calculateSubmenuMenuLayout(windowDimensions: Dimension, submenu: Dimension, entry: IDomNodePagePosition, expandDirection: IMenuDirection): { top: number; left: number } {
		const ret = { top: 0, left: 0 };

		// Start with horizontal
		ret.left = layout(windowDimensions.width, submenu.width, { position: expandDirection.horizontal === HorizontalDirection.Right ? LayoutAnchorPosition.Before : LayoutAnchorPosition.After, offset: entry.left, size: entry.width });

		// We don't have enough room to layout the menu fully, so we are overlapping the menu
		if (ret.left >= entry.left && ret.left < entry.left + entry.width) {
			if (entry.left + 10 + submenu.width <= windowDimensions.width) {
				ret.left = entry.left + 10;
			}

			entry.top += 10;
			entry.height = 0;
		}

		// Now that we have a horizontal position, try layout vertically
		ret.top = layout(windowDimensions.height, submenu.height, { position: LayoutAnchorPosition.Before, offset: entry.top, size: 0 });

		// We didn't have enough room below, but we did above, so we shift down to align the menu
		if (ret.top + submenu.height === entry.top && ret.top + entry.height + submenu.height <= windowDimensions.height) {
			ret.top += entry.height;
		}

		return ret;
	}

	private createSubmenu(selectFirstItem = true): void {
		if (!this.element) {
			return;
		}

		if (!this.parentData.submenu) {
			this.updateAriaExpanded('true');
			this.submenuContainer = append(this.element, $('div.monaco-submenu'));
			this.submenuContainer.classList.add('menubar-menu-items-holder', 'context-view');

			// Set the top value of the menu container before construction
			// This allows the menu constructor to calculate the proper max height
			const computedStyles = getWindow(this.parentData.parent.domNode).getComputedStyle(this.parentData.parent.domNode);
			const paddingTop = parseFloat(computedStyles.paddingTop || '0') || 0;
			this.submenuContainer.style.position = 'fixed';
			this.submenuContainer.style.top = '0';
			this.submenuContainer.style.left = '0';

			this.parentData.submenu = new Menu(this.submenuContainer, this.submenuActions.length ? this.submenuActions : [new EmptySubmenuAction()], this.submenuOptions, this.menuStyle);

			// layout submenu
			const entryBox = this.element.getBoundingClientRect();
			const entryBoxUpdated = {
				top: entryBox.top - paddingTop,
				left: entryBox.left,
				height: entryBox.height + 2 * paddingTop,
				width: entryBox.width
			};

			const viewBox = this.submenuContainer.getBoundingClientRect();

			const window = getWindow(this.element);
			const { top, left } = this.calculateSubmenuMenuLayout(new Dimension(window.innerWidth, window.innerHeight), Dimension.lift(viewBox), entryBoxUpdated, this.expandDirection);
			// subtract offsets caused by transform parent
			this.submenuContainer.style.left = `${left - viewBox.left}px`;
			this.submenuContainer.style.top = `${top - viewBox.top}px`;

			this.submenuDisposables.add(addDisposableListener(this.submenuContainer, EventType.KEY_UP, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);

					this.parentData.parent.focus();

					this.cleanupExistingSubmenu(true);
				}
			}));

			this.submenuDisposables.add(addDisposableListener(this.submenuContainer, EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);
				}
			}));


			this.submenuDisposables.add(this.parentData.submenu.onDidCancel(() => {
				this.parentData.parent.focus();

				this.cleanupExistingSubmenu(true);
			}));

			this.parentData.submenu.focus(selectFirstItem);

			this.mysubmenu = this.parentData.submenu;
		} else {
			this.parentData.submenu.focus(false);
		}
	}

	private updateAriaExpanded(value: string): void {
		if (this.item) {
			this.item?.setAttribute('aria-expanded', value);
		}
	}

	protected override applyStyle(): void {
		super.applyStyle();

		const isSelected = this.element && this.element.classList.contains('focused');
		const fgColor = isSelected && this.menuStyle.selectionForegroundColor ? this.menuStyle.selectionForegroundColor : this.menuStyle.foregroundColor;

		if (this.submenuIndicator) {
			this.submenuIndicator.style.color = fgColor ?? '';
		}
	}

	override dispose(): void {
		super.dispose();

		this.hideScheduler.dispose();

		if (this.mysubmenu) {
			this.mysubmenu.dispose();
			this.mysubmenu = null;
		}

		if (this.submenuContainer) {
			this.submenuContainer = undefined;
		}
	}
}

class MenuSeparatorActionViewItem extends ActionViewItem {
	constructor(context: unknown, action: IAction, options: IActionViewItemOptions, private readonly menuStyles: IMenuStyles) {
		super(context, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		if (this.label) {
			this.label.style.borderBottomColor = this.menuStyles.separatorColor ? `${this.menuStyles.separatorColor}` : '';
		}
	}
}

export function cleanMnemonic(label: string): string {
	const regex = MENU_MNEMONIC_REGEX;

	const matches = regex.exec(label);
	if (!matches) {
		return label;
	}

	const mnemonicInText = !matches[1];

	return label.replace(regex, mnemonicInText ? '$2$3' : '').trim();
}

export function formatRule(c: ThemeIcon) {
	const fontCharacter = getCodiconFontCharacters()[c.id];
	return `.codicon-${c.id}:before { content: '\\${fontCharacter.toString(16)}'; }`;
}

export function getMenuWidgetCSS(style: IMenuStyles, isForShadowDom: boolean): string {
	let result = /* css */`
.monaco-menu {
	font-size: 13px;
	border-radius: 5px;
	min-width: 160px;
}

${formatRule(Codicon.menuSelection)}
${formatRule(Codicon.menuSubmenu)}

.monaco-menu .monaco-action-bar {
	text-align: right;
	overflow: hidden;
	white-space: nowrap;
}

.monaco-menu .monaco-action-bar .actions-container {
	display: flex;
	margin: 0 auto;
	padding: 0;
	width: 100%;
	justify-content: flex-end;
}

.monaco-menu .monaco-action-bar.vertical .actions-container {
	display: inline-block;
}

.monaco-menu .monaco-action-bar.reverse .actions-container {
	flex-direction: row-reverse;
}

.monaco-menu .monaco-action-bar .action-item {
	cursor: pointer;
	display: inline-block;
	transition: transform 50ms ease;
	position: relative;  /* DO NOT REMOVE - this is the key to preventing the ghosting icon bug in Chrome 42 */
}

.monaco-menu .monaco-action-bar .action-item.disabled {
	cursor: default;
}

.monaco-menu .monaco-action-bar .action-item .icon,
.monaco-menu .monaco-action-bar .action-item .codicon {
	display: inline-block;
}

.monaco-menu .monaco-action-bar .action-item .codicon {
	display: flex;
	align-items: center;
}

.monaco-menu .monaco-action-bar .action-label {
	font-size: 11px;
	margin-right: 4px;
}

.monaco-menu .monaco-action-bar .action-item.disabled .action-label,
.monaco-menu .monaco-action-bar .action-item.disabled .action-label:hover {
	color: var(--vscode-disabledForeground);
}

/* Vertical actions */

.monaco-menu .monaco-action-bar.vertical {
	text-align: left;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	display: block;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	display: block;
	border-bottom: 1px solid var(--vscode-menu-separatorBackground);
	padding-top: 1px;
	padding: 30px;
}

.monaco-menu .secondary-actions .monaco-action-bar .action-label {
	margin-left: 6px;
}

/* Action Items */
.monaco-menu .monaco-action-bar .action-item.select-container {
	overflow: hidden; /* somehow the dropdown overflows its container, we prevent it here to not push */
	flex: 1;
	max-width: 170px;
	min-width: 60px;
	display: flex;
	align-items: center;
	justify-content: center;
	margin-right: 10px;
}

.monaco-menu .monaco-action-bar.vertical {
	margin-left: 0;
	overflow: visible;
}

.monaco-menu .monaco-action-bar.vertical .actions-container {
	display: block;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	padding: 0;
	transform: none;
	display: flex;
}

.monaco-menu .monaco-action-bar.vertical .action-item.active {
	transform: none;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item {
	flex: 1 1 auto;
	display: flex;
	height: 2em;
	align-items: center;
	position: relative;
	margin: 0 4px;
	border-radius: 4px;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item:hover .keybinding,
.monaco-menu .monaco-action-bar.vertical .action-menu-item:focus .keybinding {
	opacity: unset;
}

.monaco-menu .monaco-action-bar.vertical .action-label {
	flex: 1 1 auto;
	text-decoration: none;
	padding: 0 1em;
	background: none;
	font-size: 12px;
	line-height: 1;
}

.monaco-menu .monaco-action-bar.vertical .keybinding,
.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	display: inline-block;
	flex: 2 1 auto;
	padding: 0 1em;
	text-align: right;
	font-size: 12px;
	line-height: 1;
	opacity: 0.7;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator.codicon {
	font-size: 16px !important;
	display: flex;
	align-items: center;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator.codicon::before {
	margin-left: auto;
	margin-right: -20px;
}

.monaco-menu .monaco-action-bar.vertical .action-item.disabled .keybinding,
.monaco-menu .monaco-action-bar.vertical .action-item.disabled .submenu-indicator {
	opacity: 0.4;
}

.monaco-menu .monaco-action-bar.vertical .action-label:not(.separator) {
	display: inline-block;
	box-sizing: border-box;
	margin: 0;
}

.monaco-menu .monaco-action-bar.vertical .action-item {
	position: static;
	overflow: visible;
}

.monaco-menu .monaco-action-bar.vertical .action-item .monaco-submenu {
	position: absolute;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	width: 100%;
	height: 0px !important;
	opacity: 1;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator.text {
	padding: 0.7em 1em 0.1em 1em;
	font-weight: bold;
	opacity: 1;
}

.monaco-menu .monaco-action-bar.vertical .action-label:hover {
	color: inherit;
}

.monaco-menu .monaco-action-bar.vertical .menu-item-check {
	position: absolute;
	visibility: hidden;
	width: 1em;
	height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item.checked .menu-item-check {
	visibility: visible;
	display: flex;
	align-items: center;
	justify-content: center;
}

/* Context Menu */

.context-view.monaco-menu-container {
	outline: 0;
	border: none;
	animation: fadeIn 0.083s linear;
	-webkit-app-region: no-drag;
}

.context-view.monaco-menu-container :focus,
.context-view.monaco-menu-container .monaco-action-bar.vertical:focus,
.context-view.monaco-menu-container .monaco-action-bar.vertical :focus {
	outline: 0;
}

.hc-black .context-view.monaco-menu-container,
.hc-light .context-view.monaco-menu-container,
:host-context(.hc-black) .context-view.monaco-menu-container,
:host-context(.hc-light) .context-view.monaco-menu-container {
	box-shadow: none;
}

.hc-black .monaco-menu .monaco-action-bar.vertical .action-item.focused,
.hc-light .monaco-menu .monaco-action-bar.vertical .action-item.focused,
:host-context(.hc-black) .monaco-menu .monaco-action-bar.vertical .action-item.focused,
:host-context(.hc-light) .monaco-menu .monaco-action-bar.vertical .action-item.focused {
	background: none;
}

/* Vertical Action Bar Styles */

.monaco-menu .monaco-action-bar.vertical {
	padding: 4px 0;
}

.monaco-menu .monaco-action-bar.vertical .action-menu-item {
	height: 2em;
}

.monaco-menu .monaco-action-bar.vertical .action-label:not(.separator),
.monaco-menu .monaco-action-bar.vertical .keybinding {
	font-size: inherit;
	padding: 0 2em;
	max-height: 100%;
}

.monaco-menu .monaco-action-bar.vertical .menu-item-check {
	font-size: inherit;
	width: 2em;
}

.monaco-menu .monaco-action-bar.vertical .action-label.separator {
	font-size: inherit;
	margin: 5px 0 !important;
	padding: 0;
	border-radius: 0;
}

.linux .monaco-menu .monaco-action-bar.vertical .action-label.separator,
:host-context(.linux) .monaco-menu .monaco-action-bar.vertical .action-label.separator {
	margin-left: 0;
	margin-right: 0;
}

.monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	font-size: 60%;
	padding: 0 1.8em;
}

.linux .monaco-menu .monaco-action-bar.vertical .submenu-indicator,
:host-context(.linux) .monaco-menu .monaco-action-bar.vertical .submenu-indicator {
	height: 100%;
	mask-size: 10px 10px;
	-webkit-mask-size: 10px 10px;
}

.monaco-menu .action-item {
	cursor: default;
}`;

	if (isForShadowDom) {
		// Only define scrollbar styles when used inside shadow dom,
		// otherwise leave their styling to the global workbench styling.
		result += `
			/* Arrows */
			.monaco-scrollable-element > .scrollbar > .scra {
				cursor: pointer;
				font-size: 11px !important;
			}

			.monaco-scrollable-element > .visible {
				opacity: 1;

				/* Background rule added for IE9 - to allow clicks on dom node */
				background:rgba(0,0,0,0);

				transition: opacity 100ms linear;
			}
			.monaco-scrollable-element > .invisible {
				opacity: 0;
				pointer-events: none;
			}
			.monaco-scrollable-element > .invisible.fade {
				transition: opacity 800ms linear;
			}

			/* Scrollable Content Inset Shadow */
			.monaco-scrollable-element > .shadow {
				position: absolute;
				display: none;
			}
			.monaco-scrollable-element > .shadow.top {
				display: block;
				top: 0;
				left: 3px;
				height: 3px;
				width: 100%;
			}
			.monaco-scrollable-element > .shadow.left {
				display: block;
				top: 3px;
				left: 0;
				height: 100%;
				width: 3px;
			}
			.monaco-scrollable-element > .shadow.top-left-corner {
				display: block;
				top: 0;
				left: 0;
				height: 3px;
				width: 3px;
			}
			/* Fix for https://github.com/microsoft/vscode/issues/103170 */
			.monaco-menu .action-item .monaco-submenu {
				z-index: 1;
			}
		`;

		// Scrollbars
		const scrollbarShadowColor = style.scrollbarShadow;
		if (scrollbarShadowColor) {
			result += `
				.monaco-scrollable-element > .shadow.top {
					box-shadow: ${scrollbarShadowColor} 0 6px 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.left {
					box-shadow: ${scrollbarShadowColor} 6px 0 6px -6px inset;
				}

				.monaco-scrollable-element > .shadow.top.left {
					box-shadow: ${scrollbarShadowColor} 6px 6px 6px -6px inset;
				}
			`;
		}

		const scrollbarSliderBackgroundColor = style.scrollbarSliderBackground;
		if (scrollbarSliderBackgroundColor) {
			result += `
				.monaco-scrollable-element > .scrollbar > .slider {
					background: ${scrollbarSliderBackgroundColor};
				}
			`;
		}

		const scrollbarSliderHoverBackgroundColor = style.scrollbarSliderHoverBackground;
		if (scrollbarSliderHoverBackgroundColor) {
			result += `
				.monaco-scrollable-element > .scrollbar > .slider:hover {
					background: ${scrollbarSliderHoverBackgroundColor};
				}
			`;
		}

		const scrollbarSliderActiveBackgroundColor = style.scrollbarSliderActiveBackground;
		if (scrollbarSliderActiveBackgroundColor) {
			result += `
				.monaco-scrollable-element > .scrollbar > .slider.active {
					background: ${scrollbarSliderActiveBackgroundColor};
				}
			`;
		}
	}

	return result;
}
