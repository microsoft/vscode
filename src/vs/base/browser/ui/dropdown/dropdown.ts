/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./dropdown';
import { Builder, $ } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import { Gesture, EventType as GestureEventType } from 'vs/base/browser/touch';
import { ActionRunner, IAction, IActionRunner } from 'vs/base/common/actions';
import { BaseActionItem, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IMenuOptions } from 'vs/base/browser/ui/menu/menu';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { EventHelper, EventType } from 'vs/base/browser/dom';
import { IContextMenuDelegate } from 'vs/base/browser/contextmenu';

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
			if (e instanceof MouseEvent && e.detail > 1) {
				return; // prevent multiple clicks to open multiple context menus (https://github.com/Microsoft/vscode/issues/41363)
			}

			this.show();
		}).appendTo(this.$el);

		let cleanupFn = labelRenderer(this.$label.getHTMLElement());

		if (cleanupFn) {
			this._toDispose.push(cleanupFn);
		}

		Gesture.addTarget(this.$label.getHTMLElement());
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
			onHide: () => this.element.removeClass('active'),
			actionRunner: this.menuOptions ? this.menuOptions.actionRunner : null
		});
	}

	public hide(): void {
		// noop
	}
}

export class DropdownMenuActionItem extends BaseActionItem {
	private menuActionsOrProvider: any;
	private dropdownMenu: DropdownMenu;
	private contextMenuProvider: IContextMenuProvider;
	private actionItemProvider: IActionItemProvider;
	private keybindings: (action: IAction) => ResolvedKeybinding;
	private clazz: string;

	constructor(action: IAction, menuActions: IAction[], contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => ResolvedKeybinding, clazz: string);
	constructor(action: IAction, actionProvider: IActionProvider, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => ResolvedKeybinding, clazz: string);
	constructor(action: IAction, menuActionsOrProvider: any, contextMenuProvider: IContextMenuProvider, actionItemProvider: IActionItemProvider, actionRunner: IActionRunner, keybindings: (action: IAction) => ResolvedKeybinding, clazz: string) {
		super(null, action);

		this.menuActionsOrProvider = menuActionsOrProvider;
		this.contextMenuProvider = contextMenuProvider;
		this.actionItemProvider = actionItemProvider;
		this.actionRunner = actionRunner;
		this.keybindings = keybindings;
		this.clazz = clazz;
	}

	public render(container: HTMLElement): void {
		let labelRenderer: ILabelRenderer = (el: HTMLElement): IDisposable => {
			this.builder = $('a.action-label').attr({
				tabIndex: '0',
				role: 'button',
				'aria-haspopup': 'true',
				title: this._action.label || '',
				class: this.clazz
			});

			this.builder.appendTo(el);

			return null;
		};

		let options: IDropdownMenuOptions = {
			contextMenuProvider: this.contextMenuProvider,
			labelRenderer: labelRenderer
		};

		// Render the DropdownMenu around a simple action to toggle it
		if (Array.isArray(this.menuActionsOrProvider)) {
			options.actions = this.menuActionsOrProvider;
		} else {
			options.actionProvider = this.menuActionsOrProvider;
		}

		this.dropdownMenu = new DropdownMenu(container, options);

		this.dropdownMenu.menuOptions = {
			actionItemProvider: this.actionItemProvider,
			actionRunner: this.actionRunner,
			getKeyBinding: this.keybindings,
			context: this._context
		};
	}

	public setActionContext(newContext: any): void {
		super.setActionContext(newContext);

		if (this.dropdownMenu) {
			this.dropdownMenu.menuOptions.context = newContext;
		}
	}

	public show(): void {
		if (this.dropdownMenu) {
			this.dropdownMenu.show();
		}
	}

	public dispose(): void {
		this.dropdownMenu.dispose();

		super.dispose();
	}
}