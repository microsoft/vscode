/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { MenuId, IMenuService, IMenu, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IViewDescriptorService, ViewContainer, ViewContainerLocationToString } from 'vs/workbench/common/views';

class MenuActions extends Disposable {

	private readonly menu: IMenu;

	private _primaryActions: IAction[] = [];
	get primaryActions() { return this._primaryActions; }

	private _secondaryActions: IAction[] = [];
	get secondaryActions() { return this._secondaryActions; }

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private disposables = this._register(new DisposableStore());

	constructor(
		menuId: MenuId,
		private readonly menuService: IMenuService,
		private readonly contextKeyService: IContextKeyService
	) {
		super();
		this.menu = this._register(menuService.createMenu(menuId, contextKeyService));
		this._register(this.menu.onDidChange(() => this.updateActions()));
		this.updateActions();
	}

	private updateActions(): void {
		this.disposables.clear();
		this._primaryActions = [];
		this._secondaryActions = [];
		this.disposables.add(createAndFillInActionBarActions(this.menu, { shouldForwardArgs: true }, { primary: this._primaryActions, secondary: this._secondaryActions }));
		this.disposables.add(this.updateSubmenus([...this._primaryActions, ...this._secondaryActions], {}));
		this._onDidChange.fire();
	}

	private updateSubmenus(actions: IAction[], submenus: { [id: number]: IMenu }): IDisposable {
		const disposables = new DisposableStore();
		for (const action of actions) {
			if (action instanceof SubmenuItemAction && !submenus[action.item.submenu.id]) {
				const menu = submenus[action.item.submenu.id] = disposables.add(this.menuService.createMenu(action.item.submenu, this.contextKeyService));
				disposables.add(menu.onDidChange(() => this.updateActions()));
				disposables.add(this.updateSubmenus(action.actions, submenus));
			}
		}
		return disposables;
	}
}

export abstract class AbstractViewMenuActions extends Disposable {

	private readonly menuActions: MenuActions;
	private readonly contextMenuActions: MenuActions;

	private _onDidChangeTitle = this._register(new Emitter<void>());
	readonly onDidChangeTitle: Event<void> = this._onDidChangeTitle.event;

	constructor(
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super();
		this.menuActions = this._register(new MenuActions(menuId, menuService, contextKeyService));
		this._register(this.menuActions.onDidChange(() => this._onDidChangeTitle.fire()));
		this.contextMenuActions = this._register(new MenuActions(contextMenuId, menuService, contextKeyService));
	}

	getPrimaryActions(): IAction[] {
		return this.menuActions.primaryActions;
	}

	getSecondaryActions(): IAction[] {
		return this.menuActions.secondaryActions;
	}

	getContextMenuActions(): IAction[] {
		return this.contextMenuActions.secondaryActions;
	}

}

export class ViewMenuActions extends AbstractViewMenuActions {

	constructor(
		viewId: string,
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped();
		scopedContextKeyService.createKey('view', viewId);
		super(menuId, contextMenuId, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
	}

}

export class ViewContainerMenuActions extends AbstractViewMenuActions {

	constructor(
		viewContainer: ViewContainer,
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped();
		scopedContextKeyService.createKey('viewContainer', viewContainer.id);
		const updateViewContainerLocationContext = () => {
			const viewContainerLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
			if (viewContainerLocation !== null) {
				scopedContextKeyService.createKey('viewContainerLocation', ViewContainerLocationToString(viewContainerLocation));
			}
		};
		updateViewContainerLocationContext();
		super(menuId, contextMenuId, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
		this._register(Event.filter(viewDescriptorService.onDidChangeContainerLocation, e => e.viewContainer === viewContainer)(updateViewContainerLocationContext));
	}

}
