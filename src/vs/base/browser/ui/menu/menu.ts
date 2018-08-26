/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { ActionBar, IActionItemProvider, ActionsOrientation, Separator, ActionItem, IActionItemOptions, BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ResolvedKeybinding, KeyCode, KeyCodeUtils } from 'vs/base/common/keyCodes';
import { addClass, EventType, EventHelper, EventLike, removeTabIndexAndUpdateFocus, isAncestor, hasClass, addDisposableListener } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { $, Builder } from 'vs/base/browser/builder';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';

export const MENU_MNEMONIC_REGEX: RegExp = /\(&{1,2}(\w)\)|&{1,2}(\w)/;
export const MENU_ESCAPED_MNEMONIC_REGEX: RegExp = /(?:&amp;){1,2}(\w)/;

export interface IMenuOptions {
	context?: any;
	actionItemProvider?: IActionItemProvider;
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding;
	ariaLabel?: string;
	enableMnemonics?: boolean;
}


export class SubmenuAction extends Action {
	constructor(label: string, public entries: (SubmenuAction | IAction)[], cssClass?: string) {
		super(!!cssClass ? cssClass : 'submenu', label, '', true);
	}
}

interface ISubMenuData {
	parent: Menu;
	submenu?: Menu;
}

export class Menu extends ActionBar {
	private mnemonics: Map<KeyCode, Array<MenuActionItem>>;
	private menuDisposables: IDisposable[];

	constructor(container: HTMLElement, actions: IAction[], options: IMenuOptions = {}) {

		addClass(container, 'monaco-menu-container');
		container.setAttribute('role', 'presentation');
		let menuContainer = document.createElement('div');
		addClass(menuContainer, 'monaco-menu');
		menuContainer.setAttribute('role', 'presentation');
		container.appendChild(menuContainer);

		super(menuContainer, {
			orientation: ActionsOrientation.VERTICAL,
			actionItemProvider: action => this.doGetActionItem(action, options, parentData),
			context: options.context,
			actionRunner: options.actionRunner,
			ariaLabel: options.ariaLabel
		});

		this.actionsList.setAttribute('role', 'menu');

		this.actionsList.tabIndex = 0;

		this.menuDisposables = [];

		if (options.enableMnemonics) {
			this.menuDisposables.push(addDisposableListener(menuContainer, EventType.KEY_DOWN, (e) => {
				const key = KeyCodeUtils.fromString(e.key);
				if (this.mnemonics.has(key)) {
					EventHelper.stop(e, true);
					const actions = this.mnemonics.get(key);

					if (actions.length === 1) {
						if (actions[0] instanceof SubmenuActionItem) {
							this.focusItemByElement(actions[0].container);
						}

						actions[0].onClick(event);
					}

					if (actions.length > 1) {
						const action = actions.shift();
						this.focusItemByElement(action.container);

						actions.push(action);
						this.mnemonics.set(key, actions);
					}
				}
			}));
		}

		$(this.domNode).on(EventType.MOUSE_OUT, (e) => {
			let relatedTarget = (e as MouseEvent).relatedTarget as HTMLElement;
			if (!isAncestor(relatedTarget, this.domNode)) {
				this.focusedItem = undefined;
				this.updateFocus();
				e.stopPropagation();
			}
		});

		$(this.actionsList).on(EventType.MOUSE_OVER, (e) => {
			let target = e.target as HTMLElement;
			if (!target || !isAncestor(target, this.actionsList) || target === this.actionsList) {
				return;
			}

			while (target.parentElement !== this.actionsList) {
				target = target.parentElement;
			}

			if (hasClass(target, 'action-item')) {
				const lastFocusedItem = this.focusedItem;
				this.setFocusedItem(target);

				if (lastFocusedItem !== this.focusedItem) {
					this.updateFocus();
				}
			}
		});

		let parentData: ISubMenuData = {
			parent: this
		};

		this.mnemonics = new Map<KeyCode, Array<MenuActionItem>>();

		this.push(actions, { icon: true, label: true, isMenu: true });
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
			let elem = this.actionsList.children[i];
			if (element === elem) {
				this.focusedItem = i;
				break;
			}
		}
	}

	private doGetActionItem(action: IAction, options: IMenuOptions, parentData: ISubMenuData): BaseActionItem {
		if (action instanceof Separator) {
			return new ActionItem(options.context, action, { icon: true });
		} else if (action instanceof SubmenuAction) {
			const menuActionItem = new SubmenuActionItem(action, action.entries, parentData, options);

			if (options.enableMnemonics) {
				const mnemonic = menuActionItem.getMnemonic();
				if (mnemonic && menuActionItem.isEnabled()) {
					let actionItems = [];
					if (this.mnemonics.has(mnemonic)) {
						actionItems = this.mnemonics.get(mnemonic);
					}

					actionItems.push(menuActionItem);

					this.mnemonics.set(mnemonic, actionItems);
				}
			}

			return menuActionItem;
		} else {
			const menuItemOptions: IMenuItemOptions = { enableMnemonics: options.enableMnemonics };
			if (options.getKeyBinding) {
				const keybinding = options.getKeyBinding(action);
				if (keybinding) {
					menuItemOptions.keybinding = keybinding.getLabel();
				}
			}

			const menuActionItem = new MenuActionItem(options.context, action, menuItemOptions);

			if (options.enableMnemonics) {
				const mnemonic = menuActionItem.getMnemonic();
				if (mnemonic && menuActionItem.isEnabled()) {
					let actionItems = [];
					if (this.mnemonics.has(mnemonic)) {
						actionItems = this.mnemonics.get(mnemonic);
					}

					actionItems.push(menuActionItem);

					this.mnemonics.set(mnemonic, actionItems);
				}
			}

			return menuActionItem;
		}
	}

	public focus(selectFirst = true) {
		super.focus(selectFirst);
	}
}

