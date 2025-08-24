/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosModalDialogs } from './erdosModalDialogs.js';
import { registerErdosModalDialogsActions } from './erdosModalDialogsActions.js';
import { IErdosModalDialogsService } from '../../../services/erdosModalDialogs/common/erdosModalDialogs.js';

registerErdosModalDialogsActions();

registerSingleton(IErdosModalDialogsService, ErdosModalDialogs, InstantiationType.Delayed);
