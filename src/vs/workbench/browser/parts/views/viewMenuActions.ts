/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { combinedDisposable, Disposable, dispose, MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { MenuId, IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

export abstract class AbstractViewMenuActions extends Disposable {

	private primaryActions: IAction[] = [];
	private readonly titleActionsDisposable = this._register(new MutableDisposable());
	private secondaryActions: IAction[] = [];
	private contextMenuActions: IAction[] = [];

	private _onDidChangeTitle = this._register(new Emitter<void>());
	readonly onDidChangeTitle: Event<void> = this._onDidChangeTitle.event;

	constructor(
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		super();

		const menu = this._register(menuService.createMenu(menuId, contextKeyService));
		const updateActions = () => {
			dispose(combinedDisposable(...this.primaryActions, ...this.secondaryActions));
			this.primaryActions = [];
			this.secondaryActions = [];
			this.titleActionsDisposable.value = createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, { primary: this.primaryActions, secondary: this.secondaryActions });
			this._onDidChangeTitle.fire();
		};
		this._register(menu.onDidChange(updateActions));
		updateActions();

		const contextMenu = this._register(menuService.createMenu(contextMenuId, contextKeyService));
		const updateContextMenuActions = () => {
			dispose(combinedDisposable(...this.contextMenuActions));
			this.contextMenuActions = [];
			this.titleActionsDisposable.value = createAndFillInActionBarActions(contextMenu, { shouldForwardArgs: true }, { primary: [], secondary: this.contextMenuActions });
		};
		this._register(contextMenu.onDidChange(updateContextMenuActions));
		updateContextMenuActions();

		this._register(toDisposable(() => {
			this.primaryActions = [];
			this.secondaryActions = [];
			this.contextMenuActions = [];
		}));
	}

	getPrimaryActions(): IAction[] {
		return this.primaryActions;
	}

	getSecondaryActions(): IAction[] {
		return this.secondaryActions;
	}

	getContextMenuActions(): IAction[] {
		return this.contextMenuActions;
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
		containerId: string,
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped();
		scopedContextKeyService.createKey('viewContainer', containerId);
		super(menuId, contextMenuId, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
	}

	getSecondaryActions(): IAction[] {
		return super.getSecondaryActions();
	}

}
