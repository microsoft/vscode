/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenubarService, IMenubarData } from 'vs/platform/menubar/node/menubar';
import { Menubar } from 'vs/platform/menubar/electron-main/menubar';
import { ILogService } from 'vs/platform/log/common/log';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleMainService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';

export class MenubarMainService implements IMenubarService {

	_serviceBrand: undefined;

	private _menubar: Menubar | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@ILogService private readonly logService: ILogService
	) {
		// Install Menu
		this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).then(() => {
			this._menubar = this.instantiationService.createInstance(Menubar);
		});
	}

	updateMenubar(windowId: number, menus: IMenubarData): Promise<void> {
		return this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).then(() => {
			this.logService.trace('menubarService#updateMenubar', windowId);

			if (this._menubar) {
				this._menubar.updateMenu(menus, windowId);
			}

			return undefined;
		});
	}
}
