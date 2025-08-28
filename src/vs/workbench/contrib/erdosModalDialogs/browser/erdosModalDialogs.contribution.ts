/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosModalDialogs } from './erdosModalDialogs.js';
import { registerErdosModalDialogsActions } from './erdosModalDialogsActions.js';
import { IErdosModalDialogsService } from '../../../services/erdosModalDialogs/common/erdosModalDialogs.js';

registerErdosModalDialogsActions();

registerSingleton(IErdosModalDialogsService, ErdosModalDialogs, InstantiationType.Delayed);
