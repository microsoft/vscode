/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/scmViewlet';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { createAndFillInContextMenuActions, createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/contrib/scm/common/scm';
import { isSCMResource } from './scmUtil';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { equals } from 'vs/base/common/arrays';
import { ISplice } from 'vs/base/common/sequence';

function actionEquals(a: IAction, b: IAction): boolean {
	return a.id === b.id;
}

interface ISCMResourceGroupMenuEntry extends IDisposable {
	readonly group: ISCMResourceGroup;
}

interface ISCMMenus {
	readonly resourceGroupMenu: IMenu;
	readonly resourceMenu: IMenu;
}

export function getSCMResourceContextKey(resource: ISCMResourceGroup | ISCMResource): string {
	return isSCMResource(resource) ? resource.resourceGroup.id : resource.id;
}

export class SCMMenus implements IDisposable {

	private contextKeyService: IContextKeyService;
	private titleMenu: IMenu;

	private titleActionDisposable: IDisposable = Disposable.None;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private readonly _onDidChangeTitle = new Emitter<void>();
	readonly onDidChangeTitle: Event<void> = this._onDidChangeTitle.event;

	private readonly resourceGroupMenuEntries: ISCMResourceGroupMenuEntry[] = [];
	private readonly resourceGroupMenus = new Map<ISCMResourceGroup, ISCMMenus>();

	private readonly disposables: IDisposable[] = [];

	constructor(
		provider: ISCMProvider | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		this.contextKeyService = contextKeyService.createScoped();
		const scmProviderKey = this.contextKeyService.createKey<string | undefined>('scmProvider', undefined);

		if (provider) {
			scmProviderKey.set(provider.contextValue);
			this.onDidSpliceGroups({ start: 0, deleteCount: 0, toInsert: provider.groups.elements });
			provider.groups.onDidSplice(this.onDidSpliceGroups, this, this.disposables);
		} else {
			scmProviderKey.set('');
		}

		this.titleMenu = this.menuService.createMenu(MenuId.SCMTitle, this.contextKeyService);
		this.disposables.push(this.titleMenu);

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

	getResourceGroupContextActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, group).secondary;
	}

	getResourceContextActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, resource).secondary;
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
		contextKeyService.dispose();

		return result;
	}

	getResourceGroupMenu(group: ISCMResourceGroup): IMenu {
		if (!this.resourceGroupMenus.has(group)) {
			throw new Error('SCM Resource Group menu not found');
		}

		return this.resourceGroupMenus.get(group)!.resourceGroupMenu;
	}

	getResourceMenu(group: ISCMResourceGroup): IMenu {
		if (!this.resourceGroupMenus.has(group)) {
			throw new Error('SCM Resource Group menu not found');
		}

		return this.resourceGroupMenus.get(group)!.resourceMenu;
	}

	private onDidSpliceGroups({ start, deleteCount, toInsert }: ISplice<ISCMResourceGroup>): void {
		const menuEntriesToInsert = toInsert.map<ISCMResourceGroupMenuEntry>(group => {
			const contextKeyService = this.contextKeyService.createScoped();
			contextKeyService.createKey('scmProvider', group.provider.contextValue);
			contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(group));

			const resourceGroupMenu = this.menuService.createMenu(MenuId.SCMResourceGroupContext, contextKeyService);
			const resourceMenu = this.menuService.createMenu(MenuId.SCMResourceContext, contextKeyService);

			this.resourceGroupMenus.set(group, { resourceGroupMenu, resourceMenu });

			return {
				group,
				dispose() {
					contextKeyService.dispose();
					resourceGroupMenu.dispose();
					resourceMenu.dispose();
				}
			};
		});

		const deleted = this.resourceGroupMenuEntries.splice(start, deleteCount, ...menuEntriesToInsert);

		for (const entry of deleted) {
			this.resourceGroupMenus.delete(entry.group);
			entry.dispose();
		}
	}

	dispose(): void {
		dispose(this.disposables);
		dispose(this.resourceGroupMenuEntries);
		this.resourceGroupMenus.clear();
	}
}
