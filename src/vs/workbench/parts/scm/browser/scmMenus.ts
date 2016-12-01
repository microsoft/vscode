/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, SCMTitleMenuId, SCMMenuId, SCMMenuType, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ISCMService, ISCMProvider } from 'vs/workbench/services/scm/common/scm';


export class SCMMenus implements IDisposable {

	private disposables: IDisposable[] = [];

	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ISCMService private scmService: ISCMService,
		@IMenuService private menuService: IMenuService
	) {
		this.setActiveProvider(this.scmService.activeProvider);
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		if (!activeProvider) {
			return;
		}

		const titleMenuId = new SCMTitleMenuId(activeProvider.id);
		const titleMenu = this.menuService.createMenu(titleMenuId, this.contextKeyService);
		const updateActions = () => fillInActions(titleMenu, null, { primary: this.titleActions, secondary: this.titleSecondaryActions });
		const listener = titleMenu.onDidChange(updateActions);
		updateActions();

		this.titleDisposable = toDisposable(() => {
			listener.dispose();
			titleMenu.dispose();
			this.titleActions = [];
			this.titleSecondaryActions = [];
		});
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}

	getResourceGroupActions(resourceGroupId: string): IAction[] {
		if (!this.scmService.activeProvider) {
			return [];
		}

		const menuId = new SCMMenuId(this.scmService.activeProvider.id, resourceGroupId, SCMMenuType.ResourceGroup, false);
		return this.getActions(menuId);
	}

	getResourceGroupContextActions(resourceGroupId: string): IAction[] {
		if (!this.scmService.activeProvider) {
			return [];
		}

		const menuId = new SCMMenuId(this.scmService.activeProvider.id, resourceGroupId, SCMMenuType.ResourceGroup, true);
		return this.getActions(menuId);
	}

	getResourceActions(resourceGroupId: string): IAction[] {
		if (!this.scmService.activeProvider) {
			return [];
		}

		const menuId = new SCMMenuId(this.scmService.activeProvider.id, resourceGroupId, SCMMenuType.Resource, false);
		return this.getActions(menuId);
	}

	getResourceContextActions(resourceGroupId: string): IAction[] {
		if (!this.scmService.activeProvider) {
			return [];
		}

		const menuId = new SCMMenuId(this.scmService.activeProvider.id, resourceGroupId, SCMMenuType.Resource, true);
		return this.getActions(menuId);
	}

	private getActions(menuId: MenuId): IAction[] {
		const menu = this.menuService.createMenu(menuId, this.contextKeyService);
		const result = [];
		fillInActions(menu, null, result);
		menu.dispose();
		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
