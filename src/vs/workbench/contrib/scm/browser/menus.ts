/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../base/common/actions.js';
import { equals } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import './media/scm.css';
import { localize } from '../../../../nls.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu, IMenuService, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ISCMMenus, ISCMProvider, ISCMRepository, ISCMRepositoryMenus, ISCMResource, ISCMResourceGroup, ISCMService } from '../common/scm.js';

function actionEquals(a: IAction, b: IAction): boolean {
	return a.id === b.id;
}

const repositoryMenuDisposables = new DisposableStore();

MenuRegistry.onDidChangeMenu(e => {
	if (e.has(MenuId.SCMTitle)) {
		repositoryMenuDisposables.clear();

		for (const menuItem of MenuRegistry.getMenuItems(MenuId.SCMTitle)) {
			repositoryMenuDisposables.add(MenuRegistry.appendMenuItem(MenuId.SCMSourceControlInline, menuItem));
		}
	}
});

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
		const { primary, secondary } = getActionBarActions(this.menu.getActions({ shouldForwardArgs: true }));

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
	readonly repositoryMenu: IMenu;

	private readonly resourceGroupMenusItems = new Map<ISCMResourceGroup, SCMMenusItem>();

	private _repositoryContextMenu: IMenu | undefined;
	get repositoryContextMenu(): IMenu {
		if (!this._repositoryContextMenu) {
			this._repositoryContextMenu = this.menuService.createMenu(MenuId.SCMSourceControl, this.contextKeyService);
			this.disposables.add(this._repositoryContextMenu);
		}

		return this._repositoryContextMenu;
	}

	private readonly disposables = new DisposableStore();

	constructor(
		private readonly provider: ISCMProvider,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createOverlay([
			['scmProvider', provider.contextValue],
			['scmProviderRootUri', provider.rootUri?.toString()],
			['scmProviderHasRootUri', !!provider.rootUri],
		]);

		const serviceCollection = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		instantiationService = instantiationService.createChild(serviceCollection, this.disposables);
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);
		this.disposables.add(this.titleMenu);

		this.repositoryMenu = menuService.createMenu(MenuId.SCMSourceControlInline, this.contextKeyService);
		this.disposables.add(this.repositoryMenu);

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
				['multiDiffEditorEnableViewChanges', group.multiDiffEditorEnableViewChanges],
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
