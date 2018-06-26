/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { ActionBar, IActionItemProvider, ActionsOrientation, Separator, ActionItem, IActionItemOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { Event } from 'vs/base/common/event';
import { addClass, EventType, EventHelper, EventLike } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { $ } from 'vs/base/browser/builder';

export interface IMenuOptions {
	context?: any;
	actionItemProvider?: IActionItemProvider;
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding;
	ariaLabel?: string;
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

export class Menu {

	private actionBar: ActionBar;
	private listener: IDisposable;

	constructor(container: HTMLElement, actions: IAction[], options: IMenuOptions = {}) {
		addClass(container, 'monaco-menu-container');
		container.setAttribute('role', 'presentation');

		let menuContainer = document.createElement('div');
		addClass(menuContainer, 'monaco-menu');
		menuContainer.setAttribute('role', 'presentation');
		container.appendChild(menuContainer);

		let parentData: ISubMenuData = {
			parent: this
		};

		const getActionItem = (action: IAction) => {
			if (action instanceof Separator) {
				return new ActionItem(options.context, action, { icon: true });
			} else if (action instanceof SubmenuAction) {
				return new SubmenuActionItem(action, action.entries, parentData, options);
			} else {
				const menuItemOptions: IActionItemOptions = {};
				if (options.getKeyBinding) {
					const keybinding = options.getKeyBinding(action);
					if (keybinding) {
						menuItemOptions.keybinding = keybinding.getLabel();
					}
				}

				return new MenuActionItem(options.context, action, menuItemOptions);
			}
		};

		this.actionBar = new ActionBar(menuContainer, {
			orientation: ActionsOrientation.VERTICAL,
			actionItemProvider: options.actionItemProvider ? options.actionItemProvider : getActionItem,
			context: options.context,
			actionRunner: options.actionRunner,
			isMenu: true,
			ariaLabel: options.ariaLabel
		});

		this.actionBar.push(actions, { icon: true, label: true, isMenu: true });
	}

	public get onDidCancel(): Event<void> {
		return this.actionBar.onDidCancel;
	}

	public get onDidBlur(): Event<void> {
		return this.actionBar.onDidBlur;
	}

	public focus() {
		this.actionBar.focus(true);
	}

	public dispose() {
		if (this.actionBar) {
			this.actionBar.dispose();
			this.actionBar = null;
		}

		if (this.listener) {
			this.listener.dispose();
			this.listener = null;
		}
	}
}

class MenuActionItem extends ActionItem {
	static MNEMONIC_REGEX: RegExp = /&&(.)/g;

	constructor(ctx: any, action: IAction, options: IActionItemOptions = {}) {
		options.isMenu = true;
		super(action, action, options);
	}

	private _addMnemonic(action: IAction, actionItemElement: HTMLElement): void {
		let matches = MenuActionItem.MNEMONIC_REGEX.exec(action.label);
		if (matches && matches.length === 2) {
			let mnemonic = matches[1];

			let ariaLabel = action.label.replace(MenuActionItem.MNEMONIC_REGEX, mnemonic);

			actionItemElement.accessKey = mnemonic.toLocaleLowerCase();
			this.$e.attr('aria-label', ariaLabel);
		} else {
			this.$e.attr('aria-label', action.label);
		}
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this._addMnemonic(this.getAction(), container);
		this.$e.attr('role', 'menuitem');
	}

	public _updateLabel(): void {
		if (this.options.label) {
			let label = this.getAction().label;
			if (label && this.options.isMenu) {
				label = label.replace(MenuActionItem.MNEMONIC_REGEX, '$1\u0332');
			}
			this.$e.text(label);
		}
	}
}

class SubmenuActionItem extends MenuActionItem {
	private mysubmenu: Menu;

	constructor(
		action: IAction,
		private submenuActions: IAction[],
		private parentData: ISubMenuData,
		private submenuOptions?: IMenuOptions
	) {
		super(action, action, { label: true, isMenu: true });
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.builder = $(container);
		$(this.builder).addClass('monaco-submenu-item');
		$('span.submenu-indicator').text('\u25B6').appendTo(this.builder);
		this.$e.attr('role', 'menu');

		$(this.builder).on(EventType.KEY_UP, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow)) {
				EventHelper.stop(e, true);

				this.createSubmenu();
			}
		});

		$(this.builder).on(EventType.KEY_DOWN, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow)) {
				EventHelper.stop(e, true);
			}
		});

		$(this.builder).on(EventType.MOUSE_OVER, (e) => {
			this.cleanupExistingSubmenu(false);
			this.createSubmenu();
		});


		$(this.builder).on(EventType.MOUSE_LEAVE, (e) => {
			this.parentData.parent.focus();
			this.cleanupExistingSubmenu(true);
		});
	}

	public onClick(e: EventLike) {
		// stop clicking from trying to run an action
		EventHelper.stop(e, true);
	}

	private cleanupExistingSubmenu(force: boolean) {
		if (this.parentData.submenu && (force || (this.parentData.submenu !== this.mysubmenu))) {
			this.parentData.submenu.dispose();
			this.parentData.submenu = null;
		}
	}

	private createSubmenu() {
		if (!this.parentData.submenu) {
			const submenuContainer = $(this.builder).div({ class: 'monaco-submenu menubar-menu-items-holder context-view' });

			$(submenuContainer).style({
				'left': `${$(this.builder).getClientArea().width}px`
			});

			$(submenuContainer).on(EventType.KEY_UP, (e) => {
				let event = new StandardKeyboardEvent(e as KeyboardEvent);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);

					this.parentData.parent.focus();
					this.parentData.submenu.dispose();
					this.parentData.submenu = null;
				}
			});

			$(submenuContainer).on(EventType.KEY_DOWN, (e) => {
				let event = new StandardKeyboardEvent(e as KeyboardEvent);
				if (event.equals(KeyCode.LeftArrow)) {
					EventHelper.stop(e, true);
				}
			});


			this.parentData.submenu = new Menu(submenuContainer.getHTMLElement(), this.submenuActions, this.submenuOptions);
			this.parentData.submenu.focus();

			this.mysubmenu = this.parentData.submenu;
		}
	}
}