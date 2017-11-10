/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MenuId, IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { Menu } from 'vs/platform/actions/common/menu';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class MenuService implements IMenuService {

	_serviceBrand: any;

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@ICommandService private _commandService: ICommandService
	) {
		//
	}

	createMenu(id: MenuId, contextKeyService: IContextKeyService): IMenu {
		return new Menu(id, this._extensionService.onReady(), this._commandService, contextKeyService);
	}
}
