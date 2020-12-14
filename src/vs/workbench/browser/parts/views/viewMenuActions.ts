/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MenuId, IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CompositeMenuActions } from 'vs/workbench/browser/menuActions';
import { ViewContainer } from 'vs/workbench/common/views';

export class ViewMenuActions extends CompositeMenuActions {
	constructor(
		viewId: string,
		menuId: MenuId,
		contextMenuId: MenuId,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped();
		scopedContextKeyService.createKey('view', viewId);
		super(menuId, contextMenuId, { shouldForwardArgs: true }, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
	}

}

export class ViewContainerMenuActions extends CompositeMenuActions {
	constructor(
		viewContainer: ViewContainer,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
	) {
		const scopedContextKeyService = contextKeyService.createScoped();
		scopedContextKeyService.createKey('viewContainer', viewContainer.id);
		super(MenuId.ViewContainerTitle, MenuId.ViewContainerTitleContext, { shouldForwardArgs: true }, scopedContextKeyService, menuService);
		this._register(scopedContextKeyService);
	}
}
