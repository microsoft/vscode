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
import { ISCMArtifact, ISCMArtifactGroup } from '../common/artifact.js';

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

interface IContextualMenuItem {
	readonly menu: IMenu;
	dispose(): void;
}

class SCMMenusItem implements IDisposable {

	private _resourceFolderMenu: IMenu | undefined;
	get resourceFolderMenu(): IMenu {
		if (!this._resourceFolderMenu) {
			this._resourceFolderMenu = this.menuService.createMenu(MenuId.SCMResourceFolderContext, this.contextKeyService);
		}

		return this._resourceFolderMenu;
	}

	private genericResourceGroupMenu: IMenu | undefined;
	private contextualResourceGroupMenus: Map<string /* contextValue */, IContextualMenuItem> | undefined;

	private genericResourceMenu: IMenu | undefined;
	private contextualResourceMenus: Map<string /* contextValue */, IContextualMenuItem> | undefined;

	constructor(
		private readonly contextKeyService: IContextKeyService,
		private readonly menuService: IMenuService
	) { }

	getResourceGroupMenu(resourceGroup: ISCMResourceGroup): IMenu {
		if (typeof resourceGroup.contextValue === 'undefined') {
			if (!this.genericResourceGroupMenu) {
				this.genericResourceGroupMenu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, this.contextKeyService);
			}

			return this.genericResourceGroupMenu;
		}

		if (!this.contextualResourceGroupMenus) {
			this.contextualResourceGroupMenus = new Map<string, IContextualMenuItem>();
		}

		let item = this.contextualResourceGroupMenus.get(resourceGroup.contextValue);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([['scmResourceGroupState', resourceGroup.contextValue]]);
			const menu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.contextualResourceGroupMenus.set(resourceGroup.contextValue, item);
		}

		return item.menu;
	}

	getResourceMenu(resource: ISCMResource): IMenu {
		if (typeof resource.contextValue === 'undefined') {
			if (!this.genericResourceMenu) {
				this.genericResourceMenu = this.menuService.createMenu(MenuId.SCMResourceContext, this.contextKeyService);
			}

			return this.genericResourceMenu;
		}

		if (!this.contextualResourceMenus) {
			this.contextualResourceMenus = new Map<string, IContextualMenuItem>();
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
		this.genericResourceGroupMenu?.dispose();
		this.genericResourceMenu?.dispose();
		this._resourceFolderMenu?.dispose();

		if (this.contextualResourceGroupMenus) {
			dispose(this.contextualResourceGroupMenus.values());
			this.contextualResourceGroupMenus.clear();
			this.contextualResourceGroupMenus = undefined;
		}

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

	private genericRepositoryMenu: IMenu | undefined;
	private contextualRepositoryMenus: Map<string /* contextValue */, IContextualMenuItem> | undefined;

	private genericRepositoryContextMenu: IMenu | undefined;
	private contextualRepositoryContextMenus: Map<string /* contextValue */, IContextualMenuItem> | undefined;

	private artifactGroupMenus = new Map<string /* artifactGroupId */, IContextualMenuItem>();
	private artifactMenus = new Map<string /* artifactGroupId */, IContextualMenuItem>();

	private readonly resourceGroupMenusItems = new Map<ISCMResourceGroup, SCMMenusItem>();

	private readonly disposables = new DisposableStore();

	constructor(
		private readonly provider: ISCMProvider,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService private readonly menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createOverlay([
			['scmProvider', provider.providerId],
			['scmProviderRootUri', provider.rootUri?.toString()],
			['scmProviderHasRootUri', !!provider.rootUri],
		]);

		const serviceCollection = new ServiceCollection([IContextKeyService, this.contextKeyService]);
		instantiationService = instantiationService.createChild(serviceCollection, this.disposables);
		this.titleMenu = instantiationService.createInstance(SCMTitleMenu);
		this.disposables.add(this.titleMenu);

		provider.onDidChangeResourceGroups(this.onDidChangeResourceGroups, this, this.disposables);
		this.onDidChangeResourceGroups();
	}

	getArtifactGroupMenu(artifactGroup: ISCMArtifactGroup): IMenu {
		let item = this.artifactGroupMenus.get(artifactGroup.id);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([['scmArtifactGroup', artifactGroup.id]]);
			const menu = this.menuService.createMenu(MenuId.SCMArtifactGroupContext, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.artifactGroupMenus.set(artifactGroup.id, item);
		}

		return item.menu;
	}

	getArtifactMenu(artifactGroup: ISCMArtifactGroup, artifact: ISCMArtifact): IMenu {
		const historyProvider = this.provider.historyProvider.get();
		const historyItemRef = historyProvider?.historyItemRef.get();
		const isHistoryItemRef = artifact.id === historyItemRef?.id;

		const key = isHistoryItemRef ? `${artifactGroup.id}|historyItemRef` : artifactGroup.id;
		let item = this.artifactMenus.get(key);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([
				['scmArtifactGroupId', artifactGroup.id],
				['scmArtifactIsHistoryItemRef', isHistoryItemRef]]);
			const menu = this.menuService.createMenu(MenuId.SCMArtifactContext, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.artifactMenus.set(key, item);
		}

		return item.menu;
	}

	getRepositoryMenu(repository: ISCMRepository): IMenu {
		const contextValue = repository.provider.contextValue.get();
		if (typeof contextValue === 'undefined') {
			if (!this.genericRepositoryMenu) {
				this.genericRepositoryMenu = this.menuService.createMenu(MenuId.SCMSourceControlInline, this.contextKeyService);
			}

			return this.genericRepositoryMenu;
		}

		if (!this.contextualRepositoryMenus) {
			this.contextualRepositoryMenus = new Map<string, IContextualMenuItem>();
		}

		let item = this.contextualRepositoryMenus.get(contextValue);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([['scmProviderContext', contextValue]]);
			const menu = this.menuService.createMenu(MenuId.SCMSourceControlInline, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.contextualRepositoryMenus.set(contextValue, item);
		}

		return item.menu;
	}

	getRepositoryContextMenu(repository: ISCMRepository): IMenu {
		const contextValue = repository.provider.contextValue.get();
		if (typeof contextValue === 'undefined') {
			if (!this.genericRepositoryContextMenu) {
				this.genericRepositoryContextMenu = this.menuService.createMenu(MenuId.SCMSourceControl, this.contextKeyService);
			}

			return this.genericRepositoryContextMenu;
		}

		if (!this.contextualRepositoryContextMenus) {
			this.contextualRepositoryContextMenus = new Map<string, IContextualMenuItem>();
		}

		let item = this.contextualRepositoryContextMenus.get(contextValue);

		if (!item) {
			const contextKeyService = this.contextKeyService.createOverlay([['scmProviderContext', contextValue]]);
			const menu = this.menuService.createMenu(MenuId.SCMSourceControl, contextKeyService);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.contextualRepositoryContextMenus.set(contextValue, item);
		}

		return item.menu;
	}

	getResourceGroupMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).getResourceGroupMenu(group);
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
		this.genericRepositoryMenu?.dispose();
		if (this.contextualRepositoryMenus) {
			dispose(this.contextualRepositoryMenus.values());
			this.contextualRepositoryMenus.clear();
			this.contextualRepositoryMenus = undefined;
		}
		this.resourceGroupMenusItems.forEach(item => item.dispose());
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
