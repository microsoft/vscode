/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ISCMResource, ISCMResourceGroup, ISCMProvider, ISCMRepository, ISCMService, ISCMMenus, ISCMRepositoryMenus } from 'vs/workbench/contrib/scm/common/scm';
import { equals } from 'vs/base/common/arrays';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { localize } from 'vs/nls';
import { ISCMHistoryItem, ISCMHistoryProviderMenus } from 'vs/workbench/contrib/scm/common/history';

function actionEquals(a: IAction, b: IAction): boolean {
	return a.id === b.id;
}

export class SCMTitleMenu implements IDisposable {

	private _actions: IAction[] = [];
	get actions(): IAction[] { return this._actions; }

	private _secondaryActions: IAction[] = [];
	get secondaryActions(): IAction[] { return this._secondaryActions; }

	private readonly _onDidChangeTitle = new Emitter<void>();
	readonly onDidChangeTitle = this._onDidChangeTitle.event;

	readonly menu: IMenu;
	private readonly disposables = new DisposableStore();

	constructor(
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.menu = menuService.createMenu(MenuId.SCMTitle, contextKeyService);
		this.disposables.add(this.menu);

		this.menu.onDidChange(this.updateTitleActions, this, this.disposables);
		this.updateTitleActions();
	}

	private updateTitleActions(): void {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		createAndFillInActionBarActions(this.menu, { shouldForwardArgs: true }, { primary, secondary });

		if (equals(primary, this._actions, actionEquals) && equals(secondary, this._secondaryActions, actionEquals)) {
			return;
		}

		this._actions = primary;
		this._secondaryActions = secondary;

		this._onDidChangeTitle.fire();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

interface IContextualResourceMenuItem {
	readonly menu: IMenu;
	dispose(): void;
}

class SCMMenusItem implements IDisposable {

	private _resourceGroupMenu: IMenu | undefined;
	get resourceGroupMenu(): IMenu {
		if (!this._resourceGroupMenu) {
			this._resourceGroupMenu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, this.contextKeyService);
		}

		return this._resourceGroupMenu;
	}

	private _resourceFolderMenu: IMenu | undefined;
	get resourceFolderMenu(): IMenu {
		if (!this._resourceFolderMenu) {
			this._resourceFolderMenu = this.menuService.createMenu(MenuId.SCMResourceFolderContext, this.contextKeyService);
		}

		return this._resourceFolderMenu;
	}

	private genericResourceMenu: IMenu | undefined;
	private contextualResourceMenus: Map<string /* contextValue */, IContextualResourceMenuItem> | undefined;

	constructor(
		private contextKeyService: IContextKeyService,
		private menuService: IMenuService
	) { }

	getResourceMenu(resource: ISCMResource): IMenu {
		if (typeof resource.contextValue === 'undefined') {
			if (!this.genericResourceMenu) {
				this.genericResourceMenu = this.menuService.createMenu(MenuId.SCMResourceContext, this.contextKeyService);
			}

			return this.genericResourceMenu;
		}

		if (!this.contextualResourceMenus) {
			this.contextualResourceMenus = new Map<string, IContextualResourceMenuItem>();
		}

		let item = this.contextualResourceMenus.get(resource.contextValue);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([['scmResourceState', resource.contextValue]]);
			const menu = this.menuService.createMenu(MenuId.SCMResourceContext, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.contextualResourceMenus.set(resource.contextValue, item);
		}

		return item.menu;
	}

	dispose(): void {
		this._resourceGroupMenu?.dispose();
		this._resourceFolderMenu?.dispose();
		this.genericResourceMenu?.dispose();

		if (this.contextualResourceMenus) {
			dispose(this.contextualResourceMenus.values());
			this.contextualResourceMenus.clear();
			this.contextualResourceMenus = undefined;
		}
	}
}

export class SCMRepositoryMenus implements ISCMRepositoryMenus, IDisposable {

	private contextKeyService: IContextKeyService;

	readonly titleMenu: SCMTitleMenu;
	private readonly resourceGroupMenusItems = new Map<ISCMResourceGroup, SCMMenusItem>();

	private _repositoryMenu: IMenu | undefined;
	get repositoryMenu(): IMenu {
		if (!this._repositoryMenu) {
			this._repositoryMenu = this.menuService.createMenu(MenuId.SCMSourceControl, this.contextKeyService);
			this.disposables.add(this._repositoryMenu);
		}

		return this._repositoryMenu;
	}

