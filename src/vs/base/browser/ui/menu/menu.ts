/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./menu';
import * as nls from 'vs/nls';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IActionRunner, IAction, Action } from 'vs/base/common/actions';
import { ActionBar, IActionItemProvider, ActionsOrientation, Separator, ActionItem, IActionItemOptions, BaseActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import { Event } from 'vs/base/common/event';
import { addClass, EventType, EventHelper, EventLike, removeTabIndexAndUpdateFocus, isAncestor } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { $, Builder } from 'vs/base/browser/builder';
import { RunOnceScheduler } from 'vs/base/common/async';

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

		this.actionBar = new ActionBar(menuContainer, {
			orientation: ActionsOrientation.VERTICAL,
			actionItemProvider: action => this.doGetActionItem(action, options, parentData),
			context: options.context,
			actionRunner: options.actionRunner,
			isMenu: true,
			ariaLabel: options.ariaLabel
		});

		this.actionBar.push(actions, { icon: true, label: true, isMenu: true });
	}

	private doGetActionItem(action: IAction, options: IMenuOptions, parentData: ISubMenuData): BaseActionItem {
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
	}

	public get onDidCancel(): Event<void> {
		return this.actionBar.onDidCancel;
	}

	public get onDidBlur(): Event<void> {
		return this.actionBar.onDidBlur;
	}

	public focus(selectFirst = true) {
		if (this.actionBar) {
			this.actionBar.focus(selectFirst);
		}
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

class MenuActionItem extends BaseActionItem {
	static MNEMONIC_REGEX: RegExp = /&&(.)/g;

	protected $e: Builder;
	protected $label: Builder;
	protected options: IActionItemOptions;
	private cssClass: string;

	constructor(ctx: any, action: IAction, options: IActionItemOptions = {}) {
		options.isMenu = true;
		super(action, action, options);

		this.options = options;
		this.options.icon = options.icon !== undefined ? options.icon : false;
		this.options.label = options.label !== undefined ? options.label : true;
		this.cssClass = '';
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.$e = $('a.action-menu-item').appendTo(this.builder);
		if (this._action.id === Separator.ID) {
			// A separator is a presentation item
			this.$e.attr({ role: 'presentation' });
		} else {
			this.$e.attr({ role: 'menuitem' });
		}

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

	public focus(): void {
		super.focus();
		this.$e.domFocus();
	}

	public _updateLabel(): void {
		if (this.options.label) {
			let label = this.getAction().label;
			if (label) {
				let matches = MenuActionItem.MNEMONIC_REGEX.exec(label);
				if (matches && matches.length === 2) {
					let mnemonic = matches[1];

					let ariaLabel = label.replace(MenuActionItem.MNEMONIC_REGEX, mnemonic);

					this.$e.getHTMLElement().accessKey = mnemonic.toLocaleLowerCase();
					this.$label.attr('aria-label', ariaLabel);
				} else {
					this.$label.attr('aria-label', label);
				}

				label = label.replace(MenuActionItem.MNEMONIC_REGEX, '$1\u0332');
			}

			this.$label.text(label);
		}
	}

	public _updateTooltip(): void {
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

	public _updateClass(): void {
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

	public _updateEnabled(): void {
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

	public _updateChecked(): void {
		if (this.getAction().checked) {
			this.$label.addClass('checked');
		} else {
			this.$label.removeClass('checked');
		}
	}
}

class SubmenuActionItem extends MenuActionItem {
	private mysubmenu: Menu;
	private submenuContainer: Builder;
	private hideScheduler: RunOnceScheduler;

	constructor(
		action: IAction,
		private submenuActions: IAction[],
		private parentData: ISubMenuData,
		private submenuOptions?: IMenuOptions
	) {
		super(action, action, { label: true, isMenu: true });

		this.hideScheduler = new RunOnceScheduler(() => {
			if ((!isAncestor(document.activeElement, this.builder.getHTMLElement()) && this.parentData.submenu === this.mysubmenu)) {
				this.parentData.parent.focus(false);
				this.cleanupExistingSubmenu(true);
			}
		}, 750);
	}

	public render(container: HTMLElement): void {
		super.render(container);

		this.$e.addClass('monaco-submenu-item');
		this.$e.attr('aria-haspopup', 'true');
		$('span.submenu-indicator').text('\u25B6').appendTo(this.$e);

		$(this.builder).on(EventType.KEY_UP, (e) => {
			let event = new StandardKeyboardEvent(e as KeyboardEvent);
			if (event.equals(KeyCode.RightArrow)) {
				EventHelper.stop(e, true);

				this.createSubmenu(true);
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
			this.createSubmenu(false);
		});

		$(this.builder).on(EventType.FOCUS_OUT, (e) => {
			if (!isAncestor(document.activeElement, this.builder.getHTMLElement())) {
				this.hideScheduler.schedule();
			}
		});
	}

	public onClick(e: EventLike) {
		// stop clicking from trying to run an action
		EventHelper.stop(e, true);

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
			this.parentData.submenu.focus(selectFirstItem);

			this.mysubmenu = this.parentData.submenu;
		} else {
			this.parentData.submenu.focus(false);
		}
	}

	public dispose() {
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