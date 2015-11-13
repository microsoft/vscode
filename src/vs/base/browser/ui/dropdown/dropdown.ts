/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dropdown';
import Builder = require('vs/base/browser/builder');
import WinJS = require('vs/base/common/winjs.base');
import Touch = require('vs/base/browser/touch');
import Actions = require('vs/base/common/actions');
import ActionBar = require('vs/base/browser/ui/actionbar/actionbar');
import EventEmitter = require('vs/base/common/eventEmitter');
import Lifecycle = require('vs/base/common/lifecycle');
import ContextView = require('vs/base/browser/ui/contextview/contextview');
import Menu = require('vs/base/browser/ui/menu/menu');

var $ = Builder.$;

export interface ILabelRenderer {
	(container: HTMLElement): Lifecycle.IDisposable;
}

export interface IBaseDropdownOptions {
	tick?: boolean;
	label?: string;
	labelRenderer?: ILabelRenderer;
	action?: Actions.IAction;
}

export class BaseDropdown extends Actions.ActionRunner {

	/*protected*/ toDispose: Lifecycle.IDisposable[];

	/*protected*/ $el: Builder.Builder;
	private $boxContainer: Builder.Builder;
	private $action: Builder.Builder;
	private $label: Builder.Builder;
	private $contents: Builder.Builder;

	constructor (container: HTMLElement, options: IBaseDropdownOptions) {
		super();

		this.toDispose = [];

		this.$el = $('.dropdown').appendTo(container);

		this.$label = $('.dropdown-label');

		if (options.tick || options.action) {
			this.$label.addClass('tick');
		}

		var labelRenderer = options.labelRenderer;

		if (!labelRenderer && options.action) {
			this.$action = $('.dropdown-action').appendTo(this.$el);

			var item = new ActionBar.ActionItem(null, options.action, {
				icon: true,
				label: true
			});

			item.actionRunner = this;
			item.render(this.$action.getHTMLElement());

			labelRenderer = (container: HTMLElement): Lifecycle.IDisposable => {
				container.innerText = '';
				return item;
			};
		}

		if (!labelRenderer) {
			labelRenderer = (container: HTMLElement): Lifecycle.IDisposable => {
				$(container).text(options.label || '');
				return null;
			};
		}

		this.$label.on(['click', Touch.EventType.Tap], (e:Event) => {
			e.preventDefault();
			e.stopPropagation();

			this.toggleDropdown();
		}).appendTo(this.$el);

		var cleanupFn = labelRenderer(this.$label.getHTMLElement());

		if (cleanupFn) {
			this.toDispose.push(cleanupFn);
		}

		this.toDispose.push(new Touch.Gesture(this.$label.getHTMLElement()));
	}

	public set tooltip(tooltip: string) {
		this.$label.title(tooltip);
	}

	/*protected*/ toggleDropdown(): void {
		if (this.$el.hasClass('active')) {
			this.hide();
		} else {
			this.show();
		}
	}

	/*protected*/ show(): void {
		// noop
	}

	/*protected*/ public hide(): void {
		// noop
	}

	/*protected*/ public onEvent(e:Event, activeElement: HTMLElement): void {
		this.hide();
	}

	public dispose(): void {
		super.dispose();
		this.hide();

		this.toDispose = Lifecycle.disposeAll(this.toDispose);

		if (this.$boxContainer) {
			this.$boxContainer.destroy();
			this.$boxContainer = null;
		}

		if (this.$contents) {
			this.$contents.destroy();
			this.$contents = null;
		}

		if (this.$label) {
			this.$label.destroy();
			this.$label = null;
		}
	}
}

export interface IDropdownOptions extends IBaseDropdownOptions {
	contextViewProvider: ContextView.IContextViewProvider;
}

export class Dropdown extends BaseDropdown {

	/*protected*/ _contextViewProvider: ContextView.IContextViewProvider;

	constructor (container: HTMLElement, options: IDropdownOptions) {
		super(container, options);
		this.contextViewProvider = options.contextViewProvider;
	}

