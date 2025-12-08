/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService, registerAction2 } from 'vs/platform/actions/common/actions';
import { MenuHiddenStatesReset } from 'vs/platform/actions/common/menuResetAction';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';

registerSingleton(IMenuService, MenuService, InstantiationType.Delayed);

registerAction2(MenuHiddenStatesReset);