	private _historyProviderMenu: SCMHistoryProviderMenus | undefined;
	get historyProviderMenu(): SCMHistoryProviderMenus | undefined {
		if (this.provider.historyProvider && !this._historyProviderMenu) {
			this._historyProviderMenu = this.instantiationService.createInstance(SCMHistoryProviderMenus);
			this.disposables.add(this._historyProviderMenu);
		}

		return this._historyProviderMenu;
	}

	private readonly disposables = new DisposableStore();

	constructor(
		private readonly provider: ISCMProvider,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createOverlay([
			['scmProvider', provider.contextValue],
			['scmProviderRootUri', provider.rootUri?.toString()],
			['scmProviderHasRootUri', !!provider.rootUri],
		]);

		const serviceCollection = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		instantiationService = instantiationService.createChild(serviceCollection);
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);

		provider.onDidChangeResourceGroups(this.onDidChangeResourceGroups, this, this.disposables);
		this.onDidChangeResourceGroups();
	}

	getResourceGroupMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).resourceGroupMenu;
	}

	getResourceMenu(resource: ISCMResource): IMenu {
		return this.getOrCreateResourceGroupMenusItem(resource.resourceGroup).getResourceMenu(resource);
	}

	getResourceFolderMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).resourceFolderMenu;
	}

	private getOrCreateResourceGroupMenusItem(group: ISCMResourceGroup): SCMMenusItem {
		let result = this.resourceGroupMenusItems.get(group);

		if (!result) {
			const contextKeyService = this.contextKeyService.createOverlay([
				['scmResourceGroup', group.id],
			]);

			result = new SCMMenusItem(contextKeyService, this.menuService);
			this.resourceGroupMenusItems.set(group, result);
		}

		return result;
	}

	private onDidChangeResourceGroups(): void {
		for (const resourceGroup of this.resourceGroupMenusItems.keys()) {
			if (!this.provider.groups.includes(resourceGroup)) {
				this.resourceGroupMenusItems.get(resourceGroup)?.dispose();
				this.resourceGroupMenusItems.delete(resourceGroup);
			}
		}
	}

	dispose(): void {
		this.disposables.dispose();
		this.resourceGroupMenusItems.forEach(item => item.dispose());
	}
}

export class SCMHistoryProviderMenus implements ISCMHistoryProviderMenus, IDisposable {

	private readonly historyItemMenus = new Map<ISCMHistoryItem, IMenu>();
	private readonly disposables = new DisposableStore();

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService) { }

	getHistoryItemMenu(historyItem: ISCMHistoryItem): IMenu {
		return this.getOrCreateHistoryItemMenu(historyItem);
	}

	private getOrCreateHistoryItemMenu(historyItem: ISCMHistoryItem): IMenu {
		let result = this.historyItemMenus.get(historyItem);

		if (!result) {
			const contextKeyService = this.contextKeyService.createOverlay([
				['scmHistoryItem', historyItem.id],
			]);

			result = this.menuService.createMenu(MenuId.SCMHistoryItem, contextKeyService);
			this.historyItemMenus.set(historyItem, result);
		}

		return result;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export class SCMMenus implements ISCMMenus, IDisposable {

	readonly titleMenu: SCMTitleMenu;
	private readonly disposables = new DisposableStore();
	private readonly menus = new Map<ISCMProvider, { menus: SCMRepositoryMenus; dispose: () => void }>();

	constructor(
		@ISCMService scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);
		scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		const menus = this.menus.get(repository.provider);
		menus?.dispose();
		this.menus.delete(repository.provider);
	}

	getRepositoryMenus(provider: ISCMProvider): SCMRepositoryMenus {
		let result = this.menus.get(provider);

		if (!result) {
			const menus = this.instantiationService.createInstance(SCMRepositoryMenus, provider);
			const dispose = () => {
				menus.dispose();
				this.menus.delete(provider);
			};

			result = { menus, dispose };
			this.menus.set(provider, result);
		}

		return result.menus;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

MenuRegistry.appendMenuItem(MenuId.SCMResourceContext, {
	title: localize('miShare', "Share"),
	submenu: MenuId.SCMResourceContextShare,
	group: '45_share',
	order: 3,
});
