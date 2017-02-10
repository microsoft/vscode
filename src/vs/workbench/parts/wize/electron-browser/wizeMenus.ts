/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/wizeViewlet';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IWizeService, IWizeProvider, IWizeResource, IWizeResourceGroup } from 'vs/workbench/services/wize/common/wize';

export class WizeMenus implements IDisposable {

	private disposables: IDisposable[] = [];

	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];
	private activeProviderContextKey: IContextKey<string>;

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IWizeService private wizeService: IWizeService,
		@IMenuService private menuService: IMenuService
	) {
		this.activeProviderContextKey = contextKeyService.createKey('wizeProvider', '');

		this.setActiveProvider(this.wizeService.activeProvider);
		this.wizeService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
	}

	private setActiveProvider(activeProvider: IWizeProvider | undefined): void {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		this.activeProviderContextKey.set(activeProvider ? activeProvider.id : '');

		if (!activeProvider) {
			return;
		}

		const titleMenu = this.menuService.createMenu(MenuId.WizeTitle, this.contextKeyService);
		const updateActions = () => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
			fillInActions(titleMenu, null, { primary: this.titleActions, secondary: this.titleSecondaryActions });
		};

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

	getResourceGroupActions(group: IWizeResourceGroup): IAction[] {
		return this.getActions(MenuId.WizeResourceGroupContext, this.getWizeResourceGroupURI(group), group.id).primary;
	}

	getResourceGroupContextActions(group: IWizeResourceGroup): IAction[] {
		return this.getActions(MenuId.WizeResourceGroupContext, this.getWizeResourceGroupURI(group), group.id).secondary;
	}

	getResourceActions(resource: IWizeResource): IAction[] {
		return this.getActions(MenuId.WizeResourceContext, this.getWizeResourceURI(resource), resource.resourceGroupId).primary;
	}

	getResourceContextActions(resource: IWizeResource): IAction[] {
		return this.getActions(MenuId.WizeResourceContext, this.getWizeResourceURI(resource), resource.resourceGroupId).secondary;
	}

	private getWizeResourceGroupURI(resourceGroup: IWizeResourceGroup): URI {
		return URI.from({
			scheme: 'wize',
			authority: this.activeProviderContextKey.get(),
			path: `/${resourceGroup.id}`
		});
	}

	private getWizeResourceURI(resource: ISCMResource): URI {
		return URI.from({
			scheme: 'wize',
			authority: this.activeProviderContextKey.get(),
			path: `/${resource.resourceGroupId}/${JSON.stringify(resource.uri)}`
		});
	}

	private static readonly NoActions = { primary: [], secondary: [] };

	private getActions(menuId: MenuId, context: URI, resourceGroupId: string): { primary: IAction[]; secondary: IAction[]; } {
		if (!this.wizeService.activeProvider) {
			return WizeMenus.NoActions;
		}

		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('wizeResourceGroup', resourceGroupId);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary = [];
		const secondary = [];
		const result = { primary, secondary };
		fillInActions(menu, context, result, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
