/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ISCMResource, ISCMResourceGroup, ISCMProvider, ISCMRepository } from 'vs/workbench/contrib/scm/common/scm';
import { equals } from 'vs/base/common/arrays';
import { ISplice, ISequence } from 'vs/base/common/sequence';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';

function actionEquals(a: IAction, b: IAction): boolean {
	return a.id === b.id;
}

export class SCMTitleMenu {

	private _actions: IAction[] = [];
	get actions(): IAction[] { return this._actions; }

	private _secondaryActions: IAction[] = [];
	get secondaryActions(): IAction[] { return this._secondaryActions; }

	private readonly _onDidChangeTitle = new Emitter<void>();
	readonly onDidChangeTitle = this._onDidChangeTitle.event;

	readonly menu: IMenu;
	private listener: IDisposable = Disposable.None;
	private disposables = new DisposableStore();

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
		const disposable = createAndFillInActionBarActions(this.menu, { shouldForwardArgs: true }, { primary, secondary });

		if (equals(primary, this._actions, actionEquals) && equals(secondary, this._secondaryActions, actionEquals)) {
			disposable.dispose();
			return;
		}

		this.listener.dispose();
		this.listener = disposable;
		this._actions = primary;
		this._secondaryActions = secondary;

		this._onDidChangeTitle.fire();
	}

	dispose(): void {
		this.menu.dispose();
		this.listener.dispose();
	}
}

interface IContextualResourceMenuItem {
	readonly menu: IMenu;
	dispose(): void;
}

class SCMMenusItem {

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
			const contextKeyService = this.contextKeyService.createScoped();
			contextKeyService.createKey('scmResourceState', resource.contextValue);

			const menu = this.menuService.createMenu(MenuId.SCMResourceContext, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
					contextKeyService.dispose();
				}
			};

			this.contextualResourceMenus.set(resource.contextValue, item);
		}

		return item.menu;
	}

	dispose(): void {
		this.resourceGroupMenu?.dispose();
		this.genericResourceMenu?.dispose();

		if (this.contextualResourceMenus) {
			dispose(this.contextualResourceMenus.values());
			this.contextualResourceMenus.clear();
			this.contextualResourceMenus = undefined;
		}

		this.resourceFolderMenu?.dispose();
		this.contextKeyService.dispose();
	}
}

export class SCMRepositoryMenus implements IDisposable {

	private contextKeyService: IContextKeyService;

	readonly titleMenu: SCMTitleMenu;
	private repositoryMenu: IMenu | undefined;
	private readonly resourceGroups: ISCMResourceGroup[] = [];
	private readonly resourceGroupMenusItems = new Map<ISCMResourceGroup, SCMMenusItem>();

	private readonly disposables = new DisposableStore();

	constructor(
		readonly provider: ISCMProvider,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createScoped();
		this.contextKeyService.createKey<string | undefined>('scmProvider', provider.contextValue);
		this.contextKeyService.createKey<boolean>('scmProviderHasRootUri', !!provider.rootUri);

		const serviceCollection = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		instantiationService = instantiationService.createChild(serviceCollection);
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);

		provider.groups.onDidSplice(this.onDidSpliceGroups, this, this.disposables);
		this.onDidSpliceGroups({ start: 0, deleteCount: 0, toInsert: provider.groups.elements });
	}

	getRepositoryMenu(): IMenu {
		if (!this.repositoryMenu) {
			this.repositoryMenu = this.menuService.createMenu(MenuId.SCMSourceControl, this.contextKeyService);
			this.disposables.add(this.repositoryMenu);
		}

		return this.repositoryMenu;
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
			const contextKeyService = this.contextKeyService.createScoped();
			contextKeyService.createKey('scmProvider', group.provider.contextValue);
			contextKeyService.createKey('scmResourceGroup', group.id);

			result = new SCMMenusItem(contextKeyService, this.menuService);
			this.resourceGroupMenusItems.set(group, result);
		}

		return result;
	}

	private onDidSpliceGroups({ start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const deleted = this.resourceGroups.splice(start, deleteCount, ...toInsert);

		for (const group of deleted) {
			const item = this.resourceGroupMenusItems.get(group);
			item?.dispose();
			this.resourceGroupMenusItems.delete(group);
		}
	}

	dispose(): void {
		this.disposables.dispose();
		this.resourceGroupMenusItems.forEach(item => item.dispose());
	}
}

export class SCMMenus {

	readonly titleMenu: SCMTitleMenu;
	private readonly disposables = new DisposableStore();
	private readonly entries: { repository: ISCMRepository, dispose: () => void }[] = [];
	private readonly menus = new Map<ISCMProvider, SCMRepositoryMenus>();

	constructor(
		repositories: ISequence<ISCMRepository>,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);

		repositories.onDidSplice(this.onDidSplice, this, this.disposables);
		this.onDidSplice({ start: 0, deleteCount: 0, toInsert: repositories.elements });
	}

	getRepositoryMenus(provider: ISCMProvider): SCMRepositoryMenus {
		if (!this.menus.has(provider)) {
			throw new Error('SCM Repository menu not found');
		}

		return this.menus.get(provider)!;
	}

	private onDidSplice({ start, deleteCount, toInsert }: ISplice<ISCMRepository>): void {
		const entriesToInsert = toInsert.map(repository => {
			const menus = this.instantiationService.createInstance(SCMRepositoryMenus, repository.provider);
			const dispose = () => {
				menus.dispose();
				this.menus.delete(repository.provider);
			};

			this.menus.set(repository.provider, menus);
			return { repository, dispose };
		});

		const deletedEntries = this.entries.splice(start, deleteCount, ...entriesToInsert);

		for (const entry of deletedEntries) {
			entry.dispose();
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
