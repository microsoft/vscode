/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { ActionBar, IActionItemProvider, ActionsOrientation, Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
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
				return new ActionItem(options.context, action);
			} else if (action instanceof SubmenuAction) {
				return new SubmenuActionItem(action, action.entries, parentData);
			} else {
				return new ActionItem(options.context, action);
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

class SubmenuActionItem extends ActionItem {
	private mysubmenu: Menu;

	constructor(
		action: IAction,
		private submenuActions: IAction[],
		private parentData: ISubMenuData
	) {
		super(action, action, { label: true, isMenu: true });
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.builder = $(container);
		$(this.builder).addClass('monaco-submenu-item');
		$('span.submenu-indicator').text('\u25B6').appendTo(this.builder);

		$(this.builder).on(EventType.KEY_UP, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow)) {
				EventHelper.stop(e, true);

				this.createSubmenu();
			}
		});

		$(this.builder).on(EventType.MOUSE_OVER, (e) => {
			this.cleanupExistingSubmenu(false);
			this.createSubmenu();
		});


		$(this.builder).getHTMLElement().onmouseleave = (evt: MouseEvent) => {
			this.parentData.parent.focus();
			this.cleanupExistingSubmenu(true);
		};
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

			this.parentData.submenu = new Menu(submenuContainer.getHTMLElement(), this.submenuActions);
			this.parentData.submenu.focus();

			this.mysubmenu = this.parentData.submenu;
		}
	}
}