interface IMenuItemOptions extends IActionItemOptions {
	enableMnemonics?: boolean;
}

class MenuActionItem extends BaseActionItem {
	public container: HTMLElement;
	protected $e: Builder;
	protected $label: Builder;
	protected $check: Builder;
	protected options: IMenuItemOptions;
	protected mnemonic: KeyCode;
	private cssClass: string;

	constructor(ctx: any, action: IAction, options: IMenuItemOptions = {}) {
		options.isMenu = true;
		super(action, action, options);

		this.options = options;
		this.options.icon = options.icon !== undefined ? options.icon : false;
		this.options.label = options.label !== undefined ? options.label : true;
		this.cssClass = '';

		// Set mnemonic
		if (this.options.label && options.enableMnemonics) {
			let label = this.getAction().label;
			if (label) {
				let matches = MENU_MNEMONIC_REGEX.exec(label);
				if (matches) {
					this.mnemonic = KeyCodeUtils.fromString((!!matches[1] ? matches[1] : matches[2]).toLocaleLowerCase());
				}
			}
		}
	}

	render(container: HTMLElement): void {
		super.render(container);

		this.container = container;

		this.$e = $('a.action-menu-item').appendTo(this.builder);
		if (this._action.id === Separator.ID) {
			// A separator is a presentation item
			this.$e.attr({ role: 'presentation' });
		} else {
			this.$e.attr({ role: 'menuitem' });
			if (this.mnemonic) {
				this.$e.attr({ 'aria-keyshortcuts': this.mnemonic });
			}
		}

		this.$check = $('span.menu-item-check').attr({ 'role': 'none' }).appendTo(this.$e);
		this.$label = $('span.action-label').appendTo(this.$e);

		if (this.options.label && this.options.keybinding) {
			$('span.keybinding').text(this.options.keybinding).appendTo(this.$e);
		}

		this._updateClass();
		this._updateLabel();
		this._updateTooltip();
		this._updateEnabled();
		this._updateChecked();
	}

	focus(): void {
		super.focus();
		this.$e.domFocus();
	}

	_updateLabel(): void {
		if (this.options.label) {
			let label = this.getAction().label;
			if (label) {
				const cleanLabel = cleanMnemonic(label);
				if (!this.options.enableMnemonics) {
					label = cleanLabel;
				}

				this.$label.attr('aria-label', cleanLabel);

				const matches = MENU_MNEMONIC_REGEX.exec(label);

				if (matches) {
					label = strings.escape(label).replace(MENU_ESCAPED_MNEMONIC_REGEX, '<u aria-hidden="true">$1</u>');
					this.$e.attr({ 'aria-keyshortcuts': (!!matches[1] ? matches[1] : matches[2]).toLocaleLowerCase() });
				}
			}

			this.$label.innerHtml(label.trim());
		}
	}

	_updateTooltip(): void {
		let title: string = null;

		if (this.getAction().tooltip) {
			title = this.getAction().tooltip;

		} else if (!this.options.label && this.getAction().label && this.options.icon) {
			title = this.getAction().label;

			if (this.options.keybinding) {
				title = nls.localize({ key: 'titleLabel', comment: ['action title', 'action keybinding'] }, "{0} ({1})", title, this.options.keybinding);
			}
		}

		if (title) {
			this.$e.attr({ title: title });
		}
	}

	_updateClass(): void {
		if (this.cssClass) {
			this.$e.removeClass(this.cssClass);
		}
		if (this.options.icon) {
			this.cssClass = this.getAction().class;
			this.$label.addClass('icon');
			if (this.cssClass) {
				this.$label.addClass(this.cssClass);
			}
			this._updateEnabled();
		} else {
			this.$label.removeClass('icon');
		}
	}

	_updateEnabled(): void {
		if (this.getAction().enabled) {
			this.builder.removeClass('disabled');
			this.$e.removeClass('disabled');
			this.$e.attr({ tabindex: 0 });
		} else {
			this.builder.addClass('disabled');
			this.$e.addClass('disabled');
			removeTabIndexAndUpdateFocus(this.$e.getHTMLElement());
		}
	}

