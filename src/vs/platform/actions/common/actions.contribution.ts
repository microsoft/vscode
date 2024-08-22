/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService, registerAction2 } from './actions';
import { MenuHiddenStatesReset } from './menuResetAction';
import { MenuService } from './menuService';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions';

registerSingleton(IMenuService, MenuService, InstantiationType.Delayed);

registerAction2(MenuHiddenStatesReset);
