/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { getSCMResourceContextKey } from './scmUtil';

export class SCMMenus implements IDisposable {

	private contextKeyService: IContextKeyService;
	private titleMenu: IMenu;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	private disposables: IDisposable[] = [];

	constructor(
		private provider: ISCMProvider | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createScoped();
		const scmProviderKey = this.contextKeyService.createKey<string | undefined>('scmProvider', void 0);

		if (provider) {
			scmProviderKey.set(provider.contextValue);
		} else {
			scmProviderKey.set('');
		}

		this.titleMenu = this.menuService.createMenu(MenuId.SCMTitle, this.contextKeyService);
		this.disposables.push(this.titleMenu);

		this.titleMenu.onDidChange(this.updateTitleActions, this, this.disposables);
		this.updateTitleActions();
	}

	private updateTitleActions(): void {
		this.titleActions = [];
		this.titleSecondaryActions = [];
		// TODO@joao: second arg used to be null
		fillInActions(this.titleMenu, { shouldForwardArgs: true }, { primary: this.titleActions, secondary: this.titleSecondaryActions });
		this._onDidChangeTitle.fire();
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}

	getResourceGroupActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, group).primary;
	}

	getResourceGroupContextActions(group: ISCMResourceGroup): IAction[] {
		return this.getActions(MenuId.SCMResourceGroupContext, group).secondary;
	}

	getResourceActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, resource).primary;
	}

	getResourceContextActions(resource: ISCMResource): IAction[] {
		return this.getActions(MenuId.SCMResourceContext, resource).secondary;
	}

	private getActions(menuId: MenuId, resource: ISCMResourceGroup | ISCMResource): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('scmResourceGroup', getSCMResourceContextKey(resource));

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary = [];
		const secondary = [];
		const result = { primary, secondary };
		fillInActions(menu, { shouldForwardArgs: true }, result, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}