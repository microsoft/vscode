/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dropdown';
import { Builder, $ } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import { Gesture, EventType as GestureEventType } from 'vs/base/browser/touch';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IMenuOptions } from 'vs/base/browser/ui/menu/menu';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { EventHelper, EventType } from 'vs/base/browser/dom';

export interface ILabelRenderer {
	(container: HTMLElement): IDisposable;
}

export interface IBaseDropdownOptions {
	label?: string;
	labelRenderer?: ILabelRenderer;
}

export class BaseDropdown extends ActionRunner {
	private _toDispose: IDisposable[];
	private $el: Builder;
	private $boxContainer: Builder;
	private $label: Builder;
	private $contents: Builder;

	constructor(container: HTMLElement, options: IBaseDropdownOptions) {
		super();

		this._toDispose = [];

		this.$el = $('.dropdown').appendTo(container);

		this.$label = $('.dropdown-label');

		let labelRenderer = options.labelRenderer;
		if (!labelRenderer) {
			labelRenderer = (container: HTMLElement): IDisposable => {
				$(container).text(options.label || '');
				return null;
			};
		}

		this.$label.on([EventType.CLICK, EventType.MOUSE_DOWN, GestureEventType.Tap], (e: Event) => {
			EventHelper.stop(e, true); // prevent default click behaviour to trigger
		}).on([EventType.MOUSE_DOWN, GestureEventType.Tap], (e: Event) => {
			// We want to show the context menu on dropdown so that as a user you can press and hold the
			// mouse button, make a choice of action in the menu and release the mouse to trigger that
			// action.
			// Due to some weird bugs though, we delay showing the menu to unwind event stack
			// (see https://github.com/Microsoft/vscode/issues/27648)
			setTimeout(() => this.show(), 100);
		}).appendTo(this.$el);

		let cleanupFn = labelRenderer(this.$label.getHTMLElement());

		if (cleanupFn) {
			this._toDispose.push(cleanupFn);
		}

		this._toDispose.push(new Gesture(this.$label.getHTMLElement()));
	}

	public get toDispose(): IDisposable[] {
		return this._toDispose;
	}

	public get element(): Builder {
		return this.$el;
	}

	public get label(): Builder {
		return this.$label;
	}

	public set tooltip(tooltip: string) {
		this.$label.title(tooltip);
	}

	public show(): void {
		// noop
	}

	public hide(): void {
		// noop
	}

	protected onEvent(e: Event, activeElement: HTMLElement): void {
		this.hide();
	}

	public dispose(): void {
		super.dispose();
		this.hide();

		this._toDispose = dispose(this.toDispose);

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
	private contextViewProvider: IContextViewProvider;

	constructor(container: HTMLElement, options: IDropdownOptions) {
		super(container, options);

		this.contextViewProvider = options.contextViewProvider;
	}

	public show(): void {
		this.element.addClass('active');

		this.contextViewProvider.showContextView({
			getAnchor: () => this.element.getHTMLElement(),

			render: (container) => {
				return this.renderContents(container);
			},

			onDOMEvent: (e, activeElement) => {
				this.onEvent(e, activeElement);
			},

			onHide: () => {
				this.element.removeClass('active');
			}
		});
	}

	public hide(): void {
		if (this.contextViewProvider) {
			this.contextViewProvider.hideContextView();
		}
	}

	protected renderContents(container: HTMLElement): IDisposable {
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
	private _contextMenuProvider: IContextMenuProvider;
	private _menuOptions: IMenuOptions;
	private _actions: IAction[];
	private actionProvider: IActionProvider;
	private menuClassName: string;

	constructor(container: HTMLElement, options: IDropdownMenuOptions) {
		super(container, options);

		this._contextMenuProvider = options.contextMenuProvider;
		this.actions = options.actions || [];
		this.actionProvider = options.actionProvider;
		this.menuClassName = options.menuClassName || '';
	}

	public set menuOptions(options: IMenuOptions) {
		this._menuOptions = options;
	}

	public get menuOptions(): IMenuOptions {
		return this._menuOptions;
	}

	private get actions(): IAction[] {
		if (this.actionProvider) {
			return this.actionProvider.getActions();
		}

		return this._actions;
	}

	private set actions(actions: IAction[]) {
		this._actions = actions;
	}

	public show(): void {
		this.element.addClass('active');

		this._contextMenuProvider.showContextMenu({
			getAnchor: () => this.element.getHTMLElement(),
			getActions: () => TPromise.as(this.actions),
			getActionsContext: () => this.menuOptions ? this.menuOptions.context : null,
			getActionItem: (action) => this.menuOptions && this.menuOptions.actionItemProvider ? this.menuOptions.actionItemProvider(action) : null,
			getKeyBinding: (action: IAction) => this.menuOptions && this.menuOptions.getKeyBinding ? this.menuOptions.getKeyBinding(action) : null,
			getMenuClassName: () => this.menuClassName,
			onHide: () => this.element.removeClass('active')
		});
	}

	public hide(): void {
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
