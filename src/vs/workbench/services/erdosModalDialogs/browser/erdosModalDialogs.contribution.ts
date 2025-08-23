/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ErdosModalDialogsService } from './erdosModalDialogsService.js';
import { IErdosModalDialogsService } from '../common/erdosModalDialogs.js';

// Register the erdosModalDialogs service
registerSingleton(IErdosModalDialogsService, ErdosModalDialogsService, InstantiationType.Delayed);
