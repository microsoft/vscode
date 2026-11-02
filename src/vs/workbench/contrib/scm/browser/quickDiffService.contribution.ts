/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IQuickDiffService } from '../common/quickDiff.js';
import { QuickDiffService } from '../common/quickDiffService.js';
import { IQuickDiffModelService, QuickDiffModelService } from './quickDiffModel.js';

registerSingleton(IQuickDiffService, QuickDiffService, InstantiationType.Delayed);
registerSingleton(IQuickDiffModelService, QuickDiffModelService, InstantiationType.Delayed);
