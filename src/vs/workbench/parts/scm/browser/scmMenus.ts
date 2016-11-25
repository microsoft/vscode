/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/scmViewlet';
import Event, { mapEvent } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';

export class SCMMenus implements IDisposable {

	private titleMenu: IMenu;

	private _titleMenuActions: { primary: IAction[]; secondary: IAction[] };
	private get cachedTitleMenuActions() {
		if (!this._titleMenuActions) {
			this._titleMenuActions = { primary: [], secondary: [] };
			fillInActions(this.titleMenu, this._titleMenuActions);
		}
		return this._titleMenuActions;
	}

	private disposables: IDisposable[] = [];

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService
	) {
		this.titleMenu = menuService.createMenu(MenuId.SCMTitle, contextKeyService);
		this.disposables.push(this.titleMenu);
	}

	@memoize
	get onDidChangeTitleMenu(): Event<any> {
		return mapEvent(this.titleMenu.onDidChange, () => this._titleMenuActions = void 0);
	}

	get titleMenuActions(): IAction[] {
		return this.cachedTitleMenuActions.primary;
	}

	get titleMenuSecondaryActions(): IAction[] {
		return this.cachedTitleMenuActions.secondary;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
