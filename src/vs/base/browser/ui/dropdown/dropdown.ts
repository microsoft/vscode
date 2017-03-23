/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dropdown';
import { Builder, $ } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import { Gesture, EventType } from 'vs/base/browser/touch';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { ActionItem, IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IMenuOptions } from 'vs/base/browser/ui/menu/menu';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export interface ILabelRenderer {
	(container: HTMLElement): IDisposable;
}

export interface IBaseDropdownOptions {
	tick?: boolean;
	label?: string;
	labelRenderer?: ILabelRenderer;
	action?: IAction;
}

export class BaseDropdown extends ActionRunner {

	/*protected*/ toDispose: IDisposable[];

	/*protected*/ $el: Builder;
	private $boxContainer: Builder;
	private $action: Builder;
	private $label: Builder;
	private $contents: Builder;

	constructor(container: HTMLElement, options: IBaseDropdownOptions) {
		super();

		this.toDispose = [];

		this.$el = $('.dropdown').appendTo(container);

		this.$label = $('.dropdown-label');

		if (options.tick || options.action) {
			this.$label.addClass('tick');
		}

		let labelRenderer = options.labelRenderer;

		if (!labelRenderer && options.action) {
			this.$action = $('.dropdown-action').appendTo(this.$el);

			let item = new ActionItem(null, options.action, {
				icon: true,
				label: true
			});

			item.actionRunner = this;
			item.render(this.$action.getHTMLElement());

			labelRenderer = (container: HTMLElement): IDisposable => {
				container.innerText = '';
				return item;
			};
		}

		if (!labelRenderer) {
			labelRenderer = (container: HTMLElement): IDisposable => {
				$(container).text(options.label || '');
				return null;
			};
		}

		this.$label.on(['mousedown', EventType.Tap], (e: Event) => {
			e.preventDefault();
			e.stopPropagation();

			this.show();
		}).appendTo(this.$el);

		let cleanupFn = labelRenderer(this.$label.getHTMLElement());

		if (cleanupFn) {
			this.toDispose.push(cleanupFn);
		}

		this.toDispose.push(new Gesture(this.$label.getHTMLElement()));
	}

	public set tooltip(tooltip: string) {
		this.$label.title(tooltip);
	}

	/*protected*/ show(): void {
		// noop
	}

	/*protected*/ public hide(): void {
		// noop
	}

	/*protected*/ public onEvent(e: Event, activeElement: HTMLElement): void {
		this.hide();
	}

	public dispose(): void {
		super.dispose();
		this.hide();

		this.toDispose = dispose(this.toDispose);

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
	contextViewProvider: IContextViewProvider;
}

export class Dropdown extends BaseDropdown {

	/*protected*/ _contextViewProvider: IContextViewProvider;

	constructor(container: HTMLElement, options: IDropdownOptions) {
		super(container, options);
		this.contextViewProvider = options.contextViewProvider;
	}

	/*protected*/ public set contextViewProvider(contextViewProvider: IContextViewProvider) {
		this._contextViewProvider = contextViewProvider;
	}

	/*protected*/ public get contextViewProvider(): IContextViewProvider {
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

	/*protected*/ public renderContents(container: HTMLElement): IDisposable {
		return null;
	}
}

export interface IContextMenuDelegate {
	getAnchor(): HTMLElement | { x: number; y: number; };
	getActions(): TPromise<IAction[]>;
	getActionItem?(action: IAction): IActionItem;
	getActionsContext?(): any;
	getKeyBinding?(action: IAction): ResolvedKeybinding;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
}

export interface IContextMenuProvider {
	showContextMenu(delegate: IContextMenuDelegate): void;
}

export interface IActionProvider {
	getActions(): IAction[];
}

export interface IDropdownMenuOptions extends IBaseDropdownOptions {
	contextMenuProvider: IContextMenuProvider;
	actions?: IAction[];
	actionProvider?: IActionProvider;
	menuClassName?: string;
}

export class DropdownMenu extends BaseDropdown {

	/*protected*/ _contextMenuProvider: IContextMenuProvider;
	private _menuOptions: IMenuOptions;
	/*protected*/ _actions: IAction[];
	/*protected*/ actionProvider: IActionProvider;
	private menuClassName: string;

	constructor(container: HTMLElement, options: IDropdownMenuOptions) {
		super(container, options);

		this._contextMenuProvider = options.contextMenuProvider;
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

	public set menuOptions(options: IMenuOptions) {
		this._menuOptions = options;
	}

	public get menuOptions(): IMenuOptions {
		return this._menuOptions;
	}

	/*protected*/ public get actions(): IAction[] {
		if (this.actionProvider) {
			return this.actionProvider.getActions();
		}

		return this._actions;
	}

	/*protected*/ public set actions(actions: IAction[]) {
		this._actions = actions;
	}

	/*protected*/ show(): void {
		this.$el.addClass('active');

		this._contextMenuProvider.showContextMenu({
			getAnchor: () => this.$el.getHTMLElement(),
			getActions: () => TPromise.as(this.actions),
			getActionsContext: () => this.menuOptions ? this.menuOptions.context : null,
			getActionItem: (action) => this.menuOptions && this.menuOptions.actionItemProvider ? this.menuOptions.actionItemProvider(action) : null,
			getKeyBinding: (action: IAction) => this.menuOptions && this.menuOptions.getKeyBinding ? this.menuOptions.getKeyBinding(action) : null,
			getMenuClassName: () => this.menuClassName,
			onHide: () => this.$el.removeClass('active')
		});
	}

	/*protected*/ public hide(): void {
		// noop
	}
}

export class DropdownGroup extends EventEmitter {

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