	/*protected*/ public set contextViewProvider(contextViewProvider: ContextView.IContextViewProvider) {
		this._contextViewProvider = contextViewProvider;
	}

	/*protected*/ public get contextViewProvider(): ContextView.IContextViewProvider {
		return this._contextViewProvider;
	}

	/*protected*/ show(): void {
		this.$el.addClass('active');

		this._contextViewProvider.showContextView({
			getAnchor: () => this.$el.getHTMLElement(),

			render: (container) => {
				return this.renderContents(container);
			},

			onDOMEvent: (e, activeElement) => {
				this.onEvent(e, activeElement);
			},

			onHide: () => {
				this.$el.removeClass('active');
			}
		});
	}

	/*protected*/ public hide(): void {
		if (this._contextViewProvider) {
			this._contextViewProvider.hideContextView();
		}
	}

	/*protected*/ public renderContents(container: HTMLElement): Lifecycle.IDisposable {
		return null;
	}
}

export interface IContextMenuDelegate {
	getAnchor(): any;
	getActions(): WinJS.Promise;
	getActionItem?(action: Actions.IAction): ActionBar.IActionItem;
	getActionsContext?():any;
	getMenuClassName?():string;
	onHide?(didCancel: boolean): void;
}

export interface IContextMenuProvider {
	showContextMenu(delegate: IContextMenuDelegate): void;
}

export interface IActionProvider {
	getActions(): Actions.IAction[];
}

export interface IDropdownMenuOptions extends IBaseDropdownOptions {
	contextMenuProvider: IContextMenuProvider;
	actions?: Actions.IAction[];
	actionProvider?: IActionProvider;
	menuClassName?: string;
}

export class DropdownMenu extends BaseDropdown {

	/*protected*/ _contextMenuProvider: IContextMenuProvider;
	private _menuOptions: Menu.IMenuOptions;
	/*protected*/ currentContainer: HTMLElement;
	/*protected*/ _actions: Actions.IAction[];
	/*protected*/ actionProvider: IActionProvider;
	private menuClassName: string;

	constructor (container:HTMLElement, options: IDropdownMenuOptions) {
		super(container, options);

		this._contextMenuProvider = options.contextMenuProvider;
		this.currentContainer = null;
		this.actions = options.actions || [];
		this.actionProvider = options.actionProvider;
		this.menuClassName = options.menuClassName || '';
	}

	/*protected*/ public set contextMenuProvider(contextMenuProvider: IContextMenuProvider) {
		this._contextMenuProvider = contextMenuProvider;
	}

	/*protected*/ public get contextMenuProvider(): IContextMenuProvider {
		return this._contextMenuProvider;
	}

	public set menuOptions(options: Menu.IMenuOptions) {
		this._menuOptions = options;
	}

	public get menuOptions(): Menu.IMenuOptions {
		return this._menuOptions;
	}

	/*protected*/ public get actions(): Actions.IAction[] {
		if (this.actionProvider) {
			return this.actionProvider.getActions();
		}

		return this._actions;
	}

	/*protected*/ public set actions(actions:Actions.IAction[]) {
		this._actions = actions;
	}

	/*protected*/ show(): void {
		this.$el.addClass('active');

		this._contextMenuProvider.showContextMenu({
			getAnchor: () => this.$el.getHTMLElement(),
			getActions: () => WinJS.Promise.as(this.actions),
			getActionsContext: () => this.menuOptions ? this.menuOptions.context : null,
			getActionItem: (action) => this.menuOptions && this.menuOptions.actionItemProvider ? this.menuOptions.actionItemProvider(action) : null,
			getMenuClassName: () => this.menuClassName,
			onHide: () => {
				this.$el.removeClass('active');
				this.currentContainer = null;
			}
		});
	}

	/*protected*/ public hide(): void {
		// noop
	}
}

export class DropdownGroup extends EventEmitter.EventEmitter {

	private el: HTMLElement;

	constructor(container: HTMLElement) {
		super();

		this.el = document.createElement('div');
		this.el.className = 'dropdown-group';

		container.appendChild(this.el);
	}

	public get element(): HTMLElement {
		return this.el;
	}
}
