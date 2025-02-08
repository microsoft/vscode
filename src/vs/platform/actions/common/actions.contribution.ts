/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService, registerAction2 } from './actions.js';
import { MenuHiddenStatesReset } from './menuResetAction.js';
import { MenuService } from './menuService.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';

registerSingleton(IMenuService, MenuService, InstantiationType.Delayed);

registerAction2(MenuHiddenStatesReset);