	_updateChecked(): void {
		if (this.getAction().checked) {
			this.$e.addClass('checked');
			this.$e.attr({ 'role': 'menuitemcheckbox', 'aria-checked': true });
		} else {
			this.$e.removeClass('checked');
			this.$e.attr({ 'role': 'menuitem', 'aria-checked': false });
		}
	}

	getMnemonic(): KeyCode {
		return this.mnemonic;
	}
}

class SubmenuActionItem extends MenuActionItem {
	private mysubmenu: Menu;
	private submenuContainer: Builder;
	private mouseOver: boolean;
	private showScheduler: RunOnceScheduler;
	private hideScheduler: RunOnceScheduler;

	constructor(
		action: IAction,
		private submenuActions: IAction[],
		private parentData: ISubMenuData,
		private submenuOptions?: IMenuOptions
	) {
		super(action, action, submenuOptions);

		this.showScheduler = new RunOnceScheduler(() => {
			if (this.mouseOver) {
				this.cleanupExistingSubmenu(false);
				this.createSubmenu(false);
			}
		}, 250);

		this.hideScheduler = new RunOnceScheduler(() => {
			if ((!isAncestor(document.activeElement, this.builder.getHTMLElement()) && this.parentData.submenu === this.mysubmenu)) {
				this.parentData.parent.focus(false);
				this.cleanupExistingSubmenu(true);
			}
		}, 750);
	}

	render(container: HTMLElement): void {
		super.render(container);

		this.$e.addClass('monaco-submenu-item');
		this.$e.attr('aria-haspopup', 'true');
		$('span.submenu-indicator').attr('aria-hidden', 'true').text('\u25B6').appendTo(this.$e);

		$(this.builder).on(EventType.KEY_UP, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
				EventHelper.stop(e, true);

				this.createSubmenu(true);
			}
		});

		$(this.builder).on(EventType.KEY_DOWN, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.Enter)) {
				EventHelper.stop(e, true);
			}
		});

		$(this.builder).on(EventType.MOUSE_OVER, (e) => {
			if (!this.mouseOver) {
				this.mouseOver = true;

				this.showScheduler.schedule();
			}
		});

		$(this.builder).on(EventType.MOUSE_LEAVE, (e) => {
			this.mouseOver = false;
		});

		$(this.builder).on(EventType.FOCUS_OUT, (e) => {
			if (!isAncestor(document.activeElement, this.builder.getHTMLElement())) {
				this.hideScheduler.schedule();
			}
		});
	}

	onClick(e: EventLike) {
		// stop clicking from trying to run an action
		EventHelper.stop(e, true);

		this.cleanupExistingSubmenu(false);
		this.createSubmenu(false);
	}

	private cleanupExistingSubmenu(force: boolean) {
		if (this.parentData.submenu && (force || (this.parentData.submenu !== this.mysubmenu))) {
			this.parentData.submenu.dispose();
			this.parentData.submenu = null;

			if (this.submenuContainer) {
				this.submenuContainer.dispose();
				this.submenuContainer = null;
			}
		}
	}

	private createSubmenu(selectFirstItem = true) {
		if (!this.parentData.submenu) {
			this.submenuContainer = $(this.builder).div({ class: 'monaco-submenu menubar-menu-items-holder context-view' });

			$(this.submenuContainer).style({
				'left': `${$(this.builder).getClientArea().width}px`
			});

			$(this.submenuContainer).on(EventType.KEY_UP, (e) => {
				let event = new StandardKeyboardEvent(e as KeyboardEvent);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);

					this.parentData.parent.focus();
					this.parentData.submenu.dispose();
					this.parentData.submenu = null;

					this.submenuContainer.dispose();
					this.submenuContainer = null;
				}
			});

			$(this.submenuContainer).on(EventType.KEY_DOWN, (e) => {
				let event = new StandardKeyboardEvent(e as KeyboardEvent);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);
				}
			});


			this.parentData.submenu = new Menu(this.submenuContainer.getHTMLElement(), this.submenuActions, this.submenuOptions);

			this.parentData.submenu.onDidCancel(() => {
				this.parentData.parent.focus();
				this.parentData.submenu.dispose();
				this.parentData.submenu = null;

				this.submenuContainer.dispose();
				this.submenuContainer = null;
			});

			this.parentData.submenu.focus(selectFirstItem);

			this.mysubmenu = this.parentData.submenu;
		} else {
			this.parentData.submenu.focus(false);
		}
	}

	dispose() {
		super.dispose();

		this.hideScheduler.dispose();

		if (this.mysubmenu) {
			this.mysubmenu.dispose();
			this.mysubmenu = null;
		}

		if (this.submenuContainer) {
			this.submenuContainer.dispose();
			this.submenuContainer = null;
		}
	}
}

export function cleanMnemonic(label: string): string {
	const regex = MENU_MNEMONIC_REGEX;

	const matches = regex.exec(label);
	if (!matches) {
		return label;
	}

	const mnemonicInText = matches[0].charAt(0) === '&';

	return label.replace(regex, mnemonicInText ? '$2' : '').trim();
}