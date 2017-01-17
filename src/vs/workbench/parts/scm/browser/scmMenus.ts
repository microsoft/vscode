/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ISCMService, ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';

export class SCMMenus implements IDisposable {

	private disposables: IDisposable[] = [];

	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];
	private activeProviderContextKey: IContextKey<string>;

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ISCMService private scmService: ISCMService,
		@IMenuService private menuService: IMenuService
	) {
		this.activeProviderContextKey = contextKeyService.createKey('scmProvider', '');

		this.setActiveProvider(this.scmService.activeProvider);
		this.scmService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
	}

	private setActiveProvider(activeProvider: ISCMProvider | undefined): void {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		this.activeProviderContextKey.set(activeProvider ? activeProvider.id : '');

		if (!activeProvider) {
			return;
		}

		const titleMenu = this.menuService.createMenu(MenuId.SCMTitle, this.contextKeyService);
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

	getResourceGroupActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, this.getSCMResourceGroupURI(group), group.id).primary;
	}

	getResourceGroupContextActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, this.getSCMResourceGroupURI(group), group.id).secondary;
	}

	getResourceActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, this.getSCMResourceURI(resource), resource.resourceGroupId).primary;
	}

	getResourceContextActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, this.getSCMResourceURI(resource), resource.resourceGroupId).secondary;
	}

	private getSCMResourceGroupURI(resourceGroup: ISCMResourceGroup): URI {
		return URI.from({
			scheme: 'scm',
			authority: this.activeProviderContextKey.get(),
			path: `/${resourceGroup.id}`
		});
	}

	private getSCMResourceURI(resource: ISCMResource): URI {
		return URI.from({
			scheme: 'scm',
			authority: this.activeProviderContextKey.get(),
			path: `/${resource.resourceGroupId}/${JSON.stringify(resource.uri)}`
		});
	}

	private static readonly NoActions = { primary: [], secondary: [] };

	private getActions(menuId: MenuId, context: URI, resourceGroupId: string): { primary: IAction[]; secondary: IAction[]; } {
		if (!this.scmService.activeProvider) {
			return SCMMenus.NoActions;
		}

		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('scmResourceGroup', resourceGroupId);

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
