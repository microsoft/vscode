/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scm';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction, Action } from 'vs/base/common/actions';
import { createAndFillInContextMenuActions, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ISCMResource, ISCMResourceGroup, ISCMProvider, ISCMRepository } from 'vs/workbench/contrib/scm/common/scm';
import { isSCMResource } from './util';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { equals } from 'vs/base/common/arrays';
import { ISplice, ISequence } from 'vs/base/common/sequence';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';

function actionEquals(a: IAction, b: IAction): boolean {
	return a.id === b.id;
}

class SCMMenusItem {

	private _resourceGroupMenu: IMenu | undefined;
	get resourceGroupMenu(): IMenu {
		if (!this._resourceGroupMenu) {
			this._resourceGroupMenu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, this.contextKeyService);
		}

		return this._resourceGroupMenu;
	}

	private _resourceMenu: IMenu | undefined;
	get resourceMenu(): IMenu {
		if (!this._resourceMenu) {
			this._resourceMenu = this.menuService.createMenu(MenuId.SCMResourceContext, this.contextKeyService);
		}

		return this._resourceMenu;
	}

	private _resourceFolderMenu: IMenu | undefined;
	get resourceFolderMenu(): IMenu {
		if (!this._resourceFolderMenu) {
			this._resourceFolderMenu = this.menuService.createMenu(MenuId.SCMResourceFolderContext, this.contextKeyService);
		}

		return this._resourceFolderMenu;
	}

	constructor(
		private contextKeyService: IContextKeyService,
		private menuService: IMenuService
	) { }

	dispose(): void {
		this.resourceGroupMenu?.dispose();
		this.resourceMenu?.dispose();
		this.resourceFolderMenu?.dispose();
		this.contextKeyService.dispose();
	}
}

export function getSCMResourceContextKey(resource: ISCMResourceGroup | ISCMResource): string {
	return isSCMResource(resource) ? resource.resourceGroup.id : resource.id;
}

export class SCMRepositoryMenus implements IDisposable {

	private contextKeyService: IContextKeyService;

	readonly titleMenu: IMenu;
	private titleActionDisposable: IDisposable = Disposable.None;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private readonly _onDidChangeTitle = new Emitter<void>();
	readonly onDidChangeTitle: Event<void> = this._onDidChangeTitle.event;

	private readonly resourceGroups: ISCMResourceGroup[] = [];
	private readonly resourceGroupMenusItems = new Map<ISCMResourceGroup, SCMMenusItem>();

	private readonly disposables = new DisposableStore();

	constructor(
		readonly provider: ISCMProvider | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		this.contextKeyService = contextKeyService.createScoped();
		const scmProviderKey = this.contextKeyService.createKey<string | undefined>('scmProvider', undefined);

		if (provider) {
			scmProviderKey.set(provider.contextValue);
			provider.groups.onDidSplice(this.onDidSpliceGroups, this, this.disposables);
			this.onDidSpliceGroups({ start: 0, deleteCount: 0, toInsert: provider.groups.elements });
		} else {
			scmProviderKey.set('');
		}

		this.titleMenu = this.menuService.createMenu(MenuId.SCMTitle, this.contextKeyService);
		this.disposables.add(this.titleMenu);
		this.titleMenu.onDidChange(this.updateTitleActions, this, this.disposables);
		this.updateTitleActions();
	}

	private updateTitleActions(): void {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];

		const disposable = createAndFillInActionBarActions(this.titleMenu, { shouldForwardArgs: true }, { primary, secondary });

		if (equals(primary, this.titleActions, actionEquals) && equals(secondary, this.titleSecondaryActions, actionEquals)) {
			disposable.dispose();
			return;
		}

		this.titleActionDisposable.dispose();
		this.titleActionDisposable = disposable;
		this.titleActions = primary;
		this.titleSecondaryActions = secondary;

		this._onDidChangeTitle.fire();
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}

	getRepositoryContextActions(): IAction[] {
		if (!this.provider) {
			return [];
		}

		const contextKeyService = this.contextKeyService.createScoped();
		const scmProviderKey = contextKeyService.createKey<string | undefined>('scmProvider', undefined);
		scmProviderKey.set(this.provider.contextValue);

		const menu = this.menuService.createMenu(MenuId.SCMSourceControl, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		const disposable = createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => g === 'inline');

		disposable.dispose();
		menu.dispose();

		if (this.provider.rootUri) {
			secondary.push(new Action('_openInTerminal', localize('open in terminal', "Open In Terminal"), undefined, true, async () => {
				await this.commandService.executeCommand('openInTerminal', this.provider!.rootUri);
			}));
		}

		return secondary;
	}

	getResourceGroupContextActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, group).secondary;
	}

	getResourceContextActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, resource).secondary;
	}

	getResourceFolderContextActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceFolderContext, group).secondary;
	}

	private getActions(menuId: MenuId, resource: ISCMResourceGroup | ISCMResource): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(resource));

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

		menu.dispose();

		return result;
	}

	getResourceGroupMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).resourceGroupMenu;
	}

	getResourceMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).resourceMenu;
	}

	getResourceFolderMenu(group: ISCMResourceGroup): IMenu {
		return this.getOrCreateResourceGroupMenusItem(group).resourceFolderMenu;
	}

	private getOrCreateResourceGroupMenusItem(group: ISCMResourceGroup): SCMMenusItem {
		let result = this.resourceGroupMenusItems.get(group);

		if (!result) {
			const contextKeyService = this.contextKeyService.createScoped();
			contextKeyService.createKey('scmProvider', group.provider.contextValue);
			contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(group));

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

	private readonly disposables = new DisposableStore();
	private readonly entries: { repository: ISCMRepository, dispose: () => void }[] = [];
	private readonly menus = new Map<ISCMProvider, SCMRepositoryMenus>();

	constructor(
		repositories: ISequence<ISCMRepository>,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
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
