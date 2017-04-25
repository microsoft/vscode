/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ITreeExplorerService } from 'vs/workbench/parts/explorers/common/treeExplorerService';


export class TreeExplorerMenus implements IDisposable {

	private disposables: IDisposable[] = [];

	private activeProviderId: string;
	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ITreeExplorerService private treeExplorerService: ITreeExplorerService,
		@IMenuService private menuService: IMenuService
	) {
		this.setActiveProvider(this.treeExplorerService.activeProvider);
		this.treeExplorerService.onDidChangeProvider(this.setActiveProvider, this, this.disposables);
	}

	private setActiveProvider(activeProvider: string | undefined): void {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		if (!activeProvider) {
			return;
		}

		this.activeProviderId = activeProvider;

		const titleMenu = this.menuService.createMenu(MenuId.ViewTitle, this.contextKeyService);
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
		return this.titleSecondaryActions;
	}

	getResourceContextActions(): IAction[] {
		return this.getActions(MenuId.ViewResource).secondary;
	}

	private getActions(menuId: MenuId): { primary: IAction[]; secondary: IAction[]; } {
		if (!this.activeProviderId) {
			return { primary: [], secondary: [] };
		}

		const menu = this.menuService.createMenu(menuId, this.contextKeyService);
		const primary = [];
		const secondary = [];
		const result = { primary, secondary };
		fillInActions(menu, { shouldForwardArgs: true }, result, g => g === 'inline');

		menu.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
