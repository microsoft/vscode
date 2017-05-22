/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction, Action } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ContextSubMenu } from 'vs/platform/contextview/browser/contextView';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { ISCMService, ISCMProvider, ISCMResource, ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { getSCMResourceContextKey } from './scmUtil';

class SwitchProviderAction extends Action {

	get checked(): boolean {
		return this.scmService.activeProvider === this.provider;
	}

	constructor(
		private provider: ISCMProvider,
		@ISCMService private scmService: ISCMService
	) {
		super('scm.switchProvider', provider.label, '', true);
	}

	run(): TPromise<void> {
		this.scmService.activeProvider = this.provider;
		return TPromise.as(null);
	}
}

class InstallAdditionalSCMProviders extends Action {

	constructor(private viewletService: IViewletService) {
		super('scm.installAdditionalSCMProviders', localize('installAdditionalSCMProviders', "Install Additional SCM Providers..."), '', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true).then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('category:"SCM Providers" @sort:installs');
				viewlet.focus();
			});
	}
}

export class SCMMenus implements IDisposable {

	private disposables: IDisposable[] = [];

	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ISCMService private scmService: ISCMService,
		@IMenuService private menuService: IMenuService,
		@IViewletService private viewletService: IViewletService
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

		const titleMenu = this.menuService.createMenu(MenuId.SCMTitle, this.contextKeyService);
		const updateActions = () => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
			fillInActions(titleMenu, null, { primary: this.titleActions, secondary: this.titleSecondaryActions });
			this._onDidChangeTitle.fire();
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
		const providerSwitchActions: IAction[] = this.scmService.providers
			.map(p => new SwitchProviderAction(p, this.scmService));

		let result = [];

		if (this.titleSecondaryActions.length > 0) {
			result = result.concat(this.titleSecondaryActions);
		}
		if (providerSwitchActions.length > 0) {
			providerSwitchActions.push(new Separator());
		}
		providerSwitchActions.push(new InstallAdditionalSCMProviders(this.viewletService));

		if (result.length > 0) {
			result.push(new Separator());
		}

		result.push(new ContextSubMenu(localize('switch provider', "Switch SCM Provider..."), providerSwitchActions));

		return result;
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

	private static readonly NoActions = { primary: [], secondary: [] };

	private getActions(menuId: MenuId, resource: ISCMResourceGroup | ISCMResource): { primary: IAction[]; secondary: IAction[]; } {
		if (!this.scmService.activeProvider) {
			return SCMMenus.NoActions;
		}

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
