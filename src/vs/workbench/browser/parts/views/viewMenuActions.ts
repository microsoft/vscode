/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getActionBarActions, PrimaryAndSecondaryActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuId, IMenuActionOptions, IMenuService, IMenu } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService, ViewContainer, ViewContainerLocationToString } from '../../../common/views.js';

export class ViewMenuActions extends Disposable {

	private readonly menu: IMenu;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		readonly menuId: MenuId,
		private readonly contextMenuId: MenuId | undefined,
		private readonly options: IMenuActionOptions | undefined,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();
		this.menu = this._register(menuService.createMenu(menuId, contextKeyService, { emitEventsForSubmenuChanges: true }));
		this._register(this.menu.onDidChange(() => {
			this.actions = undefined;
			this._onDidChange.fire();
		}));
	}

	private actions: PrimaryAndSecondaryActions | undefined;
	private getActions(): PrimaryAndSecondaryActions {
		if (!this.actions) {
			this.actions = getActionBarActions(this.menu.getActions(this.options));
		}
		return this.actions;
	}

	getPrimaryActions(): IAction[] {
		return this.getActions().primary;
	}

	getSecondaryActions(): IAction[] {
		return this.getActions().secondary;
	}

	getContextMenuActions(): IAction[] {
		if (this.contextMenuId) {
			const menu = this.menuService.getMenuActions(this.contextMenuId, this.contextKeyService, this.options);
			return getActionBarActions(menu).secondary;
		}
		return [];
	}
}

export class ViewContainerMenuActions extends ViewMenuActions {
	constructor(
		element: HTMLElement,
		viewContainer: ViewContainer,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped(element);
		scopedContextKeyService.createKey('viewContainer', viewContainer.id);
		const viewContainerLocationKey = scopedContextKeyService.createKey('viewContainerLocation', ViewContainerLocationToString(viewDescriptorService.getViewContainerLocation(viewContainer)!));
		super(MenuId.ViewContainerTitle, MenuId.ViewContainerTitleContext, { shouldForwardArgs: true, renderShortTitle: true }, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
		this._register(Event.filter(viewDescriptorService.onDidChangeContainerLocation, e => e.viewContainer === viewContainer)(() => viewContainerLocationKey.set(ViewContainerLocationToString(viewDescriptorService.getViewContainerLocation(viewContainer)!))));
	}
}
